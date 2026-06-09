// Daysie Service Worker - live update + hotfixes
const CACHE_NAME = 'daysie-v13';
const CORE = ['./','./index.html','./styles.css','./app.js','./app2.js','./app3.js','./version.json','./favicon.svg','./site.webmanifest','https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'];

const CSS_FIX = "html,body{max-width:100%!important;overflow-x:hidden!important;overscroll-behavior-x:none!important}dialog{max-width:min(560px,calc(100vw - 24px))!important;overflow:hidden!important}.modal{overflow-x:hidden!important;touch-action:pan-y!important}#familyDialog,#listDialog{max-width:min(560px,calc(100vw - 24px))!important}#familyDialog .modal,#listDialog .modal{width:100%!important;max-width:100%!important;overflow-x:hidden!important}#familyDialog label,#familyDialog input,#familyDialog select{min-width:0!important;max-width:100%!important;box-sizing:border-box!important}#familyDialog .profile-emojis{max-width:100%!important;overflow-x:hidden!important}#familyListsSection{display:none!important}#remindWhen{display:block!important;width:100%!important;max-width:100%!important;box-sizing:border-box!important;appearance:none!important;-webkit-appearance:none!important}";

const APP1_FIX = `
;(() => {
  function fixedGo(tab){
    ['today','tasks','calendar','journal','insights'].forEach(v=>{
      const view=document.querySelector('#'+v+'View'); if(view) view.classList.toggle('hidden',v!==tab);
      document.querySelectorAll('[data-tab="'+v+'"]').forEach(btn=>btn.classList.toggle('active',v===tab));
    });
    try{ if(tab==='calendar') renderCalendar(); }catch(e){}
    try{ if(tab==='journal') renderEntries(); }catch(e){}
    try{ if(tab==='insights') renderInsights(); }catch(e){}
    try{ scrollTo({top:0,behavior:'smooth'}); }catch(e){}
  }
  window.go=fixedGo;
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>fixedGo(b.dataset.tab));
  document.addEventListener('click',ev=>{ const b=ev.target&&ev.target.closest?ev.target.closest('[data-tab]'):null; if(!b) return; ev.preventDefault(); fixedGo(b.dataset.tab); },true);
})();`;

const APP2_FIX = `
;(() => {
  function canFamilySync(){ return !!(window.family&&window.family.familyId&&(window.family.members||[]).length>1&&typeof saveFamilyLists==='function'); }
  window.syncSharedLists = async function(action){ if(!canFamilySync()) return; window.familyLists=db.lists||[]; window.familyListsLocalEditAt=Date.now(); try{ await saveFamilyLists(action||'updated a shared list'); }catch(e){} };
  function bindSharedListSync(){
    document.querySelectorAll('#listsList [data-item]').forEach(b=>{ if(b.__syncFix) return; b.__syncFix=1; b.addEventListener('click',()=>setTimeout(()=>window.syncSharedLists&&window.syncSharedLists('updated a shared list'),0)); });
    document.querySelectorAll('#listsList [data-listaddbtn]').forEach(b=>{ if(b.__syncFix) return; b.__syncFix=1; b.addEventListener('click',()=>setTimeout(()=>window.syncSharedLists&&window.syncSharedLists('updated a shared list'),0)); });
    const add=document.querySelector('#addListBtn'); if(add&&!add.__syncFix){ add.__syncFix=1; add.addEventListener('click',()=>setTimeout(()=>window.syncSharedLists&&window.syncSharedLists('created a shared list'),0)); }
    document.querySelectorAll('#listManageList [data-dellist]').forEach(b=>{ if(b.__syncFix) return; b.__syncFix=1; b.addEventListener('click',()=>setTimeout(()=>window.syncSharedLists&&window.syncSharedLists('deleted a shared list'),300)); });
  }
  const oldRender=window.renderLists||renderLists; renderLists=function(){ oldRender.apply(this,arguments); bindSharedListSync(); };
  const oldManage=window.renderListManageList||renderListManageList; renderListManageList=function(){ oldManage.apply(this,arguments); bindSharedListSync(); };
  setInterval(bindSharedListSync,1000); setTimeout(()=>{try{renderLists();}catch(e){}},500);
})();`;

const APP3_FIX = `
;(() => {
  try{ const st=document.createElement('style'); st.textContent=${JSON.stringify(CSS_FIX)}; document.head.appendChild(st); }catch(e){}
  const DONE_KEY='daysie.familyInbox.done.v4';
  const LEFT_KEY='daysie.family.leftAt.v1';
  const doneIds=()=>{try{return new Set(JSON.parse(localStorage.getItem(DONE_KEY)||'[]'));}catch(e){return new Set();}};
  const remember=id=>{try{const s=doneIds();s.add(id);localStorage.setItem(DONE_KEY,JSON.stringify([...s].slice(-300)));}catch(e){}};
  function markLeft(){ try{localStorage.setItem(LEFT_KEY,String(Date.now())); localStorage.removeItem('daysie.family.v1');}catch(e){} }
  function clearLeft(){ try{localStorage.removeItem(LEFT_KEY);}catch(e){} }
  function recentlyLeft(){ try{const t=Number(localStorage.getItem(LEFT_KEY)||0); return t && Date.now()-t < 5*60*1000;}catch(e){return false;} }
  function clearFamilyLocal(){
    window.family={familyId:null,members:[]}; window.familyLists=[]; db.lists=[];
    try{localStorage.removeItem('daysie.family.v1'); localStorage.setItem('daysie.familyLists.leftAt',String(Date.now()));}catch(e){}
    try{ if(typeof save==='function') save(); }catch(e){}
    try{ renderFamily(); }catch(e){}
    try{ if(typeof renderLists==='function') renderLists(); }catch(e){}
    try{ if(typeof buildAssigneePicker==='function') buildAssigneePicker(); }catch(e){}
  }
  window.familyListsLocalEditAt=0;
  const originalLoadFamily = typeof loadFamily === 'function' ? loadFamily : null;
  loadFamily = async function(){
    if(!settings.authToken){ try{renderFamily();}catch(e){} return; }
    try{
      const res=await fetch(API+'/family?ts='+Date.now(),{headers:authHeaders(),cache:'no-store'});
      if(!res.ok) return;
      const d=await res.json();
      const next={familyId:d.familyId||null,members:d.members||[]};
      if(!next.familyId || !(next.members||[]).length){ clearFamilyLocal(); if(recentlyLeft()) return; }
      else { clearLeft(); window.family=next; try{cacheFamily(window.family);}catch(e){} }
      try{notifyNewMembers(window.family.members||[]);}catch(e){}
      try{renderFamily();}catch(e){}
      try{if(typeof buildAssigneePicker==='function') buildAssigneePicker();}catch(e){}
    }catch(e){ if(originalLoadFamily) { try{return originalLoadFamily();}catch(_){} } }
  };
  const leaveBtn=document.querySelector('#familyLeaveBtn');
  function forceLeave(){
    confirm('👋','Leave this family?','You will stop sharing lists and assignments with them. Your own data stays.',async()=>{
      markLeft(); clearFamilyLocal();
      try{ const res=await fetch(API+'/family/leave',{method:'POST',headers:authHeaders(true),body:JSON.stringify({leaveAll:true})}); if(!res.ok) throw new Error('leave failed'); }catch(e){ if(typeof toast==='function') toast('Left locally','Could not reach the server, but this device is no longer showing that family.'); return; }
      clearFamilyLocal();
      try{ await loadFamily(); }catch(e){}
      if(typeof toast==='function') toast('You left the family','');
    },()=>{});
  }
  if(leaveBtn) leaveBtn.onclick=forceLeave;
  renderFamilyLists=function(){ const sec=document.querySelector('#familyListsSection'); if(sec) sec.classList.add('hidden'); };
  loadFamilyLists=async function(){
    if(recentlyLeft()){ window.familyLists=[]; db.lists=[]; if(typeof renderLists==='function') renderLists(); return; }
    if(!settings.authToken||!window.family||!window.family.familyId){ if(typeof renderLists==='function') renderLists(); return; }
    if(window.familyListsLocalEditAt&&Date.now()-window.familyListsLocalEditAt<6000) return;
    try{ const res=await fetch(API+'/family/lists?ts='+Date.now(),{headers:authHeaders(),cache:'no-store'}); if(!res.ok) return; const d=await res.json(); window.familyLists=d.lists||[]; db.lists=window.familyLists; if(typeof renderLists==='function') renderLists(); }catch(e){}
  };
  saveFamilyLists=async function(action){
    if(recentlyLeft()||!settings.authToken||!window.family||!window.family.familyId) return;
    window.familyListsLocalEditAt=Date.now(); window.familyLists=db.lists||window.familyLists||[];
    try{ const res=await fetch(API+'/family/lists',{method:'PUT',headers:authHeaders(true),body:JSON.stringify({lists:window.familyLists,action:action||'updated a shared list'})}); if(!res.ok&&typeof toast==='function') toast('Could not sync list','Check your connection and try again.'); }catch(e){ if(typeof toast==='function') toast('Could not sync list','Check your connection and try again.'); }
    try{ const members=(window.family.members||[]).filter(m=>!m.isMe&&m.userId); await Promise.allSettled(members.map(m=>fetch(API+'/family/remind',{method:'POST',headers:authHeaders(true),body:JSON.stringify({toUser:m.userId,title:'Shared list updated',fireAt:Date.now()})}))); }catch(e){}
  };
  loadFamilyInbox=async function(){ if(!settings.authToken||recentlyLeft()) return; try{ const res=await fetch(API+'/family/inbox?ts='+Date.now(),{headers:authHeaders(),cache:'no-store'}); if(!res.ok) return; const d=await res.json(); const done=doneIds(); window.familyInbox=(d.items||[]).filter(it=>!done.has(it.id)); renderFamilyInbox(); }catch(e){} };
  ackInbox=async function(itemId){ remember(itemId); window.familyInbox=(window.familyInbox||[]).filter(x=>x.id!==itemId); renderFamilyInbox(); try{ await fetch(API+'/family/inbox/ack',{method:'POST',headers:authHeaders(true),body:JSON.stringify({id:itemId,status:'done'})}); }catch(e){} };
  // Hide first-load flicker: make the real app visible only after boot has chosen welcome vs app.
  try{ document.querySelector('#welcome')?.classList.toggle('hidden', !!(db&&db.onboarded)); document.querySelector('#app')?.classList.toggle('hidden', !(db&&db.onboarded)); }catch(e){}
  if('serviceWorker' in navigator&&!window.__daysieLeaveLiveFixV13){ window.__daysieLeaveLiveFixV13=1; navigator.serviceWorker.addEventListener('message',ev=>{ if(ev.data&&ev.data.type==='family-list-updated'){ window.familyListsLocalEditAt=0; try{loadFamily();loadFamilyLists();loadFamilyInbox();}catch(e){} } }); }
  setInterval(()=>{ if(document.visibilityState==='visible'){ try{loadFamily();loadFamilyLists();loadFamilyInbox();}catch(e){} } },5000);
  setTimeout(()=>{try{loadFamily();loadFamilyLists();loadFamilyInbox();}catch(e){}},900);
})();`

function js(text){return new Response(text,{headers:{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'}})}
function txt(text,type){return new Response(text,{headers:{'Content-Type':type,'Cache-Control':'no-store'}})}

self.addEventListener('install',e=>{ self.skipWaiting(); e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(CORE)).catch(()=>{})); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(names=>Promise.all(names.map(n=>n!==CACHE_NAME?caches.delete(n):null))).then(()=>self.clients.claim())); });
self.addEventListener('message',e=>{ if(e.data&&e.data.type==='SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch',event=>{
  const req=event.request; if(req.method!=='GET') return; const url=new URL(req.url);
  if(url.origin===self.location.origin){
    const p=url.pathname;
    if(p.endsWith('/app.js')){event.respondWith(fetch(req,{cache:'no-store'}).then(r=>r.text()).then(t=>js(t.includes('fixedGo(tab)')?t:t+'\n'+APP1_FIX)).catch(()=>caches.match(req).then(c=>c||caches.match('./index.html'))));return;}
    if(p.endsWith('/app2.js')){event.respondWith(fetch(req,{cache:'no-store'}).then(r=>r.text()).then(t=>js(t.includes('__daysieApp2LiveFix')?t:t+'\n;window.__daysieApp2LiveFix=1;\n'+APP2_FIX)).catch(()=>caches.match(req).then(c=>c||caches.match('./index.html'))));return;}
    if(p.endsWith('/app3.js')){event.respondWith(fetch(req,{cache:'no-store'}).then(r=>r.text()).then(t=>js(t.includes('__daysieLeaveLiveFixV13')?t:t+'\n'+APP3_FIX)).catch(()=>caches.match(req).then(c=>c||caches.match('./index.html'))));return;}
    if(p.endsWith('/styles.css')){event.respondWith(fetch(req,{cache:'no-store'}).then(r=>r.text()).then(t=>txt(t+'\n'+CSS_FIX,'text/css; charset=utf-8')).catch(()=>caches.match(req)));return;}
    if(p.endsWith('/index.html')||p==='/'||p.endsWith('/')){event.respondWith(fetch(req,{cache:'no-store'}).then(r=>r.text()).then(t=>txt(t.replace('<section id="welcome" class="welcome">','<section id="welcome" class="welcome hidden">').replace(/\s*<div id="familyListsSection" class="hidden">[\s\S]*?<div id="familyListsList" class="lists-list"><\/div>\s*<\/div>/,''),'text/html; charset=utf-8')).catch(()=>caches.match(req).then(c=>c||caches.match('./index.html'))));return;}
    event.respondWith(fetch(req,{cache:'no-store'}).then(res=>{if(res&&res.status===200&&res.type==='basic'){const copy=res.clone();caches.open(CACHE_NAME).then(c=>c.put(req,copy));}return res;}).catch(()=>caches.match(req).then(c=>c||caches.match('./index.html'))));return;
  }
  event.respondWith(caches.match(req).then(c=>c||fetch(req).then(res=>{if(res&&res.status===200){const copy=res.clone();caches.open(CACHE_NAME).then(ca=>ca.put(req,copy));}return res;}).catch(()=>c)));
});

self.addEventListener('push',event=>{let data={};try{data=event.data?event.data.json():{};}catch(e){data={body:event.data?event.data.text():''};}const title=data.title||'⏰ Daysie Reminder';const body=data.body||'You have a reminder!';event.waitUntil((async()=>{if(data.type==='family-list-updated'||/shared list/i.test(title+' '+body)){const wins=await clients.matchAll({type:'window',includeUncontrolled:true});wins.forEach(w=>w.postMessage({type:'family-list-updated',body}));}await self.registration.showNotification(title,{body,icon:'./favicon.svg',badge:'./favicon.svg',tag:data.tag||'daysie-reminder',requireInteraction:!!data.requireInteraction,data:data.url||'./'});})());});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(wins=>{for(const w of wins)if('focus'in w)return w.focus();return clients.openWindow(event.notification.data||'./');}));});
