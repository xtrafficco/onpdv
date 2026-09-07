// ONPDV · vitrine.js — extraído de vitrine.html para permitir CSP sem unsafe-inline em script.
if('serviceWorker' in navigator){ window.addEventListener('load',()=>{ navigator.serviceWorker.register('sw.js').catch(()=>{}); }); }

// ===== config =====
const SUPABASE_URL='https://qkhpvqepgozsaamxmugk.supabase.co';
const SUPABASE_KEY='sb_publishable_rh5Whcvb9PFt9MI1iL6dlg_qS9BGRNw';
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=s=>document.querySelector(s);
const BRL=n=>(Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const esc=s=>(s==null?'':String(s)).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const LS={ get:(k,d)=>{try{return localStorage.getItem(k)||d}catch(e){return d}}, set:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}} };

const cleanTerm=v=>(String(v||'CAIXA-1').replace(/[^A-Za-z0-9_-]/g,'').slice(0,40)||'CAIXA-1');
let TERM=cleanTerm(LS.get('petapp_pdv_term','CAIXA-1')); // mesmo default do PDV
let STORE=LS.get('petapp_cfd_store','Pet Shop');
let SECRET=(LS.get('petapp_cfd_secret','')||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase();
let chan=null, cpf='', identified=false, lastKeys='';
// nome do canal = caixa (+ código de pareamento, se houver). Precisa bater com o PDV.
function chanName(){ return SECRET.length>=16 ? 'cfd-'+TERM+'-'+SECRET : ''; }

// ===== saudação por horário =====
function greeting(){const h=new Date().getHours();return h<12?'Bom dia':h<18?'Boa tarde':'Boa noite';}
function paintHeader(){ $('#store').textContent=STORE; $('#hi').textContent=greeting()+', seja bem-vindo!'; }

// ===== pinpad =====
function fmtCpf(d){ d=d.slice(0,11);
  let o=d; if(d.length>3)o=d.slice(0,3)+'.'+d.slice(3);
  if(d.length>6)o=d.slice(0,3)+'.'+d.slice(3,6)+'.'+d.slice(6);
  if(d.length>9)o=d.slice(0,3)+'.'+d.slice(3,6)+'.'+d.slice(6,9)+'-'+d.slice(9);
  return o; }
function paintCpf(){ const el=$('#cpf');
  if(!cpf){ el.textContent='000.000.000-00'; el.classList.add('ph'); }
  else{ el.textContent=fmtCpf(cpf); el.classList.remove('ph'); }
  $('#go').disabled = cpf.length!==11;
}
function buildKeys(){
  const k=$('#keys'); k.innerHTML='';
  ['1','2','3','4','5','6','7','8','9','⌫','0','C'].forEach(lbl=>{
    const b=document.createElement('button'); b.className='key'; b.textContent=lbl;
    b.onclick=()=>{ setMsg('');
      if(lbl==='⌫'){ cpf=cpf.slice(0,-1); }
      else if(lbl==='C'){ cpf=''; }
      else if(cpf.length<11){ cpf+=lbl; }
      paintCpf();
    };
    k.appendChild(b);
  });
}
function setMsg(t,cls){ const m=$('#padmsg'); m.textContent=t||''; m.className='padmsg'+(cls?' '+cls:''); }

$('#go').onclick=()=>{
  if(cpf.length!==11) return;
  if(!chan){ setMsg('Sem conexão com o caixa. Chame o atendente.','err'); return; }
  setMsg('Consultando…');
  chan.send({ type:'broadcast', event:'cpf', payload:{ cpf } });
  // timeout de cortesia caso o caixa não responda
  clearTimeout(window._cpfTo);
  window._cpfTo=setTimeout(()=>{ if(!identified) setMsg('O caixa não respondeu. Chame o atendente 🐾','err'); }, 6000);
};
$('#reidBtn').onclick=()=>{ resetIdentity(); };
function resetIdentity(){ identified=false; cpf=''; paintCpf(); setMsg('');
  $('#reid').style.display='none'; $('#keys').style.display=''; $('#go').style.display=''; $('#pad').querySelector('.ttl').style.display='';
}

function applyLayout(items, customer){
  const hasCustomer=!!(customer && customer.name);
  const mode=(items.length||hasCustomer) ? (hasCustomer?'mode-customer':'mode-cart') : 'mode-idle';
  document.body.classList.remove('mode-idle','mode-cart','mode-customer');
  document.body.classList.add(mode);
}

// ===== render carrinho + cliente =====
function renderState(st){
  st=st||{};
  const items=Array.isArray(st.items)?st.items:[];
  const cu=st.cust;
  applyLayout(items,cu);
  if(items.length) hidePay();   // nova venda em andamento → tira qualquer card de pagamento
  const box=$('#items');
  if(!items.length){
    box.innerHTML='<div class="empty" id="empty"><div class="big">🐶🐱</div>'
      +'<div class="msg">Aguardando o atendente iniciar sua compra…</div></div>';
  }else{
    const sig=JSON.stringify(items.map(i=>[i.name,i.qty,i.price]));
    box.innerHTML=items.map((it,idx)=>{
      const q=(Number(it.qty)||0); const qs=Number.isInteger(q)?q+'x':q.toLocaleString('pt-BR')+'x';
      const line=(Number(it.price)||0)*q-(Number(it.disc)||0);
      return '<div class="item'+(idx===items.length-1?' new':'')+'"><span class="q">'+qs+'</span>'
        +'<span class="nm">'+esc(it.name||'Item')+'</span>'
        +'<span class="pr">'+BRL(line)+'</span></div>';
    }).join('');
    lastKeys=sig;
  }
  $('#total').textContent=BRL(st.total||0);

  const cust=$('#cust');
  if(cu && cu.name){
    identified=true; clearTimeout(window._cpfTo);
    cust.classList.remove('anon');
    $('#custName').textContent='Olá, '+esc(cu.name)+'! 🎉';
    $('#custSub').textContent='Que bom te ver por aqui 🐾';
    $('#custCb').style.display=''; $('#cbVal').textContent=BRL(cu.cashback||0);
    // recolhe o teclado, oferece trocar
    $('#keys').style.display='none'; $('#go').style.display='none'; $('#pad').querySelector('.ttl').style.display='none';
    $('#reid').style.display=''; setMsg('');
  }else{
    cust.classList.add('anon');
    $('#custName').textContent='Identifique-se e ganhe cashback 🐾';
    $('#custSub').textContent='Digite seu CPF ao lado para ver seu saldo';
    $('#custCb').style.display='none';
    if(identified){ resetIdentity(); }
  }
}

// ===== overlay de pagamento (PIX / cartão) =====
let payTimer=null;
function hidePay(){ clearTimeout(payTimer); $('#pay').classList.remove('show'); }
// Gera o QR do PIX localmente (sem serviço externo). Retorna um data URL (GIF).
function qrDataURL(text){
  try{ if(typeof qrcode==='undefined') return ''; const qr=qrcode(0,'M'); qr.addData(String(text||'')); qr.make(); return qr.createDataURL(6,2); }
  catch(e){ return ''; }
}
function renderPay(p){
  p=p||{}; const box=$('#pay'), body=$('#payBody'); clearTimeout(payTimer);
  if(p.status==='clear'){ hidePay(); return; }
  if(p.status==='pix_wait'){
    const img = (p.qrImage && /^data:/.test(p.qrImage)) ? p.qrImage
      : (p.qrText ? qrDataURL(p.qrText)
      : (p.qrImage||''));
    if(p.machine && !img){
      body.innerHTML='<div class="pcard pix"><div class="ph">Pague com PIX</div>'
        +'<div class="picon">📟</div>'
        +'<div class="pamt">'+BRL(p.amount||0)+'</div>'
        +'<div class="psub"><span class="spin"></span> Escaneie o QR no visor da maquininha</div></div>';
    } else {
      body.innerHTML='<div class="pcard pix"><div class="ph">Pague com PIX</div>'
        +(img?'<div class="qr"><img alt="QR Code PIX" src="'+esc(img)+'"></div>':'<div class="psub">Gerando QR…</div>')
        +'<div class="pamt">'+BRL(p.amount||0)+'</div>'
        +'<div class="psub">📱 Abra o app do seu banco e aponte a câmera no código</div></div>';
    }
  } else if(p.status==='card_wait'){
    body.innerHTML='<div class="pcard card"><div class="picon">💳</div>'
      +'<div class="ph">Aproxime, insira ou passe o cartão</div>'
      +'<div class="pamt">'+BRL(p.amount||0)+'</div>'
      +'<div class="psub"><span class="spin"></span> '+esc(p.sub||'Aguardando o cartão…')+'</div></div>';
  } else if(p.status==='approved'){
    body.innerHTML='<div class="pcard ok"><div class="picon">✅</div><div class="ph">Pagamento aprovado!</div>'
      +'<div class="pamt">'+BRL(p.amount||0)+'</div><div class="psub">Obrigado pela preferência 🐾</div></div>';
    payTimer=setTimeout(hidePay,6000);
  } else if(p.status==='declined'){
    body.innerHTML='<div class="pcard bad"><div class="picon">❌</div><div class="ph">Pagamento não aprovado</div>'
      +'<div class="psub">'+esc(p.msg||'Tente outro cartão ou fale com o atendente.')+'</div></div>';
    payTimer=setTimeout(hidePay,7000);
  } else { hidePay(); return; }
  box.classList.add('show');
}

// ===== realtime =====
function connect(){
  if(chan){ try{ sb.removeChannel(chan); }catch(e){} chan=null; }
  $('#dot').className='dot off';
  const name=chanName();
  if(!name){ $('#dot').title='Pareamento obrigatório'; return; }
  chan=sb.channel(name,{ config:{ broadcast:{ self:false } } })
    .on('broadcast',{event:'state'}, m=> renderState(m.payload))
    .on('broadcast',{event:'pay'}, m=> renderPay(m.payload))
    .on('broadcast',{event:'cpf_result'}, m=>{
      const p=m.payload||{};
      if(p.found===false){ setMsg('CPF não encontrado. Peça um cadastro ao atendente 🐾','err'); }
      else if(p.blocked){ setMsg('Cadastro indisponível. Fale com o atendente.','err'); }
    })
    .subscribe(status=>{
      if(status==='SUBSCRIBED'){ $('#dot').className='dot on';
        chan.send({ type:'broadcast', event:'hello', payload:{} }); } // pede o estado atual ao caixa
      else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){ $('#dot').className='dot off'; }
      else if(status==='CLOSED'){ $('#dot').className='dot off'; }
    });
}

// ===== instalar como app (PWA) =====
let deferredPrompt=null;
const isStandalone=()=> (window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone===true;
const isIOS=()=> /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
const INSTALL_DISMISS='petapp_cfd_install_dismissed';
function installState(){ if(isStandalone())return 'installed'; if(deferredPrompt)return 'prompt'; if(isIOS())return 'ios'; return 'none'; }
function refreshInstallUI(){
  const st=installState(), banner=$('#install'), row=$('#cfgInstallRow');
  if(st==='prompt'||st==='ios'){
    row.style.display='';
    if(st==='ios'){ $('#cfgInstallTxt').textContent='📲 Para instalar: toque em Compartilhar e “Adicionar à Tela de Início”.'; $('#cfgInstallBtn').style.display='none'; }
    else { $('#cfgInstallTxt').textContent='📲 Instale a Vitrine para abrir em tela cheia.'; $('#cfgInstallBtn').style.display=''; }
    if(LS.get(INSTALL_DISMISS,'')!=='1'){
      if(st==='ios'){ $('#installTxt').innerHTML='<b>Instalar a Vitrine</b><br>Toque em Compartilhar e “Adicionar à Tela de Início”.'; $('#installYes').style.display='none'; }
      else { $('#installTxt').innerHTML='<b>Instalar a Vitrine</b><br>Abre em tela cheia, como um app.'; $('#installYes').style.display=''; }
      banner.classList.add('show');
    } else banner.classList.remove('show');
  }else{ row.style.display='none'; banner.classList.remove('show'); }
}
async function doInstall(){ if(!deferredPrompt)return; deferredPrompt.prompt(); try{ await deferredPrompt.userChoice; }catch(e){} deferredPrompt=null; refreshInstallUI(); }
window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); deferredPrompt=e; refreshInstallUI(); });
window.addEventListener('appinstalled', ()=>{ deferredPrompt=null; LS.set(INSTALL_DISMISS,'1'); refreshInstallUI(); });
$('#installYes').onclick=doInstall;
$('#cfgInstallBtn').onclick=doInstall;
$('#installNo').onclick=()=>{ LS.set(INSTALL_DISMISS,'1'); refreshInstallUI(); };

// ===== tela cheia =====
function toggleFullscreen(){
  try{
    const p = document.fullscreenElement
      ? (document.exitFullscreen||document.webkitExitFullscreen).call(document)
      : (function(el){ return (el.requestFullscreen||el.webkitRequestFullscreen).call(el); })(document.documentElement);
    if(p&&p.catch) p.catch(()=>{});   // rejeição assíncrona (sem gesto/permissão) — ignora
  }catch(e){}
}
$('#fs').onclick=toggleFullscreen;
document.addEventListener('fullscreenchange',()=>{ $('#fs').title=document.fullscreenElement?'Sair da tela cheia':'Tela cheia'; $('#fs').style.opacity=document.fullscreenElement?'.7':''; });
// navegadores sem Fullscreen API (ex.: iPhone) ou já em app instalado: some com o botão
if(!document.documentElement.requestFullscreen || isStandalone()){ $('#fs').style.display='none'; }

// ===== config UI =====
function openCfg(){ $('#cfgStore').value=STORE; $('#cfgTerm').value=TERM; $('#cfgSecret').value=SECRET; $('#cfgError').textContent=''; refreshInstallUI(); $('#ov').classList.add('show'); }
$('#gear').onclick=openCfg;
$('#cfgCancel').onclick=()=>$('#ov').classList.remove('show');
$('#cfgSave').onclick=()=>{
  const nextSecret=($('#cfgSecret').value||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase();
  if(nextSecret.length<16){ $('#cfgError').textContent='Informe o código completo de 16 caracteres exibido no PDV.'; return; }
  STORE=($('#cfgStore').value||'Pet Shop').trim().slice(0,80)||'Pet Shop';
  TERM=cleanTerm($('#cfgTerm').value);
  SECRET=nextSecret.slice(0,64);
  LS.set('petapp_cfd_store',STORE); LS.set('petapp_pdv_term',TERM); LS.set('petapp_cfd_secret',SECRET);
  $('#ov').classList.remove('show'); paintHeader(); resetIdentity(); connect();
};

// ===== boot =====
buildKeys(); paintCpf(); paintHeader(); if(SECRET.length>=16)connect();else openCfg(); refreshInstallUI();
setInterval(paintHeader, 60000);           // atualiza saudação (manhã/tarde/noite)
// reconecta ao voltar do background (tablet economizando energia)
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible' && (!chan)) connect(); });
