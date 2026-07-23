'use strict';

/* 앱 버전 — 화면 상단에 표시됩니다. 업데이트가 됐는지 이걸로 확인하세요. */
const APP_VERSION = 'v14';

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
function alertBox(msg){
  document.getElementById('alertText').textContent=msg;
  document.getElementById('alertModal').style.display='flex';
}
function closeAlert(){ document.getElementById('alertModal').style.display='none'; }
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
let selectMode=false;
const selectedIds=new Set();

function toggleSelectMode(){
  selectMode=!selectMode;
  selectedIds.clear();
  document.getElementById('btnSelectMode').textContent = selectMode ? '취소' : '선택';
  document.getElementById('selectBar').style.display = selectMode ? 'flex' : 'none';
  renderHome();
}
function updateSelCount(){
  document.getElementById('selCount').textContent = `${selectedIds.size}개 선택`;
}
function selectAllReceipts(){
  if(selectedIds.size===DATA.receipts.length) selectedIds.clear();
  else DATA.receipts.forEach(r=>selectedIds.add(r.id));
  renderHome();
}

function renderHome(){
  const box=document.getElementById('receiptList'); box.innerHTML='';
  if(DATA.receipts.length===0){
    box.innerHTML='<div class="empty">아직 접수건이 없습니다.<br>‘＋ 새 접수건’으로 시작하세요.</div>';
    if(selectMode) updateSelCount();
    return;
  }
  DATA.receipts.forEach(r=>{
    const sub = (r.csiNo?('CSI '+r.csiNo+'  '):'') + (r.sampleName||r.workName||'');
    const el=document.createElement('div'); el.className='list-item';

    if(selectMode){
      const cb=document.createElement('input');
      cb.type='checkbox'; cb.checked=selectedIds.has(r.id);
      cb.style.cssText='width:22px;height:22px;flex:0 0 auto';
      cb.onclick=(e)=>{
        e.stopPropagation();
        if(cb.checked) selectedIds.add(r.id); else selectedIds.delete(r.id);
        updateSelCount();
      };
      el.appendChild(cb);
    }

    const info=document.createElement('div');
    info.className='grow';
    info.innerHTML=`<div class="title">${esc(r.receiptNo||'(접수번호 없음)')}</div>
      <div class="sub">${esc(sub)}</div>`;
    el.appendChild(info);

    const badge=document.createElement('span');
    badge.className='badge'; badge.textContent=(r.count||0)+'장';
    el.appendChild(badge);

    if(selectMode){
      // 선택 모드에서는 줄 전체를 눌러도 체크가 토글됨
      el.onclick=()=>{
        const cb=el.querySelector('input[type=checkbox]');
        cb.checked=!cb.checked;
        if(cb.checked) selectedIds.add(r.id); else selectedIds.delete(r.id);
        updateSelCount();
      };
    } else {
      info.onclick=()=>editReceipt(r.id);
      badge.onclick=()=>editReceipt(r.id);
      const del=document.createElement('button');
      del.className='iconbtn'; del.textContent='🗑';
      del.onclick=(e)=>{ e.stopPropagation(); askDeleteReceipt(r.id); };
      el.appendChild(del);
    }
    box.appendChild(el);
  });
  if(selectMode) updateSelCount();
}
function esc(s){ return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

/* ---------- 접수건 삭제 ---------- */
let _delId=null;        // 한 건 삭제용
let _delBulk=false;     // 선택 삭제(여러 건) 여부

/* 선택한 접수건 여러 건 삭제 */
function askDeleteSelected(){
  if(selectedIds.size===0){ toast('선택된 접수건이 없습니다'); return; }
  const list=DATA.receipts.filter(r=>selectedIds.has(r.id));
  const photoTotal=list.reduce((a,r)=>a+(r.count||0),0);
  const names=list.slice(0,3).map(r=>r.receiptNo||'(번호없음)').join(', ')
              + (list.length>3 ? ` 외 ${list.length-3}건` : '');
  _delBulk=true; _delId=null;
  document.getElementById('delText').innerHTML =
    `선택한 <b>${list.length}건</b>을 삭제할까요?<br>` +
    `<span style="color:#666">${esc(names)}</span><br>` +
    `저장된 사진 <b>${photoTotal}장</b>도 앱에서 함께 지워집니다.<br>` +
    `<span style="color:#666">(이미 ‘사진 앱에 저장’한 사진은 폰에 그대로 남아요)</span>`;
  document.getElementById('delModal').style.display='flex';
}
function askDeleteReceipt(id){
  const r=getReceipt(id); if(!r) return;
  _delId=id; _delBulk=false;
  document.getElementById('delText').innerHTML =
    `<b>${esc(r.receiptNo||'(접수번호 없음)')}</b> 접수건을 삭제할까요?<br>` +
    `이 접수건에 저장된 사진 <b>${r.count||0}장</b>도 앱에서 함께 지워집니다.<br>` +
    `<span style="color:#666">(이미 ‘사진 앱에 저장’한 사진은 폰에 그대로 남아요)</span>`;
  document.getElementById('delModal').style.display='flex';
}
function closeDelete(){ document.getElementById('delModal').style.display='none'; _delId=null; _delBulk=false; }
async function confirmDeleteReceipt(){
  const bulk=_delBulk;
  const ids = bulk ? [...selectedIds] : (_delId ? [_delId] : []);
  closeDelete();
  if(ids.length===0) return;
  try{
    busy('삭제 중...');
    for(const id of ids){
      await idbDeleteByReceipt(id);               // 사진 정리
      DATA.receipts = DATA.receipts.filter(x=>x.id!==id);
      if(currentReceiptId===id) currentReceiptId=null;
    }
    selectedIds.clear();
    if(bulk && selectMode){                       // 선택 모드 해제
      selectMode=false;
      document.getElementById('btnSelectMode').textContent='선택';
      document.getElementById('selectBar').style.display='none';
    }
    save(); renderHome(); go('home');
    toast(`${ids.length}건 삭제되었습니다`);
  }catch(e){ toast('삭제 실패: '+(e.message||e)); }
  finally{ hideBusy(); }
}
async function idbDeleteByReceipt(rid){
  const db=await idb();
  return new Promise((res,rej)=>{
    const tx=db.transaction('photos','readwrite');
    const idx=tx.objectStore('photos').index('receiptId');
    const rq=idx.openCursor(IDBKeyRange.only(rid));
    rq.onsuccess=e=>{ const c=e.target.result; if(c){ c.delete(); c.continue(); } };
    tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error);
  });
}

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
  document.getElementById('btnDelete').style.display='none';
  fillForm(null); go('receipt');
}
function editReceipt(id){
  const r=getReceipt(id); if(!r) return;
  currentReceiptId=id; editing=true;
  document.getElementById('receiptTitle').textContent='접수건 정보 (이어찍기)';
  document.getElementById('btnGallery').style.display='block';
  document.getElementById('btnDelete').style.display='block';
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
  document.getElementById('btnDelete').style.display='block';
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
/* 이 접수건에 지정된 시험항목이 있으면 그것만, 없으면 전체 목록 */
function itemsForCurrent(){
  const r=getReceipt(currentReceiptId);
  if(r && Array.isArray(r.items) && r.items.length) return r.items;
  return DATA.testItems;
}
function populateItemSelect(sel){
  const s=document.getElementById('itemSelect'); s.innerHTML='';
  const list=itemsForCurrent();
  if(list.length===0){ const o=document.createElement('option'); o.value=''; o.textContent='(＋로 추가)'; s.appendChild(o); return; }
  list.forEach(n=>{ const o=document.createElement('option'); o.value=n; o.textContent=n; s.appendChild(o); });
  if(sel && list.includes(sel)) s.value=sel;
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
  const r=getReceipt(currentReceiptId);
  // 이 접수건 전용 목록이 있으면 거기에도 추가
  if(r && Array.isArray(r.items) && r.items.length && !r.items.includes(name)) r.items.push(name);
  if(!DATA.testItems.includes(name)) DATA.testItems.push(name);
  save();
  populateItemSelect(name); updateOverlay();
}
let _sessionShots=[];          // 이번 촬영에서 찍은 사진들 (한 번에 저장용)
async function enterCamera(){
  go('camera');
  _sessionShots=[];
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
function finishCamera(){
  if(_sessionShots.length>0){
    document.getElementById('saveAllText').textContent =
      `이번에 촬영한 ${_sessionShots.length}장을 폰 사진 앱에 저장할까요?`;
    document.getElementById('saveAllModal').style.display='flex';
    return;
  }
  renderHome(); go('home');
}
function closeSaveAll(){
  document.getElementById('saveAllModal').style.display='none';
  _sessionShots=[]; renderHome(); go('home');
}
async function saveAllSession(){
  const shots=_sessionShots.slice();
  document.getElementById('saveAllModal').style.display='none';
  try{
    const files=shots.map(x=>new File([x.blob], x.name, {type:'image/jpeg'}));
    if(navigator.canShare && navigator.canShare({files})){
      await navigator.share({files});           // 여기서 '이미지 저장'을 누르면 전부 저장됨
    } else {
      shots.forEach(x=>downloadBlob(x.blob, x.name));
    }
  }catch(e){ /* 사용자가 취소한 경우 */ }
  _sessionShots=[]; renderHome(); go('home');
}
function updateShotCount(){
  const r=getReceipt(currentReceiptId);
  const total=(r&&r.count)||0;
  const el=document.getElementById('shotCount');
  el.innerHTML = _sessionShots.length>0
    ? `촬영 ${total}장<br><span style="color:#FFD65C">미저장 ${_sessionShots.length}장</span>`
    : `촬영 ${total}장`;
}
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
    // iOS 사파리는 IndexedDB 에 Blob 을 넣으면 앱 재시작 후 데이터가 사라지는 문제가 있어
    // ArrayBuffer 로 저장하고, 읽을 때 다시 Blob 으로 만든다.
    const buf = await blob.arrayBuffer();
    await idbPut({ id:uid(), receiptId:r.id, stage, item, sampleNo, time:Date.now(), buf, name });
    r.count=(r.count||0)+1; save();

    lastBlob=blob; lastName=name;
    _sessionShots.push({ blob, name });
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

/* 저장된 사진 레코드를 Blob 으로 복원 (구버전 blob 레코드도 지원) */
function photoBlob(p){
  if(p.buf) return new Blob([p.buf], {type:'image/jpeg'});
  if(p.blob instanceof Blob && p.blob.size>0) return p.blob;
  return null;
}

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
    const b=photoBlob(p);
    const d=new Date(p.time);
    const cap=`${esc(p.sampleNo||'')} ${esc(p.stage)} · ${esc(p.item)}<br>${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if(b){
      const url=URL.createObjectURL(b);
      cell.innerHTML=`<img src="${url}" /><div class="cap">${cap}</div>`;
      cell.querySelector('img').onclick=()=>shareOne(p);
    } else {
      // 예전 버전에서 저장돼 데이터가 사라진 사진
      cell.innerHTML=`<div style="height:150px;display:flex;align-items:center;justify-content:center;
        background:#f0f0f0;border-radius:6px;color:#999;font-size:12px;text-align:center;padding:8px">
        예전 버전에서 저장된 사진이라<br>불러올 수 없어요</div><div class="cap">${cap}</div>`;
    }
    grid.appendChild(cell);
  });
}
let _galleryPhotos=[];
async function shareOne(p){
  const b=photoBlob(p);
  if(!b){ toast('사진 데이터를 찾을 수 없습니다'); return; }
  const file=new File([b],p.name,{type:'image/jpeg'});
  if(navigator.canShare && navigator.canShare({files:[file]})){ try{ await navigator.share({files:[file]}); }catch(e){} }
  else downloadBlob(b,p.name);
}
async function shareAll(){
  if(_galleryPhotos.length===0){ toast('저장할 사진이 없습니다'); return; }
  const valid=_galleryPhotos.filter(p=>photoBlob(p));
  if(valid.length===0){ toast('저장된 사진 데이터가 없습니다'); return; }
  const files=valid.map(p=>new File([photoBlob(p)],p.name,{type:'image/jpeg'}));
  if(navigator.canShare && navigator.canShare({files})){ try{ await navigator.share({files}); return; }catch(e){} }
  // 폴백: 하나씩 다운로드
  valid.forEach(p=>downloadBlob(photoBlob(p),p.name));
}

/* ---------- 신청서 스캔 (Tesseract.js) ---------- */
document.getElementById('scanInput').addEventListener('change', handleScanFile);
/* 신청서 스캔 버튼은 label 로 파일창을 열므로 별도 함수 불필요 */
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

/* CSV 텍스트를 받아 접수건 목록에 반영 (파일/서버/붙여넣기 공통) */
function applyCsvText(text, sourceLabel){
  const list = parseCSV(text);
  if(list.length===0){
    const first=(text.split('\n').find(l=>l.trim())||'').slice(0,60);
    alertBox('접수건을 찾지 못했어요.\n\n첫 줄: '+(first||'(비어 있음)')+
      '\n\n확인해 주세요:\n· 접수번호 칸이 채워져 있는지\n· 열 순서가 접수번호,CSI,공사명,시료명,비고,시험항목 인지');
    return false;
  }
  let added=0, updated=0, newItems=0;
  list.forEach(item=>{
    if(!item.receiptNo) return;
    (item.items||[]).forEach(n=>{
      if(!DATA.testItems.includes(n)){ DATA.testItems.push(n); newItems++; }
    });
    const ex = DATA.receipts.find(x=>x.receiptNo===item.receiptNo);
    if(ex){ Object.assign(ex,item); updated++; }
    else { DATA.receipts.unshift({ id:uid(), ...item, count:0 }); added++; }
  });
  save(); renderHome();
  let msg=`${sourceLabel||''} 새로 ${added}건, 갱신 ${updated}건`;
  if(newItems>0) msg+=`, 시험항목 ${newItems}개`;
  toast(msg.trim());
  return true;
}

/* "치수;인장강도;비중" 또는 "치수,인장강도" 를 배열로 */
function splitItems(text){
  if(!text) return [];
  const arr=text.split(/[;,\/·|]/).map(s=>s.trim()).filter(Boolean);
  return [...new Set(arr)];          // 같은 항목이 두 번 적혀도 한 번만
}

/* ---------- PC 연동: 엑셀/CSV 불러오기 ---------- */
const CSV_HEADERS = ['접수번호','CSI접수번호','공사명','시료명','비고','시험항목'];

function downloadTemplate(){
  const rows = [
    CSV_HEADERS.join(','),
    'M253-00-00000,AC-0000-000000,신청서 참고,신청서 참고,시료번호 등 입력,"치수;인장강도;비중;두께"'
  ].join('\r\n');
  // 엑셀에서 한글이 깨지지 않도록 BOM 추가
  const blob = new Blob(['\uFEFF'+rows], {type:'text/csv;charset=utf-8'});
  downloadBlob(blob, '시험정보_접수건_양식.csv');
  toast('양식을 받았어요. 엑셀로 열어 입력하세요');
}

document.getElementById('csvInput').addEventListener('change', async e=>{
  const file = e.target.files && e.target.files[0];
  e.target.value='';
  if(!file){ toast('파일이 선택되지 않았습니다'); return; }
  if(file.size===0){ alertBox('선택한 파일이 비어 있어요.\n\n파일이 완전히 내려받아졌는지 확인해 주세요.'); return; }
  try{
    busy('불러오는 중...');
    const head = new Uint8Array(await file.slice(0,4).arrayBuffer());
    if(head[0]===0x50 && head[1]===0x4B){
      alertBox('엑셀 파일(.xlsx)은 바로 읽을 수 없어요.\n\n엑셀에서 [다른 이름으로 저장] → \'CSV\'로 저장한 파일을 올리거나,\n\'📋 붙여넣기로 등록\'을 이용해 보세요.');
      return;
    }
    const text = await readTextSmart(file);
    applyCsvText(text, '파일에서 불러왔어요 —');
  }catch(err){
    alertBox('불러오기 실패: '+(err.message||err));
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

/* 헤더 줄을 보고 구분자 자동 감지 (쉼표 / 세미콜론 / 탭) */
function detectDelimiter(text){
  const line=(text.split('\n').find(l=>l.trim())||'');
  const counts={',':0, ';':0, '\t':0};
  let q=false;
  for(const ch of line){
    if(ch==='"') q=!q;
    else if(!q && counts[ch]!==undefined) counts[ch]++;
  }
  let best=',', max=0;
  for(const d of [',',';','\t']){ if(counts[d]>max){ max=counts[d]; best=d; } }
  return max===0 ? ',' : best;
}

function parseCSV(text, delim){
  const d = delim || detectDelimiter(text);
  const rows = splitCSVRows(text, d);
  if(rows.length===0) return [];
  // 헤더 위치 찾기 (없으면 첫 줄부터 데이터로 간주)
  let start=0, map={receiptNo:0, csiNo:1, workName:2, sampleName:3, note:4, items:5};
  const head = rows[0].map(c=>c.replace(/\s/g,''));
  if(head.some(c=>c.includes('접수번호'))){
    start=1;
    map = {
      receiptNo: head.findIndex(c=>c.includes('접수번호') && !c.includes('CSI')),
      csiNo:     head.findIndex(c=>c.includes('CSI')),
      workName:  head.findIndex(c=>c.includes('공사')),
      sampleName:head.findIndex(c=>c.includes('시료명')),
      note:      head.findIndex(c=>c.includes('비고')),
      items:     head.findIndex(c=>c.includes('시험항목'))
    };
  }
  const out=[];
  for(let i=start;i<rows.length;i++){
    const c=rows[i];
    if(!c || c.every(x=>!x.trim())) continue;
    const get=k=> (map[k]>=0 && c[map[k]]!=null) ? String(c[map[k]]).trim() : '';
    const item={ receiptNo:get('receiptNo'), csiNo:get('csiNo'),
                 workName:get('workName'), sampleName:get('sampleName'), note:get('note'),
                 items:splitItems(get('items')) };
    if(item.receiptNo) out.push(item);
  }
  return out;
}

/* 따옴표(") 안의 구분자까지 처리하는 CSV 파서 */
function splitCSVRows(text, delim){
  const D = delim || ',';
  const rows=[]; let row=[], cell='', q=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(q){
      if(ch==='"'){ if(text[i+1]==='"'){ cell+='"'; i++; } else q=false; }
      else cell+=ch;
    } else {
      if(ch==='"') q=true;
      else if(ch===D){ row.push(cell); cell=''; }
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

/* 저장공간 보호 요청 — 브라우저가 앱 데이터를 임의로 지우지 않도록 */
(async function(){
  try{
    if(navigator.storage && navigator.storage.persist){
      const already = await navigator.storage.persisted();
      if(!already) await navigator.storage.persist();
    }
  }catch(e){}
})();

/* 버전 표시 */
(function(){ const t=document.getElementById('verTag'); if(t) t.textContent=APP_VERSION; })();

/* 서비스워커 등록 + 업데이트 확인 */
if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').then(reg=>{
    reg.update().catch(()=>{});                 // 열 때마다 새 버전 확인
  }).catch(()=>{});
}

/* 시작 */
renderHome();
