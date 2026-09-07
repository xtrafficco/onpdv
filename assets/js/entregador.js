// ONPDV · entregador.js — extraído de entregador.html (CSP sem unsafe-inline em script).
// ======================= CONFIG =======================
const SUPABASE_URL='https://qkhpvqepgozsaamxmugk.supabase.co';
const SUPABASE_KEY='sb_publishable_rh5Whcvb9PFt9MI1iL6dlg_qS9BGRNw';
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

// ======================= HELPERS =======================
const $=s=>document.querySelector(s);
const BRL=n=>(Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const esc=s=>(s==null?'':String(s)).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function toast(msg,err){const t=$('#toast');t.textContent=msg;t.className='toast show'+(err?' err':'');clearTimeout(toast._t);toast._t=setTimeout(()=>t.className='toast',2800);}
function modal(html){$('#modalRoot').innerHTML=`<div class="ov" data-ovclose="1"><div class="modal">${html}</div></div>`;}
function closeModal(){$('#modalRoot').innerHTML='';}
window.closeModal=closeModal;
function dur(m){m=+m||0;if(m<60)return m+' min';const h=Math.floor(m/60),r=m%60;return h+'h'+(r?(' '+r+'m'):'');}
function fmtDT(t){if(!t)return '—';const d=new Date(t);if(isNaN(d))return '—';const p=n=>String(n).padStart(2,'0');return p(d.getDate())+'/'+p(d.getMonth()+1)+' '+p(d.getHours())+':'+p(d.getMinutes());}
let ME=null, STORES=[], DATA={fila:[],rota:[],entregues:[],resumo:{}}, TIMER=null;

// só pedidos do dia (fila/rota/entregues de hoje)
function keepToday(d){
  d=d||{}; const t0=new Date(); t0.setHours(0,0,0,0);
  const isToday=ts=>{if(!ts)return false;const x=new Date(ts);return !isNaN(x)&&x.getTime()>=t0.getTime();};
  const fila=(d.fila||[]).filter(x=>isToday(x.created_at));
  const rota=(d.rota||[]).filter(x=>isToday(x.dispatched_at||x.created_at));
  const entregues=(d.entregues||[]).filter(x=>isToday(x.delivered_at||x.created_at));
  const tm=entregues.map(x=>+x.minutos_entrega).filter(v=>v||v===0);
  return {fila,rota,entregues,resumo:{
    fila:fila.length,rota:rota.length,entregues:entregues.length,
    valor_entregue:entregues.reduce((a,x)=>a+(+x.total||0),0),
    a_receber_rota:rota.filter(x=>!x.pago).reduce((a,x)=>a+(+x.total||0),0),
    tempo_medio:tm.length?Math.round(tm.reduce((a,b)=>a+b,0)/tm.length):null }};
}

// ======================= AUTH =======================
async function initAuth(){
  const {data:{session}}=await sb.auth.getSession();
  if(session) onLogin(session); else $('#login').classList.remove('hide');
}
$('#btnLogin').onclick=async()=>{
  const email=$('#liEmail').value.trim(), password=$('#liPass').value;
  if(!email||!password){$('#liMsg').textContent='Preencha e-mail e senha.';return;}
  const btn=$('#btnLogin');
  btn.disabled=true; $('#liMsg').textContent='Entrando…';
  try{
    const {data,error}=await sb.auth.signInWithPassword({email,password});
    if(error||!data.session){$('#liMsg').textContent='E-mail ou senha inválidos.';return;}
    await onLogin(data.session);
  }catch(e){
    console.error('login',e);
    $('#liMsg').textContent='Não foi possível entrar agora. Verifique sua conexão.';
  }finally{
    btn.disabled=false;
  }
};
$('#liPass').onkeydown=e=>{if(e.key==='Enter')$('#btnLogin').click();};
$('#btnLogout').onclick=async()=>{await sb.auth.signOut();location.reload();};

async function onLogin(session){
  const {data:me,error}=await sb.from('app_users').select('*').eq('id',session.user.id).maybeSingle();
  if(error||!me||me.ativo===false||!me.store_id||!['motoboy','admin'].includes(me.papel)){
    await sb.auth.signOut();
    $('#liMsg').textContent='Conta sem acesso de entregador. Fale com o administrador.';
    return;
  }
  ME=me;
  $('#login').classList.add('hide'); $('#app').classList.remove('hide');
  $('#name').textContent=((ME.nome||'entregador').split(' ')[0]).toUpperCase();
  try{const {data:st}=await sb.from('stores').select('id,nome'); STORES=st||[];}catch(e){}
  const loja=STORES.find(x=>x.id===ME.store_id); $('#loja').textContent=loja?loja.nome:'';
  loadList();
  clearInterval(TIMER);
  TIMER=setInterval(()=>{if(!$('#app').classList.contains('hide'))loadList(true);},20000);
  startGeoTracking();
}

// ======================= GPS / RASTREIO =======================
// Envia a posição do entregador para o painel (erp_courier_ping). Requer https:// (ou localhost)
// e permissão de localização. Throttle: no máx a cada 15s, ou quando mover mais de ~30 m.
let GEO = { watchId:null, pulseId:null, last:0, lastLat:null, lastLng:null };
function geoSet(txt,on){ const el=$('#geoStatus'); if(!el) return;
  el.textContent=txt;
  el.style.background = on===true?'#e3f6ec':(on===false?'#fdecec':'#eef2fb');
  el.style.color      = on===true?'#0a7a3d':(on===false?'#a13b3b':'#12307a'); }
function geoDist(la1,lo1,la2,lo2){ const R=6371000, t=Math.PI/180;
  const dLa=(la2-la1)*t, dLo=(lo2-lo1)*t;
  const a=Math.sin(dLa/2)**2 + Math.cos(la1*t)*Math.cos(la2*t)*Math.sin(dLo/2)**2;
  return 2*R*Math.asin(Math.sqrt(a)); }
function startGeoTracking(){
  if(!('geolocation' in navigator)){ geoSet('📍 sem GPS neste aparelho', false); return; }
  if(!window.isSecureContext){ geoSet('📍 abra pelo endereço https:// para rastrear', false); return; }
  if(GEO.watchId==null){
    geoSet('📍 ativando localização…', null);
    GEO.watchId = navigator.geolocation.watchPosition(onGeo, onGeoErr, { enableHighAccuracy:true, maximumAge:5000, timeout:20000 });
  }
  if(GEO.pulseId==null) GEO.pulseId=setInterval(geoPulse,30000);
  geoPulse();
}
async function onGeo(pos){
  const c=pos.coords, now=Date.now();
  const moved = (GEO.lastLat==null) || geoDist(GEO.lastLat,GEO.lastLng,c.latitude,c.longitude) > 20;
  if(now-GEO.last < 15000 && !moved){ geoSet('📍 compartilhando localização', true); return; }
  try{
    const {error}=await sb.rpc('erp_courier_ping',{ p_lat:c.latitude, p_lng:c.longitude,
      p_acc:c.accuracy!=null?Math.round(c.accuracy):null,
      p_speed:(c.speed!=null && c.speed>=0)?c.speed:null,
      p_heading:(c.heading!=null && !isNaN(c.heading))?c.heading:null });
    if(error) throw error;
    GEO.last=now; GEO.lastLat=c.latitude; GEO.lastLng=c.longitude;
    geoSet('📍 compartilhando localização · GPS ativo', true);
  }catch(e){ geoSet('📍 falha ao enviar posição (tentando…)', false); }
}
function onGeoErr(err){
  geoSet(err && err.code===1 ? '📍 permissão de localização negada' : '📍 localização indisponível', false);
}
function geoPulse(){
  if(document.visibilityState==='visible'&&!$('#app').classList.contains('hide'))
    navigator.geolocation.getCurrentPosition(onGeo,onGeoErr,{enableHighAccuracy:true,maximumAge:5000,timeout:20000});
}
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'&&GEO.watchId!=null) geoPulse(); });

// ======================= LISTA =======================
$('#btnRefresh').onclick=()=>{loadList();toast('Lista atualizada');};
function card(r,tipo){
  const wa=(r.fone||'').replace(/\D/g,'');
  const pago=r.pago?'<span class="chip ok">pago</span>':`<span class="chip amber">cobrar ${BRL(r.total)}</span>`;
  const chip=tipo==='fila'?'<span class="chip">na fila</span>'
    :tipo==='rota'?`<span class="chip amber">em rota${r.eta_minutes!=null?' · previsão '+dur(r.eta_minutes):(r.minutos_em_rota!=null?' · há '+dur(r.minutos_em_rota):'')}</span>`
    :`<span class="chip ok">entregue${r.minutos_entrega!=null?' · '+dur(r.minutos_entrega):''}</span>`;
  return `<div class="card ${tipo==='rota'?'rota':tipo==='entregues'?'done':''}">
    <div class="nm"><span>#${r.venda_numero||''} · ${esc(r.cliente||'Cliente')}</span>${chip}</div>
    <div class="adr">${esc(r.endereco||'—')}</div>
    <div class="mt">${esc(r.fone||'sem telefone')} · ${r.itens||0} item(ns) · <b>${BRL(r.total)}</b>${+r.frete>0?' (frete '+BRL(r.frete)+')':''}${tipo!=='entregues'?' · '+pago:''}${r.recebida_de_outra?' · pedido de '+esc(r.origem_nome||''):''}${tipo==='rota'&&r.eta_distance_km!=null?' · '+Number(r.eta_distance_km).toLocaleString('pt-BR',{maximumFractionDigits:1})+' km restantes':''}</div>
    <div class="acts">
      <button class="btn ghost sm" data-act="detail" data-a1="${r.id}">Ver pedido</button>
      ${wa?`<a class="btn ghost sm" href="https://wa.me/55${wa.replace(/^55/,'')}" target="_blank">💬 WhatsApp</a>`:''}
      ${r.endereco?`<a class="btn ghost sm" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.endereco)}" target="_blank">📍 Mapa</a>`:''}
      ${tipo==='fila'?`<button class="btn" data-act="handleScan" data-a1="${r.id}">🛵 Marcar saída</button>`:''}
      ${tipo==='rota'?`<button class="btn green" data-act="handleScan" data-a1="${r.id}">✅ Marcar entregue</button>`:''}
    </div></div>`;
}
async function loadList(silent){
  const {data,error}=await sb.rpc('erp_courier_queue',{p_dias:1});
  if(error){if(!silent)toast('Erro: '+error.message,true);return;}
  DATA=keepToday(data||{});
  const r=DATA.resumo;
  $('#stats').innerHTML=`
    <div class="stat"><div class="k">Prontos p/ sair</div><div class="v">${r.fila||0}</div></div>
    <div class="stat"><div class="k">Em rota</div><div class="v">${r.rota||0}</div></div>
    <div class="stat"><div class="k">Entregues hoje</div><div class="v">${r.entregues||0}</div></div>
    <div class="stat"><div class="k">⏱️ Tempo médio</div><div class="v">${r.tempo_medio!=null?dur(r.tempo_medio):'—'}</div></div>`;
  $('#list').innerHTML=`
    <div class="sec">📦 Prontos para sair (${DATA.fila.length})</div>
    ${DATA.fila.length?DATA.fila.map(x=>card(x,'fila')).join(''):'<p class="empty">Nenhum pedido pronto para sair.</p>'}
    <div class="sec">🛵 Em rota (${DATA.rota.length})${+r.a_receber_rota>0?` <span class="chip amber">a receber ${BRL(r.a_receber_rota)}</span>`:''}</div>
    ${DATA.rota.length?DATA.rota.map(x=>card(x,'rota')).join(''):'<p class="empty">Nenhum pedido em rota.</p>'}
    <div class="sec">✅ Entregues hoje (${DATA.entregues.length})${+r.valor_entregue>0?` <span class="chip ok">${BRL(r.valor_entregue)}</span>`:''}</div>
    ${DATA.entregues.length?DATA.entregues.map(x=>card(x,'entregues')).join(''):'<p class="empty">Nenhuma entrega concluída hoje ainda.</p>'}`;
}

window.detail=async id=>{
  const {data:d,error}=await sb.rpc('erp_courier_find',{p_q:id});
  if(error||!d){toast('Pedido não encontrado.',true);return;}
  const itens=(d.itens||[]).map(i=>`<tr><td>${esc(i.descricao)}</td><td class="r">${(+i.qtd).toLocaleString('pt-BR')}</td><td class="r">${BRL(i.preco_unit)}</td><td class="r"><b>${BRL(i.subtotal)}</b></td></tr>`).join('');
  const chip={fila:'<span class="chip">na fila</span>',em_rota:'<span class="chip amber">em rota</span>',entregue:'<span class="chip ok">entregue</span>',cancelada:'<span class="chip warn">cancelada</span>'}[d.status]||esc(d.status);
  modal(`<div class="m-head"><h3>Pedido #${d.venda_numero||''} ${chip}</h3><button data-act="closeModal">✕</button></div>
    <div class="m-body">
      <p style="font-family:Fredoka;font-size:19px"><b>${esc(d.cliente||'—')}</b></p>
      <p class="muted">${esc(d.fone||'')}</p>
      <p>${esc(d.endereco||'—')}</p>
      ${d.obs?`<p class="muted">Obs: ${esc(d.obs)}</p>`:''}
      <table class="tbl"><thead><tr><th>Item</th><th class="r">Qtd</th><th class="r">Unit.</th><th class="r">Total</th></tr></thead>
        <tbody>${itens||'<tr><td colspan="4" class="muted">Sem itens.</td></tr>'}</tbody></table>
      <div class="sum">
        <div class="l"><span>Itens</span><b>${BRL(d.subtotal)}</b></div>
        <div class="l"><span>Frete</span><b>${BRL(d.frete)}</b></div>
        <div class="l big"><span>${d.pago?'Total (já pago)':'A RECEBER'}</span><b>${BRL(d.total)}</b></div>
      </div>
      <p class="muted" style="margin-top:8px">${d.pago?'✅ Já pago na loja — não cobrar.':'💵 Cobrar na entrega.'}${d.dispatched_at?`<br>Saiu em ${fmtDT(d.dispatched_at)}`:''}${d.delivered_at?` · entregue em ${fmtDT(d.delivered_at)}`:''}</p>
    </div>
    <div class="m-foot">
      ${d.status==='fila'?`<button class="btn" data-act="handleScan" data-a1="${d.id}" data-close="1">🛵 Marcar saída</button>`:''}
      ${d.status==='em_rota'?`<button class="btn green" data-act="proofSheet" data-a1="${d.id}" data-a2="${esc(d.cliente||'')}" data-close="1">✅ Comprovar entrega</button>`:''}
      <button class="btn ghost" data-act="closeModal">Fechar</button></div>`);
};

$('#btnFind').onclick=find;
$('#q').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();find();}};
async function find(){
  const q=($('#q').value||'').trim();
  if(!q){toast('Digite o número do pedido.',true);return;}
  const {data:d}=await sb.rpc('erp_courier_find',{p_q:q});
  if(!d){toast('Pedido #'+q+' não encontrado.',true);return;}
  $('#q').value=''; detail(d.id);
}

// ======================= SCAN / MARCAR =======================
const SCAN_COOLDOWN=30; let SCAN_BUSY=false;
window.handleScan=async raw=>{
  let code=String(raw||'').trim(); if(!code||SCAN_BUSY)return; SCAN_BUSY=true;
  try{
    code=code.replace(/^.*[:/]/,'');
    if(!/^[0-9a-f-]{32,36}$/i.test(code)){
      const {data:f}=await sb.rpc('erp_courier_find',{p_q:code});
      if(!f){toast('Pedido não encontrado.',true);return;}
      code=f.id;
    }
    const {data,error}=await sb.rpc('erp_delivery_scan',{p_id:code,p_cooldown:SCAN_COOLDOWN});
    if(error){
      const m=error.message||'';
      if(m.includes('AGUARDE:'))toast('Aguarde '+m.split('AGUARDE:')[1]+'s antes de confirmar a entrega.',true);
      else toast('Erro: '+m,true);
      return;
    }
    if(data.status==='em_rota'){toast('Saiu para entrega 🛵');if(data.notify)notifyWhats(data.fone,data.mensagem);}
    else if(data.status==='entregue'){toast('Entrega concluída ✅'+(data.minutos!=null?' · '+dur(data.minutos):''));}
    loadList();
  }finally{setTimeout(()=>{SCAN_BUSY=false;},1500);}
};
// ======================= COMPROVANTE DE ENTREGA =======================
function initSigPad(canvas){
  const ctx=canvas.getContext('2d'); ctx.lineWidth=2.5; ctx.lineCap='round'; ctx.strokeStyle='#111';
  let drawing=false,last=null,dirty=false;
  const pos=e=>{const r=canvas.getBoundingClientRect();const t=e.touches?e.touches[0]:e;return {x:(t.clientX-r.left)*(canvas.width/r.width),y:(t.clientY-r.top)*(canvas.height/r.height)};};
  const start=e=>{e.preventDefault();drawing=true;last=pos(e);};
  const move=e=>{if(!drawing)return;e.preventDefault();const p=pos(e);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p;dirty=true;};
  const end=()=>{drawing=false;};
  canvas.addEventListener('mousedown',start); canvas.addEventListener('mousemove',move); window.addEventListener('mouseup',end);
  canvas.addEventListener('touchstart',start,{passive:false}); canvas.addEventListener('touchmove',move,{passive:false}); canvas.addEventListener('touchend',end);
  return { clear:()=>{ctx.clearRect(0,0,canvas.width,canvas.height);dirty=false;}, isDirty:()=>dirty };
}
function compressPhoto(file, cb){
  const fr=new FileReader();
  fr.onload=()=>{ const img=new Image(); img.onload=()=>{
    const max=800; let w=img.width,h=img.height;
    if(w>h&&w>max){h=Math.round(h*max/w);w=max;} else if(h>=w&&h>max){w=Math.round(w*max/h);h=max;}
    const c=document.createElement('canvas'); c.width=w; c.height=h;
    c.getContext('2d').drawImage(img,0,0,w,h);
    try{ cb(c.toDataURL('image/jpeg',0.5)); }catch(_e){ cb(null); }
  }; img.onerror=()=>cb(null); img.src=fr.result; };
  fr.onerror=()=>cb(null); fr.readAsDataURL(file);
}
window.proofSheet=(id,cliente)=>{
  modal(`<div class="m-head"><h3>Comprovar entrega</h3><button data-act="closeModal">✕</button></div>
    <div class="m-body">
      <p class="muted">Cliente: <b>${esc(cliente||'')}</b></p>
      <div class="lbl" style="margin-top:6px">Quem recebeu</div>
      <input id="pfRecv" class="in" placeholder="Nome de quem recebeu">
      <div class="lbl" style="margin-top:10px">Assinatura (assine na tela)</div>
      <canvas id="pfSig" width="600" height="200" style="width:100%;height:160px;border:1px dashed #bbb;border-radius:10px;background:#fff;touch-action:none"></canvas>
      <button class="btn ghost" type="button" style="margin-top:6px" data-act="sigClear">Limpar assinatura</button>
      <div class="lbl" style="margin-top:10px">Foto do comprovante (opcional)</div>
      <input id="pfPhoto" type="file" accept="image/*" capture="environment" class="in">
      <div id="pfPrev"></div>
    </div>
    <div class="m-foot"><button class="btn green" id="pfGo" data-act="proofConfirm" data-a1="${id}">✅ Confirmar entrega</button>
      <button class="btn ghost" data-act="closeModal">Cancelar</button></div>`);
  window.PF={ sig:initSigPad(document.getElementById('pfSig')), photo:null };
  const pin=document.getElementById('pfPhoto');
  if(pin) pin.onchange=()=>{ const f=pin.files&&pin.files[0]; if(!f)return; compressPhoto(f,du=>{ PF.photo=du; const pv=document.getElementById('pfPrev'); if(pv&&du)pv.innerHTML='<img src="'+du+'" style="max-width:100%;margin-top:8px;border-radius:8px">'; }); };
};
window.proofConfirm=async id=>{
  const b=document.getElementById('pfGo'); if(b){b.disabled=true;b.textContent='Enviando…';}
  const recv=((document.getElementById('pfRecv')||{}).value||'').trim();
  const sig=(window.PF&&PF.sig&&PF.sig.isDirty())?document.getElementById('pfSig').toDataURL('image/png'):null;
  try{
    const {data,error}=await sb.rpc('erp_delivery_proof',{p_id:id,p_signature:sig,p_photo:(window.PF&&PF.photo)||null,p_receiver:recv||null});
    if(error)throw error;
    closeModal(); toast('Entrega comprovada ✅');
    if(data&&data.notify)notifyWhats(data.fone,data.mensagem);
    loadList();
  }catch(e){ toast('Erro: '+(e.message||e),true); if(b){b.disabled=false;b.textContent='✅ Confirmar entrega';} }
};
async function notifyWhats(fone,mensagem){
  const link='https://wa.me/55'+(fone||'').replace(/\D/g,'').replace(/^55/,'')+'?text='+encodeURIComponent(mensagem||'');
  try{
    const {data:{session}}=await sb.auth.getSession();
    const r=await fetch(`${SUPABASE_URL}/functions/v1/wa-send`,{method:'POST',
      headers:{'Authorization':`Bearer ${session.access_token}`,'Content-Type':'application/json'},
      body:JSON.stringify({to:fone,message:mensagem})});
    const j=await r.json();
    if(j.sent)toast('Cliente avisado no WhatsApp ✅');
    else if(j.fallback)window.open(j.fallback,'_blank');
    else window.open(link,'_blank');
  }catch(e){window.open(link,'_blank');}
}

// ---- scanner de câmera (usa BarcodeDetector quando disponível) ----
let scanStream=null, scanRAF=null, detector=null;
$('#btnScan').onclick=startScan;
async function startScan(){
  const sc=$('#scan'); sc.classList.add('on'); $('#scanMsg').textContent='Aponte a câmera para o QR…';
  if(!('BarcodeDetector' in window)){
    $('#scanMsg').innerHTML='Este aparelho não tem leitor de QR nativo.<br>Use a busca pelo número do pedido.';
    setTimeout(stopScan,2600); openManual(); return;
  }
  try{
    detector=detector||new window.BarcodeDetector({formats:['qr_code','code_128','ean_13']});
    scanStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    const v=$('#scanVideo'); v.srcObject=scanStream; await v.play();
    const tick=async()=>{
      if(!$('#scan').classList.contains('on'))return;
      try{const codes=await detector.detect(v);
        if(codes&&codes.length){const val=codes[0].rawValue; stopScan(); handleScan(val); return;}
      }catch(e){}
      scanRAF=requestAnimationFrame(tick);
    };
    scanRAF=requestAnimationFrame(tick);
  }catch(e){$('#scanMsg').textContent='Não consegui abrir a câmera. '+(e.message||'');setTimeout(stopScan,2600);openManual();}
}
window.stopScan=function(){
  const sc=$('#scan'); sc.classList.remove('on');
  if(scanRAF)cancelAnimationFrame(scanRAF); scanRAF=null;
  if(scanStream){scanStream.getTracks().forEach(t=>t.stop());scanStream=null;}
};
function openManual(){$('#q').focus();}

// ======================= PWA: instalação + service worker =======================
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault(); deferredPrompt=e;
  const b=$('#install'); if(b&&!localStorage.getItem('onpdv_install_dismiss'))b.classList.remove('hide');
});
$('#btnInstall').onclick=async()=>{
  if(!deferredPrompt)return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice; deferredPrompt=null;
  $('#install').classList.add('hide');
};
$('#btnInstallClose').onclick=()=>{$('#install').classList.add('hide');localStorage.setItem('onpdv_install_dismiss','1');};
window.addEventListener('appinstalled',()=>{$('#install').classList.add('hide');toast('App instalado 🎉');});
// dica para iOS (não dispara beforeinstallprompt)
(function(){
  const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone;
  if(isIOS&&!standalone&&!localStorage.getItem('onpdv_install_dismiss')){
    const b=$('#install'); if(b){b.classList.remove('hide');
      $('#btnInstall').classList.add('hide');
      $('#installHint').textContent='No iPhone: toque em Compartilhar ⬆️ e em "Adicionar à Tela de Início".';}
  }
})();
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{navigator.serviceWorker.register('sw.js').catch(()=>{});});
}

initAuth();

// ===== Delegação de cliques (CSP sem unsafe-inline) =====
// Substitui os antigos onclick="fn(arg)" das strings de HTML por data-act/data-a1.
// Os handlers de propriedade (el.onclick=fn) continuam funcionando normalmente.
document.addEventListener('click', function(e){
  var ov = e.target.closest && e.target.closest('[data-ovclose]');
  if(ov && e.target===ov){ closeModal(); return; }
  var el = e.target.closest && e.target.closest('[data-act]');
  if(!el) return;
  var act = el.dataset.act, a1 = el.dataset.a1, a2 = el.dataset.a2, doClose = (el.dataset.close!=null);
  if(doClose) closeModal();
  if(act==='sigClear'){ try{ if(window.PF && PF.sig) PF.sig.clear(); }catch(_){} return; }
  var fn = window[act];
  if(typeof fn==='function') fn(a1, a2);
});
