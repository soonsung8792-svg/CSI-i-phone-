'use strict';

/* ---------- 저장소 (설정/접수건: localStorage, 사진: IndexedDB) ---------- */
const LS_KEY = 'testinfo.data.v1';
let DATA = load();
function load(){
  try{ const d = JSON.parse(localStorage.getItem(LS_KEY)); if(d&&d.receipts) return d; }catch(e){}
  return { testItems: [], receipts: [] };   // 시험항목은 처음엔 비어 있음
}
function save(){ localStorage.setItem(LS_KEY, JSON.stringify(DATA)); }

function getReceipt(id){ return DATA.receipts.find(r=>r.id===id); }

/* IndexedDB */
let _db = null;
function idb(){
  return new Promise((res,rej)=>{
    if(_db) return res(_db);
    const req = indexedDB.open('testinfo', 1);
    req.onupgradeneeded = ()=>{
      const db = req.result;
      const st = db.createObjectStore('photos',{keyPath:'id'});
      st.createIndex('receiptId','receiptId',{unique:false});
    };
    req.onsuccess = ()=>{ _db = req.result; res(_db); };
    req.onerror = ()=>rej(req.error);
  });
}
async function idbPut(p){ const db=await idb(); return new Promise((res,rej)=>{ const tx=db.transaction('photos','readwrite'); tx.objectStore('photos').put(p); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); }
async function idbByReceipt(rid){ const db=await idb(); return new Promise((res,rej)=>{ const out=[]; const tx=db.transaction('photos','readonly'); const idx=tx.objectStore('photos').index('receiptId'); const rq=idx.openCursor(IDBKeyRange.only(rid)); rq.onsuccess=e=>{ const c=e.target.result; if(c){ out.push(c.value); c.continue(); } else res(out); }; rq.onerror=()=>rej(rq.error); }); }

/* ---------- 화면 전환 ---------- */
function go(name){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(name).classList.add('active');
  if(name!=='camera' && name!=='preview') stopCamera();
  window.scrollTo(0,0);
}

/* ---------- 공통 유틸 ---------- */
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function safe(s){ return (s||'').replace(/[\\\/:*?"<>|]/g,'-').trim(); }
function pad(n){ return String(n).padStart(2,'0'); }
function stamp(){ const t=new Date(); return `${t.getFullYear()}${pad(t.getMonth()+1)}${pad(t.getDate())}_${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}`; }
function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.style.display='block'; clearTimeout(t._h); t._h=setTimeout(()=>t.style.display='none',1800); }
function busy(text){ document.getElementById('busyText').textContent=text||'처리 중...'; document.getElementById('busy').style.display='flex'; }
function hideBusy(){ document.getElementById('busy').style.display='none'; }
function downloadBlob(blob,name){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove(); }

/* ---------- 시험정보 표 내용 ---------- */
function idRows(stage,item,r,sampleNo){
  return [
    ['시험단계',stage||''],['시험항목',item||''],['시료번호',sampleNo||''],
    ['접수번호',r?r.receiptNo:''],['CSI접수번호',r?r.csiNo:''],
    ['공사명',r?r.workName:''],['시료명',r?r.sampleName:''],
    ['비고',r?r.note:'']
  ];
}

/* ---------- HOME ---------- */
function renderHome(){
  const box=document.getElementById('receiptList'); box.innerHTML='';
  if(DATA.receipts.length===0){ box.innerHTML='<div class="empty">아직 접수건이 없습니다.<br>‘＋ 새 접수건’으로 시작하세요.</div>'; return; }
  DATA.receipts.forEach(r=>{
    const sub = (r.csiNo?('CSI '+r.csiNo+'  '):'') + (r.sampleName||r.workName||'');
    const el=document.createElement('div'); el.className='list-item';
    el.innerHTML=`<div class="grow"><div class="title">${esc(r.receiptNo||'(접수번호 없음)')}</div>
      <div class="sub">${esc(sub)}</div></div><span class="badge">${r.count||0}장</span>`;
    el.onclick=()=>editReceipt(r.id);
    box.appendChild(el);
  });
}
function esc(s){ return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

/* ---------- RECEIPT FORM ---------- */
let currentReceiptId=null, editing=false;
function fillForm(r){
  document.getElementById('f_receiptNo').value = r?r.receiptNo:'';
  document.getElementById('f_csiNo').value     = r?r.csiNo:'';
  document.getElementById('f_workName').value  = r?r.workName:'';
  document.getElementById('f_sampleName').value= r?r.sampleName:'';
  document.getElementById('f_note').value      = r?r.note:'';
}
function newReceipt(){
  currentReceiptId=null; editing=false;
  document.getElementById('receiptTitle').textContent='새 접수건';
  document.getElementById('btnGallery').style.display='none';
  fillForm(null); go('receipt');
}
function editReceipt(id){
  const r=getReceipt(id); if(!r) return;
  currentReceiptId=id; editing=true;
  document.getElementById('receiptTitle').textContent='접수건 정보 (이어찍기)';
  document.getElementById('btnGallery').style.display='block';
  fillForm(r); go('receipt');
}
function readForm(){
  return {
    receiptNo: document.getElementById('f_receiptNo').value.trim(),
    csiNo: document.getElementById('f_csiNo').value.trim(),
    workName: document.getElementById('f_workName').value.trim(),
    sampleName: document.getElementById('f_sampleName').value.trim(),
    note: document.getElementById('f_note').value.trim()
  };
}
function persistForm(){
  const f=readForm();
  if(!f.receiptNo){ toast('접수번호를 입력하세요'); return null; }
  let r=getReceipt(currentReceiptId);
  if(r){ Object.assign(r,f); }
  else { r={ id:uid(), ...f, count:0 }; DATA.receipts.unshift(r); currentReceiptId=r.id; }
  save();
  document.getElementById('btnGallery').style.display='block';
  return r;
}
function saveOnly(){ if(persistForm()){ toast('저장되었습니다'); renderHome(); go('home'); } }
function saveAndShoot(){ const r=persistForm(); if(r){ editing=true; enterCamera(); } }

/* ---------- ITEMS ---------- */
function showItems(){ renderItems(); go('items'); }
function renderItems(){
  const box=document.getElementById('itemList'); box.innerHTML='';
  if(DATA.testItems.length===0){ box.innerHTML='<div class="empty">등록된 시험항목이 없습니다.</div>'; }
  DATA.testItems.forEach((name,i)=>{
    const el=document.createElement('div'); el.className='list-item';
    el.innerHTML=`<div class="grow"><div class="title" style="font-weight:500">${esc(name)}</div></div>`;
    const b=document.createElement('button'); b.className='iconbtn'; b.textContent='🗑'; b.onclick=()=>{ DATA.testItems.splice(i,1); save(); renderItems(); };
    el.appendChild(b); box.appendChild(el);
  });
}
function addItem(){
  const inp=document.getElementById('newItemInput'); const n=inp.value.trim(); inp.value='';
  if(!n) return; if(DATA.testItems.includes(n)){ toast('이미 있는 항목입니다'); return; }
  DATA.testItems.push(n); save(); renderItems();
}

/* ---------- CAMERA ---------- */
let stream=null;
function currentStage(){ const b=document.querySelector('#stageSeg button.on'); return b?b.dataset.stage:'시험전'; }
function populateItemSelect(sel){
  const s=document.getElementById('itemSelect'); s.innerHTML='';
  if(DATA.testItems.length===0){ const o=document.createElement('option'); o.value=''; o.textContent='(＋로 추가)'; s.appendChild(o); return; }
  DATA.testItems.forEach(n=>{ const o=document.createElement('option'); o.value=n; o.textContent=n; s.appendChild(o); });
  if(sel && DATA.testItems.includes(sel)) s.value=sel;
}
function addItemInline(){
  const inp=document.getElementById('modalItemInput');
  inp.value='';
  document.getElementById('addItemModal').style.display='flex';
  setTimeout(()=>inp.focus(),50);
}
function closeAddItem(){ document.getElementById('addItemModal').style.display='none'; }
function confirmAddItem(){
  const inp=document.getElementById('modalItemInput');
  const name=(inp.value||'').trim();
  closeAddItem();
  if(!name) return;
  if(!DATA.testItems.includes(name)){ DATA.testItems.push(name); save(); }
  populateItemSelect(name); updateOverlay();
}
async function enterCamera(){
  go('camera');
  populateItemSelect(document.getElementById('itemSelect').value);
  updateShotCount(); updateOverlay();
  await startCamera();
}
async function startCamera(){
  try{
    stopCamera();
    stream=await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:'environment' } }, audio:false });
    const v=document.getElementById('video'); v.srcObject=stream; await v.play().catch(()=>{});
  }catch(e){
    toast('카메라를 열 수 없습니다. HTTPS 주소인지, 카메라 권한을 허용했는지 확인하세요.');
  }
}
function stopCamera(){ if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; } }
function finishCamera(){ renderHome(); go('home'); }
function updateShotCount(){ const r=getReceipt(currentReceiptId); document.getElementById('shotCount').textContent='촬영 '+((r&&r.count)||0)+'장'; }
function currentSampleNo(){
  const v=(document.getElementById('sampleNoInput').value||'').trim();
  return v || '#1';
}
function stepSample(delta){
  const inp=document.getElementById('sampleNoInput');
  const cur=(inp.value||'#1').trim();
  const m=cur.match(/^(\D*)(\d+)(\D*)$/);      // 숫자 부분만 증감 (#1 → #2)
  if(m){
    let n=parseInt(m[2],10)+delta;
    if(n<1) n=1;
    inp.value=`${m[1]}${n}${m[3]}`;
  } else {
    inp.value='#1';
  }
  updateOverlay();
}
function updateOverlay(){
  const r=getReceipt(currentReceiptId);
  const rows=idRows(currentStage(), document.getElementById('itemSelect').value||'', r, currentSampleNo());
  let html='<div class="oc-title">시험정보</div>';
  rows.forEach(([l,v])=>{ html+=`<div><span class="oc-lbl">${l} : </span>${esc(v||'-')}</div>`; });
  document.getElementById('overlayCard').innerHTML=html;
}

/* 캔버스에 시험정보 카드 그리기 (사진에 새겨넣기) */
function drawCard(ctx,w,h,title,rows,factor){
  const base=Math.min(w,h); let ts=base*factor; const maxW=w*0.62;
  function longest(ts){
    ctx.font=`bold ${ts*1.05}px sans-serif`; let m=ctx.measureText(title).width;
    ctx.font=`${ts}px sans-serif`;
    rows.forEach(([l,v])=>{ m=Math.max(m, ctx.measureText(`${l} : ${v||'-'}`).width); });
    return m;
  }
  const pad=ts*0.6;
  while(longest(ts)+pad*2>maxW && ts>base*0.012) ts*=0.94;
  const lineH=ts*1.42, titleH=ts*1.6, content=longest(ts);
  const cardW=content+pad*2, cardH=pad*2+titleH+rows.length*lineH;
  const margin=base*0.02, x=w-cardW-margin, y=h-cardH-margin, radius=ts*0.4;
  // 배경
  ctx.fillStyle='rgba(0,0,0,0.7)'; roundRect(ctx,x,y,cardW,cardH,radius); ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,0.85)'; ctx.lineWidth=Math.max(1,base*0.0025); roundRect(ctx,x,y,cardW,cardH,radius); ctx.stroke();
  ctx.textBaseline='top';
  ctx.font=`bold ${ts*1.05}px sans-serif`; ctx.fillStyle='#fff'; ctx.fillText(title,x+pad,y+pad);
  let cy=y+pad+titleH;
  rows.forEach(([l,v])=>{
    const label=`${l} : `;
    ctx.font=`bold ${ts}px sans-serif`; ctx.fillStyle='#FFD65C'; ctx.fillText(label,x+pad,cy);
    const lw=ctx.measureText(label).width;
    ctx.font=`${ts}px sans-serif`; ctx.fillStyle='#fff'; ctx.fillText(v||'-',x+pad+lw,cy);
    cy+=lineH;
  });
}
function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

let lastBlob=null, lastName='', _capturing=false;

/* 촬영 피드백: 화면 플래시 + 셔터음 + 진동 */
function flashScreen(){
  const f=document.getElementById('flash');
  f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
}
function beep(){
  try{
    const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return;
    const ctx=new AC(); const o=ctx.createOscillator(); const g=ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type='square'; o.frequency.value=1150;
    g.gain.setValueAtTime(0.12, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.11);
    o.start(); o.stop(ctx.currentTime+0.12);
    setTimeout(()=>ctx.close(), 350);
  }catch(e){}
}
function buzz(ms){ try{ if(navigator.vibrate) navigator.vibrate(ms||60); }catch(e){} }
function showSaved(){
  const b=document.getElementById('savedBadge');
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  setTimeout(()=>b.classList.remove('show'), 950);
}

async function capture(){
  if(_capturing) return;                        // 중복 촬영 방지
  const v=document.getElementById('video'); const w=v.videoWidth, h=v.videoHeight;
  if(!w||!h){ toast('카메라 준비 중입니다...'); return; }

  const btn=document.getElementById('shutterBtn');
  _capturing=true;
  btn.classList.add('press');
  flashScreen(); beep(); buzz(60);
  setTimeout(()=>{ btn.classList.remove('press'); btn.classList.add('busy'); }, 120);

  try{
    const c=document.createElement('canvas'); c.width=w; c.height=h;
    const ctx=c.getContext('2d'); ctx.drawImage(v,0,0,w,h);
    const stage=currentStage(); const item=document.getElementById('itemSelect').value||'';
    const sampleNo=currentSampleNo();
    const r=getReceipt(currentReceiptId);
    drawCard(ctx,w,h,'시험정보', idRows(stage,item,r,sampleNo), 0.024);
    const blob=await new Promise(res=>c.toBlob(res,'image/jpeg',0.95));
    // 파일명: 시료번호_시험항목_시험단계  (예: #1_인장강도_시험전)
    const name=`${safe(sampleNo)}_${safe(item)}_${stage}.jpg`;
    await idbPut({ id:uid(), receiptId:r.id, stage, item, sampleNo, time:Date.now(), blob, name });
    r.count=(r.count||0)+1; save();

    lastBlob=blob; lastName=name;
    document.getElementById('previewImg').src=URL.createObjectURL(blob);
    document.getElementById('lastShot').src=URL.createObjectURL(blob);
    document.getElementById('lastShotWrap').style.display='block';

    updateShotCount();
    showSaved();                                 // 화면 가운데 "✅ 저장됨"
    buzz([40,60,40]);
  }catch(e){
    toast('저장 실패: '+(e.message||e));
  }finally{
    _capturing=false;
    document.getElementById('shutterBtn').classList.remove('busy','press');
  }
}
function openLastShot(){ if(lastBlob) go('preview'); }
async function sharePhoto(){
  if(!lastBlob) return;
  const file=new File([lastBlob],lastName,{type:'image/jpeg'});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file]}); }catch(e){}
  } else { downloadBlob(lastBlob,lastName); toast('다운로드했습니다'); }
}
async function backToCamera(){ go('camera'); if(!stream) await startCamera(); updateOverlay(); }

/* ---------- GALLERY ---------- */
async function openGallery(){
  const r=getReceipt(currentReceiptId); if(!r) return;
  document.getElementById('galleryTitle').textContent=`${r.receiptNo} (${r.count||0}장)`;
  const grid=document.getElementById('galleryGrid'); grid.innerHTML='';
  go('gallery');
  const photos=(await idbByReceipt(r.id)).sort((a,b)=>b.time-a.time);
  if(photos.length===0){ grid.innerHTML='<div class="empty">아직 촬영한 사진이 없습니다.</div>'; return; }
  _galleryPhotos=photos;
  photos.forEach(p=>{
    const cell=document.createElement('div'); cell.className='cell';
    const url=URL.createObjectURL(p.blob);
    const d=new Date(p.time);
    cell.innerHTML=`<img src="${url}" /><div class="cap">${esc(p.sampleNo||'')} ${esc(p.stage)} · ${esc(p.item)}<br>${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}</div>`;
    cell.querySelector('img').onclick=()=>shareOne(p);
    grid.appendChild(cell);
  });
}
let _galleryPhotos=[];
async function shareOne(p){
  const file=new File([p.blob],p.name,{type:'image/jpeg'});
  if(navigator.canShare && navigator.canShare({files:[file]})){ try{ await navigator.share({files:[file]}); }catch(e){} }
  else downloadBlob(p.blob,p.name);
}
async function shareAll(){
  if(_galleryPhotos.length===0){ toast('저장할 사진이 없습니다'); return; }
  const files=_galleryPhotos.map(p=>new File([p.blob],p.name,{type:'image/jpeg'}));
  if(navigator.canShare && navigator.canShare({files})){ try{ await navigator.share({files}); return; }catch(e){} }
  // 폴백: 하나씩 다운로드
  _galleryPhotos.forEach(p=>downloadBlob(p.blob,p.name));
}

/* ---------- 신청서 스캔 (Tesseract.js) ---------- */
document.getElementById('scanInput').addEventListener('change', handleScanFile);
function startScan(){ const inp=document.getElementById('scanInput'); inp.value=''; inp.click(); }
let _tesseractReady=false;
function ensureTesseract(){
  return new Promise((res,rej)=>{
    if(_tesseractReady && window.Tesseract) return res();
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.onload=()=>{ _tesseractReady=true; res(); };
    s.onerror=()=>rej(new Error('스캔 모듈을 불러오지 못했습니다(인터넷 연결 필요)'));
    document.head.appendChild(s);
  });
}
async function handleScanFile(e){
  const file=e.target.files && e.target.files[0]; if(!file) return;
  try{
    busy('스캔 모듈 준비 중...');
    await ensureTesseract();
    busy('글자 인식 중... (10~30초 걸릴 수 있어요)');
    const { data } = await Tesseract.recognize(file, 'kor+eng');
    applyScan(parseForm(data.text||''));
    toast('인식 완료 — 확인하고 수정하세요');
  }catch(err){ toast(err.message||'인식 실패'); }
  finally{ hideBusy(); }
}
function parseForm(text){
  const lines=text.split('\n').map(s=>s.trim()).filter(Boolean);
  const joined=lines.join(' ').replace(/\s+/g,'');
  const res={receiptNo:'',csiNo:'',workName:'',sampleName:'',note:''};
  let m=joined.match(/[Mm]\d{3}-\d{2}-\d{3,6}/); if(m)res.receiptNo=m[0].toUpperCase();
  m=joined.match(/A[Cc]?-?20\d{2}-?\d{5,6}/);
  if(m){ const d=m[0].replace(/\D/g,''); if(d.length>=9) res.csiNo='AC-'+d.slice(0,4)+'-'+d.slice(4); }
  res.workName=labelVal(lines,'공사명')||(lines.find(l=>l.includes('공사')&&!l.includes('공사명')&&!l.includes('성적서'))||'');
  res.sampleName=labelVal(lines,'시료명')||'';
  res.note=labelVal(lines,'비고')||(lines.find(l=>l.includes('CSI'))||'');
  return res;
}
function labelVal(lines,label){
  for(let i=0;i<lines.length;i++){
    const compact=lines[i].replace(/\s/g,'');
    const idx=compact.indexOf(label);
    if(idx>=0){
      const after=(compact.split(label)[1]||'').replace(/^[:：\s]+/,'').trim();
      if(after.length>=2) return after;
      if(i+1<lines.length) return lines[i+1].trim();
    }
  }
  return '';
}
function applyScan(s){
  if(s.receiptNo) document.getElementById('f_receiptNo').value=s.receiptNo;
  if(s.csiNo) document.getElementById('f_csiNo').value=s.csiNo;
  if(s.workName) document.getElementById('f_workName').value=s.workName;
  if(s.sampleName) document.getElementById('f_sampleName').value=s.sampleName;
  if(s.note) document.getElementById('f_note').value=s.note;
}

/* ---------- PC 연동: 엑셀/CSV 불러오기 ---------- */
const CSV_HEADERS = ['접수번호','CSI접수번호','공사명','시료명','비고'];

function downloadTemplate(){
  const rows = [
    CSV_HEADERS.join(','),
    'M253-00-00000,AC-0000-000000,신청서 참고,신청서 참고,시료번호 등 입력'
  ].join('\r\n');
  // 엑셀에서 한글이 깨지지 않도록 BOM 추가
  const blob = new Blob(['\uFEFF'+rows], {type:'text/csv;charset=utf-8'});
  downloadBlob(blob, '시험정보_접수건_양식.csv');
  toast('양식을 받았어요. 엑셀로 열어 입력하세요');
}

document.getElementById('csvInput').addEventListener('change', async e=>{
  const file = e.target.files && e.target.files[0];
  e.target.value='';
  if(!file) return;
  try{
    busy('불러오는 중...');
    const text = await readTextSmart(file);
    const list = parseCSV(text);
    if(list.length===0){ toast('불러올 내용이 없습니다. 양식을 확인하세요'); return; }
    let added=0, updated=0;
    list.forEach(item=>{
      if(!item.receiptNo) return;
      const ex = DATA.receipts.find(x=>x.receiptNo===item.receiptNo);
      if(ex){ Object.assign(ex,item); updated++; }
      else { DATA.receipts.unshift({ id:uid(), ...item, count:0 }); added++; }
    });
    save(); renderHome();
    toast(`불러오기 완료 — 새로 ${added}건, 갱신 ${updated}건`);
  }catch(err){
    toast('불러오기 실패: '+(err.message||err));
  }finally{ hideBusy(); }
});

/* 엑셀에서 저장한 CSV는 한글 인코딩이 UTF-8 또는 CP949(EUC-KR) 일 수 있어 둘 다 시도 */
async function readTextSmart(file){
  const buf = await file.arrayBuffer();
  let t = new TextDecoder('utf-8').decode(buf);
  if(t.includes('\uFFFD')){                 // 깨진 글자가 있으면 CP949로 재시도
    try{ t = new TextDecoder('euc-kr').decode(buf); }catch(e){}
  }
  return t.replace(/^\uFEFF/,'');
}

function parseCSV(text){
  const rows = splitCSVRows(text);
  if(rows.length===0) return [];
  // 헤더 위치 찾기 (없으면 첫 줄부터 데이터로 간주)
  let start=0, map={receiptNo:0, csiNo:1, workName:2, sampleName:3, note:4};
  const head = rows[0].map(c=>c.replace(/\s/g,''));
  if(head.some(c=>c.includes('접수번호'))){
    start=1;
    map = {
      receiptNo: head.findIndex(c=>c.includes('접수번호') && !c.includes('CSI')),
      csiNo:     head.findIndex(c=>c.includes('CSI')),
      workName:  head.findIndex(c=>c.includes('공사')),
      sampleName:head.findIndex(c=>c.includes('시료명')),
      note:      head.findIndex(c=>c.includes('비고'))
    };
  }
  const out=[];
  for(let i=start;i<rows.length;i++){
    const c=rows[i];
    if(!c || c.every(x=>!x.trim())) continue;
    const get=k=> (map[k]>=0 && c[map[k]]!=null) ? String(c[map[k]]).trim() : '';
    const item={ receiptNo:get('receiptNo'), csiNo:get('csiNo'),
                 workName:get('workName'), sampleName:get('sampleName'), note:get('note') };
    if(item.receiptNo) out.push(item);
  }
  return out;
}

/* 따옴표(") 안의 쉼표까지 처리하는 CSV 파서 */
function splitCSVRows(text){
  const rows=[]; let row=[], cell='', q=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(q){
      if(ch==='"'){ if(text[i+1]==='"'){ cell+='"'; i++; } else q=false; }
      else cell+=ch;
    } else {
      if(ch==='"') q=true;
      else if(ch===','){ row.push(cell); cell=''; }
      else if(ch==='\n'){ row.push(cell); rows.push(row); row=[]; cell=''; }
      else if(ch==='\r'){ /* skip */ }
      else cell+=ch;
    }
  }
  if(cell.length>0 || row.length>0){ row.push(cell); rows.push(row); }
  return rows;
}

/* ---------- 이벤트 바인딩 ---------- */
document.querySelectorAll('#stageSeg button').forEach(b=>{
  b.onclick=()=>{ document.querySelectorAll('#stageSeg button').forEach(x=>x.classList.remove('on')); b.classList.add('on'); updateOverlay(); };
});
document.getElementById('itemSelect').addEventListener('change', updateOverlay);
document.getElementById('sampleNoInput').addEventListener('input', updateOverlay);
document.getElementById('newItemInput').addEventListener('keydown', e=>{ if(e.key==='Enter') addItem(); });
document.getElementById('modalItemInput').addEventListener('keydown', e=>{ if(e.key==='Enter') confirmAddItem(); });

/* 서비스워커 등록 (오프라인/홈화면 추가용) */
if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }

/* 시작 */
renderHome();
