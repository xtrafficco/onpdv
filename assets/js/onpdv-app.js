// ======================= CONFIG =======================
const SUPABASE_URL = 'https://qkhpvqepgozsaamxmugk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_rh5Whcvb9PFt9MI1iL6dlg_qS9BGRNw';
const sb = window.ONPDV_SB || window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const EDGE_CAPS = Object.create(null);
async function loadEdgeCapabilities(names){
  await Promise.all((names||[]).map(async name=>{
    try{
      const r=await fetch(SUPABASE_URL+'/functions/v1/'+encodeURIComponent(name),{
        method:'OPTIONS',
        headers:{apikey:SUPABASE_KEY,'Access-Control-Request-Method':'POST'}
      });
      EDGE_CAPS[name]=r.status!==404;
    }catch(e){ EDGE_CAPS[name]=false; }
  }));
}

// ======================= HELPERS =======================
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const BRL = n => (Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const esc = s => (s==null?'':String(s)).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const num = v => { let s=String(v??'').trim().replace(/\s|R\$/gi,'').replace(/[^\d,.\-]/g,''); if(!s)return 0; const c=s.lastIndexOf(','),d=s.lastIndexOf('.'); if(c>=0&&d>=0){if(c>d)s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/,/g,'');}else if(c>=0){s=s.replace(/\./g,'').replace(',','.');}else if(d>=0){const p=s.split('.');if(p.length>2||(p.length===2&&p[1].length===3&&p[0].replace('-','').length<=3))s=s.replace(/\./g,'');} const n=Number(s); return Number.isFinite(n)?n:0; };
const fmtNum = n => (Number(n)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
let ME = null, PRODUCTS = [], CUSTOMERS = [], TERMINALS = [], COMPANY = {}, STORES = [], SUPPLIERS = [];
let CURRENT_STORE = null, TR_CART = [], MATRIZ_STOCK = {}, FRETE_RULES = [];
// Listas de Compras (Iconha/Reta) que alimentaram o carrinho de transferência atual.
// Ao gerar a transferência, essas listas são esvaziadas.
let TR_SOURCE_LISTS = [];
let CB_ACTIVE = false;   // programa de cashback ligado? (controla o resgate no checkout)
async function loadCashbackActive(){ try{ const { data, error } = await sb.rpc('cashback_config_get'); if(error) throw error; CB_ACTIVE = !!(data && data.ativo); refCachePut('cashback_active', CB_ACTIVE, true); }catch(e){ const c = isNetworkErr(e) ? await refCacheGet('cashback_active') : undefined; CB_ACTIVE = (c===undefined) ? false : !!c; } }
let POS_CHAN = null;

function toast(msg, err){ const t=$('#toast'); t.setAttribute('role',err?'alert':'status'); t.setAttribute('aria-live',err?'assertive':'polite'); t.textContent=msg; t.className='toast show'+(err?' err':''); clearTimeout(toast.t); toast.t=setTimeout(()=>t.className='toast',2600); }
let MODAL_RETURN_FOCUS=null, MODAL_KEY_HANDLER=null, A11Y_SEQ=0;
function dialogFocusable(root){return [...root.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(x=>!x.classList.contains('hide')&&x.offsetParent!==null);}
function trapDialogTab(root,event){
  const items=dialogFocusable(root);if(!items.length){event.preventDefault();root.focus();return;}
  const first=items[0],last=items[items.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
}
function prepareDialog(dialog,label){
  if(!dialog)return;
  dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('tabindex','-1');
  const title=dialog.querySelector('h1,h2,h3,h4');
  if(title){if(!title.id)title.id='onpdv-dialog-title-'+(++A11Y_SEQ);dialog.setAttribute('aria-labelledby',title.id);}
  else dialog.setAttribute('aria-label',label||'Janela do sistema');
  enhanceAccessibility(dialog);
}
function modal(html,cls=''){
  const opener=document.activeElement;closeModal(false);MODAL_RETURN_FOCUS=opener;
  const root=$('#modalRoot');root.innerHTML=`<div class="ov"><div class="modal ${cls}">${html}</div></div>`;
  const ov=root.firstElementChild, dialog=ov&&ov.querySelector('.modal');prepareDialog(dialog);
  ov.addEventListener('click',e=>{if(e.target===ov||e.target.closest('[data-modal-close]'))closeModal();});
  MODAL_KEY_HANDLER=e=>{
    if(e.key==='Escape'){e.preventDefault();closeModal();return;}
    if(e.key==='Tab'&&dialog)trapDialogTab(dialog,e);
  };
  document.addEventListener('keydown',MODAL_KEY_HANDLER);
  requestAnimationFrame(()=>{const items=dialogFocusable(dialog);(items[0]||dialog).focus();});
}
function closeModal(restore=true){
  if(MODAL_KEY_HANDLER){document.removeEventListener('keydown',MODAL_KEY_HANDLER);MODAL_KEY_HANDLER=null;}
  const root=$('#modalRoot');if(root)root.innerHTML='';
  const back=MODAL_RETURN_FOCUS;MODAL_RETURN_FOCUS=null;if(restore&&back&&back.isConnected)back.focus();
}
window.closeModal = closeModal;

function enhanceAccessibility(root=document){
  root.querySelectorAll('label').forEach(label=>{
    if(label.htmlFor||label.querySelector('input,select,textarea'))return;
    const field=label.parentElement&&label.parentElement.querySelector('input:not([type="hidden"]),select,textarea');
    if(field){if(!field.id)field.id='onpdv-field-'+(++A11Y_SEQ);label.htmlFor=field.id;}
  });
  root.querySelectorAll('input:not([type="hidden"]),select,textarea').forEach(field=>{
    if(field.getAttribute('aria-label')||field.getAttribute('aria-labelledby')||(field.id&&root.querySelector(`label[for="${CSS.escape(field.id)}"]`)))return;
    const text=field.placeholder||field.title||field.name;
    if(text)field.setAttribute('aria-label',text);
  });
  root.querySelectorAll('button').forEach(button=>{
    const text=(button.textContent||'').trim();if(!button.getAttribute('aria-label')&&['×','✕','x'].includes(text.toLowerCase()))button.setAttribute('aria-label','Fechar');
  });
  const declarativeClickable='[data-onclick]:not(button):not(input):not(select):not(textarea):not(option)';
  const rows=[];
  if(root.matches&&root.matches(declarativeClickable))rows.push(root);
  rows.push(...root.querySelectorAll(declarativeClickable));
  rows.forEach(row=>{
    if(/^event\.(?:stopPropagation|preventDefault)\(\)$/.test(row.dataset.onclick||''))return;
    if(!row.hasAttribute('tabindex'))row.tabIndex=0;
    if(!row.hasAttribute('role'))row.setAttribute('role','button');
    if(!row.getAttribute('aria-label'))row.setAttribute('aria-label',(row.textContent||'Abrir item').replace(/\s+/g,' ').trim().slice(0,180)||'Abrir item');
  });
}
window.enhanceAccessibility=enhanceAccessibility;

// ---- diálogos assíncronos (substituem confirm()/prompt() nativos) ----
// uiConfirm → Promise<boolean>; uiPrompt → Promise<string|null>. Não bloqueiam a
// thread e mantêm a identidade visual do sistema (Esc = cancela, Enter = confirma).
function uiConfirm(message, opts){
  opts=opts||{};
  return new Promise(resolve=>{
    const returnFocus=document.activeElement;
    const root=document.createElement('div'); root.className='ov'; root.style.zIndex='99999';
    root.innerHTML=`<div class="modal" role="alertdialog" aria-modal="true" aria-label="${esc(opts.title||'Confirmação')}" tabindex="-1" style="max-width:430px"><div class="m-body" style="padding:22px">
      ${opts.title?`<h3 style="margin:0 0 8px">${esc(opts.title)}</h3>`:''}
      <p style="white-space:pre-line;line-height:1.5">${esc(message)}</p>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">
        <button class="btn ghost" data-x="0">${esc(opts.cancelText||'Cancelar')}</button>
        <button class="btn ${opts.danger?'red':'green'}" data-x="1">${esc(opts.okText||'Confirmar')}</button>
      </div></div></div>`;
    const done=v=>{ root.remove(); document.removeEventListener('keydown',onKey);if(returnFocus&&returnFocus.isConnected)returnFocus.focus();resolve(v); };
    const onKey=e=>{ if(e.key==='Escape'){e.preventDefault();done(false);} else if(e.key==='Enter'){e.preventDefault();done(true);} else if(e.key==='Tab')trapDialogTab(root,e); };
    root.addEventListener('click',e=>{ if(e.target===root) return done(false); const b=e.target.closest('[data-x]'); if(b) done(b.dataset.x==='1'); });
    document.addEventListener('keydown',onKey);
    document.body.appendChild(root);
    prepareDialog(root.querySelector('.modal'),opts.title||'Confirmação');
    const ok=root.querySelector('[data-x="1"]'); if(ok) ok.focus();
  });
}
function uiPrompt(message, def, opts){
  opts=opts||{};
  return new Promise(resolve=>{
    const returnFocus=document.activeElement;
    const root=document.createElement('div'); root.className='ov'; root.style.zIndex='99999';
    root.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(opts.title||message||'Informação necessária')}" tabindex="-1" style="max-width:430px"><div class="m-body" style="padding:22px">
      <p style="white-space:pre-line;line-height:1.5;margin-bottom:10px">${esc(message)}</p>
      <input class="in" id="_uipIn" ${opts.type==='number'?'inputmode="decimal"':''} value="${esc(def==null?'':String(def))}">
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px">
        <button class="btn ghost" data-x="0">${esc(opts.cancelText||'Cancelar')}</button>
        <button class="btn green" data-x="1">${esc(opts.okText||'OK')}</button>
      </div></div></div>`;
    const inp=()=>root.querySelector('#_uipIn');
    const done=v=>{ root.remove(); document.removeEventListener('keydown',onKey);if(returnFocus&&returnFocus.isConnected)returnFocus.focus();resolve(v); };
    const onKey=e=>{ if(e.key==='Escape'){e.preventDefault();done(null);} else if(e.key==='Enter'){e.preventDefault();done(inp().value);} else if(e.key==='Tab')trapDialogTab(root,e); };
    root.addEventListener('click',e=>{ if(e.target===root) return done(null); const b=e.target.closest('[data-x]'); if(b) done(b.dataset.x==='1'?inp().value:null); });
    document.addEventListener('keydown',onKey);
    document.body.appendChild(root);
    prepareDialog(root.querySelector('.modal'),opts.title||message||'Informação necessária');
    const i=inp(); if(i){ i.focus(); i.select(); }
  });
}
window.uiConfirm=uiConfirm; window.uiPrompt=uiPrompt;

// ---- observabilidade: rede de segurança p/ erros não tratados ----
// Guarda um buffer curto (window.__onpdvErrors) para o suporte diagnosticar sem
// depender do console aberto na hora. NÃO envia nada para fora (privacidade dos dados).
window.__onpdvErrors = [];
function logErr(kind, detail){
  try{
    const msg = (detail && (detail.message || (detail.reason && (detail.reason.message||detail.reason)) )) || String((detail&&detail.reason)||detail||'');
    const rec = { t:new Date().toISOString(), kind, msg:String(msg).slice(0,300) };
    window.__onpdvErrors.push(rec);
    if(window.__onpdvErrors.length>50) window.__onpdvErrors.shift();
    console.error('[ONPDV]', kind, rec.msg, detail);
  }catch(_){}
}
window.addEventListener('error', ev=> logErr('error', ev));
window.addEventListener('unhandledrejection', ev=> logErr('promise', ev));
window.logErr = logErr;

// ================= LOGIN GUARD (anti-força-bruta / credential stuffing) =================
// Defesa em profundidade no cliente: bloqueio progressivo por conta + limite global
// no navegador. NÃO substitui as proteções do servidor (Supabase Auth já limita taxa;
// habilite também CAPTCHA/Turnstile e "leaked password protection" no painel — ver
// comentário em SEGURANCA-LOGIN abaixo). Serve para frear tentativas repetidas de
// adivinhar senha direto na tela e dar feedback claro ao operador.
const LG_KEY='onpdv_login_guard';
const LG_MAX_FAILS=5;                    // erros por conta antes do 1º bloqueio
const LG_STEPS=[30,60,120,300,900];      // bloqueio progressivo (s): 30s→1m→2m→5m→15m
const LG_GLOBAL_MAX=20;                  // erros no navegador dentro da janela
const LG_GLOBAL_WINDOW=600;              // janela do limite global: 10 min
const LG_GLOBAL_LOCK=900;                // bloqueio global: 15 min
let lgTimer=null;
function lgLoad(){ try{ return JSON.parse(localStorage.getItem(LG_KEY)||'{}'); }catch(e){ return {}; } }
function lgSave(o){ try{ localStorage.setItem(LG_KEY, JSON.stringify(o)); }catch(e){} }
function lgKey(email){ return (email||'').trim().toLowerCase(); }
function nowS(){ return Math.floor(Date.now()/1000); }
function fmtDur(s){ s=Math.ceil(s); if(s<60) return s+'s'; const m=Math.floor(s/60), r=s%60; return m+'min'+(r?' '+r+'s':''); }
// segundos restantes de bloqueio para esta conta (considera bloqueio global também)
function lgLockedFor(email){
  const o=lgLoad(), now=nowS();
  const g=o.__global||{}; const e=o[lgKey(email)]||{};
  return Math.max(0, (g.until||0)-now, (e.until||0)-now);
}
function lgRecordFail(email){
  const o=lgLoad(), now=nowS(), k=lgKey(email);
  const e=o[k]||{fails:0,until:0};
  e.fails=(e.fails||0)+1;
  if(e.fails>=LG_MAX_FAILS){ e.until=now+LG_STEPS[Math.min(e.fails-LG_MAX_FAILS, LG_STEPS.length-1)]; }
  o[k]=e;
  const g=o.__global||{fails:0,winStart:now,until:0};
  if(now-(g.winStart||now)>LG_GLOBAL_WINDOW){ g.fails=0; g.winStart=now; }   // janela deslizante
  g.fails=(g.fails||0)+1;
  if(g.fails>=LG_GLOBAL_MAX){ g.until=now+LG_GLOBAL_LOCK; g.fails=0; g.winStart=now; }
  o.__global=g;
  lgSave(o);
}
function lgRecordSuccess(email){
  const o=lgLoad(); delete o[lgKey(email)];
  if(o.__global){ o.__global.fails=0; o.__global.winStart=nowS(); }  // alivia a pressão global
  lgSave(o);
}
// aplica (ou remove) o bloqueio na UI; retorna true se ainda está bloqueado
function lgApplyLock(email){
  const btn=$('#btnLogin'), su=$('#btnSignup'), left=lgLockedFor(email);
  if(lgTimer){ clearInterval(lgTimer); lgTimer=null; }
  if(left<=0){ if(btn) btn.disabled=false; if(su) su.disabled=false; if($('#liMsg').dataset.lock){ $('#liMsg').textContent=''; delete $('#liMsg').dataset.lock; } return false; }
  const paint=(l)=>{ $('#liMsg').textContent='🔒 Muitas tentativas. Tente novamente em '+fmtDur(l)+'.'; $('#liMsg').dataset.lock='1'; };
  if(btn) btn.disabled=true; if(su) su.disabled=true; paint(left);
  lgTimer=setInterval(()=>{ const l=lgLockedFor(email); if(l<=0){ clearInterval(lgTimer); lgTimer=null; if(btn) btn.disabled=false; if(su) su.disabled=false; $('#liMsg').textContent=''; delete $('#liMsg').dataset.lock; } else paint(l); },1000);
  return true;
}
// mensagens genéricas — não revelam se a conta existe (anti-enumeração)
function loginErrMsg(m){
  m=(m||'').toLowerCase();
  if(m.includes('not confirmed')) return 'Confirme seu e-mail antes de entrar (veja sua caixa de entrada).';
  if(m.includes('rate')||m.includes('too many')) return '🔒 Muitas tentativas no servidor. Aguarde um instante e tente de novo.';
  return 'E-mail ou senha inválidos.';
}

// ======================= AUTH =======================
async function initAuth(){
  const { data:{ session } } = await sb.auth.getSession();
  if(session){ await onLogin(session); } else { $('#login').classList.remove('hide'); lgApplyLock($('#liEmail').value.trim()); }
}
$('#btnLogin').onclick = async ()=>{
  const email=$('#liEmail').value.trim(), password=$('#liPass').value;
  if(!email||!password){ $('#liMsg').textContent='Preencha e-mail e senha.'; return; }
  if(lgApplyLock(email)) return;                 // bloqueado por tentativas anteriores
  const btn=$('#btnLogin'); btn.disabled=true; $('#liMsg').textContent='Entrando…';
  let res;
  try{ res = await sb.auth.signInWithPassword({ email, password }); }
  catch(e){ res = { error:{ message:String((e&&e.message)||e) } }; }
  const { data, error } = res;
  if(error){
    lgRecordFail(email);
    if(!lgApplyLock(email)){                      // ainda não atingiu o limite → mensagem genérica
      btn.disabled=false;
      $('#liMsg').textContent = loginErrMsg(error.message);
    }
    return;
  }
  lgRecordSuccess(email);
  await onLogin(data.session);
  btn.disabled=false;
};
// Enter no campo de senha envia o login
$('#liPass').addEventListener('keydown', e=>{ if(e.key==='Enter' && !$('#btnLogin').disabled) $('#btnLogin').click(); });
// ao trocar de conta, reavalia o bloqueio para a conta digitada
$('#liEmail').addEventListener('input', ()=> lgApplyLock($('#liEmail').value.trim()));
// Encerra somente este computador; outros caixas com o mesmo login continuam ativos.
$('#btnLogout').onclick = async ()=>{ await sb.auth.signOut({scope:'local'}); location.reload(); };

/* qualquer pessoa logada troca a PRÓPRIA senha (client-side, sem edge function) */
{ const mp=$('#btnMyPass'); if(mp) mp.onclick = ()=>openMyPassword(); }
window.openMyPassword = ()=>{
  modal('<div class="m-head"><h3>Trocar a minha senha</h3><button data-modal-close>✕</button></div>'
    +'<div class="m-body">'
      +'<div class="field"><label class="lbl">Nova senha (mín. 6)</label><input id="mpNew" class="in" type="password" autocomplete="new-password"></div>'
      +'<div class="field"><label class="lbl">Repita a nova senha</label><input id="mpNew2" class="in" type="password" autocomplete="new-password"></div>'
    +'</div>'
    +'<div class="m-foot"><button class="btn ghost" data-modal-close>Cancelar</button>'
      +'<button class="btn" id="mpGo" data-onclick="openMyPasswordGo()">Salvar</button></div>');
  setTimeout(()=>{ const i=$('#mpNew'); if(i) i.focus(); }, 50);
};
window.openMyPasswordGo = async ()=>{
  const a=(($('#mpNew')||{}).value||''), b2=(($('#mpNew2')||{}).value||'');
  if(a.length<6){ toast('A senha precisa ter pelo menos 6 caracteres.',true); return; }
  if(a!==b2){ toast('As senhas não conferem.',true); return; }
  const b=$('#mpGo'); if(b){ b.disabled=true; b.textContent='Salvando…'; }
  const { error } = await sb.auth.updateUser({ password:a });
  if(error){ toast('Erro: '+(error.message||'não foi possível trocar a senha'),true); if(b){ b.disabled=false; b.textContent='Salvar'; } return; }
  closeModal(); toast('Sua senha foi atualizada ✓');
};

async function onLogin(session){
  // Busca o perfil do usuário; offline, cai no último perfil salvo (semeado num login online).
  let me=null, meError=null;
  try{
    const r = await sb.from('app_users').select('*').eq('id', session.user.id).maybeSingle();
    if(r.error) throw r.error;
    me = r.data;
    if(me) refCachePut('me:'+session.user.id, me, true);   // semeia o cache p/ próximos boots offline
  }catch(e){
    if(isNetworkErr(e)){ me = await refCacheGet('me:'+session.user.id); meError = me?null:e; }
    else meError = e;
  }
  const validRole=me && ['admin','operador','motoboy'].includes(me.papel);
  if(meError || !me || !validRole || me.ativo===false || (me.papel!=='admin' && !me.store_id)){
    // Offline sem perfil salvo: não expulsa o operador (a rede pode ter caído) — só orienta.
    // Online (ou conta comprovadamente inválida): mantém o bloqueio de acesso de sempre.
    if(!navigator.onLine && !me){
      $('#app').classList.add('hide'); $('#login').classList.remove('hide');
      $('#liMsg').textContent='Sem internet e sem dados salvos deste usuário. Conecte-se uma vez para liberar o modo offline.';
      ME=null; return;
    }
    await sb.auth.signOut({scope:'local'});
    $('#app').classList.add('hide'); $('#login').classList.remove('hide');
    $('#liMsg').textContent='Conta sem acesso ativo ao ONPDV. Fale com o administrador.';
    ME=null; return;
  }
  $('#login').classList.add('hide');
  $('#app').classList.remove('hide');
  ME = me;
  ME.permissoes = me.permissoes || {};
  ME.name=ME.nome; ME.is_admin=(ME.papel==='admin'); ME.is_cashier=(ME.papel==='admin'||ME.papel==='operador');
  $('#whoName').innerHTML = `<b>${esc(ME.nome)}</b> · ${esc(ME.papel)}`;
  // Isolamento por usuário: se o cache pertence a OUTRO operador, limpa o cache de
  // referência (não as filas — não podemos perder venda não sincronizada) antes de recarregar.
  try{
    const prevOwner=await refCacheGet('cache_owner');
    if(prevOwner && prevOwner!==session.user.id) await refCacheClearRefs();
    refCachePut('cache_owner', session.user.id, true);
  }catch(e){}
  await loadStores();
  // Carregadores tolerantes a offline: cada um cai no cache se a rede falhar. allSettled
  // garante que um dataset que falhe (ex.: RPC de admin) não derrube o boot do caixa.
  await Promise.allSettled([loadProducts(), loadCustomers(), loadTerminals(), loadCompany(), loadSuppliers(), loadFreteRules(), loadCashbackActive(), loadPromos(), loadEdgeCapabilities(['pdv-customer-express'])]);
  if(navigator.onLine) markRefSynced();   // registra a idade do snapshot online
  buildPdvCatalog();
  const d=new Date(); d.setDate(d.getDate()+30);
  const cv=$('#credVenc'); if(cv) cv.value = d.toISOString().slice(0,10);
  const hoje=new Date().toISOString().slice(0,10);
  $('#repIni').value=hoje; $('#repFim').value=hoje;
  try{ await refreshCash(); }catch(e){}   // offline: caixa/gaveta seguem sem travar o login
  try{ loadDash(); }catch(e){}
  applyRoleUI();
  if(ME && ME.papel==='motoboy'){ showMoto(); }
  else if(ME && ME.papel==='admin'){ openBoPage('home'); startPickupPoll(); }
  else { enterPdv(); startPickupPoll(); }
  pushRefreshIfEnabled();   // revalida a inscrição de push deste dispositivo (não bloqueia o login)
  checkForUpdate();         // avisa se há versão nova publicada (não bloqueia o login)
}

// ======================= NAV / BACKOFFICE =======================
const PAGE_TITLES={ home:'Início', decisao:'Central de Decisão', importexcel:'Importação inteligente', financeiroint:'Financeiro inteligente', estoqueint:'Estoque inteligente',
  sortimento:'Gestão de sortimento', contagemex:'Contagem por exceção', granelint:'Granel inteligente', credint:'Crediário inteligente', cashbackint:'Cashback inteligente',
  simuladores:'Simuladores', assistente:'Assistente de gestão', pedidos:'Pedidos', entregas:'Entregas', clientes:'Clientes', vales:'Vale-presente', estoque:'Estoque',
  estoquecrm:'CRM inteligente · Estoque', validade:'Validade de lotes', inventario:'Inventário rotativo', nfimport:'NF-e importadas', encalhados:'Produtos encalhados', pedidoint:'Pedido inteligente', crediario:'Contas a receber',
  crediariocrm:'CRM inteligente · Contas a receber', pagar:'Contas a pagar', pagarcrm:'CRM inteligente · Contas a pagar', transfer:'Transferências', gaveta:'Caixa',
  relatorio:'Relatório', concilmp:'Conciliação Mercado Pago', auditoria:'Auditoria', nps:'NPS · Satisfação', churn:'Clientes em risco', precos:'Preços por margem-alvo', promocoes:'Promoções', operacoes:'Operações 360', prevencao:'Prevenção de perdas', config:'Configurações',
  cmpPainel:'Compras · Painel', cmpLista:'Compras · Lista', cmpListaIconha:'Compras · Lista Iconha', cmpListaReta:'Compras · Lista Reta', cmpCatalogo:'Compras · Catálogo', cmpPedido:'Compras · Montar pedido', cmpAprovacao:'Compras · Aprovação', cmpRecebimento:'Compras · Recebimento', cmpConcluido:'Compras · Pedidos concluídos', cmpFinanceiro:'Compras · Financeiro', cmpFornecedores:'Compras · Fornecedores', cmpCotacoes:'Compras · Cotações', cmpHistorico:'Compras · Histórico de preço', cmpAlertas:'Compras · Alertas', cmpAuditoria:'Compras · Auditoria' };
const BO_PAGE_BUTTONS='.bo-nav [data-page]';
$$(BO_PAGE_BUTTONS).forEach(b=> b.addEventListener('click',()=>openBoPage(b.dataset.page)));
function setBoMenu(open){document.body.classList.toggle('bo-menu-open',!!open);const b=$('#boMenuToggle');if(b)b.setAttribute('aria-expanded',String(!!open));}
$$('.bo-group-toggle').forEach(toggle=>toggle.addEventListener('click',()=>{
  const group=toggle.closest('.bo-nav-group'),open=!group.classList.contains('open');
  group.classList.toggle('open',open);toggle.setAttribute('aria-expanded',String(open));
}));
{const open=$('#boMenuToggle'),close=$('#boSideClose'),scrim=$('#boSidebarScrim');if(open)open.addEventListener('click',()=>setBoMenu(true));if(close)close.addEventListener('click',()=>setBoMenu(false));if(scrim)scrim.addEventListener('click',()=>setBoMenu(false));}
/* ---------- permissões por operador ---------- */
const PERM_PAGES=[
  ['home','🏠 Início / painel'],['decisao','🧭 Central de Decisão'],['importexcel','📥 Importação inteligente'],['financeiroint','📈 Financeiro inteligente'],
  ['estoqueint','📦 Estoque inteligente'],['sortimento','🧩 Sortimento'],['contagemex','🎯 Contagem por exceção'],['granelint','⚖️ Granel inteligente'],
  ['credint','🧾 Crediário inteligente'],['cashbackint','🎁 Cashback inteligente'],['simuladores','🧮 Simuladores'],['assistente','🤖 Assistente de gestão'],
  ['pedidos','📋 Pedidos'],['entregas','🚚 Entregas'],
  ['clientes','👤 Clientes'],['vales','🎁 Vale-presente'],['estoque','📦 Estoque'],['encalhados','📦 Produtos encalhados'],['pedidoint','🧠 Pedido inteligente'],
  ['crediario','🧾 Contas a receber'],['pagar','💸 Contas a pagar'],['transfer','🔄 Transferências'],
  ['gaveta','💰 Caixa (gaveta)'],['relatorio','📊 Relatório'],['concilmp','💳 Conciliação MP'],['auditoria','🔎 Auditoria'],['nps','⭐ NPS'],['churn','📉 Clientes em risco'],['precos','🏷️ Preços por margem'],['promocoes','🎯 Promoções'],['operacoes','🛡️ Operações 360'],['prevencao','🚨 Prevenção de perdas'],['compras','🛒 Compras'],['config','⚙️ Configurações']];
const PERM_PDV=[
  ['pdv_desconto','F5 · Desconto no item'],['pdv_cancelar','F6 · Cancelar venda'],
  ['pdv_suprimento','F9 · Suprimento'],['pdv_sangria','F10 · Sangria'],
  ['pdv_entrega','Ctrl+E · Enviar entrega'],['pdv_fechar','F12 · Fechar caixa'],
  ['pdv_leiturax','Ctrl+L · Leitura X'],
  ['pdv_vendas','🧾 Últimas vendas'],['pdv_crediario','🧾 Crediário (receber)'],
  ['pdv_fila','🚚 Fila de entrega']];
// operadores antigos (permissoes = {}) continuam com o acesso que já tinham
const PERM_DEFAULT={ page_gaveta:true, pdv_desconto:true, pdv_cancelar:true, pdv_suprimento:true,
  pdv_sangria:true, pdv_entrega:true, pdv_fechar:true, pdv_leiturax:true,
  pdv_vendas:true, pdv_crediario:true, pdv_fila:true };
function myPerms(){
  if(!ME) return {};
  const p=ME.permissoes;
  return (p && typeof p==='object' && Object.keys(p).length) ? p : PERM_DEFAULT;
}
function can(k){ return isAdmin() ? true : !!myPerms()[k]; }
const SUBPAGE_PARENT={ estoquecrm:'estoque', validade:'estoque', inventario:'estoque', nfimport:'estoque', encalhados:'estoque', crediariocrm:'crediario', pagarcrm:'pagar',
  cmpPainel:'compras', cmpLista:'compras', cmpListaIconha:'compras', cmpListaReta:'compras', cmpCatalogo:'compras', cmpPedido:'compras', cmpAprovacao:'compras', cmpRecebimento:'compras', cmpConcluido:'compras', cmpFinanceiro:'compras', cmpFornecedores:'compras', cmpCotacoes:'compras', cmpHistorico:'compras', cmpAlertas:'compras', cmpAuditoria:'compras' };
function canPage(pg){ const base=SUBPAGE_PARENT[pg]||pg; return base==='caixa' ? isCashier() : can('page_'+base); }
window.can=can; window.canPage=canPage;
function isAdmin(){ return !!(ME && ME.papel==='admin'); }
function applyRoleUI(){
  const adm=isAdmin();
  $$(BO_PAGE_BUTTONS).forEach(b=> b.classList.toggle('hide', !canPage(b.dataset.page)));
  $$('.bo-nav-group').forEach(group=>group.classList.toggle('hide',!group.querySelector('[data-page]:not(.hide)')));
  const hoje=$('.fc-status-r button[data-act="relatorio"]'); if(hoje) hoje.classList.toggle('hide', !adm);
  const ss=$('#storeSel'); if(ss) ss.disabled = !adm;   // operador travado na própria loja
}
function openBoPage(pg){
  if(!canPage(pg)){                                  // respeita as permissões do operador
    if(canPage('gaveta')) pg='gaveta';
    else if(isCashier()){ toast('Você não tem acesso à retaguarda.'); enterPdv(); return; }
    else pg='gaveta';
  }
  currentPage=pg;
  $('#app').classList.remove('pdv-mode');
  document.body.classList.remove('pdv-mode');
  $$(BO_PAGE_BUTTONS).forEach(x=>{
    x.classList.toggle('act', x.dataset.page===pg);
    x.classList.toggle('parent-act', SUBPAGE_PARENT[pg]===x.dataset.page);
  });
  const activeNav=$(`.bo-nav [data-page="${pg}"]`);if(activeNav){const group=activeNav.closest('.bo-nav-group');if(group){group.classList.add('open');const toggle=group.querySelector('.bo-group-toggle');if(toggle)toggle.setAttribute('aria-expanded','true');}}
  setBoMenu(false);
  $$('.page').forEach(p=>p.classList.remove('act'));
  const el=$('#page-'+pg); if(el) el.classList.add('act');
  const t=$('#boTitle'); if(t) t.textContent=PAGE_TITLES[pg]||'';
  if(pg==='home') loadHome();
  if(pg==='decisao') loadDecisionCenter();
  if(pg==='importexcel') renderImportExcel();
  if(pg==='financeiroint') renderFinanceiroInt();
  if(pg==='estoqueint') renderEstoqueInt();
  if(pg==='sortimento') renderSortimento();
  if(pg==='contagemex') renderContagemEx();
  if(pg==='granelint') renderGranelInt();
  if(pg==='credint') renderCredInt();
  if(pg==='cashbackint') renderCashbackInt();
  if(pg==='simuladores') renderSimuladores();
  if(pg==='assistente') renderAssistente();
  if(pg==='clientes') renderCustomers();
  if(pg==='vales') renderVales();
  if(pg==='concilmp') renderConcilMp();
  if(pg==='auditoria') renderAudit();
  if(pg==='nps') renderNps();
  if(pg==='churn') renderChurn();
  if(pg==='precos') renderPrecos();
  if(pg==='promocoes') renderPromos();
  if(pg==='estoque') renderProducts();
  if(pg==='estoquecrm') renderStockCrm();
  if(pg==='validade') renderLotExpiry();
  if(pg==='inventario') renderInventario();
  if(pg==='nfimport') renderNfeImports();
  if(pg==='encalhados') loadStaleStock();
  if(pg==='pedidoint') initSmartOrder();
  if(pg==='crediario') loadCrediario();
  if(pg==='crediariocrm') renderCrmRecv();
  if(pg==='relatorio'){ loadDash(); loadReport(); }
  if(pg==='pedidos') loadOrders();
  if(pg==='entregas'){ loadDeliveries(); trkStart(); }
  if(pg==='pagar') loadPayables();
  if(pg==='pagarcrm') renderCrmPay();
  if(pg==='transfer') loadTransfers();
  if(pg==='gaveta'){ refreshCash(true); loadCashHistory(); }
  if(pg==='operacoes') loadOpsCenter();
  if(pg==='prevencao') loadLossPrevention();
  if(pg==='config'){ renderPdvTerminalsConfig(); renderTerminals(); renderStores(); renderUsers(); loadCashbackConfigCard(); renderPushCard(); }
  if(pg.startsWith('cmp') && window.CMP_PAGES && window.CMP_PAGES[pg]) window.CMP_PAGES[pg]();
}
function enterPdv(){
  currentPage='caixa';
  $('#app').classList.add('pdv-mode');
  document.body.classList.add('pdv-mode');
  $$('.page').forEach(p=>p.classList.remove('act'));
  $('#page-caixa').classList.add('act');
  buildPdvCatalog();
  loadCaixa();
  updateOfflineBadge(); flushOffline();
}
function exitPdv(){ currentPage=''; document.body.classList.remove('pdv-mode'); if(typeof pdvStopPickupUpdates==='function')pdvStopPickupUpdates(); openBoPage(isAdmin()?'home':'gaveta'); }
$('#btnEnterPdv').onclick = ()=> enterPdv();
{ const b2=$('#btnEnterPdv2'); if(b2) b2.onclick = ()=> enterPdv(); }
let pickupTimer=null, PENDING_PICKUPS=0;
async function checkPickups(){
  if(!CURRENT_STORE) return;
  const { data } = await sb.rpc('erp_pending_pickups',{ p_store:CURRENT_STORE });
  PENDING_PICKUPS = +data||0;
  const btn=$('#fcDeliv'); if(btn) btn.classList.toggle('blink', PENDING_PICKUPS>0);
  const cnt=$('#fcDelivCount'); if(cnt){ cnt.textContent=PENDING_PICKUPS; cnt.classList.toggle('hide', PENDING_PICKUPS<=0); }
  const nav=$('.bo-nav button[data-page="entregas"]'); if(nav) nav.classList.toggle('blink', PENDING_PICKUPS>0);
}
function startPickupPoll(){ clearInterval(pickupTimer); checkPickups(); pickupTimer=setInterval(checkPickups, 15000); }
// ======================= DATA LOADERS =======================
async function loadProducts(){
  const key='products:'+(CURRENT_STORE||'all');   // cache por loja: estoques não se misturam
  const { data } = await refetch(key, async ()=>{
    if(CURRENT_STORE){
      const r=await sb.rpc('erp_products',{ p_store: CURRENT_STORE }); if(r.error) throw r.error;
      return r.data||[];
    }
    const r=await sb.from('products').select('*').eq('ativo',true).order('nome'); if(r.error) throw r.error;
    return (r.data||[]).map(p=>({ ...p, estoque:0 }));
  });
  PRODUCTS = data||[];
}
async function loadCustomers(){
  const { data } = await refetch('customers', async ()=>{
    const r = await sb.from('customers').select('*').eq('ativo',true).order('nome'); if(r.error) throw r.error;
    return r.data||[];
  });
  CUSTOMERS = data||[];
}
async function loadSuppliers(){
  const { data } = await refetch('suppliers', async ()=>{
    const r = await sb.from('suppliers').select('id,nome').eq('ativo',true).order('nome'); if(r.error) throw r.error;
    return r.data||[];
  });
  SUPPLIERS = data||[];
}
async function loadTerminals(){
  const { data:_t } = await refetch('terminals', async ()=>{
    const r = await sb.from('pos_terminals').select('*').eq('ativo',true).eq('finalidade','pagamento').eq('provedor','mercadopago').order('nome'); if(r.error) throw r.error;
    return r.data||[];
  }, true);
  const data=_t;
  TERMINALS = data||[];
  const sel = $('#posTerm');
  if(sel) sel.innerHTML = TERMINALS.length
    ? TERMINALS.map(t=>`<option value="${t.id}">${esc(t.nome)}</option>`).join('')
    : '<option value="">— cadastre em Config —</option>';
}
async function loadStores(){
  const { data } = await refetch('stores', async ()=>{
    const r = await sb.from('stores').select('*').eq('ativo',true).order('nome'); if(r.error) throw r.error;
    return r.data||[];
  }, true);
  STORES = data||[];
  if(!CURRENT_STORE && STORES.length) CURRENT_STORE = (ME && ME.store_id) || STORES[0].id;
  const sel=$('#storeSel');
  if(sel){
    sel.innerHTML = STORES.map(s=>`<option value="${s.id}">${esc(s.nome)}${s.is_matriz?' ★':''}</option>`).join('');
    if(CURRENT_STORE) sel.value = CURRENT_STORE;
  }
  const dest=$('#trDest');
  if(dest) dest.innerHTML = STORES.filter(s=>!s.is_matriz).map(s=>`<option value="${s.id}">${esc(s.nome)}</option>`).join('');
  startPortalPaymentsWatch();
}
// ===== Aviso no PDV: cliente pagou uma conta pelo portal (Realtime) =====
let PORTAL_PAY_CHAN=null;
function startPortalPaymentsWatch(){
  try{ if(PORTAL_PAY_CHAN){ sb.removeChannel(PORTAL_PAY_CHAN); PORTAL_PAY_CHAN=null; } }catch(_){}
  if(!CURRENT_STORE) return;
  PORTAL_PAY_CHAN = sb.channel('store-notices-'+CURRENT_STORE)
    .on('postgres_changes',{ event:'INSERT', schema:'public', table:'store_notices', filter:`store_id=eq.${CURRENT_STORE}` },
      p=> onStoreNotice(p.new))
    .subscribe();
}
function onStoreNotice(n){
  if(!n || n.kind!=='portal_payment') return;
  const amt = n.amount!=null ? ' · '+BRL(n.amount) : '';
  toast('🔔 '+(n.body||'Pagamento pelo portal')+amt);
  try{ if(typeof refreshCash==='function') refreshCash(); }catch(_){}
  try{ if(currentPage==='caixa'&&typeof renderCaixa==='function') renderCaixa(); }catch(_){}
  try{ if(currentPage==='home'&&typeof loadDash==='function') loadDash(); }catch(_){}
}
$('#storeSel').onchange = async ()=>{
  CURRENT_STORE = $('#storeSel').value;
  await loadProducts(); buildPdvCatalog(); if(currentPage==='caixa'&&typeof renderCaixa==='function')renderCaixa();
  const act=$('.bo-nav button.act'); if(act && !$('#app').classList.contains('pdv-mode')) act.click();
  if(typeof checkPickups==='function') checkPickups();
  startPortalPaymentsWatch();
};

// ======================= ROBUSTEZ OFFLINE =======================
// ============ FILA OFFLINE (IndexedDB + espelho localStorage) ============
// Vendas feitas sem internet ficam nesta fila e sincronizam ao reconectar.
// Store principal: IndexedDB (capacidade grande, assíncrono, não bloqueia a thread).
// localStorage é mantido como ESPELHO SÍNCRONO (durabilidade imediata no instante da
// venda) e como FALLBACK se o IDB não abrir. A UI lê de OFFLINE_MEM (cache em memória),
// então tudo que era síncrono continua síncrono. Idempotência garantida por client_id.
const OFFLINE_KEY='onpdv_offline_queue';
const IDB_NAME='onpdv', IDB_STORE='offline_sales', REF_STORE='ref_cache';
let OFFLINE_MEM=[];   // cache em memória — fonte síncrona para a UI
let _idb=null;        // handle do IndexedDB (null → usa só localStorage)

function _lsRead(){ try{ return JSON.parse(localStorage.getItem(OFFLINE_KEY)||'[]'); }catch(e){ return []; } }
function _lsWrite(q){ try{ localStorage.setItem(OFFLINE_KEY, JSON.stringify(q)); }catch(e){ if(window.logErr) logErr('offline-ls', e); } }
function _idbOpen(){ return new Promise(res=>{ try{
  if(!('indexedDB' in window)) return res(null);
  const rq=indexedDB.open(IDB_NAME,2);   // v2: além da fila de vendas, guarda o CACHE DE REFERÊNCIA (produtos/clientes/config)
  rq.onupgradeneeded=()=>{ const db=rq.result;
    if(!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE,{keyPath:'client_id'});
    if(!db.objectStoreNames.contains(REF_STORE)) db.createObjectStore(REF_STORE,{keyPath:'k'}); };
  rq.onsuccess=()=>res(rq.result); rq.onerror=()=>res(null);
}catch(e){ res(null); } }); }
function _idbAll(){ return new Promise(res=>{ if(!_idb) return res([]); try{ const r=_idb.transaction(IDB_STORE,'readonly').objectStore(IDB_STORE).getAll(); r.onsuccess=()=>res(r.result||[]); r.onerror=()=>res([]); }catch(e){ res([]); } }); }
function _idbPut(item){ return new Promise(res=>{ if(!_idb) return res(false); try{ const t=_idb.transaction(IDB_STORE,'readwrite'); t.objectStore(IDB_STORE).put(item); t.oncomplete=()=>res(true); t.onerror=()=>res(false); }catch(e){ res(false); } }); }
function _idbDel(id){ return new Promise(res=>{ if(!_idb) return res(false); try{ const t=_idb.transaction(IDB_STORE,'readwrite'); t.objectStore(IDB_STORE).delete(id); t.oncomplete=()=>res(true); t.onerror=()=>res(false); }catch(e){ res(false); } }); }

async function offlineInit(){
  _idb = await _idbOpen();
  // une IDB + localStorage (migra o formato antigo automaticamente), dedup por client_id
  const map=new Map();
  for(const it of await _idbAll()) if(it&&it.client_id) map.set(it.client_id, it);
  for(const it of _lsRead()){
    const it2=(it&&it.client_id)?it:Object.assign({client_id:(window.crypto&&crypto.randomUUID?crypto.randomUUID():uid())}, it);
    if(!map.has(it2.client_id)){ map.set(it2.client_id, it2); if(_idb) _idbPut(it2); }  // sobe pro IDB
  }
  OFFLINE_MEM=[...map.values()];
  _lsWrite(OFFLINE_MEM);               // espelho consistente
  updateOfflineBadge();
  if(navigator.onLine && OFFLINE_MEM.length && window.ME) flushOffline();  // só depois de logado
}
function enqueueSale(item){
  if(!item.client_id) item.client_id=(window.crypto&&crypto.randomUUID?crypto.randomUUID():uid());
  OFFLINE_MEM.push(item);
  _lsWrite(OFFLINE_MEM);   // durabilidade síncrona imediata (não pode perder a venda)
  if(_idb) _idbPut(item);  // persistência escalável em IDB
  updateOfflineBadge();
}
function _offlineRemove(id){ OFFLINE_MEM=OFFLINE_MEM.filter(x=>x.client_id!==id); _lsWrite(OFFLINE_MEM); if(_idb) _idbDel(id); }
function _offlineSetErr(id,msg){ const it=OFFLINE_MEM.find(x=>x.client_id===id); if(it){ it.err=msg; _lsWrite(OFFLINE_MEM); if(_idb) _idbPut(it); } }
function isNetworkErr(e){ if(!navigator.onLine) return true; const m=((e&&e.message)||String(e||'')).toLowerCase();
  return /fetch|network|failed to|load failed|timeout|timed out|econn|offline/.test(m); }
// Erro de autenticação (JWT expirado numa queda longa) — NÃO é erro de dados: dá para
// renovar a sessão e re-tentar, em vez de marcar a venda como "com erro" indevidamente.
function isAuthErr(e){ if(!e) return false;
  const m=((e.message||e.error_description||e.msg||'')+'').toLowerCase();
  const c=String((e.code!=null?e.code:e.status)||'');
  return c==='401' || c==='PGRST301' || /jwt|token (has )?expired|not authenticated|unauthorized|invalid (jwt|token|claim)/.test(m); }
function updateOfflineBadge(){
  const el=$('#offlineBadge'); if(!el) return;
  let nOps=0; try{ nOps=_opsRead().length; }catch(e){}
  const n=OFFLINE_MEM.length, online=navigator.onLine, tot=n+nOps;
  // 3 estados: online e em dia (verde) · online com fila pendente (âmbar) · offline (vermelho)
  el.classList.toggle('online', online && tot===0);
  el.classList.toggle('pending', online && tot>0);
  el.classList.toggle('off', !online);
  const fila = n>0 ? (n+' venda(s)'+(nOps>0?' + '+nOps+' op.':'')) : (nOps>0? nOps+' op.' : '');
  el.innerHTML = (online?'● Online':'● Offline') + (fila?' · '+fila+' na fila':'');
  const age = (!online && REF_SYNCED_AT)
    ? (' · dados de '+new Date(REF_SYNCED_AT).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})) : '';
  el.title = (online
    ? (tot>0?('Conectado · '+fila+' aguardando sincronizar (clique para sincronizar agora)'):'Conectado e sincronizado')
    : ('Sem internet · vendendo offline'+(fila?(' · '+fila+' salvas para sincronizar'):''))) + age;
}
let _authRefreshing=false;
async function _refreshAuthOnce(){ if(_authRefreshing) return; _authRefreshing=true;
  try{ await sb.auth.refreshSession(); }catch(_){} finally{ setTimeout(()=>{_authRefreshing=false;}, 3000); } }
// Ao reconectar com vendas na fila e apenas uma sessão PROVISÓRIA (aberta offline), abre a
// sessão de gaveta REAL do terminal para que as vendas sincronizadas entrem na Leitura X /
// fechamento daquele caixa. Se falhar, as vendas ainda sincronizam (só sem gaveta, como antes).
async function pdvReconcileOfflineSession(){
  if(!navigator.onLine) return;
  if(!OFFLINE_MEM.length) return;
  if(PDV.ses && !PDV.ses.offline) return;   // já há sessão real
  const term=(PDV.ses&&PDV.ses.terminal)||PDV.terminal||(typeof pdvTerm==='function'?pdvTerm():'CAIXA-1');
  const opening=(PDV.ses&&+PDV.ses.opening)||0;
  try{
    const cur=await sb.rpc('pdv_current_session',{p_terminal:term});
    if(!cur.error && cur.data && cur.data.status==='aberto'){ PDV.ses=cur.data; }
    else{ const op=await sb.rpc('pdv_open_session',{p_terminal:term,p_opening:opening});
      if(!op.error && op.data){ PDV.ses=op.data; } }
    if(PDV.ses && !PDV.ses.offline){
      refCachePut('pdv_session:'+term, PDV.ses, true);
      if(currentPage==='caixa' && typeof renderCaixa==='function') renderCaixa();
    }
  }catch(e){ /* mantém provisória; vendas sincronizam mesmo assim */ }
}
async function flushOffline(){
  if(!navigator.onLine) return;
  await pdvReconcileOfflineSession();   // garante uma sessão de gaveta real p/ as vendas offline caírem certo
  const q=OFFLINE_MEM.slice(); if(!q.length) return;
  let sync=0, sawAuth=false;
  for(const item of q){
    try{
      const { error } = await sb.rpc('pdv_sync_offline_sale', { p_device_sale_id:item.client_id, p_payload:item.payload });
      if(error){
        if(isNetworkErr(error)){ /* rede: mantém p/ próxima tentativa */ }
        else if(isAuthErr(error)){ sawAuth=true; await _refreshAuthOnce(); /* mantém p/ re-tentar */ }
        else { _offlineSetErr(item.client_id, error.message); }
      }
      else { _offlineRemove(item.client_id); sync++; }
    }catch(e){ if(isAuthErr(e)){ sawAuth=true; await _refreshAuthOnce(); } /* rede/auth: mantém */ }
  }
  if(sawAuth) setTimeout(()=>{ if(navigator.onLine && OFFLINE_MEM.length) flushOffline(); }, 1800);  // re-tenta após renovar a sessão
  if(sync>0){ toast(sync+' venda(s) offline sincronizada(s) ✅'); try{ await loadProducts(); buildPdvCatalog(); refreshCash(); loadDash(); if(currentPage==='caixa'&&typeof renderCaixa==='function')renderCaixa(); }catch(e){} }
  const withErr=OFFLINE_MEM.filter(x=>x.err).length;
  if(withErr>0) toast(withErr+' venda(s) offline precisam de atenção (erro ao sincronizar).', true);
  flushOps();   // ao reconectar, sincroniza também clientes/movimentações pendentes
}
window.addEventListener('online', ()=>{ updateOfflineBadge(); flushOffline(); });
window.addEventListener('offline', updateOfflineBadge);
setInterval(()=>{ if(navigator.onLine && OFFLINE_MEM.length) flushOffline(); }, 20000);
const OFFLINE_READY = offlineInit();   // promessa: resolve quando o IDB abriu e a fila foi carregada

// ============ CACHE OFFLINE DE REFERÊNCIA (produtos, clientes, config, sessão…) ============
// Guarda o ÚLTIMO snapshot online de cada dataset para o caixa ABRIR e VENDER offline.
// Primário: IndexedDB (store ref_cache) — cabe catálogo/clientes grandes. Espelho opcional:
// localStorage (só chaves pequenas e críticas: usuário, lojas, empresa) para boot resiliente
// mesmo se o IDB demorar. Chaves incluem a loja atual para não misturar estoques entre lojas.
const REF_LS_PREFIX='onpdv_ref_';
function _refLsGet(k){ try{ const v=localStorage.getItem(REF_LS_PREFIX+k); return v?JSON.parse(v):undefined; }catch(e){ return undefined; } }
function _refLsPut(k,v){ try{ localStorage.setItem(REF_LS_PREFIX+k, JSON.stringify(v)); }catch(e){ /* cota estourou: o IDB cobre datasets grandes */ } }
async function refCacheGet(k){ await OFFLINE_READY;
  if(!_idb) return _refLsGet(k);
  return new Promise(res=>{ try{ const r=_idb.transaction(REF_STORE,'readonly').objectStore(REF_STORE).get(k);
    r.onsuccess=()=>res(r.result?r.result.v:_refLsGet(k)); r.onerror=()=>res(_refLsGet(k)); }
    catch(e){ res(_refLsGet(k)); } }); }
async function refCachePut(k,v,mirror){ await OFFLINE_READY;
  if(mirror) _refLsPut(k,v);   // só datasets pequenos pedem espelho síncrono
  if(!_idb) return false;
  return new Promise(res=>{ try{ const t=_idb.transaction(REF_STORE,'readwrite'); t.objectStore(REF_STORE).put({k,v,at:Date.now()});
    t.oncomplete=()=>res(true); t.onerror=()=>res(false); }catch(e){ res(false); } }); }
// Executa o carregador ONLINE; grava no cache em caso de sucesso; se cair a REDE, restaura do
// cache; qualquer outro erro (permissão, dado inválido) é propagado como antes.
async function refetch(key, fetcher, mirror){
  try{ const data = await fetcher();
    if(data!==undefined && data!==null){ refCachePut(key, data, mirror); }
    return { data, cached:false };
  }catch(e){
    if(isNetworkErr(e)){ const c = await refCacheGet(key); if(c!==undefined) return { data:c, cached:true }; }
    throw e;
  }
}
// Idade do último snapshot online (mostrada na pílula quando offline).
let REF_SYNCED_AT=0;
function markRefSynced(){ REF_SYNCED_AT=Date.now(); refCachePut('ref_synced_at', REF_SYNCED_AT, true); updateOfflineBadge(); }
refCacheGet('ref_synced_at').then(v=>{ if(v){ REF_SYNCED_AT=+v||0; updateOfflineBadge(); } }).catch(()=>{});
// Limpa só o CACHE DE REFERÊNCIA (produtos/clientes/config) — NÃO mexe nas filas de venda/
// operações (não podemos perder o que ainda não sincronizou). Usado ao trocar de usuário.
async function refCacheClearRefs(){ await OFFLINE_READY;
  try{ Object.keys(localStorage).forEach(k=>{ if(k.indexOf(REF_LS_PREFIX)===0) localStorage.removeItem(k); }); }catch(e){}
  if(_idb){ try{ _idb.transaction([REF_STORE],'readwrite').objectStore(REF_STORE).clear(); }catch(e){} }
}
// Revalida o catálogo/promoções/clientes em 2º plano quando online e ocioso, para o cache
// não envelhecer numa queda longa. Não roda durante uma venda em andamento.
setInterval(async ()=>{
  if(!navigator.onLine || !window.ME) return;
  if(typeof currentPage!=='undefined' && currentPage!=='caixa') return;
  if(typeof PDV!=='undefined' && PDV.items && PDV.items.length) return;
  try{ await Promise.allSettled([loadProducts(), loadPromos(), loadCustomers()]);
    if(typeof buildPdvCatalog==='function') buildPdvCatalog(); markRefSynced(); }catch(e){}
}, 8*60*1000);
// ============ FILA OFFLINE DE OPERAÇÕES (sangria/suprimento e cadastro de cliente) ============
// Diferente da fila de vendas (crítica, em IDB), estas operações são poucas e vão em
// localStorage. Idempotência por client_id (o servidor deduplica por client_uuid).
// Ordem de sync: CLIENTES antes das VENDAS (a venda referencia o cliente por client_id).
const OPS_KEY='onpdv_offline_ops';
function _opsRead(){ try{ const q=JSON.parse(localStorage.getItem(OPS_KEY)||'[]'); return Array.isArray(q)?q:[]; }catch(e){ return []; } }
function _opsWrite(q){ try{ localStorage.setItem(OPS_KEY, JSON.stringify(q)); }catch(e){ if(window.logErr) logErr('offline-ops-ls', e); } }
function _opsCount(){ return _opsRead().length; }
function enqueueOp(op){
  if(!op.client_id) op.client_id=(window.crypto&&crypto.randomUUID?crypto.randomUUID():uid());
  const q=_opsRead(); q.push(op); _opsWrite(q); updateOfflineBadge(); return op.client_id;
}
async function flushOps(){
  if(!navigator.onLine) return;
  let q=_opsRead(); if(!q.length) return;
  q = q.slice().sort((a,b)=> (a.kind==='customer'?0:1) - (b.kind==='customer'?0:1));  // clientes primeiro
  const keep=[]; let n=0;
  for(const op of q){
    try{
      if(op.kind==='customer'){
        const { data, error } = await sb.rpc('erp_sync_offline_customer',{ p_client_id:op.client_id, p:op.payload });
        if(error) throw error;
        if(data && data.ok) n++; else keep.push(op);
      }else if(op.kind==='movement'){
        const { data, error } = await sb.rpc('pdv_sync_offline_movement',{ p_client_id:op.client_id, p_kind:op.mkind, p_amount:op.amount, p_reason:op.reason||null });
        if(error) throw error;
        if(data && data.ok) n++; else keep.push(op);   // ok=false (ex.: no_session) → tenta depois
      }
    }catch(e){ if(isAuthErr(e)) await _refreshAuthOnce(); keep.push(op); }   // rede/auth/RPC ausente → mantém
  }
  _opsWrite(keep); updateOfflineBadge();
  if(n>0){ toast(n+' operação(ões) offline sincronizada(s) ✅');
    try{ await loadCustomers(); await refreshCash(); if(currentPage==='caixa'&&typeof renderCaixa==='function')renderCaixa(); }catch(e){} }
}
window.pdvOfflineSync = function(){ flushOffline(); flushOps(); };   // gancho chamado ao (re)entrar no caixa
window.addEventListener('online', flushOps);
setInterval(()=>{ if(navigator.onLine && _opsCount()) flushOps(); }, 20000);
// Reaquece o cache com o que está em memória (belt-and-suspenders) — chamado quando online.
window.pdvOfflineCacheState = function(){
  try{
    if(Array.isArray(PRODUCTS)) refCachePut('products:'+(CURRENT_STORE||'all'), PRODUCTS);
    if(Array.isArray(CUSTOMERS)) refCachePut('customers', CUSTOMERS);
  }catch(e){}
  updateOfflineBadge();
};

// ============ CHECAGEM DE NOVA VERSÃO (caixa instalado) ============
// O caixa roda dos arquivos locais; para saber se saiu versão nova, consulta o version.json
// do site publicado e avisa (com link para baixar o instalador). Não aplica sozinho.
const ONPDV_VERSION='2026.09.01-v47';
const ONPDV_SITE='https://onpdv.vercel.app';
function _verKey(v){ v=String(v||''); const d=(v.match(/(\d{4})\.(\d{2})\.(\d{2})/)||[]).slice(1).join(''); const n=(v.match(/v(\d+)/i)||[])[1]||'0'; return [ +d||0, +n||0 ]; }
function _updateIsNewer(a,b){ const ka=_verKey(a), kb=_verKey(b); return ka[0]>kb[0] || (ka[0]===kb[0] && ka[1]>kb[1]); }
async function checkForUpdate(){
  if(!navigator.onLine) return;
  try{
    const r=await fetch(ONPDV_SITE+'/version.json?ts='+Date.now(),{cache:'no-store'});
    if(!r.ok) return;
    const j=await r.json(); const latest=String(j&&j.version||'');
    if(!latest || !_updateIsNewer(latest, ONPDV_VERSION)) return;
    try{ if(localStorage.getItem('onpdv_update_dismissed')===latest) return; }catch(e){}
    onpdvShowUpdateNotice(latest);
  }catch(e){ /* CORS/rede: silencioso */ }
}
function onpdvShowUpdateNotice(latest){
  if(document.getElementById('onpdvUpd')) return;
  const bar=document.createElement('div'); bar.id='onpdvUpd';
  bar.style.cssText='position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;background:#2b2140;color:#fff;border:1px solid #ffd76a;border-radius:12px;padding:12px 14px;display:flex;gap:12px;align-items:center;box-shadow:0 10px 34px rgba(0,0,0,.4);font-family:inherit;max-width:640px;margin:0 auto';
  bar.innerHTML='<span style="flex:1;font-size:14px;line-height:1.4">🔄 Nova versão do ONPDV Caixa disponível (<b>'+esc(latest)+'</b>). Baixe e reinstale para atualizar.</span>'
    +'<a href="'+ONPDV_SITE+'/downloads/onpdv-caixa.bat" style="background:#ffd76a;color:#2b2140;font-weight:800;text-decoration:none;padding:8px 12px;border-radius:8px;white-space:nowrap">Baixar</a>'
    +'<button id="onpdvUpdX" aria-label="Dispensar" style="background:transparent;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer">×</button>';
  document.body.appendChild(bar);
  const x=document.getElementById('onpdvUpdX');
  if(x) x.onclick=()=>{ try{ localStorage.setItem('onpdv_update_dismissed', latest); }catch(e){} bar.remove(); };
}
// ======================= FLUXO MAQUININHA (TEF) =======================
async function posFlow(saleId, numero, total, terminalId, tipo, parcelas,context){ window._posSettled=false; window._posKind=(context&&context.kind)||'venda';window._posContext=context||null;
  const tipoLbl = { credito:`Crédito ${parcelas>1?parcelas+'x':'à vista'}`, debito:'Débito', pix:'PIX', estorno:'Estorno / cancelamento' }[tipo];
  const _isVoid = tipo==='estorno';
  modal(`
    <div class="m-head"><h3>${_isVoid?'Estorno':window._posKind==='entrega'?'Pagamento da entrega':'Maquininha'} · Venda #${numero}</h3><button data-onclick="closePos()">×</button></div>
    <div class="m-body qrbox" id="posBody">
      <div style="font-size:44px">${_isVoid?'↩️':'💳'}</div>
      <p style="font-family:'Fredoka';font-size:28px;font-weight:700;margin:4px 0">${BRL(total)}</p>
      <p class="muted">${tipoLbl}</p>
      <p id="posStat" style="margin-top:14px"><span class="chip amber">📲 Enviando para a maquininha…</span></p>
      <p class="muted" style="font-size:13px;margin-top:8px">Siga as instruções na tela da maquininha.</p>
    </div>
    <div class="m-foot"><button class="btn ghost" data-onclick="cancelPos()">Cancelar cobrança</button></div>`);
  // vitrine: mostra "aproxime/insira o cartão" (estorno não precisa exibir p/ cliente)
  CFD_PAYAMT=total;
  if(!_isVoid){
    if(tipo==='pix') cfdPay({ status:'pix_wait', amount:total, machine:true });
    else cfdPay({ status:'card_wait', amount:total });
  }
  try{
    const { data:req, error } = await sb.rpc('erp_pos_request', { p_sale:saleId, p_terminal:terminalId, p_tipo:tipo, p_parcelas:parcelas });
    if(error) throw error;
    window._posReq = req.id; window._posSale = saleId;
    $('#posStat').innerHTML = '<span class="chip amber">⏳ Aguardando a maquininha…</span>';
    // A maquininha Mercado Pago Point é acionada pela edge function pos-cloud-charge,
    // que envia a cobrança (débito/crédito/PIX) direto para o visor do aparelho.
    $('#posStat').innerHTML = '<span class="chip amber">📲 Enviando a cobrança para a maquininha Mercado Pago Point…</span>';
    sb.functions.invoke('pos-cloud-charge',{ body:{ request_id:req.id } })
      .then(({data,error})=>{ if(error){ console.warn('pos-cloud-charge',error); if(!window._posSettled) posFailChoice('Não consegui acionar a maquininha. Verifique o aparelho e tente outra forma de pagamento.'); } })
      .catch(e=>console.warn('pos-cloud-charge',e));
    // Realtime: escuta a resolução da requisição
    if(POS_CHAN){ sb.removeChannel(POS_CHAN); }
    POS_CHAN = sb.channel('pos-'+req.id)
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:'pos_payment_requests', filter:`id=eq.${req.id}` },
        p=> onPosUpdate(p.new))
      .subscribe();
    // fallback: polling a cada 3s
    posPoll(req.id);
  }catch(e){ try{cfdPay({status:'clear'});}catch(_){} posFailChoice(e && (e.message||String(e)) || 'Falha ao acionar a maquininha'); }
}
function onPosUpdate(r){ if(window._posSettled) return;
  const s=$('#posStat'); if(!s) return;
  if(r.status==='aprovado'){ window._posSettled=true; s.innerHTML='<span class="chip ok">✅ Aprovado!</span>'; stopPos(); loadDash();
    cfdPay({ status:'approved', amount:CFD_PAYAMT }); closeModal(); if(window._posKind==='crediario'){ posCredApproved(); } else if(window._posKind==='entrega'){pdvDeliveryPosApproved();} else { posShowReceipt(window._posSale, { tipo:r.tipo, nsu:r.nsu, bandeira:r.bandeira, auth:r.cod_autorizacao, parcelas:r.parcelas }); } }
  else if(r.status==='negado'){ stopPos(); try{cfdPay({ status:'declined', msg:r.mensagem||'' });}catch(_){} posFailChoice(r.mensagem||'Pagamento negado'); }
  else if(r.status==='processando'){ s.innerHTML='<span class="chip amber">💳 Processando na maquininha…</span>';
    cfdPay({ status:'card_wait', amount:CFD_PAYAMT, sub:'Processando o cartão…' }); }
  else if(r.status==='expirado'){ stopPos(); posFailChoice('A maquininha não respondeu a tempo.'); }
}
let posTimer=null;
function posPoll(id){ clearInterval(posTimer);
  posTimer=setInterval(async ()=>{
    const { data } = await sb.from('pos_payment_requests').select('*').eq('id',id).single();
    if(data) onPosUpdate(data);
  }, 3000);
}
function stopPos(){ clearInterval(posTimer); if(POS_CHAN){ sb.removeChannel(POS_CHAN); POS_CHAN=null; } }
window.closePos = ()=>{ stopPos(); if(CFD_LASTPAY) cfdPay({status:'clear'}); closeModal(); };
window.cancelPos = async ()=>{ if(window._posReq){ try{ await sb.rpc('erp_pos_cancel',{ p_request:window._posReq }); }catch(_){} } posFailChoice('Cobrança cancelada.'); };
function posRestoreCart(){ const s=window._posSnap; if(!s)return; PDV.items=JSON.parse(JSON.stringify(s.items||[])); PDV.cust=s.cust||null; PDV.disc=s.disc||0; PDV.sur=s.sur||0; PDV.cb=s.cb||0; PDV.sel=PDV.items.length-1; renderCaixa(); }
async function posCancelServer(){ const reqId=window._posReq, saleId=window._posSale; window._posReq=null; window._posSale=null; window._posLastSale=saleId; if(!reqId) return 'cancelado';
  try{ const {data,error}=await sb.functions.invoke('pos-cloud-charge',{body:{request_id:reqId, action:'cancel'}}); if(error) throw error; return (data&&data.status)||'cancelado'; }
  catch(e){ console.warn('pos-cancel',e); try{ await sb.rpc('erp_pos_cancel',{p_request:reqId}); }catch(_){} try{ if(saleId) await sb.rpc('erp_cancel_sale',{p_sale:saleId,p_motivo:'Pagamento nao concluido na maquininha'}); }catch(_){} return 'cancelado'; } }
function posApprovedAfterCancel(){ try{cfdPay({status:'approved',amount:CFD_PAYAMT});}catch(_){} try{loadDash();}catch(_){} pdvCloseModal(); if(window._posKind==='crediario'){ posCredApproved(); return; } if(window._posKind==='entrega'){pdvDeliveryPosApproved();return;} toast('O pagamento já havia sido aprovado — venda concluída.'); if(window._posLastSale){ posShowReceipt(window._posLastSale,null); } else { renderCaixa(); } }
window.posRetryOther = async ()=>{ const st=await posCancelServer(); if(st==='aprovado'){ posApprovedAfterCancel(); return; } if(window._posKind==='crediario'){ pdvCloseModal(); if(PDV_CRED.cust) pdvCredOpen(PDV_CRED.cust.id); return; } posRestoreCart(); pdvCloseModal(); if(window._posKind==='entrega'){pdvDeliveryModal();toast('Escolha outra forma de pagamento da entrega');}else toast('Escolha a forma de pagamento'); };
window.posCancelSale = async ()=>{ const st=await posCancelServer(); if(st==='aprovado'){ posApprovedAfterCancel(); return; } if(window._posKind==='crediario'){ pdvCloseModal(); toast('Recebimento cancelado'); return; } pdvResetDraft(); renderCaixa(); pdvCloseModal(); toast('Venda cancelada'); };
function posFailChoice(msg){ window._posSettled=true; stopPos(); try{cfdPay({status:'clear'});}catch(_){} closeModal(); pdvModal('Pagamento não concluído','<div class="pdv-note">'+(msg?esc(msg)+'<br>':'')+'Os itens continuam no carrinho. O que você deseja fazer?</div><div class="pdv-btns" style="margin-top:14px;gap:10px"><button class="pdv-btn solid" data-onclick="posRetryOther()">Trocar forma de pagamento</button><button class="pdv-btn ghost" data-onclick="posCancelSale()">Cancelar venda</button></div>'); }
async function pdvDeliveryPosApproved(){
  const d=window._posDelivery||{};window._posDelivery=null;window._posContext=null;
  try{await loadProducts();buildPdvCatalog();pdvDelivCount();}catch(_){}
  renderCaixa();toast('Pagamento aprovado · entrega #'+(d.numero||'')+' enviada para a fila 🚚');
  if(d.deliveryId&&typeof delivGuide==='function')delivGuide(d.deliveryId);
}
async function posShowReceipt(saleId, card){
  try{
    if(!saleId){ renderCaixa(); return; }
    const {data,error}=await sb.rpc('pdv_sale_reprint',{p_order:saleId});
    if(error||!data||!data.res) throw (error||new Error('sem dados'));
    const sale={ when:new Date(data.when||Date.now()),
      items:(data.items||[]).map(i=>({name:i.name||'Item',price:+i.price||0,qty:+i.qty||1,disc:+i.disc||0,kg:!!i.kg})),
      pays:(data.pays||[]).map(pp=>({m:pp.m||'outro',v:+pp.v||0,venc:pp.venc||null,parcelas:pp.parcelas||1})),
      res:data.res, customerId:data.customer_id||data.res.customer_id||null };
    if(sale.res) sale.res.reprint=false;
    if(card && card.tipo){ const alvo=sale.pays.find(x=>['cartao','credito','debito','pix','qr'].includes(x.m))||sale.pays[0];
      if(alvo){ alvo.m=card.tipo; if(card.nsu)alvo.nsu=String(card.nsu); if(card.bandeira)alvo.bandeira=String(card.bandeira); if(card.auth)alvo.auth=String(card.auth); if(card.parcelas>1)alvo.parcelas=card.parcelas; } }
    PDV.lastSale=sale; PDV._lastPhone=(window._posSnap&&window._posSnap.cust&&window._posSnap.cust.phone)||'';
    pdvReceiptModal(sale);
  }catch(e){ console.error('posShowReceipt',e); renderCaixa(); toast('Venda aprovada. Reimprima o cupom em Vendas se precisar.'); }
}

// ======================= PDV (PetApp) · CAMADA DE COMPAT =======================
let currentPage='home';
const round2=n=>{const v=Number(n)||0;return Math.round((v+Math.sign(v)*Number.EPSILON)*100)/100;};
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
function val(id){const el=document.getElementById(id);return el?String(el.value==null?'':el.value).trim():'';}
function normTxt(s){return String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function priceOf(p,vid){ if(vid&&p&&p.variants){const v=p.variants.find(x=>x.id===vid);if(v)return +v.price||0;} return +(p&&p.price)||0; }
const DB={ products:[], settings:{ storeName:'ONPDV', city:'' },
  cfg:{ balanca:{ ativa:false, modo:'peso', prefixo:'2', cod_len:6, val_len:5, val_dec:3 },
        mercadopago:{ ativa:false, device_id:'' } } };
function pdvCfg(){ return DB.cfg||{}; }
function buildPdvCatalog(){
  DB.products=(PRODUCTS||[]).map(p=>({
    id:p.id, name:p.nome||'Produto', brand:'', ean:(p.codigo_barras||p.sku||''),
    price:+p.preco||0, cost:+p.custo||0,
    stock:(p.track_stock===false?null:(+p.estoque||0)),
    unit:(p.unidade||'un'), active:p.ativo!==false, variants:[]
  }));
  DB.settings.storeName=(COMPANY&&COMPANY.nome)||'ONPDV';
  DB.settings.city=(COMPANY&&COMPANY.endereco)||'';
}
window.go=function(){ if(typeof exitPdv==='function')exitPdv(); };

// ===== Cobrança na maquininha Mercado Pago Point =====
// O operador escolhe no caixa: débito, crédito ou PIX. A cobrança vai direto
// para o visor da maquininha (edge function pos-cloud-charge → Mercado Pago Point).
function pdvPickTerminal(tipo){
  tipo = tipo || 'credito';
  pdvModal('Escolha a maquininha 💳',
    (TERMINALS||[]).map(t=>'<button class="pdv-btn" style="width:100%;margin:5px 0;text-align:left" data-onclick="pdvCloseModal();pdvMaquininha(\''+tipo+'\',\''+t.id+'\')">'
      +'💳 '+esc(t.nome)+' <span style="opacity:.75;font-weight:600">· Mercado Pago Point</span></button>').join('')
    +'<button class="pdv-btn ghost" style="width:100%;margin-top:6px" data-pdv-close>Cancelar</button>', true);
}
function pdvBoundMachineId(){ try{ const c=(PDV.terminals||[]).find(t=>t.code===PDV.terminal); return (c&&c.payment_terminal_id)||null; }catch(e){ return null; } }
async function pdvMaquininha(tipo, termId){
  tipo = tipo || 'credito';
  if(!PDV.items.length){toast('Nenhum item na venda');return;}
  if(!PDV.ses||PDV.ses.status!=='aberto'){toast('Abra o caixa (F11) antes');return;}
  if(!navigator.onLine||PDV.ses.offline){toast('A maquininha exige internet. Use dinheiro ou outra forma para vender offline.', true);return;}
  const terms=(TERMINALS||[]);
  if(!terms.length){toast('Cadastre uma maquininha em Config → Maquininhas');return;}
  let term = termId ? terms.find(t=>t.id===termId) : null;
  if(!term){ const _bid=pdvBoundMachineId(); if(_bid) term=terms.find(t=>t.id===_bid)||null; }
  if(!term) term = (terms.length===1?terms[0]:null);
  if(!term){ pdvPickTerminal(tipo); return; }
  if(PDV.busy)return; PDV.busy=true;
  const t=pdvTotals();
  const items=PDV.items.map(i=>({product_id:i.id,descricao:i.name,qtd:i.qty,preco_unit:i.price,custo_unit:0}));
  const net=round2((t.manual||0)+(t.idisc||0)+(t.cb||0)-(t.sur||0));
  const forma = tipo==='pix' ? 'pix' : 'cartao';
  try{
    const {data,error}=await sb.rpc('erp_checkout',{p_customer:PDV.cust?PDV.cust.id:null,p_items:items,p_desconto:net,p_forma:forma,p_parcelas:1,p_primeiro_venc:null,p_obs:null,p_tipo_doc:'venda',p_store:CURRENT_STORE});
    if(error)throw error;
    window._posSnap=pdvSnapshot();pdvResetDraft();pdvCloseModal();renderCaixa();
    try{await loadProducts();buildPdvCatalog();refreshCash();}catch(_e){}
    await posFlow(data.sale_id,data.numero,data.total,term.id,tipo,1);
  }catch(e){console.error(e);toast(pdvErr(e));}
  finally{PDV.busy=false;}
}
/* ================= PDV / FRENTE DE CAIXA ================= */
let PDV={ses:null,items:[],cust:null,disc:0,sur:0,cb:0,mpct:0,sel:-1,
  terminal:'CAIXA-1',busy:false,keysOn:false,lastSale:null,scanStop:null,
  held:[],opps:[],pix:null,pixPoll:null,_found:[],pickups:[],pickupLoading:false,
  approval:null,pickupTimer:null,pickupKnown:null,terminals:[],daily:null,
  delivPix:[],delivPixLoading:false,delivPixKnown:null,delivPixDraft:null,delivPixUnavailable:false};

function isCashier(){return !!(ME&&(ME.is_cashier||ME.is_admin));}
function pdvNum(v){
  return num(v);
}
function pdvQ(n,d){const x=Number(n)||0;return x.toFixed(d==null?3:d).replace('.',',');}
function pdvUnit(p){return String((p&&p.unit)||'UN').toUpperCase()==='KG'?'KG':'UN';}
function pdvIsKg(p){return pdvUnit(p)==='KG';}
function pdvCleanTerm(t){return String(t||'CAIXA-1').replace(/[^A-Za-z0-9_-]/g,'').slice(0,40)||'CAIXA-1';}
function pdvTerm(){try{return pdvCleanTerm(localStorage.getItem('petapp_pdv_term'));}catch(e){return 'CAIXA-1';}}
function pdvSetTerm(t){t=pdvCleanTerm(t);PDV.terminal=t;try{localStorage.setItem('petapp_pdv_term',t);}catch(e){}}
function pdvHoldKey(){return 'petapp_pdv_holds_'+String(PDV.terminal||'CAIXA-1').replace(/\W/g,'_');}
function pdvLoadHolds(){try{const x=JSON.parse(localStorage.getItem(pdvHoldKey())||'[]');PDV.held=Array.isArray(x)?x:[];}catch(e){PDV.held=[];}}
function pdvSaveHolds(){try{localStorage.setItem(pdvHoldKey(),JSON.stringify(PDV.held.slice(0,30)));}catch(e){console.error(e);}}
function pdvResetDraft(){PDV.items=[];PDV.cust=null;PDV.disc=0;PDV.sur=0;PDV.cb=0;PDV.sel=-1;PDV.opps=[];PDV.approval=null;}
function pdvSnapshot(){return {id:(crypto.randomUUID?crypto.randomUUID():uid()),created_at:new Date().toISOString(),
  items:JSON.parse(JSON.stringify(PDV.items)),cust:PDV.cust?JSON.parse(JSON.stringify(PDV.cust)):null,
  disc:PDV.disc||0,sur:PDV.sur||0,cb:PDV.cb||0};}
function pdvHoldSale(silent){
  if(!PDV.items.length){if(PDV.held.length)pdvHeldModal();else toast('Nenhuma venda para colocar em espera');return false;}
  const s=pdvSnapshot();PDV.held.unshift(s);pdvSaveHolds();pdvResetDraft();renderCaixa();
  if(!silent)toast('Venda em espera · '+(s.cust&&s.cust.name?s.cust.name:s.items.length+' item(ns)'));return true;
}
function pdvHeldModal(){
  const list=PDV.held||[];
  pdvModal('Vendas em espera ('+list.length+')',
    (PDV.items.length?'<button class="pdv-btn" style="width:100%;margin-bottom:10px" data-onclick="pdvHoldSale();pdvHeldModal()">⏸ Guardar a venda atual</button>':'')
    +(list.length?'<div class="pdv-list"><table><thead><tr><th>Hora</th><th>Cliente</th><th>Resumo</th><th class="r">Total</th><th></th></tr></thead><tbody>'
      +list.map((s,i)=>{const d=new Date(s.created_at);const total=round2((s.items||[]).reduce((a,x)=>a+x.price*x.qty-(x.disc||0),0)-(s.disc||0)+(s.sur||0));
        return '<tr><td>'+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+'</td><td>'+esc((s.cust&&s.cust.name)||'CONSUMIDOR')+'</td>'
          +'<td>'+((s.items||[]).length)+' item(ns)</td><td class="r"><b>'+BRL(total)+'</b></td><td class="r">'
          +'<button class="mini b" data-onclick="pdvResumeHold('+i+')">Chamar</button> <button class="mini" data-onclick="pdvDeleteHold('+i+')">✕</button></td></tr>';}).join('')
      +'</tbody></table></div>':'<div class="pdv-note">Nenhuma venda aguardando.</div>')
    +'<div class="pdv-note" style="margin-top:10px">As vendas ficam guardadas neste terminal, inclusive se a página for recarregada.</div>',true);
}
function pdvResumeHold(i){
  const s=PDV.held[i];if(!s)return;
  if(PDV.items.length&&!pdvHoldSale(true))return;
  const idx=PDV.held.findIndex(x=>x.id===s.id);if(idx>=0)PDV.held.splice(idx,1);
  PDV.items=s.items||[];PDV.cust=s.cust||null;PDV.disc=s.disc||0;PDV.sur=s.sur||0;PDV.cb=s.cb||0;PDV.sel=PDV.items.length-1;
  pdvSaveHolds();pdvCloseModal();renderCaixa();if(PDV.cust)pdvLoadOpportunities();toast('Venda retomada');
}
async function pdvDeleteHold(i){if(!PDV.held[i]||!await uiConfirm('Excluir esta venda em espera?',{danger:true,okText:'Excluir'}))return;PDV.held.splice(i,1);pdvSaveHolds();pdvHeldModal();}

/* ---------- catálogo: busca por código de barras / id / nome ---------- */
function pdvFindByCode(code){
  const q=String(code||'').trim();if(!q)return null;
  const d=q.replace(/\D/g,'');
  for(const p of DB.products){
    if(p.active===false)continue;
    if(p.id===q)return {p:p,vid:''};
    if(d.length>=6&&(p.ean||'').replace(/\D/g,'')===d)return {p:p,vid:''};
    for(const v of (p.variants||[])){
      if(v.id===q)return {p:p,vid:v.id};
      if(d.length>=6&&(v.ean||'').replace(/\D/g,'')===d)return {p:p,vid:v.id};
    }
  }
  return null;
}
// procura produto/variação pelo código do produto embutido na etiqueta da balança
function pdvFindScaleCode(code){
  const c=String(code||'').replace(/\D/g,''); if(!c) return null;
  const cNoZero=c.replace(/^0+/,'')||'0';
  for(const p of DB.products){
    if(p.active===false) continue;
    const pe=(p.ean||'').replace(/\D/g,'');
    if(pe && (pe===c || pe.replace(/^0+/,'')===cNoZero)) return {p:p,vid:''};
    for(const v of (p.variants||[])){
      const ve=(v.ean||'').replace(/\D/g,'');
      if(ve && (ve===c || ve.replace(/^0+/,'')===cNoZero)) return {p:p,vid:v.id};
    }
  }
  return null;
}
// interpreta uma etiqueta de balança (EAN-13 com peso ou preço embutido). Retorna {p,vid,qty} ou {notFound}
function pdvParseScale(raw){
  const b=(pdvCfg().balanca)||{}; if(!b.ativa) return null;
  const d=String(raw||'').replace(/\D/g,'');
  if(d.length<12||d.length>13) return null;
  const pfx=String(b.prefixo==null?'':b.prefixo).replace(/\D/g,'');
  if(pfx && d.slice(0,pfx.length)!==pfx) return null;
  const start=pfx.length;
  const codLen=Math.max(1,+b.cod_len||6), valLen=Math.max(1,+b.val_len||5), dec=(b.modo==='preco'?2:Math.max(0,+b.val_dec||0)); // modo preco: valor sempre em centavos (2 casas)
  const code=d.substr(start,codLen), valStr=d.substr(start+codLen,valLen);
  if(code.length<codLen||valStr.length<valLen) return null;
  const rawVal=parseInt(valStr,10); if(isNaN(rawVal)) return null;
  const value=rawVal/Math.pow(10,dec);
  const hit=pdvFindByCode(code)||pdvFindByCode(pfx+code)||pdvFindScaleCode(code);
  if(!hit) return { notFound:true, code:code };
  const p=hit.p, vid=hit.vid, price=priceOf(p,vid), kg=pdvIsKg(p);
  if(b.modo==='preco'){
    const qty = (kg && price>0) ? round2(value/price*1000)/1000 : 1;
    return { p:p, vid:vid, qty:qty };
  }
  return { p:p, vid:vid, qty:value };   // modo peso: valor embutido já é o peso
}
function pdvSearch(q,onlyStock){
  const nq=normTxt(q||''),d=String(q||'').replace(/\D/g,'');
  const out=[];
  for(const p of DB.products){
    if(p.active===false)continue;
    const hit=!nq||normTxt(p.name).indexOf(nq)>=0||normTxt(p.brand||'').indexOf(nq)>=0
      ||(d.length>=4&&(p.ean||'').replace(/\D/g,'').indexOf(d)>=0);
    if(!hit)continue;
    if(p.variants&&p.variants.length){
      p.variants.forEach(v=>out.push({p:p,vid:v.id,name:p.name+' — '+v.label,
        price:+v.price||0,ean:v.ean||p.ean||'',stock:(v.stock==null?null:+v.stock)}));
    }else{
      out.push({p:p,vid:'',name:p.name,price:+p.price||0,ean:p.ean||'',stock:+p.stock||0});
    }
    if(out.length>400)break;
  }
  return onlyStock?out.filter(r=>r.stock==null||r.stock>0):out;
}

/* ---------- itens da venda ---------- */
function pdvAddItem(pid,vid,qty){
  const p=DB.products.find(x=>x.id===pid);
  if(!p){toast('Produto não encontrado');return false;}
  const kg=pdvIsKg(p);
  let q=Number(qty)||1;
  if(!kg)q=Math.round(q);
  if(q<=0){toast('Quantidade inválida');return false;}
  const price=priceOf(p,vid);
  if(!(price>0)){toast('Produto sem preço cadastrado');return false;}
  const i=PDV.items.findIndex(x=>x.id===pid&&x.vid===(vid||'')&&!kg);
  if(i>=0){PDV.items[i].qty=round2(PDV.items[i].qty+q);PDV.sel=i;}
  else{
    let nm=p.name;
    if(vid){const v=(p.variants||[]).find(x=>x.id===vid);if(v)nm=p.name+' — '+v.label;}
    PDV.items.push({id:pid,vid:vid||'',name:nm,price:price,qty:q,disc:0,kg:kg,
      ean:(vid?((p.variants||[]).find(x=>x.id===vid)||{}).ean:p.ean)||p.ean||''});
    PDV.sel=PDV.items.length-1;
  }
  renderCaixa();
  return true;
}
async function pdvDelItem(i){
  if(i==null)i=PDV.sel;
  if(i<0||i>=PDV.items.length){toast('Selecione um item na lista');return;}
  const it=PDV.items[i];
  if(!await uiConfirm('Cancelar o item "'+it.name+'"?',{danger:true,okText:'Cancelar item',cancelText:'Voltar'}))return;
  PDV.items.splice(i,1);
  PDV.sel=Math.min(i,PDV.items.length-1);
  renderCaixa();
}
function pdvSel(i){PDV.sel=i;renderCaixa();}

let PROMOS={};
function _applyPromos(rows){ PROMOS={};
  (rows||[]).forEach(r=>{ const k=r.product_id; (PROMOS[k]=PROMOS[k]||[]).push({tipo:r.tipo||'unitario',min_qtd:+r.min_qtd||0,preco_promo:+r.preco_promo||0,pacote_preco:+r.pacote_preco||0}); });
}
async function loadPromos(){
  const key='promos:'+(typeof CURRENT_STORE!=='undefined'?(CURRENT_STORE||'all'):'all');
  try{
    const {data,error}=await sb.rpc('pdv_promos_active',{p_store:(typeof CURRENT_STORE!=='undefined'?CURRENT_STORE:null)});
    if(error)throw error;
    refCachePut(key, data||[], true);
    _applyPromos(data);
  }catch(e){ console.warn('loadPromos',e);
    const c = isNetworkErr(e) ? await refCacheGet(key) : null;
    _applyPromos(Array.isArray(c)?c:[]);
  }
}
// desconto automatico das promoções (aplicado como desconto de linha) — pega o maior desconto
function promoDiscFor(it){
  if(!it||it.kg) return 0;
  const list=PROMOS[it.id]; if(!list||!list.length) return 0;
  let best=0;
  list.forEach(r=>{
    let d=0;
    if((r.tipo||'unitario')==='pacote'){
      // leve N por R$ Y; sobra (qty % N) sai ao preço normal
      const N=+r.min_qtd||0, Y=+r.pacote_preco||0;
      if(N>=2 && Y>0 && it.qty>=N){
        const packs=Math.floor(it.qty/N);
        const porPacote=(N*it.price)-Y;
        if(porPacote>0) d=round2(packs*porPacote);
      }
    }else{
      // a partir de N unidades, cada unidade sai a preco_promo
      if(it.qty>=(+r.min_qtd||0) && +r.preco_promo>0 && +r.preco_promo < it.price){
        d=round2((it.price-(+r.preco_promo))*it.qty);
      }
    }
    if(d>best) best=d;
  });
  return best;
}
function pdvTotals(){
  let sub=0,idisc=0,promo=0;
  PDV.items.forEach(it=>{sub+=it.price*it.qty;idisc+=(+it.disc||0);promo+=promoDiscFor(it);});
  sub=round2(sub);idisc=round2(idisc);promo=round2(promo);
  const manual=round2(Math.max(0,PDV.disc||0));
  const sur=round2(Math.max(0,PDV.sur||0));
  const member=!!(PDV.cust&&PDV.cust.member&&PDV.mpct>0);
  let mdisc=member?round2(Math.max(0,sub-idisc-promo-manual)*PDV.mpct/100):0;
  let cb=round2(Math.max(0,PDV.cb||0));
  if(cb>round2(sub-idisc-promo-manual-mdisc))cb=round2(Math.max(0,sub-idisc-promo-manual-mdisc));
  let total=round2(sub-idisc-promo-manual-mdisc-cb+sur);
  if(total<0)total=0;
  return {sub:sub,idisc:idisc,promo:promo,manual:manual,mdisc:mdisc,member:member,cb:cb,sur:sur,
    total:total,qty:round2(PDV.items.reduce((a,i)=>a+i.qty,0)),n:PDV.items.length};
}
function pdvOpportunitiesHtml(){
  if(!PDV.cust)return '';
  const t=pdvTotals();let cards='';
  (PDV.opps||[]).slice(0,2).forEach((o,i)=>{
    const late=Number(o.remaining_days)<=7;
    cards+='<div class="pdv-opp"><b>🐾 '+esc(o.pet_name||'Pet')+'</b><div class="pdv-note">'+esc(o.product_name||'Ração')
      +' · comprada há '+Math.max(0,Number(o.days_since)||0)+' dia(s)'+(late?' · <b>deve estar acabando</b>':'')+'</div>'
      +'<button class="pdv-btn" data-onclick="pdvAddOpportunity('+i+')">+ Incluir recompra</button></div>';
  });
  if(!PDV.cust.member&&PDV.mpct>0&&t.sub>0){const save=round2(Math.max(0,t.sub-t.idisc-t.manual)*PDV.mpct/100);
    cards+='<div class="pdv-opp"><b>🎫 Clube: economiza '+BRL(save)+' hoje</b><div class="pdv-note">Ative a recompra programada no balcão.</div>'
      +'<button class="pdv-btn" data-onclick="pdvClubModal()">Oferecer Clube</button></div>';}
  return cards?'<div class="pdv-opps">'+cards+'</div>':'';
}
async function pdvLoadOpportunities(){
  const id=PDV.cust&&PDV.cust.id;if(!id){PDV.opps=[];return;}
  try{const {data,error}=await sb.rpc('pdv_customer_opportunities',{p_customer:id});if(error)throw error;
    if(PDV.cust&&PDV.cust.id===id){PDV.opps=Array.isArray(data)?data:[];renderCaixa();}}
  catch(e){console.warn('pdv_customer_opportunities',e);PDV.opps=[];}
}
function pdvAddOpportunity(i){
  const o=(PDV.opps||[])[i];if(!o)return;
  if(pdvAddItem(o.product_id,o.variant_id||'',1))toast((o.pet_name||'Pet')+': recompra incluída');
}
function pdvClubModal(){
  if(!PDV.cust)return;
  const base=PDV.items.length?PDV.items:(PDV.opps||[]).slice(0,1).map(o=>({id:o.product_id,vid:o.variant_id||'',name:o.product_name,qty:1,price:o.price||0}));
  if(!base.length){toast('Inclua ao menos um produto para criar a recompra');return;}
  const save=round2(Math.max(0,pdvTotals().sub)*PDV.mpct/100);
  pdvModal('Ativar Clube / recompra',
    '<div class="pdv-sum"><div class="l"><span>Cliente</span><b>'+esc(PDV.cust.name||'')+'</b></div>'
      +'<div class="l cb"><span>Economia estimada hoje</span><b>'+BRL(save)+'</b></div></div>'
    +'<div class="pdv-note" style="margin-bottom:10px">A recompra será criada com os itens atuais. O cliente poderá editar ou pausar no app.</div>'
    +'<label class="pdv-lbl">Repetir a cada</label><select class="pdv-in" id="pdvClubDays"><option value="30">30 dias</option><option value="45">45 dias</option><option value="60">60 dias</option><option value="15">15 dias</option></select>'
    +'<div class="pdv-btns"><button class="pdv-btn" id="pdvClubGo" data-onclick="pdvCreateClub()">Ativar Clube</button><button class="pdv-btn ghost" data-pdv-close>Cancelar</button></div>');
}
async function pdvCreateClub(){
  const b=document.getElementById('pdvClubGo');if(b){b.disabled=true;b.textContent='Ativando...';}
  try{const items=PDV.items.map(i=>({pid:i.id,vid:i.vid||'',qty:i.qty,name:i.name}));
    const {error}=await sb.rpc('pdv_create_subscription',{p_customer:PDV.cust.id,p_items:items,p_interval:+val('pdvClubDays')||30});if(error)throw error;
    PDV.cust.member=true;pdvCloseModal();renderCaixa();toast('Clube ativado · desconto aplicado');
  }catch(e){console.error(e);toast(pdvErr(e));if(b){b.disabled=false;b.textContent='Ativar Clube';}}
}

/* ---------- fila automática de retiradas ---------- */
function pdvPaymentLabel(method){
  const labels={pix:'PIX',cartao:'Cartão',credito:'Crédito',debito:'Débito',dinheiro:'Dinheiro',na_entrega:'Pagamento na retirada',nao_informado:'Não informado'};
  return labels[String(method||'').toLowerCase()]||String(method||'Pagamento').replace(/_/g,' ');
}
function pdvPickupPaymentText(o){
  const pays=Array.isArray(o&&o.payments)?o.payments:[];
  const methods=[...new Set(pays.map(p=>pdvPaymentLabel((p&&typeof p==='object')?(p.m||p.method||p.payment_method):p)).filter(Boolean))];
  if(!methods.length)methods.push(pdvPaymentLabel(o&&o.payment_method));
  return methods.join(' + ')+(o&&o.payment_status==='pago'?' · pago':' · aguardando confirmação');
}
function pdvPickupQueueHtml(){
  if(!PDV.ses||PDV.ses.status!=='aberto'||!PDV.pickups.length)return '';
  return '<div class="pdv-pickups"><div class="pdv-pickups-head"><span>📦 Retiradas no ponto de coleta</span>'
    +'<span class="pdv-chip">'+PDV.pickups.length+'</span></div><div class="pdv-pickups-list">'
    +PDV.pickups.map(o=>{const paid=o.payment_status==='pago';const d=new Date(o.created_at);const tm=isNaN(d)?'':d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      return '<article class="pdv-pickup-card '+(paid?'paid':'')+'"><div class="pdv-pickup-top"><span class="pdv-pickup-num">Pedido #'+esc(o.num||'')+'</span><span class="pdv-pickup-time">'+esc(tm)+'</span></div>'
        +'<div class="pdv-pickup-name">'+esc(o.customer||'Cliente')+'</div><div class="pdv-pickup-pay">'+esc(pdvPickupPaymentText(o))+' · '+BRL(o.total||0)+'</div>'
        +'<button class="pdv-btn" '+(paid?'data-onclick="pdvOpenPickupOrder(\''+esc(o.id)+'\')"':'disabled')+'>'+(paid?'Conferir e retirar':'Aguardando pagamento')+'</button></article>';
    }).join('')+'</div></div>';
}
function pdvDeliveryPixReady(){return (PDV.delivPix||[]).filter(x=>x.status==='paid');}
function pdvDeliveryPixQueueHtml(){
  if(!PDV.ses||PDV.ses.status!=='aberto'||!PDV.delivPix.length)return '';
  return '<div class="pdv-pickups pdv-delivery-pix"><div class="pdv-pickups-head"><span>⚡ Entregas aguardando PIX</span>'
    +'<span class="pdv-chip">'+PDV.delivPix.length+'</span></div><div class="pdv-pickups-list">'
    +PDV.delivPix.map(o=>{const paid=o.status==='paid';const d=new Date(o.created_at);const tm=isNaN(d)?'':d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      return '<article class="pdv-pickup-card '+(paid?'pix-paid':'pix-wait')+'"><div class="pdv-pickup-top"><span class="pdv-pickup-num">'+(paid?'✅ PIX pago':'⏳ Aguardando PIX')+'</span><span class="pdv-pickup-time">'+esc(tm)+'</span></div>'
        +'<div class="pdv-pickup-name">'+esc(o.customer||'Cliente')+'</div><div class="pdv-pickup-pay">Entrega · '+BRL(o.amount||0)+'</div>'
        +'<button class="pdv-btn" '+(paid?'data-onclick="pdvRestorePaidDelivery(\''+esc(o.id)+'\')"':'data-onclick="pdvDeliveryPixQueueModal()"')+'>'+(paid?'Trazer para o PDV':'Ver / reenviar PIX')+'</button></article>';
    }).join('')+'</div></div>';
}
async function pdvLoadDeliveryPixQueue(silent){
  if(PDV.delivPixUnavailable)return;
  if(!sb||!PDV.ses||PDV.ses.status!=='aberto'||PDV.ses.offline){PDV.delivPix=[];PDV.delivPixKnown=null;return;}
  if(PDV.delivPixLoading)return;PDV.delivPixLoading=true;
  try{
    const {data,error}=await sb.rpc('pdv_delivery_pix_queue',{p_session:PDV.ses.id});if(error)throw error;
    let next=Array.isArray(data)?data:[];
    const oldById=new Map(PDV.delivPix.map(o=>[o.id,o]));
    const before=JSON.stringify(PDV.delivPix.map(o=>[o.id,o.status,o.amount]));
    PDV.delivPix=next;PDV.delivPixKnown=new Set(next.map(o=>o.id));
    const newlyPaid=next.find(o=>o.status==='paid'&&(!oldById.has(o.id)||oldById.get(o.id).status!=='paid'));
    if(newlyPaid&&!silent)toast('✅ PIX da entrega confirmado · clique em Entrega para continuar');
    const pending=next.filter(o=>o.status==='pending').slice(0,6);
    if(pending.length){
      await Promise.all(pending.map(o=>sb.functions.invoke('pdv-pix-payment',{body:{action:'status',intentId:o.id,paymentId:o.payment_id||null}}).catch(()=>null)));
      if(!silent){const again=await sb.rpc('pdv_delivery_pix_queue',{p_session:PDV.ses.id});if(!again.error&&Array.isArray(again.data))PDV.delivPix=again.data;}
    }
    const after=JSON.stringify(PDV.delivPix.map(o=>[o.id,o.status,o.amount]));
    if(before!==after&&currentPage==='caixa'&&!document.getElementById('pdvOv'))renderCaixa();
  }catch(e){const m=String((e&&e.message)||e||'');if(/pdv_delivery_pix_queue|PGRST202|schema cache/i.test(m)){PDV.delivPixUnavailable=true;console.warn('Fila PIX de entrega aguarda a migração do banco.');}else{console.error(e);if(!silent)toast(pdvErr(e));}}
  finally{PDV.delivPixLoading=false;}
}
function pdvOpenPickupOrder(id){if(id)pdvPickupFromCode('petshop:order:'+id);}
async function pdvLoadPickupQueue(silent){
  if(!sb||!PDV.ses||PDV.ses.status!=='aberto'||PDV.ses.offline){PDV.pickups=[];PDV.pickupKnown=null;return;}
  if(PDV.pickupLoading)return;PDV.pickupLoading=true;
  try{
    const {data,error}=await sb.rpc('pdv_pickup_queue',{p_session:PDV.ses.id});if(error)throw error;
    const next=Array.isArray(data)?data:[];
    const previous=PDV.pickupKnown;
    const oldById=new Map(PDV.pickups.map(o=>[o.id,o]));
    const signature=JSON.stringify(PDV.pickups.map(o=>[o.id,o.payment_status,o.total]));
    const nextSignature=JSON.stringify(next.map(o=>[o.id,o.payment_status,o.total]));
    PDV.pickups=next;PDV.pickupKnown=new Set(next.map(o=>o.id));
    if(previous){
      const fresh=next.filter(o=>!previous.has(o.id));
      if(fresh.length&&!silent){const o=fresh[0];toast('📦 Retirada #'+(o.num||'')+' · '+(o.customer||'Cliente')+' · '+pdvPickupPaymentText(o));}
      else if(!silent){const paid=next.find(o=>o.payment_status==='pago'&&oldById.has(o.id)&&oldById.get(o.id).payment_status!=='pago');if(paid)toast('✅ Pagamento confirmado · retirada #'+(paid.num||''));}
    }
    if(signature!==nextSignature&&currentPage==='caixa')renderCaixa();
  }catch(e){console.error(e);if(!silent)toast(pdvErr(e));}
  finally{PDV.pickupLoading=false;}
}
function pdvStartPickupUpdates(){
  clearInterval(PDV.pickupTimer);
  PDV.pickupTimer=setInterval(()=>{if(currentPage==='caixa'){pdvLoadPickupQueue(true);if(!PDV.delivPixUnavailable)pdvLoadDeliveryPixQueue(false);pdvDelivCount();}},10000);
  pdvDelivCount();pdvLoadDeliveryPixQueue(true);
}
// mantém na fila de entrega do PDV apenas os pedidos do dia (fila/rota/entregues de hoje)
function pdvDelivKeepToday(d){
  if(!d) return d;
  const t0=new Date(); t0.setHours(0,0,0,0);
  const isToday=ts=>{ if(!ts) return false; const x=new Date(ts); return !isNaN(x)&&x.getTime()>=t0.getTime(); };
  d.fila=(d.fila||[]).filter(x=>isToday(x.created_at));
  d.rota=(d.rota||[]).filter(x=>isToday(x.dispatched_at||x.created_at));
  d.entregues=(d.entregues||[]).filter(x=>isToday(x.delivered_at||x.created_at));
  const temposMed=d.entregues.map(x=>+x.minutos_entrega).filter(v=>v||v===0);
  d.resumo=Object.assign({},d.resumo,{
    fila:d.fila.length, rota:d.rota.length, entregues:d.entregues.length,
    valor_entregue:d.entregues.reduce((a,x)=>a+(+x.total||0),0),
    a_receber_rota:d.rota.filter(x=>!x.pago).reduce((a,x)=>a+(+x.total||0),0),
    tempo_medio:temposMed.length?Math.round(temposMed.reduce((a,b)=>a+b,0)/temposMed.length):null
  });
  return d;
}
async function pdvDelivCount(){
  try{
    const {data}=await sb.rpc('erp_courier_queue',{p_dias:1});
    const r=(pdvDelivKeepToday(data||{}).resumo)||{}; const n=(+r.fila||0)+(+r.rota||0);
    if(n!==PDV.delivN){ PDV.delivN=n; if(currentPage==='caixa'&&!document.getElementById('pdvOv'))renderCaixa(); }
  }catch(e){}
}
function pdvStopPickupUpdates(){clearInterval(PDV.pickupTimer);PDV.pickupTimer=null;}

/* ---------- tela ---------- */
function renderCaixa(){
  const el=document.getElementById('caixaBody');if(!el)return;
  if(!sb||!isCashier()){
    el.innerHTML='<div class="pdv"><div class="pdv-empty" style="color:#fff;margin:auto">🔒 Área restrita ao operador de caixa.<br><br>'
      +'<button class="pdv-btn" data-onclick="exitPdv()">Voltar</button></div></div>';
    return;
  }
  const t=pdvTotals(),open=!!(PDV.ses&&PDV.ses.status==='aberto'),readyPix=pdvDeliveryPixReady().length;
  const cust=PDV.cust;
  const rows=PDV.items.map((it,i)=>{
    const line=round2(it.price*it.qty-(+it.disc||0));
    return '<tr class="'+(PDV.sel===i?'sel':'')+'" data-onclick="pdvSel('+i+')">'
      +'<td>'+(i+1)+'</td><td>'+esc(it.ean||it.id.slice(0,8))+'</td>'
      +'<td>'+esc(it.name)+(it.disc>0?' <span class="disc">− '+BRL(it.disc)+'</span>':'')+'</td>'
      +'<td class="r">'+(it.kg?pdvQ(it.qty,3):pdvQ(it.qty,0))+'</td>'
      +'<td>'+(it.kg?'KG':'UN')+'</td>'
      +'<td class="r">'+BRL(it.price)+'</td>'
      +'<td class="r"><b>'+BRL(line)+'</b></td></tr>';
  }).join('');

  el.innerHTML=
  '<div class="pdv">'
  +'<div class="pdv-head">'
    +'<div class="pdv-net" id="offlineBadge" title="Estado da conexão" data-onclick="pdvOfflineTapSync()">● Online</div>'
    +'<div class="h-fields">'
      +'<div class="pdv-cons">CONSUMIDOR: <b>'+esc(cust?cust.name:'')+'</b>'
        +(cust?' <span style="font-size:13px;font-weight:700;opacity:.9">· cashback '+BRL(cust.cashback||0)
          +(cust.member?' · 🎫 assinante':'')+'</span>':'')+'</div>'
      +'<div class="pdv-row">'
        +'<div class="pdv-code-col"><label class="pdv-lbl">Código ou Código de Barra</label>'
          +'<input class="pdv-in" id="pdvCode" autocomplete="off" '+(open?'':'disabled')+'></div>'
        +'<div style="flex:1"><label class="pdv-lbl">Descrição</label>'
          +'<input class="pdv-in" id="pdvDesc" value="'+esc(PDV.sel>=0&&PDV.items[PDV.sel]?PDV.items[PDV.sel].name:'')+'" disabled></div>'
      +'</div>'
    +'</div>'
  +'</div>'

  +'<div class="pdv-body">'
    +'<div class="pdv-side">'
      +'<div class="fld"><label class="pdv-lbl">Quantidade/Kg</label>'
        +'<input class="pdv-in num" id="pdvQty" value="1" '+(open?'':'disabled')+'></div>'
      +'<div class="fld"><label class="pdv-lbl">Preço unitário/Kg R$</label>'
        +'<input class="pdv-in num" id="pdvUnitPrice" value="0,00" disabled></div>'
      +'<div class="fld"><label class="pdv-lbl">Preço total R$</label>'
        +'<input class="pdv-in num" id="pdvLineTotal" value="0,00" '+(open?'':'disabled')
        +' title="Para itens por peso: digite o valor em R$ e pressione Enter para calcular o peso"></div>'
      +pdvOpportunitiesHtml()
      +'<div class="pdv-keys">'
        +pdvKeyBtn('Ctrl+E',readyPix?'Entrega · PIX pago ('+readyPix+')':'Entrega','pdvDeliveryAction()',open&&can('pdv_entrega')&&(PDV.items.length>0||readyPix>0),'wide '+(readyPix?'delivery-ready':''))
        +pdvKeyBtn('F1','Informar Consumidor','pdvCustomerModal()',open)
        +pdvKeyBtn('F2','Buscar Produto','pdvSearchModal()',open)
        +pdvKeyBtn('F3','Consultar Preço','pdvPriceModal()',true)
        +pdvKeyBtn('F4','Cancelar Item','pdvDelItem()',open&&PDV.items.length>0)
        +pdvKeyBtn('F5','Desconto Item','pdvItemDiscount()',open&&PDV.items.length>0&&can('pdv_desconto'))
        +pdvKeyBtn('F6','Cancelar Venda','pdvCancelSale()',open&&PDV.items.length>0&&can('pdv_cancelar'))
        +pdvKeyBtn('F7','Finalizar Venda','pdvFinishModal()',open&&PDV.items.length>0)
        +pdvKeyBtn('F8',PDV.items.length?'Venda em Espera':'Chamar Espera','pdvHoldOrResume()',open&&(PDV.items.length>0||PDV.held.length>0))
        +pdvKeyBtn('F9','Suprimento','pdvMoveModal(\'suprimento\')',open&&can('pdv_suprimento'))
        +pdvKeyBtn('F10','Sangria','pdvMoveModal(\'sangria\')',open&&can('pdv_sangria'))
        +pdvKeyBtn('F11','Abrir Caixa','pdvOpenModal()',!open)
        +pdvKeyBtn('F12','Fechar Caixa','pdvCloseModal2()',open&&can('pdv_fechar'))
      +'</div>'
    +'</div>'

    +'<div class="pdv-work">'
    +'<div class="pdv-grid">'+pdvPickupQueueHtml()+pdvDeliveryPixQueueHtml()+'<div class="g-scroll'+(PDV.items.length?'':' empty')+'">'
      +(PDV.items.length
        ?'<table><thead><tr><th>Item</th><th>Código</th><th>Descrição</th>'
          +'<th class="r">Quantidade</th><th>Unidade</th><th class="r">Unitário/Kg R$</th>'
          +'<th class="r">Total do item</th></tr></thead><tbody>'+rows+'</tbody></table>'
        :'<div class="pdv-empty">'+(open
            ?'Passe o produto no leitor ou digite o código e pressione <b>Enter</b>.<br>'
             +'Sem código em mãos? <b>F2</b> abre a busca por nome.'
            :'O caixa está fechado.<br>Pressione <b>F11</b> para abrir e informar o troco inicial.')
          +'</div>')
    +'</div></div>'
    +'<div class="pdv-foot">'
    +'<div class="cell"><label class="pdv-lbl">Itens</label>'
      +'<input class="pdv-in num" value="'+t.n+'" disabled></div>'
    +'<div class="cell"><label class="pdv-lbl">Desconto R$</label>'
      +'<input class="pdv-in num" value="'+(t.idisc+t.manual+t.mdisc).toFixed(2).replace('.',',')+'" disabled></div>'
    +'<div class="cell"><label class="pdv-lbl">Acréscimo R$</label>'
      +'<input class="pdv-in num" value="'+t.sur.toFixed(2).replace('.',',')+'" disabled></div>'
    +'<div class="cell total">'+(t.cb>0?'<small>cashback − '+BRL(t.cb)+'</small>':'')
      +'<small>TOTAL R$</small>'+t.total.toFixed(2).replace('.',',')+'</div>'
    +'</div>'
    +'</div>'
  +'</div>'

  +'<div class="pdv-bar">'
    +'<span class="dot '+(open?'on':'')+'"></span>'
    +'<span>PDV: <b>'+esc(PDV.terminal)+'</b></span><span class="sep">|</span>'
    +'<span>Operador: <b>'+esc((ME&&ME.name)||'—')+'</b></span>'
    +'<span class="grow"></span>'
    +'<div class="pdv-actions">'
      +(typeof pdvOfflineBadgeHtml==='function'?pdvOfflineBadgeHtml():'')
      +(PDV.pix?'<button class="pdv-action" style="background:#7b5c00" data-onclick="pdvPixModal();pdvPollPix()">⚡ PIX aguardando</button>':'')
      +(can('pdv_vendas')?'<button class="pdv-action" data-onclick="pdvLastSalesModal()">🧾 Vendas</button>':'')
      +(can('pdv_crediario')?'<button class="pdv-action" data-onclick="pdvCrediarioModal()">🧾 Crediário</button>':'')
      +'<button class="pdv-action" data-onclick="cfdPairModal()" title="Segunda tela do cliente (tablet/monitor) — carrinho ao vivo e CPF/cashback">📺 Vitrine</button>'
      +'<button class="pdv-action" data-onclick="pdvHeldModal()">⏸ Espera '+(PDV.held.length?'<span class="pdv-chip">'+PDV.held.length+'</span>':'')+'</button>'
      +(can('pdv_fila')?'<button class="pdv-action '+(readyPix?'attention':'')+'" data-onclick="'+(readyPix?'pdvDeliveryPixQueueModal()':'pdvDeliveryQueue()')+'">🚚 '+(readyPix?'PIX pago · preparar entrega':'Fila de entrega')+' '+((readyPix||PDV.delivN||0)?'<span class="pdv-chip">'+(readyPix||PDV.delivN)+'</span>':'')+'</button>':'')
    +'</div>'
    +'<a data-onclick="pdvExit()" style="color:#fff;cursor:pointer;font-weight:800">Sair do caixa ✕</a>'
    +'<span class="sep">|</span><span id="pdvClock"></span>'
  +'</div></div>';

  pdvClock();
  const c=document.getElementById('pdvCode');
  if(c&&open&&!document.getElementById('pdvOv'))c.focus();
  pdvSyncFields();
  updateOfflineBadge();   // pinta a pílula Online/Offline recém-recriada no cabeçalho
  cfdEnsure(); cfdPublish();   // espelha o carrinho na 2ª tela (vitrine.html), se houver
}
// Tocar/clicar na pílula força uma tentativa de sincronização (quando online e há fila).
window.pdvOfflineTapSync = function(){
  let nOps=0; try{ nOps=_opsRead().length; }catch(e){}
  if(OFFLINE_MEM.length||nOps){ pdvOfflineQueueModal(); return; }   // há fila → abre a tela de detalhe
  if(!navigator.onLine){ toast('Sem internet · as vendas estão salvas e sincronizam ao reconectar'); return; }
  toast('Tudo sincronizado ✅');
};
// Soma de exibição do total de uma venda offline (a partir dos pagamentos do payload).
function _offlineSaleTotal(item){
  try{ return (item.payload.payments||[]).reduce((a,p)=>a+(+p.v||0),0); }catch(e){ return 0; }
}
// Tela da fila offline: lista vendas pendentes/erradas + operações, com sincronizar e descartar.
window.pdvOfflineQueueModal = function(){
  const online=navigator.onLine;
  const sales=OFFLINE_MEM.slice().sort((a,b)=>(a.at||0)-(b.at||0));
  let ops=[]; try{ ops=_opsRead(); }catch(e){}
  const hhmm=t=>t?new Date(t).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'';
  const salesHtml = sales.length ? sales.map(s=>{
    const err=!!s.err;
    return '<div class="m-row" style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--hair,#eee2)">'
      +'<div style="flex:1;min-width:0">'
        +'<div style="font-weight:700">'+BRL(_offlineSaleTotal(s))+' <span style="font-weight:600;opacity:.7;font-size:12px">· '+hhmm(s.at)+'</span></div>'
        +'<div style="font-size:12px">'+(err
            ?'<span class="chip" style="background:#fbe7e7;color:#a32d2d">⚠ '+esc(String(s.err).slice(0,80))+'</span>'
            :'<span class="chip" style="background:#fbefd9;color:#8a5406">na fila</span>')+'</div>'
      +'</div>'
      +'<button class="btn ghost sm red" data-onclick="pdvOfflineDiscard(\''+s.client_id+'\')">Descartar</button>'
    +'</div>';
  }).join('') : '<p class="muted" style="text-align:center;padding:14px 0">Nenhuma venda na fila ✅</p>';
  const opsHtml = ops.length
    ? '<p style="margin-top:12px;font-size:13px" class="muted">'+ops.length+' operação(ões) pendente(s): '
       +ops.map(o=>o.kind==='customer'?'cadastro de cliente':(o.mkind==='sangria'?'sangria':'suprimento')).join(', ')+'.</p>'
    : '';
  const withErr=sales.filter(s=>s.err).length;
  modal('<div class="m-head"><h3>Fila offline</h3><button data-modal-close>✕</button></div>'
    +'<div class="m-body" style="max-height:56vh;overflow:auto">'
      +(withErr?'<p style="font-size:13px;margin:0 0 8px" class="muted">'+withErr+' venda(s) com erro ao sincronizar — verifique o motivo e re-tente, ou descarte se já foi registrada.</p>':'')
      +'<div style="font-weight:700;margin:2px 0 4px">Vendas ('+sales.length+')</div>'
      +salesHtml+opsHtml
      +'<p style="font-size:12px;margin-top:12px" class="muted">'+(online?'Conectado.':'Sem internet — sincroniza sozinho ao reconectar.')
        +' Descartar apaga a venda deste aparelho e não pode ser desfeito.</p>'
    +'</div>'
    +'<div class="m-foot"><button class="btn ghost" data-modal-close>Fechar</button>'
      +(online&&(sales.length||ops.length)?'<button class="btn" data-onclick="pdvOfflineSyncFromModal()">Sincronizar agora</button>':'')
    +'</div>');
};
window.pdvOfflineSyncFromModal = async function(){
  toast('Sincronizando…'); await flushOffline(); await flushOps();
  if(OFFLINE_MEM.length||_opsCount()) pdvOfflineQueueModal(); else { closeModal(); }
};
window.pdvOfflineDiscard = async function(client_id){
  const it=OFFLINE_MEM.find(x=>x.client_id===client_id);
  const val=it?BRL(_offlineSaleTotal(it)):'';
  if(!await uiConfirm('Descartar esta venda offline'+(val?(' de '+val):'')+'? Ela não será registrada. Use só se já foi lançada de outra forma.',{danger:true,okText:'Descartar',cancelText:'Manter'})) return;
  _offlineRemove(client_id); toast('Venda offline descartada'); pdvOfflineQueueModal();
};

// ===================== VITRINE · 2ª TELA (Customer-Facing Display) =====================
// Espelha o carrinho em uma segunda tela (tablet ou monitor) por Realtime broadcast.
// Canal = caixa + código aleatório de pareamento obrigatório.
// A vitrine SÓ EXIBE: não acessa o banco. Quando o cliente digita o CPF lá, o pedido
// chega aqui e ESTE caixa (autenticado) faz a busca com pdv_find_customer e anexa o
// cliente à venda — devolvendo à vitrine apenas primeiro nome + saldo de cashback.
let CFD_CHAN=null, CFD_KEY=null, CFD_LASTPAY=null, CFD_PAYAMT=0;
function cfdFirstName(n){ return String(n||'').trim().split(/\s+/)[0]||''; }
// Código de pareamento (por caixa): entra no NOME do canal. Sem ele, quem tiver a
// chave pública poderia "escutar" o canal; com ele, só quem sabe o código recebe.
function cfdSecret(){ try{ const k='petapp_cfd_secret_'+(PDV.terminal||'CAIXA-1'); let s=(localStorage.getItem(k)||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase(); if(s.length<16){s=cfdGenSecret();localStorage.setItem(k,s);} return s; }catch(e){ return ''; } }
function cfdChanName(){ const s=cfdSecret(); return s?'cfd-'+(PDV.terminal||'CAIXA-1')+'-'+s:''; }
function cfdEnsure(){
  if(typeof sb==='undefined'||!sb) return;
  const name=cfdChanName();
  if(!name) return;
  if(CFD_CHAN && CFD_KEY===name) return;             // já conectado ao caixa+código certo
  if(CFD_CHAN){ try{ sb.removeChannel(CFD_CHAN); }catch(e){} CFD_CHAN=null; }
  CFD_KEY=name;
  CFD_CHAN=sb.channel(name,{ config:{ broadcast:{ self:false } } })
    .on('broadcast',{event:'hello'}, ()=>{ cfdPublish(); if(CFD_LASTPAY) cfdPay(CFD_LASTPAY); })   // vitrine conectou → estado atual (+ pagamento em curso)
    .on('broadcast',{event:'cpf'},   m=> cfdOnCpf((m.payload||{}).cpf))
    .subscribe();
}
// ----- pareamento da vitrine (ver/gerar/copiar o código) -----
function cfdGenSecret(){ const abc='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',buf=new Uint8Array(16); crypto.getRandomValues(buf); return [...buf].map(x=>abc[x%abc.length]).join(''); }
function cfdSetSecret(v){ try{ localStorage.setItem('petapp_cfd_secret_'+(PDV.terminal||'CAIXA-1'),(v||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase()); }catch(e){} }
function cfdPairModal(){
  const sec=cfdSecret(), caixa=esc(PDV.terminal||'CAIXA-1');
  pdvModal('📺 Vitrine · 2ª tela do cliente',
    '<div class="pdv-note" style="margin-bottom:12px">Abra <b>vitrine.html</b> no tablet ou na 2ª tela, toque no ⚙️ e informe os dois códigos abaixo. Só quem tiver o <b>código de pareamento</b> recebe os dados deste caixa.</div>'
    +'<div class="pdv-row" style="gap:22px;flex-wrap:wrap;margin-bottom:6px">'
      +'<div><label class="pdv-lbl">Código do caixa</label><div class="pdv-in" style="font-size:22px;font-weight:800;letter-spacing:2px">'+caixa+'</div></div>'
      +'<div><label class="pdv-lbl">Código de pareamento obrigatório</label><div class="pdv-in" style="font-size:18px;font-weight:800;letter-spacing:3px">'+esc(sec)+'</div></div>'
    +'</div>'
    +'<div class="pdv-btns">'
      +'<button class="pdv-btn" data-onclick="cfdCopyPair()">📋 Copiar</button>'
      +'<button class="pdv-btn ghost" data-onclick="cfdRegen()">🔄 Gerar novo código</button>'
    +'</div>'
    +'<div class="pdv-note" style="margin-top:10px">Ao gerar/alterar o código, atualize também na vitrine para ela reconectar.</div>');
}
function cfdRegen(){ cfdSetSecret(cfdGenSecret()); cfdEnsure(); cfdPublish(); cfdPairModal(); }
function cfdCopyPair(){ const txt='Vitrine → Caixa: '+(PDV.terminal||'CAIXA-1')+' · Pareamento: '+cfdSecret();
  try{ navigator.clipboard.writeText(txt); toast('Copiado ✓'); }catch(e){ toast('Copie manualmente: '+txt); } }
function cfdPublish(){
  if(!CFD_CHAN) return;
  const t=pdvTotals();
  const payload={
    items:PDV.items.map(i=>({name:i.name,qty:i.qty,price:i.price,disc:+i.disc||0})),
    total:t.total, subtotal:t.sub,
    cust:(PDV.cust&&PDV.cust.name)?{name:cfdFirstName(PDV.cust.name),cashback:PDV.cust.cashback||0}:null
  };
  try{ CFD_CHAN.send({ type:'broadcast', event:'state', payload }); }catch(e){}
}
async function cfdOnCpf(raw){
  const q=String(raw||'').replace(/\D/g,'');
  if(q.length<3){ cfdReply({found:false}); return; }
  try{
    const {data,error}=await sb.rpc('pdv_find_customer',{p_q:q});
    if(error) throw error;
    const list=data||[];
    if(!list.length){ cfdReply({found:false}); return; }
    const c=list[0];
    if(c.blocked){ cfdReply({found:true,blocked:true}); return; }
    pdvSetCustomer(c);   // anexa ao caixa; renderCaixa() republica o estado com o cliente
  }catch(e){ console.warn('cfdOnCpf',e); cfdReply({found:false}); }
}
function cfdReply(p){ if(CFD_CHAN){ try{ CFD_CHAN.send({type:'broadcast',event:'cpf_result',payload:p}); }catch(e){} } }
// Estado do pagamento para a vitrine: pix_wait (QR), card_wait (aguardando cartão),
// approved, declined, clear. Guarda o último estado "em espera" para reenviar se a
// vitrine reconectar no meio da cobrança.
function cfdPay(p){
  CFD_LASTPAY = (p && (p.status==='pix_wait'||p.status==='card_wait')) ? p : null;
  if(CFD_CHAN){ try{ CFD_CHAN.send({ type:'broadcast', event:'pay', payload:p }); }catch(e){} }
}

function pdvHoldOrResume(){if(PDV.items.length)pdvHoldSale();else pdvHeldModal();}
function pdvDeliveryAction(){
  if(PDV.delivPixDraft){pdvRenderDelivery();return;}
  const ready=pdvDeliveryPixReady();
  if(ready.length===1&&!PDV.items.length){pdvRestorePaidDelivery(ready[0].id);return;}
  if(ready.length){pdvDeliveryPixQueueModal();return;}
  pdvDeliveryModal();
}
function pdvKeyBtn(k,label,fn,on,extraClass){
  return '<button class="pdv-key '+esc(extraClass||'')+'" data-onclick="'+fn+'" '+(on?'':'disabled')+'>'
    +'<span>('+k+')</span>'+esc(label)+'</button>';
}
function pdvSyncFields(){
  const it=PDV.items[PDV.sel];
  const u=document.getElementById('pdvUnitPrice'),l=document.getElementById('pdvLineTotal');
  if(u)u.value=it?it.price.toFixed(2).replace('.',','):'0,00';
  if(l)l.value=it?round2(it.price*it.qty-(+it.disc||0)).toFixed(2).replace('.',','):'0,00';
}
function pdvClock(){
  const el=document.getElementById('pdvClock');if(!el)return;
  const d=new Date();
  const p=n=>String(n).padStart(2,'0');
  el.textContent=p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+d.getFullYear()+' '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds());
}
setInterval(()=>{if(currentPage==='caixa')pdvClock();},1000);

/* ---------- entrada pelo teclado / leitor ---------- */
function pdvCodeEnter(){
  if(PDV.pix){pdvPixModal();return;}
  const inp=document.getElementById('pdvCode');if(!inp)return;
  const raw=inp.value.trim();if(!raw)return;
  inp.value='';
  // QR do cliente lido pelo leitor 2D
  if(/^PETAPP:/i.test(raw)){pdvLookupCustomer(raw);return;}
  if(/^petshop:order:/i.test(raw)){pdvPickupFromCode(raw);return;}
  // etiqueta de balança (peso/preço embutido)
  const sc=pdvParseScale(raw);
  if(sc){
    if(sc.notFound){ toast('Etiqueta de balança: produto '+sc.code+' não encontrado. Confira o EAN cadastrado.',true); return; }
    if(pdvAddItem(sc.p.id,sc.vid,sc.qty)){
      const q2=document.getElementById('pdvQty');if(q2)q2.value='1';
      toast(sc.p.name+' · '+(pdvIsKg(sc.p)?pdvQ(sc.qty,3)+' kg':pdvQ(sc.qty,0)+' un'));
    }
    return;
  }
  const qEl=document.getElementById('pdvQty');
  let qty=pdvNum(qEl?qEl.value:1)||1;
  const hit=pdvFindByCode(raw);
  if(hit){
    pdvAddItem(hit.p.id,hit.vid,qty);
    const q2=document.getElementById('pdvQty');if(q2)q2.value='1';
    return;
  }
  pdvSearchModal(raw);
}
function pdvLineTotalEnter(){
  const it=PDV.items[PDV.sel];
  const el=document.getElementById('pdvLineTotal');if(!el)return;
  const v=pdvNum(el.value);
  if(!it||!it.kg){pdvSyncFields();toast('Digite o valor em R$ só em itens vendidos por peso');return;}
  if(v<=0||!(it.price>0)){pdvSyncFields();return;}
  it.qty=round2(v/it.price*1000)/1000;
  renderCaixa();
  toast('Peso calculado: '+pdvQ(it.qty,3)+' kg');
}
function pdvKeys(e){
  if(currentPage!=='caixa')return;
  const modal=!!document.getElementById('pdvOv');
  if(e.key==='Escape'){if(modal){e.preventDefault();pdvCloseModal();}return;}
  if(e.key==='Enter'&&!modal){
    const id=document.activeElement&&document.activeElement.id;
    if(id==='pdvCode'){e.preventDefault();pdvCodeEnter();return;}
    if(id==='pdvLineTotal'){e.preventDefault();pdvLineTotalEnter();return;}
  }
  if((e.ctrlKey||e.metaKey)&&(e.key==='e'||e.key==='E')){
    if(modal)return;
    const aberto=!!(PDV.ses&&PDV.ses.status==='aberto');
    if(!aberto||(!PDV.items.length&&!pdvDeliveryPixReady().length)||!can('pdv_entrega'))return;
    e.preventDefault();pdvDeliveryAction();return;
  }
  if((e.ctrlKey||e.metaKey)&&(e.key==='l'||e.key==='L')){
    if(modal)return;
    const aberto=!!(PDV.ses&&PDV.ses.status==='aberto');
    if(!aberto||!can('pdv_leiturax'))return;
    e.preventDefault();pdvXReport();return;
  }
  if(!/^F([1-9]|1[0-2])$/.test(e.key))return;
  if(PDV.pix){e.preventDefault();pdvPixModal();return;}
  const open=!!(PDV.ses&&PDV.ses.status==='aberto');
  const map={
    F1:()=>open&&pdvCustomerModal(), F2:()=>open&&pdvSearchModal(),
    F3:()=>pdvPriceModal(),          F4:()=>open&&pdvDelItem(),
    F5:()=>open&&can('pdv_desconto')&&pdvItemDiscount(),  F6:()=>open&&can('pdv_cancelar')&&pdvCancelSale(),
    F7:()=>open&&pdvFinishModal(),   F8:()=>open&&pdvHoldOrResume(),
    F9:()=>open&&can('pdv_suprimento')&&pdvMoveModal('suprimento'), F10:()=>open&&can('pdv_sangria')&&pdvMoveModal('sangria'),
    F11:()=>!open&&pdvOpenModal(),   F12:()=>open&&can('pdv_fechar')&&pdvCloseModal2()
  };
  const fn=map[e.key];if(!fn)return;
  if(modal&&e.key!=='F7')return;
  e.preventDefault();fn();
}
function pdvBindKeys(){
  if(PDV.keysOn)return;
  document.addEventListener('keydown',pdvKeys,true);
  PDV.keysOn=true;
}

/* ---------- modais ---------- */
function pdvModal(title,body,wide){
  const opener=document.activeElement;pdvCloseModal(false);PDV_MODAL_RETURN_FOCUS=opener;
  const d=document.createElement('div');
  d.className='pdv-ov';d.id='pdvOv';
  d.innerHTML='<div class="pdv-mod" style="'+(wide?'width:min(1100px,100%)':'')+'">'
    +'<div class="m-head"><h3>'+esc(title)+'</h3><button data-pdv-close>✕ (ESC)</button></div>'
    +'<div class="m-body">'+body+'</div></div>';
  const dialog=d.querySelector('.pdv-mod');prepareDialog(dialog,title);
  d.addEventListener('mousedown',ev=>{if(ev.target===d)pdvCloseModal();});
  d.addEventListener('click',ev=>{if(ev.target.closest('[data-pdv-close]'))pdvCloseModal();});
  d._a11yKey=ev=>{if(ev.key==='Tab')trapDialogTab(dialog,ev);};document.addEventListener('keydown',d._a11yKey);
  document.body.appendChild(d);
  const f=d.querySelector('input,select,textarea');if(f)f.focus();
  return d;
}
let PDV_MODAL_RETURN_FOCUS=null;
function pdvCloseModal(restore=true){
  pdvStopScan();
  const d=document.getElementById('pdvOv');if(d){if(d._a11yKey)document.removeEventListener('keydown',d._a11yKey);d.remove();}
  const back=PDV_MODAL_RETURN_FOCUS;PDV_MODAL_RETURN_FOCUS=null;
  if(restore&&back&&back.isConnected)back.focus();else{const c=document.getElementById('pdvCode');if(c&&currentPage==='caixa')c.focus();}
}

/* ---------- F2 · buscar produto ---------- */
function pdvSearchModal(q){
  pdvModal('Selecione Produto',
    '<label class="pdv-lbl">Buscar Produto</label>'
    +'<div style="display:flex;gap:12px;align-items:center;margin-bottom:12px">'
      +'<input class="pdv-in" id="pdvSq" value="'+esc(q||'')+'" data-oninput="pdvSearchRender()" autocomplete="off" style="flex:1">'
      +'<label style="display:flex;gap:7px;align-items:center;white-space:nowrap;font-weight:700">'
        +'<input type="checkbox" id="pdvSqStock" data-onchange="pdvSearchRender()" style="width:18px;height:18px"> Apenas estoque positivo</label>'
    +'</div>'
    +'<div class="pdv-list" id="pdvSqList"></div>'
    +'<div class="pdv-note" style="margin-top:10px">Clique no produto para incluir na venda. Quantidade atual: '
      +'<b>'+esc((document.getElementById('pdvQty')||{}).value||'1')+'</b></div>',true);
  pdvSearchRender();
}
function pdvSearchRender(){
  const el=document.getElementById('pdvSqList');if(!el)return;
  const q=(document.getElementById('pdvSq')||{}).value||'';
  const only=!!(document.getElementById('pdvSqStock')||{}).checked;
  const list=pdvSearch(q,only).slice(0,300);
  if(!list.length){el.innerHTML='<div style="padding:22px;text-align:center;color:#8a99bd">Nenhum produto encontrado.</div>';return;}
  el.innerHTML='<table><thead><tr><th>Código</th><th>Nome</th><th>Embalagem</th>'
    +'<th class="r">Venda R$</th><th>Marca</th><th class="r">Estoque</th></tr></thead><tbody>'
    +list.map(r=>{
      const st=r.stock==null?'—':pdvQ(r.stock,0);
      return '<tr data-onclick="pdvPickProduct(\''+r.p.id+'\',\''+r.vid+'\')">'
        +'<td>'+esc((r.ean||r.p.id).toString().slice(0,14))+'</td>'
        +'<td>'+esc(r.name)+'</td><td>'+pdvUnit(r.p)+'</td>'
        +'<td class="r">'+BRL(r.price)+'</td><td>'+esc(r.p.brand||'')+'</td>'
        +'<td class="r '+((r.stock!=null&&r.stock<=0)?'neg':'')+'">'+st+'</td></tr>';
    }).join('')+'</tbody></table>';
}
function pdvPickProduct(pid,vid){
  const qEl=document.getElementById('pdvQty');
  const qty=pdvNum(qEl?qEl.value:1)||1;
  pdvCloseModal();
  pdvAddItem(pid,vid,qty);
  const q2=document.getElementById('pdvQty');if(q2)q2.value='1';
}

/* ---------- F3 · consultar preço ---------- */
function pdvPriceModal(){
  pdvModal('Consultar Preço',
    '<label class="pdv-lbl">Código de barras ou nome</label>'
    +'<input class="pdv-in" id="pdvPq" data-oninput="pdvPriceRender()" autocomplete="off">'
    +'<div class="pdv-list" id="pdvPqList" style="margin-top:12px"></div>',true);
  pdvPriceRender();
}
function pdvPriceRender(){
  const el=document.getElementById('pdvPqList');if(!el)return;
  const q=(document.getElementById('pdvPq')||{}).value||'';
  if(!q.trim()){el.innerHTML='<div style="padding:22px;text-align:center;color:#8a99bd">Digite para consultar.</div>';return;}
  const list=pdvSearch(q,false).slice(0,60);
  if(!list.length){el.innerHTML='<div style="padding:22px;text-align:center;color:#8a99bd">Nada encontrado.</div>';return;}
  el.innerHTML='<table><thead><tr><th>Nome</th><th class="r">Preço</th><th class="r">Estoque</th></tr></thead><tbody>'
    +list.map(r=>'<tr><td>'+esc(r.name)+'</td><td class="r"><b>'+BRL(r.price)+'</b></td>'
      +'<td class="r">'+(r.stock==null?'—':pdvQ(r.stock,0))+'</td></tr>').join('')+'</tbody></table>';
}

/* ---------- F5 · desconto no item ---------- */
function pdvItemDiscount(){
  if(!can('pdv_desconto')){toast('Você não tem permissão para aplicar desconto');return;}
  const i=PDV.sel,it=PDV.items[i];
  if(!it){toast('Selecione um item na lista');return;}
  const line=round2(it.price*it.qty);
  pdvModal('Desconto no Item',
    '<div class="pdv-sum"><div class="l"><span>'+esc(it.name)+'</span><b>'+BRL(line)+'</b></div></div>'
    +'<div class="pdv-row" style="gap:12px">'
      +'<div style="flex:1"><label class="pdv-lbl">Desconto R$</label>'
        +'<input class="pdv-in num" id="pdvIdR" value="'+(+it.disc||0).toFixed(2).replace('.',',')+'"></div>'
      +'<div style="flex:1"><label class="pdv-lbl">ou desconto %</label>'
        +'<input class="pdv-in num" id="pdvIdP" value="0,00"></div>'
    +'</div>'
    +'<div class="pdv-btns"><button class="pdv-btn" data-onclick="pdvApplyItemDiscount('+i+','+line+')">Aplicar</button>'
    +'<button class="pdv-btn ghost" data-pdv-close>Cancelar</button></div>');
}
function pdvApplyItemDiscount(i,line){
  const it=PDV.items[i];if(!it)return;
  const p=pdvNum((document.getElementById('pdvIdP')||{}).value);
  let d=pdvNum((document.getElementById('pdvIdR')||{}).value);
  if(p>0)d=round2(line*p/100);
  if(d<0)d=0;
  if(d>line){toast('O desconto não pode ser maior que o item');return;}
  it.disc=round2(d);
  pdvCloseModal();renderCaixa();
}

/* ---------- F6 · cancelar venda ---------- */
async function pdvCancelSale(){
  if(!can('pdv_cancelar')){toast('Você não tem permissão para cancelar a venda');return;}
  if(!PDV.items.length)return;
  if(!await uiConfirm('Cancelar toda a venda em andamento?',{danger:true,okText:'Cancelar venda',cancelText:'Voltar'}))return;
  pdvResetDraft();
  renderCaixa();toast('Venda cancelada');
}

/* ---------- F1 · informar consumidor ---------- */
function pdvCustomerModal(){
  const c=PDV.cust;
  pdvModal('Informar Consumidor',
    '<div class="pdv-row" style="gap:12px">'
      +'<div style="flex:1"><label class="pdv-lbl">CPF, telefone, e-mail ou nome</label>'
        +'<input class="pdv-in" id="pdvCq" autocomplete="off" placeholder="000.000.000-00"></div>'
      +'<div style="flex:0 0 190px;display:flex;align-items:flex-end">'
        +'<button class="pdv-btn" style="width:100%" data-onclick="pdvLookupCustomer()">Buscar (ENTER)</button></div>'
    +'</div>'
    +'<div class="pdv-note" style="margin:8px 0 12px">Ou peça o <b>QR do app</b> ao cliente: leia com o leitor 2D neste campo, '
      +'ou use a câmera pelo botão abaixo.</div>'
    +'<div class="pdv-btns" style="margin-top:0">'
      +'<button class="pdv-btn" data-onclick="pdvScan()">📷 Ler QR do app</button>'
      +'<button class="pdv-btn" data-onclick="pdvQuickCustomerModal(\'customer\')">Cadastrar cliente</button>'
      +(EDGE_CAPS['pdv-customer-express']
        ?'<button class="pdv-btn" data-onclick="pdvExpressCustomerModal()">⚡ Cadastro expresso</button>'
        :'<button class="pdv-btn ghost" disabled title="Integração ainda não publicada">⚡ Cadastro expresso indisponível</button>')
      +(c?'<button class="pdv-btn ghost" data-onclick="pdvClearCustomer()">Remover Cliente (F4)</button>':'')
    +'</div>'
    +'<div id="pdvCamBox" style="margin-top:12px"></div>'
    +'<div id="pdvCqList" style="margin-top:12px"></div>'
    +'<div class="pdv-note" style="margin-top:14px;border-top:1px solid #2a4da8;padding-top:10px">'
      +(EDGE_CAPS['pdv-customer-express']
        ?'Sem cadastro? Use <b>Cadastro expresso</b>: nome + WhatsApp agora; o cliente recebe o acesso mágico e completa depois.'
        :'Cadastro expresso aguardando publicação no servidor. Use o cadastro normal de clientes por enquanto.')
      +'</div>');
  const inp=document.getElementById('pdvCq');
  if(inp)inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();pdvLookupCustomer();}});
}
function pdvExpressCustomerModal(){
  pdvModal('Cadastro expresso',
    '<div class="pdv-note" style="margin-bottom:12px">Crie o cadastro sem senha. O cashback desta venda já ficará ligado ao cliente.</div>'
    +'<label class="pdv-lbl">Nome *</label><input class="pdv-in" id="pdvExName" autocomplete="name" placeholder="Nome do cliente">'
    +'<label class="pdv-lbl" style="margin-top:10px">WhatsApp *</label><input class="pdv-in" id="pdvExPhone" inputmode="tel" placeholder="(24) 99999-9999">'
    +'<label style="display:flex;gap:8px;align-items:flex-start;margin-top:12px;font-size:12px"><input type="checkbox" id="pdvExOk" style="width:18px;height:18px;flex:none"> Cliente autorizou receber no WhatsApp o link de acesso ao app.</label>'
    +'<div class="pdv-btns"><button class="pdv-btn" id="pdvExGo" data-onclick="pdvCreateExpressCustomer()">Criar e enviar acesso</button>'
    +'<button class="pdv-btn ghost" data-onclick="pdvCustomerModal()">Voltar</button></div>');
}
async function pdvCreateExpressCustomer(){
  const name=val('pdvExName').trim(),phone=val('pdvExPhone').replace(/\D/g,'');
  if(name.length<2){toast('Informe o nome do cliente');return;}
  if(phone.length<10||phone.length>13){toast('Informe um WhatsApp válido');return;}
  if(!document.getElementById('pdvExOk').checked){toast('Confirme a autorização do cliente');return;}
  const b=document.getElementById('pdvExGo');if(b){b.disabled=true;b.textContent='Criando...';}
  try{
    const {data,error}=await sb.functions.invoke('pdv-customer-express',{body:{name,phone,redirectTo:location.origin+location.pathname}});
    if(error)throw error;if(!data||!data.ok)throw new Error((data&&data.error)||'Não foi possível criar');
    PDV.cust=data.customer;PDV.opps=[];pdvCloseModal();renderCaixa();pdvLoadOpportunities();
    if(data.magicLink){const msg='Olá, '+name.split(' ')[0]+'! Seu cadastro no '+(DB.settings.storeName||'PetApp')+' foi criado. Acesse o app por este link seguro: '+data.magicLink;
      window.open('https://wa.me/'+String(data.whatsapp||phone).replace(/\D/g,'')+'?text='+encodeURIComponent(msg),'_blank');}
    toast(data.existing?'Cliente encontrado e identificado':'Cadastro criado · envie o acesso no WhatsApp');
  }catch(e){console.error(e);toast(pdvErr(e));if(b){b.disabled=false;b.textContent='Criar e enviar acesso';}}
}
async function pdvLookupCustomer(q){
  const el=document.getElementById('pdvCqList');
  const term=q||((document.getElementById('pdvCq')||{}).value||'').trim();
  if(!term){toast('Informe CPF, telefone, e-mail ou nome');return;}
  if(el)el.innerHTML='<div class="pdv-note">Buscando...</div>';
  try{
    const {data,error}=await sb.rpc('pdv_find_customer',{p_q:term});
    if(error)throw error;
    const list=data||[];
    if(!list.length){
      PDV.quickCustomerSeed=term;
      if(el)el.innerHTML='<div class="pdv-note">Nenhum cliente encontrado para <b>'+esc(term)+'</b>.</div>'
        +'<button class="pdv-btn" style="width:100%;margin-top:8px" data-onclick="pdvQuickCustomerModal(\'customer\')">Cadastrar este cliente</button>';
      else toast('Cliente não encontrado');
      return;
    }
    if(list.length===1){pdvSetCustomer(list[0]);return;}
    if(el)el.innerHTML='<div class="pdv-list"><table><thead><tr><th>Nome</th><th>Telefone</th>'
      +'<th class="r">Cashback</th></tr></thead><tbody>'
      +list.map((c,i)=>'<tr data-onclick="pdvSetFoundCustomer('+i+')"><td>'+esc(c.name||'—')+(c.member?' 🎫':'')
        +'</td><td>'+esc(c.phone||'—')+'</td><td class="r">'+BRL(c.cashback||0)+'</td></tr>').join('')
      +'</tbody></table></div>';
    PDV._found=list;
  }catch(e){
    console.error(e);
    if(el)el.innerHTML='<div class="pdv-note" style="color:#ffb3b3">Erro na busca: '+esc(e.message||e)+'</div>';
    else toast('Erro ao buscar cliente');
  }
}
function pdvSetCustomer(c){
  if(!c)return;
  if(c.blocked){toast('Este cadastro está bloqueado');return;}
  PDV.cust=c;
  pdvCloseModal();renderCaixa();
  pdvLoadOpportunities();
  toast('Cliente: '+(c.name||'—')+(c.cashback>0?' · cashback '+BRL(c.cashback):''));
}
function pdvClearCustomer(){PDV.cust=null;PDV.cb=0;PDV.opps=[];pdvCloseModal();renderCaixa();}

/* ---------- câmera: QR do app ---------- */
async function pdvScan(mode){
  const box=document.getElementById('pdvCamBox');if(!box)return;
  if(!window.jsQR){toast('Leitor de QR ainda carregando');return;}
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){toast('Este navegador não permite usar a câmera');return;}
  box.innerHTML='<video class="pdv-cam" id="pdvCam" playsinline muted></video>'
    +'<div class="pdv-note" style="text-align:center;margin-top:6px">Aponte para o QR na tela do cliente…</div>';
  let stream=null;
  try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});}
  catch(e){box.innerHTML='<div class="pdv-note" style="color:#ffb3b3">Não consegui acessar a câmera.</div>';return;}
  const v=document.getElementById('pdvCam');if(!v){try{stream.getTracks().forEach(t=>t.stop());}catch(e){}return;}
  v.srcObject=stream;await v.play().catch(()=>{});
  const cv=document.createElement('canvas'),ctx=cv.getContext('2d',{willReadFrequently:true});
  let stop=false;
  PDV.scanStop=()=>{stop=true;try{stream.getTracks().forEach(t=>t.stop());}catch(e){}};
  const tick=()=>{
    if(stop||!document.getElementById('pdvCam'))return;
    if(v.readyState===v.HAVE_ENOUGH_DATA){
      cv.width=v.videoWidth;cv.height=v.videoHeight;
      ctx.drawImage(v,0,0,cv.width,cv.height);
      try{
        const img=ctx.getImageData(0,0,cv.width,cv.height);
        const code=jsQR(img.data,img.width,img.height,{inversionAttempts:'dontInvert'});
        if(code&&code.data){const raw=code.data.trim();pdvStopScan();
          if(/^petshop:order:/i.test(raw)||mode==='pickup')pdvPickupFromCode(raw);else pdvLookupCustomer(raw);return;}
      }catch(e){}
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function pdvStopScan(){if(PDV.scanStop){try{PDV.scanStop();}catch(e){}PDV.scanStop=null;}}
function pdvPickupScanModal(){
  pdvModal('Retirada na loja',
    '<div class="pdv-note" style="margin-bottom:10px">Leia o QR exibido no celular do cliente ou cole o código do pedido.</div>'
    +'<div class="pdv-row"><input class="pdv-in" id="pdvPickupCode" placeholder="petshop:order:..." autocomplete="off">'
    +'<button class="pdv-btn" data-onclick="pdvPickupFromCode(val(\'pdvPickupCode\'))">Buscar</button></div>'
    +'<div class="pdv-btns"><button class="pdv-btn" data-onclick="pdvScan(\'pickup\')">📷 Ler QR pela câmera</button></div>'
    +'<div id="pdvCamBox" style="margin-top:12px"></div><div id="pdvPickupBox" style="margin-top:12px"></div>');
  const i=document.getElementById('pdvPickupCode');if(i)i.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();pdvPickupFromCode(i.value);}});
}
async function pdvPickupFromCode(raw){
  const m=/petshop:order:([^\s]+)/i.exec(String(raw||''));if(!m){toast('QR de pedido inválido');return;}
  if(!document.getElementById('pdvPickupBox'))pdvPickupScanModal();
  const box=document.getElementById('pdvPickupBox');const inp=document.getElementById('pdvPickupCode');if(inp)inp.value=raw;
  if(box)box.innerHTML='<div class="pdv-note">Consultando pedido...</div>';
  try{const {data,error}=await sb.rpc('pdv_pickup_order',{p_order_id:m[1],p_session:PDV.ses.id,p_complete:false});if(error)throw error;
    PDV.pickup=data;pdvRenderPickup(data);
  }catch(e){console.error(e);if(box)box.innerHTML='<div class="pdv-status-wait">'+esc(pdvErr(e))+'</div>';else toast(pdvErr(e));}
}
function pdvRenderPickup(o){
  const box=document.getElementById('pdvPickupBox');if(!box||!o)return;
  const items=Array.isArray(o.items)?o.items:[];
  box.innerHTML='<div class="pdv-sum"><div class="l"><span>Pedido</span><b>#'+esc(o.num||'')+'</b></div>'
    +'<div class="l"><span>Cliente</span><b>'+esc(o.customer||'—')+'</b></div><div class="l big"><span>Total pago</span><span>'+BRL(o.total||0)+'</span></div></div>'
    +'<div class="pdv-list"><table><thead><tr><th>Item</th><th class="r">Qtd.</th></tr></thead><tbody>'
    +items.map(i=>'<tr><td>'+esc(i.name||'Produto')+'</td><td class="r">'+pdvQ(i.qty||1,Number(i.qty)%1?3:0)+'</td></tr>').join('')+'</tbody></table></div>'
    +(o.completed?'<div class="pdv-status-ok" style="margin-top:10px">✓ Retirada já concluída</div>'
      :'<div class="pdv-btns"><button class="pdv-btn" id="pdvPickupGo" data-onclick="pdvCompletePickup()">Conferido · concluir retirada</button></div>');
}
async function pdvCompletePickup(){
  if(!PDV.pickup||!PDV.pickup.id)return;const b=document.getElementById('pdvPickupGo');if(b){b.disabled=true;b.textContent='Concluindo...';}
  try{const {data,error}=await sb.rpc('pdv_pickup_order',{p_order_id:PDV.pickup.id,p_session:PDV.ses.id,p_complete:true});if(error)throw error;
    PDV.pickup=data;pdvRenderPickup(data);await pdvLoadPickupQueue(true);toast('Retirada concluída · pedido #'+(data.num||''));
  }catch(e){console.error(e);toast(pdvErr(e));if(b){b.disabled=false;b.textContent='Conferido · concluir retirada';}}
}

/* ---------- F11 · abrir caixa ---------- */
function pdvOpenModal(){
  const terms=(PDV.terminals||[]).filter(t=>t.active);
  const termField=terms.length
    ?'<select class="pdv-in" id="pdvTerm">'+terms.map(t=>'<option value="'+esc(t.code)+'" '+(t.code===PDV.terminal?'selected':'')+'>'+esc(t.name)+' · '+esc(t.code)+'</option>').join('')+'</select>'
    :'<input class="pdv-in" id="pdvTerm" value="'+esc(PDV.terminal)+'">';
  pdvModal('Abrir Caixa',
    '<div class="pdv-row" style="gap:12px">'
      +'<div style="flex:1"><label class="pdv-lbl">Terminal</label>'
        +termField+'</div>'
      +'<div style="flex:1"><label class="pdv-lbl">Troco inicial R$</label>'
        +'<input class="pdv-in num" id="pdvOpenAmt" value="0,00"></div>'
    +'</div>'
    +'<div class="pdv-note" style="margin-top:10px">O valor informado é o dinheiro que já está na gaveta '
      +'antes da primeira venda. Ele entra na conferência do fechamento.</div>'
    +'<div class="pdv-btns"><button class="pdv-btn" id="pdvOpenGo" data-onclick="pdvDoOpen()">Abrir caixa</button>'
    +'<button class="pdv-btn ghost" data-pdv-close>Cancelar</button></div>');
}
// Abre uma sessão PROVISÓRIA local (offline). As vendas vão para a fila e o servidor
// associa cada uma à sessão real do terminal no momento da sincronização.
function pdvOpenOffline(term,amt){
  pdvSetTerm(term);
  PDV.ses={ id:'OFF-SES-'+term, status:'aberto', offline:true, terminal:term, opening:amt, opened_at:new Date().toISOString() };
  refCachePut('pdv_session:'+term, PDV.ses, true);
  pdvCloseModal(); renderCaixa(); toast('Caixa aberto offline · sincroniza ao reconectar');
}
async function pdvDoOpen(){
  const term=((document.getElementById('pdvTerm')||{}).value||'CAIXA-1').trim()||'CAIXA-1';
  const amt=pdvNum((document.getElementById('pdvOpenAmt')||{}).value);
  const b=document.getElementById('pdvOpenGo');if(b){b.disabled=true;b.textContent='Abrindo...';}
  if(!navigator.onLine){ pdvOpenOffline(term,amt); return; }
  try{
    const {data,error}=await sb.rpc('pdv_open_session',{p_terminal:term,p_opening:amt});
    if(error)throw error;
    pdvSetTerm(term);
    PDV.ses=data;
    refCachePut('pdv_session:'+term, PDV.ses, true);
    pdvCloseModal();renderCaixa();pdvStartPickupUpdates();await pdvLoadPickupQueue(true);toast('Caixa aberto ✓');
  }catch(e){
    if(isNetworkErr(e)){ pdvOpenOffline(term,amt); return; }   // rede caiu no meio → sessão provisória
    console.error(e);toast(pdvErr(e));
    if(b){b.disabled=false;b.textContent='Abrir caixa';}
  }
}

/* ---------- Ctrl+E · enviar a venda para ENTREGA ---------- */
let PDV_DL={cust:null,dados:{},frete:0,pagar:false,pixIntent:null};
function pdvDelivItems(){
  const t=pdvTotals();
  const descGeral=round2((t.manual||0)+(t.mdisc||0)+(t.cb||0));
  const base=PDV.items.map(it=>round2(it.price*it.qty-(+it.disc||0)));
  const soma=round2(base.reduce((a,b)=>a+b,0));
  return PDV.items.map((it,i)=>{
    const share = soma>0 ? round2(descGeral*base[i]/soma) : 0;
    const liq = Math.max(0, round2(base[i]-share));
    const p=(DB.products||[]).find(x=>x.id===it.id)||{};
    return { product_id:it.id, descricao:it.name, qtd:it.qty,
      preco_unit: it.qty? round2(liq/it.qty) : 0, custo_unit:+p.cost||0 };
  });
}
function pdvDelivSub(){ return round2(pdvDelivItems().reduce((a,i)=>a+i.qtd*i.preco_unit,0)); }
let PDV_QC_RETURN='delivery';
function pdvQuickCustomerModal(returnTo='delivery'){
  PDV_QC_RETURN=returnTo==='customer'?'customer':'delivery';
  const seed=String(PDV.quickCustomerSeed||'').trim();PDV.quickCustomerSeed='';
  const seedDigits=seed.replace(/\D/g,''),seedCpf=seedDigits.length===11?seedDigits:'',seedName=seedCpf?'':seed;
  const intro=PDV_QC_RETURN==='delivery'
    ?'Preencha os dados essenciais da entrega. O endereço pode ser completado automaticamente pelo CEP.'
    :'Cadastre o cliente sem sair do PDV. O endereço pode ser completado automaticamente pelo CEP.';
  pdvModal('Cadastro rápido do cliente',
    '<div class="pdv-note" style="margin-bottom:12px">'+intro+'</div>'
    +'<div class="pdv-quick-grid">'
      +'<div class="wide"><label class="pdv-lbl">Nome *</label><input class="pdv-in" id="pdvQcName" autocomplete="name" placeholder="Nome do cliente" value="'+esc(seedName)+'"></div>'
      +'<div><label class="pdv-lbl">CPF *</label><input class="pdv-in" id="pdvQcCpf" inputmode="numeric" maxlength="14" placeholder="000.000.000-00" value="'+esc(seedCpf)+'" data-oninput="pdvQuickMaskCpf(this)"></div>'
      +'<div><label class="pdv-lbl">WhatsApp</label><input class="pdv-in" id="pdvQcPhone" inputmode="tel" placeholder="Para enviar o PIX ao cliente"></div>'
      +'<div><label class="pdv-lbl">CEP *</label><div class="pdv-row" style="gap:6px"><input class="pdv-in" style="flex:1;min-width:0" id="pdvQcCep" inputmode="numeric" maxlength="9" placeholder="00000-000" data-oninput="pdvQuickMaskCep(this)" data-onblur="pdvQuickCustomerCepIfComplete(this)"><button type="button" class="pdv-btn ghost" style="flex:0 0 auto" data-onclick="pdvQuickCustomerCep(this)">Buscar</button></div></div>'
      +'<div><label class="pdv-lbl">Número / complemento *</label><input class="pdv-in" id="pdvQcNumber" placeholder="nº, apto, casa"></div>'
      +'<div class="wide"><label class="pdv-lbl">Endereço *</label><input class="pdv-in" id="pdvQcAddress" placeholder="Rua / avenida"></div>'
      +'<div><label class="pdv-lbl">Bairro</label><input class="pdv-in" id="pdvQcBairro" placeholder="Bairro"></div>'
      +'<div><label class="pdv-lbl">Cidade / UF</label><input class="pdv-in" id="pdvQcCity" placeholder="Cidade / UF"></div>'
    +'</div>'
    +'<div class="pdv-btns"><button class="pdv-btn" id="pdvQcSave" data-onclick="pdvSaveQuickCustomer()">Salvar e continuar</button>'
    +'<button class="pdv-btn ghost" data-pdv-close>Cancelar</button></div>',true);
  const cpf=document.getElementById('pdvQcCpf');if(cpf&&seedCpf)pdvQuickMaskCpf(cpf);
  const n=document.getElementById('pdvQcName');if(n)n.focus();
}
window.pdvQuickMaskCpf=el=>{
  const d=String(el.value||'').replace(/\D/g,'').slice(0,11);
  el.value=d.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');
};
window.pdvQuickMaskCep=el=>{const d=String(el.value||'').replace(/\D/g,'').slice(0,8);el.value=d.length>5?d.slice(0,5)+'-'+d.slice(5):d;};
function pdvValidCpf(raw){
  const d=String(raw||'').replace(/\D/g,'');if(!/^\d{11}$/.test(d)||/^(\d)\1{10}$/.test(d))return false;
  const digit=n=>{let s=0;for(let i=0;i<n;i++)s+=(+d[i])*(n+1-i);const r=(s*10)%11;return r===10?0:r;};
  return digit(9)===+d[9]&&digit(10)===+d[10];
}
async function pdvQuickCustomerCep(btn){
  const cep=String((document.getElementById('pdvQcCep')||{}).value||'').replace(/\D/g,'');
  if(cep.length!==8){toast('Informe um CEP com 8 dígitos');return;}
  if(btn){btn.disabled=true;btn.textContent='Buscando...';}
  try{
    const r=await fetch('https://viacep.com.br/ws/'+cep+'/json/');if(!r.ok)throw new Error('CEP indisponível');
    const d=await r.json();if(d.erro)throw new Error('CEP não encontrado');
    const set=(id,v)=>{const el=document.getElementById(id);if(el&&v)el.value=v;};
    set('pdvQcAddress',d.logradouro);set('pdvQcBairro',d.bairro);set('pdvQcCity',[d.localidade,d.uf].filter(Boolean).join(' / '));
    const num=document.getElementById('pdvQcNumber');if(num)num.focus();toast('Endereço preenchido pelo CEP');
  }catch(e){toast(e.message||'Não foi possível consultar o CEP');}
  finally{if(btn){btn.disabled=false;btn.textContent='Buscar';}}
}
async function pdvSaveQuickCustomer(){
  const nome=String((document.getElementById('pdvQcName')||{}).value||'').trim();
  const cpf=String((document.getElementById('pdvQcCpf')||{}).value||'').replace(/\D/g,'');
  const phone=String((document.getElementById('pdvQcPhone')||{}).value||'').replace(/\D/g,'');
  const cep=String((document.getElementById('pdvQcCep')||{}).value||'').replace(/\D/g,'');
  const rua=String((document.getElementById('pdvQcAddress')||{}).value||'').trim();
  const numero=String((document.getElementById('pdvQcNumber')||{}).value||'').trim();
  const bairro=String((document.getElementById('pdvQcBairro')||{}).value||'').trim();
  const cidade=String((document.getElementById('pdvQcCity')||{}).value||'').trim();
  if(nome.length<2){toast('Informe o nome do cliente');return;}
  if(!pdvValidCpf(cpf)){toast('Informe um CPF válido');return;}
  if(cep.length!==8){toast('Informe o CEP');return;}
  if(!rua||!numero){toast('Informe o endereço e o número');return;}
  const endereco=[rua+', '+numero,bairro,cidade,'CEP '+cep.slice(0,5)+'-'+cep.slice(5)].filter(Boolean).join(' - ');
  const regra=(FRETE_RULES||[]).find(x=>String(x.bairro||'').trim().toLowerCase()===bairro.toLowerCase());
  const custPayload={nome,documento:cpf,telefone:phone,endereco,bairro,frete:+((regra&&regra.valor)||0),obs:'Cadastro rápido pelo PDV'};
  // Offline: cria um cliente PROVISÓRIO local (sincroniza ao reconectar) e já anexa à venda.
  // A venda offline referencia o cliente por client_id; o servidor resolve o id real no sync.
  if(!navigator.onLine){
    const cid=enqueueOp({kind:'customer', payload:{...custPayload, obs:'Cadastro rápido offline'}});
    await pdvFinishQuickCustomer({id:null, client_id:cid, name:nome, phone, email:'', cashback:0, offline:true}, 'Cliente salvo offline · sincroniza ao reconectar');
    return;
  }
  const b=document.getElementById('pdvQcSave');if(b){b.disabled=true;b.textContent='Salvando...';}
  try{
    const found=await sb.rpc('pdv_find_customer',{p_q:cpf});if(found.error)throw found.error;
    if(Array.isArray(found.data)&&found.data.length){
      await pdvFinishQuickCustomer(found.data[0],'CPF já cadastrado · cliente selecionado');return;
    }
    const {data,error}=await sb.rpc('erp_upsert_customer',{p:custPayload});
    if(error)throw error;if(!data||!data.id)throw new Error('Cliente não retornado pelo cadastro');
    await pdvFinishQuickCustomer({id:data.id,name:data.nome||nome,phone:data.telefone||phone,email:data.email||'',cashback:0},'Cliente cadastrado e selecionado');
  }catch(e){ if(isNetworkErr(e)){ const cid=enqueueOp({kind:'customer', payload:{...custPayload, obs:'Cadastro rápido offline'}}); await pdvFinishQuickCustomer({id:null, client_id:cid, name:nome, phone, email:'', cashback:0, offline:true}, 'Cliente salvo offline · sincroniza ao reconectar'); return; }
    console.error(e);toast(pdvErr(e));if(b){b.disabled=false;b.textContent='Salvar e continuar';}}
}
async function pdvFinishQuickCustomer(customer,message){
  PDV.cust=customer;PDV.opps=[];
  try{ await loadCustomers(); }catch(e){}   // offline cai no cache; não pode travar o fluxo
  pdvCloseModal();renderCaixa();
  if(customer&&customer.id)pdvLoadOpportunities();   // cliente provisório (offline) não tem id/opps ainda
  toast(message);
  if(PDV_QC_RETURN==='delivery')await pdvDeliveryModal();
}
async function pdvDeliveryModal(){
  if(!(PDV.ses&&PDV.ses.status==='aberto')){toast('Abra o caixa para lançar uma entrega');return;}
  if(!PDV.items.length){toast('Adicione os itens antes de enviar para entrega');return;}
  if(!PDV.cust){toast('Faça o cadastro rápido do cliente da entrega');pdvQuickCustomerModal();return;}
  let c=null;
  try{ const {data}=await sb.from('customers').select('id,nome,telefone,endereco,frete').eq('id',PDV.cust.id).maybeSingle(); c=data||null; }catch(e){}
  PDV_DL={ cust:PDV.cust, dados:c||{}, frete:+((c&&c.frete)||0), pagar:false, pixIntent:null };
  pdvRenderDelivery();
}
function pdvRenderDelivery(){
  const c=PDV_DL.dados||{}, sub=pdvDelivSub(), t=pdvTotals();
  const pixPago=!!PDV_DL.pixIntent;
  const lojas=(STORES||[]).map(x=>'<option value="'+x.id+'"'+(x.id===CURRENT_STORE?' selected':'')+'>'+esc(x.nome)+(x.is_matriz?' ★':'')+'</option>').join('');
  const desc=round2((t.manual||0)+(t.mdisc||0)+(t.cb||0));
  pdvModal('Enviar para entrega 🚚',
    '<div style="display:flex;gap:16px;flex-wrap:wrap">'
    +'<div style="flex:1 1 340px">'
      +'<div class="pdv-note">Cliente: <b>'+esc((PDV_DL.cust&&(PDV_DL.cust.name||PDV_DL.cust.nome))||'—')+'</b>'
        +(c.telefone?' · '+esc(c.telefone):' · <span style="color:#ffb3b3">sem telefone</span>')
        +' <button class="pdv-btn ghost" style="padding:3px 8px;margin-left:6px" data-onclick="pdvCustomerModal()">trocar</button>'
        +' <button class="pdv-btn ghost" style="padding:3px 8px;margin-left:4px" data-onclick="pdvQuickCustomerModal()">cadastro rápido</button></div>'
      +'<label class="pdv-lbl" style="margin-top:10px">Endereço de entrega</label>'
      +'<input class="pdv-in" id="pdvDlEnd" value="'+esc(c.endereco||'')+'" placeholder="rua, número, bairro" '+(pixPago?'readonly':'')+'>'
      +'<div class="pdv-row" style="gap:12px;margin-top:10px">'
        +'<div style="flex:1"><label class="pdv-lbl">Frete R$</label>'
          +'<input class="pdv-in num" id="pdvDlFrete" value="'+PDV_DL.frete.toFixed(2).replace('.',',')+'" data-oninput="pdvDelivRecalc()" '+(pixPago?'readonly':'')+'></div>'
        +'<div style="flex:1"><label class="pdv-lbl">Loja que entrega</label>'
          +'<select class="pdv-in" id="pdvDlLoja" '+(pixPago?'disabled':'')+'>'+lojas+'</select></div>'
      +'</div>'
      +'<label class="pdv-lbl" style="margin-top:10px">Observação</label>'
      +'<input class="pdv-in" id="pdvDlObs" value="'+esc(c.obs||'')+'" placeholder="ex: portão azul, deixar com o porteiro" '+(pixPago?'readonly':'')+'>'
    +'</div>'
    +'<div style="flex:1 1 300px">'
      +(pixPago?'<div class="pdv-status-ok">PIX confirmado pelo sistema · '+BRL(sub+PDV_DL.frete)+'</div>':'<div class="pdv-delivery-pay-grid">'
        +'<button class="pdv-btn machine" data-onclick="pdvDeliveryMachine(\'debito\')">Débito</button>'
        +'<button class="pdv-btn machine" data-onclick="pdvDeliveryMachine(\'credito\')">Crédito</button>'
        +'<button class="pdv-btn pix" data-onclick="pdvDeliveryMachine(\'pix\')">PIX</button>'
        +'<button class="pdv-btn pix" data-onclick="pdvSendDeliveryPix()">Enviar PIX ao cliente</button>'
      +'</div><button class="pdv-btn pdv-delivery-pay-later" data-onclick="pdvDoDelivery()">Pagar na entrega</button>')
      +'<div class="pdv-note" style="margin-top:10px">'
        +'<div class="pdv-row" style="justify-content:space-between"><span>Itens ('+t.n+')</span><b>'+BRL(sub)+'</b></div>'
        +(desc>0?'<div class="pdv-row" style="justify-content:space-between"><span>Descontos aplicados</span><b>−'+BRL(desc)+'</b></div>':'')
        +'<div class="pdv-row" style="justify-content:space-between"><span>Frete</span><b id="pdvDlFreteV">'+BRL(PDV_DL.frete)+'</b></div>'
        +'<div class="pdv-row" style="justify-content:space-between;font-size:17px"><span>TOTAL</span><b id="pdvDlTot">'+BRL(sub+PDV_DL.frete)+'</b></div>'
      +'</div>'
      +(t.sur>0?'<div class="pdv-note" style="margin-top:8px">O acréscimo de '+BRL(t.sur)+' foi somado ao frete.</div>':'')
    +'</div></div>'
    +'<div class="pdv-btns">'+(pixPago?'<button class="pdv-btn" id="pdvDlGo" data-onclick="pdvDoDelivery()">PIX confirmado · enviar para a fila</button>':'')
    +'<button class="pdv-btn ghost" data-pdv-close>Cancelar</button></div>', true);
  const t2=pdvTotals(); if(t2.sur>0){ const f=document.getElementById('pdvDlFrete'); if(f&&PDV_DL.frete===+((PDV_DL.dados||{}).frete||0)){ PDV_DL.frete=round2(PDV_DL.frete+t2.sur); f.value=PDV_DL.frete.toFixed(2).replace('.',','); } }
  pdvDelivRecalc();
}
window.pdvDelivRecalc=()=>{
  const f=pdvNum((document.getElementById('pdvDlFrete')||{}).value);
  PDV_DL.frete=f; const total=round2(pdvDelivSub()+f);
  const fv=document.getElementById('pdvDlFreteV'); if(fv)fv.textContent=BRL(f);
  const tv=document.getElementById('pdvDlTot'); if(tv)tv.textContent=BRL(total);
};
function pdvDeliveryPayload(){
  const end=((document.getElementById('pdvDlEnd')||{}).value||'').trim();
  if(!end)throw new Error('Informe o endereço de entrega');
  const frete=pdvNum((document.getElementById('pdvDlFrete')||{}).value);
  const loja=(document.getElementById('pdvDlLoja')||{}).value||CURRENT_STORE;
  const obs=((document.getElementById('pdvDlObs')||{}).value||'').trim()||null;
  const items=pdvDelivItems();
  return {end,frete,loja,obs,items,total:round2(items.reduce((a,i)=>a+i.qtd*i.preco_unit,0)+frete)};
}
function pdvPickDeliveryTerminal(tipo){
  pdvModal('Escolha a maquininha 💳',(TERMINALS||[]).map(t=>'<button class="pdv-btn" style="width:100%;margin:5px 0;text-align:left" data-onclick="pdvDeliveryMachine(\''+tipo+'\',\''+t.id+'\')">💳 '+esc(t.nome)+' <span style="opacity:.75;font-weight:600">· Mercado Pago Point</span></button>').join('')
    +'<button class="pdv-btn ghost" style="width:100%;margin-top:6px" data-onclick="pdvDeliveryModal()">Voltar</button>',true);
}
async function pdvDeliveryMachine(tipo,termId){
  if(PDV.busy)return;if(PDV.delivPixUnavailable){toast('Atualize o banco do ONPDV antes de transmitir a entrega para a maquininha');return;}
  const terms=TERMINALS||[];if(!terms.length){toast('Cadastre uma maquininha em Config → Maquininhas');return;}
  let term=termId?terms.find(t=>t.id===termId):null;
  if(!term){const bid=pdvBoundMachineId();if(bid)term=terms.find(t=>t.id===bid)||null;}
  if(!term&&terms.length===1)term=terms[0];
  if(!term){pdvPickDeliveryTerminal(tipo);return;}
  let d;try{d=pdvDeliveryPayload();}catch(e){toast(e.message||String(e));return;}
  PDV.busy=true;
  try{
    const {data,error}=await sb.rpc('pdv_delivery_prepare_pos',{p_customer:PDV_DL.cust.id,p_items:d.items,p_frete:d.frete,p_store:d.loja,p_endereco:d.end,p_obs:d.obs,p_origin_store:CURRENT_STORE,p_session:PDV.ses.id,p_tipo:tipo});
    if(error)throw error;
    window._posSnap=pdvSnapshot();window._posDelivery={deliveryId:data.delivery_id,numero:data.numero,total:data.total};
    pdvResetDraft();pdvCloseModal();renderCaixa();
    try{await loadProducts();buildPdvCatalog();}catch(_){}
    await posFlow(data.sale_id,data.numero,data.total,term.id,tipo,1,{kind:'entrega',deliveryId:data.delivery_id});
  }catch(e){console.error(e);toast(pdvErr(e));}
  finally{PDV.busy=false;}
}
async function pdvSendDeliveryPix(){
  if(PDV.busy)return;if(PDV.delivPixUnavailable){toast('Atualize o banco do ONPDV antes de usar o PIX de entrega');return;}if(!navigator.onLine){toast('O PIX para entrega exige internet');return;}
  let d;try{d=pdvDeliveryPayload();}catch(e){toast(e.message||String(e));return;}
  const phone=String((PDV_DL.dados&&PDV_DL.dados.telefone)||(PDV_DL.cust&&PDV_DL.cust.phone)||'').replace(/\D/g,'').replace(/^55/,'');
  const nome=(PDV_DL.cust&&PDV_DL.cust.name)||'Cliente';
  // Não abrimos mais uma aba "about:blank" antecipada: com pop-up/redirect bloqueado
  // (e COOP same-origin) ela ficava em branco. Geramos o PIX e mostramos QR + código
  // na própria tela; o WhatsApp abre a partir de um clique direto do operador.
  PDV.busy=true;
  const b=document.activeElement; const bTxt=(b&&b.tagName==='BUTTON')?b.textContent:null;
  if(b&&b.tagName==='BUTTON'){b.disabled=true;b.textContent='Gerando PIX...';}
  try{
    const {data,error}=await sb.functions.invoke('pdv-pix-payment',{body:{action:'create',kind:'entrega',sessionId:PDV.ses.id,customerId:PDV_DL.cust.id,
      deliv:{items:d.items,frete:d.frete,endereco:d.end,obs:d.obs,origin_store:CURRENT_STORE,store:d.loja},payer:{name:nome,email:(PDV_DL.cust.email||'')}}});
    if(error)throw error;if(!data||!data.ok)throw new Error((data&&data.error)||'Não foi possível gerar o PIX');
    pdvResetDraft();renderCaixa();await pdvLoadDeliveryPixQueue(false);pdvDelivCount();
    pdvDeliveryPixResultModal({qrCode:data.qrCode||'',qrCodeBase64:data.qrCodeBase64||'',total:data.total,phone,nome});
  }catch(e){console.error(e);toast(pdvErr(e));}
  finally{PDV.busy=false;if(b&&b.tagName==='BUTTON'&&b.isConnected){b.disabled=false;if(bTxt!=null)b.textContent=bTxt;}}
}
function pdvDeliveryPixResultModal(o){
  o=o||{};
  const waMsg='Olá, '+(o.nome||'')+'! Segue o PIX da sua compra para entrega, no valor de '+BRL(o.total)
    +':\n\n'+(o.qrCode||'')+'\n\nAssim que o pagamento for confirmado, seu pedido seguirá para entrega.';
  PDV._delivPixWaMsg=waMsg;
  pdvModal('PIX da entrega gerado ⚡',
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;align-items:start">'
      +'<div class="pdv-qr">'+(o.qrCodeBase64?'<img alt="QR Code PIX" src="data:image/png;base64,'+o.qrCodeBase64+'">':'<div class="pdv-note">QR indisponível — use o código copia e cola ao lado.</div>')+'</div>'
      +'<div>'
        +'<div class="pdv-status-wait">⏳ Aguardando o pagamento · '+BRL(o.total)+'</div>'
        +'<div class="pdv-note" style="margin:10px 0">Assim que o Mercado Pago confirmar, o pedido aparece em <b>Fila de entrega</b> pronto para sair.</div>'
        +(o.qrCode?'<textarea class="pdv-in" id="pdvDlPixCode" readonly style="height:72px;font-size:11px">'+esc(o.qrCode)+'</textarea>'
          +'<button class="pdv-btn" style="width:100%;margin-top:7px" data-onclick="pdvCopyDeliveryPix()">📋 Copiar código PIX</button>':'')
        +(o.phone?'<button class="pdv-btn pix" style="width:100%;margin-top:7px" data-onclick="pdvDeliveryPixWhats(\''+o.phone+'\')">📲 Enviar no WhatsApp</button>'
          :'<div class="pdv-note" style="margin-top:7px">Cliente sem telefone cadastrado — copie o código e envie você mesmo.</div>')
      +'</div>'
    +'</div>'
    +'<div class="pdv-btns"><button class="pdv-btn ghost" data-pdv-close>Fechar</button></div>',true);
}
function pdvCopyDeliveryPix(){
  const e=document.getElementById('pdvDlPixCode');if(!e)return;
  if(navigator.clipboard)navigator.clipboard.writeText(e.value).then(()=>toast('PIX copiado ✓'));
  else{e.select();document.execCommand('copy');toast('PIX copiado ✓');}
}
function pdvDeliveryPixWhats(phone){
  window.open('https://wa.me/55'+String(phone).replace(/\D/g,'')+'?text='+encodeURIComponent(PDV._delivPixWaMsg||''),'_blank');
}
window.pdvSendDeliveryPix=pdvSendDeliveryPix;
window.pdvCopyDeliveryPix=pdvCopyDeliveryPix;
window.pdvDeliveryPixWhats=pdvDeliveryPixWhats;
function pdvDeliveryPixQueueModal(){
  const list=PDV.delivPix||[];
  pdvModal('Entregas aguardando PIX ⚡',list.length?'<div class="pdv-list"><table><thead><tr><th>Cliente</th><th>Status</th><th class="r">Total</th><th></th></tr></thead><tbody>'
    +list.map(o=>'<tr><td><b>'+esc(o.customer||'Cliente')+'</b><br><span class="pdv-note">'+fmtDT(o.created_at)+'</span></td><td>'+(o.status==='paid'?'<span class="pdv-tag ok">PIX pago</span>':'<span class="pdv-tag">aguardando</span>')+'</td><td class="r"><b>'+BRL(o.amount)+'</b></td><td class="r">'
      +(o.status==='paid'?'<button class="pdv-btn solid mini" data-onclick="pdvRestorePaidDelivery(\''+o.id+'\')">Trazer para o PDV</button>':'<button class="pdv-btn ghost mini" data-onclick="pdvResendDeliveryPix(\''+o.id+'\')">📲 Reenviar PIX</button>')+'</td></tr>').join('')
    +'</tbody></table></div>':'<div class="pdv-note">Nenhuma entrega aguardando PIX.</div>',true);
}
function pdvResendDeliveryPix(id){
  const o=(PDV.delivPix||[]).find(x=>x.id===id);if(!o)return;
  const phone=String(o.phone||'').replace(/\D/g,'').replace(/^55/,'');
  if(!o.qr_code){toast('O código PIX ainda não está disponível');return;}
  const msg='Olá, '+(o.customer||'')+'! Segue o PIX da sua compra para entrega, no valor de '+BRL(o.amount)+':\n\n'+o.qr_code;
  if(phone)window.open('https://wa.me/55'+phone+'?text='+encodeURIComponent(msg),'_blank');
  else if(navigator.clipboard)navigator.clipboard.writeText(o.qr_code).then(()=>toast('PIX copiado · cliente sem telefone cadastrado'));
}
async function pdvRestorePaidDelivery(id){
  const o=(PDV.delivPix||[]).find(x=>x.id===id);if(!o||o.status!=='paid')return;
  if(PDV.items.length&&!await uiConfirm('Há uma venda no PDV. Colocar em espera e trazer a entrega paga?',{okText:'Colocar em espera',cancelText:'Voltar'}))return;
  if(PDV.items.length)pdvHoldSale(true);
  const d=o.deliv||{};PDV.items=(d.items||[]).map(it=>({id:it.product_id,name:it.descricao,ean:'',price:+it.preco_unit||0,qty:+it.qtd||0,disc:0,kg:false}));
  PDV.cust={id:o.customer_id,name:o.customer||'Cliente',phone:o.phone||''};PDV.sel=PDV.items.length-1;
  PDV_DL={cust:PDV.cust,dados:{endereco:d.endereco||'',telefone:o.phone||'',frete:+d.frete||0,obs:d.obs||''},frete:+d.frete||0,pagar:true,pixIntent:o.id};
  PDV.delivPixDraft=o.id;pdvCloseModal();renderCaixa();toast('Entrega paga voltou ao PDV · clique em Entrega para enviar à fila');
}
async function pdvDoDelivery(){
  const end=((document.getElementById('pdvDlEnd')||{}).value||'').trim();
  if(!end){toast('Informe o endereço de entrega');return;}
  const frete=pdvNum((document.getElementById('pdvDlFrete')||{}).value);
  const loja=(document.getElementById('pdvDlLoja')||{}).value||CURRENT_STORE;
  const obs=((document.getElementById('pdvDlObs')||{}).value||'').trim()||null;
  const items=pdvDelivItems();
  const total=round2(items.reduce((a,i)=>a+i.qtd*i.preco_unit,0)+frete);
  let pagamentos=[];
  if(PDV_DL.pagar&&!PDV_DL.pixIntent){
    const map={Din:'dinheiro',Pix:'pix',Deb:'debito',Cred:'credito'};
    let receb=0;
    Object.keys(map).forEach(k=>{ const v=pdvNum((document.getElementById('pdvDl'+k)||{}).value);
      if(v>0){ pagamentos.push({metodo:map[k],valor:v}); receb=round2(receb+v); } });
    if(receb+0.001<total){toast('Falta receber '+BRL(round2(total-receb)));return;}
  }
  const b=document.getElementById('pdvDlGo'); if(b){b.disabled=true;b.textContent='Enviando...';}
  try{
    const req=PDV_DL.pixIntent
      ?sb.rpc('pdv_delivery_pix_finalize',{p_intent:PDV_DL.pixIntent})
      :sb.rpc('erp_delivery_create',{ p_customer:PDV_DL.cust.id, p_items:items,
        p_frete:frete, p_store:loja, p_endereco:end, p_obs:obs, p_origin_store:CURRENT_STORE,
        p_pagamentos:pagamentos, p_session:(PDV.ses&&PDV.ses.id)||null });
    const {data,error}=await req;
    if(error)throw error;
    pdvResetDraft();PDV.delivPixDraft=null;PDV_DL.pixIntent=null;pdvCloseModal();renderCaixa();
    await loadProducts();buildPdvCatalog();await pdvLoadDeliveryPixQueue(true);pdvDelivCount();
    toast('Entrega #'+data.numero+(data.pago?' cobrada':' · cobrar na entrega')+' enviada para a fila 🚚');
    if(typeof delivGuide==='function') delivGuide(data.delivery_id);
  }catch(e){ console.error(e); toast(pdvErr(e)); if(b){b.disabled=false;b.textContent='Enviar para a fila 🚚';} }
}

/* ---------- fila de entrega (antigo botão de retiradas) ---------- */
async function pdvDeliveryQueue(){
  pdvModal('Fila de entrega 🚚','<div id="pdvDlQ" class="pdv-note">Carregando entregas...</div>',true);
  const {data,error}=await sb.rpc('erp_courier_queue',{p_dias:1});
  const box=document.getElementById('pdvDlQ'); if(!box)return;
  if(error){ box.innerHTML='Erro: '+esc(error.message); return; }
  const d=data||{}; pdvDelivKeepToday(d); PDV._dl=d;
  const r=d.resumo||{};
  const lojaCell=x=>'<b>'+esc(x.loja_nome||'—')+'</b>'
    +(x.recebida_de_outra?'<br><span class="pdv-tag warn">pedido feito na loja '+esc(x.origem_nome||'outra')+'</span>':'');
  const linha=(x,tipo)=>'<tr data-onclick="pdvDelivDetail(\''+x.id+'\')" title="Ver detalhes do pedido"><td><b>#'+(x.venda_numero||'')+'</b><br><span style="opacity:.7">'+esc(x.cliente||'Cliente')+'</span></td>'
    +'<td>'+lojaCell(x)+'</td>'
    +'<td>'+esc(x.endereco||'—')+'<br><span style="opacity:.7">'+(x.itens||0)+' item(ns)</span></td>'
    +'<td class="r">'+BRL(x.total)+'<br><span style="opacity:.7">'+(x.pago?'pago':'cobrar')+'</span></td>'
    +'<td class="r">'+(tipo==='entregues'?(x.minutos_entrega!=null?dur(x.minutos_entrega):'—')
        :tipo==='rota'?(x.minutos_em_rota!=null?'há '+dur(x.minutos_em_rota):'—'):'—')+'</td>'
    +'<td class="r" style="white-space:nowrap">'
      +'<button class="pdv-btn ghost mini" data-onclick="event.stopPropagation();delivGuide(\''+x.id+'\')">🖨️ Guia/QR</button> '
      +(tipo==='fila'?'<button class="pdv-btn solid mini" data-onclick="event.stopPropagation();pdvDelivSet(\''+x.id+'\',\'em_rota\')">Saiu</button>':'')
      +(tipo==='rota'?'<button class="pdv-btn solid mini" data-onclick="event.stopPropagation();pdvDelivSet(\''+x.id+'\',\'entregue\')">Entregue</button>':'')
    +'</td></tr>';
  const bloco=(titulo,arr,tipo,vazio)=>'<div style="margin-bottom:14px"><div class="pdv-lbl" style="font-size:14px;margin-bottom:6px">'+titulo+' ('+arr.length+')</div>'
    +(arr.length?'<div class="pdv-list"><table><thead><tr><th>Pedido</th><th>Sai da loja</th><th>Endereço</th><th class="r">Valor</th><th class="r">Tempo</th><th></th></tr></thead>'
      +'<tbody>'+arr.map(x=>linha(x,tipo)).join('')+'</tbody></table></div>'
      :'<div class="pdv-note">'+vazio+'</div>')+'</div>';
  box.outerHTML='<div id="pdvDlQ">'
    +'<div class="pdv-btns" style="margin:0 0 12px">'
      +'<button class="pdv-btn solid" data-onclick="pdvDeliveryMapModal()">🗺️ Ver mapa · rastrear motoboy</button>'
    +'</div>'
    +'<div class="pdv-row" style="gap:8px;flex-wrap:wrap;margin-bottom:12px">'
      +'<div class="pdv-note" style="flex:1">Prontos para sair<br><b style="font-size:19px">'+(r.fila||0)+'</b></div>'
      +'<div class="pdv-note" style="flex:1">Em rota<br><b style="font-size:19px">'+(r.rota||0)+'</b></div>'
      +'<div class="pdv-note" style="flex:1">Entregues hoje<br><b style="font-size:19px">'+(r.entregues||0)+'</b></div>'
      +'<div class="pdv-note" style="flex:1">Tempo médio<br><b style="font-size:19px">'+(r.tempo_medio!=null?dur(r.tempo_medio):'—')+'</b></div>'
    +'</div>'
    +bloco('📦 Prontos para sair',d.fila||[],'fila','Nenhum pedido pronto para sair.')
    +bloco('🛵 Em rota',d.rota||[],'rota','Nenhum pedido em rota.')
    +bloco('✅ Entregues hoje',d.entregues||[],'entregues','Nenhuma entrega concluída hoje.')
    +'</div>';
}
window.pdvDelivDetail=async (id)=>{
  pdvModal('Detalhes do pedido 📦','<div id="pdvDlDet" class="pdv-note">Carregando pedido…</div>',true);
  const { data:d, error } = await sb.rpc('erp_delivery_detail',{ p_id:id });
  const box=document.getElementById('pdvDlDet'); if(!box) return;
  if(error||!d){ box.innerHTML='<div class="pdv-note" style="color:#ffb3b3">Não foi possível carregar o pedido.</div>'; return; }
  const q=([].concat((PDV._dl&&PDV._dl.fila)||[],(PDV._dl&&PDV._dl.rota)||[],(PDV._dl&&PDV._dl.entregues)||[])).find(x=>x.id===id)||{};
  const itens=(d.itens||[]).map(it=>'<tr><td>'+esc(it.descricao)+'</td><td class="r">'+(+it.qtd).toLocaleString('pt-BR')+'</td><td class="r">'+BRL(it.preco_unit)+'</td><td class="r"><b>'+BRL(it.subtotal)+'</b></td></tr>').join('');
  const chip={fila:'<span class="pdv-tag">na fila</span>',em_rota:'<span class="pdv-tag">saiu p/ entrega</span>',entregue:'<span class="pdv-tag ok">entregue</span>',cancelada:'<span class="pdv-tag warn">cancelada</span>'}[d.status]||esc(d.status||'');
  const tempo = q.minutos_entrega!=null ? dur(q.minutos_entrega) : (q.minutos_em_rota!=null? 'em rota há '+dur(q.minutos_em_rota) : '—');
  box.outerHTML='<div id="pdvDlDet">'
    +'<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">'
      +'<div style="min-width:0"><div style="font-size:18px;font-weight:900">Pedido #'+(d.venda_numero||'')+' '+chip+'</div>'
        +'<div style="font-size:15px;font-weight:800;margin-top:5px">'+esc(d.cliente||'—')+' <span class="pdv-note">'+esc(d.fone||'')+'</span></div>'
        +'<div class="pdv-note">'+esc(d.endereco||'—')+'</div>'
        +'<div class="pdv-note">Sai da loja: <b>'+esc(d.loja_nome||'')+'</b>'+(d.recebida_de_outra?' · pedido de '+esc(d.origem_nome||''):'')+'</div>'
        +(d.obs?'<div class="pdv-note">Obs: '+esc(d.obs)+'</div>':'')+'</div>'
      +'<div style="text-align:right;flex:none"><div style="font-size:22px;font-weight:900">'+BRL(d.total)+'</div>'
        +'<span class="pdv-tag '+(d.pago?'ok':'warn')+'">'+(d.pago?'pago':'cobrar na entrega')+'</span></div>'
    +'</div>'
    +'<div class="pdv-sum" style="margin-top:12px;font-size:13px">'
      +'<div class="l"><span>Pedido criado</span><b>'+fmtDT(d.created_at)+'</b></div>'
      +'<div class="l"><span>Saiu para entrega</span><b>'+fmtDT(q.dispatched_at)+'</b></div>'
      +'<div class="l"><span>Entregue ao cliente</span><b>'+fmtDT(d.delivered_at)+'</b></div>'
      +'<div class="l"><span>⏱️ Tempo de entrega</span><b>'+tempo+'</b></div>'
    +'</div>'
    +'<div class="pdv-list" style="margin-top:12px"><table><thead><tr><th>Item</th><th class="r">Qtd</th><th class="r">Unit.</th><th class="r">Total</th></tr></thead>'
      +'<tbody>'+(itens||'<tr><td colspan="4" class="pdv-note">Sem itens.</td></tr>')+'</tbody></table></div>'
    +'<div class="pdv-sum" style="margin-top:10px">'
      +'<div class="l"><span>Itens</span><b>'+BRL(d.subtotal)+'</b></div>'
      +'<div class="l"><span>Frete</span><b>'+BRL(d.frete)+'</b></div>'
      +'<div class="l big"><span>Total</span><b>'+BRL(d.total)+'</b></div>'
    +'</div>'
    +'<div class="pdv-btns">'
      +'<button class="pdv-btn solid" data-onclick="delivGuide(\''+d.id+'\')">🖨️ Guia/QR</button>'
      +(d.status==='fila'?'<button class="pdv-btn" data-onclick="pdvDelivSet(\''+d.id+'\',\'em_rota\')">Marcar saída 🛵</button>':'')
      +(d.status==='em_rota'?'<button class="pdv-btn" data-onclick="pdvDelivSet(\''+d.id+'\',\'entregue\')">Marcar entregue ✅</button>':'')
      +(d.status==='entregue'&&d.fone?'<button class="pdv-btn ghost" data-onclick="npsWhats(\''+String(d.fone).replace(/\D/g,'')+'\',\''+esc(String(d.cliente||'').replace(/'/g,''))+'\',\''+(d.venda_numero||'')+'\')">💬 Pesquisa NPS</button>':'')
      +'<button class="pdv-btn ghost" data-onclick="pdvDeliveryQueue()">Voltar para a fila</button>'
    +'</div>'
  +'</div>';
};
window.pdvDelivSet=async (id,st)=>{
  if(st==='entregue'&&!await uiConfirm('Confirmar a entrega deste pedido?',{okText:'Confirmar entrega'}))return;
  const {error}=await sb.rpc('erp_delivery_status',{p_id:id,p_status:st,p_forma:'dinheiro'});
  if(error){toast(pdvErr(error));return;}
  toast(st==='em_rota'?'Saiu para entrega 🛵':'Entrega concluída ✅');
  pdvDelivCount(); pdvDeliveryQueue();
};

/* ---------- mapa de rastreio em tempo real, aberto direto da fila de entrega ---------- */
let PDV_TRK={map:null,layer:null,timer:null,fitted:false};
function pdvTrkStop(){ if(PDV_TRK.timer){clearInterval(PDV_TRK.timer);PDV_TRK.timer=null;} PDV_TRK.map=null;PDV_TRK.layer=null;PDV_TRK.fitted=false; }
async function pdvDeliveryMapModal(){
  pdvTrkStop();
  pdvModal('Rastrear entregas no mapa 🗺️',
    '<div id="pdvTrkStatus" class="pdv-note" style="margin-bottom:8px">Carregando o mapa…</div>'
    +'<div id="pdvTrkMap" style="height:min(62vh,520px);border-radius:12px;overflow:hidden;background:#0b1830"></div>'
    +'<div class="pdv-btns"><button class="pdv-btn ghost" data-onclick="pdvDeliveryQueue()">← Voltar para a fila</button></div>', true);
  const st=document.getElementById('pdvTrkStatus');
  if(typeof L==='undefined'){ if(st)st.textContent='Mapa indisponível (offline). Reconecte para rastrear.'; return; }
  const el=document.getElementById('pdvTrkMap'); if(!el) return;
  PDV_TRK.map=L.map(el,{zoomControl:true}).setView([-14.235,-51.925],4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(PDV_TRK.map);
  PDV_TRK.layer=L.layerGroup().addTo(PDV_TRK.map);
  setTimeout(()=>{try{PDV_TRK.map.invalidateSize();}catch(e){}},200);
  await pdvTrkRefresh();
  PDV_TRK.timer=setInterval(()=>{ if(!document.getElementById('pdvTrkMap')){pdvTrkStop();return;} pdvTrkRefresh(); },6000);
}
async function pdvTrkRefresh(){
  if(!PDV_TRK.map)return;
  const st=document.getElementById('pdvTrkStatus');
  let data;
  try{ const r=await sb.rpc('erp_delivery_tracking',{p_minutos:240}); if(r.error)throw r.error; data=r.data||{}; }
  catch(e){ if(st)st.textContent='Sem conexão com o rastreio agora. Tentando de novo…'; return; }
  PDV_TRK.layer.clearLayers();
  const pts=[];
  (data.lojas||[]).forEach(s=>{ if(s.lat==null||s.lng==null)return;
    L.marker([s.lat,s.lng],{icon:trkIcon('🏪','#12307a'),title:s.nome}).addTo(PDV_TRK.layer)
      .bindPopup('<b>🏪 '+esc(s.nome||'Loja')+'</b><br>'+esc(s.endereco||'')); pts.push([s.lat,s.lng]); });
  (data.entregas||[]).forEach(d=>{ if(d.lat==null||d.lng==null)return;
    const ring=d.status==='em_rota'?'#e2a400':(d.status==='entregue'?'#22a65a':'#3b7de0');
    L.marker([d.lat,d.lng],{icon:trkIcon('📦',ring),title:'#'+(d.venda_numero||'')}).addTo(PDV_TRK.layer)
      .bindTooltip('#'+(d.venda_numero||'')+' · '+esc(d.cliente||''),{direction:'top'}); pts.push([d.lat,d.lng]); });
  let online=0;
  (data.motoboys||[]).forEach(mb=>{
    const trail=(mb.trail||[]).filter(p=>p.lat!=null&&p.lng!=null).map(p=>[p.lat,p.lng]);
    if(trail.length>1){ L.polyline(trail,{color:mb.online?'#22a65a':'#8aa0c8',weight:4,opacity:.75}).addTo(PDV_TRK.layer); trail.forEach(p=>pts.push(p)); }
    if(mb.lat!=null&&mb.lng!=null){ if(mb.online)online++;
      const when=mb.at?fmtDT(mb.at):'—';
      L.marker([mb.lat,mb.lng],{icon:trkIcon('🛵',mb.online?'#22a65a':'#8aa0c8'),title:mb.nome,zIndexOffset:1000}).addTo(PDV_TRK.layer)
        .bindPopup('<b>🛵 '+esc(mb.nome||'Motoboy')+'</b><br>'+(mb.online?'🟢 online agora':'⚪ offline · última posição '+when)+'<br>Em rota: <b>'+(mb.em_rota||0)+'</b> · Entregues hoje: <b>'+(mb.entregues||0)+'</b>');
      pts.push([mb.lat,mb.lng]); }
  });
  if(st) st.textContent=(data.motoboys||[]).length
    ? (online+' motoboy(s) online · atualizado '+new Date().toLocaleTimeString('pt-BR'))
    : 'Nenhum motoboy com posição ainda. O app do entregador precisa estar aberto e com GPS.';
  if(pts.length&&!PDV_TRK.fitted){ try{ PDV_TRK.map.fitBounds(pts,{padding:[30,30],maxZoom:16}); PDV_TRK.fitted=true; }catch(e){} }
}
window.pdvDeliveryMapModal=pdvDeliveryMapModal;

/* ================= CREDIÁRIO NO PDV ================= */
const PDV_CRED={ cust:null, parcelas:[], sel:{} };

async function pdvCrediarioModal(q){
  pdvModal('Crediário · receber parcelas 🧾',
    '<label class="pdv-lbl">Buscar cliente por nome, telefone ou documento</label>'
    +'<div class="pdv-row" style="gap:8px">'
      +'<input class="pdv-in" id="pdvCrQ" style="flex:1;min-width:0" placeholder="digite e pressione Enter" value="'+esc(q||'')+'">'
      +'<button class="pdv-btn" style="flex:none" data-onclick="pdvCrediarioSearch()">Buscar</button>'
    +'</div>'
    +'<div id="pdvCrBox" class="pdv-note" style="margin-top:12px">Digite o nome, telefone ou documento do cliente e pressione <b>Enter</b> para localizar as parcelas em aberto.</div>', true);
  const inp=document.getElementById('pdvCrQ');
  if(inp){ inp.onkeydown=e=>{ if(e.key==='Enter'){ e.preventDefault(); pdvCrediarioSearch(); } }; inp.focus(); }
  if((q||'').trim()) pdvCrediarioSearch();
}
async function pdvCrediarioSearch(){
  const box=document.getElementById('pdvCrBox'); if(!box) return;
  const q=((document.getElementById('pdvCrQ')||{}).value||'').trim();
  const asNote=()=>{ box.className='pdv-note'; box.style.marginTop='12px'; };
  if(!q){ asNote(); box.innerHTML='Digite o nome, telefone ou documento do cliente e pressione <b>Enter</b> para localizar as parcelas em aberto.'; return; }
  asNote(); box.innerHTML='Buscando…';
  const { data, error } = await sb.rpc('erp_crediario_search',{ p_q:q });
  if(error){ box.innerHTML='Erro: '+esc(error.message); return; }
  const rows=data||[];
  if(!rows.length){ box.innerHTML='Nenhum cliente com conta em aberto para “'+esc(q)+'”.'; return; }
  box.className=''; box.style.marginTop='12px';
  box.innerHTML='<div class="pdv-list"><table>'
    +'<thead><tr><th>Cliente</th><th>Contato</th><th class="r">Parcelas</th><th class="r">Em aberto</th><th>Próx. venc.</th><th></th></tr></thead><tbody>'
    +rows.map(r=>'<tr data-onclick="pdvCredOpen(\'' + r.customer_id + '\')">'
      +'<td><b>'+esc(r.nome||'—')+'</b>'+(r.vencidas>0?' <span class="pdv-tag warn">'+r.vencidas+' vencida(s)</span>':'')+'</td>'
      +'<td>'+esc(r.telefone||r.documento||'—')+'</td>'
      +'<td class="r">'+r.parcelas+'</td>'
      +'<td class="r"><b>'+BRL(r.total)+'</b>'+(r.total_vencido>0?'<br><span class="neg">'+BRL(r.total_vencido)+' vencido</span>':'')+'</td>'
      +'<td>'+pdvCredDate(r.proximo_venc)+'</td>'
      +'<td class="r"><button class="pdv-btn solid mini" data-onclick="event.stopPropagation();pdvCredOpen(\'' + r.customer_id + '\')">Abrir</button></td>'
    +'</tr>').join('')
    +'</tbody></table></div>';
}
function pdvCredDate(d){
  if(!d) return '—';
  const x=String(d);
  const dt = x.length>10 ? new Date(x) : new Date(x+'T00:00:00');
  return isNaN(dt) ? '—' : dt.toLocaleDateString('pt-BR');
}
window.pdvCredOpen = async (id)=>{
  const { data, error } = await sb.rpc('erp_receivables_customer',{ p_customer:id });
  if(error){ toast(pdvErr(error)); return; }
  const d=data||{};
  PDV_CRED.cust=d.cliente||{id:id,nome:'Cliente'};
  PDV_CRED.parcelas=d.parcelas||[];
  PDV_CRED.sel={};
  if(!PDV_CRED.parcelas.length){ toast('Este cliente não tem parcelas em aberto.'); return; }
  pdvCredRender();
};
function pdvCredRender(){
  const c=PDV_CRED.cust, ps=PDV_CRED.parcelas;
  const total=round2(ps.reduce((a,p)=>a+ +p.valor,0));
  const venc=ps.filter(p=>p.atrasada);
  pdvModal('Crediário · '+((c&&c.nome)||'Cliente'),
    '<div style="display:flex;gap:16px;flex-wrap:wrap">'
    +'<div style="flex:1 1 420px;min-width:0">'
      +'<div class="pdv-note" style="margin-bottom:8px">'
        +'<b style="font-size:15px">'+esc((c&&c.nome)||'')+'</b>'
        +((c&&c.telefone)?' · '+esc(c.telefone):'')
        +'<br>'+ps.length+' parcela(s) em aberto · total '+BRL(total)
        +(venc.length?' · <span style="color:#ffb3b3">'+venc.length+' vencida(s)</span>':'')
      +'</div>'
      +'<div class="pdv-btns" style="margin:0 0 8px">'
        +'<button class="pdv-btn ghost mini" data-onclick="pdvCredMark(\'todas\')">Marcar todas</button>'
        +'<button class="pdv-btn ghost mini" data-onclick="pdvCredMark(\'vencidas\')">Só as vencidas</button>'
        +'<button class="pdv-btn ghost mini" data-onclick="pdvCredMark(\'nenhuma\')">Limpar</button>'
        +'<button class="pdv-btn ghost mini" data-onclick="pdvCrediarioModal()">← Outro cliente</button>'
      +'</div>'
      +'<div class="pdv-list"><table>'
        +'<thead><tr><th style="width:34px"></th><th>Parcela</th><th>Venda</th><th>Vencimento</th><th class="r">Valor</th></tr></thead>'
        +'<tbody>'+ps.map(p=>'<tr id="pdvCrRow_'+p.id+'" data-onclick="pdvCredToggle(\'' + p.id + '\')">'
          +'<td><input type="checkbox" class="pdv-check" id="pdvCrCk_'+p.id+'" data-onclick="event.stopPropagation();pdvCredToggle(\'' + p.id + '\')"></td>'
          +'<td><b>'+p.parcela_num+'/'+p.parcelas_tot+'</b>'+(p.e_saldo?' <span class="pdv-tag">saldo</span>':'')+'</td>'
          +'<td>'+(p.venda_num?('#'+p.venda_num):'—')+'</td>'
          +'<td>'+pdvCredDate(p.vencimento)+(p.atrasada?' <span class="pdv-tag warn">'+p.dias_atraso+'d</span>':'')+'</td>'
          +'<td class="r"><b>'+BRL(p.valor)+'</b></td></tr>').join('')
        +'</tbody></table></div>'
    +'</div>'
    +'<div style="flex:1 1 290px">'
      +'<div class="pdv-sum" id="pdvCrSum"></div>'
      +'<label class="pdv-lbl">Valor recebido agora R$</label>'
      +'<input class="pdv-in num" id="pdvCrVal" value="0,00" data-oninput="pdvCredRecalc()">'
      +'<button class="pdv-btn ghost" style="width:100%;margin-top:6px" data-onclick="pdvCredFull()">Receber o total selecionado</button>'
            +'<label class="pdv-lbl" style="margin-top:10px">Forma de recebimento</label>'
      +'<div id="pdvCrSaldoBox" style="display:none;margin:2px 0 6px">'
        +'<label class="pdv-lbl">Vencimento da nova cobrança (o restante)</label>'
        +'<input class="pdv-in" id="pdvCrSaldoVenc" type="date">'
        +'<div class="pdv-note" style="margin-top:4px">Em branco = mantém o mesmo vencimento da parcela.</div>'
      +'</div>'
      +'<div class="pdv-btns" id="pdvCrPayBtns" style="flex-wrap:wrap;gap:8px">'
        +'<button class="pdv-btn" style="flex:1 1 45%;background:#1b7a4b" data-onclick="pdvCredPay(\'dinheiro\')">💵 Dinheiro</button>'
        +'<button class="pdv-btn" style="flex:1 1 45%;background:#60a5fa" data-onclick="pdvCredPay(\'debito\')">💳 Débito</button>'
        +'<button class="pdv-btn" style="flex:1 1 45%;background:#60a5fa" data-onclick="pdvCredPay(\'credito\')">💳 Crédito</button>'
        +'<button class="pdv-btn" style="flex:1 1 45%;background:#7ee2a8;color:#12307a" data-onclick="pdvCredPay(\'pix\')">⚡ PIX</button>'
      +'</div>'
      +'<button class="pdv-btn ghost" style="width:100%;margin-top:6px" data-pdv-close>Fechar (ESC)</button>'
    +'</div></div>', true);
  pdvCredSyncChecks();
  pdvCredRecalc();
}
function pdvCredSel(){ return PDV_CRED.parcelas.filter(p=>PDV_CRED.sel[p.id]); }
function pdvCredSelTotal(){ return round2(pdvCredSel().reduce((a,p)=>a+ +p.valor,0)); }
window.pdvCredToggle = (id)=>{
  PDV_CRED.sel[id] = !PDV_CRED.sel[id];
  pdvCredSyncChecks();
  pdvCredFull();
};
window.pdvCredMark = (modo)=>{
  PDV_CRED.sel={};
  if(modo==='todas') PDV_CRED.parcelas.forEach(p=>PDV_CRED.sel[p.id]=true);
  if(modo==='vencidas') PDV_CRED.parcelas.filter(p=>p.atrasada).forEach(p=>PDV_CRED.sel[p.id]=true);
  pdvCredSyncChecks();
  pdvCredFull();
};
function pdvCredSyncChecks(){
  PDV_CRED.parcelas.forEach(p=>{
    const ck=document.getElementById('pdvCrCk_'+p.id), tr=document.getElementById('pdvCrRow_'+p.id);
    if(ck) ck.checked=!!PDV_CRED.sel[p.id];
    if(tr) tr.className = PDV_CRED.sel[p.id]?'on':'';
  });
}
window.pdvCredFull = ()=>{
  const el=document.getElementById('pdvCrVal');
  if(el) el.value=pdvCredSelTotal().toFixed(2).replace('.',',');
  pdvCredRecalc();
};
window.pdvCredRecalc = ()=>{
  const sel=pdvCredSel(), tot=pdvCredSelTotal();
  const pago=round2(pdvNum((document.getElementById('pdvCrVal')||{}).value));
  const resto=round2(Math.max(0, tot-pago));
  const excede=pago>tot+0.005;
  const el=document.getElementById('pdvCrSum');
  if(el) el.innerHTML=
     '<div class="l"><span>Parcelas marcadas</span><b>'+sel.length+'</b></div>'
    +'<div class="l big"><span>SELECIONADO</span><span>'+BRL(tot)+'</span></div>'
    +'<div class="l" style="margin-top:8px"><span>Recebendo agora</span><b>'+BRL(pago)+'</b></div>'
    +(excede
      ?'<div class="l" style="color:#ffb3b3"><span>Acima do selecionado</span><b>'+BRL(round2(pago-tot))+'</b></div>'
      :(resto>0.009
        ?'<div class="l" style="color:#ffd76a"><span>Vira nova cobrança</span><b>'+BRL(resto)+'</b></div>'
        :'<div class="l" style="color:#7ee2a8"><span>Quita a seleção</span><b>✓</b></div>'));
  const box=document.getElementById('pdvCrSaldoBox');
  if(box) box.style.display = (resto>0.009 && !excede) ? '' : 'none';
    const ok=(sel.length>0 && pago>0 && !excede);
  const btns=document.getElementById('pdvCrPayBtns');
  if(btns) btns.querySelectorAll('button').forEach(function(b){ b.disabled=!ok; });
};
window.pdvCredPay = async (tipo)=>{
  const sel=pdvCredSel(); if(!sel.length){ toast('Marque pelo menos uma parcela'); return; }
  const tot=pdvCredSelTotal();
  const pago=round2(pdvNum((document.getElementById('pdvCrVal')||{}).value));
  if(!(pago>0)){ toast('Informe o valor recebido'); return; }
  if(pago>tot+0.005){ toast('O valor recebido é maior que o total selecionado'); return; }
  const vsaldo=((document.getElementById('pdvCrSaldoVenc')||{}).value)||null;
  const resto=round2(tot-pago);
  if(resto>0.009 && !await uiConfirm('Recebendo '+BRL(pago)+' de '+BRL(tot)+'.\n\nO restante de '+BRL(resto)+' vira automaticamente uma nova cobrança. Confirmar?')) return;
  const ids=sel.map(p=>p.id);
  PDV_CRED.pending={ ids:ids, pago:pago, vsaldo:vsaldo, tot:tot };
  if(tipo==='dinheiro'){
    const btns=document.getElementById('pdvCrPayBtns'); if(btns) btns.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{
      const { data, error } = await sb.rpc('erp_receivables_pay',{ p_ids:ids, p_metodo:'dinheiro', p_valor:pago, p_venc_saldo:vsaldo });
      if(error) throw error;
      pdvCredDone(data||{});
      if(typeof refreshCash==='function') refreshCash();
      if(typeof loadCrediario==='function' && currentPage==='crediario') loadCrediario();
    }catch(e){ console.error(e); toast(pdvErr(e)); const b2=document.getElementById('pdvCrPayBtns'); if(b2) b2.querySelectorAll('button').forEach(b=>b.disabled=false); }
    return;
  }
  const terms=(TERMINALS||[]);
  if(!terms.length){ toast('Cadastre uma maquininha em Config → Maquininhas'); return; }
  let term=null; const _bid=pdvBoundMachineId(); if(_bid) term=terms.find(t=>t.id===_bid)||null; if(!term) term=(terms.length===1?terms[0]:null);
  if(!term){ pdvModal('Escolha a maquininha 💳', terms.map(t=>'<button class="pdv-btn" style="width:100%;margin:5px 0;text-align:left" data-onclick="pdvCloseModal();pdvCredMaquininha(\''+tipo+'\',\''+t.id+'\')">💳 '+esc(t.nome)+'</button>').join('')+'<button class="pdv-btn ghost" style="width:100%;margin-top:6px" data-pdv-close>Cancelar</button>', true); return; }
  pdvCredMaquininha(tipo, term.id);
};
async function pdvCredMaquininha(tipo, termId){
  const ctx=PDV_CRED.pending; if(!ctx){ toast('Refaça a seleção do crediário'); return; }
  if(PDV.busy) return; PDV.busy=true;
  try{
    const { data:r, error } = await sb.rpc('erp_receivables_pos_request',{ p_ids:ctx.ids, p_terminal:termId, p_tipo:tipo, p_valor:ctx.pago, p_venc_saldo:ctx.vsaldo, p_store:CURRENT_STORE });
    if(error) throw error;
    PDV.busy=false;
    window._posCred={ recebido:ctx.pago, parcelas_pagas:ctx.ids.length, saldo:round2(ctx.tot-ctx.pago) };
    posFlowRequest(r.id, (+r.valor||ctx.pago), termId, tipo, 'crediario');
  }catch(e){ PDV.busy=false; console.error(e); toast(pdvErr(e)); }
}
async function posFlowRequest(reqId, total, terminalId, tipo, kind){
  window._posSettled=false; window._posKind=kind||'venda'; window._posSnap=null;
  const tipoLbl={credito:'Crédito',debito:'Débito',pix:'PIX'}[tipo]||tipo;
  modal('<div class="m-head"><h3>Maquininha · '+(kind==='crediario'?'Crediário':'Cobrança')+'</h3><button data-onclick="closePos()">&times;</button></div>'
    +'<div class="m-body qrbox" id="posBody"><div style="font-size:44px">💳</div>'
    +'<p style="font-family:\'Fredoka\';font-size:28px;font-weight:700;margin:4px 0">'+BRL(total)+'</p>'
    +'<p class="muted">'+tipoLbl+'</p>'
    +'<p id="posStat" style="margin-top:14px"><span class="chip amber">📲 Enviando a cobrança para a maquininha Mercado Pago Point…</span></p>'
    +'<p class="muted" style="font-size:13px;margin-top:8px">Siga as instruções na tela da maquininha.</p></div>'
    +'<div class="m-foot"><button class="btn ghost" data-onclick="cancelPos()">Cancelar cobrança</button></div>');
  CFD_PAYAMT=total;
  if(tipo==='pix') cfdPay({ status:'pix_wait', amount:total, machine:true }); else cfdPay({ status:'card_wait', amount:total });
  window._posReq=reqId; window._posSale=null;
  sb.functions.invoke('pos-cloud-charge',{ body:{ request_id:reqId } })
    .then(({data,error})=>{ if(error){ console.warn('pos-cloud-charge',error); if(!window._posSettled) posFailChoice('Não consegui acionar a maquininha. Verifique o aparelho e tente outra forma de pagamento.'); } })
    .catch(e=>console.warn('pos-cloud-charge',e));
  if(POS_CHAN){ sb.removeChannel(POS_CHAN); }
  POS_CHAN = sb.channel('pos-'+reqId).on('postgres_changes', { event:'UPDATE', schema:'public', table:'pos_payment_requests', filter:'id=eq.'+reqId }, p=> onPosUpdate(p.new)).subscribe();
  posPoll(reqId);
}
function posCredApproved(){
  const c=window._posCred||{};
  try{ if(typeof refreshCash==='function') refreshCash(); }catch(_){}
  try{ if(typeof loadCrediario==='function' && currentPage==='crediario') loadCrediario(); }catch(_){}
  pdvCredDone({ recebido:c.recebido||0, parcelas_pagas:c.parcelas_pagas||0, saldo:c.saldo||0 });
}
function pdvCredDone(r){
  const c=PDV_CRED.cust||{};
  const saldo=+r.saldo||0;
  pdvModal('Recebimento confirmado ✅',
    '<div style="text-align:center;padding:6px 0 2px">'
      +'<div style="font-size:42px">✅</div>'
      +'<div style="font-size:30px;font-weight:900">'+BRL(r.recebido)+'</div>'
      +'<div class="pdv-note">'+(r.parcelas_pagas||0)+' parcela(s) quitada(s) · '+esc((c&&c.nome)||'')+'</div>'
    +'</div>'
    +(saldo>0.009
      ?'<div class="pdv-status-wait" style="margin-top:12px">🧾 Nova cobrança de <b>'+BRL(saldo)+'</b> gerada'
        +' com vencimento em <b>'+pdvCredDate(r.saldo_vencimento)+'</b>.</div>'
      :'<div class="pdv-status-ok" style="margin-top:12px">Tudo que foi selecionado está quitado.</div>')
    +'<div class="pdv-btns">'
      +'<button class="pdv-btn" data-onclick="pdvCredOpen(\'' + ((c&&c.id)||'') + '\')">Ver contas do cliente</button>'
      +'<button class="pdv-btn ghost" data-onclick="pdvCrediarioModal()">Outro cliente</button>'
      +'<button class="pdv-btn ghost" data-pdv-close>Fechar (ESC)</button>'
    +'</div>');
}

/* ---------- F9/F10 · suprimento e sangria ---------- */
function pdvMoveModal(kind){
  const perm=kind==='sangria'?'pdv_sangria':'pdv_suprimento';
  if(!can(perm)){toast('Você não tem permissão para este movimento');return;}
  const sup=kind==='suprimento';
  pdvModal(sup?'Suprimento (entrada de dinheiro)':'Sangria (retirada de dinheiro)',
    '<label class="pdv-lbl">Valor R$</label><input class="pdv-in num" id="pdvMvAmt" value="0,00">'
    +'<label class="pdv-lbl" style="margin-top:10px">Motivo</label>'
    +'<input class="pdv-in" id="pdvMvWhy" placeholder="'+(sup?'ex: reforço de troco':'ex: retirada para o cofre')+'">'
    +'<div class="pdv-btns"><button class="pdv-btn" id="pdvMvGo" data-onclick="pdvDoMove(\''+kind+'\')">Confirmar</button>'
    +'<button class="pdv-btn ghost" data-pdv-close>Cancelar</button></div>');
}
async function pdvDoMove(kind){
  const amt=pdvNum((document.getElementById('pdvMvAmt')||{}).value);
  const why=((document.getElementById('pdvMvWhy')||{}).value||'').trim();
  if(!(amt>0)){toast('Informe um valor maior que zero');return;}
  // Sessão provisória (aberta offline) não tem gaveta real no servidor → não dá para atribuir.
  if(PDV.ses&&PDV.ses.offline){ toast('Abra o caixa com internet para registrar sangria/suprimento.', true); return; }
  // Caixa real aberto mas sem internet: enfileira e sincroniza ao reconectar (idempotente).
  if(!navigator.onLine){
    enqueueOp({kind:'movement', mkind:kind, amount:amt, reason:why});
    pdvCloseModal(); toast((kind==='sangria'?'Sangria':'Suprimento')+' de '+BRL(amt)+' salva offline · sincroniza ao reconectar');
    return;
  }
  const b=document.getElementById('pdvMvGo');if(b){b.disabled=true;b.textContent='Gravando...';}
  try{
    const {error}=await sb.rpc('pdv_movement',{p_session:PDV.ses.id,p_kind:kind,p_amount:amt,p_reason:why});
    if(error)throw error;
    pdvCloseModal();toast((kind==='sangria'?'Sangria':'Suprimento')+' de '+BRL(amt)+' registrada ✓');
  }catch(e){ if(isNetworkErr(e)){ enqueueOp({kind:'movement', mkind:kind, amount:amt, reason:why}); pdvCloseModal(); toast((kind==='sangria'?'Sangria':'Suprimento')+' de '+BRL(amt)+' salva offline · sincroniza ao reconectar'); return; }
    console.error(e);toast(pdvErr(e));if(b){b.disabled=false;b.textContent='Confirmar';}}
}

/* ---------- F7 · finalizar venda ---------- */
// vencimento do crediário: hoje + 30 dias, em data LOCAL (evita "pular" 1 dia por causa do fuso/UTC)
function pdvCredVenc(){const d=new Date();d.setDate(d.getDate()+30);const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
function pdvFinishModal(){
  if(!PDV.items.length){toast('Nenhum item na venda');return;}
  const t=pdvTotals(),c=PDV.cust;
  const credVenc=pdvCredVenc();
  pdvModal('Finalizar Venda',
    '<div style="display:flex;gap:16px;flex-wrap:wrap">'
    +'<div style="flex:1 1 320px">'
      +'<div class="pdv-row" style="gap:12px">'
        +'<div style="flex:1"><label class="pdv-lbl">Desconto geral R$</label>'
          +'<input class="pdv-in num" id="pdvFDisc" value="'+(can('pdv_desconto')?t.manual:0).toFixed(2).replace('.',',')+'" data-oninput="pdvFinishRecalc()" '+(can('pdv_desconto')?'':'disabled title="Sem permissão para desconto"')+'></div>'
        +'<div style="flex:1"><label class="pdv-lbl">Acréscimo R$</label>'
          +'<input class="pdv-in num" id="pdvFSur" value="'+t.sur.toFixed(2).replace('.',',')+'" data-oninput="pdvFinishRecalc()"></div>'
      +'</div>'
      +(c?'<div class="pdv-note" style="margin-top:10px">Cliente: <b>'+esc(c.name||'')+'</b></div>'
        :'<div class="pdv-note" style="margin-top:10px">Sem cliente identificado. Pressione <b>F1</b> para identificar.</div>')
      +(CB_ACTIVE&&c&&(+c.cashback||0)>0
        ? '<div class="pdv-pay" style="flex-wrap:wrap;gap:8px;margin-top:10px;background:rgba(246,196,83,.15);border-radius:10px;padding:8px 10px">'
            +'<span style="font-weight:700;flex:1">🎁 Cashback disponível: <b>'+BRL(c.cashback)+'</b></span>'
            +'<label class="pdv-lbl" style="flex:1 1 100%;margin:2px 0 0">Usar como desconto R$</label>'
            +'<input class="pdv-in num" id="pdvFCb" style="max-width:130px" value="0,00" data-oninput="pdvFinishRecalc()">'
            +'<button type="button" class="pdv-btn ghost" style="flex:0 0 auto;padding:8px 12px" data-onclick="pdvUseAllCashback()">Usar tudo</button>'
          +'</div>'
        : '')
      +'<div style="margin-top:14px"><label class="pdv-lbl">Formas de pagamento</label>'
        +['dinheiro','pix','debito','credito'].map(m=>
          '<div class="pdv-pay"><span style="font-weight:700;text-transform:capitalize">'
          +(m==='debito'?'Cartão de débito':m==='credito'?'Cartão de crédito':m==='pix'?'PIX manual':'Dinheiro')+'</span>'
          +'<input class="pdv-in num" id="pdvP_'+m+'" value="0,00" data-oninput="pdvFinishRecalc()"></div>').join('')
        +(c
          ? '<div class="pdv-pay" style="flex-wrap:wrap;gap:8px"><span style="font-weight:700;flex:1">🧾 Crediário</span>'
            +'<input class="pdv-in num" id="pdvP_crediario" style="max-width:130px" value="0,00" data-oninput="pdvFinishRecalc()">'
            +'<div class="pdv-lbl" style="flex:1 1 100%;margin-top:4px">Vencimento em 30 dias · '+fmtDate(credVenc)+'</div></div>'
          : '<div class="pdv-note" style="margin-top:6px">🧾 Para vender no <b>crediário</b>, identifique o cliente (F1).</div>')
      +'<div class="pdv-lbl" style="margin:12px 0 4px">Cobrar na maquininha · Mercado Pago Point</div>'
      +'<div style="display:flex;gap:6px;flex-wrap:wrap">'
        +'<button class="pdv-btn" id="pdvMaqDeb" style="flex:1 1 30%;margin:0;background:#60a5fa" data-onclick="pdvMaquininha(\'debito\')">💳 Débito</button>'
        +'<button class="pdv-btn" id="pdvMaqCred" style="flex:1 1 30%;margin:0;background:#60a5fa" data-onclick="pdvMaquininha(\'credito\')">💳 Crédito</button>'
        +'<button class="pdv-btn" id="pdvMaqPix" style="flex:1 1 30%;margin:0;background:#7ee2a8" data-onclick="pdvMaquininha(\'pix\')">⚡ PIX</button>'
      +'</div>'
      +'<div class="pdv-lbl" style="margin:12px 0 4px">PIX no caixa · QR na tela (cliente escaneia com o celular)</div>'
      +'<button class="pdv-btn" id="pdvPixGo" style="width:100%;margin:0;background:#7ee2a8;color:#1a2540" data-onclick="pdvStartDynamicPix()">⚡ Gerar QR PIX e confirmar sozinho</button>'
      +'<button class="pdv-btn ghost" style="width:100%;margin-top:4px" data-onclick="pdvFillCash()">Preencher o total em dinheiro</button>'
      +(c?'<button class="pdv-btn" style="width:100%;margin-top:6px;background:#f6c453;color:#1a2540" data-onclick="pdvFillCrediario()">🧾 Lançar o total no crediário</button>':'')
      +'</div>'
    +'</div>'
    +'<div style="flex:1 1 280px">'
      +'<div class="pdv-sum" id="pdvFSum"></div>'
      +'<div class="pdv-btns" style="margin-top:0">'
        +'<button class="pdv-btn" id="pdvFGo" style="flex:1;font-size:16px;padding:14px" data-onclick="pdvConfirmSale()">Confirmar venda (F7)</button>'
      +'</div>'
      +'<button class="pdv-btn ghost" style="width:100%;margin-top:8px" data-pdv-close>Voltar</button>'
    +'</div></div>');
  pdvFinishRecalc();
}
function pdvFinishPays(){
  const out=[];
  ['dinheiro','pix','debito','credito'].forEach(m=>{
    const v=pdvNum((document.getElementById('pdvP_'+m)||{}).value);
    if(v>0)out.push({m:m,v:round2(v)});
  });
  const cv=pdvNum((document.getElementById('pdvP_crediario')||{}).value);
  if(cv>0){
    out.push({m:'crediario',v:round2(cv),parcelas:1,venc:pdvCredVenc()});
  }
  return out;
}
function pdvFinishRecalc(){
  PDV.disc=pdvNum((document.getElementById('pdvFDisc')||{}).value);
  PDV.sur=pdvNum((document.getElementById('pdvFSur')||{}).value);
  PDV.cb=PDV.cust?pdvNum((document.getElementById('pdvFCb')||{}).value):0;
  if(PDV.cust&&PDV.cb>(PDV.cust.cashback||0))PDV.cb=round2(PDV.cust.cashback||0);
  const t=pdvTotals();
  const pays=pdvFinishPays();
  const paid=round2(pays.reduce((a,p)=>a+p.v,0));
  const cash=round2(pays.filter(p=>p.m==='dinheiro').reduce((a,p)=>a+p.v,0));
  const rest=round2(t.total-paid);
  const el=document.getElementById('pdvFSum');
  if(el)el.innerHTML=
     '<div class="l"><span>Subtotal</span><b>'+BRL(t.sub)+'</b></div>'
    +(t.idisc>0?'<div class="l"><span>Desconto nos itens</span><b>− '+BRL(t.idisc)+'</b></div>':'')
    +(t.promo>0?'<div class="l"><span>🏷️ Promoção</span><b>− '+BRL(t.promo)+'</b></div>':'')
    +(t.manual>0?'<div class="l"><span>Desconto geral</span><b>− '+BRL(t.manual)+'</b></div>':'')
    +(t.mdisc>0?'<div class="l"><span>🎫 Assinante ('+pdvQ(PDV.mpct,0)+'%)</span><b>− '+BRL(t.mdisc)+'</b></div>':'')
    +(t.cb>0?'<div class="l cb"><span>Cashback resgatado</span><b>− '+BRL(t.cb)+'</b></div>':'')
    +(t.sur>0?'<div class="l"><span>Acréscimo</span><b>+ '+BRL(t.sur)+'</b></div>':'')
    +'<div class="l big"><span>TOTAL</span><span>'+BRL(t.total)+'</span></div>'
    +'<div class="l" style="margin-top:8px"><span>Recebido</span><b>'+BRL(paid)+'</b></div>'
    +(rest>0.009?'<div class="l" style="color:#ffb3b3"><span>Falta</span><b>'+BRL(rest)+'</b></div>'
      :'<div class="l" style="color:#7ee2a8"><span>Troco</span><b>'+BRL(Math.max(0,-rest))+'</b></div>');
  const go=document.getElementById('pdvFGo');
  if(go){
    const okTroco=(-rest)<=cash+0.01;
    go.disabled=!(paid>=t.total-0.01&&okTroco&&t.total>=0);
    go.title=okTroco?'':'O troco não pode ser maior que o dinheiro recebido';
  }
  const f=document.getElementById('pdvFCb');
  if(f&&PDV.cust&&pdvNum(f.value)!==PDV.cb)f.value=PDV.cb.toFixed(2).replace('.',',');
}
function pdvUseAllCashback(){
  const c=PDV.cust,f=document.getElementById('pdvFCb'); if(!c||!f)return;
  // resgata o máximo possível: limitado ao saldo E ao valor abatível da compra
  // (subtotal − descontos − assinante); acréscimo não é abatido por cashback.
  const t=pdvTotals();
  const abativel=round2(Math.max(0,t.sub-t.idisc-t.promo-t.manual-t.mdisc));
  const usar=round2(Math.min(+c.cashback||0,abativel));
  f.value=usar.toFixed(2).replace('.',',');
  pdvFinishRecalc();
}
function pdvFillCash(){
  const t=pdvTotals();
  ['pix','debito','credito','crediario'].forEach(m=>{const e=document.getElementById('pdvP_'+m);if(e)e.value='0,00';});
  const e=document.getElementById('pdvP_dinheiro');if(e)e.value=t.total.toFixed(2).replace('.',',');
  pdvFinishRecalc();
}
function pdvFillCrediario(){
  const cel=document.getElementById('pdvP_crediario');
  if(!cel){toast('Identifique o cliente (F1) para vender no crediário');return;}
  const t=pdvTotals();
  ['dinheiro','pix','debito','credito'].forEach(m=>{const e=document.getElementById('pdvP_'+m);if(e)e.value='0,00';});
  cel.value=t.total.toFixed(2).replace('.',',');
  pdvFinishRecalc();
}
async function pdvDiscountApproved(t){
  const hasDiscount=(t.manual||0)>0||(t.idisc||0)>0;
  if(hasDiscount&&!can('pdv_desconto')){toast('Você não tem permissão para aplicar desconto');return false;}
  return true;
}
function pdvPixKey(){return 'petapp_pdv_pix_'+String(PDV.terminal||'CAIXA-1').replace(/\W/g,'_');}
function pdvSavePendingPix(){try{if(PDV.pix)localStorage.setItem(pdvPixKey(),JSON.stringify(PDV.pix));else localStorage.removeItem(pdvPixKey());}catch(e){console.error(e);}}
function pdvLoadPendingPix(){try{const x=JSON.parse(localStorage.getItem(pdvPixKey())||'null');PDV.pix=x&&x.intentId?x:null;PDV.busy=!!PDV.pix;
  if(PDV.pix&&PDV.pix.cart&&!PDV.items.length){const s=PDV.pix.cart;PDV.items=s.items||[];PDV.cust=s.cust||null;PDV.disc=s.disc||0;PDV.sur=s.sur||0;PDV.cb=s.cb||0;PDV.sel=PDV.items.length-1;}}
  catch(e){PDV.pix=null;}}
async function pdvStartDynamicPix(){
  if(!navigator.onLine){toast('O PIX dinâmico exige internet. Use pagamento manual para registrar offline.');return;}
  if(PDV.pix){pdvPixModal();return;}if(PDV.busy)return;
  const t=pdvTotals();if(!PDV.items.length||t.total<=0){toast('A venda precisa ter total maior que zero');return;}
  if(!(await pdvDiscountApproved(t)))return;
  PDV.busy=true;const b=document.getElementById('pdvPixGo');if(b){b.disabled=true;b.textContent='Gerando QR seguro...';}
  const snap=pdvSnapshot();
  try{
    const {data,error}=await sb.functions.invoke('pdv-pix-payment',{body:{action:'create',sessionId:PDV.ses.id,
      customerId:PDV.cust?PDV.cust.id:null,items:PDV.items.map(i=>({id:i.id,vid:i.vid||'',qty:i.qty,disc:round2(i.disc||0)})),
      discount:t.manual,surcharge:t.sur,cashback:t.cb,payer:{name:(PDV.cust&&PDV.cust.name)||'Cliente balcão',email:(PDV.cust&&PDV.cust.email)||''}}});
    if(error)throw error;if(!data||!data.ok)throw new Error((data&&data.error)||'Falha ao gerar PIX');
    PDV.pix={intentId:data.intentId,paymentId:data.paymentId,total:data.total,qrCode:data.qrCode||'',qrCodeBase64:data.qrCodeBase64||'',
      expiresAt:data.expiresAt||'',cart:snap,createdAt:new Date().toISOString()};pdvSavePendingPix();pdvPixModal();pdvPollPix();
  }catch(e){console.error(e);PDV.busy=false;toast(pdvErr(e));if(b){b.disabled=false;b.textContent='⚡ Gerar QR PIX e confirmar sozinho';}}
}
function pdvPixModal(){
  const p=PDV.pix;if(!p)return;
  pdvModal('PIX automático · '+BRL(p.total),
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;align-items:center">'
      +'<div class="pdv-qr">'+(p.qrCodeBase64?'<img alt="QR Code PIX" src="data:image/png;base64,'+p.qrCodeBase64+'">':'<div class="pdv-note">QR indisponível</div>')+'</div>'
      +'<div><div id="pdvPixStatus" class="pdv-status-wait">⏳ Aguardando o pagamento cair...</div>'
        +'<div class="pdv-note" style="margin:10px 0">O caixa conclui a venda sozinho após a confirmação do Mercado Pago. Estoque e cashback ainda não foram movimentados.</div>'
        +(p.qrCode?'<textarea class="pdv-in" id="pdvPixCode" readonly style="height:72px;font-size:11px">'+esc(p.qrCode)+'</textarea><button class="pdv-btn" style="width:100%;margin-top:7px" data-onclick="pdvCopyDynamicPix()">📋 Copiar PIX</button>':'')
        +'<div class="pdv-btns"><button class="pdv-btn ghost" data-onclick="pdvCheckPixNow()">Atualizar agora</button><button class="pdv-btn pdv-danger" data-onclick="pdvCancelDynamicPix()">Cancelar cobrança</button></div>'
      +'</div></div>');
}
function pdvCopyDynamicPix(){const e=document.getElementById('pdvPixCode');if(!e)return;
  if(navigator.clipboard)navigator.clipboard.writeText(e.value).then(()=>toast('PIX copiado ✓'));else{e.select();document.execCommand('copy');toast('PIX copiado ✓');}}
function pdvPollPix(){
  if(PDV.pixPoll)clearTimeout(PDV.pixPoll);if(!PDV.pix)return;
  PDV.pixPoll=setTimeout(async()=>{await pdvCheckPixNow(true);if(PDV.pix)pdvPollPix();},3000);
}
async function pdvCheckPixNow(silent){
  if(!PDV.pix||PDV._pixChecking)return;PDV._pixChecking=true;
  const st=document.getElementById('pdvPixStatus');if(st&&!silent)st.textContent='🔄 Conferindo no Mercado Pago...';
  try{const {data,error}=await sb.functions.invoke('pdv-pix-payment',{body:{action:'status',intentId:PDV.pix.intentId,paymentId:PDV.pix.paymentId}});
    if(error)throw error;if(data&&data.approved&&data.sale){pdvCompleteDynamicPix(data.sale);return;}
    if(data&&['cancelled','rejected','expired'].includes(data.status)){pdvClearDynamicPix();toast('PIX não concluído · venda continua aberta');pdvFinishModal();return;}
    if(st)st.textContent=data&&data.finalizing?'✅ Pago · finalizando a venda...':'⏳ Aguardando o pagamento cair...';
  }catch(e){if(!silent){console.error(e);toast(pdvErr(e));if(st)st.textContent='Não consegui consultar agora. Tentando novamente...';}}
  finally{PDV._pixChecking=false;}
}
function pdvClearDynamicPix(){if(PDV.pixPoll)clearTimeout(PDV.pixPoll);PDV.pixPoll=null;PDV.pix=null;PDV.busy=false;pdvSavePendingPix();}
function pdvCompleteDynamicPix(sale){
  const snap=PDV.pix&&PDV.pix.cart?PDV.pix.cart:pdvSnapshot();const pays=[{m:'pix',v:+(sale.total||PDV.pix.total||0)}];
  PDV.lastSale={res:sale,items:snap.items||[],pays:pays,when:new Date(),customerId:(snap.cust&&snap.cust.id)||null};PDV._lastPhone=(snap.cust&&snap.cust.phone)||'';
  try{ pdvClearDynamicPix();pdvResetDraft(); }catch(err){ console.error('pós-PIX:',err); }
  try{ pdvReceiptModal(PDV.lastSale); }catch(err){ console.error('pdvReceiptModal:',err); toast('Venda concluída, mas não consegui exibir o recibo.'); }
  try{ renderCaixa(); }catch(err){ console.error('renderCaixa:',err); }
  toast('PIX confirmado · venda concluída ✓');
}
async function pdvCancelDynamicPix(){
  if(!PDV.pix||!await uiConfirm('Cancelar esta cobrança PIX?',{danger:true,okText:'Cancelar cobrança',cancelText:'Voltar'}))return;
  try{const {data,error}=await sb.functions.invoke('pdv-pix-payment',{body:{action:'cancel',intentId:PDV.pix.intentId,paymentId:PDV.pix.paymentId}});if(error)throw error;
    if(data&&data.approved&&data.sale){pdvCompleteDynamicPix(data.sale);return;}pdvClearDynamicPix();pdvCloseModal();renderCaixa();toast('Cobrança cancelada · venda continua aberta');
  }catch(e){console.error(e);toast(pdvErr(e));}
}

/* ---------- Mercado Pago Point ----------
   Fluxo antigo (pdvStartPoint → edge function 'pdv-point-payment' via Orders API,
   com providerOrderId em localStorage) REMOVIDO: a edge function nunca existiu e
   nenhum botão o acionava. A maquininha Point é acionada exclusivamente pelo fluxo
   oficial pdvMaquininha() → RPC erp_pos_request → edge function pos-cloud-charge,
   com acompanhamento Realtime em pos_payment_requests. */

async function pdvConfirmSale(){
  if(PDV.busy)return;
  const t=pdvTotals(),pays=pdvFinishPays();
  if(!pays.length){toast('Informe a forma de pagamento');return;}
  if(!PDV.ses||PDV.ses.status!=='aberto'){toast('Abra o caixa (F11) antes de finalizar');return;}
  if(!(await pdvDiscountApproved(t)))return;
  PDV.busy=true;
  const go=document.getElementById('pdvFGo');
  if(go){go.disabled=true;go.textContent='Gravando...';}
  const client_id=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():uid();
  const others=pays.filter(p=>p.m!=='dinheiro').reduce((a,p)=>a+p.v,0);
  const cash=pays.filter(p=>p.m==='dinheiro').reduce((a,p)=>a+p.v,0);
  const cashApplied=Math.max(0,round2(t.total-others));
  const troco=Math.max(0,round2(cash-cashApplied));
  const pdvPayload={
    session_id:(PDV.ses && !PDV.ses.offline)?PDV.ses.id:null,   // sessão provisória → o servidor associa à sessão real no sync
    store_id:CURRENT_STORE||null,                               // loja da venda (admin multi-loja no sync)
    customer_id:(PDV.cust && !PDV.cust.offline)?PDV.cust.id:null,
    customer_client_id:(PDV.cust && PDV.cust.offline)?PDV.cust.client_id:null,   // cliente cadastrado offline → resolvido por client_uuid no sync
    items:PDV.items.map(i=>({id:i.id,vid:i.vid||'',qty:i.qty,disc:round2((i.disc||0)+promoDiscFor(i))})),
    discount:t.manual,surcharge:t.sur,cashback:t.cb,
    payments:pays.map(p=>p.m==='crediario'?{m:p.m,v:p.v,parcelas:p.parcelas,venc:p.venc}:{m:p.m,v:p.v}),note:''
  };
  if(!navigator.onLine){
    enqueueSale({client_id,payload:pdvPayload,troco,at:Date.now()});
    return pdvOfflineFinish(t,pays,troco);
  }
  try{
    const {data,error}=await sb.rpc('pdv_checkout',{
      p_session:pdvPayload.session_id,p_customer:pdvPayload.customer_id,p_items:pdvPayload.items,
      p_discount:pdvPayload.discount,p_surcharge:pdvPayload.surcharge,p_cashback:pdvPayload.cashback,
      p_payments:pdvPayload.payments,p_note:'',p_store:CURRENT_STORE});
    if(error)throw error;
    PDV.lastSale={res:data,items:PDV.items.slice(),pays:pays,when:new Date(),customerId:(PDV.cust&&PDV.cust.id)||null};
    PDV._lastPhone=(PDV.cust&&PDV.cust.phone)||'';
    try{ pdvResetDraft(); }catch(err){ console.error('pdvResetDraft:',err); }
    // recibo primeiro e isolado: nada depois pode impedir sua exibição
    try{ pdvReceiptModal(PDV.lastSale); }catch(err){ console.error('pdvReceiptModal:',err); toast('Venda concluída, mas não consegui exibir o recibo.'); }
    try{ renderCaixa(); }catch(err){ console.error('renderCaixa:',err); }
    try{await loadProducts();buildPdvCatalog();refreshCash();if(typeof loadDash==='function')loadDash();}catch(_e){}
  }catch(e){
    if(isNetworkErr(e)){
      enqueueSale({client_id,payload:pdvPayload,troco,at:Date.now()});
      pdvOfflineFinish(t,pays,troco);
    }else{
      console.error(e);toast(pdvErr(e));
      if(go){go.disabled=false;go.textContent='Confirmar venda (F7)';}
    }
  }finally{PDV.busy=false;}
}
// Baixa o estoque LOCALMENTE após uma venda offline: o catálogo reflete o saldo e evita
// vender além do que há. O servidor é a fonte da verdade e reconcilia o estoque no sync.
function pdvApplyLocalStock(items){
  try{
    (items||[]).forEach(it=>{
      const p=(PRODUCTS||[]).find(x=>x.id===it.id);
      if(p && p.track_stock!==false && p.estoque!=null) p.estoque = Math.max(0, (+p.estoque||0) - (+it.qty||0));
    });
    refCachePut('products:'+(CURRENT_STORE||'all'), PRODUCTS);   // persiste o saldo p/ próximo boot offline
    buildPdvCatalog();
  }catch(e){ console.warn('pdvApplyLocalStock',e); }
}
function pdvOfflineFinish(t,pays,troco){
  const provisional={num:'OFF-'+Date.now().toString(36).slice(-6).toUpperCase(),
    subtotal:t.sub,discount:round2((t.idisc||0)+(t.promo||0)+(t.manual||0)+(t.cb||0)),
    member_disc:t.mdisc||0,cashback_used:t.cb||0,surcharge:t.sur||0,
    total:t.total,change:troco,cashback_earned:0,cashback_balance:0,offline:true};
  PDV.lastSale={res:provisional,items:PDV.items.slice(),pays:pays,when:new Date(),customerId:(PDV.cust&&PDV.cust.id)||null};
  pdvApplyLocalStock(PDV.lastSale.items);
  PDV._lastPhone=(PDV.cust&&PDV.cust.phone)||'';
  try{ pdvResetDraft(); }catch(err){ console.error('pdvResetDraft:',err); }
  try{ pdvReceiptModal(PDV.lastSale); }catch(err){ console.error('pdvReceiptModal:',err); toast('Venda salva, mas não consegui exibir o recibo.'); }
  try{ renderCaixa(); }catch(err){ console.error('renderCaixa:',err); }
  updateOfflineBadge();
  toast('Venda salva offline · sincroniza ao reconectar');
}
function pdvErr(e){
  const m=(e&&(e.message||e.error_description||e.hint))||'Erro inesperado';
  return String(m).replace(/^.*?:\s*/,'').slice(0,140);
}

/* ---------- comprovante ---------- */
const ONPDV_CUSTOMER_PORTAL_URL='https://onpdv.vercel.app/cliente.html';
function pdvSaleIsAnonymous(sale){
  if(!sale)return true;
  const r=sale.res||{};
  if(sale.customerId||r.customer_id)return false;
  const name=String(r.customer||r.cliente||'').trim().toLocaleLowerCase('pt-BR');
  return !name||['consumidor','cliente','sem cadastro','—','-'].includes(name);
}
// Gera o QR LOCALMENTE (lib/qrcode.js, já pré-cacheado) → funciona offline e não depende
// de serviço externo. Cai no serviço online só se a lib falhar por algum motivo.
function onpdvQrDataUrl(text, cell, margin){
  try{
    if(typeof qrcode!=='function') return '';
    const q=qrcode(0,'M'); q.addData(String(text||'')); q.make();
    return q.createDataURL(cell||4, margin==null?8:margin);
  }catch(e){ return ''; }
}
function pdvPortalQrImage(){
  return onpdvQrDataUrl(ONPDV_CUSTOMER_PORTAL_URL,4,4)
    || ('https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=4&data='+encodeURIComponent(ONPDV_CUSTOMER_PORTAL_URL));
}
function pdvReceiptHtml(sale){
  const r=sale.res,d=sale.when||new Date(),p=n=>String(n).padStart(2,'0');
  const when=p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+d.getFullYear()+' '+p(d.getHours())+':'+p(d.getMinutes());
  const payLbl={dinheiro:'Dinheiro',pix:'PIX',debito:'Cartão débito',credito:'Cartão crédito',crediario:'Crediário',outro:'Outro'};
  return '<div id="pdvPrint" class="rc">'
    +'<div class="rc-h"><b>'+esc(DB.settings.storeName||'PetApp')+'</b><br>'
      +esc(DB.settings.city||'')+'<br>'
      +'<span class="rc-s">DOCUMENTO NÃO FISCAL · Venda #'+r.num+'</span><br>'
      +(r.offline?'<b class="rc-s">COMPROVANTE PROVISÓRIO · AGUARDANDO SINCRONIZAÇÃO</b><br>':'')
      +(r.reprint?'<b class="rc-s">★ SEGUNDA VIA ★</b><br>':'')+when+'</div>'
    +'<div class="rc-l"></div>'
    +'<table class="rc-t">'+sale.items.map(i=>
        '<tr><td colspan="3">'+esc(i.name)+'</td></tr>'
       +'<tr><td>'+(i.kg?pdvQ(i.qty,3)+' kg':pdvQ(i.qty,0)+' un')+' × '+BRL(i.price)+'</td>'
       +'<td class="r">'+(i.disc>0?'− '+BRL(i.disc):'')+'</td>'
       +'<td class="r"><b>'+BRL(round2(i.price*i.qty-(i.disc||0)))+'</b></td></tr>').join('')
    +'</table><div class="rc-l"></div>'
    +'<table class="rc-t">'
      +'<tr><td>Subtotal</td><td class="r">'+BRL(r.subtotal)+'</td></tr>'
      +(r.discount>0?'<tr><td>Descontos</td><td class="r">− '+BRL(r.discount)+'</td></tr>':'')
      +(r.member_disc>0?'<tr><td>Assinante</td><td class="r">− '+BRL(r.member_disc)+'</td></tr>':'')
      +(r.cashback_used>0?'<tr><td>Cashback usado</td><td class="r">− '+BRL(r.cashback_used)+'</td></tr>':'')
      +(r.surcharge>0?'<tr><td>Acréscimo</td><td class="r">+ '+BRL(r.surcharge)+'</td></tr>':'')
      +'<tr class="rc-tot"><td>TOTAL</td><td class="r">'+BRL(r.total)+'</td></tr>'
      +sale.pays.map(x=>'<tr><td>'+(payLbl[x.m]||x.m)+(x.parcelas>1?' '+x.parcelas+'x':'')+'</td><td class="r">'+BRL(x.v)+'</td></tr>'+((x.bandeira||x.nsu||x.auth)?'<tr><td colspan="2" class="rc-s">'+[x.bandeira?('Bandeira '+esc(String(x.bandeira))):'',x.nsu?('NSU '+esc(String(x.nsu))):'',x.auth?('Aut '+esc(String(x.auth))):''].filter(Boolean).join(' u{00B7} ')+'</td></tr>':'')).join('')
      +(r.change>0?'<tr><td>Troco</td><td class="r">'+BRL(r.change)+'</td></tr>':'')
    +'</table>'
    +(()=>{const cr=sale.pays.find(x=>x.m==='crediario');return cr?
        '<div class="rc-l"></div><div class="rc-cb" style="font-weight:700">🧾 CREDIÁRIO — A RECEBER<br>'
        +BRL(cr.v)+(cr.venc?' · vencimento '+fmtDate(cr.venc):'')+'</div>':'';})()
    +(r.cashback_earned>0
      ?'<div class="rc-l"></div><div class="rc-cb">🎁 '+esc(r.customer||'')+' ganhou '+BRL(r.cashback_earned)
        +' de cashback<br>Saldo agora: <b>'+BRL(r.cashback_balance)+'</b></div>'
      :pdvSaleIsAnonymous(sale)
        ?'<div class="rc-l"></div><div class="rc-cb"><b>ACESSE O PORTAL DO CLIENTE</b><br>'
          +'<img src="'+pdvPortalQrImage()+'" alt="QR do Portal do Cliente" width="150" height="150" style="display:block;margin:6px auto;max-width:90%;height:auto">'
          +'Consulte compras, cashback e seus pets.</div>'
        :'')
    +'<div class="rc-f">Obrigado pela preferência!</div></div>';
}
function pdvReceiptModal(sale){
  const r=sale.res;
  pdvModal('Venda #'+r.num+' concluída',
    '<div style="display:flex;gap:16px;flex-wrap:wrap">'
    +'<div style="flex:1 1 280px">'
      +'<div class="pdv-sum">'
        +'<div class="l big" style="border:none;margin:0;padding:0 0 8px"><span>TOTAL</span><span>'+BRL(r.total)+'</span></div>'
        +(r.change>0?'<div class="l" style="font-size:20px;font-weight:900;color:#ffd76a"><span>TROCO</span><span>'+BRL(r.change)+'</span></div>':'')
        +(r.cashback_earned>0?'<div class="l cb"><span>Cashback creditado</span><b>'+BRL(r.cashback_earned)+'</b></div>':'')
        +(r.cashback_used>0?'<div class="l"><span>Cashback resgatado</span><b>− '+BRL(r.cashback_used)+'</b></div>':'')
      +'</div>'
      +'<div class="pdv-btns" style="margin-top:0">'
        +'<button class="pdv-btn" data-onclick="pdvPrintReceipt()">🖨️ Imprimir outra via</button>'
        +(PDV._lastPhone?'<button class="pdv-btn ghost" data-onclick="pdvWhatsReceipt()">💬 WhatsApp</button>':'')
        +'<button class="pdv-btn ghost" data-pdv-close>Nova venda (ESC)</button>'
      +'</div>'
    +'</div>'
    +'<div style="flex:1 1 300px;background:#fff;color:#000;border-radius:4px;padding:14px;max-height:60vh;overflow:auto">'
      +pdvReceiptHtml(sale)+'</div></div>');
  // Uma única via é enviada automaticamente. O botão fica reservado à segunda via.
  if(!sale._autoPrintScheduled){
    sale._autoPrintScheduled=true;
    setTimeout(()=>{pdvPrintReceipt(sale).catch(e=>console.error('auto-print:',e));},250);
  }
}
// ---- largura da bobina térmica · escolha POR MÁQUINA (80 mm padrão · 58 mm opcional) ----
// Fica no localStorage porque é uma característica física da impressora daquele caixa,
// não um dado de negócio (não precisa de RPC nem toca no banco).
function pdvTerminalSettings(){
  return (PDV.terminals||[]).find(t=>t.active&&String(t.code)===String(PDV.terminal))||null;
}
function pdvPaper(){
  const term=pdvTerminalSettings();
  if(term&&+term.paper_mm===58)return '58';
  if(term&&+term.paper_mm===80)return '80';
  try{ return localStorage.getItem('onpdv_paper')==='58'?'58':'80'; }catch(e){ return '80'; }
}
function pdvPrinterName(){ const term=pdvTerminalSettings();return term&&term.printer_name?String(term.printer_name).trim():''; }
// aplica a largura da bobina na variável CSS usada por todos os recibos #receiptPrint
function applyPaperVar(){ try{ document.documentElement.style.setProperty('--rc-w', paperDims().content); }catch(e){} }
// dimensões usadas na folha de impressão conforme a bobina escolhida
function paperDims(){ return pdvPaper()==='58'
  ? { page:'58mm', margin:'3mm', content:'48mm', font:'11px', tot:'13px' }
  : { page:'80mm', margin:'4mm', content:'72mm', font:'12px', tot:'14px' }; }
const ONPDV_PRINT={busy:false,frame:null};
function onpdvLocalPrint(){return location.hostname==='127.0.0.1'||location.hostname==='localhost';}
function pdvCenterThermalBlock(text){
  const contentCols=pdvPaper()==='58'?32:42,paperCols=pdvPaper()==='58'?35:48;
  const left=' '.repeat(Math.max(0,Math.floor((paperCols-contentCols)/2)));
  const out=[];
  String(text||'').replace(/\r\n?/g,'\n').split('\n').forEach(line=>{
    if(!line){out.push(left);return;}
    for(let at=0;at<line.length;at+=contentCols)out.push(left+line.slice(at,at+contentCols));
  });
  return out.join('\n');
}
async function onpdvPrintText(text,label,options={}){
  const clean=String(text||'').replace(/\u00a0/g,' ').trim();
  if(!clean){toast('Documento de impressão vazio.',true);return false;}
  if(!onpdvLocalPrint()){
    const html=options.html||('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>'+esc(label||'ONPDV')
      +'</title><style>body{font:13px/1.45 monospace;white-space:pre-wrap;color:#000}</style></head><body>'+esc(clean)+'</body></html>');
    return onpdvPrintDocument(html,label);
  }
  if(ONPDV_PRINT.busy){toast('Aguarde a impressão atual terminar.');return false;}
  ONPDV_PRINT.busy=true;
  try{
    const response=await fetch('/api/print',{
      method:'POST',
      headers:{'Content-Type':'application/json','X-ONPDV-Print':'1'},
      body:JSON.stringify({text:pdvCenterThermalBlock(clean),printer:pdvPrinterName(),qr:String(options.qr||'')})
    });
    let result={};try{result=await response.json();}catch(e){}
    if(!response.ok||!result.ok)throw new Error(result.error||('Falha HTTP '+response.status));
    toast('Impressão enviada para '+(result.printer||'a impressora padrão')+' ✓');
    return true;
  }catch(error){
    console.error('ONPDV impressão nativa:',error);
    const detail=String(error&&error.message||error);
    toast(detail.includes('404')?'Feche esta janela e abra novamente pelo onpdv-caixa.bat.':'Erro de impressão: '+detail,true);
    return false;
  }finally{
    ONPDV_PRINT.busy=false;
  }
}
function onpdvPrintDocument(html,label){
  if(ONPDV_PRINT.busy){ toast('Aguarde a impressão atual terminar.'); return false; }
  ONPDV_PRINT.busy=true;
  let finished=false,started=false;
  const ifr=document.createElement('iframe');
  ifr.id='onpdvPrintFrame';
  ifr.title='Impressão '+String(label||'ONPDV');
  ifr.setAttribute('aria-hidden','true');
  ifr.setAttribute('sandbox','allow-same-origin allow-modals');
  ifr.style.cssText='position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;pointer-events:none;z-index:-1';
  ONPDV_PRINT.frame=ifr;
  const finish=()=>{
    if(finished)return;finished=true;
    ONPDV_PRINT.busy=false;ONPDV_PRINT.frame=null;
    setTimeout(()=>{try{ifr.remove();}catch(e){}},250);
  };
  const fail=msg=>{console.error('ONPDV print:',msg);finish();toast('Não foi possível imprimir. Verifique a impressora padrão.',true);};
  const print=()=>{
    if(started||finished)return;
    const win=ifr.contentWindow,doc=ifr.contentDocument;
    if(!win||!doc||!doc.body||!doc.body.textContent.trim()){fail('conteúdo de impressão não carregou');return;}
    started=true;
    try{
      win.addEventListener('afterprint',finish,{once:true});
      win.print();
      setTimeout(finish,10000);
    }catch(e){fail(e);}
  };
  ifr.onload=()=>setTimeout(print,80);
  ifr.srcdoc=html;
  document.body.appendChild(ifr);
  setTimeout(()=>{if(!started&&!finished)fail('tempo de carregamento excedido');},5000);
  return true;
}
function pdvPlainMoney(value){return BRL(value).replace(/\u00a0/g,' ');}
function pdvTextCenter(value,width){
  const text=String(value||'').trim().slice(0,width),left=Math.max(0,Math.floor((width-text.length)/2));
  return ' '.repeat(left)+text;
}
function pdvTextPair(left,right,width){
  left=String(left||'');right=String(right||'');
  const room=Math.max(1,width-right.length-1);
  return left.slice(0,room).padEnd(room,' ')+' '+right.slice(0,width-room-1);
}
function pdvReceiptText(sale){
  const r=sale.res,d=sale.when||new Date(),width=pdvPaper()==='58'?32:42;
  const payLbl={dinheiro:'Dinheiro',pix:'PIX',debito:'Cartão débito',credito:'Cartão crédito',crediario:'Crediário',outro:'Outro'};
  const L=[pdvTextCenter(DB.settings.storeName||'PetApp',width),pdvTextCenter(DB.settings.city||'',width),
    pdvTextCenter('DOCUMENTO NÃO FISCAL',width),pdvTextCenter('Venda #'+r.num,width),
    pdvTextCenter(new Date(d).toLocaleString('pt-BR'),width),'-'.repeat(width)];
  if(r.offline)L.push(pdvTextCenter('COMPROVANTE PROVISÓRIO',width));
  if(r.reprint)L.push(pdvTextCenter('SEGUNDA VIA',width));
  sale.items.forEach(i=>{
    L.push(String(i.name||'Produto').slice(0,width));
    const qty=i.kg?pdvQ(i.qty,3)+' kg':pdvQ(i.qty,0)+' un';
    L.push(pdvTextPair(qty+' x '+pdvPlainMoney(i.price),pdvPlainMoney(round2(i.price*i.qty-(i.disc||0))),width));
    if(i.disc>0)L.push(pdvTextPair('  desconto','- '+pdvPlainMoney(i.disc),width));
  });
  L.push('-'.repeat(width),pdvTextPair('Subtotal',pdvPlainMoney(r.subtotal),width));
  if(r.discount>0)L.push(pdvTextPair('Descontos','- '+pdvPlainMoney(r.discount),width));
  if(r.member_disc>0)L.push(pdvTextPair('Assinante','- '+pdvPlainMoney(r.member_disc),width));
  if(r.cashback_used>0)L.push(pdvTextPair('Cashback usado','- '+pdvPlainMoney(r.cashback_used),width));
  if(r.surcharge>0)L.push(pdvTextPair('Acréscimo','+ '+pdvPlainMoney(r.surcharge),width));
  L.push('='.repeat(width),pdvTextPair('TOTAL',pdvPlainMoney(r.total),width));
  (sale.pays||[]).forEach(x=>{L.push(pdvTextPair((payLbl[x.m]||x.m)+(x.parcelas>1?' '+x.parcelas+'x':''),pdvPlainMoney(x.v),width));const det=[x.bandeira?('Bandeira '+x.bandeira):'',x.nsu?('NSU '+x.nsu):'',x.auth?('Aut '+x.auth):''].filter(Boolean).join(' ');if(det)L.push(('  '+det).slice(0,width));});
  if(r.change>0)L.push(pdvTextPair('Troco',pdvPlainMoney(r.change),width));
  if(r.cashback_earned>0)L.push('-'.repeat(width),pdvTextCenter('Cashback ganho '+pdvPlainMoney(r.cashback_earned),width),
    pdvTextCenter('Saldo '+pdvPlainMoney(r.cashback_balance),width));
  if(pdvSaleIsAnonymous(sale))L.push('-'.repeat(width),pdvTextCenter('ACESSE O PORTAL DO CLIENTE',width),
    pdvTextCenter('Compras, cashback e seus pets',width));
  L.push('-'.repeat(width),pdvTextCenter('Obrigado pela preferência!',width));
  return L.join('\n');
}
async function pdvPrintReceipt(sale=PDV.lastSale){
  if(!sale)return false;
  const P=paperDims();
  const css='@page{size:'+P.page+' auto;margin:'+P.margin+'}body{font-family:monospace;font-size:'+P.font+';color:#000;margin:0}'
    +'.rc{width:'+P.content+'}.rc-h{text-align:center;line-height:1.4}.rc-s{font-size:11px}'
    +'.rc-l{border-top:1px dashed #000;margin:6px 0}.rc-t{width:100%;border-collapse:collapse}'
    +'.rc-t td{padding:1px 0;vertical-align:top}.r{text-align:right}'
    +'.rc-tot td{font-size:'+P.tot+';font-weight:bold;padding-top:4px}'
    +'.rc-cb{text-align:center;font-size:10.5px;line-height:1.45}'
    +'.rc-f{text-align:center;margin-top:8px;font-size:10px}';
  const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Venda #'
    +sale.res.num+'</title><style>'+css+'</style></head><body>'+pdvReceiptHtml(sale)+'</body></html>';
  return onpdvPrintText(pdvReceiptText(sale),'venda #'+sale.res.num,{
    html,qr:pdvSaleIsAnonymous(sale)?ONPDV_CUSTOMER_PORTAL_URL:''
  });
}
function pdvWhatsReceipt(){
  if(!PDV.lastSale||!PDV._lastPhone)return;
  const r=PDV.lastSale.res;
  const L=['*'+(DB.settings.storeName||'PetApp')+'* — comprovante da compra','Venda *#'+r.num+'*',''];
  PDV.lastSale.items.forEach(i=>L.push('• '+i.name+' — '+(i.kg?pdvQ(i.qty,3)+'kg':pdvQ(i.qty,0)+'un')
    +' = '+BRL(round2(i.price*i.qty-(i.disc||0)))));
  L.push('','*Total:* '+BRL(r.total));
  if(r.cashback_used>0)L.push('Cashback usado: '+BRL(r.cashback_used));
  if(r.cashback_earned>0)L.push('🎁 Cashback ganho: '+BRL(r.cashback_earned)+' (saldo '+BRL(r.cashback_balance)+')');
  L.push('','Obrigado pela preferência! 🐾');
  window.open('https://wa.me/55'+String(PDV._lastPhone).replace(/\D/g,'').replace(/^55/,'')
    +'?text='+encodeURIComponent(L.join('\n')),'_blank');
}

/* ---------- F8 · últimas vendas ---------- */
async function pdvLastSalesModal(){
  pdvModal('Últimas Vendas deste caixa','<div id="pdvLsBox" class="pdv-note">Carregando...</div>',true);
  try{
    const {data,error}=await sb.rpc('pdv_recent_sales',{p_session:PDV.ses.id,p_limit:30});
    if(error)throw error;
    const today=new Date();today.setHours(0,0,0,0);
    const list=(data||[]).filter(s=>{const d=new Date(s.created_at);return !isNaN(d)&&d>=today;});PDV._sales=list;
    const box=document.getElementById('pdvLsBox');if(!box)return;
    if(!list.length){box.innerHTML='<div class="pdv-note">Nenhuma venda neste caixa ainda.</div>';return;}
    const tot=round2(list.reduce((a,s)=>a+(+s.total||0),0));
    box.innerHTML='<div class="pdv-list"><table><thead><tr><th>Venda</th><th>Hora</th><th>Cliente</th>'
      +'<th class="r">Itens</th><th class="r">Total</th><th></th></tr></thead><tbody>'
      +list.map((s,i)=>{const d=new Date(s.created_at),p=n=>String(n).padStart(2,'0');const oid=s.order_id||s.id||('num:'+s.num);
        return '<tr><td>#'+s.num+'</td><td>'+p(d.getHours())+':'+p(d.getMinutes())+'</td>'
        +'<td>'+esc(s.customer||'CONSUMIDOR')+'</td><td class="r">'+s.items+'</td>'
        +'<td class="r"><b>'+BRL(s.total)+'</b></td><td class="r" style="white-space:nowrap">'
        +'<button class="pdv-btn mini solid" data-onclick="pdvReprintSale(\''+oid+'\')">🖨️ Reimprimir</button> '
        +(s.status!==5?'<button class="pdv-btn mini pdv-danger" data-onclick="pdvVoidSaleModal('+i+')">Cancelar</button>':'<span class="pdv-tag warn">Cancelada</span>')+'</td></tr>';}).join('')
      +'</tbody></table></div><div class="pdv-note" style="margin-top:10px">'
      +list.length+' venda(s) · total <b>'+BRL(tot)+'</b></div>';
  }catch(e){
    console.error(e);
    const box=document.getElementById('pdvLsBox');
    if(box)box.innerHTML='<div class="pdv-note" style="color:#ffb3b3">'+esc(pdvErr(e))+'</div>';
  }
}
function pdvVoidSaleModal(i){
  const s=(PDV._sales||[])[i];if(!s)return;const oid=s.order_id||s.id||('num:'+s.num);
  pdvModal('Cancelar venda #'+(s.num||''),
    '<div class="pdv-status-wait">Esta ação estorna o cashback, devolve o estoque e marca a venda como cancelada.</div>'
    +'<label class="pdv-lbl" style="margin-top:12px">Motivo *</label><select class="pdv-in" id="pdvVoidReason"><option>Item errado</option><option>Cliente desistiu</option><option>Quantidade incorreta</option><option>PIX não recebido</option><option>Outro</option></select>'
    +'<label class="pdv-lbl" style="margin-top:10px">Confirmação do operador</label><input class="pdv-in" id="pdvVoidConfirm" placeholder="Digite CANCELAR">'
    +'<div class="pdv-btns"><button class="pdv-btn pdv-danger" id="pdvVoidGo" data-onclick="pdvVoidSale(\''+oid+'\')">Estornar venda</button><button class="pdv-btn ghost" data-onclick="pdvLastSalesModal()">Voltar</button></div>');
}
async function pdvVoidSale(orderId){
  if(val('pdvVoidConfirm').trim().toUpperCase()!=='CANCELAR'){toast('Digite CANCELAR para confirmar');return;}
  const b=document.getElementById('pdvVoidGo');if(b){b.disabled=true;b.textContent='Estornando...';}
  try{const {data,error}=await sb.rpc('pdv_cancel_finalized',{p_order_id:orderId,p_session:PDV.ses.id,p_reason:val('pdvVoidReason')});if(error)throw error;
    pdvLastSalesModal();toast('Venda #'+((data&&data.num)||'')+' cancelada · estoque e cashback estornados');
  }catch(e){console.error(e);toast(pdvErr(e));if(b){b.disabled=false;b.textContent='Estornar venda';}}
}

// reimprime o cupom de uma venda já finalizada (busca itens/pagamentos no servidor)
async function pdvReprintSale(orderId){
  if(!orderId||String(orderId).startsWith('num:')){toast('Não foi possível localizar a venda para reimpressão');return;}
  try{
    const {data,error}=await sb.rpc('pdv_sale_reprint',{p_order:orderId});
    if(error)throw error;
    if(!data||!data.res){toast('Venda não encontrada');return;}
    const sale={when:new Date(data.when||Date.now()),
      items:(data.items||[]).map(i=>({name:i.name||'Item',price:+i.price||0,qty:+i.qty||1,disc:+i.disc||0,kg:!!i.kg})),
      pays:(data.pays||[]).map(pp=>({m:pp.m||'outro',v:+pp.v||0,venc:pp.venc||null,parcelas:pp.parcelas||1})),
      res:data.res,customerId:data.customer_id||data.res.customer_id||null};
    PDV.lastSale=sale; PDV._lastPhone='';
    pdvPrintReceipt();
    toast('Reimprimindo cupom da venda #'+(data.res.num||''));
  }catch(e){console.error(e);toast(pdvErr(e));}
}
/* ---------- dashboard diário · cupom 80 mm · fila NFC-e ---------- */
async function pdvDailyDashboard(){
  pdvModal('Vendas de hoje · todos os caixas','<div id="pdvDayBox" class="pdv-note">Carregando o movimento diário...</div>',true);
  try{
    const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
    const {data,error}=await sb.rpc('pdv_daily_dashboard',{p_day:day,p_terminal:null});
    if(error)throw error;
    PDV.daily=data||{};
    const list=Array.isArray(PDV.daily.sales)?PDV.daily.sales:[];
    const box=document.getElementById('pdvDayBox');if(!box)return;
    box.className='';
    box.innerHTML='<div class="pdv-sum" style="display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:8px">'
      +'<div><div class="pdv-note">Vendas</div><b style="font-size:24px">'+(PDV.daily.sales_count||0)+'</b></div>'
      +'<div><div class="pdv-note">Faturamento</div><b style="font-size:24px">'+BRL(PDV.daily.gross_total)+'</b></div>'
      +'<div><div class="pdv-note">Ticket médio</div><b style="font-size:24px">'+BRL(PDV.daily.average_ticket)+'</b></div>'
      +'<div><div class="pdv-note">Fila NFC-e</div><b style="font-size:24px">'+(PDV.daily.nfce_queued||0)+'</b></div></div>'
      +(list.length?'<div class="pdv-list"><table><thead><tr><th>Hora</th><th>Venda</th><th>Cliente</th><th>Fiscal</th><th class="r">Total</th><th></th></tr></thead><tbody>'
        +list.map((s,i)=>'<tr><td>'+new Date(s.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+'</td>'
          +'<td>#'+esc(s.num||'')+(s.status===5?' · cancelada':'')+'</td><td>'+esc(s.customer||'Consumidor')+'</td>'
          +'<td>'+(s.fiscal_status==='autorizada'?'✅ autorizada':s.fiscal_status==='rejeitada'?'⚠️ rejeitada':'⏳ na fila')+'</td>'
          +'<td class="r"><b>'+BRL(s.total)+'</b></td><td class="r"><button class="mini b" data-onclick="pdvDailyPrint('+i+')" '+(s.status===5?'disabled':'')+'>Cupom 80mm</button></td></tr>').join('')
        +'</tbody></table></div>':'<div class="pdv-note">Nenhuma venda registrada hoje neste caixa.</div>')
      +'<div class="pdv-note" style="margin-top:12px">A fila NFC-e está preparada para integração com o emissor fiscal. Até a autorização, o cupom impresso é um comprovante não fiscal.</div>'
      +'<div class="pdv-btns"><button class="pdv-btn" data-onclick="pdvDailyDashboard()">Atualizar</button><button class="pdv-btn ghost" data-pdv-close>Fechar</button></div>';
  }catch(e){console.error(e);const box=document.getElementById('pdvDayBox');if(box)box.innerHTML='<div class="pdv-status-wait">'+esc(pdvErr(e))+'<br>Publique a nova migração do PDV para liberar este painel.</div>';}
}
function pdvDailyPrint(i){
  const s=((PDV.daily||{}).sales||[])[i];if(!s)return;
  const items=Array.isArray(s.items)?s.items:[];
  const pays=(Array.isArray(s.payments)?s.payments:[]).map(p=>({m:p.m||p.method||'outro',v:Number(p.v||p.value||0)}));
  const subtotal=round2(items.reduce((n,x)=>n+(Number(x.price)||0)*(Number(x.qty)||1),0));
  PDV.lastSale={when:new Date(s.created_at),items:items.map(x=>({name:x.name||x.product_name||'Item',price:Number(x.price)||0,qty:Number(x.qty)||1,disc:Number(x.disc)||0,kg:String(x.unit||'').toUpperCase()==='KG'})),pays:pays,
    res:{num:s.num,total:Number(s.total)||0,subtotal:subtotal,discount:Math.max(0,subtotal-(Number(s.total)||0)),member_disc:0,cashback_used:0,surcharge:0,change:0,customer:s.customer||'Consumidor',cashback_earned:0},
    customerId:s.customer_id||null};
  pdvPrintReceipt();
}

async function renderPdvTerminalsConfig(){
  const box=document.getElementById('pdvTerminalConfigBody');if(!box||!isAdmin())return;
  box.innerHTML='<tr><td colspan="7" class="muted" style="text-align:center;padding:18px">Carregando...</td></tr>';
  try{
    const {data,error}=await sb.rpc('pdv_list_terminals',{p_include_inactive:true});if(error)throw error;
    try{const mq=await sb.from('pos_terminals').select('id,nome').eq('finalidade','pagamento').eq('provedor','mercadopago').eq('ativo',true).order('nome');PDV.machines=Array.isArray(mq.data)?mq.data:[];}catch(_e){PDV.machines=[];}
    PDV.terminals=Array.isArray(data)?data:[];
    box.innerHTML=PDV.terminals.length?PDV.terminals.map((t,i)=>
      '<tr><td><b>'+esc(t.code)+'</b></td><td>'+esc(t.name)+'</td>'
      +'<td>'+esc(t.printer_name||'Padrão do Windows')+'</td><td>'+(+t.paper_mm===58?'58':'80')+' mm</td>'
      +'<td>'+(t.payment_terminal_name?esc(t.payment_terminal_name):'&mdash;')+'</td>'+'<td>'+(t.active?'<span class="chip ok">ativo</span>':'<span class="chip warn">inativo</span>')+'</td>'
      +'<td class="r" style="white-space:nowrap"><button class="btn ghost sm" data-onclick="pdvTerminalForm('+i+')">Editar</button> '
      +'<button class="btn ghost sm red" data-onclick="pdvDeleteTerminal(\''+t.id+'\')">Excluir</button></td></tr>'
    ).join(''):'<tr><td colspan="7" class="muted" style="text-align:center;padding:20px">Nenhum caixa cadastrado.</td></tr>';
  }catch(e){console.error(e);box.innerHTML='<tr><td colspan="7" class="neg" style="text-align:center;padding:18px">'+esc(pdvErr(e))+'</td></tr>';}
}
function pdvTerminalForm(i){
  const t=i>=0?PDV.terminals[i]:null;
  modal('<div class="m-head"><h3>'+(t?'Editar':'Novo')+' caixa</h3><button data-modal-close>✕</button></div>'
    +'<div class="m-body"><div class="grid2">'
      +'<div class="field"><label class="lbl">Código do caixa</label><input class="in" id="pdvTC" value="'+esc(t?t.code:'CAIXA-')+'" placeholder="CAIXA-1"></div>'
      +'<div class="field"><label class="lbl">Nome</label><input class="in" id="pdvTN" value="'+esc(t?t.name:'')+'" placeholder="Caixa principal"></div>'
      +'<div class="field"><label class="lbl">Impressora térmica</label><input class="in" id="pdvTP" value="'+esc(t&&t.printer_name||'')+'" placeholder="Padrão do Windows"></div>'
      +'<div class="field"><label class="lbl">Largura da bobina</label><select class="in" id="pdvTPaper"><option value="80" '+(!t||+t.paper_mm!==58?'selected':'')+'>80 mm</option><option value="58" '+(t&&+t.paper_mm===58?'selected':'')+'>58 mm</option></select></div>'
      +'<div class="field"><label class="lbl">Maquininha vinculada (Mercado Pago Point)</label><select class="in" id="pdvTLink"><option value="">(perguntar no caixa)</option>'+(PDV.machines||[]).map(function(m){return '<option value="'+m.id+'" '+(t&&t.payment_terminal_id===m.id?'selected':'')+'>'+esc(m.nome)+'</option>';}).join('')+'</select></div>'
    +'</div><label style="display:flex;gap:8px;align-items:center;margin-top:4px"><input type="checkbox" id="pdvTA" '+(!t||t.active?'checked':'')+'> Caixa ativo</label>'
    +'<p class="muted" style="font-size:12.5px;margin-top:10px">Informe exatamente o nome da fila do Windows. Se ficar vazio, o ONPDV usa a impressora padrão.</p></div>'
    +'<div class="m-foot"><button class="btn ghost" data-modal-close>Cancelar</button><button class="btn" id="pdvTS" data-onclick="pdvSaveTerminal('+(t?"'"+t.id+"'":'null')+')">Salvar</button></div>');
}
async function pdvSaveTerminal(id){
  const b=document.getElementById('pdvTS');if(b){b.disabled=true;b.textContent='Salvando...';}
  try{const {error}=await sb.rpc('pdv_save_terminal',{p_id:id,p_code:val('pdvTC'),p_name:val('pdvTN'),p_printer_name:val('pdvTP'),p_active:!!document.getElementById('pdvTA').checked,p_paper_mm:+val('pdvTPaper')||80,p_payment_terminal_id:(val('pdvTLink')||null)});if(error)throw error;
    closeModal();toast('Caixa salvo ✓');await renderPdvTerminalsConfig();
  }catch(e){console.error(e);toast(pdvErr(e));if(b){b.disabled=false;b.textContent='Salvar';}}
}
async function pdvDeleteTerminal(id){
  const t=(PDV.terminals||[]).find(x=>x.id===id),name=t&&(t.name||t.code);
  if(!await uiConfirm('Excluir o caixa “'+String(name||'')+'”? O histórico de vendas será preservado.',{danger:true,okText:'Excluir caixa',cancelText:'Cancelar'}))return;
  try{const {error}=await sb.rpc('pdv_delete_terminal',{p_id:id});if(error)throw error;
    toast('Caixa excluído');await renderPdvTerminalsConfig();
  }catch(e){console.error(e);toast(pdvErr(e),true);}
}
{ const b=document.getElementById('btnPdvTerminalNew');if(b)b.onclick=()=>pdvTerminalForm(-1);
  const r=document.getElementById('btnPdvTerminalsRefresh');if(r)r.onclick=()=>renderPdvTerminalsConfig(); }

/* ---------- Ctrl+L · Leitura X (conferência sem fechar o caixa) ---------- */
async function pdvXReport(){
  if(!PDV.ses||PDV.ses.status!=='aberto'){toast('Abra o caixa para gerar a Leitura X');return;}
  pdvModal('Leitura X · conferência parcial','<div id="pdvXBox" class="pdv-note">Apurando o turno...</div>',true);
  try{
    const {data,error}=await sb.rpc('pdv_x_report',{p_session:PDV.ses.id});
    if(error)throw error;
    PDV._x=data;
    const box=document.getElementById('pdvXBox');if(!box)return;
    box.className='';
    const by=data.by_payment||{};
    const lbl={dinheiro:'Dinheiro',pix:'PIX',debito:'Cartão débito',credito:'Cartão crédito',outro:'Outro'};
    const hrs=Array.isArray(data.por_hora)?data.por_hora:[];
    const top=Array.isArray(data.top_produtos)?data.top_produtos:[];
    const canc=data.canceladas||{qtd:0,total:0};
    const maxH=hrs.reduce((a,x)=>Math.max(a,Number(x.total)||0),0)||1;
    const horas=Math.floor((Number(data.aberto_ha_min)||0)/60),mins=(Number(data.aberto_ha_min)||0)%60;

    box.innerHTML='<div class="pdv-sum">'
      +'<div class="l"><span>Caixa aberto há</span><b>'+horas+'h'+String(mins).padStart(2,'0')+'</b></div>'
      +'<div class="l"><span>Vendas</span><b>'+(data.sales_count||0)+'</b></div>'
      +'<div class="l big"><span>Faturamento</span><span>'+BRL(data.sales_total||0)+'</span></div>'
      +'<div class="l"><span>Ticket médio</span><b>'+BRL(data.ticket_medio||0)+'</b></div>'
      +Object.keys(by).map(k=>'<div class="l"><span>· '+(lbl[k]||k)+'</span><b>'+BRL(by[k])+'</b></div>').join('')
      +(data.cashback_used>0?'<div class="l cb"><span>Cashback resgatado</span><b>'+BRL(data.cashback_used)+'</b></div>':'')
      +(data.supplies>0?'<div class="l"><span>Suprimentos</span><b>+ '+BRL(data.supplies)+'</b></div>':'')
      +(data.withdrawals>0?'<div class="l"><span>Sangrias</span><b>− '+BRL(data.withdrawals)+'</b></div>':'')
      +(Number(canc.qtd)>0?'<div class="l"><span>Canceladas</span><b>'+canc.qtd+' · '+BRL(canc.total||0)+'</b></div>':'')
      +'</div>'
      +(Number(data.pix_pendentes)>0
        ?'<div class="pdv-status-wait" style="margin-top:10px">⏳ '+data.pix_pendentes+' cobrança(s) PIX ainda pendente(s) neste caixa.</div>':'')
      +(hrs.length
        ?'<div class="pdv-lbl" style="margin-top:14px">Ritmo por hora</div><div class="pdv-list"><table>'
          +'<thead><tr><th>Hora</th><th class="r">Vendas</th><th class="r">Total</th><th></th></tr></thead><tbody>'
          +hrs.map(x=>'<tr><td>'+esc(x.hora||'')+'</td><td class="r">'+(x.vendas||0)+'</td>'
            +'<td class="r"><b>'+BRL(x.total||0)+'</b></td>'
            +'<td style="width:38%"><div style="background:var(--brand);height:9px;border-radius:5px;width:'
            +Math.max(4,Math.round((Number(x.total)||0)/maxH*100))+'%"></div></td></tr>').join('')
          +'</tbody></table></div>':'')
      +(top.length
        ?'<div class="pdv-lbl" style="margin-top:14px">Produtos que mais saíram</div><div class="pdv-list"><table>'
          +'<thead><tr><th>Produto</th><th class="r">Qtd.</th><th class="r">Total</th></tr></thead><tbody>'
          +top.map(x=>'<tr><td>'+esc(x.nome||'Produto')+'</td>'
            +'<td class="r">'+pdvQ(x.qtd||0,Number(x.qtd)%1?3:0)+'</td>'
            +'<td class="r"><b>'+BRL(x.total||0)+'</b></td></tr>').join('')
          +'</tbody></table></div>':'')
      +'<div class="pdv-note" style="margin-top:12px">A Leitura X não fecha o caixa nem movimenta valores — é só conferência.</div>'
      +'<div class="pdv-btns"><button class="pdv-btn" data-onclick="pdvPrintX()">🖨️ Imprimir</button>'
      +'<button class="pdv-btn ghost" data-pdv-close>Fechar</button></div>';
  }catch(e){
    console.error(e);
    const box=document.getElementById('pdvXBox');
    if(box)box.innerHTML='<div class="pdv-note" style="color:#ffb3b3">'+esc(pdvErr(e))+'</div>';
    else toast(pdvErr(e));
  }
}
async function pdvPrintX(){
  const d=PDV._x;if(!d){toast('Gere a Leitura X primeiro');return;}
  const by=d.by_payment||{};
  const lbl={dinheiro:'Dinheiro',pix:'PIX',debito:'Cartao debito',credito:'Cartao credito',outro:'Outro'};
  const L=[];
  L.push('=== LEITURA X ===');
  L.push((DB.settings.storeName||'PetApp'));
  L.push('Terminal: '+String(PDV.terminal||''));
  L.push('Caixa n: '+String((d.session&&d.session.num)||''));
  L.push('Emitida: '+new Date().toLocaleString('pt-BR'));
  L.push('-----------------------------');
  L.push('Vendas .......... '+(d.sales_count||0));
  L.push('Faturamento ..... '+BRL(d.sales_total||0));
  L.push('Ticket medio .... '+BRL(d.ticket_medio||0));
  Object.keys(by).forEach(k=>L.push('  '+(lbl[k]||k)+': '+BRL(by[k])));
  if(d.cashback_used>0)L.push('Cashback ........ '+BRL(d.cashback_used));
  if(d.supplies>0)L.push('Suprimentos ..... '+BRL(d.supplies));
  if(d.withdrawals>0)L.push('Sangrias ........ '+BRL(d.withdrawals));
  const c=d.canceladas||{};
  if(Number(c.qtd)>0)L.push('Canceladas ...... '+c.qtd+' ('+BRL(c.total||0)+')');
  L.push('-----------------------------');
  L.push('CONFERENCIA - NAO FECHA O CAIXA');
  return onpdvPrintText(L.join('\n'),'Leitura X');
}

/* ---------- F12 · fechar caixa ---------- */
async function pdvCloseModal2(){
  if(!can('pdv_fechar')){toast('Você não tem permissão para fechar o caixa');return;}
  if(PDV.items.length){toast('Finalize ou cancele a venda em andamento antes de fechar');return;}
  if(window.PDV_OFFLINE&&PDV_OFFLINE.pending>0){toast('Sincronize as vendas offline antes de fechar o caixa');pdvOfflineModal();return;}
  if(!navigator.onLine){toast('O fechamento do caixa exige internet');return;}
  pdvModal('Fechar Caixa','<div id="pdvCloseBox" class="pdv-note">Apurando...</div>');
  try{
    const {data,error}=await sb.rpc('pdv_session_report',{p_session:PDV.ses.id});
    if(error)throw error;
    PDV._rep=data;
    const by=data.by_payment||{};
    const lbl={dinheiro:'Dinheiro',pix:'PIX',debito:'Cartão débito',credito:'Cartão crédito',outro:'Outro'};
    const box=document.getElementById('pdvCloseBox');if(!box)return;
    box.className='';
    box.innerHTML='<div class="pdv-sum">'
      +'<div class="l"><span>Vendas</span><b>'+data.sales_count+'</b></div>'
      +'<div class="l"><span>Faturamento</span><b>'+BRL(data.sales_total)+'</b></div>'
      +Object.keys(by).map(k=>'<div class="l"><span>· '+(lbl[k]||k)+'</span><b>'+BRL(by[k])+'</b></div>').join('')
      +(data.change_total>0?'<div class="l"><span>· troco devolvido</span><b>− '+BRL(data.change_total)+'</b></div>':'')
      +(data.cashback_used>0?'<div class="l cb"><span>Cashback resgatado</span><b>'+BRL(data.cashback_used)+'</b></div>':'')
      +'<div class="l"><span>Abertura</span><b>'+BRL(data.session.opening_amount)+'</b></div>'
      +(data.supplies>0?'<div class="l"><span>Suprimentos</span><b>+ '+BRL(data.supplies)+'</b></div>':'')
      +(data.withdrawals>0?'<div class="l"><span>Sangrias</span><b>− '+BRL(data.withdrawals)+'</b></div>':'')
      +'<div class="l big"><span>Dinheiro esperado</span><span>'+BRL(data.expected_cash)+'</span></div></div>'
      +'<label class="pdv-lbl">Dinheiro contado na gaveta R$</label>'
      +'<input class="pdv-in num" id="pdvCloseAmt" value="'+Number(data.expected_cash).toFixed(2).replace('.',',')
        +'" data-oninput="pdvCloseDiff()">'
      +'<div id="pdvCloseDiff" class="pdv-note" style="margin-top:8px"></div>'
      +'<label class="pdv-lbl" style="margin-top:10px">Observação</label>'
      +'<input class="pdv-in" id="pdvCloseNote" placeholder="opcional">'
      +'<div class="pdv-btns"><button class="pdv-btn" id="pdvCloseGo" data-onclick="pdvDoClose()">Fechar caixa</button>'
      +'<button class="pdv-btn ghost" data-pdv-close>Cancelar</button></div>';
    pdvCloseDiff();
  }catch(e){
    console.error(e);
    const box=document.getElementById('pdvCloseBox');
    if(box)box.innerHTML='<div style="color:#ffb3b3">'+esc(pdvErr(e))+'</div>';
  }
}
function pdvCashTol(){ let v; try{ v=parseFloat(localStorage.getItem('onpdv_cash_tol')); }catch(e){} return (isFinite(v)&&v>=0)?v:2; }
function pdvCloseDiffValue(){ return round2(pdvNum((document.getElementById('pdvCloseAmt')||{}).value)-((PDV._rep&&PDV._rep.expected_cash)||0)); }
function pdvCloseDiff(){
  const el=document.getElementById('pdvCloseDiff');if(!el||!PDV._rep)return;
  const d=pdvCloseDiffValue(); const tol=pdvCashTol(); const a=Math.abs(d);
  const box=(bg,bd,fg,html)=>'<div style="background:'+bg+';border:1px solid '+bd+';color:'+fg+';border-radius:6px;padding:9px 11px;font-weight:800;display:flex;align-items:center;gap:8px">'+html+'</div>';
  if(a<0.005){ el.innerHTML=box('rgba(46,204,113,.15)','#2ecc71','#7ee2a8','✓ Conferido — sem diferença.'); }
  else if(a<=tol){ el.innerHTML=box('rgba(255,215,106,.14)','#c9a227','#ffd76a','⚠️ '+(d>0?'Sobra':'Falta')+' de '+BRL(a)+' <span style="font-weight:600;opacity:.85">· dentro da tolerância ('+BRL(tol)+')</span>'); }
  else { el.innerHTML=box('rgba(231,76,60,.18)','#e74c3c','#ffb3b3','🚨 DIVERGÊNCIA de '+BRL(a)+' ('+(d>0?'sobra':'falta')+') — acima da tolerância de '+BRL(tol)+'. Confira a gaveta e informe o motivo abaixo.'); }
  const note=document.getElementById('pdvCloseNote');
  if(note){ if(a>tol){ note.setAttribute('placeholder','OBRIGATÓRIO: justifique a divergência'); note.style.borderColor='#e74c3c'; }
            else { note.setAttribute('placeholder','opcional'); note.style.borderColor=''; } }
}
async function pdvDoClose(){
  const amt=pdvNum((document.getElementById('pdvCloseAmt')||{}).value);
  const note=((document.getElementById('pdvCloseNote')||{}).value||'').trim();
  const diff=pdvCloseDiffValue(); const tol=pdvCashTol();
  if(Math.abs(diff)>tol && note.length<3){
    toast('Divergência de '+BRL(Math.abs(diff))+' acima da tolerância — informe o motivo antes de fechar.');
    const n=document.getElementById('pdvCloseNote'); if(n){n.style.borderColor='#e74c3c';n.focus();}
    return;
  }
  const b=document.getElementById('pdvCloseGo');if(b){b.disabled=true;b.textContent='Fechando...';}
  try{
    const {data,error}=await sb.rpc('pdv_close_session',{p_session:PDV.ses.id,p_counted:amt,p_note:note});
    if(error)throw error;
    const diffFinal=(data&&data.diff!=null)?data.diff:diff;
    PDV._closed={rep:PDV._rep,counted:amt,note:note,diff:diffFinal,
                 sessNum:(PDV.ses&&PDV.ses.num)||(PDV._rep&&PDV._rep.session&&PDV._rep.session.num)||'',
                 terminal:PDV.terminal,at:new Date()};
    PDV.ses=null;PDV._rep=null;PDV.pickups=[];PDV.pickupKnown=null;pdvStopPickupUpdates();
    renderCaixa();
    toast('Caixa fechado · diferença '+BRL(diffFinal||0));
    pdvCloseDone();
  }catch(e){console.error(e);toast(pdvErr(e));if(b){b.disabled=false;b.textContent='Fechar caixa';}}
}
function pdvCloseDone(){
  const c=PDV._closed;if(!c){pdvCloseModal();return;}
  const d=c.rep||{};const by=d.by_payment||{};
  const lbl={dinheiro:'Dinheiro',pix:'PIX',debito:'Cartão débito',credito:'Cartão crédito',outro:'Outro'};
  const a=Math.abs(c.diff||0);
  const diffTxt=a<0.005?'✓ Sem diferença':((c.diff>0?'Sobra':'Falta')+' de '+BRL(a));
  const box=document.getElementById('pdvCloseBox');
  const html='<div class="pdv-status-ok" style="margin-bottom:10px">✓ Caixa nº '+esc(String(c.sessNum||''))+' fechado.</div>'
      +'<div class="pdv-sum">'
      +'<div class="l"><span>Vendas</span><b>'+(d.sales_count||0)+'</b></div>'
      +'<div class="l"><span>Faturamento</span><b>'+BRL(d.sales_total||0)+'</b></div>'
      +Object.keys(by).map(k=>'<div class="l"><span>· '+(lbl[k]||k)+'</span><b>'+BRL(by[k])+'</b></div>').join('')
      +'<div class="l"><span>Dinheiro esperado</span><b>'+BRL(d.expected_cash||0)+'</b></div>'
      +'<div class="l"><span>Dinheiro contado</span><b>'+BRL(c.counted||0)+'</b></div>'
      +'<div class="l big"><span>Diferença</span><span>'+diffTxt+'</span></div></div>'
      +'<div class="pdv-btns"><button class="pdv-btn" data-onclick="pdvPrintClose()">🖨️ Imprimir fechamento</button>'
      +'<button class="pdv-btn ghost" data-pdv-close>Fechar</button></div>';
  if(box){box.className='';box.innerHTML=html;}
  else pdvModal('Caixa fechado',html);
}
async function pdvPrintClose(){
  const c=PDV._closed;if(!c){toast('Feche o caixa primeiro');return;}
  const d=c.rep||{};const by=d.by_payment||{};
  const lbl={dinheiro:'Dinheiro',pix:'PIX',debito:'Cartao debito',credito:'Cartao credito',outro:'Outro'};
  const L=[];
  L.push('=== FECHAMENTO DE CAIXA ===');
  L.push((DB.settings.storeName||'PetApp'));
  L.push('Terminal: '+String(c.terminal||''));
  L.push('Caixa n: '+String(c.sessNum||''));
  L.push('Fechado: '+(c.at||new Date()).toLocaleString('pt-BR'));
  L.push('-----------------------------');
  L.push('Vendas .......... '+(d.sales_count||0));
  L.push('Faturamento ..... '+BRL(d.sales_total||0));
  Object.keys(by).forEach(k=>L.push('  '+(lbl[k]||k)+': '+BRL(by[k])));
  if(d.change_total>0)L.push('Troco devolvido . '+BRL(d.change_total));
  if(d.cashback_used>0)L.push('Cashback ........ '+BRL(d.cashback_used));
  L.push('-----------------------------');
  L.push('Abertura ........ '+BRL((d.session&&d.session.opening_amount)||0));
  if(d.supplies>0)L.push('Suprimentos ..... '+BRL(d.supplies));
  if(d.withdrawals>0)L.push('Sangrias ........ '+BRL(d.withdrawals));
  L.push('Dinheiro esperado '+BRL(d.expected_cash||0));
  L.push('Dinheiro contado  '+BRL(c.counted||0));
  const a=Math.abs(c.diff||0);
  L.push('Diferenca ....... '+(a<0.005?'sem diferenca':((c.diff>0?'sobra ':'falta ')+BRL(a))));
  if(c.note)L.push('Obs: '+c.note);
  L.push('-----------------------------');
  L.push('CAIXA FECHADO');
  return onpdvPrintText(L.join('\n'),'Fechamento de caixa');
}

/* ---------- carga e saída ---------- */
async function loadCaixa(){
  if(!navigator.onLine&&typeof pdvOfflineRestore==='function')await pdvOfflineRestore();
  if(!sb||!isCashier()){renderCaixa();return;}
  pdvSetTerm(pdvTerm());
  pdvLoadHolds();
  pdvLoadPendingPix();
  pdvBindKeys();
  try{
    const [ses,pct,terms]=await Promise.all([
      sb.rpc('pdv_current_session',{p_terminal:PDV.terminal}),
      sb.rpc('member_discount_pct'),
      sb.rpc('pdv_list_terminals',{p_include_inactive:!!(ME&&ME.is_admin)})
    ]);
    if(ses.error)throw ses.error;
    PDV.ses=ses.data||null;
    refCachePut('pdv_session:'+PDV.terminal, PDV.ses||null, true);   // espelha o estado real (aberto/fechado)
    PDV.mpct=Number(pct&&pct.data)||0;
    if(!terms.error){PDV.terminals=Array.isArray(terms.data)?terms.data:[];
      if(!PDV.ses&&PDV.terminals.length&&!PDV.terminals.some(t=>t.code===PDV.terminal&&t.active))pdvSetTerm((PDV.terminals.find(t=>t.active)||{}).code||PDV.terminal);
      applyPaperVar();}
  }catch(e){
    if(isNetworkErr(e)){
      // Offline: restaura a última sessão aberta conhecida (real ou provisória) do cache,
      // para o caixa continuar vendendo após um reload sem internet.
      const cs = await refCacheGet('pdv_session:'+PDV.terminal);
      if(cs && cs.status==='aberto') PDV.ses=cs;
    }else{ console.error(e);toast(pdvErr(e)); }
  }
  renderCaixa();
  if(navigator.onLine&&typeof pdvOfflineCacheState==='function')pdvOfflineCacheState();
  if(navigator.onLine&&typeof pdvOfflineSync==='function')pdvOfflineSync();
  if(PDV.ses&&PDV.ses.status==='aberto'){pdvStartPickupUpdates();await Promise.all([pdvLoadPickupQueue(true),pdvLoadDeliveryPixQueue(true)]);}
  if(PDV.pix){pdvPixModal();pdvPollPix();}
}
async function pdvExit(){
  if(PDV.items.length&&!await uiConfirm('Há uma venda em andamento. Sair mesmo assim?',{danger:true,okText:'Sair',cancelText:'Ficar'}))return;
  pdvStopPickupUpdates();
  pdvResetDraft();
  if(typeof exitPdv==='function')exitPdv();
}

// ======================= CLIENTES =======================
$('#custFilter').oninput = renderCustomers;
$('#btnNewCust').onclick = ()=> custForm();
{ const b=$('#btnCashback'); if(b) b.onclick = ()=> cashbackAdmin(); }

// ======================= CASHBACK (config + campanhas + extrato) =======================
const CB_SEG={todos:'Todos os clientes',aniversariantes:'Aniversariantes do mês',inativos:'Inativos (60 dias sem comprar)',novos:'Novos (cadastrados há 30 dias)'};
async function cashbackAdmin(){
  const [{data:cfg},{data:camps},{data:exp}] = await Promise.all([
    sb.rpc('cashback_config_get'), sb.rpc('cashback_campaigns_list'), sb.rpc('cashback_expiring',{p_dias:7})
  ]);
  window._cbCfg=cfg||{}; window._cbCamps=camps||[]; window._cbExp=exp||[];
  const c=window._cbCfg;
  const campRows=(window._cbCamps||[]).map(x=>{
    const per = (!x.inicio&&!x.fim)?'sempre':`${x.inicio?fmtDate(x.inicio):'…'} → ${x.fim?fmtDate(x.fim):'…'}`;
    return `<tr>
      <td><b>${esc(x.nome)}</b></td>
      <td class="r"><b>${(+x.percent).toFixed(1)}%</b></td>
      <td>${esc(CB_SEG[x.segmento]||x.segmento)}</td>
      <td>${per}</td>
      <td>${x.ativa?'<span class="chip ok">ativa</span>':'<span class="chip">pausada</span>'}</td>
      <td class="r" style="white-space:nowrap">
        <button class="btn ghost sm" data-onclick='cashbackCampaignForm(${JSON.stringify(x).replace(/'/g,"&#39;")})'>Editar</button>
        <button class="btn ghost sm red" data-onclick="cashbackDeleteCampaign('${x.id}')">Excluir</button></td></tr>`;
  }).join('') || '<tr><td colspan="6" class="muted" style="text-align:center;padding:16px">Nenhuma campanha. A % base vale para todos.</td></tr>';
  modal(`<div class="m-head"><h3>🎁 Cashback</h3><button data-modal-close>×</button></div>
    <div class="m-body">
      <div class="card pad" style="margin-bottom:14px">
        <label style="display:flex;align-items:center;gap:9px;font-weight:800;cursor:pointer;margin-bottom:10px">
          <input type="checkbox" id="cbAtivo" ${c.ativo?'checked':''} style="width:18px;height:18px;accent-color:var(--dark)">
          Programa de cashback ativo</label>
        <p class="muted" style="font-size:12px;margin:-4px 0 10px">Quando ativo, cada venda com cliente identificado credita cashback; o saldo pode ser resgatado como desconto no caixa. Vendas no crediário não geram cashback. Desligado = nada muda.</p>
        <div class="grid2">
          <div class="field"><label class="lbl">% base (todos)</label><input id="cbPercent" class="in" inputmode="decimal" value="${c.percent!=null?c.percent:3}"></div>
          <div class="field"><label class="lbl">Validade (dias)</label><input id="cbVal" class="in" inputmode="numeric" value="${c.validade_dias!=null?c.validade_dias:90}"></div>
          <div class="field"><label class="lbl">Compra mínima (R$)</label><input id="cbMin" class="in" inputmode="decimal" value="${c.min_compra!=null?c.min_compra:0}"></div>
        </div>
        <button class="btn" data-onclick="cashbackSaveConfig()">Salvar configuração</button>
      </div>
      <div class="head" style="margin:0 0 8px"><h3 style="font-size:16px">🎯 Campanhas segmentadas</h3><span class="grow"></span>
        <button class="btn ghost sm" data-onclick="cashbackCampaignForm()">+ Nova campanha</button></div>
      <p class="muted" style="font-size:12px;margin:0 0 8px">A campanha aplica a maior % entre a base e as campanhas que o cliente se encaixa.</p>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Nome</th><th class="r">%</th><th>Segmento</th><th>Período</th><th>Status</th><th></th></tr></thead>
        <tbody>${campRows}</tbody></table></div>
      ${cashbackExpiringHtml()}
    </div>
    <div class="m-foot"><button class="btn" data-modal-close>Fechar</button></div>`);
}
function cashbackExpiringHtml(){
  const exp=window._cbExp||[]; if(!exp.length) return '';
  const rows=exp.map(x=>{ const f=String(x.telefone||'').replace(/\D/g,'');
    return `<tr>
      <td><b>${esc(x.nome||'—')}</b></td>
      <td class="r"><b class="acc">${BRL(x.balance)}</b></td>
      <td>${fmtDate(x.prox_venc)}</td>
      <td class="r">${f?`<button class="btn acc sm" data-onclick="cashbackNudge('${f}','${esc((x.nome||'').replace(/'/g,''))}','${x.balance}','${fmtDate(x.prox_venc)}')">💬 Avisar</button>`:'<span class="muted">sem telefone</span>'}</td></tr>`;
  }).join('');
  return `<div class="head" style="margin:16px 0 8px"><h3 style="font-size:16px">⏳ Cashback prestes a vencer (7 dias)</h3></div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Cliente</th><th class="r">Saldo</th><th>Vence em</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
}
window.cashbackNudge = (fone,nome,valor,data)=>{
  const loja=(DB.settings.storeName||'nosso pet shop');
  const msg=`Olá ${nome}! Você tem ${BRL(valor)} de cashback no ${loja} que vence em ${data}. Passa aqui pra aproveitar antes de expirar? 🐾`;
  const f=String(fone||'').replace(/\D/g,'').replace(/^55/,'');
  window.open('https://wa.me/55'+f+'?text='+encodeURIComponent(msg),'_blank');
};
// pesquisa de satisfação (NPS) pós-entrega via WhatsApp
window.npsWhats = (fone,nome,pedido)=>{
  const loja=(DB.settings.storeName||'nosso pet shop');
  const msg=`Olá ${nome||''}! Seu pedido ${pedido?('#'+pedido):''} foi entregue 🐾. Numa escala de 0 a 10, o quanto você recomendaria o ${loja} a um amigo? Sua resposta ajuda muito a gente a melhorar! 💛`;
  const f=String(fone||'').replace(/\D/g,'').replace(/^55/,'');
  if(!f){ toast('Cliente sem telefone para enviar a pesquisa.',true); return; }
  window.open('https://wa.me/55'+f+'?text='+encodeURIComponent(msg),'_blank');
};
window.cashbackSaveConfig = async ()=>{
  const p={ ativo:$('#cbAtivo').checked, percent:num($('#cbPercent').value),
    validade_dias:parseInt($('#cbVal').value)||90, min_compra:num($('#cbMin').value) };
  const { error } = await sb.rpc('cashback_config_set',{ p });
  if(error){ toast('Erro: '+error.message,true); return; }
  CB_ACTIVE=!!p.ativo;
  toast('Configuração de cashback salva ✅'); cashbackAdmin();
};
window.cashbackCampaignForm = (x={})=>{
  const segOpts=Object.keys(CB_SEG).map(k=>`<option value="${k}" ${x.segmento===k?'selected':''}>${CB_SEG[k]}</option>`).join('');
  modal(`<div class="m-head"><h3>${x.id?'Editar':'Nova'} campanha</h3><button data-modal-close>×</button></div>
    <div class="m-body">
      <div class="field"><label class="lbl">Nome</label><input id="ccNome" class="in" value="${esc(x.nome||'')}" placeholder="ex: Dobro no aniversário"></div>
      <div class="grid2">
        <div class="field"><label class="lbl">% cashback</label><input id="ccPct" class="in" inputmode="decimal" value="${x.percent!=null?x.percent:5}"></div>
        <div class="field"><label class="lbl">Segmento</label><select id="ccSeg" class="in">${segOpts}</select></div>
        <div class="field"><label class="lbl">Início (opcional)</label><input id="ccIni" type="date" class="in" value="${x.inicio||''}"></div>
        <div class="field"><label class="lbl">Fim (opcional)</label><input id="ccFim" type="date" class="in" value="${x.fim||''}"></div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-weight:700;cursor:pointer"><input type="checkbox" id="ccAtiva" ${x.ativa!==false?'checked':''} style="width:17px;height:17px;accent-color:var(--dark)"> Campanha ativa</label>
    </div>
    <div class="m-foot"><button class="btn ghost" data-onclick="cashbackAdmin()">Voltar</button>
      <button class="btn" data-onclick="cashbackSaveCampaign(${x.id?`'${x.id}'`:'null'})">Salvar campanha</button></div>`);
};
window.cashbackSaveCampaign = async (id)=>{
  const p={ id:id||null, nome:$('#ccNome').value||'Campanha', percent:num($('#ccPct').value),
    segmento:$('#ccSeg').value, inicio:$('#ccIni').value||null, fim:$('#ccFim').value||null, ativa:$('#ccAtiva').checked };
  const { error } = await sb.rpc('cashback_campaign_upsert',{ p });
  if(error){ toast('Erro: '+error.message,true); return; }
  toast('Campanha salva ✅'); cashbackAdmin();
};
window.cashbackDeleteCampaign = async (id)=>{
  if(!await uiConfirm('Excluir esta campanha?',{danger:true,okText:'Excluir'})) return;
  const { error } = await sb.rpc('cashback_campaign_delete',{ p_id:id });
  if(error){ toast('Erro: '+error.message,true); return; }
  toast('Campanha excluída'); cashbackAdmin();
};
window.cashbackStatement = async (custId, nome)=>{
  const { data:d, error } = await sb.rpc('cashback_statement',{ p_customer:custId });
  if(error){ toast('Erro: '+error.message,true); return; }
  const st=d||{}; const ents=st.entries||[];
  const kindLbl={earn:'💚 crédito',redeem:'🟠 resgate',adjust:'⚙️ ajuste'};
  const rows=ents.map(e=>`<tr>
      <td>${fmtDT(e.created_at)}</td>
      <td>${kindLbl[e.kind]||e.kind}${e.note?` <span class="muted" style="font-size:11px">· ${esc(e.note)}</span>`:''}</td>
      <td class="r ${(+e.amount)<0?'neg':''}"><b>${(+e.amount)>=0?'+':''}${BRL(e.amount)}</b></td>
      <td>${e.expires_at?fmtDate(e.expires_at):'—'}</td></tr>`).join('')
    || '<tr><td colspan="4" class="muted" style="text-align:center;padding:16px">Sem movimentações de cashback.</td></tr>';
  modal(`<div class="m-head"><h3>🎁 Cashback · ${esc(nome||'Cliente')}</h3><button data-modal-close>×</button></div>
    <div class="m-body">
      <div class="stats" style="margin-bottom:12px">
        <div class="stat acc"><div class="k">Saldo disponível</div><div class="v">${BRL(st.balance)}</div></div>
        <div class="stat ${(+st.expiring_30d)>0?'warn':''}"><div class="k">Expira em 30 dias</div><div class="v">${BRL(st.expiring_30d)}</div></div>
      </div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Quando</th><th>Tipo</th><th class="r">Valor</th><th>Expira</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
    </div>
    <div class="m-foot"><button class="btn" data-modal-close>Fechar</button></div>`);
};
async function renderCustomers(){
  renderPetCrm();
  await loadCustomers();
  const { data:bal } = await sb.from('v_customer_balance').select('*');
  const balMap = Object.fromEntries((bal||[]).map(b=>[b.customer_id,b]));
  const q=($('#custFilter').value||'').toLowerCase();
  const list = CUSTOMERS.filter(c=>!q||c.nome.toLowerCase().includes(q)||(c.telefone||'').includes(q)||(c.documento||'').includes(q)||(c.codigo||'').toLowerCase().includes(q));
  $('#custBody').innerHTML = list.map(c=>{
    const b=balMap[c.id];
    return `<tr>
      <td>${esc(c.codigo||'—')}</td><td><b>${esc(c.nome)}</b></td><td>${esc(c.telefone||'—')}</td><td>${esc(c.documento||'—')}</td>
      <td class="r">${BRL(c.limite_credito)}</td>
      <td class="r ${b&&b.vencido>0?'neg':''}">${b?BRL(b.saldo_devedor):'—'}</td>
      <td class="r" style="white-space:nowrap">
        <button class="btn ghost sm" data-onclick="cashbackStatement('${c.id}','${esc((c.nome||'').replace(/'/g,''))}')">🎁</button>
        <button class="btn ghost sm" data-onclick="petsModal('${c.id}','${esc((c.nome||'').replace(/'/g,''))}')">🐾 Pets</button>
        <button class="btn ghost sm" data-onclick='custForm(${JSON.stringify(c).replace(/'/g,"&#39;")})'>Editar</button>
        <button class="btn ghost sm red" data-onclick="delCustomer('${c.id}')" title="Excluir cliente">🗑️</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" class="muted" style="text-align:center;padding:20px">Nenhum cliente.</td></tr>';
}
window.custForm = (c={})=>{
  modal(`
    <div class="m-head"><h3>${c.id?'Editar':'Novo'} cliente</h3><button data-modal-close>×</button></div>
    <div class="m-body">
      <div class="grid2">
        <div class="field"><label class="lbl">Código (nº do cliente)</label><input id="cfCod" class="in" value="${esc(c.codigo||'')}" placeholder="ex: 1001"></div>
        <div class="field"><label class="lbl">Nome *</label><input id="cfNome" class="in" value="${esc(c.nome||'')}"></div>
      </div>
      <div class="grid2">
        <div class="field"><label class="lbl">Telefone (WhatsApp)</label><input id="cfFone" class="in" value="${esc(c.telefone||'')}" placeholder="5521999998888"></div>
        <div class="field"><label class="lbl">Documento</label><input id="cfDoc" class="in" value="${esc(c.documento||'')}"></div>
      </div>
      <div class="grid2">
        <div class="field"><label class="lbl">E-mail</label><input id="cfEmail" class="in" value="${esc(c.email||'')}"></div>
        <div class="field"><label class="lbl">🎂 Nascimento</label><input id="cfNasc" type="date" class="in" value="${c.nascimento||''}"></div>
      </div>
      <div class="grid2">
        <div class="field"><label class="lbl">CEP</label>
          <div style="display:flex;gap:6px">
            <input id="cfCep" class="in" placeholder="00000-000" inputmode="numeric" maxlength="9" data-oninput="maskCep(this)" data-onblur="buscaCepIfComplete(this)">
            <button type="button" class="btn ghost sm" data-onclick="buscaCep()">Buscar</button>
          </div>
        </div>
        <div class="field"><label class="lbl">Número / complemento</label><input id="cfNum" class="in" placeholder="nº, apto…"></div>
      </div>
      <div class="grid2">
        <div class="field"><label class="lbl">Endereço</label><input id="cfEnd" class="in" value="${esc(c.endereco||'')}"></div>
        <div class="field"><label class="lbl">🏘️ Bairro</label><input id="cfBairro" class="in" value="${esc(c.bairro||'')}" list="bairroList" placeholder="para o frete por bairro" data-onchange="custBairroFrete()">
          <datalist id="bairroList">${(FRETE_RULES||[]).map(r=>`<option value="${esc(r.bairro)}">`).join('')}</datalist></div>
      </div>
      <div class="grid2">
        <div class="field"><label class="lbl">Limite de crédito (crediário)</label><input id="cfLim" class="in" value="${c.limite_credito||0}"></div>
        <div class="field"><label class="lbl">🚚 Valor do frete (entrega)</label><input id="cfFrete" class="in" value="${c.frete||0}" inputmode="decimal"></div>
      </div>
      <div class="field"><label class="lbl">Observações</label><textarea id="cfObs" class="in" rows="2" style="resize:vertical" placeholder="Ponto de referência, preferências, etc.">${esc(c.obs||'')}</textarea></div>
      <hr style="border:0;border-top:1px solid var(--line);margin:14px 0 6px">
      <div class="field"><label class="lbl">🔐 Acesso ao portal do cliente ${c.auth_user_id?'<span class="chip ok">ativo</span>':'<span class="chip">sem acesso</span>'}</label>
        <p class="muted" style="font-size:12.5px;margin:0 0 8px">O cliente entra no portal (<b>cliente.html</b>) com o <b>e-mail acima</b> e a senha definida aqui. ${c.id?'':'Salve o cliente primeiro para liberar o acesso.'}</p>
        ${c.id?`<div class="grid2">
          <div class="field"><label class="lbl">Senha do portal (mín. 6)</label><input id="cfPortalPass" class="in" type="text" autocomplete="new-password" placeholder="${c.auth_user_id?'digite para redefinir':'defina a senha'}"></div>
          <div class="field" style="display:flex;align-items:flex-end"><button type="button" class="btn" style="width:100%" data-onclick="portalAccess('${c.id}')">${c.auth_user_id?'Atualizar acesso':'Liberar acesso'}</button></div>
        </div>`:''}
      </div>
    </div>
    <div class="m-foot"><button class="btn ghost" data-modal-close>Cancelar</button>
      <button class="btn" data-onclick='saveCust(${c.id?`"${c.id}"`:'null'})'>Salvar</button></div>`);
};
window.portalAccess = async (id)=>{
  const email=($('#cfEmail').value||'').trim();
  const pass=($('#cfPortalPass').value||'');
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ toast('Informe um e-mail válido no cadastro.',true); return; }
  if(pass.length<6){ toast('A senha do portal precisa de ao menos 6 caracteres.',true); return; }
  const btn=event&&event.target; if(btn){ btn.disabled=true; }
  const { data, error } = await sb.functions.invoke('portal-invite',{ body:{ customer_id:id, email, password:pass } });
  if(btn){ btn.disabled=false; }
  if(error){ let msg=error.message; try{ const j=await error.context.json(); if(j&&j.error) msg=j.error; }catch(_){}
    toast('Falha ao liberar acesso: '+msg,true); return; }
  if(!data||!data.ok){ toast('Falha ao liberar acesso.',true); return; }
  const cc=(CUSTOMERS||[]).find(x=>x.id===id); if(cc){ cc.auth_user_id=cc.auth_user_id||id; cc.email=email; }
  toast('Acesso ao portal liberado ✅'); loadCustomers();
};
window.saveCust = async (id)=>{
  const nome=$('#cfNome').value.trim(); if(!nome){ toast('Informe o nome.',true); return; }
  const { error } = await sb.rpc('erp_upsert_customer',{ p:{ id, nome,
    codigo:($('#cfCod')||{}).value||'',
    telefone:$('#cfFone').value, documento:$('#cfDoc').value, email:$('#cfEmail').value,
    endereco:$('#cfEnd').value, bairro:($('#cfBairro')||{}).value||'', nascimento:($('#cfNasc')||{}).value||'',
    limite_credito:num($('#cfLim').value), frete:num($('#cfFrete').value),
    obs:$('#cfObs').value }});
  if(error){ toast('Erro: '+error.message,true); return; }
  closeModal(); toast('Cliente salvo'); renderCustomers(); loadCustomers();
};
window.delCustomer = async (id)=>{
  const c=(CUSTOMERS||[]).find(x=>x.id===id)||{};
  const nome=[c.codigo?('#'+c.codigo):'', c.nome].filter(Boolean).join(' ')||'este cliente';
  const msg='Excluir o cliente "'+nome+'"?\n\nEle sai da lista de clientes, mas o histórico (vendas e contas) é preservado — dá para recadastrar depois com o mesmo código.';
  if(!await uiConfirm(msg,{danger:true,okText:'Excluir',cancelText:'Cancelar'})) return;
  const { error } = await sb.rpc('erp_delete_customer',{ p_id:id });
  if(error){ toast('Erro: '+error.message,true); return; }
  toast('Cliente excluído 🗑️'); await loadCustomers(); renderCustomers();
};
/* ======================= FICHA DO PET + VACINAS ======================= */
let PET_CTX={ custId:null, custName:'', pets:[] };
const PET_HTYPE={ vacina:'💉 Vacina', vermifugo:'🪱 Vermífugo', medicamento:'💊 Medicamento', receita:'📝 Receita', consulta:'🩺 Consulta', exame:'🔬 Exame', peso:'⚖️ Peso' };
async function petsModal(custId, custName){
  PET_CTX={ custId, custName:custName||'Cliente', pets:[] };
  modal(`<div class="m-head"><h3>🐾 Pets de ${esc(custName||'')}</h3><button data-modal-close>✕</button></div>
    <div class="m-body" id="petsBody"><p class="muted" style="padding:16px">Carregando…</p></div>
    <div class="m-foot"><button class="btn" data-onclick="petForm()">+ Novo pet</button>
      <button class="btn ghost" data-modal-close>Fechar</button></div>`);
  await petsLoad();
}
async function petsLoad(){
  const { data, error } = await sb.rpc('erp_pets_by_customer',{ p_customer:PET_CTX.custId });
  PET_CTX.pets = error? [] : (data||[]);
  const box=$('#petsBody'); if(!box) return;
  if(!PET_CTX.pets.length){ box.innerHTML='<p class="muted" style="padding:16px">Nenhum pet cadastrado. Clique em <b>+ Novo pet</b>.</p>'; return; }
  box.innerHTML = PET_CTX.pets.map(p=>{
    const idade = p.nascimento ? petAge(p.nascimento) : '';
    const saude = (p.saude||[]).map(h=>{
      const dias = h.proxima_em ? Math.round((new Date(h.proxima_em+'T00:00:00')-new Date().setHours(0,0,0,0))/86400000) : null;
      const chip = h.proxima_em ? (dias<0?`<span class="chip warn">venceu há ${Math.abs(dias)}d</span>`:dias<=21?`<span class="chip amber">em ${dias}d</span>`:`<span class="chip ok">em dia</span>`) : '';
      return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px solid var(--line)">
        <span>${PET_HTYPE[h.tipo]||h.tipo}</span><b>${esc(h.descricao||'')}</b>
        <span class="muted" style="font-size:12px">${h.aplicada_em?'aplicada '+fmtDate(h.aplicada_em):''}${h.proxima_em?' · próxima '+fmtDate(h.proxima_em):''}</span>
        ${chip}<span class="grow" style="flex:1"></span>
        <button class="btn ghost sm red" data-onclick="petHealthDel('${h.id}')">✕</button></div>`;
    }).join('') || '<p class="muted" style="font-size:13px;padding:4px 0">Sem vacinas/registros ainda.</p>';
    return `<div class="card" style="border:1px solid var(--line);border-radius:12px;padding:12px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <b style="font-size:16px">🐾 ${esc(p.nome)}</b>
        <span class="muted">${[p.especie,p.raca,p.porte,p.sexo,idade].filter(Boolean).map(esc).join(' · ')}</span>
        <span class="grow" style="flex:1"></span>
        <button class="btn ghost sm" data-onclick="petHealthForm('${p.id}')">+ Vacina/registro</button>
        <button class="btn ghost sm" data-onclick="petProntuario('${p.id}')">🖨️ Prontuário</button>
        <button class="btn ghost sm" data-onclick="petForm('${p.id}')">Editar</button>
        <button class="btn ghost sm red" data-onclick="petDel('${p.id}')">Remover</button></div>
      ${p.obs?`<div class="muted" style="font-size:13px;margin-top:4px">${esc(p.obs)}</div>`:''}
      <div style="margin-top:8px">${saude}</div>
    </div>`;
  }).join('');
}
function petAge(nasc){ const d=new Date(nasc+'T00:00:00'); if(isNaN(d))return ''; const m=(new Date()-d)/2629800000;
  return m<12? Math.max(0,Math.round(m))+' meses' : (Math.floor(m/12))+' ano(s)'; }
window.petForm=(petId)=>{
  const p = petId ? PET_CTX.pets.find(x=>x.id===petId) : null;
  const sel=(v,opts)=>opts.map(o=>`<option ${((p&&p[v])||'')===o?'selected':''}>${o}</option>`).join('');
  modal(`<div class="m-head"><h3>${p?'Editar pet':'Novo pet'} 🐾</h3><button data-onclick="petsBack()">✕</button></div>
    <div class="m-body">
      <div class="field"><label class="lbl">Nome *</label><input id="ptNome" class="in" value="${esc(p?p.nome:'')}"></div>
      <div class="grid2">
        <div class="field"><label class="lbl">Espécie</label><select id="ptEsp" class="in"><option value=""></option>${sel('especie',['Cão','Gato','Ave','Roedor','Réptil','Peixe','Outro'])}</select></div>
        <div class="field"><label class="lbl">Raça</label><input id="ptRaca" class="in" value="${esc(p?p.raca||'':'')}"></div>
      </div>
      <div class="grid2">
        <div class="field"><label class="lbl">Porte</label><select id="ptPorte" class="in"><option value=""></option>${sel('porte',['P','M','G','GG'])}</select></div>
        <div class="field"><label class="lbl">Sexo</label><select id="ptSexo" class="in"><option value=""></option>${sel('sexo',['M','F'])}</select></div>
      </div>
      <div class="grid2">
        <div class="field"><label class="lbl">Nascimento</label><input id="ptNasc" type="date" class="in" value="${p&&p.nascimento?p.nascimento:''}"></div>
        <div class="field"><label class="lbl">Peso (kg)</label><input id="ptPeso" class="in" inputmode="decimal" value="${p&&p.peso!=null?fmtNum(p.peso):''}"></div>
      </div>
      <div class="field"><label class="lbl">Observações</label><input id="ptObs" class="in" value="${esc(p?p.obs||'':'')}"></div>
    </div>
    <div class="m-foot"><button class="btn ghost" data-onclick="petsBack()">Voltar</button>
      <button class="btn green" data-onclick="petSave(${p?`'${p.id}'`:'null'})">Salvar</button></div>`);
};
window.petSave=async (id)=>{
  const nome=($('#ptNome').value||'').trim(); if(!nome){ toast('Informe o nome do pet',true); return; }
  const p={ id:id||null, customer_id:PET_CTX.custId, nome, especie:$('#ptEsp').value||null,
    raca:$('#ptRaca').value||null, porte:$('#ptPorte').value||null, sexo:$('#ptSexo').value||null,
    nascimento:$('#ptNasc').value||null, peso:$('#ptPeso').value?num($('#ptPeso').value):null, obs:$('#ptObs').value||null };
  const { error } = await sb.rpc('erp_pet_upsert',{p});
  if(error){ toast('Erro: '+error.message,true); return; }
  toast('Pet salvo ✅'); petsBack();
};
window.petDel=async (id)=>{ if(!await uiConfirm('Remover este pet?',{danger:true,okText:'Remover'}))return;
  const { error }=await sb.rpc('erp_pet_delete',{p_id:id}); if(error){ toast('Erro: '+error.message,true); return; }
  toast('Pet removido'); petsLoad(); };
window.petsBack=()=>{ petsModal(PET_CTX.custId, PET_CTX.custName); };
window.petHealthForm=(petId, hid)=>{
  const pet=PET_CTX.pets.find(x=>x.id===petId); const h = hid&&pet? (pet.saude||[]).find(x=>x.id===hid):null;
  const tipoOpts=Object.keys(PET_HTYPE).map(k=>`<option value="${k}" ${h&&h.tipo===k?'selected':''}>${PET_HTYPE[k]}</option>`).join('');
  modal(`<div class="m-head"><h3>Vacina / registro de saúde</h3><button data-onclick="petsBack()">✕</button></div>
    <div class="m-body">
      <div class="field"><label class="lbl">Tipo</label><select id="phTipo" class="in">${tipoOpts}</select></div>
      <div class="field"><label class="lbl">Descrição (ex.: V10, Antirrábica, Vermífugo)</label><input id="phDesc" class="in" value="${esc(h?h.descricao||'':'')}"></div>
      <div class="grid2">
        <div class="field"><label class="lbl">Aplicada em</label><input id="phApl" type="date" class="in" value="${h&&h.aplicada_em?h.aplicada_em:hojeISO()}"></div>
        <div class="field"><label class="lbl">Próxima dose / reforço</label><input id="phProx" type="date" class="in" value="${h&&h.proxima_em?h.proxima_em:''}"></div>
      </div>
      <div class="field"><label class="lbl">Observações</label><input id="phObs" class="in" value="${esc(h?h.obs||'':'')}"></div>
    </div>
    <div class="m-foot"><button class="btn ghost" data-onclick="petsBack()">Voltar</button>
      <button class="btn green" data-onclick="petHealthSave('${petId}',${h?`'${h.id}'`:'null'})">Salvar</button></div>`);
};
window.petHealthSave=async (petId, hid)=>{
  const p={ id:hid||null, pet_id:petId, tipo:$('#phTipo').value, descricao:$('#phDesc').value||null,
    aplicada_em:$('#phApl').value||null, proxima_em:$('#phProx').value||null, obs:$('#phObs').value||null };
  const { error } = await sb.rpc('erp_pet_health_add',{p});
  if(error){ toast('Erro: '+error.message,true); return; }
  toast('Registro salvo ✅'); petsBack();
};
window.petHealthDel=async (id)=>{ if(!await uiConfirm('Excluir este registro?',{danger:true,okText:'Excluir'}))return;
  const { error }=await sb.rpc('erp_pet_health_delete',{p_id:id}); if(error){ toast('Erro: '+error.message,true); return; }
  toast('Registro excluído'); petsLoad(); };
// prontuário / receituário imprimível (histórico clínico completo do pet)
window.petProntuario=(petId)=>{
  const p=PET_CTX.pets.find(x=>x.id===petId); if(!p) return;
  const loja=(DB.settings&&DB.settings.storeName)||'Pet Shop';
  const saude=(p.saude||[]).slice().sort((a,b)=>String(b.aplicada_em||b.created_at||'').localeCompare(String(a.aplicada_em||a.created_at||'')));
  const linhas=saude.map(h=>`<tr><td>${h.aplicada_em?fmtDate(h.aplicada_em):''}</td><td>${esc(PET_HTYPE[h.tipo]||h.tipo)}</td><td>${esc(h.descricao||'')}${h.obs?' — '+esc(h.obs):''}</td><td>${h.proxima_em?fmtDate(h.proxima_em):''}</td></tr>`).join('')
    || '<tr><td colspan="4" style="text-align:center;color:#666">Sem registros.</td></tr>';
  const pesos=saude.filter(h=>h.tipo==='peso').map(h=>`${h.aplicada_em?fmtDate(h.aplicada_em)+': ':''}${esc(h.descricao||'')}`);
  const idade=p.nascimento?petAge(p.nascimento):'';
  const info=[p.especie,p.raca,p.porte,p.sexo,idade,(p.peso!=null?fmtNum(p.peso)+' kg':'')].filter(Boolean).map(esc).join(' · ');
  const html=`<!doctype html><meta charset="utf-8"><title>Prontuário · ${esc(p.nome)}</title>`+
    `<style>body{font-family:system-ui,Arial,sans-serif;color:#111;margin:24px}h1{margin:0 0 2px;font-size:20px}`+
    `table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:13px}`+
    `th{background:#f2f2f2}.muted{color:#666}.hd{border-bottom:2px solid #333;padding-bottom:8px;margin-bottom:10px}</style>`+
    `<div class="hd"><h1>🐾 Prontuário do Pet</h1><div class="muted">${esc(loja)} · emitido em ${new Date().toLocaleDateString('pt-BR')}</div></div>`+
    `<p><b>Pet:</b> ${esc(p.nome)} &nbsp;&nbsp; <b>Tutor:</b> ${esc(PET_CTX.custName||'')}<br>`+
    `<span class="muted">${info}</span>${p.obs?('<br><b>Obs.:</b> '+esc(p.obs)):''}</p>`+
    (pesos.length?`<p><b>Evolução de peso:</b> <span class="muted">${pesos.join(' · ')}</span></p>`:'')+
    `<table><thead><tr><th>Data</th><th>Tipo</th><th>Descrição / medicação</th><th>Próxima / retorno</th></tr></thead><tbody>${linhas}</tbody></table>`+
    `<p class="muted" style="margin-top:28px">Responsável técnico: ____________________________________  CRMV: ____________</p>`+
    `<scr`+`ipt>window.onload=function(){setTimeout(function(){window.print()},150)}</scr`+`ipt>`;
  const w=window.open('','_blank');
  if(!w){ toast('Permita pop-ups para imprimir o prontuário.',true); return; }
  w.document.open(); w.document.write(html); w.document.close();
};

/* ---- painel de lembretes inteligentes (vacina + recompra) ---- */
async function renderPetCrm(){
  const box=$('#petCrm'); if(!box) return;
  let vac=[], rec=[];
  try{ const a=await sb.rpc('erp_pet_reminders',{p_dias:21}); vac=a.data||[]; }catch(e){}
  try{ const b=await sb.rpc('erp_repurchase_due',{p_dias_alerta:7}); rec=b.data||[]; }catch(e){}
  if(!vac.length && !rec.length){ box.innerHTML=''; return; }
  const loja=(DB.settings.storeName||'nosso pet shop');
  const vacRows = vac.slice(0,8).map(v=>{
    const risk = v.dias<0?'alto':v.dias<=7?'medio':'baixo';
    const f=String(v.fone||'').replace(/\D/g,'');
    return `<div class="crm-row"><div><div class="nm">${esc(v.pet||'Pet')} · ${PET_HTYPE[v.tipo]||v.tipo}${v.descricao?' '+esc(v.descricao):''}</div>
      <div class="meta">${esc(v.cliente||'')} · ${v.dias<0?`vencida há ${Math.abs(v.dias)}d`:`vence em ${v.dias}d`} (${fmtDate(v.proxima_em)})</div></div>
      <span class="crm-risk ${risk}">${risk}</span>
      <div class="act">${f?`<button class="btn acc sm" data-onclick="petWhats('${f}','vacina','${esc((v.pet||'').replace(/'/g,''))}','${esc(((PET_HTYPE[v.tipo]||v.tipo)+' '+(v.descricao||'')).replace(/'/g,''))}','${fmtDate(v.proxima_em)}')">💬 Lembrar</button>`:'<span class="crm-mini">sem telefone</span>'}</div></div>`;
  }).join('');
  const recRows = rec.slice(0,8).map(r=>{
    const risk = r.atraso>0?'alto':r.atraso>=-3?'medio':'baixo';
    const f=String(r.fone||'').replace(/\D/g,'');
    return `<div class="crm-row"><div><div class="nm">${esc(r.produto||'Produto')}</div>
      <div class="meta">${esc(r.cliente||'')} · última compra ${fmtDate(r.ultima)} · ${r.atraso>0?`atrasado ${r.atraso}d`:`repor em ${Math.abs(r.atraso)}d`}</div></div>
      <span class="crm-risk ${risk}">${risk}</span>
      <div class="act">${f?`<button class="btn acc sm" data-onclick="petWhats('${f}','recompra','','${esc((r.produto||'').replace(/'/g,''))}','')">💬 Oferecer</button>`:'<span class="crm-mini">sem telefone</span>'}</div></div>`;
  }).join('');
  box.innerHTML=`<div class="crm">
    <div class="crm-head"><h2>🐾 Lembretes inteligentes</h2><span class="grow"></span>
      <button class="crm-toggle" data-onclick="renderPetCrm()">↻ Recalcular</button></div>
    <div class="crm-kpis">
      <div class="crm-kpi ${vac.some(v=>v.dias<0)?'bad':'warn'}"><div class="k">Vacinas a vencer</div><div class="v">${vac.length}</div><div class="s">próximos 21 dias</div></div>
      <div class="crm-kpi warn"><div class="k">Recompras previstas</div><div class="v">${rec.length}</div><div class="s">ração e recorrentes</div></div>
    </div>
    ${vac.length?`<div class="crm-sec">💉 Vacinas / vermífugos a vencer</div><div class="crm-list">${vacRows}</div>`:''}
    ${rec.length?`<div class="crm-sec">🛒 Recompra prevista (ração e recorrentes)</div><div class="crm-list">${recRows}</div>`:''}
    ${!rec.length&&!vac.length?'':'<div class="crm-mini" style="margin-top:8px">Defina “recompra a cada N dias” no cadastro do produto para ativar os lembretes de recompra.</div>'}
  </div>`;
}
window.petWhats=(fone,tipo,pet,desc,data)=>{
  const loja=(DB.settings.storeName||'nosso pet shop');
  let msg;
  if(tipo==='vacina') msg=`Olá! Passando para lembrar que a ${desc} do(a) ${pet||'seu pet'} está prevista para ${data}. Quer agendar? Estamos à disposição no ${loja}. 🐾`;
  else msg=`Olá! Notamos que a ${desc||'ração do seu pet'} deve estar acabando. Quer repor? Temos pronta entrega aqui no ${loja}. 🐾`;
  const f=String(fone||'').replace(/\D/g,'').replace(/^55/,'');
  window.open('https://wa.me/55'+f+'?text='+encodeURIComponent(msg),'_blank');
};

window.maskCep = el=>{ let v=el.value.replace(/\D/g,'').slice(0,8); el.value = v.length>5 ? v.slice(0,5)+'-'+v.slice(5) : v; };
window.buscaCep = async ()=>{
  const cep=($('#cfCep').value||'').replace(/\D/g,'');
  if(cep.length!==8){ toast('CEP deve ter 8 dígitos.',true); return; }
  const btn=event&&event.target&&event.target.tagName==='BUTTON'?event.target:null;
  if(btn){ btn.disabled=true; btn.textContent='…'; }
  try{
    const r=await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const d=await r.json();
    if(d.erro){ toast('CEP não encontrado.',true); return; }
    const num=($('#cfNum').value||'').trim();
    const rua=[d.logradouro, num].filter(Boolean).join(', ');
    $('#cfEnd').value = [rua, d.bairro, d.localidade&&d.uf?`${d.localidade}/${d.uf}`:''].filter(Boolean).join(' - ');
    toast('Endereço preenchido pelo CEP');
    if(!num) $('#cfNum').focus();
  }catch(e){ toast('Falha ao consultar o CEP.',true); }
  finally{ if(btn){ btn.disabled=false; btn.textContent='Buscar'; } }
};

// ======================= IMPORTAÇÃO DE CLIENTES (CSV) =======================
{ const b=$('#btnCustImport'); if(b) b.onclick=()=> $('#custCsvFile').click();
  const m=$('#btnCustModel'); if(m) m.onclick=()=> baixarCSV('modelo-clientes.csv',
    'codigo;nome;telefone;documento;email;endereco;limite_credito;frete;obs\n'+
    '1001;Maria da Silva;21999998888;123.456.789-00;maria@email.com;Rua A, 100 - Centro;200;5;Cliente antigo\n'); }
window.baixarCSV=(nome,txt)=>{
  const blob=new Blob(['\ufeff'+txt],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=nome;
  document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },500);
};
{ const f=$('#custCsvFile'); if(f) f.onchange = async (e)=>{
  const file=e.target.files[0]; if(!file) return;
  const text=await file.text(); e.target.value='';
  const rows=parseCustCSV(text);
  if(!rows.length){ toast('CSV vazio ou sem a coluna "nome".',true); return; }
  window._custImport=rows;
  const head=rows.slice(0,6).map(r=>`<tr><td>${esc(r.nome)}</td><td>${esc(r.telefone||'—')}</td><td>${esc(r.documento||'—')}</td><td>${esc(r.endereco||'—')}</td></tr>`).join('');
  modal(`<div class="m-head"><h3>Importar clientes</h3><button data-modal-close>×</button></div>
    <div class="m-body">
      <p class="muted" style="margin-bottom:8px"><b>${rows.length}</b> linha(s) lida(s). Clientes com o mesmo <b>código</b>, <b>documento</b>, <b>telefone</b> ou <b>nome</b> são atualizados; os demais, criados (sem duplicar).</p>
      <div class="tbl-wrap"><table><thead><tr><th>Nome</th><th>Telefone</th><th>Documento</th><th>Endereço</th></tr></thead><tbody>${head}</tbody></table></div>
      ${rows.length>6?`<p class="muted" style="margin-top:6px">…e mais ${rows.length-6}.</p>`:''}
      <p class="muted" style="font-size:13px;margin-top:8px">Colunas aceitas: codigo (número do cliente), nome, telefone, documento (CPF/CNPJ), email, endereço, limite_credito, frete, obs.</p>
    </div>
    <div class="m-foot"><button class="btn ghost" data-modal-close>Cancelar</button>
      <button class="btn green" id="btnDoCustImport" data-onclick="doCustImport()">Importar ${rows.length}</button></div>`);
}; }
function parseCustCSV(text){
  const rows=csvRows(text); if(!rows.length) return [];
  const header=rows[0].map(h=>h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,''));
  const map={ nome:['nome','cliente','razaosocial'], codigo:['codigo','cod','numero','codcliente','codigodocliente','codigocliente'],
    telefone:['telefone','fone','celular','whatsapp','tel'],
    documento:['documento','cpf','cnpj','cpfcnpj','doc'], email:['email','mail'],
    endereco:['endereco','end','rua','logradouro'], limite_credito:['limitecredito','limite','credito'],
    frete:['frete','taxaentrega'], obs:['obs','observacao','observacoes','nota'] };
  const idx={}; Object.keys(map).forEach(k=>{ idx[k]=header.findIndex(h=>map[k].includes(h)); });
  if(idx.nome<0) return [];
  return rows.slice(1).map(c=>{ const o={};
    Object.keys(idx).forEach(k=>{ if(idx[k]>=0 && c[idx[k]]!=null && String(c[idx[k]]).trim()!=='') o[k]=String(c[idx[k]]).trim(); });
    ['limite_credito','frete'].forEach(k=>{ if(o[k]) o[k]=numCSV(o[k]); });
    return o;
  }).filter(o=>o.nome);
}
window.doCustImport = async ()=>{
  const rows=window._custImport||[]; if(!rows.length) return;
  const btn=$('#btnDoCustImport'); if(btn){ btn.disabled=true; btn.textContent='Importando…'; }
  let tot=0, novos=0, erro=null;
  for(let i=0;i<rows.length;i+=200){
    const { data, error } = await sb.rpc('erp_customers_bulk',{ p_items: rows.slice(i,i+200) });
    if(error){ erro=error.message; break; }
    tot += +((data||{}).total||0); novos += +((data||{}).novos||0);
    if(btn) btn.textContent='Importando… '+Math.min(i+200,rows.length)+'/'+rows.length;
  }
  if(erro){ toast('Erro: '+erro,true); if(btn){ btn.disabled=false; btn.textContent='Tentar de novo'; } return; }
  closeModal(); toast(tot+' cliente(s): '+novos+' novo(s), '+(tot-novos)+' atualizado(s) ✅');
  await loadCustomers(); renderCustomers();
};

// ======================= ESTOQUE / PRODUTOS =======================
$('#prodFilter').oninput = renderProducts;
$('#btnNewProd').onclick = ()=> prodForm();
$('#btnEntry').onclick = ()=> entryForm();
let STOCK_CRM_DAYS=14;
let STOCK_CRM_DATA={opportunities:[],stock_alerts:[]};
async function renderStockCrm(){
  const box=$('#stockCrm'); if(!box || !CURRENT_STORE) return;
  box.innerHTML=`<div class="crm"><div class="crm-head"><h2>🧠 CRM inteligente do estoque</h2></div><div class="crm-mini">Analisando histórico de compras, recompra e disponibilidade…</div></div>`;
  const { data, error }=await sb.rpc('erp_stock_crm',{p_store:CURRENT_STORE,p_horizon_days:STOCK_CRM_DAYS});
  if(error){
    box.innerHTML=`<div class="crm"><div class="crm-head"><h2>🧠 CRM inteligente do estoque</h2><span class="grow"></span><button class="crm-toggle" data-onclick="renderStockCrm()">↻ Tentar novamente</button></div><div class="crm-mini">Não foi possível calcular as oportunidades agora.</div></div>`;
    return;
  }
  STOCK_CRM_DATA=data||{opportunities:[],stock_alerts:[]};
  const k=STOCK_CRM_DATA.kpis||{};
  const opp=STOCK_CRM_DATA.opportunities||[];
  const alerts=STOCK_CRM_DATA.stock_alerts||[];
  const oppRows=opp.slice(0,10).map((o,i)=>{
    const due=+o.days_until<0?`atrasada ${Math.abs(+o.days_until)}d`:+o.days_until===0?'recompra hoje':`recompra em ${+o.days_until}d`;
    const stock=o.track_stock?`${(+o.stock_available||0).toLocaleString('pt-BR')} em estoque`:'estoque livre';
    const phone=String(o.phone||'').replace(/\D/g,'');
    const action=o.ready_to_sell
      ? (phone?`<button class="btn acc sm" data-onclick="stockCrmWhats(${i})">💬 Oferecer</button>`:'<span class="crm-mini">sem telefone</span>')
      : `<button class="btn ghost sm" data-onclick="stockCrmEntry('${o.product_id}')">↧ Dar entrada</button>`;
    return `<div class="crm-row">
      <div style="min-width:0"><div class="nm">${esc(o.product_name||'Produto')} · ${esc(o.customer_name||'Cliente')}</div>
        <div class="meta">${due} (${fmtDate(o.expected_on)}) · ${stock} · ciclo ${+o.cycle_days}d ${o.cycle_source==='aprendido'?'aprendido pelo histórico':'configurado'}</div></div>
      <span class="crm-risk ${esc(o.risk||'baixo')}">${esc(o.risk||'baixo')}</span>
      <div class="val">${BRL(o.forecast_value||0)}</div><div class="act">${action}</div>
    </div>`;
  }).join('');
  const alertRows=alerts.slice(0,8).map(a=>{
    const predicted=+a.forecast_quantity||0;
    const detail=predicted>0
      ? `${+a.interested_customers||0} cliente(s) previstos · demanda ${predicted.toLocaleString('pt-BR')}`
      : `vendeu ${(+a.recent_quantity||0).toLocaleString('pt-BR')} nos últimos 90 dias · mínimo ${(+a.min_stock||0).toLocaleString('pt-BR')}`;
    return `<div class="crm-row">
      <div style="min-width:0"><div class="nm">${esc(a.product_name||'Produto')}</div>
        <div class="meta">${detail} · saldo ${(+a.stock_available||0).toLocaleString('pt-BR')}</div></div>
      <span class="crm-risk alto">ruptura</span>
      <div class="val">comprar ${(+a.suggested_purchase||0).toLocaleString('pt-BR')}</div>
      <div class="act"><button class="btn ghost sm" data-onclick="stockCrmEntry('${a.product_id}')">↧ Entrada</button></div>
    </div>`;
  }).join('');
  const learned=+k.learned_cycles||0, configured=+k.configured_products||0;
  const insight=opp.length
    ? `<div class="crm-ins"><b>${+k.ready_contacts||0} contato(s) pronto(s)</b> para vender com saldo disponível. A previsão combina a última compra, o ciclo do produto e os padrões aprendidos do cliente.</div>`
    : `<div class="crm-ins"><b>O CRM está aprendendo.</b> Ele gera oportunidades quando encontra compras recorrentes ou quando “recompra a cada N dias” está definido no produto.</div>`;
  box.innerHTML=`<div class="crm">
    <div class="crm-head"><h2>🧠 CRM inteligente do estoque</h2><span class="grow"></span>
      <select class="crm-toggle" aria-label="Horizonte da previsão" data-onchange="stockCrmHorizon(this.value)">
        <option value="7" ${STOCK_CRM_DAYS===7?'selected':''}>7 dias</option>
        <option value="14" ${STOCK_CRM_DAYS===14?'selected':''}>14 dias</option>
        <option value="30" ${STOCK_CRM_DAYS===30?'selected':''}>30 dias</option>
      </select>
      <button class="crm-toggle" data-onclick="renderStockCrm()">↻ Recalcular</button></div>
    <div class="crm-kpis">
      <div class="crm-kpi warn"><div class="k">Oportunidades</div><div class="v">${+k.opportunities||0}</div><div class="s">até ${STOCK_CRM_DAYS} dias</div></div>
      <div class="crm-kpi good"><div class="k">Receita prevista</div><div class="v">${BRL(k.forecast_revenue||0)}</div><div class="s">com estoque disponível</div></div>
      <div class="crm-kpi ${+k.stock_risks?'bad':'good'}"><div class="k">Risco de ruptura</div><div class="v">${+k.stock_risks||0}</div><div class="s">itens para repor</div></div>
      <div class="crm-kpi"><div class="k">Inteligência</div><div class="v">${learned+configured}</div><div class="s">${learned} ciclos aprendidos · ${configured} configurados</div></div>
    </div>
    ${insight}
    ${oppRows?`<div class="crm-sec">🎯 Próximas recompras</div><div class="crm-list">${oppRows}</div>`:'<div class="crm-mini">Ainda não há recompra prevista neste período.</div>'}
    ${alertRows?`<div class="crm-sec">⚠️ Estoque que pode travar vendas</div><div class="crm-list">${alertRows}</div>`:''}
  </div>`;
}
window.stockCrmHorizon=value=>{ STOCK_CRM_DAYS=[7,14,30].includes(+value)?+value:14; renderStockCrm(); };
window.stockCrmEntry=productId=>entryForm(productId);
window.stockCrmWhats=index=>{
  const o=(STOCK_CRM_DATA.opportunities||[])[index]; if(!o) return;
  const f=String(o.phone||'').replace(/\D/g,'').replace(/^55/,'');
  if(!f){ toast('Cliente sem telefone cadastrado.',true); return; }
  const primeiro=String(o.customer_name||'').trim().split(/\s+/)[0]||'';
  const loja=DB.settings.storeName||'nosso pet shop';
  const msg=`Olá${primeiro?', '+primeiro:''}! Tudo bem? ${o.product_name||'O produto'} pode estar perto de acabar. Temos disponível por ${BRL(o.current_price||0)} no ${loja}. Quer que eu reserve para você? 🐾`;
  window.open('https://wa.me/55'+f+'?text='+encodeURIComponent(msg),'_blank');
};
async function renderProducts(){
  await loadProducts();
  let trends={}; try{ const { data:t }=await sb.rpc('erp_stock_trends',{ p_store:CURRENT_STORE, p_dias:14 }); trends=t||{}; }catch(e){}
  const cats=[...new Set((PRODUCTS||[]).map(p=>(p.categoria||'').trim()).filter(Boolean))].sort();
  const sel=$('#prodCat');
  if(sel){ const cur=sel.value;
    sel.innerHTML='<option value="">Todas categorias</option>'+cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
    if(cur) sel.value=cur; }
  const q=($('#prodFilter').value||'').toLowerCase();
  const cat=sel?sel.value:'';
  const list = PRODUCTS.filter(p=>(!q||p.nome.toLowerCase().includes(q)||(p.sku||'').toLowerCase().includes(q)||(p.codigo_barras||'').includes(q))
    && (!cat || (p.categoria||'')===cat));
  $('#prodBody').innerHTML = list.map(p=>{
    const low = p.track_stock && (+p.estoque)<=(+p.estoque_min);
    return `<tr class="${low?'low':''}">
      <td><b>${esc(p.nome)}</b> ${low?'<span class="chip amber">baixo</span>':''}
        ${p.embalagem?`<span class="muted" style="font-size:11px">· ${esc(p.embalagem)}${+p.pack_size>1?' c/'+(+p.pack_size):''}</span>`:''}</td>
      <td>${esc(p.sku||'—')}</td>
      <td>${p.categoria?`<span class="chip">${esc(p.categoria)}</span>`:'<span class="muted">—</span>'}</td>
      <td class="r">${BRL(p.preco)}</td><td class="r muted">${BRL(p.custo)}</td>
      <td class="r"><b class="${(+p.estoque)<0?'neg':''}">${p.track_stock?(+p.estoque).toLocaleString('pt-BR'):'—'}</b></td>
      <td class="c">${p.track_stock?trendBadge(trends[p.id]):'—'}</td>
      <td>${p.track_stock?'<span class="chip ok">controla</span>':'<span class="chip">livre</span>'}</td>
      <td class="r" style="white-space:nowrap">
        <button class="btn ghost sm" data-onclick='entryForm("${p.id}")'>↧ Entrada</button>
        <button class="btn ghost sm" data-onclick='prodForm(${JSON.stringify(p).replace(/'/g,"&#39;")})'>Editar</button>
        <button class="btn ghost sm red" data-onclick='delProd("${p.id}", ${JSON.stringify(p.nome).replace(/'/g,"&#39;")})' title="Excluir produto">🗑️</button>
      </td></tr>`;
  }).join('') || '<tr><td colspan="9" class="muted" style="text-align:center;padding:20px">Nenhum produto.</td></tr>';
}
{ const c=$('#prodCat'); if(c) c.onchange=renderProducts; }
window.delProd = async (id, nome)=>{
  if(!await uiConfirm('Excluir o produto "'+nome+'"?\n\nSe ele já tiver vendas, será apenas desativado (o histórico é preservado).',{danger:true,okText:'Excluir'})) return;
  const { data, error } = await sb.rpc('erp_product_delete',{ p_product:id });
  if(error){ toast('Erro: '+error.message,true); return; }
  toast(data.modo==='excluido' ? 'Produto excluído ✅' : 'Produto desativado (tinha '+data.vendas+' venda(s))');
  await loadProducts(); renderProducts(); buildPdvCatalog();
};
function trendBadge(t){
  if(!t || t.trend==='none') return '<span class="trend flat" title="Sem vendas no período">–</span>';
  const rec=+t.recent||0, prev=+t.prev||0;
  const tip=`Vendas: ${rec.toLocaleString('pt-BR')} nos últimos 14 dias · ${prev.toLocaleString('pt-BR')} nos 14 anteriores`;
  if(t.trend==='up')   return `<span class="trend up" title="${tip}">↑ subindo</span>`;
  if(t.trend==='down') return `<span class="trend down" title="${tip}">↓ caindo</span>`;
  return `<span class="trend flat" title="${tip}">→ estável</span>`;
}
window.prodForm = (p={})=>{
  modal(`
    <div class="m-head"><h3>${p.id?'Editar':'Novo'} produto</h3><button data-modal-close>×</button></div>
    <div class="m-body">
      <div class="field"><label class="lbl">Nome *</label><input id="pfNome" class="in" value="${esc(p.nome||'')}"></div>
      <div class="grid2">
        <div class="field"><label class="lbl">SKU</label><input id="pfSku" class="in" value="${esc(p.sku||'')}"></div>
        <div class="field"><label class="lbl">Código de barras</label><input id="pfBar" class="in" value="${esc(p.codigo_barras||'')}"></div>
        <div class="field"><label class="lbl">Preço de venda *</label><input id="pfPreco" class="in" value="${p.preco||0}"></div>
        <div class="field"><label class="lbl">Custo</label><input id="pfCusto" class="in" value="${p.custo||0}"></div>
        <div class="field"><label class="lbl">Unidade</label><input id="pfUn" class="in" value="${esc(p.unidade||'un')}"></div>
        <div class="field"><label class="lbl">🏷️ Categoria</label><input id="pfCat" class="in" value="${esc(p.categoria||'')}" list="catList" placeholder="ex: Ração, Higiene…">
          <datalist id="catList">${[...new Set((PRODUCTS||[]).map(x=>x.categoria).filter(Boolean))].map(c=>`<option value="${esc(c)}">`).join('')}</datalist></div>
        <div class="field"><label class="lbl">📦 Embalagem de venda</label><input id="pfEmb" class="in" value="${esc(p.embalagem||'')}" placeholder="ex: Fardo, Caixa, Pacote"></div>
        <div class="field"><label class="lbl">Quantidade da embalagem</label><input id="pfPack" class="in" value="${p.pack_size||1}" inputmode="decimal" placeholder="ex: 6, 12…"></div>
        <div class="field"><label class="lbl">Estoque mínimo (loja atual)</label><input id="pfMin" class="in" value="${p.estoque_min||0}"></div>
        <div class="field"><label class="lbl">🔁 Recompra a cada (dias)</label><input id="pfRec" class="in" value="${p.dias_recompra!=null?p.dias_recompra:''}" inputmode="numeric" placeholder="ex: 30 (ração)"></div>
        <div class="field"><label class="lbl">🏭 Fornecedor</label><select id="pfSup" class="in"><option value="">— nenhum —</option>${SUPPLIERS.map(x=>`<option value="${x.id}" ${p.supplier_id===x.id?'selected':''}>${esc(x.nome)}</option>`).join('')}</select></div>
        <div class="field"><label class="lbl">NCM (fiscal)</label><input id="pfNcm" class="in" value="${esc(p.ncm||'')}" placeholder="8 dígitos"></div>
        <div class="field"><label class="lbl">CEST</label><input id="pfCest" class="in" value="${esc(p.cest||'')}" placeholder="7 dígitos"></div>
        <div class="field"><label class="lbl">CFOP</label><input id="pfCfop" class="in" value="${esc(p.cfop||'5102')}"></div>
        <div class="field"><label class="lbl">CSOSN / CST</label><input id="pfCsosn" class="in" value="${esc(p.csosn||'102')}"></div>
        <div class="field"><label class="lbl">Origem</label><input id="pfOrigem" class="in" value="${p.origem!=null?p.origem:0}"></div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-weight:700;margin-top:4px">
        <input type="checkbox" id="pfTrack" ${p.track_stock!==false?'checked':''}> Controlar estoque deste produto</label>
      ${!p.id?`<div class="field" style="margin-top:11px"><label class="lbl">Estoque inicial</label><input id="pfEst" class="in" value="0"></div>`:''}
    </div>
    <div class="m-foot"><button class="btn ghost" data-modal-close>Cancelar</button>
      <button class="btn" data-onclick='saveProd(${p.id?`"${p.id}"`:'null'})'>Salvar</button></div>`);
};
window.saveProd = async (id)=>{
  const nome=$('#pfNome').value.trim(); if(!nome){ toast('Informe o nome.',true); return; }
  const payload={ id, nome, sku:$('#pfSku').value, codigo_barras:$('#pfBar').value,
    preco:num($('#pfPreco').value), custo:num($('#pfCusto').value), unidade:$('#pfUn').value,
    estoque_min:num($('#pfMin').value), track_stock:$('#pfTrack').checked,
    supplier_id:$('#pfSup').value||null, pack_size:num($('#pfPack').value)||1,
    embalagem:$('#pfEmb').value, categoria:$('#pfCat').value, cest:$('#pfCest').value,
    ncm:$('#pfNcm').value, cfop:$('#pfCfop').value, csosn:$('#pfCsosn').value, origem:parseInt($('#pfOrigem').value)||0,
    dias_recompra:($('#pfRec').value||'').trim()===''?'':parseInt($('#pfRec').value,10)||'' };
  if(!id) payload.estoque = num(($('#pfEst')||{}).value||0);
  const { data:saved, error } = await sb.rpc('erp_upsert_product',{ p:payload });
  if(error){ toast('Erro: '+error.message,true); return; }
  const pid = id || (saved && saved.id);
  if(pid && CURRENT_STORE){ await sb.rpc('erp_stock_set_min',{ p_product:pid, p_min:num($('#pfMin').value), p_store:CURRENT_STORE }); }
  closeModal(); toast('Produto salvo'); renderProducts();
};
window.entryForm = (pid)=>{
  const opts = PRODUCTS.map(p=>`<option value="${p.id}" ${p.id===pid?'selected':''}>${esc(p.nome)}</option>`).join('');
  modal(`
    <div class="m-head"><h3>Entrada / reposição</h3><button data-modal-close>×</button></div>
    <div class="m-body">
      <div class="field"><label class="lbl">Produto</label><select id="efProd" class="in">${opts}</select></div>
      <div class="grid2">
        <div class="field"><label class="lbl">Quantidade *</label><input id="efQtd" class="in" value="1" inputmode="decimal"></div>
        <div class="field"><label class="lbl">Custo unitário (opcional)</label><input id="efCusto" class="in" placeholder="mantém atual"></div>
      </div>
      <div class="field"><label class="lbl">Motivo</label><input id="efMot" class="in" value="Reposição"></div>
      <p class="muted" style="font-size:13px">Funciona também para produtos sem controle de estoque (registra a compra e o custo).</p>
    </div>
    <div class="m-foot"><button class="btn ghost" data-modal-close>Cancelar</button>
      <button class="btn green" data-onclick="saveEntry()">Dar entrada</button></div>`);
};
window.saveEntry = async ()=>{
  const p_product=$('#efProd').value, q=num($('#efQtd').value);
  if(!p_product||!q){ toast('Informe produto e quantidade.',true); return; }
  const custo = $('#efCusto').value.trim()? num($('#efCusto').value) : null;
  const { error } = await sb.rpc('erp_stock_entry',{ p_product, p_qtd:q, p_custo:custo, p_motivo:$('#efMot').value, p_store:CURRENT_STORE });
  if(error){ toast('Erro: '+error.message,true); return; }
  closeModal(); toast('Entrada registrada');
  if(currentPage==='estoquecrm'){ await loadProducts(); renderStockCrm(); }
  else renderProducts();
};

// ======================= IMPORTAÇÃO DE PRODUTOS (CSV) =======================
$('#btnImport').onclick = ()=> $('#csvFile').click();
{ const m=$('#btnProdModel'); if(m) m.onclick=()=> baixarCSV('modelo-produtos.csv',
  'SKU;nome;embalagem de venda;quantidade da embalagem;PRECO;estoque;CUSTO;codigo de barra;NCM;categoria;fornecedor;CEST\n'+
  'RC001;Ração Premium 15kg;Fardo;1;189,90;12;132,50;7891000100103;23091000;Ração;Distribuidora XYZ;2100100\n'); }
function csvRows(text){
  const lines=text.replace(/\r/g,'').split('\n').filter(l=>l.trim());
  if(!lines.length) return [];
  const sep=(lines[0].match(/;/g)||[]).length > (lines[0].match(/,/g)||[]).length ? ';' : ',';
  const parseLine=(line)=>{ const out=[]; let cur='',q=false;
    for(let i=0;i<line.length;i++){ const c=line[i];
      if(c==='"'){ if(q&&line[i+1]==='"'){cur+='"';i++;} else q=!q; }
      else if(c===sep&&!q){ out.push(cur); cur=''; } else cur+=c; }
    out.push(cur); return out.map(x=>x.trim().replace(/^\ufeff/,'')); };
  return lines.map(parseLine);
}
function numCSV(v){
  let x=String(v==null?'':v).replace(/[^\d.,-]/g,'');
  if(x.includes(',')) x=x.replace(/\./g,'').replace(',','.');
  const n=parseFloat(x); return isNaN(n)?null:n;
}
$('#csvFile').onchange = async (e)=>{
  const file=e.target.files[0]; if(!file) return;
  const text=await file.text(); e.target.value='';
  const rows=parseCSV(text);
  if(!rows.length){ toast('CSV vazio ou sem a coluna "nome".',true); return; }
  window._importRows=rows;
  const loja=(STORES.find(x=>x.id===CURRENT_STORE)||{}).nome||'—';
  const head=rows.slice(0,6).map(r=>`<tr><td>${esc(r.sku||'—')}</td><td>${esc(r.nome)}</td><td>${esc(r.categoria||'—')}</td>
    <td class="r">${r.preco!=null?BRL(r.preco):'—'}</td><td class="r">${r.custo!=null?BRL(r.custo):'—'}</td>
    <td class="r">${r.estoque!=null?r.estoque:'—'}</td><td>${esc(r.fornecedor||'—')}</td></tr>`).join('');
  modal(`<div class="m-head"><h3>Importar produtos</h3><button data-modal-close>×</button></div>
    <div class="m-body">
      <p class="muted" style="margin-bottom:8px"><b>${rows.length}</b> linha(s) lida(s). Casa por <b>SKU</b>, depois por <b>código de barras</b> e, quando a linha não traz nenhum dos dois, por <b>nome</b>: existentes são atualizados, o resto é criado (sem duplicar).
        O estoque informado é aplicado na loja <b>${esc(loja)}</b>.</p>
      <div class="tbl-wrap"><table><thead><tr><th>SKU</th><th>Nome</th><th>Categoria</th><th class="r">Preço</th><th class="r">Custo</th><th class="r">Estoque</th><th>Fornecedor</th></tr></thead><tbody>${head}</tbody></table></div>
      ${rows.length>6?`<p class="muted" style="margin-top:6px">…e mais ${rows.length-6}.</p>`:''}
      <p class="muted" style="font-size:13px;margin-top:8px">Colunas aceitas: SKU, nome, embalagem de venda, quantidade da embalagem, preço, estoque, custo, código de barra, NCM, categoria, fornecedor, CEST, unidade, estoque mínimo.
        Fornecedor novo é cadastrado automaticamente.</p>
    </div>
    <div class="m-foot"><button class="btn ghost" data-modal-close>Cancelar</button>
      <button class="btn green" id="btnDoImport" data-onclick="doImport()">Importar ${rows.length}</button></div>`);
};
function parseCSV(text){
  const rows=csvRows(text); if(!rows.length) return [];
  const header=rows[0].map(h=>h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,''));
  const map={ nome:['nome','descricao','produto'], sku:['sku','codigo','cod','referencia','ref'],
    codigo_barras:['codigodebarra','codigodebarras','codigobarras','barras','ean','gtin','codbarras'],
    preco:['preco','precovenda','venda','valor','precodevenda'],
    custo:['custo','precocusto','custounit','precodecusto'],
    unidade:['unidade','un','umd'],
    embalagem:['embalagemdevenda','embalagem','emb','tipoembalagem'],
    pack_size:['quantidadedaembalagem','qtdembalagem','qtdeembalagem','quantidadeembalagem','packsize','multiplo'],
    estoque:['estoque','qtd','quantidade','saldo'],
    estoque_min:['estoqueminimo','estoquemin','minimo','min'],
    ncm:['ncm'], cest:['cest'], categoria:['categoria','grupo','secao','departamento'],
    fornecedor:['fornecedor','forn','supplier'] };
  const idx={}; Object.keys(map).forEach(k=>{ idx[k]=header.findIndex(h=>map[k].includes(h)); });
  if(idx.nome<0) return [];
  return rows.slice(1).map(c=>{ const o={};
    Object.keys(idx).forEach(k=>{ if(idx[k]>=0 && c[idx[k]]!=null && String(c[idx[k]]).trim()!=='') o[k]=String(c[idx[k]]).trim(); });
    ['preco','custo','estoque','pack_size','estoque_min'].forEach(k=>{ if(o[k]!=null) o[k]=numCSV(o[k]); });
    return o;
  }).filter(o=>o.nome);
}
window.doImport = async ()=>{
  const rows=window._importRows||[]; if(!rows.length) return;
  const btn=$('#btnDoImport'); if(btn){ btn.disabled=true; btn.textContent='Importando…'; }
  let tot=0, novos=0, erro=null;
  for(let i=0;i<rows.length;i+=200){
    const { data, error } = await sb.rpc('erp_products_bulk',{ p_items: rows.slice(i,i+200), p_store: CURRENT_STORE });
    if(error){ erro=error.message; break; }
    tot += +((data||{}).total||0); novos += +((data||{}).novos||0);
    if(btn) btn.textContent='Importando… '+Math.min(i+200,rows.length)+'/'+rows.length;
  }
  if(erro){ toast('Erro: '+erro,true); if(btn){ btn.disabled=false; btn.textContent='Tentar de novo'; } return; }
  closeModal(); toast(tot+' produto(s): '+novos+' novo(s), '+(tot-novos)+' atualizado(s) ✅');
  await loadProducts(); renderProducts(); buildPdvCatalog();
};

// ======================= CURVA ABC =======================
$('#btnAbc').onclick = async ()=>{
  const ini=$('#repIni').value, fim=$('#repFim').value;
  if(!ini||!fim){ toast('Selecione o período no filtro acima.',true); return; }
  const dias = Math.round((new Date(fim)-new Date(ini))/86400000)+1;
  const ini2 = new Date(new Date(ini).getTime()-dias*86400000).toISOString().slice(0,10);
  const fim2 = new Date(new Date(ini).getTime()-86400000).toISOString().slice(0,10);
  modal(`<div class="m-head"><h3>📈 Curva ABC <span class="muted" style="font-size:13px;font-weight:400">(vs período anterior)</span></h3><button data-modal-close>×</button></div>
    <div class="m-body" id="abcBody"><p class="muted" style="padding:20px">Calculando e comparando…</p></div>`);
  const [{data:cur},{data:prev}] = await Promise.all([
    sb.rpc('erp_abc',{ p_ini:ini, p_fim:fim, p_store:CURRENT_STORE }),
    sb.rpc('erp_abc',{ p_ini:ini2, p_fim:fim2, p_store:CURRENT_STORE })
  ]);
  const rows=cur||[]; const prevMap={};
  (prev||[]).forEach(r=>{ prevMap[r.product_id||r.nome]={classe:r.classe, fat:+r.faturamento}; });
  const cls={A:0,B:0,C:0}, val={A:0,B:0,C:0};
  rows.forEach(r=>{ cls[r.classe]++; val[r.classe]+=+r.faturamento; });
  const cor={A:'var(--green)',B:'var(--amber)',C:'var(--ink2)'};
  const totFat=val.A+val.B+val.C;
  const totMargem=rows.reduce((a,r)=>a+(+r.margem||0),0);
  const totCusto=rows.reduce((a,r)=>a+(+r.custo||0),0);
  const margemPctGeral=totFat>0?(totMargem/totFat*100):0;
  $('#abcBody').innerHTML = rows.length ? `
    <div class="stats" style="margin-bottom:12px">
      ${['A','B','C'].map(k=>`<div class="stat"><div class="k" style="color:${cor[k]}">Classe ${k}</div>
        <div class="v">${cls[k]} <span style="font-size:14px" class="muted">itens</span></div>
        <div class="muted" style="font-size:12px">${BRL(val[k])}</div></div>`).join('')}
      <div class="stat acc"><div class="k">Margem total</div>
        <div class="v">${BRL(totMargem)}</div>
        <div class="muted" style="font-size:12px">${margemPctGeral.toFixed(1)}% s/ faturamento · custo ${BRL(totCusto)}</div></div>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Produto</th><th class="r">Faturamento</th><th class="r">Custo</th><th class="r">Margem</th><th>Classe</th><th>Antes</th><th class="r">Δ</th></tr></thead>
      <tbody>${rows.map(r=>{
        const p=prevMap[r.product_id||r.nome]; const delta=p? (+r.faturamento - p.fat):null;
        const mudou = p && p.classe!==r.classe;
        const mg=+r.margem||0, mgp=+r.margem_pct||0;
        const mgCor=mg<=0?'var(--red)':mgp<15?'var(--amber)':'var(--green)';
        return `<tr>
          <td>${esc(r.nome)} <span class="muted" style="font-size:11px">· ${(+r.qtd).toLocaleString('pt-BR')} un · ${(+r.pct).toFixed(1)}%</span></td>
          <td class="r"><b>${BRL(r.faturamento)}</b></td>
          <td class="r muted">${BRL(r.custo)}</td>
          <td class="r"><b style="color:${mgCor}">${BRL(mg)}</b><br><span class="muted" style="font-size:11px">${mgp.toFixed(1)}%</span></td>
          <td><span class="chip" style="background:${cor[r.classe]};color:#fff">${r.classe}</span></td>
          <td>${p?`<span class="chip" style="background:${cor[p.classe]};color:#fff;opacity:.7">${p.classe}</span>${mudou?' ⬆️':''}`:'<span class="muted">novo</span>'}</td>
          <td class="r ${delta==null?'muted':delta<0?'neg':''}">${delta==null?'—':(delta>=0?'+':'')+BRL(delta)}</td>
        </tr>`; }).join('')}</tbody></table></div>
    <p class="muted" style="font-size:12px;margin-top:8px">Margem = faturamento − custo (custo unitário registrado na venda; quando ausente, usa o custo atual do produto). Itens com margem 0% podem estar sem custo cadastrado.</p>`
    : '<p class="muted" style="padding:24px;text-align:center">Sem vendas no período.</p>';
};

// ======================= CONTAS A RECEBER (CREDIÁRIO) =======================
{ ['btnCredRefresh'].forEach(id=>{ const b=$('#'+id); if(b) b.onclick=()=>loadCrediario(); });
  const m=$('#btnCredMes'); if(m) m.onclick=()=>{ const r=mesAtualISO(); setDates('credIni','credFim',r.ini,r.fim); loadCrediario(); };
  ['credFilter','credIni','credFim'].forEach(id=>{ const el=$('#'+id); if(el) el.onchange=()=>loadCrediario(); });
  const sc=$('#credSearch'); if(sc) sc.oninput=()=>renderCrediario(); }
async function loadCrediario(){
  const filt=($('#credFilter')||{}).value||'';
  const ini=($('#credIni')||{}).value||null, fim=($('#credFim')||{}).value||null;
  const modo = filt==='pagas' ? 'pagas' : 'abertas';
  const { data, error } = await sb.rpc('erp_receivables_list',{ p_ini:ini, p_fim:fim, p_status:modo });
  if(error){ toast('Erro: '+error.message,true); return; }
  window._credRows = data||[];
  renderCrediario();
}
function renderCrediario(){
  const rows = window._credRows||[];
  const filt = ($('#credFilter')||{}).value||'';
  const pagas = filt==='pagas';
  const isV = r => !!r.atrasada;
  const venc = rows.filter(isV);
  const tot = rows.reduce((a,r)=>a+ +r.valor,0);
  const totVenc = venc.reduce((a,r)=>a+ +r.valor,0);
  $('#credStats').innerHTML = pagas ? `
    <div class="stat acc"><div class="k">Recebido no período</div><div class="v">${BRL(tot)}</div></div>
    <div class="stat"><div class="k">Parcelas pagas</div><div class="v">${rows.length}</div></div>
    <div class="stat"><div class="k">Clientes</div><div class="v">${new Set(rows.map(r=>r.customer_id)).size}</div></div>` : `
    <div class="stat acc"><div class="k">A receber (aberto)</div><div class="v">${BRL(tot)}</div></div>
    <div class="stat warn"><div class="k">Vencido</div><div class="v">${BRL(totVenc)}</div></div>
    <div class="stat"><div class="k">Parcelas em aberto</div><div class="v">${rows.length}</div></div>`;
  $('#credVencChip').textContent = pagas ? `${rows.length} recebimento(s)` : `${venc.length} vencida(s)`;
  const q = (($('#credSearch')||{}).value||'').trim().toLowerCase();
  let view = rows;
  if(filt==='vencidas') view = rows.filter(isV);
  else if(filt==='vencer') view = rows.filter(r=>!isV(r));
  if(q) view = view.filter(r=>(r.cliente_nome||'').toLowerCase().includes(q));
  $('#credBody').innerHTML = view.map(r=>{
    const isVenc = isV(r), paga = r.status==='paga';
    const waMsg = encodeURIComponent(`Olá ${r.cliente_nome}! Passando para lembrar da sua parcela de ${BRL(r.valor)} com vencimento em ${fmtDate(r.vencimento)}${isVenc?' (já vencida)':''}. Qualquer dúvida, estamos à disposição!`);
    const wa = r.cliente_fone? `https://wa.me/${r.cliente_fone}?text=${waMsg}` : null;
    const statusChip = paga?'<span class="chip ok">paga</span>':(isVenc?'<span class="chip warn">vencida</span>':'<span class="chip amber">aberta</span>');
    const pagCell = paga
      ? `${esc(r.pago_metodo||'—')}<br><span class="muted" style="font-size:11px">${fmtDT(r.pago_em)}</span>`
      : '<span class="muted">—</span>';
    const acoes = paga
      ? `${r.sale_id?`<button class="btn ghost sm" data-onclick="printReceipt('${r.sale_id}')" title="Reimprimir pedido">🧾 Pedido</button>`:''}
         <button class="btn green sm" data-onclick="recvReceipt('${r.id}')">📄 Recibo</button>`
      : `${wa?`<a class="btn ghost sm" href="${wa}" target="_blank">💬</a>`:''}
         ${r.sale_id?`<button class="btn ghost sm" data-onclick="printReceipt('${r.sale_id}')" title="Reimprimir pedido">🧾 Pedido</button>`:''}
         <button class="btn green sm" data-onclick="payRecvAsk('${r.id}')">Receber</button>`;
    return `<tr class="${isVenc&&!paga?'low':''}">
      <td><b>${esc(r.cliente_nome||'—')}</b></td>
      <td>${r.venda_num?('#'+r.venda_num):'—'}</td>
      <td>${r.parcela_num}/${r.parcelas_tot}</td>
      <td>${fmtDate(r.vencimento)}</td>
      <td class="r"><b>${BRL(r.valor)}</b></td>
      <td>${statusChip}</td>
      <td>${pagCell}</td>
      <td class="r"><div class="row-actions">${acoes}
        <button class="btn ghost sm red" data-onclick="delReceivable('${r.id}')" title="Excluir esta conta a receber">🗑️</button></div></td></tr>`;
  }).join('') || '<tr><td colspan="8" class="muted" style="text-align:center;padding:20px">Nenhuma conta nesse filtro. 🎉</td></tr>';
}
function fmtDate(d){ if(!d) return '—'; const x=String(d); return x.length>10? new Date(x).toLocaleDateString('pt-BR') : new Date(x+'T00:00:00').toLocaleDateString('pt-BR'); }
function fmtDT(d){ return d? new Date(d).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—'; }
function hojeISO(){ const d=new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); }
function mesAtualISO(){ const d=new Date(); const ini=new Date(d.getFullYear(),d.getMonth(),1), fim=new Date(d.getFullYear(),d.getMonth()+1,0);
  const f=x=>new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().slice(0,10); return { ini:f(ini), fim:f(fim) }; }
function setDates(idIni,idFim,ini,fim){ const a=$('#'+idIni), b=$('#'+idFim); if(a)a.value=ini; if(b)b.value=fim; }
function fillStoreSelect(id, label){ const el=$('#'+id); if(!el) return; const cur=el.value;
  el.innerHTML=`<option value="">${label}</option>`+STORES.map(x=>`<option value="${x.id}">${esc(x.nome)}${x.is_matriz?' ★':''}</option>`).join('');
  if(cur) el.value=cur; }
function dur(min){ if(min==null) return '—'; const m=Math.max(0,Math.round(+min));
  if(m<60) return m+' min'; const h=Math.floor(m/60); return h+'h'+String(m%60).padStart(2,'0'); }
window.delReceivable = async (id)=>{
  const r=(window._credRows||[]).find(x=>x.id===id)||{};
  const nome=[r.cliente_nome, r.venda_num?('pedido #'+r.venda_num):''].filter(Boolean).join(' · ')||'esta conta';
  let msg='Excluir a conta a receber de "'+nome+'" ('+BRL(r.valor)+', vence '+fmtDate(r.vencimento)+')?\n\nEssa ação não pode ser desfeita.';
  if(r.status==='paga') msg='⚠️ Esta parcela já foi RECEBIDA.\n\nExcluir "'+nome+'" ('+BRL(r.valor)+')? Ela sairá dos totais de recebimentos do período.\n\nEssa ação não pode ser desfeita.';
  if(!await uiConfirm(msg,{danger:true,okText:'Excluir',cancelText:'Cancelar'})) return;
  const { error } = await sb.rpc('erp_receivable_delete',{ p_id:id });
  if(error){ toast('Erro: '+error.message,true); return; }
  toast('Conta a receber excluída 🗑️'); await loadCrediario();
};
window.payRecvAsk = (id)=>{
  const r=(window._credRows||[]).find(x=>x.id===id); if(!r){ toast('Parcela não encontrada.',true); return; }
  modal(`<div class="m-head"><h3>Receber parcela</h3><button data-modal-close>✕</button></div>
    <div class="m-body">
      <p class="muted" style="margin:0 0 4px">Cliente: <b>${esc(r.cliente_nome)}</b> · parcela ${r.parcela_num}/${r.parcelas_tot}${r.venda_num?' · pedido #'+r.venda_num:''}</p>
      <p style="font-family:Fredoka;font-size:26px;font-weight:700;margin:0 0 12px">${BRL(r.valor)}</p>
      <div class="lbl">Forma de recebimento</div>
      <div class="pay-modes" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px">
        <button class="btn" data-onclick="payRecv('${r.id}','dinheiro')">💵 Dinheiro</button>
        <button class="btn" data-onclick="payRecv('${r.id}','pix')">📱 PIX</button>
        <button class="btn" data-onclick="payRecv('${r.id}','debito')">💳 Débito</button>
        <button class="btn" data-onclick="payRecv('${r.id}','credito')">💳 Crédito</button>
      </div>
      <p class="muted" style="font-size:12px;margin-top:10px">Recebimento em dinheiro entra na soma do caixa de hoje. O comprovante aparece logo depois.</p>
    </div>`);
};
window.payRecv = async (id, metodo)=>{
  const { error } = await sb.rpc('erp_pay_receivable',{ p_receivable:id, p_metodo:(metodo||'dinheiro') });
  if(error){ toast('Erro: '+error.message,true); return; }
  toast('Parcela recebida ✅');
  await loadCrediario();
  if(typeof refreshCash==='function') refreshCash();
  recvReceipt(id);
};
window.recvReceipt = async (id)=>{
  const { data:d, error } = await sb.rpc('erp_receivable_receipt',{ p_receivable:id });
  if(error||!d){ toast('Não foi possível gerar o comprovante.',true); return; }
  window._recvPrint=d;
  const outras=(d.parcelas||[]).filter(p=>p.parcela_num!==d.parcela_num);
  const emAberto=outras.filter(p=>p.status!=='paga');
  const saldo=emAberto.reduce((a,p)=>a+ +p.valor,0);
  modal(`<div class="m-head"><h3>📄 Comprovante de pagamento</h3><button data-modal-close>✕</button></div>
    <div class="m-body">
      <div style="text-align:center;margin-bottom:10px">
        <div style="font-size:38px">✅</div>
        <p style="font-family:Fredoka;font-size:26px;font-weight:700;margin:0">${BRL(d.valor)}</p>
        <p class="muted" style="margin:2px 0">parcela ${d.parcela_num}/${d.parcelas_tot} quitada</p>
      </div>
      <div style="background:#f7f9ff;border:1px solid var(--line);border-radius:10px;padding:11px">
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">Cliente</span><b>${esc(d.cliente||'—')}</b></div>
        ${d.cliente_doc?`<div class="l" style="display:flex;justify-content:space-between"><span class="muted">Documento</span><b>${esc(d.cliente_doc)}</b></div>`:''}
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">Pedido</span><b>#${d.venda_num||'—'} · ${fmtDate(d.venda_data)}</b></div>
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">Loja</span><b>${esc(d.loja_nome||'—')}</b></div>
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">Vencimento</span><b>${fmtDate(d.vencimento)}</b></div>
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">Data do pagamento</span><b>${fmtDT(d.pago_em)}</b></div>
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">Forma de pagamento</span><b>${esc(d.pago_metodo||'—')}</b></div>
      </div>
      ${emAberto.length?`<p class="muted" style="margin-top:8px">Ainda em aberto neste pedido: <b>${emAberto.length}</b> parcela(s) · ${BRL(saldo)}</p>`
        :'<p class="ok" style="margin-top:8px">🎉 Pedido totalmente quitado.</p>'}
    </div>
    <div class="m-foot">
      ${d.sale_id?`<button class="btn ghost" data-onclick="printReceipt('${d.sale_id}')">🧾 Reimprimir pedido</button>`:''}
      <button class="btn" data-onclick="recvPrint()">🖨️ Imprimir comprovante</button>
      <button class="btn ghost" data-modal-close>Fechar</button></div>`);
};
window.recvPrint = ()=>{
  const d=window._recvPrint; if(!d) return; const co=COMPANY||{};
  const outras=(d.parcelas||[]).filter(p=>p.status!=='paga');
  const saldo=outras.reduce((a,p)=>a+ +p.valor,0);
  $('#receiptPrint').innerHTML = `
    <h3>${esc(co.nome||'Minha Loja')}</h3>
    ${co.cnpj?`<div class="c">CNPJ: ${esc(co.cnpj)}</div>`:''}
    ${co.endereco?`<div class="c">${esc(co.endereco)}</div>`:''}
    <div class="ln"></div>
    <div class="c b">COMPROVANTE DE PAGAMENTO</div>
    <div class="c" style="font-size:10px">Parcela ${d.parcela_num}/${d.parcelas_tot} — crediário</div>
    <div class="ln"></div>
    <div class="row"><span>Cliente</span><span>${esc(d.cliente||'—')}</span></div>
    ${d.cliente_doc?`<div class="row"><span>Documento</span><span>${esc(d.cliente_doc)}</span></div>`:''}
    <div class="row"><span>Pedido</span><span>#${d.venda_num||'—'}</span></div>
    <div class="row"><span>Data do pedido</span><span>${fmtDate(d.venda_data)}</span></div>
    <div class="row"><span>Loja</span><span>${esc(d.loja_nome||'—')}</span></div>
    <div class="ln"></div>
    <div class="row"><span>Vencimento</span><span>${fmtDate(d.vencimento)}</span></div>
    <div class="row"><span>Pago em</span><span>${fmtDT(d.pago_em)}</span></div>
    <div class="row"><span>Forma</span><span>${esc(d.pago_metodo||'—')}</span></div>
    <div class="row b" style="font-size:14px"><span>VALOR PAGO</span><span>${BRL(d.valor)}</span></div>
    <div class="ln"></div>
    ${outras.length?`<div class="row"><span>Parcelas em aberto</span><span>${outras.length}</span></div>
      <div class="row"><span>Saldo devedor</span><span>${BRL(saldo)}</span></div>`
      :'<div class="c">PEDIDO QUITADO</div>'}
    <div class="ln"></div>
    <table>${(d.itens||[]).map(i=>`<tr><td class="row"><span>${(+i.qtd).toLocaleString('pt-BR')}x ${esc(i.descricao)}</span><span>${BRL(i.subtotal)}</span></td></tr>`).join('')}</table>
    <div class="ln"></div>
    <div class="c" style="font-size:10px">${new Date().toLocaleString('pt-BR')} · ONPDV</div>`;
  window.print();
};

// ======================= DASHBOARD =======================
async function loadDash(){
  const { data:sales } = await sb.from('sales')
    .select('id, numero, created_at, forma_pagamento, total, status, customers(nome)')
    .order('created_at',{ascending:false}).limit(25);
  $('#salesBody').innerHTML = (sales||[]).map(s=>`
    <tr><td>#${s.numero}</td>
      <td>${new Date(s.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</td>
      <td>${esc(s.customers?.nome||'Consumidor')}</td>
      <td>${esc(s.forma_pagamento)}</td>
      <td class="r"><b>${BRL(s.total)}</b></td>
      <td>${s.status==='paga'?'<span class="chip ok">paga</span>':s.status==='cancelada'?'<span class="chip warn">cancelada</span>':'<span class="chip amber">aberta</span>'}</td>
      <td class="r" style="white-space:nowrap">
        <button class="btn ghost sm" data-onclick="printReceipt('${s.id}')">🧾</button>
        ${s.status!=='cancelada'?`<button class="btn ghost sm red" data-onclick="voidSale('${s.id}','${s.forma_pagamento}',${s.numero})">${s.forma_pagamento==='cartao'?'Estornar':'Cancelar'}</button>`:''}
      </td>
    </tr>`).join('') || '<tr><td colspan="7" class="muted" style="text-align:center;padding:16px">Sem vendas ainda.</td></tr>';
}

// ======================= EMPRESA =======================
async function loadCompany(){
  const { data } = await refetch('company', async ()=>{
    const r = await sb.from('company_settings').select('*').eq('id',1).maybeSingle(); if(r.error) throw r.error;
    return r.data || { nome:'Minha Loja' };
  }, true);
  COMPANY = data||{ nome:'Minha Loja' };
  $('#coNome').value=COMPANY.nome||''; $('#coCnpj').value=COMPANY.cnpj||'';
  $('#coFone').value=COMPANY.telefone||''; $('#coEnd').value=COMPANY.endereco||'';
  $('#coRodape').value=COMPANY.rodape||'';
  applyPdvConfig(COMPANY.pdv_config||{});
  fillConfigForms();
}
// mescla o pdv_config vindo do banco com os defaults e guarda em DB.cfg
function applyPdvConfig(cfg){
  cfg=cfg||{};
  const b=cfg.balanca||{}, m=cfg.mercadopago||{};
  DB.cfg={
    balanca:{ ativa:!!b.ativa, modo:(b.modo==='preco'?'preco':'peso'),
      prefixo:String(b.prefixo==null?'2':b.prefixo), cod_len:+b.cod_len||6,
      val_len:+b.val_len||5, val_dec:(b.val_dec==null?3:+b.val_dec) },
    mercadopago:{ ativa:!!m.ativa, device_id:String(m.device_id||'') }
  };
}
function fillConfigForms(){
  const b=DB.cfg.balanca, m=DB.cfg.mercadopago;
  const set=(id,v)=>{ const el=$('#'+id); if(el) el.value=v; };
  set('scAtiva', b.ativa?'1':'0'); set('scModo', b.modo); set('scPrefixo', b.prefixo);
  set('scCodLen', b.cod_len); set('scValLen', b.val_len); set('scValDec', b.val_dec);
  set('mpAtiva', m.ativa?'1':'0'); set('mpDevice', m.device_id);
}
async function savePdvConfig(patch, okMsg){
  const cur=DB.cfg||{};
  const next={ balanca:Object.assign({},cur.balanca,patch.balanca||{}),
               mercadopago:Object.assign({},cur.mercadopago,patch.mercadopago||{}) };
  const { error } = await sb.from('company_settings').update({ pdv_config:next }).eq('id',1);
  if(error){ toast('Erro: '+error.message,true); return; }
  applyPdvConfig(next); toast(okMsg||'Configuração salva');
}
$('#btnSaveCompany').onclick = async ()=>{
  const { error } = await sb.from('company_settings').update({
    nome:$('#coNome').value, cnpj:$('#coCnpj').value, telefone:$('#coFone').value,
    endereco:$('#coEnd').value, rodape:$('#coRodape').value }).eq('id',1);
  if(error){ toast('Erro: '+error.message,true); return; }
  toast('Dados salvos'); loadCompany();
};
// ---- frete por bairro ----
async function loadFreteRules(){
  try{ const { data, error } = await sb.rpc('erp_frete_bairros'); if(error) throw error;
    FRETE_RULES = data||[]; refCachePut('frete_rules', FRETE_RULES, true);
  }catch(e){ const c = isNetworkErr(e) ? await refCacheGet('frete_rules') : undefined;
    FRETE_RULES = Array.isArray(c) ? c : []; }
  renderFrete();
}
function renderFrete(){
  const b=$('#freteBody'); if(!b) return;
  b.innerHTML = (FRETE_RULES||[]).map(r=>`<tr>
    <td><b>${esc(r.bairro)}</b></td><td class="r">${BRL(r.valor)}</td>
    <td class="r" style="white-space:nowrap"><button class="btn ghost sm" data-onclick="freteForm('${r.id}')">Editar</button>
      <button class="btn ghost sm red" data-onclick="freteDel('${r.id}')">Remover</button></td></tr>`).join('')
    || '<tr><td colspan="3" class="muted" style="text-align:center;padding:16px">Nenhum bairro cadastrado.</td></tr>';
}
window.freteForm=(id)=>{
  const r = id ? (FRETE_RULES||[]).find(x=>x.id===id) : null;
  modal(`<div class="m-head"><h3>${r?'Editar':'Novo'} bairro</h3><button data-modal-close>×</button></div>
    <div class="m-body">
      <div class="field"><label class="lbl">Bairro *</label><input id="fbBairro" class="in" value="${esc(r?r.bairro:'')}"></div>
      <div class="field"><label class="lbl">Frete R$</label><input id="fbValor" class="in" inputmode="decimal" value="${r?fmtNum(r.valor):'0,00'}"></div>
    </div>
    <div class="m-foot"><button class="btn ghost" data-modal-close>Cancelar</button>
      <button class="btn green" data-onclick="freteSave(${r?`'${r.id}'`:'null'})">Salvar</button></div>`);
};
window.freteSave=async (id)=>{
  const bairro=($('#fbBairro').value||'').trim(); if(!bairro){ toast('Informe o bairro',true); return; }
  const { error } = await sb.rpc('erp_frete_bairro_upsert',{ p_bairro:bairro, p_valor:num($('#fbValor').value), p_id:id||null });
  if(error){ toast('Erro: '+error.message,true); return; }
  closeModal(); await loadFreteRules(); toast('Frete do bairro salvo ✅');
};
window.freteDel=async (id)=>{ if(!await uiConfirm('Remover este bairro?',{danger:true,okText:'Remover'}))return;
  const { error }=await sb.rpc('erp_frete_bairro_delete',{p_id:id}); if(error){ toast('Erro: '+error.message,true); return; }
  await loadFreteRules(); toast('Removido'); };
window.custBairroFrete=()=>{
  const bel=$('#cfBairro'), fel=$('#cfFrete'); if(!bel||!fel) return;
  const rule=(FRETE_RULES||[]).find(r=>normTxt(r.bairro)===normTxt(bel.value));
  if(rule && (!fel.value || num(fel.value)===0)) fel.value=fmtNum(rule.valor);
};
{ const b=$('#btnFreteNew'); if(b) b.onclick=()=>freteForm(); }
{ const b=$('#btnSaveScale'); if(b) b.onclick=()=>savePdvConfig({ balanca:{
    ativa:$('#scAtiva').value==='1', modo:$('#scModo').value,
    prefixo:($('#scPrefixo').value||'2').replace(/\D/g,'')||'2',
    cod_len:Math.max(1,parseInt($('#scCodLen').value,10)||6),
    val_len:Math.max(1,parseInt($('#scValLen').value,10)||5),
    val_dec:Math.max(0,parseInt($('#scValDec').value,10)||0) }}, 'Balança configurada ✓'); }
{ const b=$('#btnSaveMp'); if(b) b.onclick=()=>savePdvConfig({ mercadopago:{
    ativa:$('#mpAtiva').value==='1', device_id:($('#mpDevice').value||'').trim() }}, 'Mercado Pago Point configurado ✓'); }
// ---- cashback (card na Configuração; reaproveita as RPCs do módulo em Clientes) ----
async function loadCashbackConfigCard(){
  if(!$('#cfgCbPercent')) return;
  try{
    const { data } = await sb.rpc('cashback_config_get'); const c=data||{};
    const at=$('#cfgCbAtivo'); if(at) at.checked=!!c.ativo;
    $('#cfgCbPercent').value = c.percent!=null?c.percent:3;
    $('#cfgCbVal').value = c.validade_dias!=null?c.validade_dias:90;
    $('#cfgCbMin').value = c.min_compra!=null?fmtNum(c.min_compra):'0,00';
  }catch(e){ console.error('cashback cfg:',e); }
}
{ const b=$('#btnSaveCashback'); if(b) b.onclick=async ()=>{
    const p={ ativo:$('#cfgCbAtivo').checked, percent:num($('#cfgCbPercent').value),
      validade_dias:parseInt($('#cfgCbVal').value,10)||90, min_compra:num($('#cfgCbMin').value) };
    const { error } = await sb.rpc('cashback_config_set',{ p });
    if(error){ toast('Erro: '+error.message,true); return; }
    CB_ACTIVE=!!p.ativo;
    toast('Cashback configurado ✅'); loadCashbackConfigCard();
  }; }

// ======================= VALE-PRESENTE / CARTEIRA =======================
let vlCustMap={};
async function renderVales(){
  if(!$('#vlBody')) return;
  vlLoadCustomers();
  vlLoadList();
}
async function vlLoadCustomers(){
  const dl=$('#vlClientes'); if(!dl) return;
  try{
    const { data } = await sb.rpc('pdv_find_customer',{ p_q:'' });
    vlCustMap={};
    dl.innerHTML=(data||[]).map(c=>{ if(c.nome) vlCustMap[c.nome.toLowerCase()]=c.id; return `<option value="${esc(c.nome||'')}">`; }).join('');
  }catch(e){ console.error('vl custs',e); }
}
function vlStatusChip(s){
  const cls={ativo:'chip ok',esgotado:'chip',expirado:'chip warn',cancelado:'chip warn'}[s]||'chip';
  const lbl={ativo:'Ativo',esgotado:'Esgotado',expirado:'Expirado',cancelado:'Cancelado'}[s]||s;
  return `<span class="${cls}">${lbl}</span>`;
}
function vlDate(d){ return d ? new Date(d+'T00:00:00').toLocaleDateString('pt-BR') : '—'; }
async function vlLoadList(){
  const st=$('#vlFiltroStatus') ? ($('#vlFiltroStatus').value||null) : null;
  const q=$('#vlBusca') ? ($('#vlBusca').value.trim()||null) : null;
  const { data, error } = await sb.rpc('erp_giftcard_list',{ p_status:st, p_q:q });
  if(error){ toast('Erro ao listar: '+error.message,true); return; }
  const rows=data||[];
  $('#vlBody').innerHTML = rows.length ? rows.map(v=>`
    <tr>
      <td><b>${esc(v.codigo)}</b></td>
      <td>${v.tipo==='carteira'?'Carteira':'Presente'}</td>
      <td>${esc(v.customer_nome||'—')}</td>
      <td>${vlStatusChip(v.status)}</td>
      <td class="r"><b>${BRL(v.saldo)}</b></td>
      <td>${vlDate(v.expira_em)}</td>
      <td class="r"><button class="btn ghost sm" data-onclick="vlOpen('${esc(v.codigo)}')">Abrir</button></td>
    </tr>`).join('') : '<tr><td colspan="7" class="muted" style="text-align:center;padding:16px">Nenhum vale encontrado.</td></tr>';
}
function vlRenderCard(v){
  const el=$('#vlConsResult'); if(!el) return;
  const isCart=v.tipo==='carteira';
  el.innerHTML=`
    <div class="card pad" style="margin:0">
      <div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap">
        <div><div class="muted">Código</div><div style="font-size:20px;letter-spacing:2px"><b>${esc(v.codigo)}</b></div></div>
        <div><div class="muted">Saldo</div><div style="font-size:20px"><b>${BRL(v.saldo)}</b></div></div>
        <div><div class="muted">Tipo</div>${isCart?'Carteira':'Presente'}</div>
        <div><div class="muted">Status</div>${vlStatusChip(v.status)}</div>
        ${v.expira_em?`<div><div class="muted">Validade</div>${vlDate(v.expira_em)}</div>`:''}
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
        <button class="btn ghost sm" data-onclick="vlExtrato('${esc(v.codigo)}')">📄 Extrato</button>
        ${isCart?`<button class="btn ghost sm" data-onclick="vlRecarregar('${esc(v.codigo)}')">➕ Recarregar</button>`:''}
        <button class="btn red sm" data-onclick="vlCancelar('${esc(v.codigo)}')">✖ Cancelar</button>
      </div>
    </div>`;
}
async function vlConsultar(cod){
  cod=(cod||'').trim();
  if(!cod){ toast('Digite o código.',true); return; }
  const { data, error } = await sb.rpc('erp_giftcard_lookup',{ p_codigo:cod });
  if(error){ toast('Erro: '+error.message,true); return; }
  if(!data){ $('#vlConsResult').innerHTML='<div class="muted">Vale não encontrado.</div>'; return; }
  vlRenderCard(data);
}
window.vlOpen=async (cod)=>{ const i=$('#vlConsCod'); if(i) i.value=cod; await vlConsultar(cod); const r=$('#vlConsResult'); if(r) r.scrollIntoView({behavior:'smooth',block:'center'}); };
window.vlRecarregar=async (cod)=>{
  const s=await uiPrompt('Valor da recarga (R$):',{ title:'Recarregar carteira' });
  if(s==null) return; const v=num(s); if(!(v>0)){ toast('Valor inválido.',true); return; }
  const { data, error }=await sb.rpc('erp_giftcard_topup',{ p_codigo:cod, p_valor:v, p_note:null });
  if(error){ toast('Erro: '+error.message,true); return; }
  toast('Recarregado ✅ · saldo '+BRL(data.saldo)); vlConsultar(cod); vlLoadList();
};
window.vlCancelar=async (cod)=>{
  const ok=await uiConfirm('Cancelar o vale '+cod+'? O saldo será zerado e o vale não poderá mais ser usado.',{ title:'Cancelar vale', danger:true, okText:'Cancelar vale' });
  if(!ok) return;
  const { error }=await sb.rpc('erp_giftcard_cancel',{ p_codigo:cod, p_motivo:null });
  if(error){ toast('Erro: '+error.message,true); return; }
  toast('Vale cancelado.'); vlConsultar(cod); vlLoadList();
};
window.vlExtrato=async (cod)=>{
  const { data, error }=await sb.rpc('erp_giftcard_statement',{ p_codigo:cod });
  if(error){ toast('Erro: '+error.message,true); return; }
  const movs=(data&&data.movimentos)||[];
  const kindLbl={emissao:'Emissão',recarga:'Recarga',resgate:'Resgate',estorno:'Estorno',ajuste:'Ajuste',cancelamento:'Cancelamento'};
  modal(`<div class="m-body" style="padding:20px;max-width:540px">
    <h3 style="margin:0 0 6px">Extrato · ${esc(cod)}</h3>
    <div class="muted" style="margin-bottom:10px">Saldo atual: <b>${BRL(data&&data.saldo)}</b></div>
    <div class="tbl-wrap" style="max-height:340px;overflow:auto"><table>
      <thead><tr><th>Data</th><th>Movimento</th><th class="r">Valor</th></tr></thead>
      <tbody>${movs.length?movs.map(m=>`<tr><td>${new Date(m.created_at).toLocaleString('pt-BR')}</td><td>${kindLbl[m.kind]||m.kind}${m.note?' · <span class="muted">'+esc(m.note)+'</span>':''}</td><td class="r ${m.amount<0?'neg':''}"><b>${BRL(m.amount)}</b></td></tr>`).join(''):'<tr><td colspan="3" class="muted" style="text-align:center;padding:14px">Sem movimentos.</td></tr>'}</tbody>
    </table></div>
    <div style="text-align:right;margin-top:14px"><button class="btn" data-modal-close>Fechar</button></div>
  </div>`);
};
{ const b=$('#btnVlEmitir'); if(b) b.onclick=async ()=>{
    const valor=num($('#vlValor').value);
    if(!(valor>0)){ toast('Informe um valor maior que zero.',true); return; }
    const p={ tipo:$('#vlTipo').value, valor,
      codigo:($('#vlCodigo').value.trim()||null),
      expira_em:($('#vlValidade').value||null),
      obs:($('#vlObs').value.trim()||null) };
    const cn=$('#vlCliente').value.trim();
    if(cn && vlCustMap[cn.toLowerCase()]) p.customer_id=vlCustMap[cn.toLowerCase()];
    const { data, error } = await sb.rpc('erp_giftcard_issue',{ p });
    if(error){ toast('Erro: '+error.message,true); return; }
    $('#vlEmitResult').innerHTML=`<div class="stat acc"><div class="k">Vale emitido — código</div><div class="v" style="font-size:22px;letter-spacing:2px">${esc(data.codigo)}</div><div class="muted">Saldo ${BRL(data.saldo)}${data.expira_em?' · vence '+vlDate(data.expira_em):''}</div></div>`;
    ['vlValor','vlCodigo','vlObs','vlCliente','vlValidade'].forEach(id=>{ const el=$('#'+id); if(el) el.value=''; });
    toast('Vale emitido ✅'); vlLoadList();
  }; }
{ const b=$('#btnVlConsultar'); if(b) b.onclick=()=>vlConsultar($('#vlConsCod').value); }
{ const s=$('#vlFiltroStatus'); if(s) s.onchange=vlLoadList; }
{ const q=$('#vlBusca'); if(q){ let t; q.oninput=()=>{ clearTimeout(t); t=setTimeout(vlLoadList,300); }; } }

// ======================= CONCILIAÇÃO MERCADO PAGO =======================
function cmDefaultDates(){
  const fim=new Date(), ini=new Date(); ini.setDate(ini.getDate()-30);
  const f=d=>d.toISOString().slice(0,10);
  if($('#cmIni')&&!$('#cmIni').value) $('#cmIni').value=f(ini);
  if($('#cmFim')&&!$('#cmFim').value) $('#cmFim').value=f(fim);
}
async function renderConcilMp(){
  if(!$('#cmRowsBody')) return;
  cmDefaultDates();
  cmLoad();
}
async function cmLoad(){
  const ini=$('#cmIni').value, fim=$('#cmFim').value;
  if(!ini||!fim){ toast('Informe o período.',true); return; }
  const { data, error } = await sb.rpc('erp_mp_reconciliation',{ p_ini:ini, p_fim:fim, p_store:null });
  if(error){ toast('Erro: '+error.message,true); return; }
  const d=data||{}, r=d.resumo||{}, rows=d.rows||[], met=d.por_metodo||[];
  $('#cmStats').innerHTML=`
    <div class="stat"><div class="k">Bruto</div><div class="v">${BRL(r.bruto)}</div></div>
    <div class="stat warn"><div class="k">Taxa MP</div><div class="v">− ${BRL(r.taxa)}</div></div>
    <div class="stat acc"><div class="k">Líquido</div><div class="v">${BRL(r.liquido)}</div></div>
    <div class="stat"><div class="k">✅ Já liberado</div><div class="v">${BRL(r.liberado)}</div></div>
    <div class="stat"><div class="k">⏳ A liberar</div><div class="v">${BRL(r.a_liberar)}</div></div>
    <div class="stat"><div class="k">Transações</div><div class="v">${r.qtd||0}</div></div>
    <div class="stat${(+r.nao_conciliadas>0)?' warn':''}"><div class="k">Não conciliadas</div><div class="v">${r.nao_conciliadas||0}</div></div>`;
  $('#cmMetodoBody').innerHTML = met.length ? met.map(m=>`
    <tr><td>${esc(m.metodo)}</td><td class="r">${m.qtd}</td><td class="r">${BRL(m.bruto)}</td><td class="r">${BRL(m.taxa)}</td><td class="r"><b>${BRL(m.liquido)}</b></td></tr>`).join('')
    : '<tr><td colspan="5" class="muted" style="text-align:center;padding:14px">Sem dados no período. Clique em “Sincronizar do MP”.</td></tr>';
  $('#cmRowsBody').innerHTML = rows.length ? rows.map(x=>{
    const lib = x.liberado ? '<span class="chip ok">liberado</span>' : '<span class="chip warn">a liberar</span>';
    const libd = x.money_release_date ? new Date(x.money_release_date).toLocaleDateString('pt-BR') : '—';
    return `<tr>
      <td>${x.date_created?new Date(x.date_created).toLocaleDateString('pt-BR'):'—'}</td>
      <td>${esc(x.payment_method||x.payment_type||'—')}</td>
      <td>${esc(x.status||'—')}</td>
      <td class="r">${BRL(x.transaction_amount)}</td>
      <td class="r neg">− ${BRL(x.fee_amount)}</td>
      <td class="r"><b>${BRL(x.net_amount)}</b></td>
      <td>${libd} · ${lib}</td>
      <td>${x.sale_numero?('#'+x.sale_numero):'<span class="muted">—</span>'}</td>
    </tr>`; }).join('')
    : '<tr><td colspan="8" class="muted" style="text-align:center;padding:16px">Nenhuma liquidação no período. Clique em “Sincronizar do MP”.</td></tr>';
}
async function cmSync(){
  const ini=$('#cmIni').value, fim=$('#cmFim').value;
  if(!ini||!fim){ toast('Informe o período.',true); return; }
  const b=$('#btnCmSync'); if(b){ b.disabled=true; b.textContent='Sincronizando...'; }
  try{
    const { data, error } = await sb.functions.invoke('mp-reconcile',{ body:{ action:'sync',
      begin_date:ini+'T00:00:00.000Z', end_date:fim+'T23:59:59.999Z' } });
    if(error) throw error;
    if(!data||!data.ok) throw new Error((data&&data.error)||'Falha na sincronização');
    toast('Sincronizado ✓ '+(data.upserted||0)+' transações'); cmLoad();
  }catch(e){ console.error(e); toast('Erro: '+(e.message||e),true); }
  finally{ const b2=$('#btnCmSync'); if(b2){ b2.disabled=false; b2.textContent='⟳ Sincronizar do MP'; } }
}
{ const b=$('#btnCmLoad'); if(b) b.onclick=cmLoad; }
{ const b=$('#btnCmSync'); if(b) b.onclick=cmSync; }

// ======================= VALIDADE DE LOTES (#4) =======================
async function renderLotExpiry(){ if(!$('#lvBody')) return; lvLoad(); }
async function lvLoad(){
  const dias=+($('#lvDias')?$('#lvDias').value:30)||30;
  const { data, error } = await sb.rpc('erp_lot_expiring',{ p_dias:dias, p_store:(typeof CURRENT_STORE!=='undefined'?CURRENT_STORE:null)||null });
  if(error){ toast('Erro: '+error.message,true); return; }
  const d=data||{}, r=d.resumo||{}, rows=d.rows||[];
  $('#lvStats').innerHTML=`
    <div class="stat"><div class="k">Lotes no alerta</div><div class="v">${r.qtd_lotes||0}</div></div>
    <div class="stat${(+r.vencidos>0)?' warn':''}"><div class="k">Já vencidos</div><div class="v">${r.vencidos||0}</div></div>
    <div class="stat acc"><div class="k">Valor em risco</div><div class="v">${BRL(r.valor_risco)}</div></div>`;
  $('#lvBody').innerHTML = rows.length ? rows.map(x=>{
    const cls = (x.vencido||x.dias<=7) ? 'neg' : '';
    const venc = x.expires_on ? new Date(x.expires_on+'T00:00:00').toLocaleDateString('pt-BR') : '—';
    return `<tr>
      <td>${esc(x.produto)}${x.categoria?' <span class="muted">· '+esc(x.categoria)+'</span>':''}</td>
      <td>${esc(x.lote||'—')}</td>
      <td>${venc}</td>
      <td class="r ${cls}"><b>${x.vencido?('vencido '+(-x.dias)+'d'):(x.dias+'d')}</b></td>
      <td class="r">${x.quantidade}</td>
      <td class="r">${BRL(x.valor_risco)}</td>
      <td class="r">${x.vencido?'<span class="chip warn">retirar</span>':('<span class="chip ok">'+x.desconto_sugerido+'%</span>')}</td>
    </tr>`; }).join('')
    : '<tr><td colspan="7" class="muted" style="text-align:center;padding:16px">Nenhum lote a vencer nesse prazo. 👍</td></tr>';
}
{ const b=$('#btnLvLoad'); if(b) b.onclick=lvLoad; }
{ const s=$('#lvDias'); if(s) s.onchange=lvLoad; }

// ======================= INVENTÁRIO ROTATIVO (#6) =======================
async function renderInventario(){ if(!$('#invBody')) return; invLoadCats(); invLoadList(); const d=$('#invDetail'); if(d) d.innerHTML=''; }
async function invLoadCats(){
  const sel=$('#invCat'); if(!sel) return;
  try{ const { data } = await sb.rpc('erp_categorias'); const cats=data||[];
    sel.innerHTML='<option value="">Todas as categorias</option>'+cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
  }catch(e){ console.error(e); }
}
async function invLoadList(){
  const { data, error } = await sb.rpc('erp_stock_counts_list',{ p_store:(typeof CURRENT_STORE!=='undefined'?CURRENT_STORE:null)||null });
  if(error){ toast('Erro: '+error.message,true); return; }
  const rows=data||[];
  $('#invBody').innerHTML = rows.length ? rows.map(c=>`
    <tr>
      <td>${new Date(c.created_at).toLocaleString('pt-BR')}</td>
      <td>${esc(c.filtro||'—')}</td>
      <td>${c.status==='aberta'?'<span class="chip ok">aberta</span>':(c.status==='fechada'?'<span class="chip">fechada'+(c.aplicado?' · aplicada':'')+'</span>':'<span class="chip warn">cancelada</span>')}</td>
      <td class="r">${c.itens}</td>
      <td class="r">${c.divergencias}</td>
      <td class="r"><button class="btn ghost sm" data-onclick="invOpen('${c.id}')">Abrir</button></td>
    </tr>`).join('') : '<tr><td colspan="6" class="muted" style="text-align:center;padding:16px">Nenhuma contagem ainda.</td></tr>';
}
{ const b=$('#btnInvOpen'); if(b) b.onclick=async ()=>{
    const cat=$('#invCat')?$('#invCat').value:'';
    const ok=await uiConfirm('Iniciar contagem de '+(cat||'todos os produtos')+'? Será criada uma lista com o saldo atual como esperado.',{title:'Nova contagem',okText:'Iniciar'});
    if(!ok) return;
    const { data, error }=await sb.rpc('erp_stock_count_open',{ p_store:(typeof CURRENT_STORE!=='undefined'?CURRENT_STORE:null)||null, p_categoria:cat||null });
    if(error){ toast('Erro: '+error.message,true); return; }
    toast('Contagem criada · '+(data.itens||0)+' itens'); invLoadList(); invOpen(data.count_id);
  }; }
window.invOpen=async (id)=>{
  const { data, error }=await sb.rpc('erp_stock_count_detail',{ p_count:id });
  if(error){ toast('Erro: '+error.message,true); return; }
  const c=(data&&data.count)||{}, items=(data&&data.items)||[];
  const aberta = c.status==='aberta';
  const el=$('#invDetail'); if(!el) return;
  el.innerHTML=`<div class="card pad">
    <div class="head"><h2>Contagem · ${esc(c.filtro||'')}</h2><span class="grow"></span>
      ${aberta?('<button class="btn ghost" data-onclick="invClose(\''+id+'\',false)">Fechar sem aplicar</button> <button class="btn green" data-onclick="invClose(\''+id+'\',true)">Fechar e ajustar estoque</button>'):'<span class="chip">encerrada</span>'}
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Produto</th><th class="r">Esperado</th><th class="r">Contado</th><th class="r">Diferença</th></tr></thead>
      <tbody>${items.map(i=>{
        const diff = (i.contado==null?null:(i.contado-i.esperado));
        return `<tr>
          <td>${esc(i.produto)}</td>
          <td class="r">${i.esperado}</td>
          <td class="r">${aberta?('<input class="in" style="max-width:90px;text-align:right" inputmode="decimal" value="'+(i.contado==null?'':i.contado)+'" data-onchange="invSet(\''+i.id+'\',this.value)">'):(i.contado==null?'—':i.contado)}</td>
          <td class="r ${(diff!=null&&diff!==0)?'neg':''}">${diff==null?'—':((diff>0?'+':'')+diff)}</td>
        </tr>`; }).join('')}</tbody>
    </table></div>
  </div>`;
  el.scrollIntoView({behavior:'smooth',block:'start'});
};
window.invSet=async (item,val)=>{
  const { error }=await sb.rpc('erp_stock_count_set',{ p_item:item, p_contado:num(val) });
  if(error){ toast('Erro: '+error.message,true); }
};
window.invClose=async (id,aplicar)=>{
  const msg = aplicar ? 'Fechar a contagem e AJUSTAR o estoque para os valores contados?' : 'Fechar a contagem sem alterar o estoque?';
  const ok=await uiConfirm(msg,{title:'Fechar contagem',danger:!!aplicar,okText:aplicar?'Ajustar estoque':'Fechar'});
  if(!ok) return;
  const { data, error }=await sb.rpc('erp_stock_count_close',{ p_count:id, p_aplicar:!!aplicar });
  if(error){ toast('Erro: '+error.message,true); return; }
  toast(aplicar?('Estoque ajustado · '+(data.ajustados||0)+' itens'):'Contagem fechada'); invLoadList(); invOpen(id);
};

// ======================= PAINEL TV (#10) =======================
let TV_TIMER=null;
function tvInjectStyle(){
  if($('#tvStyle')) return;
  const s=document.createElement('style'); s.id='tvStyle';
  s.textContent=`
    .tv-root{position:fixed;inset:0;z-index:100000;background:#0b1220;color:#eaf2ff;display:none;overflow:auto;padding:28px 34px}
    .tv-root .tv-exit{position:fixed;top:16px;right:18px;background:rgba(255,255,255,.12);color:#fff;border:0;border-radius:10px;padding:10px 14px;font-size:15px;cursor:pointer}
    .tv-clock{position:fixed;top:18px;left:24px;font-size:20px;color:#8aa}
    .tv-hero{text-align:center;margin:34px 0 26px}
    .tv-hero-k{font-size:22px;color:#8aa;letter-spacing:1px;text-transform:uppercase}
    .tv-hero-v{font-size:72px;font-weight:800;line-height:1.05;margin:6px 0}
    .tv-hero-sub{font-size:20px;color:#aab8cc}
    .tv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px;max-width:1500px;margin:0 auto}
    .tv-card{background:#131e33;border-radius:16px;padding:20px 22px}
    .tv-card-h{font-size:22px;font-weight:700;margin-bottom:8px}
    .tv-card-v{font-size:40px;font-weight:800}
    .tv-card-m{font-size:16px;color:#aab8cc;margin:4px 0 2px}
    .tv-card-sub{font-size:14px;color:#8aa;margin:0 0 10px}
    .tv-bar{height:12px;border-radius:8px;background:#22304d;overflow:hidden}
    .tv-bar>i{display:block;height:100%}
    .tv-card-goal{font-size:16px;margin-top:6px;font-weight:700}
    .tv-foot{text-align:center;color:#5f728c;margin:22px 0 8px;font-size:15px}
    .tv-kpis{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;max-width:1500px;margin:0 auto 22px}
    .tv-kpi{background:#131e33;border-radius:12px;padding:10px 16px;min-width:150px;text-align:center}
    .tv-kpi span{display:block;font-size:13px;color:#8aa}
    .tv-kpi b{font-size:22px}
    .tv-kpi.bad b{color:#ff6b6b}
    .tv-kpi.amber b{color:#f6c453}
    .tv-rank{font-size:18px}
    .tv-card.lead{outline:2px solid #2fd27a}
    .tv-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
    .tv-chip{font-size:13px;padding:3px 9px;border-radius:8px;background:#22304d;color:#cfe0ff}
    .tv-chip.bad{background:#3a1f28;color:#ff9b9b}
    .tv-chip.amber{background:#3a3320;color:#f6c453}
    .tv-views{position:fixed;top:16px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:2}
    .tv-vtab{font-size:14px;color:#5f728c;padding:4px 12px;border-radius:20px;background:#131e33}
    .tv-vtab.on{color:#0b1220;background:#eaf2ff;font-weight:700}
    .tv-spark{display:block}
    .tv-sparkwrap{display:flex;align-items:center;gap:8px;margin-top:10px}
    .tv-sparkk{font-size:12px;color:#5f728c}
    .tv-top{margin-top:8px}
    .tv-topi{display:flex;justify-content:space-between;gap:8px;font-size:14px;color:#aab8cc;padding:2px 0;border-bottom:1px solid #1c2a44}
    .tv-topi span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .tv-topi b{color:#eaf2ff;white-space:nowrap}
    .tv-goalbadge{font-size:13px;color:#2fd27a}
    .tv-card.goal-hit{outline:2px solid #2fd27a;animation:tvpulse 1.6s ease-in-out infinite}
    @keyframes tvpulse{0%,100%{box-shadow:0 0 0 0 rgba(47,210,122,0)}50%{box-shadow:0 0 26px 2px rgba(47,210,122,.45)}}
    .tv-count{font-size:14px;margin-top:6px;color:#aab8cc}
    .tv-count b{color:#f6c453}
    .tv-grid.one{grid-template-columns:1fr;max-width:520px}
    .tv-dots{display:flex;gap:8px;justify-content:center;margin:16px 0}
    .tv-dot{width:10px;height:10px;border-radius:50%;background:#22304d}
    .tv-dot.on{background:#eaf2ff}
    @media(max-width:760px){.tv-root{padding:52px 16px 20px}.tv-hero-v{font-size:52px}.tv-hero-sub{font-size:16px}.tv-kpi{min-width:120px;padding:8px 12px}.tv-kpi b{font-size:18px}}`;
  document.head.appendChild(s);
}
let TV_VIEW='hoje', TV_ROT=null, TV_CARD=0, TV_CAR=null, TV_DATA=null;
const TV_VIEWS=[['hoje','Hoje'],['mes','Mês'],['ranking','Ranking']];
const tvIsNarrow=()=>window.innerWidth<=760;
function tvSpark(serie){
  const vals=(serie||[]).map(p=>+p.total||0);
  if(vals.length<2) return '';
  const w=130,h=30,max=Math.max(1,...vals),step=w/(vals.length-1);
  const pts=vals.map((v,i)=>`${(i*step).toFixed(1)},${(h-3-(v/max*(h-8))).toFixed(1)}`).join(' ');
  const up=vals[vals.length-1]>=vals[vals.length-2];
  return `<svg class="tv-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${up?'#2fd27a':'#ff6b6b'}" stroke-width="2" stroke-linejoin="round"/></svg>`;
}
async function tvLoad(){
  const hoje=hojeISO();
  const o=new Date(); o.setDate(o.getDate()-1); const oi=o.toISOString().slice(0,10);
  let d={},g={},dy={},tv={};
  try{ const r=await sb.rpc('erp_dashboard_multi',{p_ini:hoje,p_fim:hoje}); d=r.data||{}; }catch(e){ console.error('tv dash',e); }
  try{ const r=await sb.rpc('erp_goals_status',{p_ano_mes:null}); g=r.data||{}; }catch(e){ console.error('tv goals',e); }
  try{ const r=await sb.rpc('erp_dashboard_multi',{p_ini:oi,p_fim:oi}); dy=r.data||{}; }catch(e){ console.error('tv ontem',e); }
  try{ const r=await sb.rpc('erp_tv_panel',{p_dia:hoje}); tv=r.data||{}; }catch(e){ console.error('tv panel',e); }
  TV_DATA={ d,g,dy,tv, at:new Date() };
  tvRender();
}
function tvRender(){
  const root=$('#tvBody'); if(!root||!TV_DATA) return;
  const {d,g,dy,tv,at}=TV_DATA;
  const goalsByStore={}; ((g&&g.lojas)||[]).forEach(l=>goalsByStore[l.store_id]=l);
  const ontemByStore={}; ((dy&&dy.lojas)||[]).forEach(l=>ontemByStore[l.store_id]=+l.total||0);
  const tvByStore={}; ((tv&&tv.stores)||[]).forEach(s=>tvByStore[s.store_id]=s);
  const mesTot=((g&&g.lojas)||[]).reduce((a,l)=>a+(+l.realizado||0),0);
  const lucroTot=((tv&&tv.stores)||[]).reduce((a,s)=>a+(+s.lucro_dia||0),0);
  const lucroMesTot=((tv&&tv.stores)||[]).reduce((a,s)=>a+(+s.lucro_mes||0),0);
  const isMes=TV_VIEW==='mes', isRank=TV_VIEW==='ranking';
  const narrow=tvIsNarrow();
  const now=new Date(); const fimMes=new Date(now.getFullYear(),now.getMonth()+1,0);
  const diasRest=Math.max(1, fimMes.getDate()-now.getDate()+1);
  const deltaHtml=(cur,prev)=>{ if(!(prev>0)) return (cur>0?'<span style="color:#2fd27a">novo</span>':'<span style="color:#8aa">—</span>');
    const p=Math.round((cur-prev)/prev*100), up=p>=0;
    return `<span style="color:${up?'#2fd27a':'#ff6b6b'}">${up?'▲':'▼'} ${Math.abs(p)}%</span>`; };
  const lojas=(d.lojas||[]).slice().sort(isMes
    ?(a,b)=>(+((goalsByStore[b.store_id]||{}).realizado)||0)-(+((goalsByStore[a.store_id]||{}).realizado)||0)
    :(a,b)=>(+b.total||0)-(+a.total||0));
  const ticket=(+d.total_geral||0)/Math.max(1,+d.qtd_geral||0);
  const sum=(k)=>lojas.reduce((a,l)=>a+(+l[k]||0),0);
  const entregasTot=sum('entregas_abertas'), baixosTot=sum('itens_baixos');
  const topTotal=+((lojas[0]||{}).total)||0;
  const medal=['🥇','🥈','🥉'];
  const card=(l,idx)=>{
    const gl=goalsByStore[l.store_id]||{}; const pct=(gl.pct==null?null:Math.min(200,+gl.pct));
    const cor=pct==null?'#8aa':pct>=100?'#2fd27a':pct>=60?'#f6c453':'#ff6b6b';
    const share=topTotal>0?Math.round((+l.total||0)/topTotal*100):0;
    const rank=medal[idx]||('#'+(idx+1));
    const tk=(+l.total||0)/Math.max(1,+l.qtd||0);
    const hit=(pct!=null&&pct>=100);
    const st=tvByStore[l.store_id]||{};
    const falta=(+gl.meta>0)?Math.max(0,(+gl.meta)-(+gl.realizado||0)):0;
    const lucroLinha=isMes
      ?((+st.lucro_mes)?(' · lucro mês '+BRL(st.lucro_mes)+(st.margem_mes_pct!=null?(' ('+st.margem_mes_pct+'%)'):'')):'')
      :((+st.lucro_dia)?(' · lucro '+BRL(st.lucro_dia)+(st.margem_pct!=null?(' ('+st.margem_pct+'%)'):'')):'');
    return `<div class="tv-card${(idx===0&&topTotal>0&&!narrow)?' lead':''}${hit?' goal-hit':''}">
      <div class="tv-card-h"><span class="tv-rank">${rank}</span> ${esc(l.nome)}${l.matriz?' ★':''}${hit?' <span class="tv-goalbadge">🎉 meta batida!</span>':''}</div>
      <div class="tv-card-v">${BRL(isMes?gl.realizado:l.total)}</div>
      <div class="tv-card-m">${l.qtd||0} venda(s) hoje · ticket ${BRL(tk)}${lucroLinha}</div>
      <div class="tv-card-sub">${deltaHtml(+l.total||0, ontemByStore[l.store_id]||0)} vs ontem${isMes?(+l.total>0?(' · hoje '+BRL(l.total)):''):(+gl.realizado>0?(' · mês '+BRL(gl.realizado)):'')}</div>
      ${(+gl.meta>0)?`<div class="tv-bar"><i style="width:${pct==null?0:Math.min(100,pct)}%;background:${cor}"></i></div>
         <div class="tv-card-goal" style="color:${cor}">${pct!=null?(pct+'% da meta'):''} <span style="color:#8aa;font-weight:400">${BRL(gl.realizado)} / ${BRL(gl.meta)}</span></div>
         ${hit?'<div class="tv-count" style="color:#2fd27a">✓ meta do mês batida</div>':`<div class="tv-count">⏳ faltam <b>${BRL(falta)}</b> · ${diasRest} dia(s) · ${BRL(falta/diasRest)}/dia</div>`}`
         :`<div class="tv-bar" title="participação nas vendas do dia"><i style="width:${share}%;background:#4d8bff"></i></div>
           <div class="tv-card-goal" style="color:#8aa;font-weight:400">${share}% das vendas do dia · sem meta</div>`}
      ${!isRank?`<div class="tv-sparkwrap"><span class="tv-sparkk">7 dias</span>${tvSpark(st.serie)}</div>${((st.top||[]).length)?`<div class="tv-top">${st.top.map((t,i)=>`<div class="tv-topi"><span>${i+1}. ${esc(t.produto)}</span><b>${BRL(t.total)}</b></div>`).join('')}</div>`:''}`:''}
      <div class="tv-chips">
        ${+l.entregas_abertas>0?`<span class="tv-chip amber">🚚 ${l.entregas_abertas}</span>`:''}
        ${+l.itens_baixos>0?`<span class="tv-chip bad">📦 ${l.itens_baixos} em falta</span>`:''}
        ${+l.a_receber_vencido>0?`<span class="tv-chip bad">🧾 ${BRL(l.a_receber_vencido)} vencido</span>`:''}
      </div>
    </div>`;
  };
  let gridHtml;
  if(narrow && lojas.length){
    TV_CARD=((TV_CARD%lojas.length)+lojas.length)%lojas.length;
    const dots=lojas.map((_,i)=>`<span class="tv-dot${i===TV_CARD?' on':''}"></span>`).join('');
    gridHtml=`<div class="tv-grid one">${card(lojas[TV_CARD],TV_CARD)}</div><div class="tv-dots">${dots}</div>`;
  } else {
    gridHtml=`<div class="tv-grid">${lojas.map((l,idx)=>card(l,idx)).join('')||'<div class="tv-card">Sem lojas.</div>'}</div>`;
  }
  const heroSub=isMes
    ?`${BRL(mesTot)} no mês · 💰 lucro do mês ${BRL(lucroMesTot)} · faltam ${diasRest} dia(s) p/ fechar`
    :`${d.qtd_geral||0} venda(s) hoje · ticket ${BRL(ticket)} · 💰 lucro hoje ${BRL(lucroTot)} · ${deltaHtml(+d.total_geral||0,+dy.total_geral||0)} vs ontem`;
  root.innerHTML=`
    <div class="tv-views">${TV_VIEWS.map(v=>`<span class="tv-vtab${v[0]===TV_VIEW?' on':''}">${v[1]}</span>`).join('')}</div>
    <div class="tv-hero">
      <div class="tv-hero-k">${isMes?'Vendas do mês':'Vendas hoje'} · todas as lojas</div>
      <div class="tv-hero-v">${BRL(isMes?mesTot:d.total_geral)}</div>
      <div class="tv-hero-sub">${heroSub}</div>
    </div>
    <div class="tv-kpis">
      <div class="tv-kpi"><span>🧾 A receber</span><b>${BRL(d.a_receber_geral)}</b></div>
      <div class="tv-kpi ${(+d.a_receber_vencido_geral>0)?'bad':''}"><span>⚠️ Receb. vencidos</span><b>${BRL(d.a_receber_vencido_geral)}</b></div>
      <div class="tv-kpi"><span>💸 A pagar</span><b>${BRL(d.a_pagar_geral)}</b></div>
      <div class="tv-kpi ${(+d.a_pagar_vencido_geral>0)?'bad':''}"><span>⚠️ Pgto. vencidos</span><b>${BRL(d.a_pagar_vencido_geral)}</b></div>
      <div class="tv-kpi ${entregasTot>0?'amber':''}"><span>🚚 Entregas abertas</span><b>${entregasTot}</b></div>
      <div class="tv-kpi ${baixosTot>0?'bad':''}"><span>📦 Itens em falta</span><b>${baixosTot}</b></div>
    </div>
    ${gridHtml}
    <div class="tv-foot">Atualizado ${(at||new Date()).toLocaleTimeString('pt-BR')} · vista gira a cada 12s${narrow?' · lojas em carrossel':''} · Esc para sair</div>`;
}
function tvEsc(e){ if(e.key==='Escape') closeTvPanel(); }
let tvResizeT=null;
function tvOnResize(){ clearTimeout(tvResizeT); tvResizeT=setTimeout(tvRender,200); }
function openTvPanel(){
  tvInjectStyle();
  let root=$('#tvRoot');
  if(!root){ root=document.createElement('div'); root.id='tvRoot'; root.className='tv-root';
    root.innerHTML='<button class="tv-exit" data-onclick="closeTvPanel()">✕ Sair</button><div class="tv-clock" id="tvClock"></div><div id="tvBody"></div>';
    document.body.appendChild(root); }
  root.style.display='block';
  const tick=()=>{ const c=$('#tvClock'); if(c) c.textContent=new Date().toLocaleTimeString('pt-BR'); };
  TV_VIEW='hoje'; TV_CARD=0;
  tick(); tvLoad();
  clearInterval(TV_TIMER); TV_TIMER=setInterval(()=>{ tick(); tvLoad(); }, 60000);
  clearInterval(TV_ROT); TV_ROT=setInterval(()=>{
    const i=TV_VIEWS.findIndex(v=>v[0]===TV_VIEW);
    TV_VIEW=TV_VIEWS[(i+1)%TV_VIEWS.length][0];
    tvRender();
  }, 12000);
  clearInterval(TV_CAR); TV_CAR=setInterval(()=>{ if(tvIsNarrow()){ TV_CARD++; tvRender(); } }, 6000);
  document.addEventListener('keydown', tvEsc);
  window.addEventListener('resize', tvOnResize);
  if(root.requestFullscreen){ root.requestFullscreen().catch(()=>{}); }
}
function closeTvPanel(){
  clearInterval(TV_TIMER); TV_TIMER=null;
  clearInterval(TV_ROT); TV_ROT=null;
  clearInterval(TV_CAR); TV_CAR=null;
  const root=$('#tvRoot'); if(root) root.style.display='none';
  document.removeEventListener('keydown', tvEsc);
  window.removeEventListener('resize', tvOnResize);
  if(document.fullscreenElement&&document.exitFullscreen){ document.exitFullscreen().catch(()=>{}); }
}
window.openTvPanel=openTvPanel; window.closeTvPanel=closeTvPanel;
{ const b=$('#btnTvPanel'); if(b) b.onclick=openTvPanel; }

// ======================= AUDITORIA (#11) =======================
let AUDIT_ROWS=[];
async function renderAudit(){
  if(!$('#auBody')) return;
  if($('#auIni')&&!$('#auIni').value){ const i=new Date(); i.setDate(i.getDate()-7); $('#auIni').value=i.toISOString().slice(0,10); }
  if($('#auFim')&&!$('#auFim').value){ $('#auFim').value=new Date().toISOString().slice(0,10); }
  auEntities(); auLoad();
}
async function auEntities(){
  const sel=$('#auEntity'); if(!sel) return;
  try{ const { data }=await sb.rpc('erp_audit_entities'); const e=data||[];
    const cur=sel.value;
    sel.innerHTML='<option value="">Todas as entidades</option>'+e.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
    sel.value=cur;
  }catch(e){ console.error(e); }
}
async function auLoad(){
  const corePromise=sb.rpc('erp_audit_list',{
    p_ini:($('#auIni')&&$('#auIni').value)||null, p_fim:($('#auFim')&&$('#auFim').value)||null,
    p_entity:($('#auEntity')?$('#auEntity').value:'')||null,
    p_action:($('#auAction')?$('#auAction').value:'')||null,
    p_q:($('#auQ')?$('#auQ').value.trim():'')||null });
  const [core,purchase]=await Promise.all([corePromise,purchaseFlowRpc('erp_purchase_workflow_audit_list',{p_limit:500},{silent:true})]);
  if(core.error){ toast('Erro: '+core.error.message,true); return; }
  const ini=($('#auIni')&&$('#auIni').value)||'',fim=($('#auFim')&&$('#auFim').value)||'',entity=($('#auEntity')&&$('#auEntity').value)||'',action=($('#auAction')&&$('#auAction').value)||'',q=((($('#auQ')&&$('#auQ').value)||'').trim().toLowerCase());
  const purchaseRows=(purchase.data||[]).map(a=>({created_at:a.created_at,actor_nome:String(a.actor_id||'sistema').slice(0,8),action:a.action,entity_type:a.entity_type,entity_id:a.entity_id,loja_nome:'—',payload:a.details||{}})).filter(a=>{
    const day=String(a.created_at||'').slice(0,10),hay=(a.action+' '+a.entity_type+' '+(a.entity_id||'')+' '+JSON.stringify(a.payload||{})).toLowerCase();
    return (!ini||day>=ini)&&(!fim||day<=fim)&&(!entity||a.entity_type===entity)&&(!action||a.action===action)&&(!q||hay.includes(q));
  });
  AUDIT_ROWS=[...(core.data||[]),...purchaseRows].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
  const actLbl={INSERT:'<span class="chip ok">criou</span>',UPDATE:'<span class="chip amber">alterou</span>',DELETE:'<span class="chip warn">excluiu</span>'};
  $('#auBody').innerHTML = AUDIT_ROWS.length ? AUDIT_ROWS.map((a,idx)=>`
    <tr class="clickrow" data-onclick="auDetail(${idx})">
      <td>${new Date(a.created_at).toLocaleString('pt-BR')}</td>
      <td>${esc(a.actor_nome||'—')}</td>
      <td>${actLbl[a.action]||esc(a.action)}</td>
      <td>${esc(a.entity_type)}</td>
      <td class="muted" style="font-size:12px">${esc(String(a.entity_id||'').slice(0,8))}</td>
      <td>${esc(a.loja_nome||'—')}</td>
    </tr>`).join('') : '<tr><td colspan="6" class="muted" style="text-align:center;padding:16px">Nenhum evento no período.</td></tr>';
}
window.auDetail=(idx)=>{
  const a=AUDIT_ROWS[idx]; if(!a) return;
  modal(`<div class="m-head"><h3>${esc(a.entity_type)} · ${esc(a.action)}</h3><button data-modal-close>✕</button></div>
    <div class="m-body">
      <div class="muted" style="margin-bottom:8px">${new Date(a.created_at).toLocaleString('pt-BR')} · ${esc(a.actor_nome||'sistema')}${a.loja_nome?(' · '+esc(a.loja_nome)):''} · id ${esc(String(a.entity_id||'—'))}</div>
      <pre style="white-space:pre-wrap;word-break:break-word;background:var(--line);padding:12px;border-radius:8px;max-height:420px;overflow:auto;font-size:12px">${esc(JSON.stringify(a.payload,null,2))}</pre>
    </div>
    <div class="m-foot"><button class="btn" data-modal-close>Fechar</button></div>`);
};
{ const b=$('#btnAuLoad'); if(b) b.onclick=auLoad; }
['auEntity','auAction'].forEach(id=>{ const el=$('#'+id); if(el) el.onchange=auLoad; });
{ const q=$('#auQ'); if(q){ let t; q.oninput=()=>{ clearTimeout(t); t=setTimeout(auLoad,350); }; } }

// ======================= NPS (#12) =======================
let npsCustMap={};
async function renderNps(){
  if(!$('#npsStats')) return;
  if($('#npsIni')&&!$('#npsIni').value){ const i=new Date(); i.setDate(i.getDate()-90); $('#npsIni').value=i.toISOString().slice(0,10); }
  if($('#npsFim')&&!$('#npsFim').value){ $('#npsFim').value=new Date().toISOString().slice(0,10); }
  npsLoad();
}
async function npsLoad(){
  const { data, error }=await sb.rpc('erp_nps_report',{ p_ini:($('#npsIni')&&$('#npsIni').value)||null, p_fim:($('#npsFim')&&$('#npsFim').value)||null, p_store:null });
  if(error){ toast('Erro: '+error.message,true); return; }
  const d=data||{};
  const nps=d.nps==null?null:+d.nps;
  const cor=nps==null?'var(--ink2)':nps>=50?'var(--green)':nps>=0?'var(--amber)':'var(--red)';
  $('#npsStats').innerHTML=`
    <div class="stat acc"><div class="k">NPS</div><div class="v" style="color:${cor}">${nps==null?'—':nps}</div><div class="muted" style="font-size:12px">${d.total||0} resposta(s)</div></div>
    <div class="stat"><div class="k">😍 Promotores (9-10)</div><div class="v">${d.promotores||0}</div></div>
    <div class="stat"><div class="k">😐 Neutros (7-8)</div><div class="v">${d.neutros||0}</div></div>
    <div class="stat warn"><div class="k">😞 Detratores (0-6)</div><div class="v">${d.detratores||0}</div></div>
    <div class="stat"><div class="k">Nota média</div><div class="v">${d.media==null?'—':d.media}</div></div>`;
  const dist=d.distribuicao||{}; const max=Math.max(1,...Array.from({length:11},(_,i)=>+dist[i]||0));
  $('#npsDist').innerHTML='<div style="display:flex;gap:4px;align-items:flex-end;height:96px;max-width:520px">'+
    Array.from({length:11},(_,i)=>{ const v=+dist[i]||0; const h=Math.round(v/max*80)+4;
      const c=i>=9?'#2fd27a':i>=7?'#f6c453':'#ff6b6b';
      return `<div style="flex:1;text-align:center"><div style="height:${h}px;background:${c};border-radius:4px 4px 0 0" title="${v} resposta(s)"></div><div class="muted" style="font-size:11px">${i}</div></div>`;
    }).join('')+'</div>';
  const cs=d.comentarios||[];
  $('#npsComments').innerHTML = cs.length ? cs.map(x=>`
    <div style="padding:8px 0;border-bottom:1px solid var(--line)">
      <b style="color:${x.score>=9?'var(--green)':x.score<=6?'var(--red)':'var(--amber)'}">${x.score}</b>
      · ${esc(x.cliente||'anônimo')} <span class="muted" style="font-size:12px">· ${new Date(x.created_at).toLocaleDateString('pt-BR')} · ${esc(x.source||'')}</span>
      <div>${esc(x.comment||'')}</div></div>`).join('')
    : '<p class="muted" style="padding:8px 0">Sem comentários no período.</p>';
}
window.npsAddModal=()=>{
  modal(`<div class="m-head"><h3>Registrar resposta NPS</h3><button data-modal-close>✕</button></div>
    <div class="m-body">
      <label class="lbl">Nota (0 a 10)</label>
      <input id="npsScore" class="in" type="number" min="0" max="10" inputmode="numeric" placeholder="0-10">
      <label class="lbl" style="margin-top:8px">Cliente (opcional)</label>
      <input id="npsCust" class="in" list="npsCustList" placeholder="Nome do cliente…"><datalist id="npsCustList"></datalist>
      <label class="lbl" style="margin-top:8px">Comentário (opcional)</label>
      <textarea id="npsComment" class="in" style="height:70px" placeholder="O que o cliente disse…"></textarea>
    </div>
    <div class="m-foot"><button class="btn ghost" data-modal-close>Cancelar</button><button class="btn green" data-onclick="npsSave()">Salvar</button></div>`);
  sb.rpc('pdv_find_customer',{p_q:''}).then(({data})=>{ const dl=$('#npsCustList'); if(dl&&data){ npsCustMap={}; dl.innerHTML=data.map(c=>{ if(c.nome) npsCustMap[c.nome.toLowerCase()]=c.id; return `<option value="${esc(c.nome||'')}">`; }).join(''); } }).catch(()=>{});
};
window.npsSave=async ()=>{
  const score=parseInt($('#npsScore').value,10);
  if(isNaN(score)||score<0||score>10){ toast('Nota deve ser de 0 a 10.',true); return; }
  const cn=$('#npsCust').value.trim(); const cid=cn?npsCustMap[cn.toLowerCase()]:null;
  const { error }=await sb.rpc('erp_nps_submit',{ p_score:score, p_customer:cid||null, p_sale:null, p_delivery:null, p_comment:($('#npsComment').value||null), p_source:'manual' });
  if(error){ toast('Erro: '+error.message,true); return; }
  closeModal(); toast('Resposta registrada ✅'); npsLoad();
};
{ const b=$('#btnNpsLoad'); if(b) b.onclick=npsLoad; }
{ const b=$('#btnNpsAdd'); if(b) b.onclick=npsAddModal; }

// ======================= CLIENTES EM RISCO (CHURN) =======================
async function renderChurn(){
  const dias=parseInt(($('#churnDias')||{}).value||'30',10)||30;
  const fator=parseFloat(($('#churnFator')||{}).value||'1.5')||1.5;
  const body=$('#churnBody'); if(body) body.innerHTML='<tr><td colspan="7" class="muted">Carregando…</td></tr>';
  const { data, error }=await sb.rpc('erp_churn_risk',{ p_dias_min:dias, p_fator:fator, p_store:null });
  if(error){ if(body) body.innerHTML='<tr><td colspan="7" class="muted">Erro: '+esc(error.message)+'</td></tr>'; return; }
  const d=data||{}; const r=d.resumo||{}; const cs=d.clientes||[];
  const st=$('#churnStats'); if(st) st.innerHTML=`
    <div class="stat warn"><div class="k">Clientes em risco</div><div class="v">${r.em_risco||0}</div></div>
    <div class="stat acc"><div class="k">LTV em risco</div><div class="v">${BRL(r.ltv_em_risco||0)}</div></div>`;
  if(!cs.length){ if(body) body.innerHTML='<tr><td colspan="7" class="muted">Ninguém em risco com esses parâmetros 🎉</td></tr>'; return; }
  if(body) body.innerHTML=cs.map(c=>{
    const tel=(c.telefone||'').replace(/\D/g,'');
    const msg=encodeURIComponent('Olá '+(c.nome||'')+'! Sentimos sua falta 🐾 Faz '+(c.dias_sem_comprar||0)+' dias que você não passa aqui — temos novidades e um mimo te esperando.');
    const wa=tel?('https://wa.me/55'+tel+'?text='+msg):'';
    return `<tr>
      <td><b>${esc(c.nome||'—')}</b></td>
      <td class="r">${c.n_compras||0}</td>
      <td class="r">${BRL(c.ltv||0)}</td>
      <td class="r">${c.dias_sem_comprar||0} d</td>
      <td class="r">${c.cadencia_media_dias==null?'—':c.cadencia_media_dias+' d'}</td>
      <td class="r"><b style="color:${(c.atraso_x||0)>=3?'var(--red)':'var(--amber)'}">${c.atraso_x==null?'—':c.atraso_x+'×'}</b></td>
      <td class="r">${wa?`<a class="btn ghost" style="padding:4px 8px" href="${wa}" target="_blank" rel="noopener">📲 Chamar</a>`:'<span class="muted">sem telefone</span>'}</td>
    </tr>`;
  }).join('');
}
{ const b=$('#btnChurnLoad'); if(b) b.onclick=renderChurn; }

// ======================= PREÇOS POR MARGEM-ALVO =======================
let PM_CACHE=[];
async function renderPrecos(){ await pmLoad(); }
async function pmLoad(){
  const margem=parseFloat(($('#pmMargem')||{}).value||'35');
  const cat=(($('#pmCat')||{}).value||'')||null;
  const only=!!(($('#pmOnlyBelow')||{}).checked);
  const body=$('#pmBody'); if(body) body.innerHTML='<tr><td colspan="8" class="muted">Simulando…</td></tr>';
  const { data, error }=await sb.rpc('erp_price_margin_suggest',{ p_margem:margem, p_categoria:cat, p_only_below:only, p_limit:500 });
  if(error){ if(body) body.innerHTML='<tr><td colspan="8" class="muted">Erro: '+esc(error.message)+'</td></tr>'; return; }
  const d=data||{}; const r=d.resumo||{}; PM_CACHE=d.itens||[];
  const st=$('#pmStats'); if(st) st.innerHTML=`
    <div class="stat"><div class="k">Itens</div><div class="v">${r.qtd||0}</div></div>
    <div class="stat acc"><div class="k">Δ total sugerido</div><div class="v">${BRL(r.delta_total||0)}</div></div>
    <div class="stat"><div class="k">Margem-alvo</div><div class="v">${r.margem_alvo||margem}%</div></div>`;
  // popula categorias (uma vez) a partir do resultado
  const catSel=$('#pmCat');
  if(catSel && catSel.options.length<=1 && PM_CACHE.length){
    const cats=[...new Set(PM_CACHE.map(p=>p.categoria).filter(Boolean))].sort();
    catSel.innerHTML='<option value="">Todas categorias</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join('');
  }
  if(!PM_CACHE.length){ if(body) body.innerHTML='<tr><td colspan="8" class="muted">Nenhum item para esta margem.</td></tr>'; return; }
  if(body) body.innerHTML=PM_CACHE.map((p,i)=>`
    <tr>
      <td><input type="checkbox" class="pmChk" data-i="${i}"></td>
      <td>${esc(p.nome||'')}</td>
      <td class="muted">${esc(p.categoria||'')}</td>
      <td class="r">${BRL(p.custo||0)}</td>
      <td class="r">${BRL(p.preco||0)}</td>
      <td class="r">${p.margem_atual==null?'—':p.margem_atual+'%'}</td>
      <td class="r"><b>${BRL(p.preco_sugerido||0)}</b></td>
      <td class="r" style="color:${(p.delta||0)>=0?'var(--green)':'var(--red)'}">${(p.delta||0)>=0?'+':''}${BRL(p.delta||0)}</td>
    </tr>`).join('');
}
async function pmApply(){
  if(!isAdmin()){ toast('Apenas administrador aplica preços.',true); return; }
  const idx=Array.from(document.querySelectorAll('.pmChk:checked')).map(c=>+c.dataset.i);
  const ids=idx.map(i=>PM_CACHE[i]&&PM_CACHE[i].id).filter(Boolean);
  if(!ids.length){ toast('Marque ao menos um item.',true); return; }
  const margem=parseFloat(($('#pmMargem')||{}).value||'35');
  if(!confirm('Aplicar a margem de '+margem+'% a '+ids.length+' produto(s)? Isso altera o preço de venda.')) return;
  const { data, error }=await sb.rpc('erp_price_margin_apply',{ p_ids:ids, p_margem:margem });
  if(error){ toast('Erro: '+error.message,true); return; }
  toast(((data&&data.atualizados)||0)+' preço(s) atualizado(s) ✅');
  try{ if(typeof loadProducts==='function') await loadProducts(); }catch(_e){}
  pmLoad();
}
{ const b=$('#btnPmLoad'); if(b) b.onclick=pmLoad; }
{ const b=$('#btnPmApply'); if(b) b.onclick=pmApply; }
{ const b=$('#pmAll'); if(b) b.onclick=()=>{ const on=b.checked; document.querySelectorAll('.pmChk').forEach(c=>c.checked=on); }; }

// ======================= PROMOÇÕES POR QUANTIDADE (gestão) =======================
let PROMO_ROWS=[];
async function renderPromos(){
  const body=$('#promoBody'); if(body) body.innerHTML='<tr><td colspan="7" class="muted">Carregando…</td></tr>';
  const { data, error }=await sb.rpc('erp_promo_list',{ p_store:null });
  if(error){ if(body) body.innerHTML='<tr><td colspan="7" class="muted">Erro: '+esc(error.message)+'</td></tr>'; return; }
  PROMO_ROWS=data||[];
  if(!PROMO_ROWS.length){ if(body) body.innerHTML='<tr><td colspan="7" class="muted">Nenhuma promoção cadastrada. Toque em “+ Nova promoção”.</td></tr>'; return; }
  if(body) body.innerHTML=PROMO_ROWS.map(r=>{
    const pacote=(r.tipo==='pacote');
    const tipoChip = pacote ? '<span class="chip amber">pacote</span>' : '<span class="chip">por qtd</span>';
    const regra = pacote ? `leve ${(+r.min_qtd||0)} un` : `a partir de ${(+r.min_qtd||0)} un`;
    const precoPromo = pacote ? `${BRL(r.pacote_preco||0)}<div class="muted" style="font-size:11px">o pacote</div>` : BRL(r.preco_unit_promo||0)+'<div class="muted" style="font-size:11px">por un</div>';
    return `
    <tr>
      <td>${esc(r.produto||'')}</td>
      <td>${tipoChip}</td>
      <td class="r">${BRL(r.preco||0)}</td>
      <td class="r">${regra}</td>
      <td class="r"><b>${precoPromo}</b></td>
      <td>${r.ativo?'<span class="chip ok">ativa</span>':'<span class="chip">inativa</span>'}${r.valid_from||r.valid_until?`<br><span class="muted" style="font-size:11px">${r.valid_from?fmtDate(r.valid_from):'agora'} → ${r.valid_until?fmtDate(r.valid_until):'sem fim'}</span>`:''}${r.source==='encalhado'?'<br><span class="chip amber">encalhado</span>':''}</td>
      <td class="r" style="white-space:nowrap">
        <button class="btn ghost sm" data-onclick="promoEdit('${r.id}')">Editar</button>
        <button class="btn ghost sm" data-onclick="promoToggle('${r.id}',${r.ativo?'false':'true'})">${r.ativo?'Desativar':'Ativar'}</button>
        <button class="btn red sm" data-onclick="promoDelete('${r.id}')">Excluir</button>
      </td>
    </tr>`;}).join('');
}
function promoModal(r){
  r=r||{};
  const editing=!!r.id;
  const prods=(DB.products||[]).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
  let selector;
  if(editing){
    const opts=prods.map(p=>`<option value="${p.id}" ${r.product_id===p.id?'selected':''}>${esc(p.name||'')} — ${BRL(p.price||0)}</option>`).join('');
    selector=`<label class="lbl">Produto</label><select id="promoProd" class="in">${opts}</select>`;
  }else{
    const withPromo=new Set((PROMO_ROWS||[]).map(x=>x.product_id));
    const items=prods.map(p=>`<label class="promoItem" data-name="${esc(String(p.name||'').toLowerCase())}" style="display:flex;align-items:center;gap:8px;padding:5px 2px;font-size:13.5px;cursor:pointer">
        <input type="checkbox" class="promoChk" value="${p.id}" data-onchange="promoCountUpd()" style="width:16px;height:16px;accent-color:var(--brand)">
        <span>${esc(p.name||'')} — ${BRL(p.price||0)}${withPromo.has(p.id)?' <span class="muted" style="font-size:11px">(já tem promo — será atualizada)</span>':''}</span></label>`).join('')
      || '<p class="muted" style="padding:8px">Nenhum produto cadastrado.</p>';
    selector=`<div class="head" style="margin-bottom:4px"><label class="lbl" style="margin:0">Produtos (marque um ou mais)</label><span class="grow"></span>
        <button type="button" class="btn ghost sm" data-onclick="promoPickAll(1)">Marcar filtrados</button>
        <button type="button" class="btn ghost sm" data-onclick="promoPickAll(0)">Limpar</button></div>
      <input id="promoSearch" class="in" placeholder="Buscar produto (ex.: sachê)…" data-oninput="promoFilter()" style="margin-bottom:8px">
      <div id="promoList" style="max-height:280px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:6px 10px">${items}</div>
      <div class="muted" id="promoCount" style="font-size:12px;margin-top:6px">0 selecionado(s) — a mesma promoção será aplicada a todos.</div>`;
  }
  const tipo=r.tipo||'unitario';
  const isPack=tipo==='pacote';
  const unitMin=(!isPack&&r.min_qtd)?r.min_qtd:2;
  const unitPreco=(!isPack&&r.preco_unit_promo!=null)?(+r.preco_unit_promo).toFixed(2).replace('.',','):'';
  const packN=(isPack&&r.min_qtd)?r.min_qtd:4;
  const packPreco=(isPack&&r.pacote_preco!=null)?(+r.pacote_preco).toFixed(2).replace('.',','):'';
  modal(`<div class="m-head"><h3>${editing?'Editar':'Nova'} promoção</h3><button data-modal-close>✕</button></div>
    <div class="m-body">
      <label class="lbl">Tipo de promoção</label>
      <select id="promoTipo" class="in" data-onchange="promoTipoChange()">
        <option value="unitario" ${!isPack?'selected':''}>Por quantidade — cada unidade sai mais barata</option>
        <option value="pacote" ${isPack?'selected':''}>Pacote fechado — leve N por R$ Y</option>
      </select>
      <div style="margin-top:12px">${selector}</div>
      <div id="promoGrpUnit" style="display:${isPack?'none':'flex'};gap:8px;margin-top:10px">
        <div style="flex:1"><label class="lbl">A partir de (un)</label><input id="promoMin" class="in" type="number" min="2" step="1" value="${unitMin}"></div>
        <div style="flex:1"><label class="lbl">Preço unitário promo R$</label><input id="promoPreco" class="in" value="${unitPreco}"></div>
      </div>
      <div id="promoGrpPack" style="display:${isPack?'block':'none'};margin-top:10px">
        <div style="display:flex;gap:8px">
          <div style="flex:1"><label class="lbl">Quantidade do pacote (N)</label><input id="promoPackN" class="in" type="number" min="2" step="1" value="${packN}"></div>
          <div style="flex:1"><label class="lbl">Preço do pacote R$ (Y)</label><input id="promoPackPreco" class="in" value="${packPreco}"></div>
        </div>
        <div class="pdv-note" style="margin-top:8px">Leve <b>N</b> unidades por <b>R$ Y</b>. A sobra sai ao preço normal. Ex.: 4 por R$ 10 — comprando 5, os 4 saem a R$ 10 e o 5º ao preço normal; comprando 8, dois pacotes a R$ 10.</div>
      </div>
      <div class="grid2" style="margin-top:10px"><div class="field"><label class="lbl">Início (opcional)</label><input id="promoFrom" class="in" type="date" value="${r.valid_from||''}"></div><div class="field"><label class="lbl">Fim (opcional)</label><input id="promoUntil" class="in" type="date" value="${r.valid_until||''}"></div></div>
      <label class="lbl" style="margin-top:10px;display:flex;align-items:center;gap:6px"><input type="checkbox" id="promoAtivo" ${r.ativo!==false?'checked':''}> Ativa</label>
    </div>
    <div class="m-foot"><button class="btn green" data-onclick="promoSave('${r.id||''}')">Salvar</button><button class="btn ghost" data-modal-close>Cancelar</button></div>`);
}
window.promoTipoChange=()=>{ const t=(($('#promoTipo')||{}).value)||'unitario';
  const u=$('#promoGrpUnit'), p=$('#promoGrpPack');
  if(u) u.style.display=(t==='pacote')?'none':'flex';
  if(p) p.style.display=(t==='pacote')?'block':'none'; };
window.promoFilter=()=>{ const q=(($('#promoSearch')||{}).value||'').trim().toLowerCase();
  $$('#promoList .promoItem').forEach(el=>{ el.style.display=(!q||(el.dataset.name||'').includes(q))?'flex':'none'; }); };
window.promoPickAll=(on)=>{ $$('#promoList .promoItem').forEach(el=>{ if(el.style.display!=='none'){ const c=el.querySelector('.promoChk'); if(c) c.checked=!!on; } }); promoCountUpd(); };
window.promoCountUpd=()=>{ const n=$$('#promoList .promoChk:checked').length; const el=$('#promoCount'); if(el) el.textContent=n+' selecionado(s) — a mesma promoção será aplicada a todos.'; };
window.promoEdit=id=>{ promoModal(PROMO_ROWS.find(x=>x.id===id)); };
window.promoSave=async id=>{
  const tipo=(($('#promoTipo')||{}).value)||'unitario';
  const ativo=!!($('#promoAtivo')||{}).checked;
  let min_qtd, preco_unit_promo=null, pacote_preco=null;
  if(tipo==='pacote'){
    min_qtd=num(($('#promoPackN')||{}).value); pacote_preco=num(($('#promoPackPreco')||{}).value);
    if(!(min_qtd>=2)){ toast('A quantidade do pacote deve ser 2 ou mais.',true); return; }
    if(!(pacote_preco>0)){ toast('Informe o preço do pacote.',true); return; }
  }else{
    min_qtd=num(($('#promoMin')||{}).value); preco_unit_promo=num(($('#promoPreco')||{}).value);
    if(!(min_qtd>=2)){ toast('Quantidade mínima deve ser 2 ou mais.',true); return; }
    if(!(preco_unit_promo>0)){ toast('Informe o preço promocional.',true); return; }
  }
  // produtos-alvo: na edição é o produto único; na criação, todos os marcados
  const ids = id ? [(($('#promoProd')||{}).value||null)].filter(Boolean)
                 : $$('#promoList .promoChk:checked').map(c=>c.value);
  if(!ids.length){ toast(id?'Escolha um produto.':'Marque ao menos um produto.',true); return; }
  const btns=$$('.ov .m-foot .btn'); btns.forEach(b=>b.disabled=true);
  let ok=0, fail=0, lastErr='';
  for(const pid of ids){
    // atualiza a promo existente do produto (evita duplicar); edição usa o próprio id
    const existing = id ? { id } : (PROMO_ROWS||[]).find(x=>x.product_id===pid);
    const p={ id:(existing&&existing.id)||null, product_id:pid, tipo, min_qtd, preco_unit_promo, pacote_preco, ativo,valid_from:$('#promoFrom').value||null,valid_until:$('#promoUntil').value||null };
    const { error }=await sb.rpc('erp_promo_upsert',{ p });
    if(error){ fail++; lastErr=error.message; } else ok++;
  }
  if(fail){ btns.forEach(b=>b.disabled=false); toast('Erro em '+fail+' de '+ids.length+': '+lastErr,true); if(!ok) return; }
  closeModal(); toast(ok>1?ok+' promoções salvas ✅':'Promoção salva ✅'); await loadPromos(); renderPromos();
};
window.promoToggle=async (id,ativo)=>{
  const r=PROMO_ROWS.find(x=>x.id===id); if(!r)return;
  const { error }=await sb.rpc('erp_promo_upsert',{ p:{ id:id, product_id:r.product_id, tipo:r.tipo||'unitario', min_qtd:r.min_qtd, preco_unit_promo:r.preco_unit_promo, pacote_preco:r.pacote_preco, ativo:ativo,valid_from:r.valid_from||null,valid_until:r.valid_until||null } });
  if(error){ toast('Erro: '+error.message,true); return; }
  await loadPromos(); renderPromos();
};
window.promoDelete=async id=>{
  if(!await uiConfirm('Excluir esta promoção?',{danger:true,okText:'Excluir'})) return;
  const { error }=await sb.rpc('erp_promo_delete',{ p_id:id });
  if(error){ toast('Erro: '+error.message,true); return; }
  await loadPromos(); renderPromos();
};
{ const b=$('#btnPromoNew'); if(b) b.onclick=()=>promoModal(); }


// ======================= CAIXA / GAVETA =======================
let CASH = null;
async function refreshCash(render){
  try{ const { data, error } = await sb.rpc('erp_cash_current'); if(error) throw error; CASH = data || null; }
  catch(e){ if(!isNetworkErr(e)) console.warn('refreshCash',e); /* offline: mantém o último estado conhecido */ }
  const chip=$('#cashChip');
  if(chip) chip.innerHTML = CASH ? '<span class="chip ok">💰 Caixa aberto</span>' : '<span class="chip warn">Caixa fechado</span>';
  if(render) renderCash();
  if(typeof fcStatus==='function') fcStatus();
}
async function renderCash(){
  const closed=$('#cashClosed'), open=$('#cashOpen');
  if(!CASH){ closed.classList.remove('hide'); open.classList.add('hide'); return; }
  closed.classList.add('hide'); open.classList.remove('hide');
  const { data:sum } = await sb.rpc('erp_cash_summary',{});
  const s=sum||{};
  $('#cashStats').innerHTML = `
    <div class="stat acc"><div class="k">Esperado na gaveta</div><div class="v">${BRL(s.esperado_gaveta)}</div></div>
    <div class="stat"><div class="k">Abertura</div><div class="v">${BRL(s.abertura)}</div></div>
    <div class="stat"><div class="k">💵 Vendas dinheiro</div><div class="v">${BRL(s.vendas_dinheiro)}</div></div>
    <div class="stat"><div class="k">🧾 Recebido crediário</div><div class="v">${BRL(s.recebido_crediario_total)}</div></div>
    <div class="stat"><div class="k">↧ Suprimentos</div><div class="v">${BRL(s.suprimentos)}</div></div>
    <div class="stat warn"><div class="k">↥ Sangrias</div><div class="v">${BRL(s.sangrias)}</div></div>
    <div class="stat"><div class="k">Vendas na sessão</div><div class="v">${s.vendas_qtd||0}</div></div>`;
  const obs=$('#cashCredObs');
  if(obs) obs.innerHTML = (+s.crediario_qtd>0)
    ? `📌 Observação: <b>${s.crediario_qtd}</b> venda(s) no crediário nesta sessão, somando <b>${BRL(s.crediario_total)}</b> — <span class="muted">não entram na soma do caixa; contam só quando forem pagas.</span>`
    : '';
  const { data:movs } = await sb.from('cash_movements').select('*').eq('session_id',CASH.id).order('created_at',{ascending:false});
  $('#cashMovBody').innerHTML = (movs||[]).map(m=>`
    <tr><td>${new Date(m.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</td>
      <td>${m.tipo==='sangria'?'↥ Sangria':'↧ Suprimento'}</td><td>${esc(m.motivo||'—')}</td>
      <td class="r ${m.tipo==='sangria'?'neg':''}"><b>${BRL(m.valor)}</b></td></tr>`).join('')
    || '<tr><td colspan="4" class="muted" style="text-align:center;padding:16px">Sem movimentações.</td></tr>';
}
window.cashOpen = async ()=>{
  const { error } = await sb.rpc('erp_cash_open',{ p_valor:num($('#cashOpenVal').value) });
  if(error){ toast('Erro: '+error.message,true); return; }
  toast('Caixa aberto'); await refreshCash(true);
};
window.cashShareWhats = async ()=>{
  const { data:sum } = await sb.rpc('erp_cash_summary',{});
  const s=sum||{}; const loja=(STORES.find(x=>x.id===CURRENT_STORE)||{}).nome||(DB.settings.storeName||'Loja');
  const contado=num(($('#cashCountVal')||{}).value||0);
  const dif = contado - (+s.esperado_gaveta||0);
  const L=[`*${DB.settings.storeName||'ONPDV'}* — Resumo do caixa`, `🏪 ${loja} · ${new Date().toLocaleString('pt-BR')}`, '',
    `Abertura: ${BRL(s.abertura)}`,
    `💵 Vendas dinheiro: ${BRL(s.vendas_dinheiro)}`,
    `🧾 Recebido crediário: ${BRL(s.recebido_crediario_total)}`,
    `↧ Suprimentos: ${BRL(s.suprimentos)}`,
    `↥ Sangrias: ${BRL(s.sangrias)}`,
    `🧮 Vendas na sessão: ${s.vendas_qtd||0}`, '',
    `*Esperado na gaveta:* ${BRL(s.esperado_gaveta)}`];
  if(contado>0){ L.push(`Contado: ${BRL(contado)}`, `${dif===0?'✅ Sem diferença':(dif>0?'🔵 Sobra ':'🔴 Falta ')+BRL(Math.abs(dif))}`); }
  window.open('https://api.whatsapp.com/send?text='+encodeURIComponent(L.join('\n')),'_blank');
};
window.cashMove = async (tipo)=>{
  modal(`
    <div class="m-head"><h3>${tipo==='sangria'?'↥ Sangria (retirada)':'↧ Suprimento (entrada)'}</h3><button data-modal-close>×</button></div>
    <div class="m-body">
      <div class="field"><label class="lbl">Valor *</label><input id="cmVal" class="in" inputmode="decimal" value=""></div>
      <div class="field"><label class="lbl">Motivo</label><input id="cmMot" class="in" placeholder="${tipo==='sangria'?'Ex: depósito bancário':'Ex: troco'}"></div>
    </div>
    <div class="m-foot"><button class="btn ghost" data-modal-close>Cancelar</button>
      <button class="btn" data-onclick="doCashMove('${tipo}')">Confirmar</button></div>`);
};
window.doCashMove = async (tipo)=>{
  const v=num($('#cmVal').value); if(!v){ toast('Informe o valor.',true); return; }
  const { error } = await sb.rpc('erp_cash_move',{ p_tipo:tipo, p_valor:v, p_motivo:$('#cmMot').value });
  if(error){ toast('Erro: '+error.message,true); return; }
  closeModal(); toast('Registrado'); renderCash();
};
window.cashClose = async ()=>{
  const contado=num($('#cashCountVal').value);
  const { data, error } = await sb.rpc('erp_cash_close',{ p_valor_contado:contado });
  if(error){ toast('Erro: '+error.message,true); return; }
  const d=data||{}; const dif=+d.diferenca;
  modal(`
    <div class="m-head"><h3>Caixa fechado</h3><button data-modal-close>×</button></div>
    <div class="m-body">
      <div class="sum" style="border-radius:12px">
        <div class="l"><span>Esperado na gaveta</span><b>${BRL(d.esperado_gaveta)}</b></div>
        <div class="l"><span>Contado</span><b>${BRL(d.contado)}</b></div>
        <div class="l big"><span>Diferença</span><b style="color:${dif<0?'#ff9a9a':dif>0?'#7ee2a8':'#fff'}">${BRL(dif)}</b></div>
      </div>
      <div style="background:#f7f9ff;border:1px solid var(--line);border-radius:10px;padding:10px;margin-top:10px">
        <div style="font-weight:700;color:#12307a;margin-bottom:4px">Movimento da sessão</div>
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">Abertura</span><b>${BRL(d.abertura)}</b></div>
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">💵 Dinheiro</span><b>${BRL(d.vendas_dinheiro)}</b></div>
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">📱 PIX</span><b>${BRL(d.vendas_pix)}</b></div>
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">💳 Cartão</span><b>${BRL(d.vendas_cartao)}</b></div>
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">🧾 Recebido crediário</span><b>${BRL(d.recebido_crediario_total)}</b></div>
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">↧ Suprimentos</span><b>${BRL(d.suprimentos)}</b></div>
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">↥ Sangrias</span><b>${BRL(d.sangrias)}</b></div>
      </div>
      <p class="muted" style="margin-top:10px">${dif===0?'✅ Caixa bateu certinho.':dif<0?'⚠️ Falta dinheiro na gaveta.':'ℹ️ Sobra na gaveta.'}</p>
      ${+d.crediario_qtd>0?`<p class="muted" style="margin-top:6px">📌 <b>${d.crediario_qtd}</b> venda(s) no crediário (${BRL(d.crediario_total)}) não entraram no caixa — serão contadas quando pagas.</p>`:''}
      ${+d.recebido_crediario_total>0?`<p class="muted" style="margin-top:2px">🧾 Recebido de crediário nesta sessão: <b>${BRL(d.recebido_crediario_total)}</b> (incluído na gaveta se em dinheiro).</p>`:''}
    </div>
    <div class="m-foot"><button class="btn" data-modal-close>OK</button></div>`);
  await refreshCash(true);
};
{ const b=$('#btnCashHist'); if(b) b.onclick=loadCashHistory; }
async function loadCashHistory(){
  let ini=$('#chIni').value, fim=$('#chFim').value;
  if(!ini||!fim){ const t=new Date(), a=new Date(); a.setDate(a.getDate()-30); ini=a.toISOString().slice(0,10); fim=t.toISOString().slice(0,10); $('#chIni').value=ini; $('#chFim').value=fim; }
  const { data } = await sb.rpc('erp_cash_history',{ p_ini:ini, p_fim:fim, p_store: isAdmin()?($('#storeSel').value||null):null });
  const rows=data||[];
  $('#cashHistBody').innerHTML = rows.length ? rows.map(r=>{
    const s=r.resumo||{}, dif=+r.diferenca;
    return `<tr>
      <td>${r.fechado_em?new Date(r.fechado_em).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—'}</td>
      <td>${esc(r.loja||'—')}</td><td>${esc(r.operador||'—')}</td>
      <td class="r">${BRL(s.vendas_dinheiro)}</td><td class="r">${BRL(s.vendas_pix)}</td><td class="r">${BRL(s.vendas_cartao)}</td>
      <td class="r">${BRL(r.esperado)}</td><td class="r">${BRL(r.contado)}</td>
      <td class="r ${dif<0?'neg':''}"><b>${BRL(dif)}</b></td></tr>`;
  }).join('') : '<tr><td colspan="9" class="muted" style="text-align:center;padding:16px">Nenhum fechamento no período.</td></tr>';
}

// ======================= RELATÓRIO POR PERÍODO =======================
$('#btnReport').onclick = loadReport;
async function fetchCardReport(ini,fim){
  return sb.rpc('erp_payment_profit_report',{p_ini:ini,p_fim:fim,p_store:null});
}
async function loadReport(){
  const ini=$('#repIni').value, fim=$('#repFim').value;
  if(!ini||!fim){ toast('Selecione o período.',true); return; }
  loadConsolidado(ini, fim);
  const [{ data, error }, { data:cashbackMercado, error:cashbackError }, {data:cardReport,error:cardError}] = await Promise.all([
    sb.rpc('erp_report',{ p_ini:ini, p_fim:fim }),
    sb.rpc('erp_cashback_market_total'),
    fetchCardReport(ini,fim)
  ]);
  if(error){ toast('Erro: '+error.message,true); return; }
  if(cashbackError){ toast('Erro ao consultar o cashback: '+cashbackError.message,true); return; }
  if(cardError){ toast('Erro ao consultar vendas por cartão: '+cardError.message,true); return; }
  const r=data||{}; const ticket=r.vendas_qtd>0?r.vendas_total/r.vendas_qtd:0;
  $('#repResumo').innerHTML = `<span class="chip">📅 ${fmtDate(ini)} a ${fmtDate(fim)}</span>
    &nbsp; <b style="font-size:18px">${r.vendas_qtd||0}</b> vendas ·
    <b style="font-size:18px">${BRL(r.vendas_total)}</b> ·
    ticket ${BRL(ticket)} ${r.canceladas_qtd?`· <span class="neg">${r.canceladas_qtd} cancelada(s)</span>`:''}`;
  $('#repDetail').classList.remove('hide');
  const formas=r.por_forma||{}; const lbl={dinheiro:'💵 Dinheiro',pix:'⚡ PIX',cartao:'💳 Cartão',crediario:'🧾 Crediário'};
  $('#repForma').innerHTML = ['dinheiro','pix','cartao','crediario'].map(f=>`
    <div class="stat"><div class="k">${lbl[f]}</div><div class="v">${BRL(formas[f]||0)}</div></div>`).join('')
    +`<div class="stat acc" title="Soma dos saldos válidos disponíveis para todos os clientes neste momento">
      <div class="k">🎁 Cashback no mercado</div><div class="v">${BRL(cashbackMercado||0)}</div>
      <div style="font-size:11px;margin-top:3px;opacity:.8">saldo atual dos clientes</div></div>`;
  $('#repOper').innerHTML = (r.por_operador||[]).map(o=>`
    <tr><td><b>${esc(o.operador)}</b></td><td class="r">${o.qtd}</td><td class="r"><b>${BRL(o.total)}</b></td></tr>`).join('')
    || '<tr><td colspan="3" class="muted" style="text-align:center;padding:14px">—</td></tr>';
  $('#repTop').innerHTML = (r.top_produtos||[]).map(p=>`
    <tr><td>${esc(p.nome)}</td><td class="r">${(+p.qtd).toLocaleString('pt-BR')}</td><td class="r"><b>${BRL(p.total)}</b></td></tr>`).join('')
    || '<tr><td colspan="3" class="muted" style="text-align:center;padding:14px">—</td></tr>';
  const cr=cardReport||{}, vendas=Array.isArray(cr.payments)?cr.payments:[];window.PAYMENT_PROFIT=vendas;
  $('#repCardResumo').innerHTML=`<b>${cr.qtd||0}</b> pagamento(s) · bruto <b>${BRL(cr.gross||0)}</b> · taxas ${BRL(cr.fees||0)} · líquido <b>${BRL(cr.net||0)}</b> · lucro <b>${BRL(cr.profit||0)}</b>${cr.unconfigured?` · <span class="neg">${cr.unconfigured} sem taxa configurada</span>`:''}`;
  $('#repCardBandeiras').innerHTML=(cr.por_metodo||[]).map(x=>`<div class="stat"><div class="k">${esc(String(x.metodo||'').toUpperCase())}</div><div class="v">${BRL(x.net||0)}</div><div style="font-size:11px;margin-top:3px;opacity:.8">bruto ${BRL(x.gross||0)} · taxas ${BRL(x.fees||0)} · lucro ${BRL(x.profit||0)}</div></div>`).join('');
  $('#repCardBody').innerHTML=vendas.map(x=>{const card=['cartao','debito','credito'].includes(x.metodo);return `<tr><td>${fmtDT(x.created_at)}</td><td><b>#${esc(x.numero||'')}</b><br><span class="muted">${esc(x.store||'')}</span></td><td>${esc(String(x.metodo||'').toUpperCase())}${x.installments>1?`<br><span class="muted">${x.installments}x</span>`:''}</td><td>${esc(x.bandeira||'—')}<br><span class="muted">${esc(x.provider||'')}</span></td><td>${esc(x.terminal||'Manual')}<br><span class="muted">${esc([x.nsu,x.autorizacao].filter(Boolean).join(' / ')||'')}</span></td><td class="r"><b>${BRL(x.gross||0)}</b></td><td class="r ${!x.configured&&card?'neg':''}">${BRL(x.actual_fee==null?x.expected_fee:x.actual_fee)}${!x.configured&&card?'<br><span class="muted">não configurada</span>':''}</td><td class="r">${BRL(x.anticipation_fee||0)}</td><td class="r"><b>${BRL(x.actual_net==null?x.expected_net:x.actual_net)}</b></td><td>${x.actual_date?`<span class="chip ok">depositado ${fmtDate(x.actual_date)}</span>`:`<span class="chip amber">previsto ${fmtDate(x.expected_date)}</span>`}</td><td class="r ${+x.difference<0?'neg':''}">${x.difference==null?'—':BRL(x.difference)}</td><td class="r">${BRL(x.allocated_cost||0)}</td><td class="r ${+x.profit<0?'neg':''}"><b>${BRL(x.profit||0)}</b></td><td>${card&&x.actual_net==null?`<button class="btn ghost sm" data-onclick="paymentSettlement('${x.payment_id}')">Registrar depósito</button>`:''}</td></tr>`;}).join('')
    ||'<tr><td colspan="14" class="muted" style="text-align:center;padding:16px">Nenhum pagamento no período.</td></tr>';
}

{const b=$('#btnFeeRules');if(b)b.onclick=feeRulesModal;}
let FEE_RULES=[];
async function feeRulesModal(){
  const {data,error}=await sb.rpc('erp_payment_fee_rules_list');if(error){toast('Erro: '+error.message,true);return;}FEE_RULES=data||[];
  modal(`<div class="m-head"><h3>⚙️ Taxas e prazos por meio de pagamento</h3><button data-modal-close>✕</button></div><div class="m-body">
    <div class="pdv-note" style="margin-bottom:10px">Cadastre exatamente as taxas contratadas. Regras específicas de loja, operadora e bandeira têm prioridade sobre “qualquer”.</div>
    <button class="btn" data-onclick="feeRuleForm()">+ Nova regra</button><div class="tbl-wrap" style="margin-top:10px"><table><thead><tr><th>Meio</th><th>Operadora / bandeira</th><th>Parcelas</th><th class="r">Taxa</th><th class="r">Antecipação</th><th>Recebe em</th><th>Vigência</th><th></th></tr></thead><tbody>
    ${FEE_RULES.map(r=>`<tr><td><b>${esc(r.metodo)}</b>${r.store_name?`<br><span class="muted">${esc(r.store_name)}</span>`:''}</td><td>${esc(r.provider)} / ${esc(r.bandeira)}</td><td>${r.parcelas_min}–${r.parcelas_max}x</td><td class="r">${fmtNum(r.fee_pct)}%${+r.fixed_fee?` + ${BRL(r.fixed_fee)}`:''}</td><td class="r">${fmtNum(r.anticipation_pct)}%</td><td>${r.settlement_days} dia(s)</td><td>${fmtDate(r.valid_from)}${r.valid_until?' a '+fmtDate(r.valid_until):''}</td><td><button class="btn ghost sm" data-onclick="feeRuleForm('${r.id}')">Editar</button> <button class="btn ghost sm red" data-onclick="feeRuleDelete('${r.id}')">Excluir</button></td></tr>`).join('')||'<tr><td colspan="8" class="muted">Nenhuma taxa configurada.</td></tr>'}
    </tbody></table></div></div><div class="m-foot"><button class="btn" data-modal-close>Fechar</button></div>`);
}
window.feeRuleForm=id=>{
  const r=FEE_RULES.find(x=>x.id===id)||{};const storeOpt='<option value="">Todas as lojas</option>'+STORES.map(s=>`<option value="${s.id}" ${r.store_id===s.id?'selected':''}>${esc(s.nome)}</option>`).join('');
  modal(`<div class="m-head"><h3>${id?'Editar':'Nova'} regra de taxa</h3><button data-modal-close>✕</button></div><div class="m-body">
    <div class="grid2"><div class="field"><label class="lbl">Loja</label><select id="frStore" class="in">${storeOpt}</select></div><div class="field"><label class="lbl">Meio</label><select id="frMethod" class="in">${['dinheiro','pix','debito','credito','cartao'].map(x=>`<option ${r.metodo===x?'selected':''}>${x}</option>`).join('')}</select></div></div>
    <div class="grid2"><div class="field"><label class="lbl">Operadora</label><input id="frProvider" class="in" value="${esc(r.provider||'qualquer')}"></div><div class="field"><label class="lbl">Bandeira</label><input id="frBrand" class="in" value="${esc(r.bandeira||'qualquer')}"></div></div>
    <div class="grid2"><div class="field"><label class="lbl">Parcelas mín./máx.</label><div style="display:flex;gap:6px"><input id="frMin" class="in" value="${r.parcelas_min||1}"><input id="frMax" class="in" value="${r.parcelas_max||1}"></div></div><div class="field"><label class="lbl">Recebimento em dias</label><input id="frDays" class="in" value="${r.settlement_days||0}"></div></div>
    <div class="grid2"><div class="field"><label class="lbl">Taxa % / fixa R$</label><div style="display:flex;gap:6px"><input id="frFee" class="in" value="${r.fee_pct||0}"><input id="frFixed" class="in" value="${r.fixed_fee||0}"></div></div><div class="field"><label class="lbl">Antecipação %</label><input id="frAnt" class="in" value="${r.anticipation_pct||0}"></div></div>
    <div class="grid2"><div class="field"><label class="lbl">Válida desde</label><input id="frFrom" type="date" class="in" value="${r.valid_from||hojeISO()}"></div><div class="field"><label class="lbl">Até (opcional)</label><input id="frUntil" type="date" class="in" value="${r.valid_until||''}"></div></div>
    </div><div class="m-foot"><button class="btn ghost" data-onclick="feeRulesModal()">Voltar</button><button class="btn green" data-onclick="feeRuleSave('${id||''}')">Salvar</button></div>`);
};
window.feeRuleSave=async id=>{const p={id:id||null,store_id:$('#frStore').value||null,metodo:$('#frMethod').value,provider:$('#frProvider').value.trim()||'qualquer',bandeira:$('#frBrand').value.trim()||'qualquer',parcelas_min:parseInt($('#frMin').value)||1,parcelas_max:parseInt($('#frMax').value)||1,settlement_days:parseInt($('#frDays').value)||0,fee_pct:num($('#frFee').value)||0,fixed_fee:num($('#frFixed').value)||0,anticipation_pct:num($('#frAnt').value)||0,valid_from:$('#frFrom').value,valid_until:$('#frUntil').value||null,active:true};const {error}=await sb.rpc('erp_payment_fee_rule_upsert',{p});if(error){toast('Erro: '+error.message,true);return;}toast('Regra salva ✅');feeRulesModal();};
window.feeRuleDelete=async id=>{if(!await uiConfirm('Excluir esta regra de taxa?',{danger:true,okText:'Excluir'}))return;const {error}=await sb.rpc('erp_payment_fee_rule_delete',{p_id:id});if(error){toast('Erro: '+error.message,true);return;}feeRulesModal();};
window.paymentSettlement=id=>{const p=(window.PAYMENT_PROFIT||[]).find(x=>x.payment_id===id);if(!p)return;modal(`<div class="m-head"><h3>Registrar depósito · venda #${esc(p.numero||'')}</h3><button data-modal-close>✕</button></div><div class="m-body"><p class="muted">Use o valor efetivamente creditado no banco/adquirente.</p><div class="grid2"><div class="field"><label class="lbl">Data do depósito</label><input id="psDate" type="date" class="in" value="${hojeISO()}"></div><div class="field"><label class="lbl">Bruto</label><input id="psGross" class="in" value="${p.gross}"></div></div><div class="grid2"><div class="field"><label class="lbl">Taxas cobradas</label><input id="psFee" class="in" value="${p.expected_fee||0}"></div><div class="field"><label class="lbl">Líquido depositado</label><input id="psNet" class="in" value="${p.expected_net||p.gross}"></div></div><div class="field"><label class="lbl">Observação</label><input id="psNotes" class="in"></div></div><div class="m-foot"><button class="btn ghost" data-modal-close>Cancelar</button><button class="btn green" data-onclick="paymentSettlementSave('${id}')">Salvar depósito</button></div>`);};
window.paymentSettlementSave=async id=>{const {error}=await sb.rpc('erp_payment_settlement_record',{p_payment:id,p_date:$('#psDate').value,p_gross:num($('#psGross').value)||0,p_fee:num($('#psFee').value)||0,p_net:num($('#psNet').value)||0,p_notes:$('#psNotes').value||null});if(error){toast('Erro: '+error.message,true);return;}closeModal();toast('Depósito conciliado ✅');loadReport();};

// ======================= PRODUTOS ENCALHADOS =======================
async function loadStaleStock(){
  const st=$('#staleStore');if(st&&!st.options.length)st.innerHTML=STORES.map(s=>`<option value="${s.id}" ${s.id===CURRENT_STORE?'selected':''}>${esc(s.nome)}</option>`).join('');
  const store=(st&&st.value)||CURRENT_STORE,days=parseInt(($('#staleDays')||{}).value)||60;
  const {data,error}=await sb.rpc('erp_stale_stock',{p_store:store,p_days:days});
  if(error){toast('Erro: '+error.message,true);return;}const r=data||{},items=r.items||[];window.STALE_ITEMS=items;
  $('#staleStats').innerHTML=`<div class="stat ${items.length?'warn':'acc'}"><div class="k">Produtos encalhados</div><div class="v">${r.count||0}</div></div><div class="stat"><div class="k">Capital parado</div><div class="v">${BRL(r.capital||0)}</div></div><div class="stat"><div class="k">Já estão em promoção</div><div class="v">${items.filter(x=>x.has_promo).length}</div></div>`;
  const chip={critica:'warn',alta:'amber',media:''};
  $('#staleBody').innerHTML=items.map(x=>`<tr><td><b>${esc(x.nome)}</b><br><span class="muted">${esc(x.sku||'')} · ${esc(x.categoria||'')}</span></td><td>${x.last_sale?fmtDate(x.last_sale):'<span class="neg">nunca vendido</span>'}</td><td class="r"><b>${x.idle_days}</b></td><td class="r">${fmtNum(x.saldo)}</td><td class="r"><b>${BRL(x.capital_tied)}</b></td><td class="r">${BRL(x.preco)}</td><td class="r"><b>${BRL(x.suggested_price)}</b><br><span class="muted">${+x.suggested_price<+x.preco?'-'+fmtNum(x.discount_pct)+'%':'sem margem'}</span></td><td><span class="chip ${chip[x.priority]||''}">${esc(x.priority)}</span>${x.has_promo?'<br><span class="chip ok">promo ativa</span>':''}</td><td>${+x.suggested_price<+x.preco?`<button class="btn sm" data-onclick="stalePromote('${x.id}',${x.discount_pct})">Criar promoção</button>`:'<span class="muted">revisar custo/preço</span>'}</td></tr>`).join('')||'<tr><td colspan="9" class="muted" style="text-align:center;padding:18px">Nenhum produto encalhado neste critério. 🎉</td></tr>';
}
{const b=$('#btnStaleLoad');if(b)b.onclick=loadStaleStock;}
window.stalePromote=async(id,discount)=>{const x=(window.STALE_ITEMS||[]).find(y=>y.id===id);if(!await uiConfirm(`Criar promoção de ${discount}% para ${x?x.nome:'este produto'} por 14 dias? O sistema preservará ao menos 10% sobre o custo.`,{okText:'Criar promoção',cancelText:'Voltar'}))return;const store=$('#staleStore').value||CURRENT_STORE;const {error}=await sb.rpc('erp_stale_promotion_create',{p_product:id,p_store:store,p_discount:discount,p_days:14});if(error){toast('Erro: '+error.message,true);return;}toast('Promoção criada e enviada ao PDV ✅');await loadPromos();loadStaleStock();};

// ======================= PREVENÇÃO DE PERDAS =======================
async function loadLossPrevention(){
  if(!isAdmin())return;const ini=$('#lossIni'),fim=$('#lossFim');if(ini&&!ini.value){const d=new Date();d.setDate(d.getDate()-30);setDates('lossIni','lossFim',d.toISOString().slice(0,10),hojeISO());}
  const st=$('#lossStore');if(st&&!st.options.length)st.innerHTML='<option value="">Todas as lojas</option>'+STORES.map(s=>`<option value="${s.id}">${esc(s.nome)}</option>`).join('');
  const {data,error}=await sb.rpc('erp_loss_prevention',{p_ini:ini.value,p_fim:fim.value,p_store:st.value||null,p_discount_pct:num($('#lossDiscount').value)||15});
  if(error){toast('Erro: '+error.message,true);return;}const r=data||{},s=r.summary||{},alerts=r.alerts||[];
  $('#lossStats').innerHTML=`<div class="stat ${s.critical?'warn':''}"><div class="k">Críticos em aberto</div><div class="v">${s.critical||0}</div></div><div class="stat"><div class="k">Alertas em aberto</div><div class="v">${s.open||0}</div></div><div class="stat"><div class="k">Valor sob atenção</div><div class="v">${BRL(s.amount||0)}</div></div><div class="stat acc"><div class="k">Já revisados</div><div class="v">${s.reviewed||0}</div></div>`;
  $('#lossOperatorBody').innerHTML=(r.operators||[]).map(o=>`<tr><td><b>${esc(o.operator_name||'Sistema')}</b></td><td>${esc(o.store_name||'—')}</td><td class="r">${o.total_sales||0}</td><td class="r ${+o.cancellations?'neg':''}">${o.cancellations||0}</td><td class="r">${BRL(o.cancellation_value||0)}</td><td class="r">${BRL(o.discount_value||0)}</td></tr>`).join('')||'<tr><td colspan="6" class="muted">Sem dados no período.</td></tr>';
  const sev={critica:'warn',alta:'amber',media:''},type={desconto:'Desconto',cancelamento:'Cancelamento',devolucao:'Devolução',divergencia_caixa:'Caixa',ajuste_estoque:'Estoque'};
  $('#lossBody').innerHTML=alerts.map(a=>`<tr><td>${fmtDT(a.occurred_at)}</td><td><span class="chip ${sev[a.severity]||''}">${esc(a.severity)}</span></td><td>${esc(type[a.type]||a.type)}</td><td><b>${esc(a.operator_name||'Sistema')}</b><br><span class="muted">${esc(a.store_name||'—')}</span></td><td>${esc(a.description||'')}</td><td class="r">${a.amount==null?'—':BRL(a.amount)}</td><td><span class="chip ${a.review_status==='open'?'warn':'ok'}">${a.review_status==='open'?'em aberto':'revisado'}</span></td><td>${a.review_status==='open'?`<button class="btn green sm" data-onclick="lossReview('${a.alert_key}')">Revisar</button>`:`<button class="btn ghost sm" data-onclick="lossReopen('${a.alert_key}')">Reabrir</button>`}</td></tr>`).join('')||'<tr><td colspan="8" class="muted" style="text-align:center;padding:18px">Nenhum alerta encontrado. ✅</td></tr>';
}
{const b=$('#btnLossLoad');if(b)b.onclick=loadLossPrevention;}
window.lossReview=async key=>{const notes=await uiPrompt('Observação da revisão (opcional):','',{okText:'Marcar revisado'});if(notes===null)return;const {error}=await sb.rpc('erp_loss_alert_review',{p_key:key,p_status:'reviewed',p_notes:notes||null});if(error){toast('Erro: '+error.message,true);return;}toast('Alerta revisado ✅');loadLossPrevention();};
window.lossReopen=async key=>{const {error}=await sb.rpc('erp_loss_alert_review',{p_key:key,p_status:'open',p_notes:null});if(error){toast('Erro: '+error.message,true);return;}loadLossPrevention();};

// ======================= ESTORNO / CANCELAMENTO =======================
window.voidSale = async (saleId, forma, numero)=>{
  if(forma==='cartao'){
    if(!await uiConfirm('Estornar a venda #'+numero+' na maquininha? O valor sai do caixa e o estoque volta.',{danger:true,okText:'Estornar'})) return;
    const { data:sale } = await sb.from('sales').select('total, payments(terminal_id)').eq('id',saleId).single();
    const { data:req, error } = await sb.rpc('erp_pos_void',{ p_sale:saleId });
    if(error){ toast('Erro: '+error.message,true); return; }
    const total=sale?.total||0;
    await posFlow(saleId, numero, total, req.terminal_id, 'estorno', 1);
  } else {
    if(!await uiConfirm('Cancelar a venda #'+numero+'?\n\n• O estoque volta para a loja\n• O valor sai do caixa (nunca fica com a loja)\n• Parcelas do crediário são canceladas',{danger:true,okText:'Cancelar venda',cancelText:'Voltar'})) return;
    const { data, error } = await sb.rpc('erp_cancel_sale',{ p_sale:saleId, p_motivo:'Cancelamento manual' });
    if(error){ toast('Erro: '+error.message,true); return; }
    const est=+(data&&data.estornado)||0;
    toast('Venda #'+numero+' cancelada'+(est>0?' · '+BRL(est)+' saiu do caixa':''));
    closeModal();
    await loadProducts();
    if(typeof refreshCash==='function') refreshCash(currentPage==='gaveta');
    if(typeof loadDash==='function') loadDash();
    if(currentPage==='pedidos') loadOrders();
    if(currentPage==='home') loadHome();
  }
  const { data:nf } = await sb.from('fiscal_documents').select('ref,modelo').eq('sale_id',saleId).eq('status','autorizado').maybeSingle();
  if(nf && await uiConfirm('Esta venda tem uma '+(nf.modelo==='55'?'NF-e':'NFC-e')+' autorizada. Deseja cancelá-la na SEFAZ também?',{okText:'Sim, cancelar na SEFAZ',cancelText:'Não'})){
    cancelNfe(nf.ref);
  }
};
window.cancelNfe = async (ref)=>{
  const just = await uiPrompt('Justificativa do cancelamento (mínimo 15 caracteres):','Cancelamento a pedido do emitente',{okText:'Cancelar na SEFAZ'});
  if(just===null) return;
  if(just.trim().length<15){ toast('Justificativa muito curta (mín. 15 caracteres).',true); return; }
  toast('Cancelando na SEFAZ…');
  try{
    const { data:{ session } } = await sb.auth.getSession();
    const r = await fetch(`${SUPABASE_URL}/functions/v1/fiscal-cancel`,{ method:'POST',
      headers:{ 'Authorization':`Bearer ${session.access_token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ ref, justificativa: just.trim() }) });
    const j = await r.json();
    if(j.error || !j.ok) throw new Error(j.error || 'A SEFAZ não confirmou o cancelamento');
    toast('NF-e cancelada'); loadOrders();
  }catch(e){ toast('Erro: '+(e.message||e),true); }
};

// ======================= RECIBO TÉRMICO 80mm =======================
window.printReceipt = async (saleId)=>{
  const { data:sale } = await sb.from('sales')
    .select('numero, created_at, subtotal, desconto, total, forma_pagamento, obs, customers(nome), sale_items(descricao, qtd, preco_unit, subtotal), payments(metodo, parcelas, bandeira, nsu)')
    .eq('id',saleId).single();
  if(!sale){ toast('Venda não encontrada',true); return; }
  const co=COMPANY||{}; const pay=(sale.payments||[])[0]||{};
  const formaLbl={dinheiro:'Dinheiro',pix:'PIX',cartao:'Cartão'+(pay.bandeira?' '+pay.bandeira:'')+(pay.parcelas>1?` ${pay.parcelas}x`:''),crediario:'Crediário'}[sale.forma_pagamento]||sale.forma_pagamento;
  $('#receiptPrint').innerHTML = `
    <h3>${esc(co.nome||'Minha Loja')}</h3>
    ${co.cnpj?`<div class="c">CNPJ: ${esc(co.cnpj)}</div>`:''}
    ${co.endereco?`<div class="c">${esc(co.endereco)}</div>`:''}
    ${co.telefone?`<div class="c">${esc(co.telefone)}</div>`:''}
    <div class="ln"></div>
    <div class="row"><span>VENDA #${sale.numero}</span><span>${new Date(sale.created_at).toLocaleString('pt-BR')}</span></div>
    ${sale.customers?.nome?`<div>Cliente: ${esc(sale.customers.nome)}</div>`:''}
    <div class="ln"></div>
    <table>${(sale.sale_items||[]).map(i=>`
      <tr><td>${esc(i.descricao)}</td></tr>
      <tr><td class="row"><span>${(+i.qtd).toLocaleString('pt-BR')} x ${BRL(i.preco_unit)}</span><span>${BRL(i.subtotal)}</span></td></tr>`).join('')}</table>
    <div class="ln"></div>
    <div class="row"><span>Subtotal</span><span>${BRL(sale.subtotal)}</span></div>
    ${+sale.desconto?`<div class="row"><span>Desconto</span><span>-${BRL(sale.desconto)}</span></div>`:''}
    <div class="row b" style="font-size:14px"><span>TOTAL</span><span>${BRL(sale.total)}</span></div>
    <div class="row"><span>Pagamento</span><span>${esc(formaLbl)}</span></div>
    ${pay.nsu?`<div class="row"><span>NSU</span><span>${esc(pay.nsu)}</span></div>`:''}
    <div class="ln"></div>
    <div class="c">${esc(co.rodape||'Obrigado pela preferência!')}</div>
    <div class="c" style="margin-top:6px;font-size:10px">ONPDV</div>`;
  // ajusta a largura do recibo à bobina escolhida nesta máquina (80 ou 58 mm)
  try{ document.documentElement.style.setProperty('--rc-w', paperDims().content); }catch(e){}
  window.print();
};

// ======================= PEDIDOS =======================
$('#btnOrders').onclick = loadOrders;
{ const i=$('#ordIni'), f=$('#ordFim'); if(i&&f&&!i.value){ const m=mesAtualISO(); i.value=m.ini; f.value=m.fim; } }
async function loadOrders(){
  fillStoreSelect('ordStore','Todas as lojas');
  const ini=($('#ordIni')||{}).value, fim=($('#ordFim')||{}).value, loja=($('#ordStore')||{}).value;
  let q = sb.from('sales')
    .select('id, numero, created_at, tipo_doc, forma_pagamento, total, status, store_id, stores(nome), customers(nome), fiscal_documents(modelo,status,danfe_url,ref)')
    .order('created_at',{ascending:false}).limit(500);
  const tipo=$('#ordTipo').value, st=$('#ordStatus').value, term=($('#ordSearch').value||'').trim();
  if(tipo) q=q.eq('tipo_doc',tipo);
  if(st) q=q.eq('status',st);
  if(loja) q=q.eq('store_id',loja);
  if(ini) q=q.gte('created_at', ini+'T00:00:00');
  if(fim) q=q.lte('created_at', fim+'T23:59:59');
  if(term && /^\d+$/.test(term)) q=q.eq('numero',parseInt(term));
  const { data, error } = await q;
  if(error){ toast('Erro: '+error.message,true); return; }
  let rows = data||[];
  if(term && !/^\d+$/.test(term)) rows = rows.filter(r=>(r.customers?.nome||'').toLowerCase().includes(term.toLowerCase()));
  const validas = rows.filter(r=>r.status!=='cancelada' && r.tipo_doc!=='orcamento');
  const tot = validas.reduce((a,r)=>a+ +r.total,0);
  const canc = rows.filter(r=>r.status==='cancelada');
  const totCanc = canc.reduce((a,r)=>a+ +r.total,0);
  $('#ordResumo').innerHTML = `<span class="chip">${rows.length} documento(s)</span> &nbsp; faturado <b>${BRL(tot)}</b>`
    + (canc.length?` &nbsp; <span class="chip warn">${canc.length} cancelado(s) · ${BRL(totCanc)} fora do caixa</span>`:'');
  $('#ordBody').innerHTML = rows.map(r=>{
    const nf=(r.fiscal_documents||[]).find(f=>f.status==='autorizado') || (r.fiscal_documents||[])[0];
    const notaCell = nf ? (nf.status==='autorizado'
        ? `<a class="chip ok" href="${nf.danfe_url||'#'}" target="_blank" data-onclick="event.stopPropagation()">${nf.modelo==='55'?'NF-e':'NFC-e'} ✓</a>`
        : `<span class="chip amber">${esc(nf.status)}</span>`) : '<span class="muted">—</span>';
    const statusChip = { paga:'<span class="chip ok">paga</span>', aberta:'<span class="chip amber">aberta</span>',
      orcamento:'<span class="chip">orçamento</span>', cancelada:'<span class="chip warn">cancelada</span>' }[r.status]||r.status;
    let acoes = `<button class="btn ghost sm" data-onclick="printReceipt('${r.id}')" title="Imprimir">🧾</button>`;
    if(r.tipo_doc==='orcamento' && r.status!=='cancelada'){ acoes += `<button class="btn green sm" data-onclick="convertOrc('${r.id}',${r.numero})">Converter</button>`; }
    if(r.status!=='cancelada' && r.tipo_doc!=='orcamento'){
      acoes += `<button class="btn ghost sm" data-onclick="emitNota('${r.id}','65')">NFC-e</button>`;
      acoes += `<button class="btn ghost sm" data-onclick="emitNota('${r.id}','55')">NF-e</button>`;
    }
    if(r.status!=='cancelada'){
      acoes += `<button class="btn ghost sm red" data-onclick="voidSale('${r.id}','${r.forma_pagamento}',${r.numero})">${r.forma_pagamento==='cartao'?'Estornar':'Cancelar'}</button>`;
    }
    const nfAut=(r.fiscal_documents||[]).find(f=>f.status==='autorizado');
    if(nfAut){ acoes += `<button class="btn ghost sm red" data-onclick="cancelNfe('${nfAut.ref}')">✖ ${nfAut.modelo==='55'?'NF-e':'NFC-e'}</button>`; }
    return `<tr class="clickrow ${r.status==='cancelada'?'low':''}" data-onclick="orderDetail('${r.id}')">
      <td><b>#${r.numero}</b></td>
      <td>${fmtDT(r.created_at)}</td>
      <td>${esc(r.stores?.nome||'—')}</td>
      <td>${esc(r.customers?.nome||'Consumidor')}</td>
      <td>${esc(r.forma_pagamento)}</td>
      <td>${statusChip}</td>
      <td>${notaCell}</td>
      <td class="r"><b>${BRL(r.total)}</b></td>
      <td class="r" data-onclick="event.stopPropagation()"><div class="row-actions">${acoes}</div></td>
    </tr>`;
  }).join('') || '<tr><td colspan="9" class="muted" style="text-align:center;padding:20px">Nenhum documento no período.</td></tr>';
}
{ ['ordTipo','ordStatus','ordStore','ordIni','ordFim'].forEach(id=>{ const el=$('#'+id); if(el) el.onchange=loadOrders; });
  const sc=$('#ordSearch'); if(sc) sc.onkeydown=e=>{ if(e.key==='Enter') loadOrders(); }; }

window.orderDetail = async (saleId)=>{
  const { data:s } = await sb.from('sales')
    .select('id,numero,created_at,total,subtotal,desconto,acrescimo,forma_pagamento,status,tipo_doc,obs,stores(nome),customers(nome,telefone,documento),sale_items(descricao,qtd,preco_unit,subtotal),payments(metodo,valor,status,parcelas,bandeira)')
    .eq('id',saleId).maybeSingle();
  if(!s){ toast('Pedido não encontrado.',true); return; }
  const itens=(s.sale_items||[]).map(i=>`<tr><td>${esc(i.descricao)}</td><td class="r">${(+i.qtd).toLocaleString('pt-BR')}</td>
      <td class="r">${BRL(i.preco_unit)}</td><td class="r"><b>${BRL(i.subtotal)}</b></td></tr>`).join('');
  const pags=(s.payments||[]).filter(p=>p.status!=='cancelado').map(p=>`<div class="l" style="display:flex;justify-content:space-between">
      <span class="muted">${esc(p.metodo)}${p.bandeira?' · '+esc(p.bandeira):''}${p.parcelas>1?' '+p.parcelas+'x':''}</span><b>${BRL(p.valor)}</b></div>`).join('')
      || '<div class="muted">Sem pagamentos lançados.</div>';
  const canc = s.status==='cancelada';
  modal(`<div class="m-head"><h3>Pedido #${s.numero} ${canc?'<span class="chip warn">cancelado</span>':''}</h3><button data-modal-close>✕</button></div>
    <div class="m-body">
      <p style="font-family:Fredoka;font-size:19px;margin:0"><b>${esc(s.customers?.nome||'Consumidor')}</b>
        <span class="muted" style="font-size:13px">${esc(s.customers?.telefone||'')}</span></p>
      <p class="muted" style="margin:2px 0">${esc(s.stores?.nome||'—')} · ${fmtDT(s.created_at)} · ${esc(s.tipo_doc||'venda')}</p>
      ${s.obs?`<p class="muted">Obs: ${esc(s.obs)}</p>`:''}
      <div class="tbl-wrap" style="margin-top:8px"><table>
        <thead><tr><th>Item</th><th class="r">Qtd</th><th class="r">Unit.</th><th class="r">Total</th></tr></thead>
        <tbody>${itens||'<tr><td colspan="4" class="muted">Sem itens.</td></tr>'}</tbody></table></div>
      <div class="sum" style="border-radius:12px;margin-top:8px">
        <div class="l"><span>Subtotal</span><b>${BRL(s.subtotal)}</b></div>
        ${+s.desconto?`<div class="l"><span>Desconto</span><b>-${BRL(s.desconto)}</b></div>`:''}
        ${+s.acrescimo?`<div class="l"><span>Acréscimo</span><b>${BRL(s.acrescimo)}</b></div>`:''}
        <div class="l big"><span>Total</span><b>${BRL(s.total)}</b></div>
      </div>
      <div style="background:#f7f9ff;border:1px solid var(--line);border-radius:10px;padding:10px;margin-top:10px">
        <div style="font-weight:700;color:#12307a;margin-bottom:4px">Pagamentos</div>${pags}</div>
      ${canc?'<p class="muted" style="margin-top:8px">⚠️ Pedido cancelado: o valor foi estornado e não conta no caixa nem no relatório.</p>':''}
    </div>
    <div class="m-foot">
      <button class="btn ghost" data-onclick="printReceipt('${s.id}')">🖨️ Imprimir</button>
      ${canc?'':`<button class="btn ghost" data-onclick="emitNota('${s.id}','65')">NFC-e</button>
      <button class="btn ghost" data-onclick="emitNota('${s.id}','55')">NF-e</button>
      <button class="btn red" data-onclick="voidSale('${s.id}','${s.forma_pagamento}',${s.numero})">Cancelar pedido</button>`}
      <button class="btn" data-modal-close>Fechar</button></div>`);
};

window.convertOrc = async (id, num)=>{
  if(!await uiConfirm('Converter o orçamento #'+num+' em venda? O estoque será baixado.',{okText:'Converter'})) return;
  const { error } = await sb.rpc('erp_convert_orcamento',{ p_sale:id });
  if(error){ toast('Erro: '+error.message,true); return; }
  toast('Orçamento convertido em venda'); loadProducts(); loadOrders();
};

// ======================= NOTA FISCAL =======================
window.emitNota = async (saleId, modelo)=>{
  const nomeMod = modelo==='55'?'NF-e':'NFC-e';
  modal(`<div class="m-head"><h3>Emitir ${nomeMod}</h3><button data-modal-close>×</button></div>
    <div class="m-body qrbox" id="nfBody"><p class="muted" style="padding:24px">Enviando para a SEFAZ…</p></div>
    <div class="m-foot"><button class="btn ghost" data-modal-close>Fechar</button></div>`);
  try{
    const { data:{ session } } = await sb.auth.getSession();
    const r = await fetch(`${SUPABASE_URL}/functions/v1/fiscal-emit`,{
      method:'POST', headers:{ 'Authorization':`Bearer ${session.access_token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ sale_id:saleId, modelo })
    });
    const j = await r.json();
    if(j.error) throw new Error(j.error);
    nfStatus(saleId, modelo);
    nfPoll(saleId, modelo);
  }catch(e){
    $('#nfBody').innerHTML = `<p class="neg" style="padding:16px">${esc(e.message||e)}</p>
      <p class="muted" style="font-size:13px">Configure os secrets <b>FOCUS_NFE_TOKEN</b> e <b>FOCUS_NFE_ENV</b>, cadastre a loja com CNPJ/IE e os campos fiscais (NCM/CFOP) dos produtos.</p>`;
  }
};
let nfTimer=null;
async function nfStatus(saleId, modelo){
  const { data } = await sb.from('fiscal_documents').select('*').eq('sale_id',saleId).eq('modelo',modelo)
    .order('created_at',{ascending:false}).limit(1).maybeSingle();
  const b=$('#nfBody'); if(!b||!data) return;
  if(data.status==='autorizado'){
    b.innerHTML = `<div style="font-size:44px">✅</div><p class="b" style="font-family:Fredoka;font-size:20px">Nota autorizada</p>
      <p class="muted" style="font-size:12px;word-break:break-all">${esc(data.chave||'')}</p>
      ${data.danfe_url?`<a class="btn" style="margin-top:10px" href="${data.danfe_url}" target="_blank">Abrir DANFE</a>`:''}`;
    clearInterval(nfTimer); loadOrders();
  } else if(data.status==='rejeitado'||data.status==='erro'){
    b.innerHTML = `<div style="font-size:40px">⚠️</div><p class="neg">${esc(data.status)}</p><p class="muted" style="font-size:13px">${esc(data.mensagem||'')}</p>`;
    clearInterval(nfTimer);
  } else {
    b.innerHTML = `<div style="font-size:40px">⏳</div><p class="muted">Processando na SEFAZ…</p>`;
  }
}
function nfPoll(saleId, modelo){ clearInterval(nfTimer); nfTimer=setInterval(()=>nfStatus(saleId,modelo), 3500); }

// ======================= LOJAS =======================
/* ================= OPERADORES DE CAIXA + PERMISSÕES ================= */
let APP_USERS=[];
{ const b=$('#btnUsersRefresh'); if(b) b.onclick=()=>renderUsers();
  const n=$('#btnUserNew'); if(n) n.onclick=()=>userCreate(); }

function permCount(u){
  const p=(u.permissoes && typeof u.permissoes==='object') ? u.permissoes : {};
  return Object.keys(p).filter(k=>p[k]===true).length;
}
async function renderUsers(){
  const tb=$('#usersBody'); if(!tb) return;
  const card=$('#cardUsers'); if(card) card.classList.toggle('hide', !isAdmin());
  if(!isAdmin()) return;
  tb.innerHTML='<tr><td colspan="7" class="muted" style="text-align:center;padding:18px">Carregando…</td></tr>';
  const { data, error } = await sb.rpc('erp_users_list');
  if(error){ tb.innerHTML='<tr><td colspan="7" class="muted" style="text-align:center;padding:18px">Erro: '+esc(error.message)+'</td></tr>'; return; }
  APP_USERS = data||[];
  const papelChip={admin:'<span class="chip ok">admin</span>',operador:'<span class="chip">operador</span>',motoboy:'<span class="chip amber">motoboy</span>'};
  tb.innerHTML = APP_USERS.map(u=>{
    const n=permCount(u);
    const acessos = u.papel==='admin' ? '<span class="chip ok">acesso total</span>'
      : (n? '<span class="chip">'+n+' liberado(s)</span>' : '<span class="chip amber">padrão do operador</span>');
    return '<tr>'
      +'<td><b>'+esc(u.nome||'—')+'</b>'+(u.sou_eu?' <span class="chip">você</span>':'')+'</td>'
      +'<td class="muted">'+esc(u.email||'—')+'</td>'
      +'<td>'+(papelChip[u.papel]||esc(u.papel||''))+'</td>'
      +'<td>'+esc(u.loja_nome||'—')+'</td>'
      +'<td>'+acessos+'</td>'
      +'<td>'+(u.ativo?'<span class="chip ok">ativo</span>':'<span class="chip warn">desativado</span>')+'</td>'
      +'<td class="r"><button class="btn ghost sm" data-onclick="userEdit(\'' + u.id + '\')">Editar acessos</button></td></tr>';
  }).join('') || '<tr><td colspan="7" class="muted" style="text-align:center;padding:20px">Nenhum operador cadastrado ainda.</td></tr>';
}

window.userEdit = (id)=>{
  const u=(APP_USERS||[]).find(x=>x.id===id); if(!u){ toast('Operador não encontrado.',true); return; }
  const p=(u.permissoes && Object.keys(u.permissoes).length) ? u.permissoes : (u.papel==='admin'?{}:PERM_DEFAULT);
  const chk=(k,lbl)=>'<label style="display:flex;align-items:center;gap:8px;padding:5px 2px;font-size:13.5px;cursor:pointer">'
    +'<input type="checkbox" class="permchk" data-k="'+k+'" '+(p[k]===true?'checked':'')+' style="width:16px;height:16px;accent-color:var(--brand)">'
    +'<span>'+lbl+'</span></label>';
  const lojaOpts='<option value="">— sem loja fixa —</option>'
    + STORES.map(x=>'<option value="'+x.id+'"'+(u.store_id===x.id?' selected':'')+'>'+esc(x.nome)+(x.is_matriz?' ★':'')+'</option>').join('');

  modal('<div class="m-head"><h3>Acessos de '+esc(u.nome||'')+'</h3><button data-modal-close>✕</button></div>'
    +'<div class="m-body">'
      +'<div class="grid2">'
        +'<div class="field"><label class="lbl">Nome</label><input id="usNome" class="in" value="'+esc(u.nome||'')+'"></div>'
        +'<div class="field"><label class="lbl">Papel</label><select id="usPapel" class="in">'
          +['admin','operador','motoboy'].map(x=>'<option value="'+x+'"'+(u.papel===x?' selected':'')+'>'+x+'</option>').join('')
        +'</select></div>'
        +'<div class="field"><label class="lbl">Loja</label><select id="usLoja" class="in">'+lojaOpts+'</select></div>'
        +'<div class="field"><label class="lbl">Situação</label><select id="usAtivo" class="in">'
          +'<option value="1"'+(u.ativo?' selected':'')+'>Ativo</option>'
          +'<option value="0"'+(u.ativo?'':' selected')+'>Desativado</option></select></div>'
      +'</div>'
      +'<p class="muted" style="font-size:12.5px;margin:6px 0 0">E-mail: <b>'+esc(u.email||'—')+'</b> · o admin sempre tem acesso total, as marcações abaixo valem para operador e motoboy.</p>'
      +'<div id="usPerms" style="margin-top:12px">'
        +'<div class="head" style="margin-bottom:4px"><h3 style="font-size:15px;margin:0">Retaguarda (fora do caixa)</h3>'
          +'<span class="grow"></span><button class="btn ghost sm" data-onclick="userPermAll(1)">Marcar tudo</button>'
          +'<button class="btn ghost sm" data-onclick="userPermAll(0)">Limpar</button></div>'
        +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:0 14px">'
          + PERM_PAGES.map(x=>chk('page_'+x[0],x[1])).join('')
        +'</div>'
        +'<h3 style="font-size:15px;margin:14px 0 4px">Frente de caixa (PDV)</h3>'
        +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:0 14px">'
          + PERM_PDV.map(x=>chk(x[0],x[1])).join('')
        +'</div>'
      +'</div>'
    +'</div>'
    +'<div class="m-foot">'
      +(u.sou_eu?'':'<button class="btn ghost" style="color:var(--danger,#c0392b)" data-onclick="userDelete(\'' + u.id + '\')">🗑️ Excluir</button>')
      +'<button class="btn ghost" data-onclick="userSetPassword(\'' + u.id + '\')">🔑 Trocar senha</button>'
      +'<span class="grow"></span>'
      +'<button class="btn ghost" data-modal-close>Cancelar</button>'
      +'<button class="btn" id="usGo" data-onclick="userSave(\'' + u.id + '\')">Salvar acessos</button></div>');
};

/* admin: definir nova senha de um operador (via edge function admin-user) */
window.userSetPassword = (id)=>{
  const u=(APP_USERS||[]).find(x=>x.id===id)||{};
  modal('<div class="m-head"><h3>Nova senha · '+esc(u.nome||'operador')+'</h3><button data-modal-close>✕</button></div>'
    +'<div class="m-body">'
      +'<p class="muted" style="font-size:13px;margin:0 0 10px">A senha entra em vigor na hora. Avise a pessoa em particular — não envie por canais abertos.</p>'
      +'<div class="field"><label class="lbl">Nova senha (mín. 6)</label><input id="npPass" class="in" type="text" autocomplete="off" placeholder="ex.: caixa2026"></div>'
    +'</div>'
    +'<div class="m-foot"><button class="btn ghost" data-modal-close>Cancelar</button>'
      +'<button class="btn" id="npGo" data-onclick="userSetPasswordGo(\'' + id + '\')">Salvar senha</button></div>');
  setTimeout(()=>{ const i=$('#npPass'); if(i) i.focus(); }, 50);
};
window.userSetPasswordGo = async (id)=>{
  const pass=(($('#npPass')||{}).value||'');
  if(pass.length<6){ toast('A senha precisa ter pelo menos 6 caracteres.',true); return; }
  const b=$('#npGo'); if(b){ b.disabled=true; b.textContent='Salvando…'; }
  const { data, error } = await sb.functions.invoke('admin-user',{ body:{ action:'password', id, password:pass } });
  if(error||!data||!data.ok){ toast('Erro: '+await edgeErrMsg(error,'não foi possível trocar a senha'),true); if(b){ b.disabled=false; b.textContent='Salvar senha'; } return; }
  closeModal(); toast('Senha atualizada ✓');
};

/* admin: excluir operador (via edge function admin-user) */
window.userDelete = async (id)=>{
  const u=(APP_USERS||[]).find(x=>x.id===id)||{};
  if(!await uiConfirm('Excluir a conta de '+((u.nome||'este operador'))+'? Isso remove o acesso definitivamente.',{danger:true,okText:'Excluir',cancelText:'Voltar'})) return;
  const { data, error } = await sb.functions.invoke('admin-user',{ body:{ action:'delete', id } });
  if(error||!data||!data.ok){ toast('Erro: '+await edgeErrMsg(error,'não foi possível excluir'),true); return; }
  closeModal(); toast('Operador excluído ✓'); renderUsers();
};

/* admin: criar novo operador (via edge function admin-user) */
window.userCreate = ()=>{
  const p=Object.assign({}, PERM_DEFAULT);
  const chk=(k,lbl)=>'<label style="display:flex;align-items:center;gap:8px;padding:5px 2px;font-size:13.5px;cursor:pointer">'
    +'<input type="checkbox" class="ncpermchk" data-k="'+k+'" '+(p[k]===true?'checked':'')+' style="width:16px;height:16px;accent-color:var(--brand)">'
    +'<span>'+lbl+'</span></label>';
  const lojaOpts='<option value="">— sem loja fixa —</option>'
    + STORES.map(x=>'<option value="'+x.id+'">'+esc(x.nome)+(x.is_matriz?' ★':'')+'</option>').join('');
  modal('<div class="m-head"><h3>Novo operador</h3><button data-modal-close>✕</button></div>'
    +'<div class="m-body">'
      +'<div class="grid2">'
        +'<div class="field"><label class="lbl">Nome</label><input id="ncNome" class="in" placeholder="Nome da pessoa"></div>'
        +'<div class="field"><label class="lbl">E-mail (login)</label><input id="ncEmail" class="in" type="email" autocomplete="off" placeholder="pessoa@loja.com"></div>'
        +'<div class="field"><label class="lbl">Senha (mín. 6)</label><input id="ncPass" class="in" type="text" autocomplete="off" placeholder="ex.: caixa2026"></div>'
        +'<div class="field"><label class="lbl">Papel</label><select id="ncPapel" class="in">'
          +['operador','motoboy','admin'].map(x=>'<option value="'+x+'">'+x+'</option>').join('')
        +'</select></div>'
        +'<div class="field"><label class="lbl">Loja</label><select id="ncLoja" class="in">'+lojaOpts+'</select></div>'
      +'</div>'
      +'<p class="muted" style="font-size:12.5px;margin:6px 0 0">A conta entra na hora com esse e-mail e senha. O admin sempre tem acesso total; as marcações abaixo valem para operador e motoboy.</p>'
      +'<div id="ncPerms" style="margin-top:12px">'
        +'<div class="head" style="margin-bottom:4px"><h3 style="font-size:15px;margin:0">Retaguarda (fora do caixa)</h3>'
          +'<span class="grow"></span><button class="btn ghost sm" data-onclick="setNewUserPermissions(true)">Marcar tudo</button>'
          +'<button class="btn ghost sm" data-onclick="setNewUserPermissions(false)">Limpar</button></div>'
        +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:0 14px">'
          + PERM_PAGES.map(x=>chk('page_'+x[0],x[1])).join('')
        +'</div>'
        +'<h3 style="font-size:15px;margin:14px 0 4px">Frente de caixa (PDV)</h3>'
        +'<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:0 14px">'
          + PERM_PDV.map(x=>chk(x[0],x[1])).join('')
        +'</div>'
      +'</div>'
    +'</div>'
    +'<div class="m-foot"><button class="btn ghost" data-modal-close>Cancelar</button>'
      +'<button class="btn" id="ncGo" data-onclick="userCreateGo()">Criar operador</button></div>');
  setTimeout(()=>{ const i=$('#ncNome'); if(i) i.focus(); }, 50);
};
window.userCreateGo = async ()=>{
  const nome=(($('#ncNome')||{}).value||'').trim();
  const email=(($('#ncEmail')||{}).value||'').trim().toLowerCase();
  const password=(($('#ncPass')||{}).value||'');
  const papel=(($('#ncPapel')||{}).value||'operador');
  const store_id=(($('#ncLoja')||{}).value||'')||null;
  if(!nome){ toast('Informe o nome.',true); return; }
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ toast('Informe um e-mail válido.',true); return; }
  if(password.length<6){ toast('A senha precisa ter pelo menos 6 caracteres.',true); return; }
  if(papel!=='admin' && !store_id){ toast('Escolha a loja: operador e motoboy só entram com uma loja vinculada.',true); return; }
  const permissoes={}; $$('#ncPerms .ncpermchk').forEach(c=>{ if(c.checked) permissoes[c.dataset.k]=true; });
  const b=$('#ncGo'); if(b){ b.disabled=true; b.textContent='Criando…'; }
  const { data, error } = await sb.functions.invoke('admin-user',{ body:{ action:'create', nome, email, password, papel, store_id, permissoes } });
  if(error||!data||!data.ok){ toast('Erro: '+await edgeErrMsg(error,'não foi possível criar'),true); if(b){ b.disabled=false; b.textContent='Criar operador'; } return; }
  closeModal(); toast('Operador criado ✓'); renderUsers();
};

/* extrai a mensagem de erro que a edge function devolve no corpo */
async function edgeErrMsg(error, fallback){
  try{ if(error && error.context && typeof error.context.json==='function'){ const j=await error.context.json(); if(j && j.error) return j.error; } }catch(_){}
  return (error && error.message) || fallback || 'falha na operação';
}
window.userPermAll = (on)=>{ $$('#usPerms .permchk').forEach(c=>{ c.checked=!!on; }); };
window.userSave = async (id)=>{
  const perms={}; $$('#usPerms .permchk').forEach(c=>{ if(c.checked) perms[c.dataset.k]=true; });
  const b=$('#usGo'); if(b){ b.disabled=true; b.textContent='Salvando…'; }
  const { data, error } = await sb.rpc('erp_user_save',{
    p_id:id,
    p_nome:($('#usNome')||{}).value||null,
    p_papel:($('#usPapel')||{}).value||null,
    p_store:(($('#usLoja')||{}).value||null)||null,
    p_ativo:(($('#usAtivo')||{}).value==='1'),
    p_permissoes:perms });
  if(error){ toast('Erro: '+error.message,true); if(b){ b.disabled=false; b.textContent='Salvar acessos'; } return; }
  closeModal(); toast('Acessos atualizados ✓');
  if(ME && id===ME.id && data){ ME.papel=data.papel; ME.permissoes=data.permissoes||{};
    ME.is_admin=(ME.papel==='admin'); ME.is_cashier=(ME.papel==='admin'||ME.papel==='operador'); applyRoleUI(); }
  renderUsers();
};

$('#btnNewStore').onclick = ()=> storeForm();
async function renderStores(){
  await loadStores();
  $('#storeBody').innerHTML = STORES.map(s=>`
    <tr><td><b>${esc(s.nome)}</b></td><td>${esc(s.cnpj||'—')}</td><td>${esc(s.uf||'—')}</td>
      <td>${esc(s.regime||'—')}</td><td>${s.ambiente_fiscal==='producao'?'<span class="chip ok">produção</span>':'<span class="chip amber">homologação</span>'}</td>
      <td class="r"><button class="btn ghost sm" data-onclick='storeForm(${JSON.stringify(s).replace(/'/g,"&#39;")})'>Editar</button></td></tr>`).join('')
    || '<tr><td colspan="6" class="muted" style="text-align:center;padding:16px">Nenhuma loja.</td></tr>';
}
let STORE_MAP=null, STORE_MARKER=null;
window.storeForm = (s={})=>{
  storeMapDestroy();
  const hasPt = s.lat!=null && s.lng!=null;
  modal(`<div class="m-head"><h3>${s.id?'Editar':'Nova'} loja</h3><button data-modal-close>×</button></div>
    <div class="m-body">
      <div class="field"><label class="lbl">Nome / Razão social *</label><input id="stNome" class="in" value="${esc(s.nome||'')}"></div>
      <div class="grid2">
        <div class="field"><label class="lbl">CNPJ</label><input id="stCnpj" class="in" value="${esc(s.cnpj||'')}"></div>
        <div class="field"><label class="lbl">Inscrição Estadual</label><input id="stIe" class="in" value="${esc(s.ie||'')}"></div>
        <div class="field"><label class="lbl">Regime</label><select id="stReg" class="in">
          ${['simples','presumido','real','mei'].map(r=>`<option ${s.regime===r?'selected':''}>${r}</option>`).join('')}</select></div>
        <div class="field"><label class="lbl">Ambiente fiscal</label><select id="stAmb" class="in">
          <option value="homologacao" ${s.ambiente_fiscal!=='producao'?'selected':''}>homologação</option>
          <option value="producao" ${s.ambiente_fiscal==='producao'?'selected':''}>produção</option></select></div>
      </div>

      <h4 style="margin:16px 0 8px;font-size:14px">📍 Endereço da loja</h4>
      <div class="grid2">
        <div class="field"><label class="lbl">CEP</label>
          <div style="display:flex;gap:6px">
            <input id="stCep" class="in" placeholder="00000-000" inputmode="numeric" maxlength="9" value="${esc(s.cep||'')}"
              data-oninput="maskCep(this)" data-onblur="storeBuscaCepIfComplete(this)">
            <button type="button" class="btn ghost sm" data-onclick="storeBuscaCep()">Buscar CEP</button>
          </div></div>
        <div class="field"><label class="lbl">Telefone</label><input id="stTel" class="in" value="${esc(s.telefone||'')}"></div>
        <div class="field" style="grid-column:1/-1"><label class="lbl">Endereço (logradouro)</label><input id="stEnd" class="in" value="${esc(s.endereco||'')}"></div>
        <div class="field"><label class="lbl">Número</label><input id="stNum" class="in" value="${esc(s.numero||'')}"></div>
        <div class="field"><label class="lbl">Bairro</label><input id="stBairro" class="in" value="${esc(s.bairro||'')}"></div>
        <div class="field"><label class="lbl">Município</label><input id="stMun" class="in" value="${esc(s.municipio||'')}"></div>
        <div class="field"><label class="lbl">UF</label><input id="stUf" class="in" value="${esc(s.uf||'')}" maxlength="2"></div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin:6px 0">
        <button type="button" class="btn ghost sm" data-onclick="storeGeo(true)">🔎 Localizar no mapa</button>
        <span id="stGeoInfo" class="muted" style="font-size:12px">${hasPt?('📍 '+(+s.lat).toFixed(5)+', '+(+s.lng).toFixed(5)+' — arraste o pino para ajustar'):'Busque o CEP ou clique no mapa para posicionar a loja.'}</span>
      </div>
      <div id="stMap" style="height:220px;border-radius:12px;overflow:hidden;background:#e8eef6"></div>
      <input type="hidden" id="stLat" value="${hasPt?(+s.lat):''}"><input type="hidden" id="stLng" value="${hasPt?(+s.lng):''}">
    </div>
    <div class="m-foot"><button class="btn ghost" data-onclick="closeModal();storeMapDestroy()">Cancelar</button>
      <button class="btn" data-onclick='saveStore(${s.id?`"${s.id}"`:'null'})'>Salvar</button></div>`);
  setTimeout(()=>storeMapInit(hasPt?+s.lat:null, hasPt?+s.lng:null), 60);
};
function storeMapDestroy(){ if(STORE_MAP){ try{ STORE_MAP.remove(); }catch(e){} } STORE_MAP=null; STORE_MARKER=null; }
function storeMapWarn(msg){
  const info=document.getElementById('stGeoInfo');
  if(info){ info.textContent='⚠️ '+msg; info.style.color='var(--red)'; }
}
function storeMapInit(lat,lng){
  const el=document.getElementById('stMap'); if(!el) return;
  if(typeof L==='undefined'){ el.innerHTML='<div class="muted" style="padding:14px;font-size:12px">Mapa indisponível offline — informe o CEP e ajuste a posição quando online.</div>'; return; }
  storeMapDestroy();
  const has=isFinite(lat)&&isFinite(lng);
  STORE_MAP=L.map(el,{zoomControl:true}).setView(has?[lat,lng]:[-14.235,-51.925], has?16:4);
  const tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'});
  // Falha silenciosa era o pior cenário: o mapa ficava cinza sem explicar por quê.
  // Os tiles vêm do openstreetmap.org (rede) — se a máquina estiver offline, com
  // firewall/extensão bloqueando o host, ou se o OSM limitar o uso, avisamos e
  // deixamos claro que CEP e posicionamento manual continuam funcionando.
  let tileErr=0;
  tiles.on('tileerror', ()=>{ if(++tileErr===1) storeMapWarn('Não foi possível carregar o mapa (sem internet, ou o host de mapas está bloqueado nesta rede). O CEP e o ajuste de posição continuam funcionando.'); });
  tiles.addTo(STORE_MAP);
  STORE_MAP.on('click',e=>storePin(e.latlng.lat,e.latlng.lng,false));
  if(has) storePin(lat,lng,false);
  if(!navigator.onLine) storeMapWarn('Sem internet no momento — o mapa aparece ao reconectar. Você já pode informar o CEP.');
  setTimeout(()=>{ try{ STORE_MAP.invalidateSize(); }catch(e){} }, 200);
}
function storePin(lat,lng,center){
  if(!(isFinite(lat)&&isFinite(lng))) return;
  const la=$('#stLat'), ln=$('#stLng'); if(la) la.value=(+lat).toFixed(6); if(ln) ln.value=(+lng).toFixed(6);
  const info=document.getElementById('stGeoInfo'); if(info){ info.textContent='📍 '+(+lat).toFixed(5)+', '+(+lng).toFixed(5)+' — arraste o pino para ajustar'; info.style.color=''; }
  if(STORE_MAP){
    if(!STORE_MARKER){
      STORE_MARKER=L.marker([lat,lng],{draggable:true,icon:trkIcon('🏪','#12307a')}).addTo(STORE_MAP);
      STORE_MARKER.on('dragend',()=>{ const p=STORE_MARKER.getLatLng(); storePin(p.lat,p.lng,false); });
    } else STORE_MARKER.setLatLng([lat,lng]);
    if(center) STORE_MAP.setView([lat,lng],16);
  }
}
window.storeGeo = async (manual)=>{
  const cep=($('#stCep').value||'').replace(/\D/g,'');
  const rua=($('#stEnd').value||'').trim(), num=($('#stNum').value||'').trim();
  const cidade=($('#stMun').value||'').trim(), uf=($('#stUf').value||'').trim();
  if(!rua && !cep){ if(manual) toast('Informe o CEP ou o endereço primeiro.',true); return false; }
  if(!navigator.onLine){ if(manual) toast('Localizar no mapa exige internet.',true); return false; }
  const p=new URLSearchParams({format:'jsonv2',limit:'1',countrycodes:'br','accept-language':'pt-BR'});
  if(rua) p.set('street',(num?num+' ':'')+rua);
  if(cidade) p.set('city',cidade);
  if(uf) p.set('state',uf);
  if(cep) p.set('postalcode',cep);
  try{
    const r=await fetch('https://nominatim.openstreetmap.org/search?'+p.toString(),{headers:{'Accept':'application/json'}});
    const arr=await r.json();
    if(Array.isArray(arr)&&arr[0]){ storePin(+arr[0].lat,+arr[0].lon,true); return true; }
    if(manual) toast('Endereço não localizado. Clique no mapa para posicionar.',true);
    return false;
  }catch(e){ if(manual) toast('Falha ao localizar no mapa.',true); return false; }
};
window.storeBuscaCep = async ()=>{
  const cep=($('#stCep').value||'').replace(/\D/g,'');
  if(cep.length!==8){ toast('CEP deve ter 8 dígitos.',true); return; }
  const btn=event&&event.target&&event.target.tagName==='BUTTON'?event.target:null;
  if(btn){ btn.disabled=true; btn.textContent='…'; }
  try{
    const r=await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const d=await r.json();
    if(d.erro){ toast('CEP não encontrado.',true); return; }
    if(d.logradouro) $('#stEnd').value=d.logradouro;
    if(d.bairro) $('#stBairro').value=d.bairro;
    if(d.localidade) $('#stMun').value=d.localidade;
    if(d.uf) $('#stUf').value=d.uf;
    toast('Endereço preenchido — localizando no mapa…');
    if(!$('#stNum').value) $('#stNum').focus();
    await storeGeo(false);
  }catch(e){ toast('Falha ao consultar o CEP.',true); }
  finally{ if(btn){ btn.disabled=false; btn.textContent='Buscar CEP'; } }
};
window.saveStore = async (id)=>{
  const nome=$('#stNome').value.trim(); if(!nome){ toast('Informe o nome.',true); return; }
  const numf=v=>{ v=parseFloat(v); return isFinite(v)?v:null; };
  const rec={ nome, cnpj:$('#stCnpj').value, ie:$('#stIe').value, uf:$('#stUf').value.toUpperCase(),
    municipio:$('#stMun').value, regime:$('#stReg').value, ambiente_fiscal:$('#stAmb').value,
    cep:$('#stCep').value, endereco:$('#stEnd').value, numero:$('#stNum').value, bairro:$('#stBairro').value,
    telefone:$('#stTel').value, lat:numf($('#stLat').value), lng:numf($('#stLng').value) };
  const { error } = id ? await sb.from('stores').update(rec).eq('id',id) : await sb.from('stores').insert(rec);
  if(error){ toast('Erro: '+error.message,true); return; }
  storeMapDestroy(); closeModal(); toast('Loja salva'); renderStores();
};

// ======================= HOME (BACKOFFICE) =======================
async function loadHome(){
  const hoje=hojeISO();
  const el=$('#homeDate'); if(el) el.textContent='Hoje · '+new Date().toLocaleDateString('pt-BR');
  const { data } = await sb.rpc('erp_dashboard_multi',{ p_ini:hoje, p_fim:hoje });
  const d=data||{};
  const vencR=+d.a_receber_vencido_geral||0, vencP=+d.a_pagar_vencido_geral||0;
  $('#homeGeral').innerHTML = `
    <div class="stat acc"><div class="k">Vendas hoje (todas as lojas)</div><div class="v">${BRL(d.total_geral)}</div>
      <div class="muted" style="font-size:12px">${d.qtd_geral||0} venda(s)</div></div>
    <div class="stat"><div class="k">🧾 A receber — crediário</div><div class="v">${BRL(d.a_receber_geral)}</div>
      <div class="muted" style="font-size:12px">${d.a_receber_qtd||0} parcela(s) · ${d.a_receber_clientes||0} cliente(s)</div></div>
    <div class="stat ${vencR>0?'warn':''}"><div class="k">🧾 Recebimentos vencidos</div><div class="v ${vencR>0?'neg':''}">${BRL(vencR)}</div>
      <div class="muted" style="font-size:12px">${vencR>0?'cobrar hoje':'nada vencido 👍'}</div></div>
    <div class="stat"><div class="k">💸 A pagar (aberto)</div><div class="v">${BRL(d.a_pagar_geral)}</div>
      <div class="muted" style="font-size:12px">${d.a_pagar_qtd||0} conta(s)</div></div>
    <div class="stat ${vencP>0?'warn':''}"><div class="k">💸 Pagamentos vencidos</div><div class="v ${vencP>0?'neg':''}">${BRL(vencP)}</div>
      <div class="muted" style="font-size:12px">${vencP>0?'em atraso':'em dia 👍'}</div></div>`;
  const lojas=d.lojas||[];
  $('#homeStores').innerHTML = lojas.map(l=>`
    <div class="stat home-store ${l.store_id===CURRENT_STORE?'acc':''}" data-onclick="homePickStore('${l.store_id}')" style="${l.matriz?'border:2px solid var(--accent)':''}">
      <div class="k">${esc(l.nome)}${l.matriz?' ★':''}</div>
      <div class="v">${BRL(l.total)}</div>
      <div class="muted" style="font-size:12px">${l.qtd} venda(s) hoje${+l.entregas_abertas>0?` · 🚚 ${l.entregas_abertas}`:''}${+l.itens_baixos>0?` · <span class="neg">${l.itens_baixos} baixo(s)</span>`:''}</div>
    </div>`).join('') || '<p class="muted">Sem lojas cadastradas.</p>';
  $('#homeStoreBody').innerHTML = lojas.map(l=>`
    <tr class="clickrow" data-onclick="homePickStore('${l.store_id}')">
      <td><b>${esc(l.nome)}</b>${l.matriz?' ★':''}</td>
      <td class="r"><b>${BRL(l.total)}</b></td>
      <td class="r">${l.qtd||0}</td>
      <td class="r muted">${BRL(l.ticket)}</td>
      <td class="r">${BRL(l.a_receber)}</td>
      <td class="r ${+l.a_receber_vencido>0?'neg':'muted'}">${BRL(l.a_receber_vencido)}</td>
      <td class="r">${BRL(l.a_pagar)}</td>
      <td class="r ${+l.a_pagar_vencido>0?'neg':'muted'}">${BRL(l.a_pagar_vencido)}</td>
      <td class="c">${+l.entregas_abertas>0?`<span class="chip amber">${l.entregas_abertas}</span>`:'<span class="muted">—</span>'}</td>
      <td class="c">${+l.itens_baixos>0?`<span class="chip warn">${l.itens_baixos}</span>`:'<span class="muted">—</span>'}</td>
    </tr>`).join('') || '<tr><td colspan="10" class="muted" style="text-align:center;padding:16px">Sem lojas.</td></tr>';
  const { data:pays } = await sb.from('v_payables_open').select('*').order('vencimento').limit(6);
  const hj=hojeISO();
  $('#homePay').innerHTML = (pays&&pays.length) ? pays.map(p=>`
    <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line)">
      <span>${esc(p.fornecedor||'—')} <span class="muted">· ${esc(p.loja_nome||'')}</span></span>
      <b class="${p.vencimento<hj?'neg':''}">${BRL(p.valor)} <span class="muted" style="font-weight:400">${fmtDate(p.vencimento)}</span></b></div>`).join('')
    : '<p class="muted" style="padding:8px 0">Nenhuma conta em aberto. 🎉</p>';
  const low=(PRODUCTS||[]).filter(p=>p.track_stock && +p.estoque<=+p.estoque_min && +p.estoque_min>0).slice(0,8);
  $('#homeLow').innerHTML = low.length ? low.map(p=>`
    <div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line)">
      <span>${esc(p.nome)}</span><b class="neg">${(+p.estoque).toLocaleString('pt-BR')} / ${(+p.estoque_min).toLocaleString('pt-BR')}</b></div>`).join('')
    : '<p class="muted" style="padding:8px 0">Tudo acima do mínimo. 👍</p>';
  renderHomeGoals(); renderHomeBirthdays();
}
// ---- metas de venda do mês ----
async function renderHomeGoals(){
  const box=$('#homeGoals'); if(!box) return;
  const { data, error } = await sb.rpc('erp_goals_status',{p_ano_mes:null});
  if(error){ box.innerHTML='<p class="muted" style="padding:6px 0">Não foi possível carregar as metas.</p>'; return; }
  const lojas=(data&&data.lojas)||[];
  if(!lojas.length){ box.innerHTML='<p class="muted" style="padding:6px 0">Nenhuma loja.</p>'; return; }
  box.innerHTML = lojas.map(l=>{
    const pct=l.pct==null?null:Math.min(200,+l.pct);
    const cor = pct==null?'var(--ink2)':pct>=100?'var(--green)':pct>=60?'var(--amber)':'var(--red)';
    return `<div style="padding:9px 0;border-bottom:1px solid var(--line)">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <b>${esc(l.loja)}</b>
        <span>${BRL(l.realizado)} ${l.meta>0?`<span class="muted">de ${BRL(l.meta)}</span>`:'<span class="muted">sem meta</span>'} ${pct!=null?`<b style="color:${cor}">· ${pct}%</b>`:''}</span></div>
      <div style="height:8px;border-radius:6px;background:var(--line);overflow:hidden;margin-top:6px">
        <i style="display:block;height:100%;width:${pct==null?0:Math.min(100,pct)}%;background:${cor}"></i></div>
    </div>`;
  }).join('');
}
window.goalSetModal=async ()=>{
  if(!isAdmin()){ toast('Somente o administrador define metas',true); return; }
  const { data } = await sb.rpc('erp_goals_status',{p_ano_mes:null});
  const ym=(data&&data.ano_mes)||new Date().toISOString().slice(0,7);
  const lojas=(data&&data.lojas)||[];
  modal(`<div class="m-head"><h3>🎯 Metas de ${ym.split('-').reverse().join('/')}</h3><button data-modal-close>✕</button></div>
    <div class="m-body">
      ${lojas.map(l=>`<div class="field"><label class="lbl">${esc(l.loja)} — realizado ${BRL(l.realizado)}</label>
        <input class="in goalIn" data-store="${l.store_id}" inputmode="decimal" value="${l.meta?fmtNum(l.meta):''}" placeholder="meta em R$"></div>`).join('')}
    </div>
    <div class="m-foot"><button class="btn ghost" data-modal-close>Cancelar</button>
      <button class="btn green" data-onclick="goalSave('${ym}')">Salvar metas</button></div>`);
};
window.goalSave=async (ym)=>{
  const ins=[...document.querySelectorAll('.goalIn')];
  for(const el of ins){ const { error }=await sb.rpc('erp_goal_upsert',{p_store:el.dataset.store,p_ano_mes:ym,p_meta:num(el.value)}); if(error){ toast('Erro: '+error.message,true); return; } }
  closeModal(); toast('Metas salvas ✅'); renderHomeGoals();
};
// ---- aniversariantes do mês ----
async function renderHomeBirthdays(){
  const box=$('#homeBday'); if(!box) return;
  const { data, error } = await sb.rpc('erp_birthdays',{p_mes:null});
  const list=error?[]:(data||[]);
  if(!list.length){ box.innerHTML='<p class="muted" style="padding:8px 0">Nenhum aniversariante este mês.</p>'; return; }
  box.innerHTML = list.slice(0,12).map(b=>{
    const f=String(b.fone||'').replace(/\D/g,'');
    return `<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--line)">
      <span style="width:34px;text-align:center;font-weight:800;color:${b.hoje?'var(--green)':'var(--ink2)'}">${String(b.dia).padStart(2,'0')}</span>
      <span>${esc(b.cliente)}${b.hoje?' <span class="chip ok">hoje 🎉</span>':''}</span>
      <span class="grow" style="flex:1"></span>
      ${f?`<button class="btn acc sm" data-onclick="bdayWhats('${f}','${esc((b.cliente||'').split(' ')[0].replace(/'/g,''))}')">💬 Parabéns + cupom</button>`:'<span class="muted" style="font-size:12px">sem tel.</span>'}</div>`;
  }).join('');
}
window.bdayWhats=(fone,nome)=>{
  const loja=(DB.settings.storeName||'nossa loja');
  const msg=`🎉 Feliz aniversário, ${nome}! O ${loja} preparou um presente pra você: use o cupom *ANIVER10* e ganhe 10% de desconto na sua próxima compra este mês. 🐾🎁`;
  const f=String(fone||'').replace(/\D/g,'').replace(/^55/,'');
  window.open('https://wa.me/55'+f+'?text='+encodeURIComponent(msg),'_blank');
};
{ const b=$('#btnGoalSet'); if(b) b.onclick=()=>goalSetModal(); }
{ const b=$('#btnHomeRefresh'); if(b) b.onclick=()=>{ loadProducts().then(loadHome); }; }
window.homePickStore=async id=>{ CURRENT_STORE=id; const sel=$('#storeSel'); if(sel) sel.value=id; await loadProducts(); loadHome(); startPortalPaymentsWatch(); };

// ======================= CENTRAL DE DECISÃO =======================
function dcAddDaysISO(days){
  const d=new Date(); d.setDate(d.getDate()+days);
  return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
}
async function dcSafe(promise){
  try{
    const { data, error } = await promise;
    if(error) return { data:null, error:error.message||String(error) };
    return { data:data||null, error:null };
  }catch(e){ return { data:null, error:(e&&e.message)||String(e) }; }
}
function dcHealthLabel(score){
  if(score>=90) return ['Excelente','acc'];
  if(score>=75) return ['Muito bom','acc'];
  if(score>=60) return ['Atenção',''];
  if(score>=40) return ['Risco','warn'];
  return ['Crítico','warn'];
}
function dcLine(label,value,cls){
  return `<div style="display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--line)">
    <span class="muted">${label}</span><b class="${cls||''}">${value}</b></div>`;
}
function dcTask(label,detail,page,cls){
  return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line)">
    <span class="chip ${cls||''}" style="min-width:72px;text-align:center">${cls==='warn'?'alerta':cls==='ok'?'ok':'ação'}</span>
    <div style="min-width:0;flex:1"><b>${label}</b><div class="muted" style="font-size:12px">${detail}</div></div>
    ${page?`<button class="btn ghost sm" data-onclick="openBoPage('${page}')">Abrir</button>`:''}</div>`;
}
function dcMiniList(rows,empty){
  return rows.length ? rows.join('') : `<p class="muted" style="padding:8px 0">${empty}</p>`;
}
async function loadDecisionCenter(){
  const subtitle=$('#dcSubtitle');
  if(subtitle) subtitle.textContent='Calculando caixa, estoque, compras, inadimplência e margem...';
  ['dcHealth','dcCash','dcToday','dcAlerts','dcProducts','dcDiagnosis'].forEach(id=>{
    const el=$('#'+id); if(el) el.innerHTML='<p class="muted" style="padding:12px 0">Analisando dados...</p>';
  });
  const hoje=hojeISO(), fim30=dcAddDaysISO(30), mes=mesAtualISO();
  await loadProducts();

  const cashCurrent = await dcSafe(sb.rpc('erp_cash_current'));
  const cashSummary = cashCurrent.data ? await dcSafe(sb.rpc('erp_cash_summary',{})) : { data:null, error:null };
  const cashBase = cashCurrent.data ? +(cashSummary.data&&cashSummary.data.esperado_gaveta||0) : 0;
  const [dash, cf, dre, smart, owner, payables, receivables, abc] = await Promise.all([
    dcSafe(sb.rpc('erp_dashboard_multi',{ p_ini:hoje, p_fim:hoje })),
    dcSafe(sb.rpc('erp_cashflow_forecast',{ p_ini:hoje, p_fim:fim30, p_store:CURRENT_STORE, p_opening:cashBase })),
    dcSafe(sb.rpc('erp_dre',{ p_ini:mes.ini, p_fim:mes.fim, p_store:CURRENT_STORE })),
    dcSafe(sb.rpc('erp_smart_order',{ p_store:CURRENT_STORE, p_dias:30, p_cobertura:30, p_supplier:null })),
    dcSafe(sb.rpc('erp_owner_alerts',{ p_store:CURRENT_STORE, p_enqueue:false })),
    dcSafe(sb.rpc('erp_payables_list',{ p_ini:null, p_fim:null, p_status:'abertas', p_store:CURRENT_STORE })),
    dcSafe(sb.rpc('erp_receivables_list',{ p_ini:null, p_fim:null, p_status:'abertas' })),
    dcSafe(sb.rpc('erp_abc',{ p_ini:mes.ini, p_fim:mes.fim, p_store:CURRENT_STORE }))
  ]);

  const d=dash.data||{}, c=cf.data||{}, dr=dre.data||{};
  const prod=PRODUCTS||[], abcRows=abc.data||[];
  const payableRows=payables.data||[], receivableRows=receivables.data||[];
  const smartGroups=((smart.data||{}).fornecedores||[]);
  const smartItems=smartGroups.flatMap(g=>(g.itens||[]).map(i=>({ ...i, fornecedor:g.fornecedor })));
  const smartTotal=smartGroups.reduce((a,g)=>a+(+g.total_custo||0),0);
  const low=prod.filter(p=>p.track_stock && +p.estoque_min>0 && +p.estoque<=+p.estoque_min);
  const negative=prod.filter(p=>p.track_stock && +p.estoque<0);
  const capitalRows=prod.filter(p=>p.track_stock && +p.estoque>0 && +p.custo>0)
    .map(p=>({ ...p, capital:+p.estoque*(+p.custo||0) })).sort((a,b)=>b.capital-a.capital);
  const stockCapital=capitalRows.reduce((a,p)=>a+p.capital,0);
  const vencReceber=+d.a_receber_vencido_geral || receivableRows.filter(r=>r.atrasada).reduce((a,r)=>a+(+r.valor||0),0);
  const totalReceber=+d.a_receber_geral || receivableRows.reduce((a,r)=>a+(+r.valor||0),0);
  const vencPagar=+d.a_pagar_vencido_geral || payableRows.filter(r=>r.atrasada).reduce((a,r)=>a+(+r.valor||0),0);
  const totalPagar=+d.a_pagar_geral || payableRows.reduce((a,r)=>a+(+r.valor||0),0);
  const cfDays=(c.dias||[]).length||30;
  const dailyBurn=Math.max(0, ((+c.total_saidas||0)-(+c.total_entradas||0))/Math.max(1,cfDays));
  const survival=dailyBurn>0 ? Math.floor(Math.max(0,cashBase)/dailyBurn) : 90;
  const minSaldo=+c.min_saldo||0, saldoFinal=+c.saldo_final||cashBase;
  const margem=+dr.margem_bruta_pct||0, resultado=+dr.resultado||0;

  const cashScore = minSaldo<0 ? 25 : saldoFinal<0 ? 35 : survival<7 ? 45 : survival<15 ? 65 : 88;
  const profitScore = resultado<0 ? 35 : margem<15 ? 55 : margem<25 ? 72 : 88;
  const stockScore = Math.max(25, 95 - Math.min(45, low.length*4) - Math.min(25, negative.length*8));
  const creditRatio = totalReceber>0 ? vencReceber/totalReceber : 0;
  const creditScore = creditRatio>.30 ? 35 : creditRatio>.15 ? 55 : creditRatio>.05 ? 75 : 92;
  const payableScore = vencPagar>0 ? 55 : totalPagar>cashBase+Math.max(0,+c.total_entradas||0) ? 62 : 86;
  const purchaseScore = smartTotal>0 && smartTotal>Math.max(0,saldoFinal) ? 55 : 82;
  const score=Math.round(cashScore*.25 + profitScore*.20 + stockScore*.20 + creditScore*.15 + payableScore*.10 + purchaseScore*.10);
  const [scoreLabel,scoreCls]=dcHealthLabel(score);

  const scope=(STORES.find(s=>s.id===CURRENT_STORE)||{}).nome||'loja atual';
  if(subtitle) subtitle.textContent=`Diagnóstico de ${scope} em ${new Date().toLocaleDateString('pt-BR')}.`;
  const scopeEl=$('#dcScope'); if(scopeEl) scopeEl.textContent=scope;
  $('#dcHealth').innerHTML = `
    <div class="stat ${scoreCls}"><div class="k">Índice de saúde</div><div class="v">${score}</div><div class="muted" style="font-size:12px">${scoreLabel} · escala 0 a 100</div></div>
    <div class="stat ${cashScore<60?'warn':'acc'}"><div class="k">Caixa</div><div class="v">${BRL(cashBase)}</div><div class="muted" style="font-size:12px">${cashCurrent.data?'caixa aberto':'caixa fechado'} · ${survival>=90?'sem pressão de saída':survival+' dia(s) de fôlego'}</div></div>
    <div class="stat ${profitScore<60?'warn':''}"><div class="k">Resultado do mês</div><div class="v ${resultado<0?'neg':''}">${BRL(resultado)}</div><div class="muted" style="font-size:12px">margem bruta ${margem.toFixed(1)}%</div></div>
    <div class="stat ${stockScore<60?'warn':''}"><div class="k">Capital em estoque</div><div class="v">${BRL(stockCapital)}</div><div class="muted" style="font-size:12px">${low.length} item(ns) críticos · ${negative.length} negativo(s)</div></div>
    <div class="stat ${creditScore<60?'warn':''}"><div class="k">Inadimplência</div><div class="v ${vencReceber>0?'neg':''}">${BRL(vencReceber)}</div><div class="muted" style="font-size:12px">${totalReceber>0?(creditRatio*100).toFixed(1)+'% da carteira':'sem carteira em aberto'}</div></div>`;

  $('#dcCash').innerHTML = `
    ${dcLine('Saldo atual da gaveta', cashCurrent.data?BRL(cashBase):'caixa fechado', cashCurrent.data?'':'neg')}
    ${dcLine('Caixa projetado em 30 dias', BRL(saldoFinal), saldoFinal<0?'neg':'')}
    ${dcLine('Menor saldo projetado', BRL(minSaldo), minSaldo<0?'neg':'')}
    ${dcLine('Entradas previstas', BRL(c.total_entradas||0), 'ok')}
    ${dcLine('Saídas previstas', '−'+BRL(c.total_saidas||0), 'neg')}
    <p class="muted" style="font-size:13px;margin-top:10px">${survival>=90?'O caixa suporta o fluxo projetado sem consumir o saldo atual.':'Seu caixa suporta aproximadamente '+survival+' dia(s) no ritmo projetado.'}
      ${smartTotal>Math.max(0,saldoFinal)?' Compras acima de '+BRL(Math.max(0,saldoFinal))+' colocam o caixa em risco.':''}</p>`;

  const tasks=[];
  if(vencReceber>0) tasks.push(dcTask('Cobrar clientes vencidos', `${BRL(vencReceber)} em atraso precisa virar caixa.`, 'crediariocrm', 'warn'));
  if(vencPagar>0) tasks.push(dcTask('Regularizar contas vencidas', `${BRL(vencPagar)} já passou do vencimento.`, 'pagarcrm', 'warn'));
  if(minSaldo<0) tasks.push(dcTask('Proteger o caixa', `O fluxo chega a ${BRL(minSaldo)} nos próximos 30 dias.`, 'pagar', 'warn'));
  if(low[0]) tasks.push(dcTask('Comprar itens críticos', `${low.length} produto(s) no mínimo ou abaixo; comece por ${esc(low[0].nome)}.`, 'pedidoint', ''));
  if(smartItems[0]) tasks.push(dcTask('Montar pedido inteligente', `Sugestão atual: ${BRL(smartTotal)} em ${smartItems.length} item(ns).`, 'pedidoint', ''));
  if(capitalRows[0] && stockCapital>0) tasks.push(dcTask('Reduzir capital parado', `${esc(capitalRows[0].nome)} concentra ${BRL(capitalRows[0].capital)} em estoque.`, 'estoque', ''));
  if(resultado<0) tasks.push(dcTask('Rever despesas e margem', `Resultado mensal está negativo em ${BRL(Math.abs(resultado))}.`, 'pagar', 'warn'));
  if(!tasks.length) tasks.push(dcTask('Manter rotina de conferência', 'Sem alerta grave agora; revise compras, vencimentos e estoque crítico.', 'inventario', 'ok'));
  $('#dcToday').innerHTML = dcMiniList(tasks.slice(0,7), 'Nenhuma ação urgente encontrada.');

  const ownerAlerts=((owner.data||{}).lojas||[]).flatMap(l=>(l.alertas||[]).map(a=>({ ...a, loja:l.loja })));
  const alerts=ownerAlerts.map(a=>dcTask(esc(a.texto||'Alerta'), esc(a.loja||scope), null, a.nivel==='alerta'?'warn':''));
  if(negative.length) alerts.unshift(dcTask('Produtos com estoque negativo', `${negative.length} item(ns) precisam ajuste ou conferência.`, 'inventario', 'warn'));
  if(vencReceber>0) alerts.unshift(dcTask('Alta atenção ao crediário', `${BRL(vencReceber)} vencido reduz a entrada de caixa.`, 'crediariocrm', 'warn'));
  if(!cashCurrent.data) alerts.push(dcTask('Caixa fechado', 'Abra a gaveta para acompanhar saldo real do dia.', 'gaveta', 'warn'));
  $('#dcAlerts').innerHTML = dcMiniList(alerts.slice(0,8), 'Nenhum alerta inteligente no momento.');

  const champs=abcRows.filter(r=>r.classe==='A').slice(0,4).map(r=>
    dcTask(esc(r.nome), `${BRL(r.faturamento)} de faturamento · margem ${(+r.margem_pct||0).toFixed(1)}%.`, 'relatorio', 'ok'));
  const problems=[
    ...low.slice(0,3).map(p=>dcTask(esc(p.nome), `Estoque ${(+p.estoque||0).toLocaleString('pt-BR')} · mínimo ${(+p.estoque_min||0).toLocaleString('pt-BR')}.`, 'estoque', 'warn')),
    ...capitalRows.slice(0,3).map(p=>dcTask(esc(p.nome), `Capital parado estimado: ${BRL(p.capital)}.`, 'estoque', ''))
  ];
  $('#dcProducts').innerHTML = `
    <div class="muted" style="font-size:12px;margin-bottom:6px">Campeões</div>
    ${dcMiniList(champs, 'Ainda sem curva ABC no mês.')}
    <div class="muted" style="font-size:12px;margin:12px 0 6px">Problemas</div>
    ${dcMiniList(problems.slice(0,6), 'Nenhum produto crítico encontrado.')}`;

  const diag=[];
  diag.push(`A empresa está em nível <b>${scoreLabel.toLowerCase()}</b> (${score}/100).`);
  diag.push(minSaldo<0 ? `O principal risco é caixa: a projeção fica negativa em até 30 dias, então compras novas devem ser aprovadas contra recebimentos reais.` : `O fluxo projetado não indica saldo negativo nos próximos 30 dias.`);
  diag.push(vencReceber>0 ? `A prioridade operacional é cobrança: existe ${BRL(vencReceber)} vencido, equivalente a ${totalReceber>0?(creditRatio*100).toFixed(1):'0'}% da carteira aberta.` : `O crediário não aparece como pressão relevante agora.`);
  diag.push(low.length ? `No estoque, ${low.length} item(ns) estão no mínimo ou abaixo; use o Pedido inteligente antes de comprar por hábito.` : `O estoque crítico está controlado, então a atenção pode ir para capital parado e margem.`);
  diag.push(smartTotal>0 ? `A compra sugerida soma ${BRL(smartTotal)}; compare esse valor com o caixa projetado antes de registrar o pedido.` : `Não há sugestão automática de compra com os parâmetros atuais.`);
  if(resultado<0) diag.push(`A DRE do mês está negativa; a próxima decisão deve cortar despesas, elevar margem ou reduzir produtos que consomem capital sem retorno.`);
  $('#dcDiagnosis').innerHTML = `<div style="display:grid;gap:8px">${diag.map(x=>`<p style="margin:0">${x}</p>`).join('')}</div>
    ${(dash.error||cf.error||dre.error||smart.error||owner.error||abc.error)?`<p class="muted" style="font-size:12px;margin-top:12px">Alguns módulos não responderam e foram ignorados nesta rodada. A Central continua usando os dados disponíveis.</p>`:''}`;
}
{ const b=$('#btnDcRefresh'); if(b) b.onclick=()=>loadDecisionCenter(); }
{ const b=$('#btnDcAnalyze'); if(b) b.onclick=async()=>{ await loadDecisionCenter(); const el=$('#dcDiagnosis'); if(el) el.scrollIntoView({behavior:'smooth',block:'start'}); }; }

// ======================= MÓDULOS DE INTELIGÊNCIA =======================
function intelGroupProducts(dim){
  const map={};
  (PRODUCTS||[]).forEach(p=>{
    const key=(dim==='fornecedor'?(p.fornecedor||p.supplier||'Sem fornecedor'):(p.categoria||'Sem categoria'))||'Sem grupo';
    const g=map[key]||(map[key]={nome:key,itens:0,capital:0,estoque:0,baixo:0,neg:0});
    g.itens++; g.estoque+=(+p.estoque||0); g.capital+=(+p.estoque||0)*(+p.custo||0);
    if(p.track_stock && +p.estoque_min>0 && +p.estoque<=+p.estoque_min) g.baixo++;
    if(p.track_stock && +p.estoque<0) g.neg++;
  });
  return Object.values(map).sort((a,b)=>b.capital-a.capital);
}
async function intelBase(){
  await loadProducts();
  const hoje=hojeISO(), mes=mesAtualISO(), fim30=dcAddDaysISO(30);
  const cashCurrent=await dcSafe(sb.rpc('erp_cash_current'));
  const cashSummary=cashCurrent.data?await dcSafe(sb.rpc('erp_cash_summary',{})):{data:null,error:null};
  const opening=cashCurrent.data?+(cashSummary.data&&cashSummary.data.esperado_gaveta||0):0;
  const [dash,cf,dre,abc,payOpen,payPaid,recv,smart,cbMarket,cbCfg]=await Promise.all([
    dcSafe(sb.rpc('erp_dashboard_multi',{p_ini:hoje,p_fim:hoje})),
    dcSafe(sb.rpc('erp_cashflow_forecast',{p_ini:hoje,p_fim:fim30,p_store:CURRENT_STORE,p_opening:opening})),
    dcSafe(sb.rpc('erp_dre',{p_ini:mes.ini,p_fim:mes.fim,p_store:CURRENT_STORE})),
    dcSafe(sb.rpc('erp_abc',{p_ini:mes.ini,p_fim:mes.fim,p_store:CURRENT_STORE})),
    dcSafe(sb.rpc('erp_payables_list',{p_ini:null,p_fim:null,p_status:'abertas',p_store:CURRENT_STORE})),
    dcSafe(sb.rpc('erp_payables_list',{p_ini:mes.ini,p_fim:mes.fim,p_status:'pagas',p_store:CURRENT_STORE})),
    dcSafe(sb.rpc('erp_receivables_list',{p_ini:null,p_fim:null,p_status:'abertas'})),
    dcSafe(sb.rpc('erp_smart_order',{p_store:CURRENT_STORE,p_dias:30,p_cobertura:30,p_supplier:null})),
    dcSafe(sb.rpc('erp_cashback_market_total')),
    dcSafe(sb.rpc('cashback_config_get'))
  ]);
  return {hoje,mes,fim30,cashCurrent,cashSummary,opening,dash,cf,dre,abc,payOpen,payPaid,recv,smart,cbMarket,cbCfg,products:PRODUCTS||[]};
}
function ixNormHeader(h){ return String(h||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,''); }
function ixGenericRows(text){
  const rows=csvRows(text); if(!rows.length) return {headers:[],rows:[]};
  const headers=rows[0].map(h=>String(h||'').trim());
  return {headers, rows:rows.slice(1).map(c=>{
    const o={}; headers.forEach((h,i)=>o[h]=c[i]||''); return o;
  }).filter(o=>Object.values(o).some(v=>String(v).trim()))};
}
function ixRules(tipo){
  return {
    produtos:{required:['nome'], numeric:['preco','custo','estoque','estoque_min'], importer:'produtos'},
    clientes:{required:['nome'], numeric:['limite_credito','frete'], importer:'clientes'},
    pagar:{required:['descricao','valor','vencimento'], numeric:['valor'], importer:'pagar'},
    vendas:{required:['data','total'], numeric:['total'], importer:null},
    compras:{required:['produto','qtd','custo'], numeric:['qtd','custo'], importer:null},
    receber:{required:['cliente','valor','vencimento'], numeric:['valor'], importer:null},
    movestoque:{required:['produto','qtd'], numeric:['qtd'], importer:null},
    maisvendidos:{required:['nome'], numeric:['qtd','faturamento','custo'], importer:'maisvendidos'}
  }[tipo]||{};
}
function ixModelText(tipo){
  const samples={
    produtos:'SKU;nome;PRECO;estoque;CUSTO;categoria;fornecedor;codigo de barra;estoque minimo\nRC001;Ração Premium 15kg;189,90;12;132,50;Ração;Distribuidora XYZ;7891000100103;4\n',
    clientes:'nome;telefone;documento;email;endereco;limite_credito;frete;obs\nMaria da Silva;21999998888;12345678900;maria@email.com;Rua A, 100;200;5;Cliente antigo\n',
    pagar:'descricao;valor;vencimento;fornecedor;categoria;centro_custo;conta_bancaria\nAluguel loja;2500;2026-08-10;Imobiliaria X;Aluguel;Despesa Fixa;Banco principal\n',
    vendas:'data;numero;cliente;total;forma_pagamento;loja\n2026-08-05;1001;Maria da Silva;189,90;dinheiro;Loja Centro\n',
    compras:'data;fornecedor;produto;qtd;custo;vencimento\n2026-08-05;Distribuidora XYZ;Ração Premium 15kg;10;132,50;2026-09-05\n',
    receber:'cliente;valor;vencimento;documento;telefone\nMaria da Silva;120,00;2026-08-20;12345678900;21999998888\n',
    movestoque:'data;produto;qtd;tipo;motivo\n2026-08-05;Ração Premium 15kg;5;entrada;Ajuste de importação\n',
    maisvendidos:'nome;sku;codigo_barras;qtd;faturamento;custo\nRação Premium 15kg;RC001;7891000100103;120;22788,00;15900,00\nAreia Higiênica 4kg;RC002;7891000100110;80;1592,00;960,00\n'
  };
  return samples[tipo]||samples.produtos;
}
function renderImportExcel(){
  const box=$('#ixSummary'); if(box&&!box.innerHTML) box.innerHTML='<div class="stat"><div class="k">Status</div><div class="v">Pronto</div><div class="muted" style="font-size:12px">aguardando arquivo</div></div>';
  const mes=$('#ixMes'); if(mes&&!mes.value) mes.value=(mesAtualISO().ini||'').slice(0,7);
  ixToggleTipo();
}
function ixToggleTipo(){
  const isMv=($('#ixTipo')||{}).value==='maisvendidos';
  [['#ixMes',isMv],['#ixMesNote',isMv],['#btnIxAbcHist',isMv]].forEach(([sel,on])=>{ const el=$(sel); if(el) el.classList.toggle('hide',!on); });
}
{ const b=$('#btnIxPick'); if(b) b.onclick=()=>$('#ixFile').click();
  const m=$('#btnIxModel'); if(m) m.onclick=()=>baixarCSV('modelo-'+($('#ixTipo').value||'produtos')+'.csv', ixModelText($('#ixTipo').value||'produtos'));
  const a=$('#btnIxApply'); if(a) a.onclick=()=>ixApply();
  const t=$('#ixTipo'); if(t) t.onchange=ixToggleTipo;
  const h=$('#btnIxAbcHist'); if(h) h.onclick=()=>ixAbcHistModal();
  const f=$('#ixFile'); if(f) f.onchange=async e=>{ const file=e.target.files[0]; if(!file)return; await ixRead(file); e.target.value=''; }; }
async function ixRead(file){
  const tipo=$('#ixTipo').value||'produtos';
  if(/\.(xlsx|xls)$/i.test(file.name) && !window.XLSX){
    $('#ixPreview').innerHTML='<p class="neg" style="padding:12px 0">Este navegador não tem leitor XLSX carregado. Salve a planilha como CSV/TSV e selecione novamente para importar com validação.</p>';
    $('#ixSummary').innerHTML='<div class="stat warn"><div class="k">Arquivo Excel</div><div class="v">Converter</div><div class="muted" style="font-size:12px">use CSV para esta instalação</div></div>';
    return;
  }
  const text=await file.text();
  const parsed=ixGenericRows(text), rules=ixRules(tipo), hNorm=parsed.headers.map(ixNormHeader);
  const req=(rules.required||[]), numCols=(rules.numeric||[]);
  const missing=req.filter(r=>!hNorm.includes(ixNormHeader(r)));
  const errors=[]; const valid=[];
  parsed.rows.forEach((r,idx)=>{
    const flat={}; parsed.headers.forEach(h=>flat[ixNormHeader(h)]=r[h]);
    const er=[]; req.forEach(k=>{ if(!String(flat[ixNormHeader(k)]||'').trim()) er.push('faltando '+k); });
    numCols.forEach(k=>{ const raw=flat[ixNormHeader(k)]; if(raw!=null&&String(raw).trim()&&numCSV(raw)==null) er.push(k+' inválido'); });
    if(er.length) errors.push({linha:idx+2,erro:er.join(', '),row:r}); else valid.push(r);
  });
  window._ix={tipo,file:file.name,parsed,valid,errors,missing};
  $('#ixSummary').innerHTML=`
    <div class="stat acc"><div class="k">Linhas lidas</div><div class="v">${parsed.rows.length}</div></div>
    <div class="stat"><div class="k">Válidas</div><div class="v">${valid.length}</div></div>
    <div class="stat ${errors.length||missing.length?'warn':'acc'}"><div class="k">Erros</div><div class="v">${errors.length+missing.length}</div></div>
    <div class="stat"><div class="k">Tipo</div><div class="v" style="font-size:18px">${esc(tipo)}</div><div class="muted" style="font-size:12px">${esc(file.name)}</div></div>`;
  const head=parsed.headers.slice(0,8).map(h=>`<th>${esc(h)}</th>`).join('');
  const rows=valid.slice(0,8).map(r=>`<tr>${parsed.headers.slice(0,8).map(h=>`<td>${esc(r[h])}</td>`).join('')}</tr>`).join('');
  const errRows=errors.slice(0,8).map(e=>`<tr><td>${e.linha}</td><td class="neg">${esc(e.erro)}</td></tr>`).join('');
  $('#ixPreview').innerHTML=`
    ${missing.length?`<p class="neg">Colunas obrigatórias ausentes: ${missing.map(esc).join(', ')}.</p>`:''}
    <div class="tbl-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows||'<tr><td class="muted">Sem linhas válidas.</td></tr>'}</tbody></table></div>
    <h3 style="font-size:15px;margin:14px 0 6px">Erros encontrados</h3>
    <div class="tbl-wrap"><table><thead><tr><th>Linha</th><th>Erro</th></tr></thead><tbody>${errRows||'<tr><td colspan="2" class="muted" style="text-align:center;padding:12px">Nenhum erro.</td></tr>'}</tbody></table></div>
    ${!rules.importer?'<p class="muted" style="font-size:12px;margin-top:8px">Este tipo ainda fica como validação assistida: a estrutura foi padronizada, mas não há RPC segura de importação em lote para gravar sem risco de duplicar movimentos financeiros/estoque.</p>':''}`;
}
async function ixApply(){
  const ctx=window._ix; if(!ctx){ toast('Selecione um arquivo primeiro.',true); return; }
  if(ctx.missing&&ctx.missing.length){ toast('Corrija as colunas obrigatórias antes de importar.',true); return; }
  const rules=ixRules(ctx.tipo);
  if(!rules.importer){ toast('Este tipo foi validado, mas não será gravado automaticamente nesta fase.',true); return; }
  if(ctx.tipo==='produtos'){ window._importRows=parseCSV([ctx.parsed.headers.join(';')].concat(ctx.valid.map(r=>ctx.parsed.headers.map(h=>r[h]).join(';'))).join('\n')); return doImport(); }
  if(ctx.tipo==='clientes'){ window._custImport=parseCustCSV([ctx.parsed.headers.join(';')].concat(ctx.valid.map(r=>ctx.parsed.headers.map(h=>r[h]).join(';'))).join('\n')); return doCustImport(); }
  if(ctx.tipo==='maisvendidos'){
    const mes=($('#ixMes')||{}).value; if(!mes){ toast('Selecione o mês de competência antes de importar.',true); return; }
    const rows=ctx.valid.map(r=>{ const m={}; Object.keys(r).forEach(k=>m[ixNormHeader(k)]=r[k]); return {
      nome:String(m.nome||'').trim(),
      sku:String(m.sku||m.codigo||'').trim(),
      codigo_barras:String(m.codigobarras||m.codigodebarra||m.ean||'').trim(),
      qtd:numCSV(m.qtd)||0,
      faturamento:numCSV(m.faturamento||m.faturado||m.total)||0,
      custo:numCSV(m.custo)||0
    }; }).filter(r=>r.nome||r.sku||r.codigo_barras);
    if(!rows.length){ toast('Nenhuma linha válida para importar.',true); return; }
    const { data, error }=await sb.rpc('erp_sales_history_import',{ p_rows:rows, p_month:mes+'-01', p_store:CURRENT_STORE });
    if(error){ toast('Erro: '+error.message,true); return; }
    const info=data||{};
    toast(`${info.ok||rows.length} produto(s) importados no mês ${mes} · ${info.matched||0} casados com o cadastro.`);
    return;
  }
  if(ctx.tipo==='pagar'){
    const rows=ctx.valid.map(r=>{ const m={}; Object.keys(r).forEach(k=>m[ixNormHeader(k)]=r[k]); return m; });
    let ok=0;
    for(const r of rows){
      const p={store_id:CURRENT_STORE,descricao:r.descricao||r.conta||'Conta importada',valor:numCSV(r.valor)||0,vencimento:r.vencimento,
        categoria:r.categoria||null,centro_custo:r.centrocusto||r.centro_custo||null,conta_bancaria:r.contabancaria||r.conta_bancaria||null};
      if(!p.valor||!p.vencimento) continue;
      const { error }=await sb.rpc('erp_payable_create',{p}); if(!error) ok++;
    }
    toast(ok+' conta(s) a pagar importada(s).'); loadPayables();
  }
}
function ixAbcHistModal(){
  const now=(mesAtualISO().ini||'').slice(0,7);
  const [yy,mm]=now.split('-').map(Number); const di=new Date(yy,(mm||1)-1-5,1);
  const ini6=`${di.getFullYear()}-${String(di.getMonth()+1).padStart(2,'0')}`;
  modal(`<div class="m-head"><h3>📈 Curva ABC histórica <span class="muted" style="font-size:13px;font-weight:400">(dados importados)</span></h3><button data-modal-close>×</button></div>
    <div class="m-body">
      <div class="head" style="gap:8px;flex-wrap:wrap;align-items:flex-end">
        <label style="font-size:12px">De<br><input type="month" id="ixAbcIni" class="in" value="${ini6}"></label>
        <label style="font-size:12px">Até<br><input type="month" id="ixAbcFim" class="in" value="${now}"></label>
        <label style="font-size:12px">Ordenar por<br><select id="ixAbcMetric" class="in"><option value="faturamento">Faturamento</option><option value="qtd">Quantidade</option></select></label>
        <button class="btn" id="ixAbcCalc">Calcular</button>
      </div>
      <div id="ixAbcBody"><p class="muted" style="padding:20px">Selecione o período e clique em Calcular.</p></div>
    </div>`);
  const run=()=>ixAbcHistCalc();
  const c=$('#ixAbcCalc'); if(c) c.onclick=run;
  ['ixAbcMetric','ixAbcIni','ixAbcFim'].forEach(id=>{ const el=$('#'+id); if(el) el.onchange=run; });
  run();
}
async function ixAbcHistCalc(){
  const iniM=($('#ixAbcIni')||{}).value, fimM=($('#ixAbcFim')||{}).value, metric=($('#ixAbcMetric')||{}).value||'faturamento';
  if(!iniM||!fimM){ return; }
  const body=$('#ixAbcBody'); if(body) body.innerHTML='<p class="muted" style="padding:20px">Calculando…</p>';
  const { data, error }=await sb.rpc('erp_abc_history',{ p_ini:iniM+'-01', p_fim:fimM+'-01', p_store:CURRENT_STORE, p_metric:metric });
  if(error){ if(body) body.innerHTML=`<p class="neg" style="padding:20px">Erro: ${esc(error.message)}</p>`; return; }
  const rows=data||[];
  if(!rows.length){ if(body) body.innerHTML='<p class="muted" style="padding:24px;text-align:center">Sem histórico importado para este período. Importe os mais vendidos mês a mês na Importação inteligente.</p>'; return; }
  const isQtd=metric==='qtd';
  const cor={A:'var(--green)',B:'var(--amber)',C:'var(--ink2)'};
  const cls={A:0,B:0,C:0}, val={A:0,B:0,C:0};
  rows.forEach(r=>{ cls[r.classe]++; val[r.classe]+=+(isQtd?r.qtd:r.faturamento)||0; });
  const totFat=rows.reduce((a,r)=>a+(+r.faturamento||0),0), totQtd=rows.reduce((a,r)=>a+(+r.qtd||0),0);
  if(body) body.innerHTML=`
    <div class="stats" style="margin-bottom:12px">
      ${['A','B','C'].map(k=>`<div class="stat"><div class="k" style="color:${cor[k]}">Classe ${k}</div>
        <div class="v">${cls[k]} <span style="font-size:14px" class="muted">itens</span></div>
        <div class="muted" style="font-size:12px">${isQtd?(val[k].toLocaleString('pt-BR')+' un'):BRL(val[k])}</div></div>`).join('')}
      <div class="stat acc"><div class="k">Total</div><div class="v">${BRL(totFat)}</div>
        <div class="muted" style="font-size:12px">${totQtd.toLocaleString('pt-BR')} un · ${rows.length} produtos</div></div>
    </div>
    <p class="muted" style="font-size:12px;margin:0 0 8px">Classificação por <b>${isQtd?'quantidade':'faturamento'}</b>. Classe A = até 80% acumulado, B = até 95%, C = restante.</p>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Produto</th><th class="r">Qtd</th><th class="r">Faturamento</th><th class="r">${isQtd?'% qtd':'% fat'}</th><th class="r">Acum.</th><th>Classe</th><th class="r">Meses</th></tr></thead>
      <tbody>${rows.map(r=>`<tr>
        <td>${esc(r.nome)}${r.product_id?'':' <span class="chip warn" style="font-size:10px">sem cadastro</span>'}</td>
        <td class="r">${(+r.qtd||0).toLocaleString('pt-BR')}</td>
        <td class="r"><b>${BRL(r.faturamento)}</b></td>
        <td class="r">${(+r.pct||0).toFixed(1)}%</td>
        <td class="r muted">${(+r.pct_acum||0).toFixed(1)}%</td>
        <td><span class="chip" style="background:${cor[r.classe]};color:#fff">${r.classe}</span></td>
        <td class="r muted">${+r.meses||0}</td>
      </tr>`).join('')}</tbody></table></div>`;
}
async function renderFinanceiroInt(){
  const box=$('#fiStats'); if(box) box.innerHTML='<p class="muted" style="padding:10px 0">Calculando...</p>';
  const b=await intelBase(), c=b.cf.data||{}, d=b.dre.data||{};
  const abertas=b.payOpen.data||[], pagas=b.payPaid.data||[];
  const devia=abertas.reduce((a,r)=>a+(+r.valor||0),0)+pagas.reduce((a,r)=>a+(+r.valor||0),0);
  const pago=pagas.reduce((a,r)=>a+(+r.valor_pago||+r.valor||0),0);
  const diff=devia-pago;
  $('#fiStats').innerHTML=`
    <div class="stat ${(+c.min_saldo||0)<0?'warn':'acc'}"><div class="k">Menor caixa 30d</div><div class="v ${(+c.min_saldo||0)<0?'neg':''}">${BRL(c.min_saldo||0)}</div></div>
    <div class="stat"><div class="k">Entradas previstas</div><div class="v">${BRL(c.total_entradas||0)}</div></div>
    <div class="stat warn"><div class="k">Saídas previstas</div><div class="v">${BRL(c.total_saidas||0)}</div></div>
    <div class="stat ${(+d.resultado||0)<0?'warn':'acc'}"><div class="k">Resultado mensal</div><div class="v ${(+d.resultado||0)<0?'neg':''}">${BRL(d.resultado||0)}</div><div class="muted" style="font-size:12px">margem ${(+d.margem_bruta_pct||0).toFixed(1)}%</div></div>`;
  const insights=[
    (+c.min_saldo||0)<0 ? `O caixa fica negativo em 30 dias. Antes de comprar, renegocie vencimentos ou antecipe cobrança.` : `O fluxo projetado está positivo; compras novas ainda devem respeitar o saldo mínimo.`,
    (+d.resultado||0)<0 ? `A DRE do mês está negativa. Ataque despesas e produtos com margem baixa.` : `A operação do mês está positiva; proteja margem e não aumente estoque sem giro.`,
    diff>0 ? `Ainda há ${BRL(diff)} em obrigações abertas ou não pagas no recorte analisado.` : `Pagamentos do período estão compatíveis com o previsto.`
  ];
  $('#fiInsights').innerHTML=insights.map(x=>dcTask(x,'Recomendação financeira',null,(x.includes('negativ')||x.includes('Ainda há'))?'warn':'ok')).join('');
  $('#fiCompare').innerHTML=`
    ${dcLine('Deveria pagar', BRL(devia))}
    ${dcLine('Foi pago', BRL(pago), 'ok')}
    ${dcLine('Diferença', BRL(diff), diff>0?'neg':'')}
    <p class="muted" style="font-size:13px;margin-top:10px">Impacto no caixa: ${diff>0?'se tudo vencer junto, preserve '+BRL(diff)+' antes de compras.':'sem pressão adicional neste comparativo.'}</p>`;
}
{ const b=$('#btnFiRefresh'); if(b)b.onclick=renderFinanceiroInt; const c=$('#btnFiCashflow'); if(c)c.onclick=()=>cashflowModal(); const d=$('#btnFiDre'); if(d)d.onclick=()=>dreModal(); }
async function renderEstoqueInt(){
  const b=await intelBase(), p=b.products, abc=b.abc.data||[], smart=((b.smart.data||{}).fornecedores||[]);
  const low=p.filter(x=>x.track_stock&&+x.estoque_min>0&&+x.estoque<=+x.estoque_min), neg=p.filter(x=>x.track_stock&&+x.estoque<0);
  const cap=p.filter(x=>x.track_stock&&+x.estoque>0&&+x.custo>0).map(x=>({...x,capital:+x.estoque*(+x.custo||0)})).sort((a,b)=>b.capital-a.capital);
  const totalCap=cap.reduce((a,x)=>a+x.capital,0), smartTotal=smart.reduce((a,g)=>a+(+g.total_custo||0),0);
  $('#eiStats').innerHTML=`
    <div class="stat"><div class="k">Capital parado</div><div class="v">${BRL(totalCap)}</div></div>
    <div class="stat ${low.length?'warn':'acc'}"><div class="k">Estoque crítico</div><div class="v">${low.length}</div></div>
    <div class="stat ${neg.length?'warn':'acc'}"><div class="k">Negativos</div><div class="v">${neg.length}</div></div>
    <div class="stat"><div class="k">Compra sugerida</div><div class="v">${BRL(smartTotal)}</div></div>`;
  const acts=[
    ...low.slice(0,4).map(x=>dcTask('Comprar '+esc(x.nome),`Saldo ${+x.estoque||0}; mínimo ${+x.estoque_min||0}.`,'pedidoint','warn')),
    ...cap.slice(0,4).map(x=>dcTask('Reduzir '+esc(x.nome),`Capital parado ${BRL(x.capital)}; avalie promoção ou transferência.`,'promocoes',''))
  ];
  $('#eiActions').innerHTML=dcMiniList(acts,'Sem ação de estoque agora.');
  $('#eiCapital').innerHTML=dcMiniList(cap.slice(0,8).map(x=>dcTask(esc(x.nome),`${BRL(x.capital)} em estoque · ${(+x.estoque||0).toLocaleString('pt-BR')} un.`, 'estoque','')), 'Sem capital em estoque.');
  const champs=abc.filter(x=>x.classe==='A').slice(0,5).map(x=>dcTask(esc(x.nome),`${BRL(x.faturamento)} faturados · margem ${(+x.margem_pct||0).toFixed(1)}%.`,'relatorio','ok'));
  const probs=[...low.slice(0,4),...neg.slice(0,4)].map(x=>dcTask(esc(x.nome),`Saldo ${(+x.estoque||0).toLocaleString('pt-BR')} · mínimo ${(+x.estoque_min||0).toLocaleString('pt-BR')}.`,'inventario','warn'));
  $('#eiProducts').innerHTML='<div class="grid2"><div>'+dcMiniList(champs,'Sem campeões no mês.')+'</div><div>'+dcMiniList(probs,'Sem problemas críticos.')+'</div></div>';
}
{ const b=$('#btnEiRefresh'); if(b)b.onclick=renderEstoqueInt; const a=$('#btnEiAbc'); if(a)a.onclick=()=>{ const m=mesAtualISO(); $('#repIni').value=m.ini; $('#repFim').value=m.fim; $('#btnAbc').click(); }; }
async function renderSortimento(){
  await loadProducts(); const dim=($('#sortDim')||{}).value||'categoria', groups=intelGroupProducts(dim), m=mesAtualISO();
  const abc=(await dcSafe(sb.rpc('erp_abc',{p_ini:m.ini,p_fim:m.fim,p_store:CURRENT_STORE}))).data||[];
  const byProd={}; abc.forEach(r=>byProd[r.product_id||r.nome]=r);
  groups.forEach(g=>{
    const items=(PRODUCTS||[]).filter(p=>(dim==='fornecedor'?(p.fornecedor||p.supplier||'Sem fornecedor'):(p.categoria||'Sem categoria'))===g.nome);
    g.fat=items.reduce((a,p)=>{ const r=byProd[p.id]||byProd[p.nome]||{}; return a+(+r.faturamento||0); },0);
    g.margem=items.reduce((a,p)=>{ const r=byProd[p.id]||byProd[p.nome]||{}; return a+(+r.margem||0); },0);
  });
  const totalCap=groups.reduce((a,g)=>a+g.capital,0), totalFat=groups.reduce((a,g)=>a+g.fat,0);
  $('#sortStats').innerHTML=`<div class="stat"><div class="k">Grupos</div><div class="v">${groups.length}</div></div><div class="stat"><div class="k">Capital</div><div class="v">${BRL(totalCap)}</div></div><div class="stat"><div class="k">Faturamento mês</div><div class="v">${BRL(totalFat)}</div></div>`;
  $('#sortBody').innerHTML=groups.map(g=>{
    const roi=g.capital>0?g.margem/g.capital:0, share=totalFat>0?g.fat/totalFat:0;
    const dec=g.capital>0&&g.fat===0?'Liquidar estoque':roi<.08&&g.capital>0?'Reduzir compra':share>.25&&roi>.15?'Manter e proteger':'Comprar sob demanda';
    const cls=dec.includes('Liquidar')||dec.includes('Reduzir')?'warn':'ok';
    return `<tr><td><b>${esc(g.nome)}</b></td><td class="r">${g.itens}</td><td class="r">${BRL(g.capital)}</td><td class="r">${BRL(g.fat)}</td><td class="r">${BRL(g.margem)}</td><td><span class="chip ${cls}">${dec}</span></td></tr>`;
  }).join('')||'<tr><td colspan="6" class="muted" style="text-align:center;padding:14px">Sem dados.</td></tr>';
  const sg=$('#simGrupo'); if(sg) sg.innerHTML='<option value="">Selecione</option>'+groups.map(g=>`<option value="${esc(g.nome)}">${esc(g.nome)} · ${BRL(g.capital)}</option>`).join('');
}
{ const b=$('#btnSortRefresh'); if(b)b.onclick=renderSortimento; const s=$('#sortDim'); if(s)s.onchange=renderSortimento; }
async function renderContagemEx(){
  await loadProducts(); const limit=parseInt(($('#ceLimit')||{}).value)||12;
  const rows=(PRODUCTS||[]).filter(p=>p.track_stock).map(p=>{
    const capital=(+p.estoque||0)*(+p.custo||0), motivos=[];
    let risk=0; if(+p.estoque<0){risk+=50;motivos.push('negativo');}
    if(+p.estoque_min>0&&+p.estoque<=+p.estoque_min){risk+=35;motivos.push('mínimo');}
    if(capital>0){risk+=Math.min(25,capital/500);motivos.push('valor');}
    if(String(p.unidade||'').toUpperCase()==='KG'){risk+=10;motivos.push('granel');}
    return {...p,capital,risk,motivos};
  }).sort((a,b)=>b.risk-a.risk).slice(0,limit);
  const conf=Math.max(70,100-Math.round(rows.reduce((a,r)=>a+r.risk,0)/Math.max(1,rows.length)/2));
  $('#ceStats').innerHTML=`<div class="stat ${conf<90?'warn':'acc'}"><div class="k">Confiabilidade estimada</div><div class="v">${conf}%</div></div><div class="stat"><div class="k">Itens para hoje</div><div class="v">${rows.length}</div></div><div class="stat"><div class="k">Valor auditado</div><div class="v">${BRL(rows.reduce((a,r)=>a+r.capital,0))}</div></div>`;
  $('#ceBody').innerHTML=rows.map(r=>`<tr><td><b>${esc(r.nome)}</b></td><td>${r.motivos.map(m=>`<span class="chip warn">${esc(m)}</span>`).join(' ')}</td><td class="r">${(+r.estoque||0).toLocaleString('pt-BR')}</td><td class="r">${(+r.estoque_min||0).toLocaleString('pt-BR')}</td><td class="r">${BRL(r.capital)}</td><td class="r"><b>${Math.round(r.risk)}</b></td></tr>`).join('');
}
{ const b=$('#btnCeRefresh'); if(b)b.onclick=renderContagemEx; const o=$('#btnCeOpen'); if(o)o.onclick=()=>openBoPage('inventario'); }
async function renderGranelInt(){
  await loadProducts(); const kg=(PRODUCTS||[]).filter(p=>String(p.unidade||'').toUpperCase()==='KG'||String(p.nome||'').toLowerCase().includes('granel'));
  const total=kg.reduce((a,p)=>a+(+p.estoque||0)*(+p.custo||0),0);
  $('#grStats').innerHTML=`<div class="stat"><div class="k">Produtos KG</div><div class="v">${kg.length}</div></div><div class="stat"><div class="k">Capital em granel</div><div class="v">${BRL(total)}</div></div><div class="stat ${DB.cfg.balanca&&DB.cfg.balanca.ativa?'acc':'warn'}"><div class="k">Balança</div><div class="v">${DB.cfg.balanca&&DB.cfg.balanca.ativa?'Ativa':'Inativa'}</div></div>`;
  $('#grBody').innerHTML=kg.map(p=>{
    const pack=+p.pack_size||25, saldo=+p.estoque||0, rest=((saldo%pack)+pack)%pack, perda=Math.max(0,pack-rest)*0.01, val=perda*(+p.custo||0);
    const rec=saldo<pack?'Acompanhar lote aberto':rest<pack*.15?'Fechar saco e registrar perda':'Operação normal';
    return `<tr><td><b>${esc(p.nome)}</b></td><td class="r">${pack.toLocaleString('pt-BR')} kg</td><td class="r">${saldo.toLocaleString('pt-BR')} kg</td><td class="r">${rest.toLocaleString('pt-BR')} kg</td><td class="r">${perda.toLocaleString('pt-BR',{maximumFractionDigits:2})} kg · ${BRL(val)}</td><td><span class="chip ${rec.includes('Fechar')?'warn':'ok'}">${rec}</span></td></tr>`;
  }).join('')||'<tr><td colspan="6" class="muted" style="text-align:center;padding:14px">Nenhum produto KG/granel cadastrado.</td></tr>';
}
{ const b=$('#btnGrRefresh'); if(b)b.onclick=renderGranelInt; const c=$('#btnGrConfig'); if(c)c.onclick=()=>openBoPage('config'); }
async function renderCredInt(){
  const b=await intelBase(), rows=b.recv.data||[], by={};
  rows.forEach(r=>{ const k=r.customer_id||r.cliente_nome||'Cliente'; const g=by[k]||(by[k]={nome:r.cliente_nome||'Cliente',aberto:0,vencido:0,maxd:0,n:0}); g.aberto+=+r.valor||0; g.n++; if(r.atrasada){g.vencido+=+r.valor||0; g.maxd=Math.max(g.maxd,Math.abs(crmDaysTo(r.vencimento)||0));} });
  const list=Object.values(by).sort((a,b)=>b.vencido-a.vencido||b.aberto-a.aberto);
  const total=list.reduce((a,x)=>a+x.aberto,0), venc=list.reduce((a,x)=>a+x.vencido,0);
  $('#ciStats').innerHTML=`<div class="stat"><div class="k">Carteira</div><div class="v">${BRL(total)}</div></div><div class="stat ${venc?'warn':'acc'}"><div class="k">Vencido</div><div class="v">${BRL(venc)}</div></div><div class="stat"><div class="k">Clientes</div><div class="v">${list.length}</div></div>`;
  $('#ciBody').innerHTML=list.map(c=>{
    const score=Math.max(0,100-Math.min(70,c.maxd*2)-Math.min(30,(c.vencido/Math.max(1,c.aberto))*60));
    const lim=Math.max(0, score>=80?c.aberto*1.5:score>=60?c.aberto:score>=40?c.aberto*.5:0);
    const dec=score<40?'Não liberar novo crédito':score<60?'Liberar só com entrada':'Liberar dentro do limite';
    return `<tr><td><b>${esc(c.nome)}</b></td><td class="r">${BRL(c.aberto)}</td><td class="r ${c.vencido?'neg':''}">${BRL(c.vencido)}</td><td class="r">${c.maxd}d</td><td class="r"><b>${Math.round(score)}</b></td><td class="r">${BRL(lim)}</td><td><span class="chip ${score<60?'warn':'ok'}">${dec}</span></td></tr>`;
  }).join('')||'<tr><td colspan="7" class="muted" style="text-align:center;padding:14px">Sem carteira em aberto.</td></tr>';
}
{ const b=$('#btnCiRefresh'); if(b)b.onclick=renderCredInt; }
async function renderCashbackInt(){
  const b=await intelBase(), cfg=b.cbCfg.data||{}, mercado=+(b.cbMarket.data||0), d=b.dash.data||{};
  const vista=+(d.total_geral||0), pct=+cfg.percent||0, pot=vista*pct/100;
  $('#cbiStats').innerHTML=`<div class="stat ${cfg.ativo?'acc':'warn'}"><div class="k">Programa</div><div class="v">${cfg.ativo?'Ativo':'Inativo'}</div></div><div class="stat"><div class="k">Cashback no mercado</div><div class="v">${BRL(mercado)}</div></div><div class="stat"><div class="k">% padrão</div><div class="v">${pct.toFixed(1)}%</div></div><div class="stat"><div class="k">Distribuição potencial hoje</div><div class="v">${BRL(pot)}</div></div>`;
  $('#cbiPolicy').innerHTML=[
    dcTask('Cashback somente para venda à vista','Dinheiro, PIX e cartão configurável. Crediário não gera cashback.',null,'ok'),
    dcTask('Use como incentivo de caixa','Aumente o benefício quando precisar trocar prazo por entrada imediata.',null,''),
    dcTask('Monitore vencimentos','Saldos próximos do vencimento devem virar recompra, não despesa esquecida.',null,mercado>0?'warn':'ok')
  ].join('');
  $('#cbiImpact').innerHTML=`${dcLine('Saldo distribuído aberto',BRL(mercado))}${dcLine('Custo potencial sobre vendas de hoje',BRL(pot))}${dcLine('Venda à vista necessária para pagar o incentivo',BRL(pct>0?pot/(pct/100):0))}<p class="muted" style="font-size:13px;margin-top:10px">Objetivo: estimular entrada de caixa sem premiar novas vendas no crediário.</p>`;
}
{ const b=$('#btnCbRefresh'); if(b)b.onclick=renderCashbackInt; const c=$('#btnCbAdmin'); if(c)c.onclick=()=>cashbackAdmin(); }
async function renderSimuladores(){
  await renderSortimento();
  const box=$('#simResult');
  if(box && !box.innerHTML) box.innerHTML='<div class="card pad"><p class="muted">Informe os cenários e clique em Simular para ver o impacto no caixa.</p></div>';
}
{ const b=$('#btnSimRun'); if(b)b.onclick=simRun; }
async function simRun(){
  const b=await intelBase(), compra=num($('#simCompra').value), red=num($('#simReducao').value)/100, prazo=parseInt($('#simPrazo').value)||0, grupo=$('#simGrupo').value;
  const cf=b.cf.data||{}, saldo=+cf.saldo_final||0, groups=intelGroupProducts('categoria'), g=groups.find(x=>x.nome===grupo);
  const libera=(b.products||[]).reduce((a,p)=>a+Math.max(0,+p.estoque||0)*(+p.custo||0),0)*red;
  const economiaPrazo=((+cf.total_saidas||0)/30)*prazo;
  const grupoCap=g?g.capital:0;
  const novoSaldo=saldo-compra+libera+economiaPrazo+grupoCap;
  $('#simResult').innerHTML=`<div class="stats">
    <div class="stat ${saldo<0?'warn':'acc'}"><div class="k">Saldo projetado atual</div><div class="v">${BRL(saldo)}</div></div>
    <div class="stat warn"><div class="k">Compra adicional</div><div class="v">-${BRL(compra)}</div></div>
    <div class="stat acc"><div class="k">Caixa liberado</div><div class="v">${BRL(libera+economiaPrazo+grupoCap)}</div></div>
    <div class="stat ${novoSaldo<0?'warn':'acc'}"><div class="k">Novo saldo simulado</div><div class="v ${novoSaldo<0?'neg':''}">${BRL(novoSaldo)}</div></div>
  </div><div class="card pad" style="margin-top:14px">${dcLine('Redução de estoque',BRL(libera),'ok')}${dcLine('Prazo de fornecedor',BRL(economiaPrazo),'ok')}${dcLine('Eliminar grupo selecionado',BRL(grupoCap),'ok')}<p class="muted" style="font-size:13px;margin-top:10px">${novoSaldo<0?'A simulação coloca o caixa em risco. Reduza compra, cobre vencidos ou negocie prazo maior.':'A simulação é suportável pelo caixa projetado.'}</p></div>`;
}
function renderAssistente(){
  const out=$('#agOutput'); if(out&&!out.dataset.ready) out.innerHTML='<p class="muted" style="padding:10px 0">Clique em Analisar empresa para gerar o diagnóstico.</p>';
}
{ const b=$('#btnAgRun'); if(b)b.onclick=runAssistente; }
async function runAssistente(){
  const out=$('#agOutput'); if(out) out.innerHTML='<p class="muted" style="padding:10px 0">Analisando empresa...</p>';
  await loadDecisionCenter();
  const diag=($('#dcDiagnosis')||{}).innerHTML||'', today=($('#dcToday')||{}).innerHTML||'', alerts=($('#dcAlerts')||{}).innerHTML||'';
  if(out){ out.dataset.ready='1'; out.innerHTML=`<div class="grid2"><div><h3 style="font-size:16px;margin:0 0 8px">Prioridade do dia</h3>${today}</div><div><h3 style="font-size:16px;margin:0 0 8px">Riscos</h3>${alerts}</div></div><div style="margin-top:14px"><h3 style="font-size:16px;margin:0 0 8px">Diagnóstico</h3>${diag}</div>`; }
}

// ======================= DASHBOARD CONSOLIDADO =======================
async function loadConsolidado(ini, fim){
  const { data } = await sb.rpc('erp_dashboard_multi',{ p_ini:ini, p_fim:fim });
  const d=data||{};
  $('#consPeriodo').textContent = `${fmtDate(ini)} a ${fmtDate(fim)}`;
  $('#consGeral').innerHTML = `
    <div class="stat acc"><div class="k">Vendas (todas as lojas)</div><div class="v">${BRL(d.total_geral)}</div></div>
    <div class="stat"><div class="k">Nº de vendas</div><div class="v">${d.qtd_geral||0}</div></div>
    <div class="stat warn"><div class="k">A pagar</div><div class="v">${BRL(d.a_pagar_geral)}</div></div>
    <div class="stat"><div class="k">A receber</div><div class="v">${BRL(d.a_receber_geral)}</div></div>`;
  $('#consLojas').innerHTML = (d.lojas||[]).map(l=>`
    <div class="stat" style="${l.matriz?'border:2px solid var(--accent)':''}">
      <div class="k">${esc(l.nome)}${l.matriz?' ★':''}</div>
      <div class="v">${BRL(l.total)}</div>
      <div class="muted" style="font-size:12px">${l.qtd} venda(s) · a pagar ${BRL(l.a_pagar)}${+l.itens_baixos>0?` · <span class="neg">${l.itens_baixos} baixo(s)</span>`:''}</div>
    </div>`).join('');
}

const btnDR=$('#btnDelivRefresh'); if(btnDR) btnDR.onclick=()=>loadDeliveries();
['delivFilter','delivIni','delivFim'].forEach(id=>{ const el=$('#'+id); if(el) el.onchange=()=>loadDeliveries(); });
{ const b=$('#btnDelivHoje'); if(b) b.onclick=()=>{ const h=hojeISO(); setDates('delivIni','delivFim',h,h); loadDeliveries(); }; }
let DELIV_CHAN=null, DELIV_TIMER=null, DELIV_ROWS=[];
function delivDefaults(){ const i=$('#delivIni'); if(i && !i.value){ const h=hojeISO(); setDates('delivIni','delivFim',h,h); } }
function delivStartLive(){
  clearInterval(DELIV_TIMER);
  DELIV_TIMER=setInterval(()=>{ if(currentPage==='entregas') loadDeliveries(true); }, 20000);
  if(DELIV_CHAN) return;
  try{
    DELIV_CHAN = sb.channel('admin-entregas')
      .on('postgres_changes',{ event:'*', schema:'public', table:'deliveries' }, ()=>{ if(currentPage==='entregas') loadDeliveries(true); })
      .subscribe(st=>{ const c=$('#delivLive'); if(c) c.className = st==='SUBSCRIBED' ? 'chip ok' : 'chip amber'; });
  }catch(e){ console.error(e); }
}

/* ================= MAPA DE RASTREIO EM TEMPO REAL (Entregas) ================= */
const TRK = { map:null, layer:null, timer:null, fitted:false, pts:[] };
function trkBadge(emoji, ring){
  return '<div style="width:28px;height:28px;border-radius:50%;background:#fff;border:2px solid '+ring
    +';display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 1px 4px rgba(0,0,0,.4)">'+emoji+'</div>';
}
function trkIcon(emoji, ring){ return L.divIcon({ html:trkBadge(emoji,ring), className:'', iconSize:[28,28], iconAnchor:[14,14], popupAnchor:[0,-15] }); }
function trkInit(){
  if(TRK.map || typeof L==='undefined') return TRK.map;
  const el=document.getElementById('trkMap'); if(!el) return null;
  TRK.map = L.map(el,{ zoomControl:true }).setView([-14.235,-51.925], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ maxZoom:19, attribution:'© OpenStreetMap' }).addTo(TRK.map);
  TRK.layer = L.layerGroup().addTo(TRK.map);
  return TRK.map;
}
function trkStart(){
  const st=document.getElementById('trkStatus');
  if(typeof L==='undefined'){ if(st) st.textContent='mapa indisponível (offline)'; return; }
  trkInit(); if(!TRK.map) return;
  setTimeout(()=>{ try{ TRK.map.invalidateSize(); }catch(e){} }, 200);
  TRK.fitted=false;
  trkRefresh();
  clearInterval(TRK.timer);
  TRK.timer=setInterval(()=>{ if(currentPage!=='entregas'){ clearInterval(TRK.timer); TRK.timer=null; return; } trkRefresh(); }, 6000);
}
function trkPoint(lat,lng){ return lat==null||lng==null ? null : [+lat,+lng]; }
function trkDrawDeliveryRoutes(data,pts){
  const byCourier=new Map((data.motoboys||[]).map(m=>[String(m.id),m]));
  let gpsPoints=0;
  (data.entregas||[]).forEach(d=>{
    if(!d.courier_id || !d.dispatched_at || !['em_rota','entregue'].includes(d.status)) return;
    const mb=byCourier.get(String(d.courier_id)); if(!mb) return;
    const ini=Date.parse(d.dispatched_at), fim=Date.parse(d.delivered_at||data.em||new Date().toISOString());
    const gps=(mb.trail||[]).filter(p=>{
      const at=Date.parse(p.at); return p.lat!=null&&p.lng!=null&&Number.isFinite(at)&&at>=ini&&at<=fim;
    }).map(p=>[+p.lat,+p.lng]);
    const start=trkPoint(d.loja_lat,d.loja_lng);
    const end=d.status==='entregue' ? trkPoint(d.lat,d.lng) : trkPoint(mb.lat,mb.lng);
    const color=d.status==='entregue'?'#1f9d55':'#e2a400';
    const tip='Pedido #'+(d.venda_numero||'')+' · '+(d.status==='entregue'?'trajeto concluído':'em rota');
    if(gps.length>1){
      L.polyline(gps,{color,weight:5,opacity:.9}).addTo(TRK.layer).bindTooltip(tip);
      gps.forEach(p=>pts.push(p));
    }
    gpsPoints+=gps.length;
    const gap=(a,b)=>{
      if(!a||!b) return;
      let dist=999; try{ dist=TRK.map.distance(a,b); }catch(e){}
      if(dist<35) return;
      L.polyline([a,b],{color,weight:4,opacity:.75,dashArray:'8 9'})
        .addTo(TRK.layer).bindTooltip(tip+' · trecho estimado sem leitura GPS');
      pts.push(a,b);
    };
    if(gps.length){ gap(start,gps[0]); gap(gps[gps.length-1],end); }
    else gap(start,end);
  });
  return gpsPoints;
}
async function trkRefresh(){
  if(!TRK.map) return;
  const st=document.getElementById('trkStatus');
  let data;
  try{ const r=await sb.rpc('erp_delivery_tracking',{ p_minutos:240 }); if(r.error) throw r.error; data=r.data||{}; }
  catch(e){ if(st) st.textContent='sem conexão'; return; }
  TRK.layer.clearLayers();
  const pts=[];
  (data.lojas||[]).forEach(s=>{ if(s.lat==null||s.lng==null) return;
    L.marker([s.lat,s.lng],{icon:trkIcon('🏪','#12307a'),title:s.nome}).addTo(TRK.layer)
      .bindPopup('<b>🏪 '+esc(s.nome||'Loja')+'</b><br>'+esc(s.endereco||''));
    pts.push([s.lat,s.lng]);
  });
  (data.entregas||[]).forEach(d=>{ if(d.lat==null||d.lng==null) return;
    const ring = d.status==='em_rota' ? '#e2a400' : (d.status==='entregue' ? '#22a65a' : '#3b7de0');
    const m=L.marker([d.lat,d.lng],{icon:trkIcon('📦',ring),title:'#'+(d.venda_numero||'')}).addTo(TRK.layer);
    m.on('click',()=>{ if(typeof delivDetail==='function') delivDetail(d.id); });
    m.bindTooltip('#'+(d.venda_numero||'')+' · '+esc(d.cliente||''),{direction:'top'});
    pts.push([d.lat,d.lng]);
  });
  const routeGpsPoints=trkDrawDeliveryRoutes(data,pts);
  let online=0;
  (data.motoboys||[]).forEach(mb=>{
    const trail=(mb.trail||[]).filter(p=>p.lat!=null&&p.lng!=null).map(p=>[p.lat,p.lng]);
    if(trail.length>1){ L.polyline(trail,{color:mb.online?'#22a65a':'#8aa0c8',weight:4,opacity:.75}).addTo(TRK.layer); trail.forEach(p=>pts.push(p)); }
    if(mb.lat!=null&&mb.lng!=null){
      if(mb.online) online++;
      const when = mb.at ? fmtDT(mb.at) : '—';
      L.marker([mb.lat,mb.lng],{icon:trkIcon('🛵', mb.online?'#22a65a':'#8aa0c8'),title:mb.nome,zIndexOffset:1000}).addTo(TRK.layer)
        .bindPopup('<b>🛵 '+esc(mb.nome||'Motoboy')+'</b><br>'
          +(mb.online?'🟢 online agora':'⚪ offline · última posição '+when)+'<br>'
          +'Em rota: <b>'+(mb.em_rota||0)+'</b> · Entregues hoje: <b>'+(mb.entregues||0)+'</b>'
          +(mb.speed?'<br>Velocidade: ~'+Math.round((+mb.speed)*3.6)+' km/h':''));
      pts.push([mb.lat,mb.lng]);
    }
  });
  if(st) st.textContent = (data.motoboys||[]).length
    ? (online+' motoboy(s) online · '+routeGpsPoints+' ponto(s) GPS no trajeto · '+new Date().toLocaleTimeString('pt-BR'))
    : 'nenhum motoboy com posição ainda';
  TRK.pts=pts;
  if(pts.length && !TRK.fitted){ try{ TRK.map.fitBounds(pts,{padding:[30,30],maxZoom:16}); TRK.fitted=true; }catch(e){} }
}
function trkFit(){ if(TRK.map && TRK.pts.length){ try{ TRK.map.fitBounds(TRK.pts,{padding:[30,30],maxZoom:16}); }catch(e){} } }
{ const b=$('#btnTrkFit'); if(b) b.onclick=()=>trkFit(); }
async function loadDeliveries(silent){
  delivDefaults();
  const f=($('#delivFilter')||{}).value||null;
  const ini=($('#delivIni')||{}).value||null, fim=($('#delivFim')||{}).value||null;
  const { data, error } = await sb.rpc('erp_deliveries_all',{ p_status:f, p_ini:ini, p_fim:fim, p_store:null });
  if(error){ if(!silent) toast('Erro: '+error.message,true); return; }
  const rows=data||[]; DELIV_ROWS=rows;
  const fila=rows.filter(r=>r.status==='fila').length, rota=rows.filter(r=>r.status==='em_rota').length;
  const entregues=rows.filter(r=>r.status==='entregue');
  const tempos=entregues.map(r=>+r.minutos_entrega).filter(x=>x||x===0);
  const media=tempos.length? Math.round(tempos.reduce((a,b)=>a+b,0)/tempos.length) : null;
  $('#delivStats').innerHTML=`
    <div class="stat acc"><div class="k">Na fila</div><div class="v">${fila}</div></div>
    <div class="stat"><div class="k">Saíram para entrega</div><div class="v">${rota}</div></div>
    <div class="stat"><div class="k">Entregues no período</div><div class="v">${entregues.length}</div></div>
    <div class="stat"><div class="k">⏱️ Tempo médio de entrega</div><div class="v">${media==null?'—':dur(media)}</div>
      <div class="muted" style="font-size:12px">da saída até a entrega</div></div>`;
  $('#delivBody').innerHTML=rows.map(r=>{
    const chip={fila:'<span class="chip amber">na fila</span>',em_rota:'<span class="chip">saiu p/ entrega</span>',entregue:'<span class="chip ok">entregue</span>',cancelada:'<span class="chip warn">cancelada</span>'}[r.status]||r.status;
    let acoes='';
    if(r.status==='fila') acoes=`<button class="btn ghost sm" data-onclick="delivGuide('${r.id}')">Guia/QR</button> <button class="btn sm" data-onclick="delivStatus('${r.id}','em_rota')">Saiu</button> <button class="btn ghost sm red" data-onclick="delivStatus('${r.id}','cancelada')">Cancelar</button>`;
    else if(r.status==='em_rota') acoes=`<button class="btn ghost sm" data-onclick="delivGuide('${r.id}')">Guia/QR</button> <button class="btn green sm" data-onclick="delivDone('${r.id}')">Entregue</button>`;
    const wa=r.fone?`<a href="https://wa.me/${(r.fone||'').replace(/\D/g,'')}" target="_blank" class="chip" data-onclick="event.stopPropagation()">WhatsApp</a>`:'';
    const tempo = r.status==='entregue'
        ? (r.minutos_entrega!=null? `<b>${dur(r.minutos_entrega)}</b>` : '<span class="muted">—</span>')
        : (r.status==='em_rota' ? (r.eta_minutes!=null?`<span class="chip ok">~${dur(r.eta_minutes)}</span>${r.eta_distance_km!=null?`<br><span class="muted">${fmtNum(r.eta_distance_km)} km</span>`:''}`:(r.minutos_em_rota!=null?`<span class="chip ${+r.minutos_em_rota>60?'warn':'amber'}">em rota há ${dur(r.minutos_em_rota)}</span>`:'<span class="chip amber">calculando ETA</span>')):'<span class="muted">—</span>');
    return `<tr class="clickrow" data-onclick="delivDetail('${r.id}')">
      <td><b>#${r.venda_numero||''}</b></td><td>${esc(r.cliente||'—')} ${wa}</td><td>${esc(r.fone||'—')}</td>
      <td>${esc(r.endereco||'—')}</td><td>${esc(r.loja_nome||'—')}${r.recebida_de_outra?` <span class="chip">de ${esc(r.origem_nome||'')}</span>`:''}</td>
      <td class="r">${BRL(r.frete)}</td><td class="r"><b>${BRL(r.total)}</b></td>
      <td>${chip}</td><td class="c">${tempo}</td>
      <td class="r" style="white-space:nowrap" data-onclick="event.stopPropagation()">${acoes}</td></tr>`;
  }).join('')||'<tr><td colspan="10" class="muted" style="text-align:center;padding:20px">Nenhuma entrega no período.</td></tr>';
  delivStartLive();
}
window.delivStatus=async (id,st)=>{
  if(st==='cancelada' && !await uiConfirm('Cancelar esta entrega? O estoque será estornado.',{danger:true,okText:'Cancelar entrega',cancelText:'Voltar'})) return;
  const { error }=await sb.rpc('erp_delivery_status',{ p_id:id, p_status:st });
  if(error){ toast('Erro: '+error.message,true); return; }
  toast('Atualizado'); loadDeliveries();
};
window.delivDone=id=>{
  modal(`<div class="m-head"><h3>Confirmar entrega</h3><button data-modal-close>✕</button></div>
    <div class="m-body"><label class="lbl">Forma de pagamento recebida</label>
      <select id="dvPay" class="in"><option value="dinheiro">Dinheiro</option><option value="pix">PIX</option><option value="debito">Cartão débito</option><option value="credito">Cartão crédito</option></select></div>
    <div class="m-foot"><button class="btn ghost" data-modal-close>Cancelar</button><button class="btn green" data-onclick="delivConfirm('${id}')">Marcar entregue</button></div>`);
};
window.delivConfirm=async id=>{
  const { error }=await sb.rpc('erp_delivery_status',{ p_id:id, p_status:'entregue', p_forma:$('#dvPay').value });
  if(error){ toast('Erro: '+error.message,true); return; }
  closeModal(); toast('Entrega concluída ✅'); loadDeliveries();
};
/* ---------- roteirização multi-parada (#9) ---------- */
function _havKm(a,b){ const R=6371, dLat=(b.lat-a.lat)*Math.PI/180, dLng=(b.lng-a.lng)*Math.PI/180,
  s=Math.sin(dLat/2)**2+Math.cos(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(s)); }
window.delivRoteirizar=async ()=>{
  const abertas=(DELIV_ROWS||[]).filter(r=>r.status==='fila'||r.status==='em_rota');
  const stops=abertas.filter(r=>r.lat!=null&&r.lng!=null)
    .map(r=>({id:r.id,num:r.venda_numero,cliente:r.cliente,endereco:r.endereco,lat:+r.lat,lng:+r.lng}));
  const semGeo=abertas.length-stops.length;
  if(!stops.length){ toast('Nenhuma entrega com localização para roteirizar.'+(semGeo?(' ('+semGeo+' sem GPS)'):''),true); return; }
  // ponto de partida = loja atual (coords via tracking)
  let start=null;
  try{ const { data }=await sb.rpc('erp_delivery_tracking',{p_minutos:15});
    const lojas=(data&&data.lojas)||[];
    const loja=lojas.find(l=>l.id===(typeof CURRENT_STORE!=='undefined'?CURRENT_STORE:null))||lojas[0];
    if(loja&&loja.lat!=null) start={lat:+loja.lat,lng:+loja.lng,nome:loja.nome};
  }catch(e){ console.error('rota loja',e); }
  if(!start) start={lat:stops[0].lat,lng:stops[0].lng,nome:'1ª parada'};
  // vizinho mais próximo
  const order=[]; let cur=start; const rest=stops.slice();
  while(rest.length){ let bi=0,bd=Infinity; rest.forEach((s,i)=>{ const d=_havKm(cur,s); if(d<bd){bd=d;bi=i;} });
    const nx=rest.splice(bi,1)[0]; nx._km=bd; order.push(nx); cur=nx; }
  const totalKm=order.reduce((a,s)=>a+(s._km||0),0);
  const pts=[start].concat(order.map(s=>({lat:s.lat,lng:s.lng})));
  const gmaps='https://www.google.com/maps/dir/'+pts.map(p=>p.lat+','+p.lng).join('/');
  modal(`<div class="m-head"><h3>🧭 Rota otimizada · ${order.length} parada(s)</h3><button data-modal-close>✕</button></div>
    <div class="m-body">
      <div class="pdv-note" style="margin-bottom:10px">Ordem sugerida (vizinho mais próximo a partir da loja) · ~${totalKm.toFixed(1)} km no total.${semGeo?(' <b>'+semGeo+'</b> entrega(s) sem GPS ficaram de fora — abra a entrega e use “Localizar”.'):''}</div>
      <ol style="padding-left:22px;line-height:1.8;margin:0">${order.map(s=>`<li><b>#${s.num||''}</b> ${esc(s.cliente||'—')} <span class="muted">· ${esc(s.endereco||'')}</span> <a href="https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}" target="_blank" class="chip" data-onclick="event.stopPropagation()">mapa</a> <span class="muted" style="font-size:12px">(${(s._km||0).toFixed(1)} km)</span></li>`).join('')}</ol>
    </div>
    <div class="m-foot"><button class="btn ghost" data-modal-close>Fechar</button>
      <a class="btn green" href="${gmaps}" target="_blank" data-modal-close>📍 Abrir rota no Google Maps</a></div>`);
};
{ const b=$('#btnDelivRoute'); if(b) b.onclick=delivRoteirizar; }
/* ---------- guia de entrega ---------- */
function delivGuideHtml(r,qr){
  return '<div class="gd">'
    +'<div class="gd-h"><b>GUIA DE ENTREGA</b><br>Pedido #'+esc(r.venda_numero||'')+'</div>'
    +'<div class="gd-loja">SAI DA LOJA<br><b>'+esc(r.loja_nome||'—')+'</b>'
      +(r.recebida_de_outra?'<br><span class="gd-s">pedido feito na loja '+esc(r.origem_nome||'')+'</span>':'')+'</div>'
    +'<div class="gd-l"></div>'
    +'<div class="gd-b">'+esc(r.cliente||'—')+'</div>'
    +(r.fone?'<div>'+esc(r.fone)+'</div>':'')
    +'<div>'+esc(r.endereco||'—')+'</div>'
    +(r.obs?'<div class="gd-s">Obs: '+esc(r.obs)+'</div>':'')
    +'<div class="gd-l"></div>'
    +'<div class="gd-r"><span>Itens</span><span>'+BRL(r.subtotal)+'</span></div>'
    +'<div class="gd-r"><span>Frete</span><span>'+BRL(r.frete)+'</span></div>'
    +'<div class="gd-r gd-b"><span>TOTAL</span><span>'+BRL(r.total)+'</span></div>'
    +'<div class="gd-r"><span>Situação</span><span>'+(r.pago?'PAGO':'COBRAR NA ENTREGA')+'</span></div>'
    +'<div class="gd-l"></div>'
    +'<div class="gd-c"><img src="'+qr+'" alt="QR" width="180" height="180"></div>'
    +'<div class="gd-c gd-s">Escaneie: 1x = saiu · 2x = entregue</div></div>';
}
function delivGuideCss(){
  const P=paperDims();
  return '@page{size:'+P.page+' auto;margin:'+P.margin+'}'
    +'body{font-family:"Courier New",monospace;font-size:'+P.font+';color:#000;background:#fff;margin:0}'
    +'.gd{width:'+P.content+';color:#000}'
    +'.gd-h{text-align:center;font-size:14px;line-height:1.4;margin-bottom:6px}'
    +'.gd-loja{text-align:center;border:2px solid #000;border-radius:4px;padding:5px 4px;font-size:12px;line-height:1.35}'
    +'.gd-loja b{font-size:15px}'
    +'.gd-l{border-top:1px dashed #000;margin:6px 0}'
    +'.gd-r{display:flex;justify-content:space-between;gap:6px}'
    +'.gd-b{font-weight:bold}.gd-c{text-align:center}.gd-s{font-size:10.5px}'
    +'.gd-c img{display:block;margin:6px auto;max-width:100%;height:auto}';   // QR encolhe na bobina de 58 mm
}
function delivGuideText(r){
  const width=pdvPaper()==='58'?32:42;
  return [
    pdvTextCenter('GUIA DE ENTREGA',width),
    pdvTextCenter('Pedido #'+String(r.venda_numero||''),width),
    '='.repeat(width),
    pdvTextCenter('SAI DA LOJA',width),
    pdvTextCenter(r.loja_nome||'—',width),
    r.recebida_de_outra?'Origem: '+String(r.origem_nome||''):'',
    '-'.repeat(width),
    String(r.cliente||'—'),
    String(r.fone||''),
    String(r.endereco||'—'),
    r.obs?'Obs: '+String(r.obs):'',
    '-'.repeat(width),
    pdvTextPair('Itens',pdvPlainMoney(r.subtotal),width),
    pdvTextPair('Frete',pdvPlainMoney(r.frete),width),
    pdvTextPair('TOTAL',pdvPlainMoney(r.total),width),
    pdvTextPair('Situação',r.pago?'PAGO':'COBRAR NA ENTREGA',width),
    '-'.repeat(width),
    pdvTextCenter('Escaneie: 1x saiu / 2x entregue',width)
  ].filter(Boolean).join('\n');
}
window.delivGuidePrint=async()=>{
  const g=window._delivGuide; if(!g){ toast('Abra a guia primeiro.',true); return; }
  const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Guia #'
    +esc(g.r.venda_numero||'')+'</title><style>'+delivGuideCss()+'</style></head><body>'
    +delivGuideHtml(g.r,g.qr)+'</body></html>';
  return onpdvPrintText(delivGuideText(g.r),'guia #'+(g.r.venda_numero||''),{html,qr:g.qrData||''});
};
window.delivGuide=async id=>{
  const { data:r, error } = await sb.from('v_delivery_queue').select('*').eq('id',id).maybeSingle();
  if(error||!r){ toast('Entrega não encontrada.',true); return; }
  const qr=onpdvQrDataUrl(id,5,8)
    || ('https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data='+encodeURIComponent(id));
  window._delivGuide={ r:r, qr:qr, qrData:id };

  const corpo='<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start">'
    +'<div style="flex:1 1 250px;min-width:0">'
      +'<div style="font-size:12px;font-weight:900;letter-spacing:.4px;opacity:.75">SAI DA LOJA</div>'
      +'<div style="font-size:22px;font-weight:900;line-height:1.2">'+esc(r.loja_nome||'—')+'</div>'
      +(r.recebida_de_outra?'<div style="margin-top:4px"><span class="pdv-tag warn">pedido feito na loja '+esc(r.origem_nome||'')+'</span></div>':'')
      +'<div style="margin-top:12px;font-size:18px;font-weight:800">'+esc(r.cliente||'—')+'</div>'
      +'<div style="opacity:.85;font-size:13px;line-height:1.5">'+esc(r.fone||'')+'<br>'+esc(r.endereco||'—')+'</div>'
      +(r.obs?'<div style="opacity:.85;font-size:12.5px;margin-top:6px">Obs: '+esc(r.obs)+'</div>':'')
      +'<div style="margin-top:12px;font-size:20px;font-weight:900">'+BRL(r.total)+' '
        +'<span class="pdv-tag '+(r.pago?'ok':'warn')+'">'+(r.pago?'pago':'cobrar na entrega')+'</span></div>'
    +'</div>'
    +'<div style="flex:0 0 230px;text-align:center">'
      +'<div class="pdv-qr"><img src="'+qr+'" alt="QR"></div>'
      +'<div class="pdv-note" style="margin-top:6px">1 leitura = saiu · 2 leituras = entregue</div>'
    +'</div></div>';

  if(currentPage==='caixa'){
    pdvModal('Guia de entrega #'+(r.venda_numero||''),
      corpo+'<div class="pdv-btns">'
        +'<button class="pdv-btn" data-onclick="delivGuidePrint()">🖨️ Imprimir guia</button>'
        +'<button class="pdv-btn ghost" data-onclick="pdvCloseModal();pdvDeliveryQueue()">Voltar para a fila</button></div>');
    return;
  }
  modal('<div class="m-head"><h3>Guia de entrega #'+esc(r.venda_numero||'')+'</h3><button data-modal-close>✕</button></div>'
    +'<div class="m-body" style="color:var(--ink)">'
      +'<div style="text-align:center">'
        +'<div class="muted" style="font-size:12px;font-weight:900;letter-spacing:.4px">SAI DA LOJA</div>'
        +'<p style="font-family:Fredoka;font-size:24px;margin:0 0 2px"><b>'+esc(r.loja_nome||'—')+'</b></p>'
        +(r.recebida_de_outra?'<span class="chip">pedido feito na loja '+esc(r.origem_nome||'')+'</span>':'')
        +'<p style="font-family:Fredoka;font-size:20px;margin:10px 0 0"><b>'+esc(r.cliente||'—')+'</b></p>'
        +'<p class="muted" style="margin:2px 0">'+esc(r.fone||'')+' · '+esc(r.endereco||'—')+'</p>'
        +'<p style="font-size:19px;font-weight:800;margin:8px 0 0">'+BRL(r.total)+' · '+(r.pago?'pago':'cobrar na entrega')+'</p>'
        +'<img src="'+qr+'" alt="QR" style="margin:10px auto;display:block;width:200px;height:200px">'
        +'<p class="muted" style="font-size:12px">O motoboy escaneia para "Saiu" e novamente para "Entregue".</p>'
      +'</div></div>'
    +'<div class="m-foot"><button class="btn ghost" data-modal-close>Fechar</button>'
      +'<button class="btn" data-onclick="delivGuidePrint()">🖨️ Imprimir guia</button></div>');
};
// lista de entregas de TODAS as lojas (botão no caixa) + detalhe do pedido
window.openDeliveryList=async (status)=>{
  const { data } = await sb.rpc('erp_deliveries_all',{ p_status: status||null });
  const rows=data||[];
  const chip=s=>({fila:'<span class="chip amber">na fila</span>',em_rota:'<span class="chip">saiu p/ entrega</span>',entregue:'<span class="chip ok">entregue</span>',cancelada:'<span class="chip warn">cancelada</span>'}[s]||s);
  modal(`<div class="m-head"><h3>📋 Entregas — todas as lojas</h3><button data-modal-close>✕</button></div>
    <div class="m-body">
      <div class="pay-modes" id="dlFilter" style="margin-bottom:10px">
        <button data-s="" class="${!status?'act':''}">Todas</button>
        <button data-s="fila" class="${status==='fila'?'act':''}">Na fila</button>
        <button data-s="em_rota" class="${status==='em_rota'?'act':''}">Em rota</button>
        <button data-s="entregue" class="${status==='entregue'?'act':''}">Entregues</button>
      </div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>#</th><th>Cliente</th><th>Loja</th><th>Endereço</th><th class="r">Total</th><th>Status</th></tr></thead>
        <tbody>${rows.length? rows.map(r=>`<tr style="cursor:pointer" data-onclick="delivDetail('${r.id}')">
          <td><b>#${r.venda_numero||''}</b></td><td>${esc(r.cliente||'—')}</td>
          <td>${esc(r.loja_nome||'—')}${r.recebida_de_outra?` <span class="chip">de ${esc(r.origem_nome||'')}</span>`:''}</td>
          <td>${esc(r.endereco||'—')}</td><td class="r"><b>${BRL(r.total)}</b></td><td>${chip(r.status)}</td>
        </tr>`).join('') : '<tr><td colspan="6" class="muted" style="text-align:center;padding:18px">Nenhuma entrega.</td></tr>'}</tbody>
      </table></div>
    </div>`);
  const fl=$('#dlFilter'); if(fl) fl.querySelectorAll('button').forEach(b=> b.onclick=()=> openDeliveryList(b.dataset.s||null));
};
window.delivDetail=async id=>{
  const { data:d } = await sb.rpc('erp_delivery_detail',{ p_id:id });
  if(!d){ toast('Entrega não encontrada.',true); return; }
  const q=(DELIV_ROWS||[]).find(x=>x.id===id)||{};
  const itens=(d.itens||[]).map(it=>`<tr><td>${esc(it.descricao)}</td><td class="r">${(+it.qtd).toLocaleString('pt-BR')}</td><td class="r">${BRL(it.preco_unit)}</td><td class="r"><b>${BRL(it.subtotal)}</b></td></tr>`).join('');
  const chip={fila:'<span class="chip amber">na fila</span>',em_rota:'<span class="chip">saiu p/ entrega</span>',entregue:'<span class="chip ok">entregue</span>',cancelada:'<span class="chip warn">cancelada</span>'}[d.status]||esc(d.status);
  const tempo = q.minutos_entrega!=null ? dur(q.minutos_entrega) : (q.minutos_em_rota!=null? 'em rota há '+dur(q.minutos_em_rota) : '—');
  window._delivPrint={ d, q };
  modal(`<div class="m-head"><h3>Pedido #${d.venda_numero||''} ${chip}</h3><button data-modal-close>✕</button></div>
    <div class="m-body">
      <p style="font-family:Fredoka;font-size:19px;margin:0"><b>${esc(d.cliente||'—')}</b> <span class="muted" style="font-size:13px">${esc(d.fone||'')}</span></p>
      <p class="muted" style="margin:2px 0">${esc(d.endereco||'—')}</p>
      <p class="muted">Entrega: <b>${esc(d.loja_nome||'')}</b>${d.recebida_de_outra?` · pedido de ${esc(d.origem_nome||'')}`:''}</p>
      ${d.obs?`<p class="muted">Obs: ${esc(d.obs)}</p>`:''}
      <div style="background:#f7f9ff;border:1px solid var(--line);border-radius:10px;padding:10px;margin-top:8px">
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">Pedido criado</span><b>${fmtDT(d.created_at)}</b></div>
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">Saiu para entrega</span><b>${fmtDT(q.dispatched_at)}</b></div>
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">Entregue ao cliente</span><b>${fmtDT(d.delivered_at)}</b></div>
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">⏱️ Tempo de entrega</span><b>${tempo}</b></div>
        ${d.status==='em_rota'?`<div class="l" style="display:flex;justify-content:space-between"><span class="muted">📍 Previsão de chegada</span><b>${q.eta_arrival?fmtDT(q.eta_arrival):(q.eta_minutes?'em aproximadamente '+dur(q.eta_minutes):'calculando…')}</b></div>`:''}
      </div>
      <div class="tbl-wrap" style="margin-top:10px"><table>
        <thead><tr><th>Item</th><th class="r">Qtd</th><th class="r">Unit.</th><th class="r">Total</th></tr></thead>
        <tbody>${itens||'<tr><td colspan="4" class="muted">Sem itens.</td></tr>'}</tbody></table></div>
      <div class="sum" style="border-radius:12px;margin-top:8px">
        <div class="l"><span>Itens</span><b>${BRL(d.subtotal)}</b></div>
        <div class="l"><span>Frete</span><b>${BRL(d.frete)}</b></div>
        <div class="l big"><span>Total</span><b>${BRL(d.total)}</b></div>
      </div>
    </div>
    <div class="m-foot">
      <button class="btn ghost" data-onclick="delivPrint()">🖨️ Imprimir pedido</button>
      <button class="btn ghost" data-onclick="delivGuide('${d.id}')">Guia/QR</button>
      ${d.status==='fila'?`<button class="btn" data-onclick="delivStatus('${d.id}','em_rota');closeModal()">Marcar saída</button>`:''}
      ${d.status==='em_rota'?`<button class="btn green" data-onclick="closeModal();delivDone('${d.id}')">Marcar entregue</button>`:''}
      ${d.status==='entregue'&&d.fone?`<button class="btn ghost" data-onclick="npsWhats('${String(d.fone).replace(/\D/g,'')}','${esc(String(d.cliente||'').replace(/'/g,''))}','${d.venda_numero||''}')">💬 Pesquisa NPS</button>`:''}
      <button class="btn" data-modal-close>Fechar</button></div>`);
};
window.delivPrint=()=>{
  const x=window._delivPrint; if(!x) return; const d=x.d, q=x.q||{};
  const co=COMPANY||{};
  $('#receiptPrint').innerHTML = `
    <h3>${esc(co.nome||'Minha Loja')}</h3>
    <div class="c">PEDIDO DE ENTREGA #${d.venda_numero||''}</div><div class="ln"></div>
    <div class="b">${esc(d.cliente||'—')}</div>
    <div>${esc(d.fone||'')}</div>
    <div>${esc(d.endereco||'—')}</div>
    <div class="ln"></div>
    <table>${(d.itens||[]).map(i=>`
      <tr><td>${esc(i.descricao)}</td></tr>
      <tr><td class="row"><span>${(+i.qtd).toLocaleString('pt-BR')} x ${BRL(i.preco_unit)}</span><span>${BRL(i.subtotal)}</span></td></tr>`).join('')}</table>
    <div class="ln"></div>
    <div class="row"><span>Itens</span><span>${BRL(d.subtotal)}</span></div>
    <div class="row"><span>Frete</span><span>${BRL(d.frete)}</span></div>
    <div class="row b" style="font-size:14px"><span>TOTAL</span><span>${BRL(d.total)}</span></div>
    <div class="ln"></div>
    <div class="row"><span>Loja</span><span>${esc(d.loja_nome||'')}</span></div>
    <div class="row"><span>Saída</span><span>${fmtDT(q.dispatched_at)}</span></div>
    <div class="row"><span>Entrega</span><span>${fmtDT(d.delivered_at)}</span></div>
    ${q.minutos_entrega!=null?`<div class="row"><span>Tempo</span><span>${dur(q.minutos_entrega)}</span></div>`:''}
    <div class="ln"></div>
    <div class="c" style="font-size:10px">${new Date().toLocaleString('pt-BR')} · ONPDV</div>`;
  window.print();
};

// ======================= APP DO ENTREGADOR =======================
let MOTO_TIMER=null, MOTO_DATA={fila:[],rota:[],entregues:[],resumo:{}};
let MOTO_GEO={watchId:null,pulseId:null,last:0,lastLat:null,lastLng:null};
function motoGeoSet(txt,on){
  const el=$('#motoGeoStatus'); if(!el) return;
  el.textContent=txt;
  el.style.background=on===true?'#e3f6ec':(on===false?'#fdecec':'#eef2fb');
  el.style.color=on===true?'#0a7a3d':(on===false?'#a13b3b':'#12307a');
}
function motoGeoDist(la1,lo1,la2,lo2){
  const R=6371000,t=Math.PI/180,dLa=(la2-la1)*t,dLo=(lo2-lo1)*t;
  const a=Math.sin(dLa/2)**2+Math.cos(la1*t)*Math.cos(la2*t)*Math.sin(dLo/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
async function motoOnGeo(pos){
  const c=pos.coords,now=Date.now();
  const moved=MOTO_GEO.lastLat==null||motoGeoDist(MOTO_GEO.lastLat,MOTO_GEO.lastLng,c.latitude,c.longitude)>20;
  if(now-MOTO_GEO.last<15000&&!moved){ motoGeoSet('📍 compartilhando localização',true); return; }
  try{
    const {error}=await sb.rpc('erp_courier_ping',{p_lat:c.latitude,p_lng:c.longitude,
      p_acc:c.accuracy!=null?Math.round(c.accuracy):null,
      p_speed:c.speed!=null&&c.speed>=0?c.speed:null,
      p_heading:c.heading!=null&&!isNaN(c.heading)?c.heading:null});
    if(error) throw error;
    MOTO_GEO.last=now; MOTO_GEO.lastLat=c.latitude; MOTO_GEO.lastLng=c.longitude;
    motoGeoSet('📍 compartilhando localização · GPS ativo',true);
  }catch(e){ motoGeoSet('📍 falha ao enviar posição · tentando novamente',false); }
}
function motoOnGeoErr(err){
  motoGeoSet(err&&err.code===1?'📍 permita a localização para registrar o trajeto':'📍 localização indisponível · tentando novamente',false);
}
function motoGeoPulse(){
  if(document.visibilityState==='visible'&&!$('#moto').classList.contains('hide'))
    navigator.geolocation.getCurrentPosition(motoOnGeo,motoOnGeoErr,{enableHighAccuracy:true,maximumAge:5000,timeout:20000});
}
function motoStartGeoTracking(){
  if(!('geolocation' in navigator)){ motoGeoSet('📍 GPS indisponível neste aparelho',false); return; }
  if(!window.isSecureContext){ motoGeoSet('📍 abra pelo endereço https:// para registrar o trajeto',false); return; }
  if(MOTO_GEO.watchId==null){
    motoGeoSet('📍 ativando localização…',null);
    MOTO_GEO.watchId=navigator.geolocation.watchPosition(motoOnGeo,motoOnGeoErr,
      {enableHighAccuracy:true,maximumAge:5000,timeout:20000});
  }
  if(MOTO_GEO.pulseId==null) MOTO_GEO.pulseId=setInterval(motoGeoPulse,30000);
  motoGeoPulse();
}
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'&&MOTO_GEO.watchId!=null) motoGeoPulse(); });
function showMoto(){
  $('#login').classList.add('hide'); $('#app').classList.add('hide'); $('#moto').classList.remove('hide');
  const n=$('#motoName'); if(n) n.textContent=((ME&&(ME.nome||ME.name))||'entregador').split(' ')[0].toUpperCase();
  const lj=$('#motoLoja'); const loja=(STORES||[]).find(x=>x.id===(ME&&ME.store_id));
  if(lj) lj.textContent = loja? loja.nome : '';
  loadMotoList();
  motoStartGeoTracking();
  clearInterval(MOTO_TIMER);
  MOTO_TIMER=setInterval(()=>{ if(!$('#moto').classList.contains('hide')) loadMotoList(true); }, 20000);
}
{ const b=$('#btnMotoRefresh'); if(b) b.onclick=()=>{ loadMotoList(); toast('Lista atualizada'); }; }
function motoCard(r, tipo){
  const wa=(r.fone||'').replace(/\D/g,'');
  const pago = r.pago ? '<span class="chip ok">pago</span>' : `<span class="chip amber">cobrar ${BRL(r.total)}</span>`;
  const chip = tipo==='fila' ? '<span class="chip">na fila</span>'
    : tipo==='rota' ? `<span class="chip amber">em rota${r.minutos_em_rota!=null?' · '+dur(r.minutos_em_rota):''}</span>`
    : `<span class="chip ok">entregue${r.minutos_entrega!=null?' · '+dur(r.minutos_entrega):''}</span>`;
  return `<div class="moto-card ${tipo==='rota'?'rota':tipo==='entregues'?'done':''}">
    <div class="nm"><span>#${r.venda_numero||''} · ${esc(r.cliente||'Cliente')}</span>${chip}</div>
    <div class="adr">${esc(r.endereco||'—')}</div>
    <div class="mt">${esc(r.fone||'sem telefone')} · ${r.itens||0} item(ns) · <b>${BRL(r.total)}</b>${+r.frete>0?' (frete '+BRL(r.frete)+')':''}
      ${tipo!=='entregues'?' · '+pago:''}${r.recebida_de_outra?' · pedido de '+esc(r.origem_nome||''):''}</div>
    <div class="moto-acts">
      <button class="btn ghost sm" data-onclick="motoDetail('${r.id}')">Ver pedido</button>
      ${wa?`<a class="btn ghost sm" href="https://wa.me/${wa}" target="_blank">💬 WhatsApp</a>`:''}
      ${r.endereco?`<a class="btn ghost sm" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.endereco)}" target="_blank">📍 Mapa</a>`:''}
      ${tipo==='fila'?`<button class="btn" data-onclick="handleScan('${r.id}')">🛵 Marcar saída</button>`:''}
      ${tipo==='rota'?`<button class="btn green" data-onclick="handleScan('${r.id}')">✅ Marcar entregue</button>`:''}
    </div>
  </div>`;
}
async function loadMotoList(silent){
  const { data, error } = await sb.rpc('erp_courier_queue',{ p_dias:1 });
  if(error){ if(!silent) toast('Erro: '+error.message,true); return; }
  const d=data||{}; MOTO_DATA={ fila:d.fila||[], rota:d.rota||[], entregues:d.entregues||[], resumo:d.resumo||{} };
  const r=MOTO_DATA.resumo;
  $('#motoStats').innerHTML=`
    <div class="moto-stat"><div class="k">Prontos para sair</div><div class="v">${r.fila||0}</div></div>
    <div class="moto-stat"><div class="k">Em rota</div><div class="v">${r.rota||0}</div></div>
    <div class="moto-stat"><div class="k">Entregues hoje</div><div class="v">${r.entregues||0}</div></div>
    <div class="moto-stat"><div class="k">⏱️ Tempo médio</div><div class="v">${r.tempo_medio!=null?dur(r.tempo_medio):'—'}</div></div>`;
  $('#motoList').innerHTML=`
    <div class="moto-sec">📦 Prontos para sair (${MOTO_DATA.fila.length})</div>
    ${MOTO_DATA.fila.length? MOTO_DATA.fila.map(x=>motoCard(x,'fila')).join('') : '<p class="moto-empty">Nenhum pedido pronto para sair.</p>'}
    <div class="moto-sec">🛵 Em rota (${MOTO_DATA.rota.length})${+r.a_receber_rota>0?` <span class="chip amber">a receber ${BRL(r.a_receber_rota)}</span>`:''}</div>
    ${MOTO_DATA.rota.length? MOTO_DATA.rota.map(x=>motoCard(x,'rota')).join('') : '<p class="moto-empty">Nenhum pedido em rota.</p>'}
    <div class="moto-sec">✅ Entregues hoje (${MOTO_DATA.entregues.length})${+r.valor_entregue>0?` <span class="chip ok">${BRL(r.valor_entregue)}</span>`:''}</div>
    ${MOTO_DATA.entregues.length? MOTO_DATA.entregues.map(x=>motoCard(x,'entregues')).join('') : '<p class="moto-empty">Nenhuma entrega concluída hoje ainda.</p>'}`;
}
window.motoDetail = async id=>{
  const { data:d, error } = await sb.rpc('erp_courier_find',{ p_q:id });
  if(error||!d){ toast('Pedido não encontrado.',true); return; }
  const itens=(d.itens||[]).map(i=>`<tr><td>${esc(i.descricao)}</td><td class="r">${(+i.qtd).toLocaleString('pt-BR')}</td>
    <td class="r">${BRL(i.preco_unit)}</td><td class="r"><b>${BRL(i.subtotal)}</b></td></tr>`).join('');
  const chip={fila:'<span class="chip">na fila</span>',em_rota:'<span class="chip amber">em rota</span>',
    entregue:'<span class="chip ok">entregue</span>',cancelada:'<span class="chip warn">cancelada</span>'}[d.status]||esc(d.status);
  modal(`<div class="m-head"><h3>Pedido #${d.venda_numero||''} ${chip}</h3><button data-modal-close>✕</button></div>
    <div class="m-body">
      <p style="font-family:Fredoka;font-size:19px;margin:0"><b>${esc(d.cliente||'—')}</b></p>
      <p class="muted" style="margin:2px 0">${esc(d.fone||'')}</p>
      <p style="margin:4px 0">${esc(d.endereco||'—')}</p>
      ${d.obs?`<p class="muted">Obs: ${esc(d.obs)}</p>`:''}
      <div class="tbl-wrap" style="margin-top:8px"><table>
        <thead><tr><th>Item</th><th class="r">Qtd</th><th class="r">Unit.</th><th class="r">Total</th></tr></thead>
        <tbody>${itens||'<tr><td colspan="4" class="muted">Sem itens.</td></tr>'}</tbody></table></div>
      <div class="sum" style="border-radius:12px;margin-top:8px">
        <div class="l"><span>Itens</span><b>${BRL(d.subtotal)}</b></div>
        <div class="l"><span>Frete</span><b>${BRL(d.frete)}</b></div>
        <div class="l big"><span>${d.pago?'Total (já pago)':'A RECEBER'}</span><b>${BRL(d.total)}</b></div>
      </div>
      <p class="muted" style="margin-top:8px">${d.pago?'✅ Pedido já pago na loja — não cobrar.':'💵 Cobrar na entrega.'}
        ${d.dispatched_at?`<br>Saiu em ${fmtDT(d.dispatched_at)}`:''}${d.delivered_at?` · entregue em ${fmtDT(d.delivered_at)}`:''}</p>
    </div>
    <div class="m-foot">
      ${d.status==='fila'?`<button class="btn" data-onclick="closeModal();handleScan('${d.id}')">🛵 Marcar saída</button>`:''}
      ${d.status==='em_rota'?`<button class="btn green" data-onclick="closeModal();handleScan('${d.id}')">✅ Marcar entregue</button>`:''}
      <button class="btn ghost" data-modal-close>Fechar</button></div>`);
};
window.motoBuscar = async ()=>{
  const el=$('#motoManual'); const q=(el.value||'').trim();
  if(!q){ toast('Digite o número do pedido.',true); return; }
  const { data:d } = await sb.rpc('erp_courier_find',{ p_q:q });
  if(!d){ toast('Pedido #'+q+' não encontrado na sua loja.',true); return; }
  el.value=''; motoDetail(d.id);
};
const SCAN_COOLDOWN=30;
let SCAN_BUSY=false;
async function handleScan(raw){
  let code=String(raw||'').trim(); if(!code) return;
  if(SCAN_BUSY) return; SCAN_BUSY=true;
  try{
    code=code.replace(/^.*[:/]/,'');                       // aceita "petshop:order:<id>" e URLs
    if(!/^[0-9a-f-]{32,36}$/i.test(code)){                 // não é uuid: trata como número do pedido
      const { data:f } = await sb.rpc('erp_courier_find',{ p_q:code });
      if(!f){ toast('Pedido não encontrado.',true); return; }
      code=f.id;
    }
    const { data, error } = await sb.rpc('erp_delivery_scan',{ p_id:code, p_cooldown:SCAN_COOLDOWN });
    if(error){
      const m=error.message||'';
      if(m.includes('AGUARDE:')){ toast('Aguarde '+m.split('AGUARDE:')[1]+'s antes de confirmar a entrega.',true); }
      else toast('Erro: '+m,true);
      return;
    }
    if(data.status==='em_rota'){ toast('Saiu para entrega 🛵'); if(data.notify) notifyWhats(data.fone, data.mensagem); }
    else if(data.status==='entregue'){ toast('Entrega concluída ✅'+(data.minutos!=null?' · '+dur(data.minutos):'')); }
    loadMotoList();
  } finally { setTimeout(()=>{ SCAN_BUSY=false; }, 1500); }
}
async function notifyWhats(fone, mensagem){
  const link='https://wa.me/'+(fone||'').replace(/\D/g,'')+'?text='+encodeURIComponent(mensagem||'');
  try{
    const { data:{ session } } = await sb.auth.getSession();
    const r = await fetch(`${SUPABASE_URL}/functions/v1/wa-send`,{ method:'POST',
      headers:{ 'Authorization':`Bearer ${session.access_token}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ to:fone, message:mensagem }) });
    const j = await r.json();
    if(j.sent){ toast('Cliente avisado no WhatsApp ✅'); }
    else if(j.fallback){ window.open(j.fallback,'_blank'); }
    else window.open(link,'_blank');
  }catch(e){ window.open(link,'_blank'); }
}
// ---- scanner de câmera (QR) ----
let scanStream=null, scanRAF=null;
{ const bs=$('#btnScan'); if(bs) bs.onclick=startScan;
  const bm=$('#btnMotoManual'); if(bm) bm.onclick=()=>motoBuscar();
  const mi=$('#motoManual'); if(mi) mi.onkeydown=e=>{ if(e.key==='Enter'){ e.preventDefault(); motoBuscar(); } };
}
async function startScan(){
  const ov=$('#scanOverlay'); ov.classList.remove('hide'); $('#scanMsg').textContent='Aponte a câmera para o QR…';
  try{
    scanStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment' } });
    const v=$('#scanVideo'); v.srcObject=scanStream; await v.play();
    if(!('BarcodeDetector' in window)){ $('#scanMsg').textContent='Leitor não suportado aqui — use o código manual.'; return; }
    const det=new window.BarcodeDetector({ formats:['qr_code'] });
    const tick=async ()=>{
      if(!scanStream) return;
      try{ const codes=await det.detect(v); if(codes && codes.length){ const val=codes[0].rawValue; stopScan(); handleScan(val); return; } }catch(e){}
      scanRAF=requestAnimationFrame(tick);
    };
    tick();
  }catch(e){ $('#scanMsg').textContent='Não foi possível acessar a câmera. Use o código manual.'; }
}
window.stopScan=()=>{ if(scanRAF) cancelAnimationFrame(scanRAF); scanRAF=null; if(scanStream){ scanStream.getTracks().forEach(t=>t.stop()); scanStream=null; } $('#scanOverlay').classList.add('hide'); };

// ======================= PEDIDO INTELIGENTE =======================
const PURCHASE_FLOW_DEFAULTS={auto_approval_limit:0,price_increase_alert_percent:10,default_priority:'normal'};
let PURCHASE_FLOW={enabled:false,config:{...PURCHASE_FLOW_DEFAULTS},rows:new Map()};
function purchaseFlowMissing(error){
  const code=String((error&&error.code)||''),msg=String((error&&error.message)||'').toLowerCase();
  return code==='PGRST202'||code==='42883'||msg.includes('erp_purchase_')&&(msg.includes('not find')||msg.includes('does not exist'));
}
async function purchaseFlowRpc(name,args,opts){
  const {data,error}=await sb.rpc(name,args||{});
  if(error){
    if(purchaseFlowMissing(error)){PURCHASE_FLOW.enabled=false;const b=$('#btnPurchaseFlow');if(b)b.classList.add('hide');return {data:null,error,missing:true};}
    if(!(opts&&opts.silent))toast('Fluxo de compras: '+error.message,true);
    return {data:null,error,missing:false};
  }
  PURCHASE_FLOW.enabled=true;
  return {data,error:null,missing:false};
}
async function loadPurchaseWorkflowConfig(){
  const r=await purchaseFlowRpc('erp_purchase_workflow_config',{}, {silent:true});
  if(!r.error&&r.data)PURCHASE_FLOW.config={...PURCHASE_FLOW_DEFAULTS,...r.data};
  const b=$('#btnPurchaseFlow');if(b)b.classList.toggle('hide',!(PURCHASE_FLOW.enabled&&isAdmin()));
  return PURCHASE_FLOW.config;
}
async function purchaseWorkflowSaveMeta(orderId,meta){
  if(!orderId)return null;
  const r=await purchaseFlowRpc('erp_purchase_order_metadata_save',{p_order:String(orderId),p_metadata:meta||{}},{silent:true});
  if(!r.error&&r.data)PURCHASE_FLOW.rows.set(String(orderId),r.data);
  return r.data||null;
}
async function purchaseWorkflowLoadRows(ids){
  const list=(ids||[]).filter(x=>x!=null).map(String);
  if(!list.length){PURCHASE_FLOW.rows=new Map();return PURCHASE_FLOW.rows;}
  const r=await purchaseFlowRpc('erp_purchase_order_workflow_list',{p_orders:list},{silent:true});
  if(!r.error)PURCHASE_FLOW.rows=new Map((r.data||[]).map(x=>[String(x.order_id),x]));
  return PURCHASE_FLOW.rows;
}
async function purchaseWorkflowContext(id){
  const r=await purchaseFlowRpc('erp_purchase_order_context',{p_order:String(id)},{silent:true});
  return (!r.error&&r.data)?r.data:{metadata:{},receipts:[],prices:[]};
}
async function purchaseWorkflowRecordApproval(id,type){
  if(!id)return;
  const detail=await sb.rpc('erp_po_detail',{p_po:id});if(detail.error||!detail.data)return;
  const items=(detail.data.itens||[]).map(x=>({product_id:String(x.product_id),unit_price:+x.custo_unit||0}));
  if(items.length)await purchaseFlowRpc('erp_purchase_approval_record',{p_order:String(id),p_items:items,p_approval_type:type},{silent:true});
}
function purchaseOrderId(data){return data&&(data.id||data.po_id||data.order_id||data.purchase_order_id)||null;}
function purchaseApprovalLabel(meta){
  if(!meta||!meta.approval_type)return '';
  return meta.approval_type==='automatic'?'automática':meta.approval_type==='direct'?'direta':'manual';
}
async function purchaseFlowModal(){
  await loadPurchaseWorkflowConfig();
  if(!PURCHASE_FLOW.enabled){toast('A migration do fluxo de compras ainda não foi aplicada neste Supabase.',true);return;}
  const ar=await purchaseFlowRpc('erp_purchase_price_alerts',{p_limit:8},{silent:true});
  const alerts=(ar.data||[]).map(a=>{const p=PRODUCTS.find(x=>String(x.id)===String(a.product_id));return `<tr><td>${esc((p&&(p.nome||p.name))||a.product_id)}</td><td class="r">${BRL(a.previous_price)}</td><td class="r"><b>${BRL(a.current_price)}</b></td><td class="r neg">+${fmtNum(a.increase_percent)}%</td></tr>`;}).join('');
  const c=PURCHASE_FLOW.config;
  modal(`<div class="m-head"><h3>Regras do fluxo de compras</h3><button data-modal-close>✕</button></div>
    <div class="m-body"><p class="muted">As regras complementam o Pedido inteligente sem alterar o fluxo de vendas.</p>
      <div class="grid2"><div class="field"><label class="lbl">Aprovação automática até (R$)</label><input id="pwAuto" class="in" inputmode="decimal" value="${num(c.auto_approval_limit).toFixed(2).replace('.',',')}"></div>
      <div class="field"><label class="lbl">Alerta de aumento de custo (%)</label><input id="pwAlert" class="in" inputmode="decimal" value="${num(c.price_increase_alert_percent).toFixed(2).replace('.',',')}"></div>
      <div class="field"><label class="lbl">Prioridade padrão</label><select id="pwPriority" class="in">${['baixa','normal','alta','urgente'].map(x=>`<option value="${x}" ${x===c.default_priority?'selected':''}>${x}</option>`).join('')}</select></div></div>
      <div class="tbl-wrap" style="margin-top:12px"><table><thead><tr><th>Alertas recentes de custo</th><th class="r">Anterior</th><th class="r">Atual</th><th class="r">Aumento</th></tr></thead><tbody>${alerts||'<tr><td colspan="4" class="muted" style="text-align:center">Nenhum aumento acima da regra.</td></tr>'}</tbody></table></div>
    </div><div class="m-foot"><button class="btn ghost" data-modal-close>Cancelar</button><button class="btn green" data-onclick="purchaseFlowSave()">Salvar regras</button></div>`,'wide');
}
window.purchaseFlowSave=async()=>{
  const config={auto_approval_limit:Math.max(0,num($('#pwAuto').value)),price_increase_alert_percent:Math.max(0,num($('#pwAlert').value)),default_priority:$('#pwPriority').value};
  const r=await purchaseFlowRpc('erp_purchase_workflow_config_save',{p_config:config});
  if(r.error)return;PURCHASE_FLOW.config={...PURCHASE_FLOW_DEFAULTS,...r.data};closeModal();toast('Regras de compra atualizadas ✅');
};
function initSmartOrder(){
  const sup=$('#soSup'); if(sup) sup.innerHTML = '<option value="">Todos</option>' + SUPPLIERS.map(s=>`<option value="${s.id}">${esc(s.nome)}</option>`).join('');
  const st=$('#soStore'); if(st) st.innerHTML = STORES.map(s=>`<option value="${s.id}" ${s.id===CURRENT_STORE?'selected':''}>${esc(s.nome)}${s.is_matriz?' ★':''}</option>`).join('');
  const r=$('#soResult'); if(r) r.innerHTML='';
  const b=$('#btnSmartDrafts'); if(b)b.disabled=true;
  const sm=$('#soSummary'); if(sm)sm.textContent='Nenhuma sugestão calculada.';
  loadPurchaseWorkflowConfig();
  loadPOs();
}
{ const b=$('#btnSmartCalc'); if(b) b.onclick=calcSmartOrder; }
{ const b=$('#btnSmartDrafts'); if(b) b.onclick=smartCreateDrafts; }
{ const b=$('#btnPurchaseFlow'); if(b) b.onclick=purchaseFlowModal; }
let SMART=null;
async function calcSmartOrder(){
  const store=$('#soStore').value||CURRENT_STORE, sup=$('#soSup').value||null;
  const dias=parseInt($('#soDias').value)||30, cob=parseInt($('#soCob').value)||30;
  $('#soResult').innerHTML='<p class="muted" style="padding:8px">Calculando…</p>';
  const { data, error } = await sb.rpc('erp_smart_order',{ p_store:store, p_dias:dias, p_cobertura:cob, p_supplier:sup });
  if(error){ $('#soResult').innerHTML='<p class="neg" style="padding:8px">Erro: '+esc(error.message)+'</p>'; return; }
  SMART = data||{fornecedores:[]};
  const groups=SMART.fornecedores||[], items=groups.flatMap(x=>x.itens||[]);
  const purchases=items.filter(x=>+x.sugestao>0).length, transfers=items.filter(x=>+x.transfer_qty>0).length;
  $('#btnSmartDrafts').disabled=!(purchases||transfers);
  $('#soSummary').innerHTML=`Análise concluída: <b>${purchases}</b> item(ns) para comprar, <b>${transfers}</b> para transferir antes da compra e <b>${(SMART.encalhados||[]).length}</b> encalhado(s) bloqueado(s).`;
  renderSmart();
}
function renderSmart(){
  const fs=(SMART.fornecedores||[]);
  if(!fs.length){ $('#soResult').innerHTML='<div class="card pad"><p class="muted">Nada a comprar com esses parâmetros. 🎉<br>Se faltam produtos aqui, confira se eles têm <b>fornecedor</b> e <b>estoque mínimo</b> definidos no cadastro.</p></div>'; return; }
  $('#soResult').innerHTML = fs.map((f,fi)=>`
    <div class="card pad" style="margin-bottom:14px">
      <div class="head"><h2 style="font-size:17px">🏭 ${esc(f.fornecedor)}</h2><span class="grow"></span>
        <span class="muted">Total estimado: <b id="soTot${fi}">${BRL(f.total_custo)}</b></span></div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Produto / motivo</th><th class="r">Demanda prevista</th><th>Calendário</th><th>Prazo</th><th class="r">Saldo / segurança</th><th>Validade</th><th>Transferir antes</th><th class="r">Comprar</th><th class="r">Custo total</th></tr></thead>
        <tbody>${f.itens.map((it,ii)=>`<tr>
          <td><b>${esc(it.nome)}</b> <span class="muted" style="font-size:11px">${esc(it.sku||'')}</span><br><span class="muted" style="font-size:11px">${(+it.velocidade).toLocaleString('pt-BR',{maximumFractionDigits:2})}/dia · estoque efetivo ${fmtNum(it.effective_stock||0)}</span></td>
          <td class="r"><b>${fmtNum(it.forecast_demand||0)}</b></td>
          <td><span class="chip">semana ×${fmtNum(it.weekday_factor||1)}</span><br><span class="chip ${+it.season_factor>1?'amber':''}">época ×${fmtNum(it.season_factor||1)}</span>${it.promo_programada?'<br><span class="chip ok">promo programada</span>':''}</td>
          <td><b>${it.lead_days||0} dias</b><br><span class="muted" style="font-size:11px">${esc(it.lead_source||'')}</span></td>
          <td class="r">${fmtNum(it.saldo||0)}<br><span class="muted">seg. ${fmtNum(it.safety_stock||0)}</span></td>
          <td>${+it.expired_qty>0?`<span class="chip warn">${fmtNum(it.expired_qty)} vencido</span><br>`:''}${+it.expiring_qty>0?`<span class="chip amber">${fmtNum(it.expiring_qty)} a vencer</span>`:'<span class="muted">sem risco</span>'}</td>
          <td>${+it.transfer_qty>0?`<b>${fmtNum(it.transfer_qty)}</b><br><span class="muted">de ${esc(it.transfer_from_name||'outra loja')}</span>`:'<span class="muted">—</span>'}</td>
          <td class="r"><input class="in" style="width:74px;text-align:right;padding:5px 7px" value="${+it.sugestao}" inputmode="numeric" data-f="${fi}" data-i="${ii}" data-custo="${it.custo}" data-oninput="smartRecalc(${fi})"></td>
          <td class="r"><b id="soCt${fi}_${ii}">${BRL(it.custo_total)}</b></td>
        </tr>`).join('')}</tbody>
      </table></div>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn ghost sm" data-onclick="smartRegister(${fi})">Compra direta (sem aprovação)</button>
        <button class="btn ghost sm" data-onclick="smartQuotes(${fi})">💬 Cotações</button>
        <button class="btn ghost sm" data-onclick="smartCopy(${fi})">📋 Copiar pedido</button>
        <button class="btn ghost sm" data-onclick="smartPrint(${fi})">🖨️ Imprimir</button>
      </div>
    </div>`).join('');
}
window.smartRecalc=fi=>{
  let tot=0;
  document.querySelectorAll('#soResult input[data-f="'+fi+'"]').forEach(inp=>{
    const q=num(inp.value)||0, custo=+inp.dataset.custo, ii=inp.dataset.i;
    const ct=q*custo; tot+=ct;
    const el=$('#soCt'+fi+'_'+ii); if(el) el.textContent=BRL(ct);
  });
  const t=$('#soTot'+fi); if(t) t.textContent=BRL(tot);
};
function smartLines(fi){
  const f=SMART.fornecedores[fi]; const lines=[];
  document.querySelectorAll('#soResult input[data-f="'+fi+'"]').forEach(inp=>{
    const q=num(inp.value)||0; if(q<=0) return;
    const it=f.itens[+inp.dataset.i];
    lines.push({nome:it.nome, qtd:q, un:it.unidade});
  });
  return { fornecedor:f.fornecedor, lines };
}
window.smartCopy=fi=>{
  const { fornecedor, lines }=smartLines(fi);
  if(!lines.length){ toast('Nenhum item com quantidade.',true); return; }
  const txt = 'Pedido de compra — '+fornecedor+'\n'+(COMPANY.nome?COMPANY.nome+'\n':'')+'\n'+lines.map(l=>'• '+l.qtd+' '+(l.un||'')+' — '+l.nome).join('\n');
  navigator.clipboard.writeText(txt).then(()=>toast('Pedido copiado ✅')).catch(()=>toast('Não foi possível copiar.',true));
};
window.smartPrint=fi=>{
  const { fornecedor, lines }=smartLines(fi);
  if(!lines.length){ toast('Nenhum item com quantidade.',true); return; }
  $('#receiptPrint').innerHTML = '<h3>PEDIDO DE COMPRA</h3><div class="c">'+esc(fornecedor)+'</div><div class="ln"></div>'+
    lines.map(l=>'<div class="row"><span>'+esc(l.nome)+'</span><b>'+l.qtd+' '+esc(l.un||'')+'</b></div>').join('')+
    '<div class="ln"></div><div class="c" style="font-size:10px">'+new Date().toLocaleString('pt-BR')+'</div>';
  window.print();
};
window.smartQuotes=async fi=>{
  const f=SMART&&SMART.fornecedores&&SMART.fornecedores[fi];
  if(!f||!f.supplier_id){toast('Defina o fornecedor deste grupo antes de cotar.',true);return;}
  const products=(f.itens||[]).map(x=>String(x.product_id));
  const r=await purchaseFlowRpc('erp_purchase_quote_responses_list',{p_products:products,p_quote_ref:null});
  if(r.error)return;
  const responses=r.data||[],supplierName=id=>{const s=SUPPLIERS.find(x=>String(x.id)===String(id));return s?(s.nome||s.name||'Fornecedor'):'Fornecedor';};
  const rows=(f.itens||[]).map((it,ii)=>{
    const all=responses.filter(x=>String(x.product_id)===String(it.product_id));
    const own=all.find(x=>String(x.supplier_id)===String(f.supplier_id));
    const best=all.find(x=>x.is_best)||all.slice().sort((a,b)=>+a.unit_price-+b.unit_price)[0];
    return `<tr><td><b>${esc(it.nome)}</b>${best?`<br><span class="muted">Melhor: ${esc(supplierName(best.supplier_id))} · ${BRL(best.unit_price)}</span>`:''}</td>
      <td class="r"><input class="in" style="width:110px;text-align:right" inputmode="decimal" data-quote-price="${ii}" value="${num(own?own.unit_price:it.custo).toFixed(2).replace('.',',')}"></td>
      <td class="r"><input class="in" style="width:80px;text-align:right" inputmode="numeric" data-quote-days="${ii}" value="${own?own.delivery_days:0}"></td></tr>`;
  }).join('');
  modal(`<div class="m-head"><h3>Cotações · ${esc(f.fornecedor)}</h3><button data-modal-close>✕</button></div><div class="m-body">
    <p class="muted">Registre a resposta deste fornecedor. O melhor preço conhecido aparece como referência e os valores salvos serão aplicados ao cálculo atual.</p>
    <div class="tbl-wrap"><table><thead><tr><th>Produto</th><th class="r">Preço cotado</th><th class="r">Entrega (dias)</th></tr></thead><tbody>${rows}</tbody></table></div></div>
    <div class="m-foot"><button class="btn ghost" data-modal-close>Cancelar</button><button class="btn green" data-onclick="smartQuotesSave(${fi})">Salvar e aplicar</button></div>`,'wide');
};
window.smartQuotesSave=async fi=>{
  const f=SMART&&SMART.fornecedores&&SMART.fornecedores[fi];if(!f)return;
  const quoteRef='smart:'+($('#soStore').value||CURRENT_STORE||'all'),items=[];
  document.querySelectorAll('#modalRoot [data-quote-price]').forEach(inp=>{
    const ii=+inp.dataset.quotePrice,it=f.itens[ii],days=$(`#modalRoot [data-quote-days="${ii}"]`),price=Math.max(0,num(inp.value));
    if(price>0)items.push({quote_ref:quoteRef,product_id:String(it.product_id),supplier_id:String(f.supplier_id),unit_price:price,delivery_days:Math.max(0,parseInt(days&&days.value)||0)});
  });
  if(!items.length){toast('Informe ao menos um preço de cotação.',true);return;}
  document.querySelectorAll(`#soResult input[data-f="${fi}"]`).forEach(inp=>{const it=f.itens[+inp.dataset.i];if(it)it.sugestao=Math.max(0,num(inp.value));});
  const r=await purchaseFlowRpc('erp_purchase_quote_responses_save',{p_items:items});if(r.error)return;
  items.forEach(q=>{const it=f.itens.find(x=>String(x.product_id)===q.product_id);if(it){it.custo=q.unit_price;it.custo_total=(+it.sugestao||0)*q.unit_price;}});
  closeModal();renderSmart();toast(`${items.length} cotação(ões) salva(s) e aplicadas ✅`);
};
function smartItems(fi){
  const f=SMART.fornecedores[fi]; const items=[];
  document.querySelectorAll('#soResult input[data-f="'+fi+'"]').forEach(inp=>{
    const q=num(inp.value)||0; if(q<=0) return;
    const it=f.itens[+inp.dataset.i];
    items.push({product_id:it.product_id, descricao:it.nome, qtd:q, custo:it.custo});
  });
  return { supplier_id:f.supplier_id, items };
}
window.smartRegister=async fi=>{
  const { supplier_id, items }=smartItems(fi);
  if(!items.length){ toast('Nenhum item com quantidade.',true); return; }
  if(!supplier_id){ toast('Este grupo não tem fornecedor. Defina no cadastro do produto.',true); return; }
  const store=$('#soStore').value||CURRENT_STORE;
  const { data, error }=await sb.rpc('erp_po_create',{ p_supplier:supplier_id, p_store:store, p_items:items, p_venc:null, p_obs:null });
  if(error){ toast('Erro: '+error.message,true); return; }
  const orderId=purchaseOrderId(data);
  if(orderId){await purchaseWorkflowSaveMeta(orderId,{store_id:String(store),supplier_id:String(supplier_id),buyer_name:(ME&&(ME.nome||ME.name))||null,priority:PURCHASE_FLOW.config.default_priority,approval_type:'direct',approved_at:new Date().toISOString()});await purchaseWorkflowRecordApproval(orderId,'direct');}
  toast('Compra registrada — conta a pagar prevista de '+BRL(data.total)+' ✅');
  loadPOs();
};
async function smartCreateDrafts(){
  if(!SMART)return;
  const b=$('#btnSmartDrafts');b.disabled=true;b.textContent='Criando rascunhos…';
  const store=$('#soStore').value||CURRENT_STORE,sup=$('#soSup').value||null;
  const dias=parseInt($('#soDias').value)||90,cob=parseInt($('#soCob').value)||30;
  try{
    await loadPurchaseWorkflowConfig();
    const before=await sb.rpc('erp_po_list',{p_status:'rascunho'}),beforeIds=new Set((before.data||[]).map(x=>String(x.id)));
    const {data,error}=await sb.rpc('erp_smart_order_create_drafts',{p_store:store,p_dias:dias,p_cobertura:cob,p_supplier:sup});
    if(error){toast('Erro: '+error.message,true);return;}
    const after=await sb.rpc('erp_po_list',{p_status:'rascunho'}),created=(!before.error&&!after.error)?(after.data||[]).filter(x=>!beforeIds.has(String(x.id))):[];
    let automatic=0;
    for(const po of created){
      const total=+po.total_previsto||0,auto=PURCHASE_FLOW.enabled&&+PURCHASE_FLOW.config.auto_approval_limit>0&&total<=+PURCHASE_FLOW.config.auto_approval_limit;
      const base={store_id:String(store),supplier_id:po.supplier_id?String(po.supplier_id):null,buyer_name:(ME&&(ME.nome||ME.name))||null,priority:PURCHASE_FLOW.config.default_priority};
      if(auto){
        const approved=await sb.rpc('erp_po_approve',{p_po:po.id});
        if(!approved.error){automatic++;await purchaseWorkflowSaveMeta(po.id,{...base,approval_type:'automatic',approved_at:new Date().toISOString()});await purchaseWorkflowRecordApproval(po.id,'automatic');continue;}
      }
      await purchaseWorkflowSaveMeta(po.id,base);
    }
    const suffix=automatic?` · ${automatic} aprovada(s) automaticamente`:'';
    toast(`${data.purchase_count||0} compra(s) e ${data.transfer_count||0} transferência(s) criadas${suffix} ✅`);
    await loadPOs();
  }finally{
    b.textContent='📝 Criar rascunhos para aprovação';b.disabled=false;
  }
}
{ const b=$('#btnPoRefresh'); if(b) b.onclick=loadPOs; const f=$('#poFilter'); if(f) f.onchange=loadPOs; }
async function loadPOs(){
  const { data } = await sb.rpc('erp_po_list',{ p_status: ($('#poFilter')?$('#poFilter').value:'')||null });
  const rows=data||[];
  await purchaseWorkflowLoadRows(rows.map(x=>x.id));
  const chip=s=>({rascunho:'<span class="chip amber">aguardando aprovação</span>',pendente:'<span class="chip amber">pendente</span>',parcial:'<span class="chip">parcial</span>',recebido:'<span class="chip ok">recebido</span>',cancelado:'<span class="chip warn">cancelado</span>'}[s]||s);
  $('#poBody').innerHTML = rows.length ? rows.map(r=>{
    const flow=PURCHASE_FLOW.rows.get(String(r.id)),approval=purchaseApprovalLabel(flow);
    let acoes='';
    if(r.status==='rascunho') acoes='<button class="btn green sm" data-onclick="poApprove(\''+r.id+'\')">Aprovar</button> <button class="btn ghost sm red" data-onclick="poCancel(\''+r.id+'\')">Cancelar</button>';
    else if(r.status==='pendente'||r.status==='parcial') acoes='<button class="btn green sm" data-onclick="poReceive(\''+r.id+'\')">Receber</button> <button class="btn ghost sm red" data-onclick="poCancel(\''+r.id+'\')">Cancelar</button>';
    return '<tr class="clickrow" data-onclick="poDetail(\''+r.id+'\')"><td>'+new Date(r.created_at).toLocaleDateString('pt-BR')+'</td><td>'+esc(r.fornecedor||'—')+'</td><td>'+esc(r.loja||'—')+'</td>'+
      '<td class="r">'+BRL(r.total_previsto)+'</td><td class="r">'+BRL(r.total_recebido)+'</td><td>'+chip(r.status)+(approval?'<br><span class="muted" style="font-size:11px">aprovação '+esc(approval)+'</span>':'')+'</td>'+
      '<td class="r" style="white-space:nowrap" data-onclick="event.stopPropagation()">'+acoes+'</td></tr>';
  }).join('') : '<tr><td colspan="7" class="muted" style="text-align:center;padding:16px">Nenhuma compra registrada.</td></tr>';
}
window.poDetail = async id=>{
  const [{data:d},flowCtx] = await Promise.all([sb.rpc('erp_po_detail',{ p_po:id }),purchaseWorkflowContext(id)]);
  if(!d){ toast('Compra não encontrada.',true); return; }
  const flow=(flowCtx&&flowCtx.metadata)||{},receipts=(flowCtx&&flowCtx.receipts)||[];
  window._poPrint=d;
  const itens=(d.itens||[]).map(it=>{
    const qp=+it.qtd_pedida||0, qr=+it.qtd_recebida||0, cu=+it.custo_unit||0;
    return `<tr><td>${esc(it.descricao||'')}</td><td class="r">${qp.toLocaleString('pt-BR')}</td>
      <td class="r ${qr<qp?'neg':''}">${qr.toLocaleString('pt-BR')}</td>
      <td class="r">${BRL(cu)}</td><td class="r"><b>${BRL(qp*cu)}</b></td></tr>`; }).join('');
  const totItens=(d.itens||[]).reduce((a,i)=>a+(+i.qtd_pedida||0),0);
  modal(`<div class="m-head"><h3>Compra — ${esc(d.fornecedor||'')}</h3><button data-modal-close>✕</button></div>
    <div class="m-body">
      <p class="muted" style="margin:0 0 6px">Loja <b>${esc(d.loja||'—')}</b> · criada em ${fmtDT(d.created_at)} · status <b>${esc(d.status)}</b>${d.received_at?` · recebida em ${fmtDT(d.received_at)}`:''}</p>
      ${(flow.buyer_name||flow.delivery_on||flow.approval_type)?`<p class="muted" style="margin:0 0 6px">Solicitante <b>${esc(flow.buyer_name||'—')}</b> · prioridade <b>${esc(flow.priority||'normal')}</b> · aprovação <b>${esc(purchaseApprovalLabel(flow)||'pendente')}</b>${flow.delivery_on?` · entrega desejada ${fmtDate(flow.delivery_on)}`:''} · ${flow.installments||1} parcela(s)</p>`:''}
      ${flow.decision_reason?`<p class="neg"><b>Justificativa:</b> ${esc(flow.decision_reason)}</p>`:''}
      ${d.obs?`<p class="muted">Obs: ${esc(d.obs)}</p>`:''}
      <div class="tbl-wrap"><table>
        <thead><tr><th>Produto</th><th class="r">Pedido</th><th class="r">Recebido</th><th class="r">Custo un.</th><th class="r">Custo total</th></tr></thead>
        <tbody>${itens||'<tr><td colspan="5" class="muted">Sem itens.</td></tr>'}</tbody></table></div>
      <div class="sum" style="border-radius:12px;margin-top:8px">
        <div class="l"><span>Itens</span><b>${(d.itens||[]).length} produto(s) · ${totItens.toLocaleString('pt-BR')} un.</b></div>
        <div class="l"><span>Total previsto</span><b>${BRL(d.total_previsto)}</b></div>
        <div class="l big"><span>Total recebido</span><b>${BRL(d.total_recebido)}</b></div>
      </div>
      ${receipts.length?`<div style="margin-top:10px"><b>Histórico de entregas</b>${receipts.map((r,i)=>`<p class="muted" style="margin:4px 0">Entrega ${receipts.length-i} · ${fmtDT(r.confirmed_at)} · ${BRL(r.total)} · ${esc(r.status||'registrada')}</p>`).join('')}</div>`:''}
    </div>
    <div class="m-foot">
      <button class="btn ghost" data-onclick="poPrint()">🖨️ Imprimir</button>
      ${d.status==='rascunho'?`<button class="btn ghost" data-onclick="closeModal();poDraftEdit('${d.id}')">Editar quantidades</button><button class="btn green" data-onclick="closeModal();poApprove('${d.id}')">Aprovar compra</button>`:''}
      ${(d.status==='pendente'||d.status==='parcial')?`<button class="btn green" data-onclick="closeModal();poReceive('${d.id}')">Receber</button>`:''}
      <button class="btn" data-modal-close>Fechar</button></div>`);
};
window.poPrint=()=>{
  const d=window._poPrint; if(!d) return;
  $('#receiptPrint').innerHTML = '<h3>PEDIDO DE COMPRA</h3><div class="c">'+esc(d.fornecedor||'')+'</div>'+
    '<div class="c" style="font-size:10px">'+esc(d.loja||'')+' · '+fmtDT(d.created_at)+'</div><div class="ln"></div>'+
    (d.itens||[]).map(i=>'<div class="row"><span>'+esc(i.descricao||'')+'</span><b>'+(+i.qtd_pedida).toLocaleString('pt-BR')+'</b></div>'+
      '<div class="row" style="font-size:10px"><span>'+BRL(i.custo_unit)+' un.</span><span>'+BRL((+i.qtd_pedida||0)*(+i.custo_unit||0))+'</span></div>').join('')+
    '<div class="ln"></div><div class="row b"><span>TOTAL</span><span>'+BRL(d.total_previsto)+'</span></div>'+
    '<div class="ln"></div><div class="c" style="font-size:10px">'+new Date().toLocaleString('pt-BR')+'</div>';
  window.print();
};
window.poReceive=async id=>{
  const { data:d } = await sb.rpc('erp_po_detail',{ p_po:id });
  if(!d){ toast('Compra não encontrada.',true); return; }
  modal('<div class="m-head"><h3>Receber compra — '+esc(d.fornecedor||'')+'</h3><button data-modal-close>✕</button></div>'+
    '<div class="m-body"><p class="muted">Informe somente esta entrega. O estoque e o histórico de custo serão atualizados; entregas parciais permanecem abertas.</p>'+
    '<div class="tbl-wrap"><table><thead><tr><th>Produto</th><th class="r">Pedido</th><th class="r">Já recebido</th><th class="r">Restante</th><th class="r">Nesta entrega</th><th class="r">Preço recebido</th></tr></thead><tbody>'+
    d.itens.map(it=>{const ordered=+it.qtd_pedida||0,received=+it.qtd_recebida||0,remaining=Math.max(0,ordered-received);return '<tr><td>'+esc(it.descricao||'')+'</td><td class="r">'+ordered.toLocaleString('pt-BR')+'</td><td class="r">'+received.toLocaleString('pt-BR')+'</td><td class="r"><b>'+remaining.toLocaleString('pt-BR')+'</b></td>'+
      '<td class="r"><input class="in" style="width:80px;text-align:right;padding:5px 7px" value="'+remaining+'" inputmode="decimal" data-pid="'+it.product_id+'"></td>'+
      '<td class="r"><input class="in" style="width:105px;text-align:right;padding:5px 7px" value="'+(+it.custo_unit||0).toFixed(2).replace('.',',')+'" inputmode="decimal" data-receive-price="'+it.product_id+'"></td></tr>';}).join('')+
    '</tbody></table></div></div>'+
    '<div class="m-foot"><button class="btn ghost" data-modal-close>Cancelar</button><button class="btn green" data-onclick="poReceiveConfirm(\''+id+'\')">Dar entrada no estoque</button></div>');
};
window.poApprove=async id=>{
  if(!await uiConfirm('Aprovar este rascunho? A conta a pagar será criada somente agora.',{okText:'Aprovar compra',cancelText:'Voltar'}))return;
  const {data,error}=await sb.rpc('erp_po_approve',{p_po:id});
  if(error){toast('Erro: '+error.message,true);return;}
  await purchaseWorkflowSaveMeta(id,{approval_type:'manual',approved_at:new Date().toISOString(),buyer_name:(ME&&(ME.nome||ME.name))||null});
  await purchaseWorkflowRecordApproval(id,'manual');
  toast('Compra aprovada · conta a pagar de '+BRL(data.total)+' criada ✅');loadPOs();
};
window.poDraftEdit=async id=>{
  const {data:d,error}=await sb.rpc('erp_po_detail',{p_po:id});
  if(error||!d){toast('Rascunho não encontrado.',true);return;}
  const flowCtx=await purchaseWorkflowContext(id),flow=flowCtx.metadata||{};
  modal(`<div class="m-head"><h3>Revisar rascunho · ${esc(d.fornecedor||'')}</h3><button data-modal-close>✕</button></div>
    <div class="m-body"><p class="muted">Ajuste quantidade e custo antes de aprovar. Itens com zero não serão comprados.</p>
    <div class="tbl-wrap"><table><thead><tr><th>Produto</th><th class="r">Quantidade</th><th class="r">Custo</th></tr></thead><tbody>
    ${(d.itens||[]).map(i=>`<tr><td>${esc(i.descricao||'')}</td><td class="r"><input class="in" data-draft-pid="${i.product_id}" value="${+i.qtd_pedida||0}" style="width:85px;text-align:right"></td><td class="r"><input class="in" data-draft-cost="${i.product_id}" value="${+i.custo_unit||0}" style="width:100px;text-align:right"></td></tr>`).join('')}
    </tbody></table></div>
    <div class="grid2" style="margin-top:12px"><div class="field"><label class="lbl">Solicitante</label><input id="poMetaBuyer" class="in" value="${esc(flow.buyer_name||(ME&&(ME.nome||ME.name))||'')}"></div>
    <div class="field"><label class="lbl">Prioridade</label><select id="poMetaPriority" class="in">${['baixa','normal','alta','urgente'].map(x=>`<option value="${x}" ${x===(flow.priority||PURCHASE_FLOW.config.default_priority)?'selected':''}>${x}</option>`).join('')}</select></div>
    <div class="field"><label class="lbl">Entrega desejada</label><input id="poMetaDelivery" class="in" type="date" value="${esc(flow.delivery_on||'')}"></div>
    <div class="field"><label class="lbl">Parcelas</label><input id="poMetaInstallments" class="in" inputmode="numeric" value="${flow.installments||1}"></div></div>
    <div class="field"><label class="lbl">Observações internas</label><textarea id="poMetaNotes" class="in" rows="2">${esc(flow.notes||'')}</textarea></div>
    </div><div class="m-foot"><button class="btn ghost" data-modal-close>Cancelar</button><button class="btn green" data-onclick="poDraftSave('${id}')">Salvar revisão</button></div>`,'wide');
};
window.poDraftSave=async id=>{
  const items=[];document.querySelectorAll('[data-draft-pid]').forEach(q=>{const pid=q.dataset.draftPid,c=document.querySelector(`[data-draft-cost="${pid}"]`);items.push({product_id:pid,qtd:num(q.value)||0,custo:num(c&&c.value)||0});});
  const metadata={buyer_name:($('#poMetaBuyer')||{}).value||null,priority:($('#poMetaPriority')||{}).value||PURCHASE_FLOW.config.default_priority,delivery_on:($('#poMetaDelivery')||{}).value||null,installments:Math.max(1,parseInt((($('#poMetaInstallments')||{}).value)||'1')||1),notes:($('#poMetaNotes')||{}).value||null};
  const {data,error}=await sb.rpc('erp_po_draft_update',{p_po:id,p_items:items});
  if(error){toast('Erro: '+error.message,true);return;}await purchaseWorkflowSaveMeta(id,metadata);closeModal();toast('Rascunho atualizado · '+BRL(data.total));loadPOs();
};
window.poReceiveConfirm=async id=>{
  const items=[],receiptItems=[]; document.querySelectorAll('#modalRoot input[data-pid]').forEach(inp=>{const qty=Math.max(0,num(inp.value)||0),price=$(`#modalRoot [data-receive-price="${inp.dataset.pid}"]`),unitPrice=Math.max(0,num(price&&price.value)||0);if(qty>0){items.push({product_id:inp.dataset.pid,qtd_recebida:qty});receiptItems.push({product_id:String(inp.dataset.pid),qtd_recebida:qty,unit_price:unitPrice});}});
  if(!items.length){toast('Informe ao menos uma quantidade nesta entrega.',true);return;}
  const { data, error }=await sb.rpc('erp_po_receive',{ p_po:id, p_items:items });
  if(error){ toast('Erro: '+error.message,true); return; }
  await purchaseFlowRpc('erp_purchase_receipt_record',{p_order:String(id),p_items:receiptItems,p_status:data.status},{silent:true});
  closeModal(); toast('Entrada registrada ✅ ('+data.status+')'); loadPOs(); loadProducts();
};
window.poCancel=async id=>{
  const reason=await uiPrompt('Informe a justificativa para cancelar ou recusar esta compra:','',{title:'Justificativa obrigatória',okText:'Continuar'});
  if(reason===null)return;if(!reason.trim()){toast('A justificativa é obrigatória.',true);return;}
  if(!await uiConfirm('Cancelar esta compra? A conta a pagar prevista será cancelada.',{danger:true,okText:'Cancelar compra',cancelText:'Voltar'})) return;
  const { error }=await sb.rpc('erp_po_cancel',{ p_po:id });
  if(error){ toast('Erro: '+error.message,true); return; }
  await purchaseWorkflowSaveMeta(id,{decision_reason:reason.trim(),rejected_at:new Date().toISOString(),buyer_name:(ME&&(ME.nome||ME.name))||null});
  toast('Compra cancelada'); loadPOs();
};

// ======================= CONTAS A PAGAR =======================
$('#btnNewPayable').onclick = ()=> payableForm();
$('#btnSuppliers').onclick = ()=> suppliersModal();
{ const b=$('#btnCashflow'); if(b) b.onclick=()=> cashflowModal(); }
{ const b=$('#btnDre'); if(b) b.onclick=()=> dreModal(); }

// ======================= FLUXO DE CAIXA PROJETADO =======================
async function cashflowModal(dias){
  const d0=new Date(), d1=new Date(); d1.setDate(d1.getDate()+(dias||30));
  const iso=x=>new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().slice(0,10);
  window._cfRange={ini:iso(d0),fim:iso(d1)};
  modal(`<div class="m-head"><h3>📈 Fluxo de caixa projetado</h3><button data-modal-close>×</button></div>
    <div class="m-body">
      <div class="row" style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-bottom:12px">
        <div class="field" style="margin:0"><label class="lbl">De</label><input id="cfIni" type="date" class="in" style="max-width:150px" value="${window._cfRange.ini}"></div>
        <div class="field" style="margin:0"><label class="lbl">Até</label><input id="cfFim" type="date" class="in" style="max-width:150px" value="${window._cfRange.fim}"></div>
        <div class="field" style="margin:0"><label class="lbl">Saldo inicial (R$)</label><input id="cfOpen" class="in" inputmode="decimal" style="max-width:130px" value="0"></div>
        <button class="btn" data-onclick="cashflowRun()">Atualizar</button>
      </div>
      <div id="cfBody"><p class="muted" style="padding:16px">Calculando…</p></div>
    </div>
    <div class="m-foot"><button class="btn" data-modal-close>Fechar</button></div>`,'wide');
  cashflowRun();
}
window.cashflowRun = async ()=>{
  const ini=$('#cfIni').value, fim=$('#cfFim').value, opening=num($('#cfOpen').value);
  const loja=($('#payStore')||{}).value||null;
  const box=$('#cfBody'); if(box) box.innerHTML='<p class="muted" style="padding:16px">Calculando…</p>';
  const { data:d, error } = await sb.rpc('erp_cashflow_forecast',{ p_ini:ini, p_fim:fim, p_store:loja, p_opening:opening });
  if(error){ if(box) box.innerHTML='<p class="neg" style="padding:16px">Erro: '+esc(error.message)+'</p>'; return; }
  const dias=(d.dias||[]);
  // sparkline do saldo
  const vals=dias.map(x=>+x.saldo); const min=Math.min(0,...vals), max=Math.max(0,...vals), rng=(max-min)||1;
  const W=Math.max(320,dias.length*10), H=70;
  const pts=vals.map((v,i)=>`${(i/(Math.max(1,vals.length-1))*W).toFixed(1)},${(H-((v-min)/rng*H)).toFixed(1)}`).join(' ');
  const zeroY=(H-((0-min)/rng*H)).toFixed(1);
  const spark=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:80px;display:block">
    <line x1="0" y1="${zeroY}" x2="${W}" y2="${zeroY}" stroke="var(--line)" stroke-width="1"/>
    <polyline points="${pts}" fill="none" stroke="var(--dark)" stroke-width="2"/></svg>`;
  const movRows=dias.filter(x=>+x.entradas!==0||+x.saidas!==0).map(x=>`<tr class="${+x.saldo<0?'low':''}">
      <td>${fmtDate(x.dia)}</td>
      <td class="r" style="color:var(--green)">${+x.entradas>0?BRL(x.entradas):'—'}</td>
      <td class="r neg">${+x.saidas>0?'−'+BRL(x.saidas):'—'}</td>
      <td class="r ${+x.liquido<0?'neg':''}">${(+x.liquido>=0?'+':'')+BRL(x.liquido)}</td>
      <td class="r"><b class="${+x.saldo<0?'neg':''}">${BRL(x.saldo)}</b></td></tr>`).join('')
    || '<tr><td colspan="5" class="muted" style="text-align:center;padding:16px">Sem contas a pagar/receber no período.</td></tr>';
  box.innerHTML=`
    <div class="stats" style="margin-bottom:10px">
      <div class="stat"><div class="k" style="color:var(--green)">A receber</div><div class="v">${BRL(d.total_entradas)}</div></div>
      <div class="stat"><div class="k neg">A pagar</div><div class="v neg">${BRL(d.total_saidas)}</div></div>
      <div class="stat ${(+d.saldo_final)<0?'warn':'acc'}"><div class="k">Saldo projetado ao fim</div><div class="v ${(+d.saldo_final)<0?'neg':''}">${BRL(d.saldo_final)}</div></div>
      <div class="stat ${(+d.min_saldo)<0?'warn':''}"><div class="k">Menor saldo no período</div><div class="v ${(+d.min_saldo)<0?'neg':''}">${BRL(d.min_saldo)}</div>${(+d.min_saldo)<0?'<div class="muted" style="font-size:11px">⚠️ pode faltar caixa</div>':''}</div>
    </div>
    ${(+d.atrasado_receber>0||+d.atrasado_pagar>0)?`<p class="muted" style="font-size:12px;margin:0 0 8px">Vencidos antes do período (lançados no 1º dia): a receber <b class="ok">${BRL(d.atrasado_receber)}</b> · a pagar <b class="neg">${BRL(d.atrasado_pagar)}</b>.</p>`:''}
    <div style="border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin-bottom:10px">${spark}</div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Dia</th><th class="r">Entradas</th><th class="r">Saídas</th><th class="r">Líquido</th><th class="r">Saldo</th></tr></thead>
      <tbody>${movRows}</tbody></table></div>`;
};

// ======================= DRE (resultado por categoria) =======================
async function dreModal(){
  const r=mesAtualISO();
  modal(`<div class="m-head"><h3>📊 DRE · resultado do período</h3><button data-modal-close>×</button></div>
    <div class="m-body">
      <div class="row" style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-bottom:12px">
        <div class="field" style="margin:0"><label class="lbl">De</label><input id="dreIni" type="date" class="in" style="max-width:150px" value="${r.ini}"></div>
        <div class="field" style="margin:0"><label class="lbl">Até</label><input id="dreFim" type="date" class="in" style="max-width:150px" value="${r.fim}"></div>
        <button class="btn" data-onclick="dreRun()">Atualizar</button>
      </div>
      <div id="dreBody"><p class="muted" style="padding:16px">Calculando…</p></div>
    </div>
    <div class="m-foot" style="gap:8px"><button class="btn ghost" data-onclick="dreExportCsv()">📥 Baixar planilha (CSV)</button><button class="btn ghost" data-onclick="drePrint()">🖨️ Imprimir / PDF</button><button class="btn" data-modal-close>Fechar</button></div>`);
  dreRun();
}
window.dreExportCsv = ()=>{
  const L=window._dreLast; if(!L||!L.d){ toast('Gere o DRE primeiro.',true); return; }
  const d=L.d, rows=[];
  rows.push(['DRE — período', L.ini+' a '+L.fim]);
  rows.push(['Receita bruta (vendas)', (+d.receita_bruta||0).toFixed(2)]);
  rows.push(['(−) CMV', (-(+d.cmv||0)).toFixed(2)]);
  rows.push(['= Lucro bruto', (+d.lucro_bruto||0).toFixed(2)]);
  rows.push(['Margem bruta %', (+d.margem_bruta_pct||0).toFixed(1)]);
  rows.push(['(−) Despesas operacionais','']);
  (d.despesas||[]).forEach(x=>rows.push(['   '+(x.categoria||''), (-(+x.valor||0)).toFixed(2)]));
  rows.push(['Total de despesas', (-(+d.total_despesas||0)).toFixed(2)]);
  rows.push(['= Resultado do período', (+d.resultado||0).toFixed(2)]);
  const csv='﻿'+rows.map(r=>r.map(c=>{const s=String(c==null?'':c);return /[";\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}).join(';')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='DRE_'+L.ini+'_'+L.fim+'.csv';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1500);
};
window.drePrint = ()=>{
  const el=document.getElementById('dreBody'); const L=window._dreLast||{};
  if(!el||!window._dreLast||!window._dreLast.d){ toast('Gere o DRE primeiro.',true); return; }
  const w=window.open('','_blank'); if(!w){ toast('Permita pop-ups para imprimir.',true); return; }
  w.document.write('<html><head><meta charset="utf-8"><title>DRE '+(L.ini||'')+' a '+(L.fim||'')+'</title>'
    +'<style>body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#111}h1{font-size:18px;margin:0 0 12px}'
    +'table{width:100%;border-collapse:collapse}td{padding:6px 8px;border-bottom:1px solid #ddd}.r{text-align:right}'
    +'.stats{display:flex;gap:16px;margin-bottom:14px}.stat .k{font-size:12px;color:#666}.stat .v{font-size:18px;font-weight:800}'
    +'.neg{color:#c0392b}.muted{color:#888}</style></head><body>'
    +'<h1>DRE · resultado de '+(L.ini||'')+' a '+(L.fim||'')+'</h1>'+el.innerHTML+'</body></html>');
  w.document.close(); w.focus(); setTimeout(()=>{ try{w.print();}catch(_e){} },300);
};
window.dreRun = async ()=>{
  const ini=$('#dreIni').value, fim=$('#dreFim').value, loja=($('#payStore')||{}).value||null;
  const box=$('#dreBody'); if(box) box.innerHTML='<p class="muted" style="padding:16px">Calculando…</p>';
  const { data:d, error } = await sb.rpc('erp_dre',{ p_ini:ini, p_fim:fim, p_store:loja });
  if(error){ if(box) box.innerHTML='<p class="neg" style="padding:16px">Erro: '+esc(error.message)+'</p>'; return; }
  window._dreLast={ d:d, ini:ini, fim:fim, loja:loja };
  const desp=(d.despesas||[]);
  const despRows=desp.map(x=>`<tr><td style="padding-left:22px">${esc(x.categoria)}</td><td class="r neg">−${BRL(x.valor)}</td></tr>`).join('')
    || '<tr><td style="padding-left:22px" class="muted">Sem despesas operacionais no período.</td><td class="r muted">—</td></tr>';
  const res=+d.resultado;
  const linha=(lbl,val,cls,bold)=>`<tr><td style="${bold?'font-weight:800':''}">${lbl}</td><td class="r ${cls||''}" style="${bold?'font-weight:800':''}">${val}</td></tr>`;
  box.innerHTML=`
    <div class="stats" style="margin-bottom:12px">
      <div class="stat"><div class="k">Receita bruta</div><div class="v">${BRL(d.receita_bruta)}</div></div>
      <div class="stat"><div class="k">Lucro bruto</div><div class="v">${BRL(d.lucro_bruto)}</div><div class="muted" style="font-size:12px">margem ${(+d.margem_bruta_pct).toFixed(1)}%</div></div>
      <div class="stat ${res<0?'warn':'acc'}"><div class="k">Resultado</div><div class="v ${res<0?'neg':''}">${BRL(res)}</div></div>
    </div>
    <div class="tbl-wrap"><table>
      <tbody>
        ${linha('Receita bruta (vendas)', BRL(d.receita_bruta), '', true)}
        ${linha('(−) CMV — custo das mercadorias', '−'+BRL(d.cmv), 'neg')}
        ${linha('= Lucro bruto', BRL(d.lucro_bruto)+`  <span class="muted" style="font-weight:600">(${(+d.margem_bruta_pct).toFixed(1)}%)</span>`, '', true)}
        <tr><td colspan="2" style="padding-top:10px;font-weight:800">(−) Despesas operacionais</td></tr>
        ${despRows}
        ${linha('Total de despesas', '−'+BRL(d.total_despesas), 'neg', true)}
        <tr><td style="border-top:2px solid var(--line);font-weight:900;font-size:16px;padding-top:10px">= Resultado do período</td>
            <td class="r ${res<0?'neg':'ok'}" style="border-top:2px solid var(--line);font-weight:900;font-size:16px;padding-top:10px">${BRL(res)}</td></tr>
      </tbody></table></div>
    <p class="muted" style="font-size:12px;margin-top:8px">Receita e CMV por competência (data da venda). Despesas por vencimento, excluindo compras de mercadoria (já refletidas no CMV). Recebíveis/crediário não são somados novamente (já contam na receita da venda).</p>`;
};
{ const b=$('#btnPayRefresh'); if(b) b.onclick=()=>loadPayables();
  const m=$('#btnPayMes'); if(m) m.onclick=()=>{ const r=mesAtualISO(); setDates('payIni','payFim',r.ini,r.fim); loadPayables(); };
  ['payStatus','payStore','payIni','payFim'].forEach(id=>{ const el=$('#'+id); if(el) el.onchange=()=>loadPayables(); }); }
const PAY_CATS=['13º Salário - 1ª Parcela','13º Salário - 2ª Parcela','13º Salário - 3º Parcela','13º Salário - Parcela Única','Adiantamento Salarial','Água e Saneamento','Ajuda de Custo','Aluguel','Alvará de Funcionamento','Anuidade do Cartão de Crédito','Café','Caixa Reserva','Carteira de Investimento','Cartório','Certificado digital','Clínica do Trabalho','Combustíveis','Comissões de Vendedores','Compra de Equipamento','Compra de Ponto','Computadores e Periféricos','Consórcio Itaú','Consulta de CNPJ','Copa e Cozinha','Correios','Desconto de Baixa de Boleto','Despesa com Cartão de Crédito','Despesa de Descarregamento','Despesa de loja','Despesa Fixa','Despesas a identificar','Despesas Diversas','Despesas Pessoais dos Sócios','Diária','Empréstimos de Bancos','Empréstimos de Outras Instituições','Empréstimos do Trabalhador','Energia Elétrica','Estacionamento','Exames Médicos','Feriado','Férias','FGTS e Multa de FGTS','Fornecedor','Frete de Mercadoria Comprada','Frete Motoboy','Gratificações','Honorários Advocatícios','Honorários Contábeis','Hora Extra','Impostos sobre Aplicações','INMETRO','INSS sobre 13º salário - GPS','INSS sobre Salários - GPS','Parcelamento INSS sobre Salários - GPS','IOF','IPTU','IPVA / DPVAT / Licenciamento','Juros Conta Garantida','Juros de boleto adiantado','Juros de Cartão de Crédito','Juros de Cheque Especial','Juros de Conta Corrente','Lanches e Refeições','Leasing - Veículos','Licença de Funcionamento - CRMV-RJ','Manutenção de Equipamentos','Manutenção de Veículos','Manutenção Predial','Máquinas, Equipamentos e Instalações Industriais','Marketing e Publicidade','Materiais Aplicados na Prestação de Serviços','Materiais de Escritório','Materiais de Limpeza e de Higiene','Mensalidade de Conta Corrente','Mensalidade de Máquina de Cartão','Metas Alcançadas','Móveis, Utensílios e Instalações Administrativos','Móveis, Utensílios e Instalações Comerciais','Multas de Trânsito','Outras Despesas','Parcelamento do Simples Nacional','Pedágios','Plano de Saúde Sócios','PLR - Participação nos Lucros e Resultados','Propaganda','Rescisões','Retenção - Darf 3208 - IRRF Aluguel','Salários','Segurança do Trabalho','Seguro de Imóveis','Seguros de Veículos','Simples Nacional - DAS','Software / Licença de Uso','Tarifas Bancárias','Tarifas de Boletos','Tarifas de Cartões de Crédito','Tarifas DOC / TED','Taxa CRMV - RJ','Taxa de Descarga','Taxa do Corpo de Bombeiro','Telefonia e Internet','Telefonia Móvel','Transporte de Mercadorias Vendidas','Uniformes','Veterinário Responsável','Vigilância e Segurança Patrimonial'];
const COST_CENTERS=['Custo com Fornecedor','Custo com Funcionário','Despesa Administrativa','Despesa Financeira','Despesa Fixa','Despesa Pessoal','Empréstimo Bancário','Imposto','Investimento','Retirada'];
/* ======================= CRM INTELIGENTE ======================= */
function crmDaysTo(dateStr){ // dias do hoje até a data (negativo = já venceu)
  if(!dateStr) return null;
  const t=new Date(); t.setHours(0,0,0,0);
  const d=new Date(String(dateStr).length>10?dateStr:dateStr+'T00:00:00'); d.setHours(0,0,0,0);
  return Math.round((d-t)/86400000);
}
function crmRisk(dias){ // dias de atraso (>0)
  if(dias>=30) return 'alto'; if(dias>=8) return 'medio'; return 'baixo';
}
// ---- CRM: Contas a PAGAR (fornecedores) ----
async function renderCrmPay(){
  const box=$('#crmPay'); if(!box) return;
  const loja=($('#payStore')||{}).value||null;
  const { data, error } = await sb.rpc('erp_payables_list',{ p_ini:null, p_fim:null, p_status:'abertas', p_store:loja });
  if(error){ box.innerHTML=''; return; }
  const rows=(data||[]).filter(r=>r.status!=='paga');
  window._payRows=rows;
  if(!rows.length){ box.innerHTML='<div class="crm"><div class="crm-head"><h2>🧠 CRM inteligente · fornecedores</h2></div><div class="crm-mini">Nenhuma conta em aberto. Fluxo de saída sob controle. 🎉</div></div>'; return; }
  const withDays=rows.map(r=>({...r, _d:crmDaysTo(r.vencimento)}));
  const overdue=withDays.filter(r=>r.atrasada||(r._d!=null&&r._d<0));
  const today=withDays.filter(r=>r._d===0);
  const d7=withDays.filter(r=>r._d!=null&&r._d>=0&&r._d<=7);
  const d30=withDays.filter(r=>r._d!=null&&r._d>=0&&r._d<=30);
  const sum=a=>a.reduce((s,r)=>s+(+r.valor||0),0);
  const totOverdue=sum(overdue), totAll=sum(rows), tot7=sum(d7), tot30=sum(d30);
  // top fornecedores por valor em aberto
  const byForn={};
  withDays.forEach(r=>{const k=r.fornecedor||'—'; (byForn[k]=byForn[k]||{nome:k,val:0,n:0,venc:0}); byForn[k].val+=(+r.valor||0); byForn[k].n++; if(r.atrasada||(r._d!=null&&r._d<0))byForn[k].venc+=(+r.valor||0);});
  const tops=Object.values(byForn).sort((a,b)=>b.val-a.val).slice(0,4);
  const maxV=tops.length?tops[0].val:1;
  // priorização de pagamento: vencidas primeiro (mais atrasadas e maiores), depois vencendo
  const prio=withDays.slice().sort((a,b)=>{
    const ao=(a._d!=null&&a._d<0)?1:0, bo=(b._d!=null&&b._d<0)?1:0;
    if(ao!==bo) return bo-ao;
    if(ao) return (a._d)-(b._d) || (b.valor-a.valor); // mais atrasada primeiro
    return (a._d==null?9999:a._d)-(b._d==null?9999:b._d) || (b.valor-a.valor);
  }).slice(0,5);
  const ins=[];
  if(overdue.length) ins.push(`⚠️ <b>${overdue.length} conta(s) vencida(s)</b> somam <b>${BRL(totOverdue)}</b> — priorize o pagamento para evitar juros e corte de fornecimento.`);
  if(today.length) ins.push(`📅 <b>${today.length}</b> conta(s) vencem <b>hoje</b> (${BRL(sum(today))}).`);
  ins.push(`💧 Saída prevista: <b>${BRL(tot7)}</b> em 7 dias · <b>${BRL(tot30)}</b> em 30 dias. Programe o caixa.`);
  if(tops[0]) ins.push(`🏭 Maior exposição: <b>${esc(tops[0].nome)}</b> com <b>${BRL(tops[0].val)}</b> em aberto.`);
  box.innerHTML=`<div class="crm">
    <div class="crm-head"><h2>🧠 CRM inteligente · fornecedores</h2><span class="grow"></span>
      <button class="crm-toggle" data-onclick="renderCrmPay()">↻ Recalcular</button></div>
    <div class="crm-kpis">
      <div class="crm-kpi ${totOverdue>0?'bad':'good'}"><div class="k">Vencido</div><div class="v">${BRL(totOverdue)}</div><div class="s">${overdue.length} conta(s)</div></div>
      <div class="crm-kpi warn"><div class="k">Vence em 7 dias</div><div class="v">${BRL(tot7)}</div><div class="s">${d7.length} conta(s)</div></div>
      <div class="crm-kpi"><div class="k">Saída 30 dias</div><div class="v">${BRL(tot30)}</div><div class="s">${d30.length} conta(s)</div></div>
      <div class="crm-kpi"><div class="k">Total em aberto</div><div class="v">${BRL(totAll)}</div><div class="s">${rows.length} conta(s)</div></div>
    </div>
    ${ins.map(t=>`<div class="crm-ins">${t}</div>`).join('')}
    <div class="crm-sec">🏭 Fornecedores por valor em aberto</div>
    <div class="crm-list">${tops.map(t=>`<div class="crm-row" style="display:block">
      <div style="display:flex;align-items:center;gap:10px"><span class="nm">${esc(t.nome)}</span>
        <span class="meta">${t.n} conta(s)${t.venc>0?` · <span style="color:#ffb9b5">${BRL(t.venc)} vencido</span>`:''}</span>
        <span class="val">${BRL(t.val)}</span></div>
      <div class="crm-bar"><i style="width:${Math.max(6,Math.round(t.val/maxV*100))}%"></i></div></div>`).join('')}</div>
    <div class="crm-sec">✅ Prioridade de pagamento (sugestão)</div>
    <div class="crm-list">${prio.map(r=>{const atras=(r._d!=null&&r._d<0); const dias=atras?Math.abs(r._d):0;
      const risk=atras?crmRisk(dias):null;
      return `<div class="crm-row">
        <div><div class="nm">${esc(r.fornecedor||'—')}</div>
          <div class="meta">${esc(r.descricao||'sem descrição')} · vence ${fmtDate(r.vencimento)}${atras?` · <b style="color:#ffb9b5">${dias}d em atraso</b>`:(r._d===0?' · <b style="color:#ffde7a">hoje</b>':` · em ${r._d}d`)}</div></div>
        ${risk?`<span class="crm-risk ${risk}">${risk}</span>`:''}
        <span class="val">${BRL(r.valor)}</span>
        <div class="act"><button class="btn green sm" data-onclick="payPayable('${r.id}')">Pagar</button></div>
      </div>`;}).join('')}</div>
  </div>`;
}

// ---- CRM: Contas a RECEBER (régua de cobrança) ----
async function renderCrmRecv(){
  const box=$('#crmRecv'); if(!box) return;
  const { data, error } = await sb.rpc('erp_receivables_list',{ p_ini:null, p_fim:null, p_status:'abertas' });
  if(error){ box.innerHTML=''; return; }
  const rows=(data||[]).filter(r=>r.status!=='paga').map(r=>({...r,_d:crmDaysTo(r.vencimento)}));
  if(!rows.length){ box.innerHTML='<div class="crm"><div class="crm-head"><h2>🧠 CRM inteligente · cobrança</h2></div><div class="crm-mini">Nenhuma parcela em aberto. Recebíveis em dia. 🎉</div></div>'; return; }
  const overdue=rows.filter(r=>r.atrasada||(r._d!=null&&r._d<0));
  const today=rows.filter(r=>r._d===0);
  const d7=rows.filter(r=>r._d!=null&&r._d>=0&&r._d<=7);
  const sum=a=>a.reduce((s,r)=>s+(+r.valor||0),0);
  const totOverdue=sum(overdue), totAll=sum(rows), tot7=sum(d7);
  // agrupa inadimplentes por cliente
  const byCust={};
  overdue.forEach(r=>{const k=r.customer_id||r.cliente_nome; const g=(byCust[k]=byCust[k]||{nome:r.cliente_nome,fone:r.cliente_fone,val:0,n:0,maxd:0});
    g.val+=(+r.valor||0); g.n++; const dd=(r._d!=null&&r._d<0)?Math.abs(r._d):0; if(dd>g.maxd)g.maxd=dd;});
  const clientes=Object.values(byCust).sort((a,b)=>{const ra={alto:3,medio:2,baixo:1}[crmRisk(b.maxd)]-{alto:3,medio:2,baixo:1}[crmRisk(a.maxd)]; return ra||b.val-a.val;}).slice(0,6);
  const nClientes=Object.keys(byCust).length;
  const ins=[];
  if(overdue.length) ins.push(`🔴 <b>${nClientes} cliente(s) inadimplente(s)</b> devem <b>${BRL(totOverdue)}</b> em ${overdue.length} parcela(s). Acione a régua de cobrança abaixo.`);
  if(today.length) ins.push(`📅 <b>${today.length}</b> parcela(s) vencem <b>hoje</b> (${BRL(sum(today))}) — um lembrete evita o atraso.`);
  ins.push(`📈 A receber nos próximos 7 dias: <b>${BRL(tot7)}</b> (${d7.length} parcela(s)).`);
  box.innerHTML=`<div class="crm">
    <div class="crm-head"><h2>🧠 CRM inteligente · cobrança</h2><span class="grow"></span>
      <button class="crm-toggle" data-onclick="renderCrmRecv()">↻ Recalcular</button></div>
    <div class="crm-kpis">
      <div class="crm-kpi ${totOverdue>0?'bad':'good'}"><div class="k">Inadimplência</div><div class="v">${BRL(totOverdue)}</div><div class="s">${nClientes} cliente(s)</div></div>
      <div class="crm-kpi warn"><div class="k">A receber 7 dias</div><div class="v">${BRL(tot7)}</div><div class="s">${d7.length} parcela(s)</div></div>
      <div class="crm-kpi"><div class="k">Total em aberto</div><div class="v">${BRL(totAll)}</div><div class="s">${rows.length} parcela(s)</div></div>
      <div class="crm-kpi ${overdue.length?'warn':'good'}"><div class="k">Parcelas vencidas</div><div class="v">${overdue.length}</div><div class="s">de ${rows.length}</div></div>
    </div>
    ${ins.map(t=>`<div class="crm-ins">${t}</div>`).join('')}
    <div class="crm-sec">📣 Régua de cobrança — prioridade</div>
    ${clientes.length?`<div class="crm-list">${clientes.map(c=>{const risk=crmRisk(c.maxd);
      return `<div class="crm-row">
        <div><div class="nm">${esc(c.nome||'Cliente')}</div>
          <div class="meta">${c.n} parcela(s) vencida(s) · atraso máx. <b style="color:#ffb9b5">${c.maxd}d</b></div></div>
        <span class="crm-risk ${risk}">${risk}</span>
        <span class="val">${BRL(c.val)}</span>
        <div class="act">${c.fone?`<button class="btn acc sm" data-onclick="crmCobrar('${(c.fone||'').replace(/\D/g,'')}','${esc((c.nome||'').replace(/'/g,''))}',${c.val},${c.maxd})">💬 Cobrar</button>`:'<span class="crm-mini">sem telefone</span>'}</div>
      </div>`;}).join('')}</div>`:'<div class="crm-mini">Nenhum cliente inadimplente no momento. 🎉</div>'}
  </div>`;
}
window.crmCobrar=(fone,nome,valor,dias)=>{
  const msg=`Olá ${nome}! Passando para lembrar do seu saldo em aberto de ${BRL(valor)}${dias>0?` (vencido há ${dias} dia(s))`:''}. Podemos combinar o pagamento? Qualquer coisa estou à disposição. 🙂`;
  const f=String(fone||'').replace(/\D/g,'').replace(/^55/,'');
  window.open('https://wa.me/55'+f+'?text='+encodeURIComponent(msg),'_blank');
};

async function loadPayables(){
  try{ await sb.rpc('erp_recurring_run',{p_ahead_days:45}); }catch(e){}
  fillStoreSelect('payStore','Todas as lojas');
  const st=($('#payStatus')||{}).value; const status = st===''? null : (st||'abertas');
  const ini=($('#payIni')||{}).value||null, fim=($('#payFim')||{}).value||null;
  const loja=($('#payStore')||{}).value||null;
  const { data, error } = await sb.rpc('erp_payables_list',{ p_ini:ini, p_fim:fim, p_status:status, p_store:loja });
  if(error){ toast('Erro: '+error.message,true); return; }
  const rows=data||[]; window._payRows=rows;
  const abertas=rows.filter(r=>r.status!=='paga');
  const venc=abertas.filter(r=>r.atrasada);
  const pagas=rows.filter(r=>r.status==='paga');
  const tot=abertas.reduce((a,r)=>a+ +r.valor,0), totV=venc.reduce((a,r)=>a+ +r.valor,0);
  const totPago=pagas.reduce((a,r)=>a+ (+r.valor_pago|| +r.valor),0);
  const totJuros=pagas.reduce((a,r)=>a+ (+r.juros||0),0);
  $('#payStats').innerHTML = `
    <div class="stat acc"><div class="k">Total a pagar</div><div class="v">${BRL(tot)}</div>
      <div class="muted" style="font-size:12px">${abertas.length} conta(s)</div></div>
    <div class="stat ${totV>0?'warn':''}"><div class="k">Vencido</div><div class="v ${totV>0?'neg':''}">${BRL(totV)}</div>
      <div class="muted" style="font-size:12px">${venc.length} em atraso</div></div>
    <div class="stat"><div class="k">Pago no período</div><div class="v">${BRL(totPago)}</div>
      <div class="muted" style="font-size:12px">${pagas.length} conta(s)</div></div>
    <div class="stat"><div class="k">Juros pagos</div><div class="v ${totJuros>0?'neg':''}">${BRL(totJuros)}</div></div>`;
  $('#payBody').innerHTML = rows.map(r=>{
    const paga=r.status==='paga';
    const chip = paga?'<span class="chip ok">paga</span>':(r.atrasada?'<span class="chip warn">vencida</span>':'<span class="chip amber">aberta</span>');
    return `<tr class="clickrow ${r.atrasada&&!paga?'low':''}" data-onclick="payableDetail('${r.id}')">
      <td>${r.conta_bancaria?esc(r.conta_bancaria):'<span class="muted">—</span>'}</td>
      <td>${chip}</td>
      <td><b>${esc(r.fornecedor||'—')}</b>${r.recorrente?' <span class="chip" title="Conta fixa · gera as próximas sozinha">🔁 fixa</span>':(r.template_id?' <span class="chip" title="Gerada por recorrência" style="opacity:.75">🔁</span>':'')}<br><span class="muted" style="font-size:11px">${esc(r.descricao||'')}</span></td>
      <td>${esc(r.loja_nome||'—')}</td>
      <td>${fmtDate(r.vencimento)}</td>
      <td class="r"><b>${BRL(r.valor)}</b></td>
      <td class="r ${+r.juros>0?'neg':'muted'}">${BRL(r.juros)}</td>
      <td class="r">${r.valor_pago!=null?`<b>${BRL(r.valor_pago)}</b>`:'<span class="muted">—</span>'}</td>
      <td>${r.pago_em?fmtDT(r.pago_em):'<span class="muted">—</span>'}${paga&&r.pago_metodo?`<br><span class="muted" style="font-size:11px">${esc(r.pago_metodo)}</span>`:''}</td>
      <td>${r.categoria?`<span class="chip">${esc(r.categoria)}</span>`:'<span class="muted">—</span>'}</td>
      <td>${r.centro_custo?esc(r.centro_custo):'<span class="muted">—</span>'}</td>
      <td class="r" style="white-space:nowrap" data-onclick="event.stopPropagation()">
        ${paga?`<button class="btn ghost sm" data-onclick="payableDetail('${r.id}')">Ver</button>`
              :`<button class="btn ghost sm" data-onclick="payableForm('${r.id}')">Editar</button>
                <button class="btn green sm" data-onclick="payPayable('${r.id}')">Pagar</button>`}
        <button class="btn ghost sm red" data-onclick="delPayable('${r.id}')" title="Excluir lançamento">🗑️</button>
      </td></tr>`;
  }).join('') || '<tr><td colspan="12" class="muted" style="text-align:center;padding:20px">Nenhuma conta nesse filtro. 🎉</td></tr>';
}
window.payableDetail = id=>{
  const r=(window._payRows||[]).find(x=>x.id===id); if(!r) return;
  const paga=r.status==='paga';
  modal(`<div class="m-head"><h3>${esc(r.fornecedor||'Conta')} ${paga?'<span class="chip ok">paga</span>':''}</h3><button data-modal-close>✕</button></div>
    <div class="m-body">
      <p style="font-family:Fredoka;font-size:26px;font-weight:700;margin:0 0 8px">${BRL(r.valor_pago!=null?r.valor_pago:r.valor)}</p>
      <div style="background:#f7f9ff;border:1px solid var(--line);border-radius:10px;padding:11px">
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">Descrição</span><b>${esc(r.descricao||'—')}</b></div>
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">Loja</span><b>${esc(r.loja_nome||'—')}</b></div>
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">Origem</span><b>${esc(r.origem||'—')}</b></div>
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">Vencimento</span><b>${fmtDate(r.vencimento)}</b></div>
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">Valor original</span><b>${BRL(r.valor)}</b></div>
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">Juros</span><b class="${+r.juros>0?'neg':''}">${BRL(r.juros)}</b></div>
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">Total pago</span><b>${r.valor_pago!=null?BRL(r.valor_pago):'—'}</b></div>
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">Último pagamento</span><b>${r.pago_em?fmtDT(r.pago_em):'—'}</b></div>
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">Forma</span><b>${esc(r.pago_metodo||'—')}</b></div>
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">Conta bancária</span><b>${esc(r.conta_bancaria||'—')}</b></div>
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">Categoria</span><b>${esc(r.categoria||'—')}</b></div>
        <div class="l" style="display:flex;justify-content:space-between"><span class="muted">Centro de custo</span><b>${esc(r.centro_custo||'—')}</b></div>
        ${r.recorrente?`<div class="l" style="display:flex;justify-content:space-between"><span class="muted">🔁 Recorrência</span><b>a cada ${r.recorrencia_meses||1} mês(es)${r.recorrencia_fim?` até ${fmtDate(r.recorrencia_fim)}`:''}</b></div>`:(r.template_id?`<div class="l" style="display:flex;justify-content:space-between"><span class="muted">🔁 Origem</span><b>gerada por conta fixa</b></div>`:'')}
      </div>
    </div>
    <div class="m-foot">${r.recorrente?`<button class="btn ghost red" data-onclick="stopRecurring('${r.id}')" title="Não gerar mais as próximas contas">⏹️ Parar recorrência</button>`:''}
      <button class="btn ghost red" data-onclick="delPayable('${r.id}')" title="Excluir este lançamento">🗑️ Excluir</button>
      ${paga?'':`<button class="btn ghost" data-onclick="payableForm('${r.id}')">Editar</button>
      <button class="btn green" data-onclick="payPayable('${r.id}')">Pagar</button>`}
      <button class="btn" data-modal-close>Fechar</button></div>`);
};
window.delPayable = async (id)=>{
  const r=(window._payRows||[]).find(x=>x.id===id)||{};
  const nome=[r.fornecedor||r.fornecedor_nome, r.descricao].filter(Boolean).join(' · ')||'esta conta';
  let msg='Excluir o lançamento "'+nome+'" ('+BRL(r.valor)+')?\n\nEssa ação não pode ser desfeita.';
  if(r.recorrente) msg='⚠️ Esta é uma conta FIXA (recorrente).\n\nExcluir "'+nome+'" ('+BRL(r.valor)+')? As contas já geradas continuam; apenas este lançamento é removido.\n\nEssa ação não pode ser desfeita.';
  else if(r.status==='paga') msg='⚠️ Esta conta já foi PAGA.\n\nExcluir "'+nome+'" ('+BRL(r.valor)+')? Ela sairá dos totais de pagamentos do período.\n\nEssa ação não pode ser desfeita.';
  if(!await uiConfirm(msg,{danger:true,okText:'Excluir',cancelText:'Cancelar'})) return;
  const { error } = await sb.rpc('erp_payable_delete',{ p_id:id });
  if(error){ toast('Erro: '+error.message,true); return; }
  closeModal(); toast('Lançamento excluído 🗑️'); loadPayables();
};
window.stopRecurring = async (id)=>{
  if(!await uiConfirm('Parar a recorrência desta conta fixa? As contas já geradas continuam; apenas as futuras deixam de ser criadas.',{danger:true,okText:'Parar recorrência',cancelText:'Voltar'})) return;
  const { error } = await sb.rpc('erp_recurring_stop',{ p_template_id:id });
  if(error){ toast('Erro: '+error.message,true); return; }
  closeModal(); toast('Recorrência interrompida ⏹️'); loadPayables();
};
function catOptions(sel){ return PAY_CATS.map(c=>`<option ${sel===c?'selected':''}>${c}</option>`).join(''); }
function ccOptions(sel){ const has=sel&&COST_CENTERS.includes(sel); return COST_CENTERS.map(c=>`<option ${sel===c?'selected':''}>${c}</option>`).join('')+(sel&&!has?`<option selected>${esc(sel)}</option>`:''); }
window.payableForm = (id)=>{
  const r=id?((window._payRows||[]).find(x=>x.id===id)||{}):{};
  sb.from('suppliers').select('id,nome').eq('ativo',true).order('nome').then(({data})=>{
    const so = '<option value="">— sem fornecedor —</option>' + (data||[]).map(x=>`<option value="${x.id}" ${r.supplier_id===x.id?'selected':''}>${esc(x.nome)}</option>`).join('');
    const lo = STORES.map(x=>`<option value="${x.id}" ${(r.store_id||CURRENT_STORE)===x.id?'selected':''}>${esc(x.nome)}</option>`).join('');
    const d=new Date(); d.setDate(d.getDate()+30);
    const venc = r.vencimento || new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
    modal(`<div class="m-head"><h3>${id?'Editar':'Nova'} conta a pagar</h3><button data-modal-close>×</button></div>
      <div class="m-body">
        <div class="field"><label class="lbl">Fornecedor</label><select id="pyForn" class="in" ${id?'disabled':''}>${so}</select></div>
        <div class="field"><label class="lbl">Loja devedora</label><select id="pyStore" class="in" ${id?'disabled':''}>${lo}</select></div>
        <div class="field"><label class="lbl">Descrição</label><input id="pyDesc" class="in" value="${esc(r.descricao||'')}"></div>
        <div class="grid2">
          <div class="field"><label class="lbl">Valor</label><input id="pyVal" class="in" inputmode="decimal" value="${r.valor!=null?r.valor:''}"></div>
          <div class="field"><label class="lbl">Vencimento</label><input id="pyVenc" class="in" type="date" value="${venc}"></div>
          <div class="field"><label class="lbl">🏦 Conta bancária</label><input id="pyConta" class="in" value="${esc(r.conta_bancaria||'')}" placeholder="ex: Itaú 1234-5 / Caixa loja"></div>
          <div class="field"><label class="lbl">🏷️ Categoria</label><select id="pyCat" class="in"><option value="">— nenhuma —</option>${catOptions(r.categoria)}</select></div>
          <div class="field"><label class="lbl">🎯 Centro de custo</label><select id="pyCC" class="in"><option value="">— nenhum —</option>${ccOptions(r.centro_custo)}</select></div>
        </div>
        ${id?'':`
        <div class="field" style="margin-top:2px;padding-top:8px;border-top:1px solid var(--line)">
          <label style="display:flex;align-items:center;gap:8px;font-weight:800;cursor:pointer;color:var(--ink)">
            <input type="checkbox" id="pyRec" style="width:17px;height:17px;accent-color:var(--dark)" data-toggle-target="pyRecOpts">
            🔁 Repetir automaticamente (conta fixa: aluguel, fornecedor fixo…)</label>
        </div>
        <div id="pyRecOpts" class="grid2" style="display:none">
          <div class="field"><label class="lbl">A cada (meses)</label><input id="pyRecMeses" class="in" type="number" min="1" value="1"></div>
          <div class="field"><label class="lbl">Repetir até (opcional)</label><input id="pyRecFim" class="in" type="date"></div>
          <p class="muted" style="grid-column:1/-1;font-size:12px;margin:0">As próximas contas são criadas sozinhas (todo mês, até 45 dias à frente). Você pode parar quando quiser no detalhe da conta.</p>
        </div>`}
      </div>
      <div class="m-foot"><button class="btn ghost" data-modal-close>Cancelar</button>
        <button class="btn" data-onclick="savePayable(${id?`'${id}'`:'null'})">Salvar</button></div>`);
  });
};
window.savePayable = async (id)=>{
  const val=num($('#pyVal').value); if(!val){ toast('Informe o valor.',true); return; }
  const base={ descricao:$('#pyDesc').value, valor:val, vencimento:$('#pyVenc').value,
    conta_bancaria:$('#pyConta').value, categoria:$('#pyCat').value, centro_custo:$('#pyCC').value };
  let error;
  const recEl=$('#pyRec'); const rec = !!(recEl&&recEl.checked);
  if(id){ ({ error } = await sb.rpc('erp_payable_update',{ p:{ id, ...base } })); }
  else { ({ error } = await sb.rpc('erp_payable_create',{ p:{ supplier_id:$('#pyForn').value||null,
      store_id:$('#pyStore').value, ...base,
      recorrente:rec,
      recorrencia_meses: rec? (parseInt(($('#pyRecMeses')||{}).value)||1) : null,
      recorrencia_fim: rec? (($('#pyRecFim')||{}).value||null) : null } })); }
  if(error){ toast('Erro: '+error.message,true); return; }
  if(!id && rec){ try{ await sb.rpc('erp_recurring_run',{p_ahead_days:45}); }catch(e){} }
  closeModal(); toast(id?'Conta atualizada':(rec?'Conta fixa criada · repetição ativada 🔁':'Conta criada')); loadPayables();
};
window.payPayable = (id)=>{
  const r=(window._payRows||[]).find(x=>x.id===id)||{};
  const hoje=hojeISO();
  const atraso = r.vencimento && r.vencimento<hoje ? Math.round((new Date(hoje)-new Date(r.vencimento))/86400000) : 0;
  modal(`<div class="m-head"><h3>Pagar conta</h3><button data-modal-close>✕</button></div>
    <div class="m-body">
      <p class="muted" style="margin:0 0 4px">${esc(r.fornecedor||'—')} · ${esc(r.descricao||'')}</p>
      <p style="font-family:Fredoka;font-size:26px;font-weight:700;margin:0 0 4px">${BRL(r.valor)}</p>
      <p class="muted" style="margin:0 0 10px">Vencimento ${fmtDate(r.vencimento)}${atraso>0?` · <span class="neg">${atraso} dia(s) em atraso</span>`:''}</p>
      <div class="grid2">
        <div class="field"><label class="lbl">Data do pagamento</label><input id="ppData" class="in" type="date" value="${hoje}"></div>
        <div class="field"><label class="lbl">Juros / multa (R$)</label><input id="ppJuros" class="in" inputmode="decimal" value="0" data-oninput="ppTot()"></div>
        <div class="field"><label class="lbl">Forma</label><select id="ppForma" class="in">
          <option value="dinheiro">💵 Dinheiro</option><option value="pix">📱 PIX</option>
          <option value="transferencia">🏦 Transferência</option><option value="boleto">🧾 Boleto</option>
          <option value="debito">💳 Débito</option><option value="credito">💳 Crédito</option></select></div>
        <div class="field"><label class="lbl">🏦 Conta bancária</label><input id="ppConta" class="in" value="${esc(r.conta_bancaria||'')}" placeholder="de onde saiu o dinheiro"></div>
        <div class="field"><label class="lbl">🏷️ Categoria</label><select id="ppCat" class="in"><option value="">— manter —</option>${catOptions(r.categoria)}</select></div>
        <div class="field"><label class="lbl">🎯 Centro de custo</label><select id="ppCC" class="in"><option value="">— nenhum —</option>${ccOptions(r.centro_custo)}</select></div>
      </div>
      <div class="sum" style="border-radius:12px;margin-top:6px">
        <div class="l"><span>Valor original</span><b>${BRL(r.valor)}</b></div>
        <div class="l"><span>Juros</span><b id="ppJurosView">${BRL(0)}</b></div>
        <div class="l big"><span>Total a pagar</span><b id="ppTotal">${BRL(r.valor)}</b></div>
      </div>
    </div>
    <div class="m-foot"><button class="btn ghost" data-modal-close>Cancelar</button>
      <button class="btn green" data-onclick="doPayPayable('${id}')">Confirmar pagamento</button></div>`);
  window._payVal=+r.valor||0;
};
window.ppTot = ()=>{
  const j=num(($('#ppJuros')||{}).value||0), v=+window._payVal||0;
  if($('#ppJurosView')) $('#ppJurosView').textContent=BRL(j);
  if($('#ppTotal')) $('#ppTotal').textContent=BRL(v+j);
};
window.doPayPayable = async (id)=>{
  const { error } = await sb.rpc('erp_payable_pay',{ p_id:id, p_metodo:$('#ppForma').value,
    p_juros:num($('#ppJuros').value)||0, p_data:$('#ppData').value||null,
    p_conta:$('#ppConta').value||null, p_categoria:$('#ppCat').value||null, p_centro:$('#ppCC').value||null });
  if(error){ toast('Erro: '+error.message,true); return; }
  closeModal(); toast('Conta paga ✅');
  if(currentPage==='pagarcrm') renderCrmPay(); else loadPayables();
  if(currentPage==='home') loadHome();
};

// ======================= FORNECEDORES =======================
async function suppliersModal(){
  const { data } = await sb.from('suppliers').select('*').eq('ativo',true).order('nome');
  window.SUPPLIER_MODAL_ROWS=data||[];
  modal(`<div class="m-head"><h3>🏭 Fornecedores</h3><button data-modal-close>×</button></div>
    <div class="m-body">
      <div class="tbl-wrap" style="margin-bottom:12px"><table><thead><tr><th>Nome</th><th>CNPJ</th><th>Telefone</th><th>Prazo padrão</th></tr></thead>
        <tbody>${(data||[]).map(s=>`<tr class="clickrow" data-onclick="supplierEdit('${s.id}')"><td><b>${esc(s.nome)}</b></td><td>${esc(s.cnpj||'—')}</td><td>${esc(s.telefone||'—')}</td><td>${s.lead_time_days||7} dias</td></tr>`).join('')||'<tr><td colspan="4" class="muted">Nenhum.</td></tr>'}</tbody></table></div>
      <input id="suId" type="hidden">
      <div class="grid2">
        <div class="field"><label class="lbl">Nome *</label><input id="suNome" class="in"></div>
        <div class="field"><label class="lbl">CNPJ</label><input id="suCnpj" class="in"></div>
        <div class="field"><label class="lbl">Telefone</label><input id="suFone" class="in"></div>
        <div class="field"><label class="lbl">E-mail</label><input id="suEmail" class="in"></div>
        <div class="field"><label class="lbl">Prazo padrão de entrega (dias)</label><input id="suLead" class="in" value="7" inputmode="numeric"></div>
      </div>
    </div>
    <div class="m-foot"><button class="btn ghost" data-modal-close>Fechar</button>
      <button class="btn" id="suSaveBtn" data-onclick="saveSupplier()">+ Adicionar fornecedor</button></div>`);
}
window.supplierEdit=id=>{const s=(window.SUPPLIER_MODAL_ROWS||[]).find(x=>x.id===id);if(!s)return;$('#suId').value=s.id;$('#suNome').value=s.nome||'';$('#suCnpj').value=s.cnpj||'';$('#suFone').value=s.telefone||'';$('#suEmail').value=s.email||'';$('#suLead').value=s.lead_time_days||7;$('#suSaveBtn').textContent='Salvar fornecedor';};
window.saveSupplier = async ()=>{
  const nome=$('#suNome').value.trim(); if(!nome){ toast('Informe o nome.',true); return; }
  const { error } = await sb.rpc('erp_supplier_upsert',{ p:{ id:$('#suId').value||null,nome, cnpj:$('#suCnpj').value, telefone:$('#suFone').value, email:$('#suEmail').value,lead_time_days:parseInt($('#suLead').value)||7 } });
  if(error){ toast('Erro: '+error.message,true); return; }
  toast('Fornecedor salvo'); suppliersModal();
};

// ======================= TRANSFERÊNCIAS =======================
const trSearch=$('#trSearch'), trRes=$('#trRes');
async function loadMatrizStock(){
  const matriz=STORES.find(s=>s.is_matriz);
  if(!matriz){ MATRIZ_STOCK={}; return; }
  const { data } = await sb.rpc('erp_products',{ p_store: matriz.id });
  MATRIZ_STOCK={}; (data||[]).forEach(p=> MATRIZ_STOCK[p.id]=+p.estoque);
}
if(trSearch){
  trSearch.oninput = ()=>{
    const q=trSearch.value.trim().toLowerCase();
    if(!q){ trRes.classList.add('hide'); return; }
    const hits=PRODUCTS.filter(p=>p.nome.toLowerCase().includes(q)||(p.sku||'').toLowerCase().includes(q)).slice(0,8);
    trRes.innerHTML = hits.map(p=>{ const sm=MATRIZ_STOCK[p.id]??0;
      return `<div data-onclick="trAdd('${p.id}')"><b>${esc(p.nome)}</b><span class="${sm<=0?'out':'muted'}">Modelo: ${sm.toLocaleString('pt-BR')} · custo ${BRL(p.custo)}</span></div>`;
    }).join('')||'<div class="muted">Nada encontrado.</div>';
    trRes.classList.remove('hide');
  };
  trSearch.onblur=()=>setTimeout(()=>trRes.classList.add('hide'),150);
}
window.trAdd = id=>{
  const p=PRODUCTS.find(x=>x.id===id); if(!p) return;
  const l=TR_CART.find(x=>x.product_id===id);
  if(l) l.qtd++; else TR_CART.push({ product_id:p.id, nome:p.nome, qtd:1, custo:+p.custo });
  trSearch.value=''; trRes.classList.add('hide'); renderTrCart();
};
function renderTrCart(){
  const box=$('#trCart'), empty=$('#trEmpty');
  if(!TR_CART.length){ box.innerHTML=''; empty.classList.remove('hide'); $('#trTotal').textContent=BRL(0); return; }
  empty.classList.add('hide');
  box.innerHTML = TR_CART.map((l,i)=>{ const sm=MATRIZ_STOCK[l.product_id]??0; const falta=l.qtd>sm;
    return `<div class="cart-item">
    <div class="nm"><b>${esc(l.nome)}</b><span class="muted" style="font-size:12px">Modelo: ${sm.toLocaleString('pt-BR')} · custo ${BRL(l.custo)} ${falta?'· <span class="neg">saldo insuf.</span>':''}</span></div>
    <div class="qty"><button data-onclick="trQty(${i},-1)">−</button><input value="${l.qtd}" data-onchange="trSetQty(${i},this.value)"><button data-onclick="trQty(${i},1)">+</button></div>
    <b style="width:82px;text-align:right">${BRL(l.qtd*l.custo)}</b>
    <button data-onclick="trRm(${i})" style="color:var(--red);font-size:18px;padding:0 4px">×</button></div>`;
  }).join('');
  $('#trTotal').textContent = BRL(TR_CART.reduce((a,l)=>a+l.qtd*l.custo,0));
}
window.trQty=(i,d)=>{ TR_CART[i].qtd=Math.max(1,TR_CART[i].qtd+d); renderTrCart(); };
window.trSetQty=(i,v)=>{ TR_CART[i].qtd=Math.max(1,parseFloat(v)||1); renderTrCart(); };
window.trRm=i=>{ TR_CART.splice(i,1); if(!TR_CART.length) TR_SOURCE_LISTS=[]; renderTrCart(); };
$('#btnTrCreate').onclick = async ()=>{
  if(!TR_CART.length){ toast('Adicione produtos.',true); return; }
  const dest=$('#trDest').value; if(!dest){ toast('Selecione a loja de destino.',true); return; }
  const items=TR_CART.map(l=>({ product_id:l.product_id, qtd:l.qtd, custo_unit:l.custo }));
  const { data, error } = await sb.rpc('erp_transfer_create',{ p_destino:dest, p_items:items, p_obs:null });
  if(error){ toast('Erro: '+error.message,true); return; }
  toast('Pedido de transferência #'+data.numero+' criado (rascunho)');
  // esvazia as listas de Compras (Iconha/Reta) que alimentaram esta transferência
  if(typeof window.cmpClearList === 'function') TR_SOURCE_LISTS.forEach(l => window.cmpClearList(l));
  TR_SOURCE_LISTS = [];
  TR_CART=[]; renderTrCart(); loadTransfers();
};
{ const b=$('#btnTrFilter'); if(b) b.onclick=()=>loadTransfers();
  const m=$('#btnTrMes'); if(m) m.onclick=()=>{ const r=mesAtualISO(); setDates('trIni','trFim',r.ini,r.fim); loadTransfers(); };
  ['trIni','trFim'].forEach(id=>{ const el=$('#'+id); if(el) el.onchange=()=>loadTransfers(); }); }
async function loadTransfers(){
  await loadMatrizStock();
  renderTrCart();
  const i=$('#trIni'); if(i && !i.value){ const r=mesAtualISO(); setDates('trIni','trFim',r.ini,r.fim); }
  const ini=($('#trIni')||{}).value, fim=($('#trFim')||{}).value;
  let q = sb.from('transfers')
    .select('id, numero, created_at, status, total_custo, destino_store, stores!transfers_destino_store_fkey(nome), transfer_items(id)')
    .order('created_at',{ascending:false}).limit(200);
  if(ini) q=q.gte('created_at', ini+'T00:00:00');
  if(fim) q=q.lte('created_at', fim+'T23:59:59');
  const { data, error } = await q;
  if(error){ toast('Erro: '+error.message,true); return; }
  const rows=data||[];
  const tot=rows.filter(t=>t.status!=='cancelado').reduce((a,t)=>a+ +t.total_custo,0);
  $('#trBody').innerHTML = rows.map(t=>`
    <tr class="clickrow" data-onclick="trDetail('${t.id}')"><td><b>#${t.numero}</b></td><td>${fmtDT(t.created_at)}</td>
      <td>${esc(t.stores?.nome||'—')}</td><td class="r">${(t.transfer_items||[]).length}</td>
      <td class="r"><b>${BRL(t.total_custo)}</b></td>
      <td>${t.status==='confirmado'?'<span class="chip ok">confirmado</span>':t.status==='cancelado'?'<span class="chip warn">cancelado</span>':'<span class="chip amber">rascunho</span>'}</td>
      <td class="r" style="white-space:nowrap" data-onclick="event.stopPropagation()">${t.status==='rascunho'?`
        <button class="btn green sm" data-onclick="trConfirm('${t.id}',${t.numero})">Confirmar</button>
        <button class="btn ghost sm red" data-onclick="trCancel('${t.id}')">Cancelar</button>`:`
        <button class="btn ghost sm" data-onclick="trDetail('${t.id}')">Ver</button>`}</td>
    </tr>`).join('') || '<tr><td colspan="7" class="muted" style="text-align:center;padding:16px">Nenhuma transferência no período.</td></tr>';
  const head=$('#trBody').closest('.card').querySelector('.head .grow');
  if(head && !$('#trResumo')){ const sp=document.createElement('span'); sp.id='trResumo'; sp.className='muted'; sp.style.fontSize='13px'; head.after(sp); }
  const res=$('#trResumo'); if(res) res.innerHTML=`${rows.length} transferência(s) · custo ${BRL(tot)}`;
}
window.trDetail = async id=>{
  const { data:d } = await sb.rpc('erp_transfer_detail',{ p_transfer:id });
  if(!d){ toast('Transferência não encontrada.',true); return; }
  window._trPrint=d;
  const itens=(d.itens||[]).map(it=>`<tr><td>${esc(it.descricao||'')} <span class="muted" style="font-size:11px">${esc(it.sku||'')}</span></td>
      <td class="r">${(+it.qtd).toLocaleString('pt-BR')}</td><td class="r">${BRL(it.custo_unit)}</td>
      <td class="r"><b>${BRL(it.subtotal)}</b></td></tr>`).join('');
  const totQtd=(d.itens||[]).reduce((a,i)=>a+(+i.qtd||0),0);
  const chip = d.status==='confirmado'?'<span class="chip ok">confirmado</span>':d.status==='cancelado'?'<span class="chip warn">cancelado</span>':'<span class="chip amber">rascunho</span>';
  modal(`<div class="m-head"><h3>Transferência #${d.numero} ${chip}</h3><button data-modal-close>✕</button></div>
    <div class="m-body">
      <p class="muted" style="margin:0 0 6px">${esc(d.origem_nome||'Modelo')} → <b>${esc(d.destino_nome||'—')}</b> · criada em ${fmtDT(d.created_at)}${d.confirmed_at?` · confirmada em ${fmtDT(d.confirmed_at)}`:''}</p>
      ${d.obs?`<p class="muted">Obs: ${esc(d.obs)}</p>`:''}
      <div class="tbl-wrap"><table>
        <thead><tr><th>Produto</th><th class="r">Qtd</th><th class="r">Custo un.</th><th class="r">Total</th></tr></thead>
        <tbody>${itens||'<tr><td colspan="4" class="muted">Sem itens.</td></tr>'}</tbody></table></div>
      <div class="sum" style="border-radius:12px;margin-top:8px">
        <div class="l"><span>Itens</span><b>${(d.itens||[]).length} produto(s) · ${totQtd.toLocaleString('pt-BR')} un.</b></div>
        <div class="l big"><span>Custo total</span><b>${BRL(d.total_custo)}</b></div>
      </div>
    </div>
    <div class="m-foot">
      <button class="btn ghost" data-onclick="trPrint()">🖨️ Imprimir</button>
      ${d.status==='rascunho'?`<button class="btn green" data-onclick="closeModal();trConfirm('${d.id}',${d.numero})">Confirmar</button>`:''}
      <button class="btn" data-modal-close>Fechar</button></div>`);
};
window.trPrint = ()=>{
  const d=window._trPrint; if(!d) return; const co=COMPANY||{};
  $('#receiptPrint').innerHTML = `
    <h3>${esc(co.nome||'Minha Loja')}</h3>
    <div class="c b">TRANSFERÊNCIA #${d.numero}</div>
    <div class="c" style="font-size:10px">${esc(d.origem_nome||'')} → ${esc(d.destino_nome||'')}</div>
    <div class="c" style="font-size:10px">${fmtDT(d.created_at)} · ${esc(d.status)}</div>
    <div class="ln"></div>
    <table>${(d.itens||[]).map(i=>`
      <tr><td>${esc(i.descricao||'')}</td></tr>
      <tr><td class="row"><span>${(+i.qtd).toLocaleString('pt-BR')} x ${BRL(i.custo_unit)}</span><span>${BRL(i.subtotal)}</span></td></tr>`).join('')}</table>
    <div class="ln"></div>
    <div class="row b" style="font-size:14px"><span>CUSTO TOTAL</span><span>${BRL(d.total_custo)}</span></div>
    <div class="ln"></div>
    <div class="row" style="font-size:10px"><span>Conferido por</span><span>____________________</span></div>
    <div class="c" style="font-size:10px;margin-top:6px">${new Date().toLocaleString('pt-BR')} · ONPDV</div>`;
  window.print();
};
window.trConfirm = async (id, num)=>{
  if(!await uiConfirm('Confirmar a transferência #'+num+'? O estoque será movido da Modelo para a loja e será gerada a fatura de custo.',{okText:'Confirmar transferência'})) return;
  const { error } = await sb.rpc('erp_transfer_confirm',{ p_transfer:id });
  if(error){ toast('Erro: '+error.message,true); return; }
  toast('Transferência confirmada — estoque movido e fatura gerada'); loadTransfers(); loadProducts();
};
window.trCancel = async (id)=>{
  const { error } = await sb.rpc('erp_transfer_cancel',{ p_transfer:id });
  if(error){ toast('Erro: '+error.message,true); return; }
  toast('Transferência cancelada'); loadTransfers();
};

// ======================= IMPORTAR NF-e (XML) =======================
$('#btnImportNfe').onclick = ()=> $('#xmlFile').click();
$('#btnNfeImpRefresh').onclick = ()=> renderNfeImports();
$('#nfeImpFilter').oninput = ()=> drawNfeImports();
$('#xmlFile').onchange = async (e)=>{
  const file=e.target.files[0]; if(!file) return;
  const text=await file.text(); e.target.value='';
  let nfe; try{ nfe=parseNFe(text); }catch(err){ toast('XML inválido: '+err.message,true); return; }
  if(!nfe.items.length){ toast('Nenhum item encontrado no XML.',true); return; }
  window._nfe=nfe;
  modal(`<div class="m-head"><h3>Importar NF-e de compra</h3><button data-modal-close>×</button></div>
    <div class="m-body" id="nfeBody"><p class="muted" style="padding:20px">Conferindo os vínculos com o estoque…</p></div>`,'wide');
  const { data, error } = await sb.rpc('erp_nfe_preview',{ p_supplier:nfe.supplier, p_items:nfe.items });
  if(error){ $('#nfeBody').innerHTML='<p class="neg" style="padding:16px">Erro: '+esc(error.message)+'</p>'; return; }
  window._nfePrev=(data&&data.itens)||[];
  renderNfeModal();
};
function nfeViaChip(v){
  return { vinculo:'<span class="chip ok">vínculo salvo</span>', ean:'<span class="chip ok">cód. barras</span>',
    nome:'<span class="chip amber">pelo nome</span>' }[v] || '<span class="chip warn">novo produto</span>';
}
function renderNfeModal(){
  const nfe=window._nfe, prev=window._nfePrev||[];
  const totProd=prev.reduce((a,i)=>a+ (+i.qtd||0)*(+i.custo_unit||0),0);
  const novos=prev.filter(i=>!i.product_id).length;
  const loja=(STORES.find(x=>x.id===CURRENT_STORE)||{}).nome||'—';
  const linhas=prev.map((i,k)=>`<tr>
      <td><b>${esc(i.nome)}</b><br><span class="muted" style="font-size:11px">cód. forn.: ${esc(i.cprod||'—')}${i.ean?' · EAN '+esc(i.ean):''}</span></td>
      <td class="r">${(+i.qtd).toLocaleString('pt-BR')}</td>
      <td class="r">${BRL(i.custo_unit)}</td>
      <td>${i.product_id
          ? `<b>${esc(i.produto_nome||'')}</b> <span class="muted" style="font-size:11px">${esc(i.produto_sku||'')}</span><br>${nfeViaChip(i.via)}`
          : '<span class="chip warn">será criado</span>'}</td>
      <td class="r" style="white-space:nowrap">
        <button class="btn ghost sm" data-onclick="nfeLink(${k})">${i.product_id?'Trocar':'Vincular'}</button>
        ${i.product_id?`<button class="btn ghost sm red" data-onclick="nfeUnlink(${k})" title="Criar produto novo">✕</button>`:''}
      </td></tr>`).join('');
  $('#nfeBody').innerHTML = `
    <p><b>Fornecedor:</b> ${esc(nfe.supplier.nome||'—')} ${nfe.supplier.cnpj?`<span class="muted">(${esc(nfe.supplier.cnpj)})</span>`:''}</p>
    <p class="muted" style="margin:4px 0 8px">Entrada no estoque de <b>${esc(loja)}</b> · ${prev.length} item(ns) · ${nfe.parcelas.length||1} parcela(s) · total ${BRL(totProd)}
      ${novos>0?` · <span class="neg">${novos} sem vínculo (serão criados)</span>`:' · <span class="ok">todos vinculados ✅</span>'}</p>
    <div class="tbl-wrap" style="max-height:340px;overflow:auto"><table>
      <thead><tr><th>Item da NF-e</th><th class="r">Qtd</th><th class="r">Custo un.</th><th>Produto no estoque</th><th></th></tr></thead>
      <tbody>${linhas}</tbody></table></div>
    <p class="muted" style="font-size:13px;margin-top:8px">O vínculo que você escolher aqui fica gravado: na próxima NF-e desse fornecedor o item entra automaticamente no mesmo produto.</p>
    <div class="m-foot" style="padding:12px 0 0"><button class="btn ghost" data-modal-close>Cancelar</button>
      <button class="btn green" data-onclick="doImportNfe()">Importar e dar entrada</button></div>`;
}
window.nfeUnlink=k=>{ const it=(window._nfePrev||[])[k]; if(!it) return;
  it.product_id=null; it.produto_nome=null; it.produto_sku=null; it.via=null; renderNfeModal(); };
window.nfeLink=k=>{
  const it=(window._nfePrev||[])[k]; if(!it) return;
  window._nfeIdx=k;
  modal(`<div class="m-head"><h3>Vincular “${esc(it.nome)}”</h3><button data-onclick="nfeBack()">✕</button></div>
    <div class="m-body">
      <div class="field"><label class="lbl">Buscar produto no estoque (nome, SKU ou código de barras)</label>
        <input id="nfqSearch" class="in" placeholder="digite para buscar…" autocomplete="off"></div>
      <div id="nfqRes" class="tbl-wrap" style="max-height:300px;overflow:auto"></div>
    </div>
    <div class="m-foot"><button class="btn ghost" data-onclick="nfeBack()">Voltar</button></div>`);
  const inp=$('#nfqSearch');
  const draw=()=>{
    const q=(inp.value||'').trim().toLowerCase();
    const hits=(PRODUCTS||[]).filter(p=>!q||p.nome.toLowerCase().includes(q)||(p.sku||'').toLowerCase().includes(q)||(p.codigo_barras||'').includes(q)).slice(0,40);
    $('#nfqRes').innerHTML = `<table><tbody>${hits.map(p=>`<tr class="clickrow" data-onclick="nfePick('${p.id}')">
      <td><b>${esc(p.nome)}</b><br><span class="muted" style="font-size:11px">${esc(p.sku||'sem SKU')}${p.codigo_barras?' · '+esc(p.codigo_barras):''}</span></td>
      <td class="r">${BRL(p.preco)}</td><td class="r muted">custo ${BRL(p.custo)}</td></tr>`).join('')
      ||'<tr><td class="muted" style="padding:14px">Nada encontrado.</td></tr>'}</tbody></table>`;
  };
  inp.oninput=draw; draw(); inp.focus();
};
window.nfePick=pid=>{
  const it=(window._nfePrev||[])[window._nfeIdx]; const p=(PRODUCTS||[]).find(x=>x.id===pid);
  if(it&&p){ it.product_id=p.id; it.produto_nome=p.nome; it.produto_sku=p.sku; it.via='vinculo'; }
  nfeBack();
};
window.nfeBack=()=>{
  const nfe=window._nfe;
  modal(`<div class="m-head"><h3>Importar NF-e de compra</h3><button data-modal-close>×</button></div>
    <div class="m-body" id="nfeBody"></div>`,'wide');
  renderNfeModal();
};
function parseNFe(xmlText){
  const doc=new DOMParser().parseFromString(xmlText,'text/xml');
  if(doc.getElementsByTagName('parsererror').length) throw new Error('não é um XML válido');
  const g=(parent,tag)=> (parent&&parent.getElementsByTagName(tag)[0]) ? parent.getElementsByTagName(tag)[0].textContent.trim() : '';
  const emit=doc.getElementsByTagName('emit')[0];
  const supplier={ nome:g(emit,'xNome'), cnpj:g(emit,'CNPJ') };
  const items=[...doc.getElementsByTagName('det')].map(det=>{
    const prod=det.getElementsByTagName('prod')[0];
    let ean=g(prod,'cEAN'); if(/sem\s*gtin/i.test(ean)) ean='';
    return { nome:g(prod,'xProd'), ean, cprod:g(prod,'cProd'), ncm:g(prod,'NCM'), unidade:g(prod,'uCom'),
      qtd:parseFloat(g(prod,'qCom')||'0'), custo_unit:parseFloat(g(prod,'vUnCom')||'0') };
  }).filter(i=>i.nome);
  const parcelas=[...doc.getElementsByTagName('dup')].map(d=>({ vencimento:g(d,'dVenc'), valor:parseFloat(g(d,'vDup')||'0') })).filter(p=>p.valor>0);
  const infNFe=doc.getElementsByTagName('infNFe')[0];
  const chave=(infNFe&&infNFe.getAttribute('Id')||'').replace(/^NFe/,'')||null;
  return { supplier, items, parcelas, chave };
}
window.doImportNfe = async ()=>{
  const nfe=window._nfe; if(!nfe) return;
  const prev=window._nfePrev||[];
  const items=nfe.items.map((it,k)=>({ ...it, product_id: (prev[k]&&prev[k].product_id)||null }));
  const { data, error } = await sb.rpc('erp_import_nfe',{ p_store:CURRENT_STORE,
    p_supplier:nfe.supplier, p_items:items, p_parcelas:nfe.parcelas, p_chave:nfe.chave });
  if(error){ toast('Erro: '+error.message,true); return; }
  closeModal();
  toast(`${data.produtos} item(ns): ${data.novos} novo(s), ${data.atualizados} atualizado(s) · ${BRL(data.total)}`);
  await loadProducts(); renderProducts(); buildPdvCatalog();
  if(currentPage==='nfimport') renderNfeImports();
};

// ======================= NF-e IMPORTADAS (HISTÓRICO) =======================
let NFE_IMPORTS=[];
async function renderNfeImports(){
  const body=$('#nfeImpBody'); if(!body) return;
  body.innerHTML='<tr><td colspan="7" class="muted" style="text-align:center;padding:20px">Carregando…</td></tr>';
  const { data, error } = await sb.rpc('erp_nfe_list',{ p_store:CURRENT_STORE });
  if(error){ body.innerHTML='<tr><td colspan="7" class="neg" style="text-align:center;padding:20px">Erro: '+esc(error.message)+'</td></tr>'; return; }
  NFE_IMPORTS = data||[];
  drawNfeImports();
}
function drawNfeImports(){
  const body=$('#nfeImpBody'); if(!body) return;
  const q=(($('#nfeImpFilter')||{}).value||'').trim().toLowerCase();
  const rows=NFE_IMPORTS.filter(n=>!q
    || (n.fornecedor_nome||'').toLowerCase().includes(q)
    || (n.fornecedor_cnpj||'').toLowerCase().includes(q)
    || (n.chave||'').toLowerCase().includes(q));
  body.innerHTML = rows.map(n=>`<tr class="clickrow" data-onclick="nfeImportDetail('${n.id}')">
      <td>${new Date(n.created_at).toLocaleString('pt-BR')}</td>
      <td><b>${esc(n.fornecedor_nome||'—')}</b>${n.fornecedor_cnpj?`<br><span class="muted" style="font-size:11px">${esc(n.fornecedor_cnpj)}</span>`:''}</td>
      <td class="r">${n.n_itens||0}</td>
      <td class="c">${n.n_novos>0?`<span class="chip warn">${n.n_novos}</span>`:'<span class="muted">0</span>'}</td>
      <td class="r">${BRL(n.total)}</td>
      <td><span class="muted" style="font-size:11px">${n.chave?esc(n.chave):'—'}</span></td>
      <td class="r"><button class="btn ghost sm" data-onclick="event.stopPropagation();nfeImportDetail('${n.id}')">Ver</button></td>
    </tr>`).join('') || `<tr><td colspan="7" class="muted" style="text-align:center;padding:20px">${NFE_IMPORTS.length?'Nenhuma NF-e encontrada para o filtro.':'Nenhuma NF-e importada nesta loja ainda.'}</td></tr>`;
}
window.nfeImportDetail = async (id)=>{
  modal(`<div class="m-head"><h3>NF-e importada</h3><button data-modal-close>×</button></div>
    <div class="m-body" id="nfeDetBody"><p class="muted" style="padding:20px">Carregando…</p></div>`,'wide');
  const { data, error } = await sb.rpc('erp_nfe_detail',{ p_id:id });
  if(error){ $('#nfeDetBody').innerHTML='<p class="neg" style="padding:16px">Erro: '+esc(error.message)+'</p>'; return; }
  const h=data.header||{}, itens=data.itens||[];
  const linhas=itens.map(i=>`<tr>
      <td><b>${esc(i.nome||'')}</b><br><span class="muted" style="font-size:11px">${i.cprod?'cód. forn.: '+esc(i.cprod):''}${i.ean?(i.cprod?' · ':'')+'EAN '+esc(i.ean):''}</span></td>
      <td>${i.produto_nome
          ? `<b>${esc(i.produto_nome)}</b> <span class="muted" style="font-size:11px">${esc(i.produto_sku||'')}</span>${i.novo?' <span class="chip warn">criado</span>':''}`
          : '<span class="muted">—</span>'}</td>
      <td class="r">${(+i.qtd).toLocaleString('pt-BR')}${i.unidade?' '+esc(i.unidade):''}</td>
      <td class="r">${BRL(i.custo_unit)}</td>
      <td class="r">${BRL((+i.qtd||0)*(+i.custo_unit||0))}</td>
    </tr>`).join('');
  $('#nfeDetBody').innerHTML = `
    <p><b>Fornecedor:</b> ${esc(h.fornecedor_nome||'—')} ${h.fornecedor_cnpj?`<span class="muted">(${esc(h.fornecedor_cnpj)})</span>`:''}</p>
    <p class="muted" style="margin:4px 0 8px">Importada em ${h.created_at?new Date(h.created_at).toLocaleString('pt-BR'):'—'} · ${h.n_itens||0} item(ns) · ${h.n_novos||0} novo(s) · ${h.parcelas||1} parcela(s) · total ${BRL(h.total)}
      ${h.chave?`<br>Chave: <code style="font-size:11px">${esc(h.chave)}</code>`:''}</p>
    <div class="tbl-wrap" style="max-height:360px;overflow:auto"><table>
      <thead><tr><th>Item da NF-e</th><th>Produto no estoque</th><th class="r">Qtd</th><th class="r">Custo un.</th><th class="r">Subtotal</th></tr></thead>
      <tbody>${linhas||'<tr><td colspan="5" class="muted" style="padding:14px">Sem itens.</td></tr>'}</tbody></table></div>
    <div class="m-foot" style="padding:12px 0 0"><button class="btn ghost" data-modal-close>Fechar</button></div>`;
};

// ======================= MAQUININHAS (CONFIG) =======================
$('#btnNewTerm').onclick = ()=> termForm();
async function renderTerminals(){
  const { data } = await sb.from('pos_terminals').select('*').eq('ativo',true).eq('finalidade','pagamento').eq('provedor','mercadopago').order('nome');
  TERMINALS = data||[];
  $('#termBody').innerHTML = TERMINALS.map(t=>{
    return `
    <tr>
      <td><b>${esc(t.nome)}</b><br><span class="chip amber" style="font-size:10px">Mercado Pago Point</span></td>
      <td>Point${t.serial?`<br><span class="muted" style="font-size:11px">Série: ${esc(t.serial)}</span>`:''}</td>
      <td>${t.provider_terminal_id?`<code style="font-size:12px">${esc(t.provider_terminal_id)}</code>`:'<span class="muted" style="font-size:12px">usar Device ID global</span>'}</td>
      <td class="muted">${t.last_seen? new Date(t.last_seen).toLocaleString('pt-BR') : 'nunca'}</td>
      <td class="r"><button class="btn ghost sm red" data-onclick="delTerm('${t.id}')">Remover</button></td>
    </tr>`;}).join('') || '<tr><td colspan="5" class="muted" style="text-align:center;padding:20px">Nenhuma maquininha cadastrada.</td></tr>';
  loadTerminals();
}
window.termForm = ()=>{
  modal(`
    <div class="m-head"><h3>Nova maquininha · Mercado Pago Point</h3><button data-modal-close>×</button></div>
    <div class="m-body">
      <div class="field"><label class="lbl">Nome *</label><input id="tfNome" class="in" placeholder="Ex: Caixa 1"></div>
      <div class="field"><label class="lbl">Device ID do Point</label>
        <input id="tfDevice" class="in" placeholder="ex.: PAX_A910__SMARTPOS1234567890">
        <p class="muted" style="font-size:12px;margin-top:4px">No aparelho, ative o modo <b>PDV/Integrado</b> e copie o Device ID no app do vendedor do Mercado Pago. Deixe em branco para usar o Device ID global (Config → Mercado Pago Point).</p></div>
      <div class="field"><label class="lbl">Serial (opcional)</label><input id="tfSerial" class="in"></div>
    </div>
    <div class="m-foot"><button class="btn ghost" data-modal-close>Cancelar</button>
      <button class="btn" data-onclick="saveTerm()">Criar</button></div>`);
};
window.saveTerm = async ()=>{
  const nome=$('#tfNome').value.trim(); if(!nome){ toast('Informe o nome.',true); return; }
  const row={ nome, provedor:'mercadopago', finalidade:'pagamento', modelo:'point',
    serial:$('#tfSerial').value||null,
    provider_terminal_id:($('#tfDevice').value||'').trim()||null };
  const { error } = await sb.from('pos_terminals').insert(row);
  if(error){ toast('Erro: '+error.message,true); return; }
  closeModal(); toast('Maquininha cadastrada'); renderTerminals();
};
window.delTerm = async (id)=>{
  const { error } = await sb.from('pos_terminals').update({ ativo:false }).eq('id',id);
  if(error){ toast('Erro: '+error.message,true); return; }
  toast('Removida'); renderTerminals();
};

// ======================= OPERAÇÕES 360 =======================
let OPS={health:[],lots:[],collections:[],subscriptions:[],forecast:[],quotes:[],portal:[],audit:[]};
const opsEmpty=(cols,msg)=>`<tr><td colspan="${cols}" class="muted" style="text-align:center;padding:18px">${esc(msg)}</td></tr>`;
async function opsSelect(table, configure){
  let q=sb.from(table).select('*');
  if(configure)q=configure(q);
  const {data,error}=await q;
  return {data:data||[],error};
}
async function loadOpsCenter(){
  if(!isAdmin())return;
  const banner=$('#opsBanner'); banner.classList.add('hide'); banner.textContent='';
  ['opsHealthBody','opsLotsBody','opsCollectionsBody','opsSubscriptionsBody','opsForecastBody','opsQuotesBody','opsPortalBody','opsAuditBody']
    .forEach(id=>{const el=$('#'+id);if(el)el.innerHTML=opsEmpty(4,'Carregando…');});
  const [health,lots,collections,subscriptions,forecast,quotes,portal,audit]=await Promise.all([
    opsSelect('v_ops_integration_health',q=>q.order('checked_at',{ascending:false}).limit(30)),
    opsSelect('v_inventory_lot_status',q=>q.order('expires_on',{ascending:true,nullsFirst:false}).limit(60)),
    opsSelect('collection_jobs',q=>q.order('created_at',{ascending:false}).limit(40)),
    opsSelect('customer_subscriptions',q=>q.order('next_run_on',{ascending:true}).limit(40)),
    opsSelect('v_ops_forecast'),
    opsSelect('purchase_quotes',q=>q.order('created_at',{ascending:false}).limit(30)),
    opsSelect('portal_requests',q=>q.order('created_at',{ascending:false}).limit(30)),
    opsSelect('audit_events',q=>q.order('created_at',{ascending:false}).limit(50))
  ]);
  const firstError=[health,lots,collections,subscriptions,forecast,quotes,portal,audit].find(x=>x.error);
  if(firstError){
    banner.textContent='Os módulos Operações 360 ainda não foram implantados neste Supabase. A interface já está pronta e será ativada após aplicar as novas migrações.';
    banner.classList.remove('hide');
  }
  OPS={health:health.data,lots:lots.data,collections:collections.data,subscriptions:subscriptions.data,
    forecast:forecast.data,quotes:quotes.data,portal:portal.data,audit:audit.data};
  renderOpsCenter();
}
function renderOpsCenter(){
  const customerName=id=>{const c=(CUSTOMERS||[]).find(x=>x.id===id);return c?(c.nome||c.name||'Cliente'):'Cliente';};
  const badHealth=OPS.health.filter(x=>x.status==='error'||x.stale).length;
  const expiring=OPS.lots.filter(x=>['expired','critical'].includes(x.expiry_status)).length;
  const queued=OPS.collections.filter(x=>x.status==='queued').length;
  const active=OPS.subscriptions.filter(x=>x.status==='active').length;
  $('#opsStats').innerHTML=`
    <div class="stat ${badHealth?'warn':'acc'}"><div class="k">Integrações com atenção</div><div class="v">${badHealth}</div></div>
    <div class="stat ${expiring?'warn':''}"><div class="k">Lotes críticos/vencidos</div><div class="v">${expiring}</div></div>
    <div class="stat"><div class="k">Cobranças na fila</div><div class="v">${queued}</div></div>
    <div class="stat"><div class="k">Assinaturas ativas</div><div class="v">${active}</div></div>`;
  $('#opsHealthBody').innerHTML=OPS.health.map(r=>`<tr><td><b>${esc(r.service)}</b>${r.store_name?`<br><span class="muted">${esc(r.store_name)}</span>`:''}</td>
    <td><span class="ops-status ${esc(r.stale?'warning':r.status)}"></span>${esc(r.stale?'desatualizado':r.status)}</td>
    <td>${fmtDT(r.checked_at)}</td><td>${esc(r.message||'—')}</td></tr>`).join('')||opsEmpty(4,'Nenhuma checagem registrada.');
  $('#opsLotsBody').innerHTML=OPS.lots.map(r=>{const st=r.expiry_status||'ok';const cls=['expired','critical','recalled'].includes(st)?'warn':(st==='warning'?'amber':'ok');
    return `<tr><td><b>${esc(r.product_name||'Produto')}</b><br><span class="muted">Lote ${esc(r.lot_code)}</span></td>
      <td>${r.expires_on?fmtDate(r.expires_on):'sem validade'}${r.days_to_expiry!=null?`<br><span class="muted">${r.days_to_expiry} dia(s)</span>`:''}</td>
      <td class="r">${fmtNum(r.quantity_free||0)}</td><td><span class="chip ${cls}">${esc(st)}</span></td></tr>`;}).join('')||opsEmpty(4,'Nenhum lote registrado.');
  $('#opsCollectionsBody').innerHTML=OPS.collections.map(r=>`<tr><td><b>${esc((r.metadata&&r.metadata.customer_name)||customerName(r.customer_id))}</b>
      <br><span class="muted">${r.days_overdue||0} dia(s) de atraso</span></td><td>${fmtDate(r.due_on)}</td>
      <td class="r">${BRL(r.amount)}</td><td><span class="chip ${r.status==='failed'?'warn':r.status==='sent'?'ok':'amber'}">${esc(r.status)}</span></td></tr>`).join('')||opsEmpty(4,'Nenhuma cobrança gerada.');
  $('#opsSubscriptionsBody').innerHTML=OPS.subscriptions.map(r=>`<tr><td><b>${esc(customerName(r.customer_id))}</b></td>
      <td>${fmtDate(r.next_run_on)}</td><td>${r.interval_days} dias</td>
      <td><span class="chip ${r.status==='active'?'ok':r.status==='past_due'?'warn':'amber'}">${esc(r.status)}</span></td></tr>`).join('')||opsEmpty(4,'Nenhuma assinatura cadastrada.');
  $('#opsForecastBody').innerHTML=OPS.forecast.map(r=>`<tr><td><b>${esc(r.store_name||'Loja')}</b></td>
      <td class="r">${BRL(r.avg_daily_28d)}</td><td class="r"><b>${BRL(r.forecast_30d)}</b></td>
      <td class="r ${Number(r.trend_pct)<0?'neg':''}">${r.trend_pct==null?'—':(Number(r.trend_pct)>=0?'▲ ':'▼ ')+fmtNum(Math.abs(r.trend_pct))+'%'}</td></tr>`).join('')||opsEmpty(4,'Execute as automações para calcular a previsão.');
  $('#opsQuotesBody').innerHTML=OPS.quotes.map(r=>`<tr><td><b>#${esc(r.code)}</b></td><td>${r.response_due_on?fmtDate(r.response_due_on):'—'}</td>
      <td><span class="chip ${r.status==='approved'?'ok':r.status==='cancelled'?'warn':'amber'}">${esc(r.status)}</span></td><td>${fmtDT(r.created_at)}</td></tr>`).join('')||opsEmpty(4,'Nenhuma cotação aberta.');
  $('#opsPortalBody').innerHTML=OPS.portal.map(r=>`<tr><td><b>${esc(customerName(r.customer_id))}</b><br><span class="muted">${fmtDT(r.created_at)}</span></td>
      <td>${esc(r.request_type)}</td><td><span class="chip ${r.status==='fulfilled'?'ok':r.status==='rejected'?'warn':'amber'}">${esc(r.status)}</span></td>
      <td>${r.status==='pending'?`<button class="btn ghost sm" data-onclick="opsResolvePortal('${r.id}','processing')">Assumir</button>`:''}
      ${['pending','processing'].includes(r.status)?`<button class="btn sm" data-onclick="opsResolvePortal('${r.id}','fulfilled')">Concluir</button>`:''}</td></tr>`).join('')||opsEmpty(4,'Nenhuma solicitação do portal.');
  $('#opsAuditBody').innerHTML=OPS.audit.map(r=>`<tr><td>${fmtDT(r.created_at)}</td><td><span class="chip">${esc(r.action)}</span></td>
      <td>${esc(r.entity_type)}</td><td>${esc(r.entity_id||'—')}</td><td>${esc(r.actor_id||'sistema')}</td></tr>`).join('')||opsEmpty(5,'Nenhum evento auditado.');
}
async function opsResolvePortal(id,status){
  const {error}=await sb.rpc('ops_resolve_portal_request',{p_request:id,p_status:status,p_response:null});
  if(error){toast('Erro: '+error.message,true);return;}
  toast(status==='fulfilled'?'Solicitação concluída ✅':'Solicitação assumida');
  loadOpsCenter();
}
async function opsRun(){
  const b=$('#btnOpsRun');b.disabled=true;b.textContent='Executando…';
  try{
    const {data,error}=await sb.functions.invoke('ops-worker',{body:{limit:50}});
    if(error)throw error;if(!data||!data.ok)throw new Error((data&&data.error)||'Falha na automação');
    toast(`Automações concluídas · ${data.sent||0} mensagem(ns) enviada(s)`);
    await loadOpsCenter();
  }catch(e){console.error(e);toast('Automação indisponível até publicar o ops-worker.',true);}
  finally{b.disabled=false;b.textContent='▶ Executar automações';}
}
function opsLotModal(){
  const stores=STORES.map(s=>`<option value="${s.id}" ${s.id===CURRENT_STORE?'selected':''}>${esc(s.nome)}</option>`).join('');
  const products=PRODUCTS.map(p=>`<option value="${p.id}">${esc(p.nome||p.name)} · ${esc(p.sku||'sem SKU')}</option>`).join('');
  const suppliers=SUPPLIERS.map(s=>`<option value="${s.id}">${esc(s.nome)}</option>`).join('');
  modal(`<div class="m-head"><h3>Receber lote</h3><button data-modal-close>×</button></div><div class="m-body">
    <div class="grid2"><div class="field"><label class="lbl">Loja</label><select id="olStore" class="in">${stores}</select></div>
    <div class="field"><label class="lbl">Produto</label><select id="olProduct" class="in">${products}</select></div>
    <div class="field"><label class="lbl">Fornecedor</label><select id="olSupplier" class="in"><option value="">—</option>${suppliers}</select></div>
    <div class="field"><label class="lbl">Código do lote *</label><input id="olCode" class="in"></div>
    <div class="field"><label class="lbl">Quantidade *</label><input id="olQty" class="in" inputmode="decimal"></div>
    <div class="field"><label class="lbl">Custo unitário</label><input id="olCost" class="in" inputmode="decimal"></div>
    <div class="field"><label class="lbl">Fabricação</label><input id="olMade" class="in" type="date"></div>
    <div class="field"><label class="lbl">Validade</label><input id="olExpiry" class="in" type="date"></div></div>
    <div class="field"><label class="lbl">Chave da NF-e</label><input id="olInvoice" class="in"></div></div>
    <div class="m-foot"><button class="btn ghost" data-modal-close>Cancelar</button><button class="btn green" data-onclick="opsSaveLot()">Receber</button></div>`);
}
async function opsSaveLot(){
  const p={store_id:val('olStore'),product_id:val('olProduct'),supplier_id:val('olSupplier'),lot_code:val('olCode').trim(),
    quantity:num(val('olQty')),unit_cost:num(val('olCost')),manufactured_on:val('olMade'),expires_on:val('olExpiry'),invoice_key:val('olInvoice').trim()};
  if(!p.lot_code||p.quantity<=0){toast('Informe lote e quantidade.',true);return;}
  const {error}=await sb.rpc('erp_lot_receive',{p});if(error){toast('Erro: '+error.message,true);return;}
  closeModal();toast('Lote recebido e rastreável ✅');loadOpsCenter();
}
async function opsSubscriptionModal(){
  let plans=[]; try{ const {data}=await sb.rpc('erp_sub_plan_list'); plans=(data||[]).filter(x=>x.active); }catch(e){ console.error('planos',e); }
  const customers=(CUSTOMERS||[]).slice(0,1000).map(c=>`<option value="${c.id}">${esc(c.nome||c.name)}</option>`).join('');
  const products=PRODUCTS.map(p=>`<option value="${p.id}" data-price="${p.preco||p.price||0}">${esc(p.nome||p.name)}</option>`).join('');
  const stores=STORES.map(s=>`<option value="${s.id}" ${s.id===CURRENT_STORE?'selected':''}>${esc(s.nome)}</option>`).join('');
  const next=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  modal(`<div class="m-head"><h3>Nova assinatura</h3><button data-modal-close>×</button></div><div class="m-body">
    <div class="grid2"><div class="field"><label class="lbl">Cliente</label><select id="osCustomer" class="in">${customers}</select></div>
    <div class="field"><label class="lbl">Loja</label><select id="osStore" class="in">${stores}</select></div>
    <div class="field"><label class="lbl">Plano</label><select id="osPlan" class="in"><option value="">Personalizado</option>${(plans||[]).map(x=>`<option value="${x.id}" data-days="${x.interval_days}" data-disc="${x.discount_pct}">${esc(x.name)}</option>`).join('')}</select></div>
    <div class="field"><label class="lbl">Produto</label><select id="osProduct" class="in">${products}</select></div>
    <div class="field"><label class="lbl">Quantidade</label><input id="osQty" class="in" value="1" inputmode="decimal"></div>
    <div class="field"><label class="lbl">A cada (dias)</label><input id="osDays" class="in" value="30" inputmode="numeric"></div>
    <div class="field"><label class="lbl">Próximo ciclo</label><input id="osNext" class="in" type="date" value="${next}"></div>
    <div class="field"><label class="lbl">Pagamento</label><select id="osPay" class="in"><option value="pix">PIX</option><option value="card_link">Link de cartão</option><option value="on_delivery">Na entrega</option><option value="cash">Dinheiro</option></select></div>
    <div class="field"><label class="lbl">Entrega</label><select id="osDelivery" class="in"><option value="pickup">Retirada</option><option value="delivery">Entrega</option></select></div>
    <div class="field"><label class="lbl">Desconto %</label><input id="osDisc" class="in" value="0" inputmode="decimal"></div></div></div>
    <div class="m-foot"><button class="btn ghost" data-modal-close>Cancelar</button><button class="btn green" data-onclick="opsSaveSubscription()">Ativar</button></div>`);
  $('#osPlan').onchange=e=>{const o=e.target.selectedOptions[0];if(o&&o.dataset.days)$('#osDays').value=o.dataset.days;if(o&&o.dataset.disc)$('#osDisc').value=o.dataset.disc;};
}
let SUB_PLANS=[];
async function opsPlanModal(){ await opsPlansReload(); }
async function opsPlansReload(){
  try{ const { data }=await sb.rpc('erp_sub_plan_list'); SUB_PLANS=data||[]; }catch(e){ SUB_PLANS=[]; }
  opsPlanRender();
}
window.opsPlanRender=function(editId){
  const ed = editId?SUB_PLANS.find(p=>p.id===editId):null;
  const rows = SUB_PLANS.length ? SUB_PLANS.map(p=>`<tr>
      <td><b>${esc(p.name)}</b>${p.active?'':' <span class="chip warn">inativo</span>'}${p.description?`<br><span class="muted" style="font-size:12px">${esc(p.description)}</span>`:''}</td>
      <td>${p.interval_days}d</td><td>${p.discount_pct}%</td><td class="r">${p.assinantes||0}</td>
      <td class="r" style="white-space:nowrap">
        <button class="btn ghost sm" data-onclick="opsPlanRender('${p.id}')">Editar</button>
        <button class="btn ghost sm" data-onclick="opsPlanToggle('${p.id}',${p.active?'false':'true'})">${p.active?'Desativar':'Ativar'}</button>
      </td></tr>`).join('') : '<tr><td colspan="5" class="muted" style="text-align:center;padding:12px">Nenhum plano ainda. Crie o primeiro (ex.: “Clube da Ração”).</td></tr>';
  const stores=STORES.map(s=>`<option value="${s.id}">${esc(s.nome)}</option>`).join('');
  modal(`<div class="m-head"><h3>🔁 Planos do clube</h3><button data-modal-close>×</button></div><div class="m-body">
    <div class="tbl-wrap" style="max-height:220px;overflow:auto"><table>
      <thead><tr><th>Plano</th><th>Ciclo</th><th>Desc.</th><th class="r">Ativos</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <div class="card" style="border:1px solid var(--line);border-radius:10px;padding:12px;margin-top:12px">
      <b>${ed?'✏️ Editar plano':'➕ Novo plano'}</b>
      <input type="hidden" id="opId" value="${ed?ed.id:''}">
      <div class="grid2" style="margin-top:8px">
        <div class="field"><label class="lbl">Nome *</label><input id="opName" class="in" maxlength="100" value="${ed?esc(ed.name):''}" placeholder="Clube da Ração"></div>
        <div class="field"><label class="lbl">Loja</label><select id="opStore" class="in"><option value="">Todas</option>${stores}</select></div>
        <div class="field"><label class="lbl">Periodicidade (dias)</label><input id="opDays" class="in" inputmode="numeric" value="${ed?ed.interval_days:30}"></div>
        <div class="field"><label class="lbl">Desconto %</label><input id="opDisc" class="in" inputmode="decimal" value="${ed?ed.discount_pct:0}"></div>
        <div class="field"><label class="lbl">Taxa de entrega</label><input id="opDelivery" class="in" inputmode="decimal" value="${ed?ed.delivery_fee:0}"></div>
      </div>
      <div class="field"><label class="lbl">Descrição</label><textarea id="opDesc" class="in" rows="2" maxlength="500">${ed?esc(ed.description||''):''}</textarea></div>
      <div style="text-align:right"><button class="btn green" data-onclick="opsSavePlan()">${ed?'Salvar alterações':'Criar plano'}</button></div>
    </div></div>
    <div class="m-foot"><button class="btn ghost" data-modal-close>Fechar</button></div>`);
};
async function opsSavePlan(){
  const p={ id:val('opId')||null, store_id:val('opStore')||null, name:val('opName').trim(), description:val('opDesc').trim()||null,
    interval_days:Math.max(1,Math.min(parseInt(val('opDays'))||30,366)),
    discount_pct:Math.max(0,Math.min(num(val('opDisc')),100)), delivery_fee:Math.max(0,num(val('opDelivery'))) };
  if(!p.name){ toast('Informe o nome do plano.',true); return; }
  const { error }=await sb.rpc('erp_sub_plan_upsert',{ p });
  if(error){ toast('Erro: '+error.message,true); return; }
  toast('Plano salvo ✅'); opsPlansReload();
}
window.opsPlanToggle=async (id,active)=>{
  const { error }=await sb.rpc('erp_sub_plan_upsert',{ p:{ id, active } });
  if(error){ toast('Erro: '+error.message,true); return; }
  toast(active?'Plano ativado':'Plano desativado'); opsPlansReload();
};
async function opsSaveSubscription(){
  const prod=$('#osProduct').selectedOptions[0];
  const p={customer_id:val('osCustomer'),store_id:val('osStore'),plan_id:val('osPlan'),product_id:val('osProduct'),
    quantity:num(val('osQty')),unit_price:num(prod&&prod.dataset.price),interval_days:parseInt(val('osDays'))||30,
    next_run_on:val('osNext'),payment_method:val('osPay'),delivery_mode:val('osDelivery'),discount_pct:num(val('osDisc'))};
  const {error}=await sb.rpc('ops_create_subscription',{p});if(error){toast('Erro: '+error.message,true);return;}
  closeModal();toast('Assinatura ativada ✅');loadOpsCenter();
}
function opsQuoteModal(){
  const products=PRODUCTS.map(p=>`<option value="${p.id}">${esc(p.nome||p.name)}</option>`).join('');
  const stores=STORES.map(s=>`<option value="${s.id}" ${s.id===CURRENT_STORE?'selected':''}>${esc(s.nome)}</option>`).join('');
  const due=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  modal(`<div class="m-head"><h3>Nova cotação</h3><button data-modal-close>×</button></div><div class="m-body">
    <div class="grid2"><div class="field"><label class="lbl">Loja</label><select id="oqStore" class="in">${stores}</select></div>
    <div class="field"><label class="lbl">Prazo de resposta</label><input id="oqDue" class="in" type="date" value="${due}"></div>
    <div class="field"><label class="lbl">Produto</label><select id="oqProduct" class="in">${products}</select></div>
    <div class="field"><label class="lbl">Quantidade</label><input id="oqQty" class="in" value="1" inputmode="decimal"></div></div>
    <div class="field"><label class="lbl">Observações</label><textarea id="oqNotes" class="in"></textarea></div></div>
    <div class="m-foot"><button class="btn ghost" data-modal-close>Cancelar</button><button class="btn" data-onclick="opsSaveQuote()">Criar cotação</button></div>`);
}
async function opsSaveQuote(){
  const p={store_id:val('oqStore'),response_due_on:val('oqDue'),product_id:val('oqProduct'),quantity:num(val('oqQty')),notes:val('oqNotes')};
  if(p.quantity<=0){toast('Informe a quantidade.',true);return;}
  const {error}=await sb.rpc('erp_quote_create',{p});if(error){toast('Erro: '+error.message,true);return;}
  closeModal();toast('Cotação criada ✅');loadOpsCenter();
}
function opsInviteModal(){
  const customers=(CUSTOMERS||[]).slice(0,1000).map(c=>`<option value="${c.id}">${esc(c.nome||c.name)} · ${esc(c.email||'sem e-mail')}</option>`).join('');
  modal(`<div class="m-head"><h3>Convidar para o portal</h3><button data-modal-close>×</button></div><div class="m-body">
    <div class="field"><label class="lbl">Cliente</label><select id="oiCustomer" class="in">${customers}</select></div>
    <div class="field"><label class="lbl">E-mail de acesso</label><input id="oiEmail" class="in" type="email" autocomplete="off"></div>
    <p class="muted">O cliente receberá um convite seguro e ficará vinculado somente ao próprio cadastro.</p></div>
    <div class="m-foot"><button class="btn ghost" data-modal-close>Cancelar</button><button class="btn" data-onclick="opsSendInvite()">Enviar convite</button></div>`);
  $('#oiCustomer').onchange=()=>{const c=(CUSTOMERS||[]).find(x=>x.id===val('oiCustomer'));$('#oiEmail').value=(c&&c.email)||'';};$('#oiCustomer').dispatchEvent(new Event('change'));
}
async function opsSendInvite(){
  const customer_id=val('oiCustomer'),email=val('oiEmail').trim();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){toast('Informe um e-mail válido.',true);return;}
  const {data,error}=await sb.functions.invoke('portal-invite',{body:{customer_id,email,redirect_to:new URL('cliente.html',location.href).href}});
  if(error||!data||!data.ok){toast('Convite indisponível até publicar portal-invite.',true);return;}
  closeModal();toast('Convite enviado ✅');
}
{ const b=$('#btnOpsRefresh');if(b)b.onclick=loadOpsCenter;
  const r=$('#btnOpsRun');if(r)r.onclick=opsRun;
  const l=$('#btnOpsNewLot');if(l)l.onclick=opsLotModal;
  const p=$('#btnOpsNewPlan');if(p)p.onclick=opsPlanModal;
  const s=$('#btnOpsNewSub');if(s)s.onclick=opsSubscriptionModal;
  const q=$('#btnOpsNewQuote');if(q)q.onclick=opsQuoteModal;
  const i=$('#btnOpsInvite');if(i)i.onclick=opsInviteModal; }

// ======================= NOTIFICAÇÕES (WEB PUSH) =======================
// O backend completo já existe (VAPID + push_subscriptions + notification_outbox
// + RPCs push_save_subscription/push_delete_subscription + dispatcher via cron a
// cada 2 min). Aqui fica só o lado do navegador: inscrever este dispositivo e
// manter a inscrição viva. Alertas prontos: metas de venda, crediário vencido e
// caixa em aberto. Somente admin/operador (o RPC recusa os demais papéis).
const PUSH_VAPID_PUBLIC='BGzjQe6BoHVZMG_bwqHnPug4EASzt0jM3ymOPusek_JH5cGaaMZXiM_Inq6AJ0FRM9heFRHi-t08cC26rd4zd30';
function pushSupported(){ return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && typeof Notification!=='undefined'; }
function pushB64ToUint8(base64){
  const pad='='.repeat((4-base64.length%4)%4);
  const raw=atob((base64+pad).replace(/-/g,'+').replace(/_/g,'/'));
  const out=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++) out[i]=raw.charCodeAt(i);
  return out;
}
async function pushGetSubscription(){
  if(!pushSupported()) return null;
  try{ const reg=await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); }
  catch(e){ return null; }
}
function pushSubToRpcArgs(sub){
  const j=sub.toJSON()||{}; const keys=j.keys||{};
  return { p_endpoint:sub.endpoint, p_p256dh:keys.p256dh||'', p_auth:keys.auth||'', p_ua:navigator.userAgent||null };
}
async function pushEnable(){
  if(!pushSupported()){ toast('Este navegador não suporta notificações.',true); return; }
  if(!(ME&&ME.is_cashier)){ toast('Apenas admin e operador recebem notificações.',true); return; }
  try{
    const perm=await Notification.requestPermission();
    if(perm!=='granted'){ toast('Permissão de notificações negada.',true); renderPushCard(); return; }
    const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub) sub=await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:pushB64ToUint8(PUSH_VAPID_PUBLIC) });
    const { error }=await sb.rpc('push_save_subscription', pushSubToRpcArgs(sub));
    if(error){ toast('Não foi possível ativar: '+(error.message||''),true); }
    else toast('Notificações ativadas neste dispositivo ✓');
  }catch(e){ logErr('push', e); toast('Não foi possível ativar as notificações.',true); }
  renderPushCard();
}
async function pushDisable(){
  try{
    const sub=await pushGetSubscription();
    if(sub){ await sb.rpc('push_delete_subscription',{ p_endpoint:sub.endpoint }).catch(()=>{}); await sub.unsubscribe().catch(()=>{}); }
    toast('Notificações desativadas neste dispositivo.');
  }catch(e){ logErr('push', e); }
  renderPushCard();
}
async function pushToggle(){
  const sub=await pushGetSubscription();
  if(pushSupported() && Notification.permission==='granted' && sub) return pushDisable();
  return pushEnable();
}
// Autocura: se já autorizado e inscrito, revalida no servidor (last_seen +
// enabled). Se a linha tiver sido limpa, a inscrição volta sozinha no login.
async function pushRefreshIfEnabled(){
  try{
    if(!pushSupported() || !(ME&&ME.is_cashier) || Notification.permission!=='granted') return;
    const sub=await pushGetSubscription();
    if(sub) await sb.rpc('push_save_subscription', pushSubToRpcArgs(sub)).catch(()=>{});
  }catch(e){}
}
async function renderPushCard(){
  const card=$('#cardPush'); if(!card) return;
  const btn=$('#btnPushToggle'), lbl=$('#pushStatus');
  if(!pushSupported()){
    if(lbl) lbl.textContent='Este navegador não suporta notificações push.';
    if(btn) btn.classList.add('hide');
    return;
  }
  if(btn) btn.classList.remove('hide');
  const perm=Notification.permission;
  const sub=await pushGetSubscription();
  const on = perm==='granted' && !!sub;
  if(lbl) lbl.textContent = perm==='denied'
    ? 'Notificações bloqueadas no navegador. Libere nas permissões do site para ativar.'
    : on ? 'Ativadas neste dispositivo — você recebe metas de venda, crediário vencido e aviso de caixa em aberto.'
         : 'Desativadas neste dispositivo.';
  if(btn){
    btn.textContent = on ? 'Desativar notificações' : '🔔 Ativar notificações';
    btn.classList.toggle('ghost', on);
    btn.disabled = perm==='denied';
  }
}
window.pushEnable=pushEnable; window.pushDisable=pushDisable; window.pushToggle=pushToggle; window.renderPushCard=renderPushCard;

// ======================= GO =======================
function splitDeclarativeArgs(source){
  const values=[];let current='',quote='',escaped=false,depth=0;
  for(const char of source){
    if(escaped){current+=char;escaped=false;continue;}
    if(char==='\\'){current+=char;escaped=true;continue;}
    if(quote){current+=char;if(char===quote)quote='';continue;}
    if(char==='\''||char==='"'){quote=char;current+=char;continue;}
    if(char==='{'||char==='['||char==='('){depth++;current+=char;continue;}if(char==='}'||char===']'||char===')'){depth--;current+=char;continue;}
    if(char===','&&depth===0){values.push(current.trim());current='';continue;}current+=char;
  }
  if(current.trim())values.push(current.trim());return values;
}
function splitDeclarativeStatements(source){
  const statements=[];let current='',quote='',escaped=false,depth=0;
  for(const char of source){
    if(escaped){current+=char;escaped=false;continue;}if(char==='\\'){current+=char;escaped=true;continue;}
    if(quote){current+=char;if(char===quote)quote='';continue;}if(char==='\''||char==='"'){quote=char;current+=char;continue;}
    if(char==='('){depth++;current+=char;continue;}if(char===')'){depth--;current+=char;continue;}
    if(char===';'&&depth===0){if(current.trim())statements.push(current.trim());current='';continue;}current+=char;
  }
  if(current.trim())statements.push(current.trim());return statements;
}
function declarativeValue(token,element,event){
  if(token==='this')return element;if(token==='event')return event;
  const readPath=(base,path)=>path.split('.').filter(Boolean).reduce((value,key)=>value==null?undefined:value[key],base);
  if(token.startsWith('this.'))return readPath(element,token.slice(5));
  if(token.startsWith('event.'))return readPath(event,token.slice(6));
  if(token==='true')return true;if(token==='false')return false;if(token==='null')return null;if(token==='undefined')return undefined;
  if(/^[-+]?\d+(?:\.\d+)?$/.test(token))return Number(token);
  if((token.startsWith('{')&&token.endsWith('}'))||(token.startsWith('[')&&token.endsWith(']')))return JSON.parse(token);
  if((token.startsWith('\'')&&token.endsWith('\''))||(token.startsWith('"')&&token.endsWith('"')))return token.slice(1,-1).replace(/\\(['"\\])/g,'$1');
  throw new Error('Argumento declarativo não suportado');
}
function runDeclarativeAction(source,element,event){
  let result;
  for(const statement of splitDeclarativeStatements((source||'').trim())){
    if(statement==='event.stopPropagation()'){event.stopPropagation();continue;}
    if(statement==='event.preventDefault()'){event.preventDefault();continue;}
    const match=/^([A-Za-z_$][\w$]*)\((.*)\)$/.exec(statement);if(!match){logErr('ação-ui','Ação não suportada: '+statement);continue;}
    const fn=window[match[1]];if(typeof fn!=='function'){logErr('ação-ui','Função indisponível: '+match[1]);continue;}
    try{result=fn(...splitDeclarativeArgs(match[2]).map(token=>declarativeValue(token,element,event)));}catch(error){logErr('ação-ui',error);}
  }
  return result;
}
['click','change','input'].forEach(type=>document.addEventListener(type,event=>{
  if(type==='change'&&event.target.matches&&event.target.matches('[data-toggle-target]')){const target=$('#'+event.target.dataset.toggleTarget);if(target)target.style.display=event.target.checked?'grid':'none';}
  const element=event.target.closest&&event.target.closest(`[data-on${type}]`);if(element)runDeclarativeAction(element.getAttribute(`data-on${type}`),element,event);
}));
document.addEventListener('focusout',event=>{const element=event.target.closest&&event.target.closest('[data-onblur]');if(element)runDeclarativeAction(element.getAttribute('data-onblur'),element,event);});
function pdvQuickCustomerCepIfComplete(field){if(field.value.replace(/\D/g,'').length===8)pdvQuickCustomerCep();}
function buscaCepIfComplete(field){if(field.value.replace(/\D/g,'').length===8)buscaCep();}
function storeBuscaCepIfComplete(field){if(field.value.replace(/\D/g,'').length===8)storeBuscaCep();}
function setNewUserPermissions(checked){$$('#ncPerms .ncpermchk').forEach(control=>{control.checked=checked;});}
function pdvSetFoundCustomer(index){pdvSetCustomer(PDV._found[index]);}
enhanceAccessibility(document);
{const bindings=[['btnCashOpen',()=>cashOpen()],['btnCashSupply',()=>cashMove('suprimento')],['btnCashWithdraw',()=>cashMove('sangria')],['btnCashClose',()=>cashClose()],['btnCashShare',()=>cashShareWhats()],['btnStopScan',()=>stopScan()]];bindings.forEach(([id,fn])=>{const el=$('#'+id);if(el)el.addEventListener('click',fn);});const gift=$('#vlConsCod');if(gift)gift.addEventListener('keydown',event=>{if(event.key==='Enter'){$('#btnVlConsultar').click();}});}
document.addEventListener('keydown',event=>{
  const row=event.target.closest&&event.target.closest('[data-onclick][role="button"]');
  if(row&&(event.key==='Enter'||event.key===' ')){event.preventDefault();row.click();}
});
const A11Y_OBSERVER=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1)enhanceAccessibility(node);})));A11Y_OBSERVER.observe(document.body,{childList:true,subtree:true});
applyPaperVar();   // aplica a largura da bobina salva nesta máquina antes de qualquer impressão
initAuth();

/* ======================================================================
   ===================== MÓDULO COMPRAS (fusão 247) =====================
   Mesma lógica do COMPRAS247, porém rodando sobre o backend Supabase do
   onpdv. O catálogo, as vendas e a curva ABC vêm do onpdv; os fornecedores
   são os mesmos de Contas a pagar. Fluxo: Lista → Pedido → Aprovação →
   Recebimento → Concluído/Financeiro, com Cotações, Histórico, Alertas e
   Auditoria. Requer a migration purchase_workflow_v2 e a
   purchase_compras_module aplicadas no Supabase.
   ====================================================================== */
(() => {
  const CMP = { sales:null, salesAt:0, order:null, drafts:[], po:[], catList:'geral' };
  const cmpProd = pid => (PRODUCTS||[]).find(p => String(p.id) === String(pid));
  const cmpProdCode = p => p ? (p.sku || p.codigo_barras || '—') : '—';
  const cmpListKey = label => 'onpdv_cmp_list_' + (CURRENT_STORE || 'x') + '_' + label;
  function cmpListGet(label){ try{ return JSON.parse(localStorage.getItem(cmpListKey(label)) || '{}') || {}; }catch(e){ return {}; } }
  function cmpListSet(label, map){ try{ localStorage.setItem(cmpListKey(label), JSON.stringify(map)); }catch(e){} }
  const cmpListLabelName = l => ({geral:'Lista geral', iconha:'Lista Iconha', reta:'Lista Reta'}[l] || 'Lista');

  // ---------- vendas / ABC (reaproveitados do onpdv) ----------
  async function cmpEnsureSales(force){
    if(!force && CMP.sales && (Date.now() - CMP.salesAt) < 300000) return CMP.sales;
    const hoje = new Date();
    const ini = new Date(hoje.getTime() - 90*86400000).toISOString().slice(0,10);
    const fim = hoje.toISOString().slice(0,10);
    let trends = {}, abc = [];
    try{ const r = await sb.rpc('erp_stock_trends',{ p_store: CURRENT_STORE, p_dias: 14 }); trends = r.data || {}; }catch(e){}
    try{ const r = await sb.rpc('erp_abc',{ p_ini: ini, p_fim: fim, p_store: CURRENT_STORE }); abc = r.data || []; }catch(e){}
    const abcMap = {}; abc.forEach(x => { abcMap[String(x.product_id)] = x.classe; });
    CMP.sales = { trends, abcMap }; CMP.salesAt = Date.now();
    return CMP.sales;
  }
  const cmpDaily = (trends, pid) => { const t = trends[String(pid)]; return t ? (Number(t.recent)||0)/14 : 0; };
  const cmpAbcChip = cls => cls ? `<span class="chip ${cls==='A'?'ok':cls==='B'?'amber':'warn'}">ABC ${esc(cls)}</span>` : '<span class="muted">—</span>';

  const cmpFillSuppliers = sel => { if(sel) sel.innerHTML = '<option value="">Selecione</option>' + (SUPPLIERS||[]).map(s=>`<option value="${s.id}">${esc(s.nome)}</option>`).join(''); };
  const cmpFillStores = (sel, all) => { if(sel) sel.innerHTML = (all?'<option value="">Todas as lojas</option>':'') + (STORES||[]).map(s=>`<option value="${s.id}" ${!all&&s.id===CURRENT_STORE?'selected':''}>${esc(s.nome)}${s.is_matriz?' ★':''}</option>`).join(''); };
  const cmpSupplierName = id => { const s=(SUPPLIERS||[]).find(x=>String(x.id)===String(id)); return s?(s.nome||'—'):(id||'—'); };

  // =================== LISTA (geral / iconha / reta) ===================
  async function cmpRenderLista(label){
    const host = $('#page-cmp' + (label==='geral'?'Lista':label==='iconha'?'ListaIconha':'ListaReta') + ' > div');
    if(!host) return;
    host.innerHTML = '<div class="card pad"><p class="muted">Carregando catálogo e vendas…</p></div>';
    const { trends, abcMap } = await cmpEnsureSales();
    const map = cmpListGet(label);
    const ids = Object.keys(map);
    // Iconha e Reta são filiais: os itens viram uma transferência (Modelo → filial),
    // não uma compra de fornecedor. A montagem final acontece na aba Transferências.
    const isTransfer = (label === 'iconha' || label === 'reta');
    const primaryBtn = isTransfer
      ? `<button class="btn" data-onclick="cmpListToTransfer('${label}')">🔄 Montar transferência</button>`
      : `<button class="btn" data-onclick="cmpListToOrder('${label}')">Montar pedido</button>`;
    const listRows = ids.map(pid => {
      const p = cmpProd(pid); if(!p) return '';
      const dia = cmpDaily(trends, pid);
      return `<tr>
        <td>${esc(cmpProdCode(p))}</td>
        <td><b>${esc(p.nome)}</b></td>
        <td class="r"><input class="in" style="width:80px;text-align:right;padding:5px 7px" inputmode="decimal" value="${num(map[pid])||0}" data-oninput="cmpListQty('${label}','${pid}', this.value)"></td>
        <td class="c">${p.track_stock?trendBadge(trends[String(pid)]):'—'}</td>
        <td class="r">${fmtNum(dia)}<span class="muted" style="font-size:11px">/dia</span></td>
        <td>${cmpAbcChip(abcMap[String(pid)])}</td>
        <td class="r"><button class="btn ghost sm red" data-onclick="cmpListRemove('${label}','${pid}')">Remover</button></td>
      </tr>`;
    }).join('');
    host.innerHTML = `
      <div class="stats">
        <div class="stat"><div class="k">Itens na lista</div><div class="v" id="cmpListCount_${label}">${ids.length}</div></div>
        <div class="stat"><div class="k">Sugestão total (30 dias)</div><div class="v">${ids.reduce((a,pid)=>a+Math.max(1,Math.round(cmpDaily(trends,pid)*30)),0).toLocaleString('pt-BR')}</div></div>
      </div>
      <div class="card pad">
        <div class="head"><h2>📝 ${esc(cmpListLabelName(label))}</h2><span class="grow"></span>
          <button class="btn ghost" data-onclick="cmpGoCatalogo('${label}')">📦 Catálogo</button>
          ${primaryBtn}</div>
        <div class="tbl-wrap"><table>
          <thead><tr><th>Código</th><th>Produto</th><th class="r">Quantidade</th><th class="c">Tendência</th><th class="r">Média móvel</th><th>ABC</th><th></th></tr></thead>
          <tbody>${listRows || '<tr><td colspan="7" class="muted" style="text-align:center;padding:18px">Nenhum produto na lista. Adicione itens pelo Catálogo.</td></tr>'}</tbody>
        </table></div>
      </div>`;
  }

  // =================== CATÁLOGO (separado da Lista) ===================
  async function cmpRenderCatalogo(){
    const host = $('#cmpCatalogoHost');
    if(!host) return;
    host.innerHTML = '<div class="card pad"><p class="muted">Carregando catálogo e vendas…</p></div>';
    const { trends } = await cmpEnsureSales();
    const label = CMP.catList || 'geral';
    const map = cmpListGet(label);
    const catRows = (PRODUCTS||[]).slice(0, 400).map(p => {
      const dia = cmpDaily(trends, p.id);
      const sug = Math.max(1, Math.round(dia*30));
      return `<tr data-cmpname="${esc(normTxt(p.nome+' '+(p.sku||'')))}">
        <td><b>${esc(p.nome)}</b> <span class="muted" style="font-size:11px">${esc(cmpProdCode(p))}</span></td>
        <td class="r">${p.track_stock?(Number(p.estoque)||0).toLocaleString('pt-BR'):'—'}</td>
        <td class="r muted">${BRL(p.custo)}</td>
        <td class="r">${fmtNum(dia)}<span class="muted" style="font-size:11px">/dia</span></td>
        <td class="r"><button class="btn ghost sm" data-onclick="cmpCatAdd('${p.id}', ${sug})">${map[p.id]!=null?'✓ na lista':'+ adicionar'}</button></td>
      </tr>`;
    }).join('');
    const listOpts = ['geral','iconha','reta'].map(v =>
      `<option value="${v}" ${v===label?'selected':''}>${esc(cmpListLabelName(v))}</option>`).join('');
    host.innerHTML = `
      <div class="card pad">
        <div class="head"><h2>📦 Catálogo do onpdv</h2><span class="grow"></span>
          <label class="lbl" style="margin:0 8px 0 0;align-self:center">Adicionar em</label>
          <select class="in" style="max-width:180px" data-onchange="cmpCatListChange(this.value)">${listOpts}</select>
          <input class="in" style="max-width:260px" placeholder="Buscar produto…" data-oninput="cmpCatFilter('cat', this.value)"></div>
        <div class="tbl-wrap"><table>
          <thead><tr><th>Produto</th><th class="r">Estoque</th><th class="r">Custo</th><th class="r">Média móvel</th><th></th></tr></thead>
          <tbody id="cmpCatBody_cat">${catRows}</tbody>
        </table></div>
        <p class="muted" style="font-size:12px;padding:10px 4px 0">Mostrando os primeiros produtos do catálogo. Use a busca para encontrar itens específicos. Os itens são adicionados na lista selecionada acima. Média móvel e tendência vêm das vendas do onpdv.</p>
      </div>`;
  }
  window.cmpGoCatalogo = label => { CMP.catList = label || 'geral'; openBoPage('cmpCatalogo'); };
  window.cmpCatListChange = v => { CMP.catList = v || 'geral'; cmpRenderCatalogo(); };
  window.cmpCatAdd = (pid, sug) => { const label = CMP.catList || 'geral'; const m = cmpListGet(label); m[pid] = num(m[pid]) || sug || 1; cmpListSet(label, m); cmpRenderCatalogo(); };
  window.cmpCatFilter = (label, q) => {
    const nq = normTxt(q||''); const body = $('#cmpCatBody_' + label); if(!body) return;
    body.querySelectorAll('tr').forEach(tr => { tr.style.display = (!nq || (tr.dataset.cmpname||'').includes(nq)) ? '' : 'none'; });
  };
  window.cmpListAdd = (label, pid, sug) => { const m = cmpListGet(label); m[pid] = num(m[pid]) || sug || 1; cmpListSet(label, m); cmpRenderLista(label); };
  window.cmpListRemove = (label, pid) => { const m = cmpListGet(label); delete m[pid]; cmpListSet(label, m); cmpRenderLista(label); };
  window.cmpListQty = (label, pid, val) => { const m = cmpListGet(label); const q = num(val); if(q>0) m[pid] = q; else delete m[pid]; cmpListSet(label, m); const c = $('#cmpListCount_'+label); if(c) c.textContent = Object.keys(m).length; };
  window.cmpListToOrder = label => { const sel = $('#cmpPoList'); if(sel) sel.value = label; openBoPage('cmpPedido'); };

  // Iconha/Reta → aba Transferências: carrega os itens da lista no carrinho de
  // transferência (Modelo → filial) e usa a mesma lógica já existente para montar/gerar.
  window.cmpListToTransfer = label => {
    const map = cmpListGet(label);
    const items = Object.keys(map).map(pid => {
      const p = cmpProd(pid); if(!p) return null;
      return { product_id:String(pid), nome:p.nome||String(pid), qtd:Math.max(1, num(map[pid])||1), custo:Number(p.custo)||0 };
    }).filter(Boolean);
    if(!items.length){ toast('A lista está vazia — adicione itens pelo Catálogo.', true); return; }
    // mescla no carrinho: soma a quantidade de itens já presentes, acrescenta os novos
    items.forEach(it => { const ex = TR_CART.find(x => String(x.product_id) === it.product_id); if(ex) ex.qtd += it.qtd; else TR_CART.push(it); });
    if(!TR_SOURCE_LISTS.includes(label)) TR_SOURCE_LISTS.push(label);   // origem p/ esvaziar ao gerar
    openBoPage('transfer');                            // dispara loadTransfers()/renderTrCart()
    const store = (STORES||[]).find(s => !s.is_matriz && normTxt(s.nome||'').includes(label));
    const dest = $('#trDest'); if(dest && store) dest.value = store.id;   // pré-seleciona a filial pelo nome
    toast('Itens da ' + cmpListLabelName(label) + ' adicionados à transferência');
  };
  // permite ao fluxo de transferências (código global) esvaziar uma lista de Compras
  window.cmpClearList = label => { cmpListSet(label, {}); if(typeof currentPage === 'string' && currentPage.startsWith('cmpLista')) cmpRenderLista(label); };

  // =================== MONTAR PEDIDO ===================
  function cmpRenderPedido(){
    cmpFillSuppliers($('#cmpPoSup'));
    cmpFillStores($('#cmpPoStore'), false);
    const buyer = $('#cmpPoBuyer'); if(buyer && !buyer.value) buyer.value = (ME && (ME.nome || ME.name)) || 'Compras';
    if(PURCHASE_FLOW && PURCHASE_FLOW.config){ const pr=$('#cmpPoPriority'); if(pr) pr.value = PURCHASE_FLOW.config.default_priority || 'normal'; }
    else { try{ loadPurchaseWorkflowConfig(); }catch(e){} }
    cmpBuildOrderFromList();
  }
  function cmpBuildOrderFromList(){
    const label = ($('#cmpPoList')||{}).value || 'geral';
    const map = cmpListGet(label);
    CMP.order = {};
    Object.keys(map).forEach(pid => { const p = cmpProd(pid); if(!p) return; CMP.order[pid] = { qty: num(map[pid])||0, custo: Number(p.custo)||0, sel: true }; });
    cmpRenderOrderSelection();
  }
  window.cmpPoSourceChange = cmpBuildOrderFromList;
  function cmpRenderOrderSelection(){
    const box = $('#cmpPoSelection'), empty = $('#cmpPoEmpty');
    const ids = Object.keys(CMP.order||{});
    if(!ids.length){ if(box) box.innerHTML=''; if(empty) empty.style.display='block'; cmpUpdateOrderTotals(); return; }
    if(empty) empty.style.display='none';
    box.innerHTML = ids.map(pid => {
      const p = cmpProd(pid), it = CMP.order[pid];
      return `<tr>
        <td class="c"><input type="checkbox" ${it.sel?'checked':''} data-onchange="cmpOrderSel('${pid}', this.checked)"></td>
        <td><b>${esc(p?p.nome:pid)}</b> <span class="muted" style="font-size:11px">${esc(cmpProdCode(p))}</span></td>
        <td class="r"><input class="in" style="width:72px;text-align:right;padding:5px 7px" inputmode="decimal" value="${it.qty}" data-oninput="cmpOrderQty('${pid}', this.value)"></td>
        <td class="r"><input class="in" style="width:92px;text-align:right;padding:5px 7px" inputmode="decimal" value="${(Number(it.custo)||0).toFixed(2).replace('.',',')}" data-oninput="cmpOrderCost('${pid}', this.value)"></td>
        <td class="r"><b id="cmpOrderSub_${pid}">${BRL(it.qty*it.custo)}</b></td>
      </tr>`;
    }).join('');
    cmpUpdateOrderTotals();
  }
  window.cmpOrderSel = (pid, v) => { if(CMP.order[pid]){ CMP.order[pid].sel = !!v; cmpUpdateOrderTotals(); } };
  window.cmpOrderQty = (pid, val) => { if(CMP.order[pid]){ CMP.order[pid].qty = num(val); const s=$('#cmpOrderSub_'+pid); if(s) s.textContent=BRL(CMP.order[pid].qty*CMP.order[pid].custo); cmpUpdateOrderTotals(); } };
  window.cmpOrderCost = (pid, val) => { if(CMP.order[pid]){ CMP.order[pid].custo = num(val); const s=$('#cmpOrderSub_'+pid); if(s) s.textContent=BRL(CMP.order[pid].qty*CMP.order[pid].custo); cmpUpdateOrderTotals(); } };
  window.cmpPedidoSelectAll = () => { Object.keys(CMP.order||{}).forEach(pid => CMP.order[pid].sel = true); cmpRenderOrderSelection(); };
  function cmpSelectedItems(){ return Object.keys(CMP.order||{}).filter(pid => CMP.order[pid].sel && CMP.order[pid].qty>0).map(pid => ({ product_id:String(pid), descricao:(cmpProd(pid)||{}).nome||'', qtd:CMP.order[pid].qty, custo:CMP.order[pid].custo })); }
  function cmpUpdateOrderTotals(){
    const items = cmpSelectedItems();
    const total = items.reduce((a,i)=>a+i.qtd*i.custo,0);
    const n = Math.max(1, parseInt(($('#cmpPoInstallments')||{}).value)||1);
    const s1=$('#cmpPoItemsStat'); if(s1) s1.textContent = items.length;
    const s2=$('#cmpPoTotalStat'); if(s2) s2.textContent = BRL(total);
    const s3=$('#cmpPoInstStat'); if(s3) s3.textContent = BRL(total/n);
    cmpRenderSchedule(total, n);
  }
  function cmpRenderSchedule(total, n){
    const box = $('#cmpPoSchedule'); if(!box) return;
    if(!(total>0)){ box.innerHTML=''; return; }
    const interval = Math.max(1, parseInt(($('#cmpPoInterval')||{}).value)||30);
    const base = ($('#cmpPoDelivery')||{}).value ? new Date(($('#cmpPoDelivery').value)+'T00:00:00') : new Date();
    const val = total/n; let html = '<div class="sum" style="margin-top:14px"><div class="l"><span>Boletos</span><b>'+n+'× de '+BRL(val)+'</b></div>';
    for(let k=0;k<n;k++){ const d=new Date(base.getTime()); d.setDate(d.getDate()+interval*k); html += '<div class="l"><span>Boleto '+(k+1)+' · '+d.toLocaleDateString('pt-BR')+'</span><b>'+BRL(val)+'</b></div>'; }
    box.innerHTML = html + '</div>';
  }
  ['cmpPoInstallments','cmpPoInterval','cmpPoDelivery'].forEach(id => { document.addEventListener('input', e => { if(e.target && e.target.id===id) cmpUpdateOrderTotals(); }); });
  document.addEventListener('change', e => { if(e.target && e.target.id==='cmpPoList') cmpBuildOrderFromList(); });

  window.cmpPedidoCancel = async () => {
    const has = Object.keys(CMP.order||{}).length;
    if(has && !await uiConfirm('Cancelar o pedido em montagem? Os itens selecionados serão descartados (a lista de origem não é alterada).', { danger:true, okText:'Cancelar pedido', cancelText:'Voltar' })) return;
    CMP.order = {};
    ['cmpPoSup','cmpPoNotes','cmpPoDelivery'].forEach(id => { const el=$('#'+id); if(el) el.value=''; });
    const inst=$('#cmpPoInstallments'); if(inst) inst.value='1';
    const intv=$('#cmpPoInterval'); if(intv) intv.value='30';
    const pr=$('#cmpPoPriority'); if(pr) pr.value = (PURCHASE_FLOW && PURCHASE_FLOW.config && PURCHASE_FLOW.config.default_priority) || 'normal';
    cmpRenderOrderSelection();
    toast('Pedido cancelado');
  };
  window.cmpPedidoSend = async () => {
    const items = cmpSelectedItems();
    if(!items.length){ toast('Selecione ao menos um item com quantidade.', true); return; }
    const supplier = ($('#cmpPoSup')||{}).value;
    if(!supplier){ toast('Escolha o fornecedor.', true); return; }
    const store = ($('#cmpPoStore')||{}).value || CURRENT_STORE;
    const total = items.reduce((a,i)=>a+i.qtd*i.custo,0);
    const meta = {
      store_id: String(store||''), supplier_id: String(supplier), buyer_name: ($('#cmpPoBuyer')||{}).value || null,
      priority: ($('#cmpPoPriority')||{}).value || 'normal', delivery_on: ($('#cmpPoDelivery')||{}).value || null,
      installments: Math.max(1, parseInt(($('#cmpPoInstallments')||{}).value)||1), interval_days: Math.max(1, parseInt(($('#cmpPoInterval')||{}).value)||30),
      notes: ($('#cmpPoNotes')||{}).value || null
    };
    await loadPurchaseWorkflowConfig().catch(()=>{});
    const auto = PURCHASE_FLOW.enabled && Number(PURCHASE_FLOW.config.auto_approval_limit)>0 && total <= Number(PURCHASE_FLOW.config.auto_approval_limit);
    if(auto){
      const { data, error } = await sb.rpc('erp_po_create',{ p_supplier:supplier, p_store:store, p_items:items, p_venc:meta.delivery_on, p_obs:meta.notes });
      if(error){ toast('Erro: '+error.message, true); return; }
      const orderId = purchaseOrderId(data);
      if(orderId){ await purchaseWorkflowSaveMeta(orderId, { ...meta, approval_type:'automatic', approved_at:new Date().toISOString() }); await purchaseWorkflowRecordApproval(orderId,'automatic'); if(meta.installments>1){ await sb.rpc('erp_purchase_split_payable',{ p_po:orderId, p_installments:meta.installments, p_interval_days:meta.interval_days, p_first_due:meta.delivery_on||null }); } }
      toast('Pedido aprovado automaticamente (dentro do limite) ✅'+(meta.installments>1?' · '+meta.installments+' boletos gravados':' · '+BRL(total)));
    } else {
      const r = await purchaseFlowRpc('erp_purchase_draft_save',{ p_draft: { ...meta, items } });
      if(r.error){ if(r.missing) toast('Aplique a migration purchase_compras_module no Supabase.', true); return; }
      toast('Pedido enviado para aprovação ✅');
    }
    // limpa da lista os itens efetivamente enviados
    const label = ($('#cmpPoList')||{}).value || 'geral';
    const m = cmpListGet(label); items.forEach(i => delete m[i.product_id]); cmpListSet(label, m);
    CMP.order = {}; cmpRenderOrderSelection();
    openBoPage('cmpAprovacao');
  };

  // =================== APROVAÇÃO ===================
  async function cmpRenderAprovacao(){
    const body = $('#cmpAprovacaoBody'), empty = $('#cmpAprovacaoEmpty');
    body.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center;padding:14px">Carregando…</td></tr>'; if(empty) empty.style.display='none';
    await loadPurchaseWorkflowConfig().catch(()=>{});
    const dr = await purchaseFlowRpc('erp_purchase_draft_list',{ p_status:'pending' }, { silent:true });
    CMP.drafts = (dr && dr.data) || [];
    let rascunhos = [];
    try{ const r = await sb.rpc('erp_po_list',{ p_status:'rascunho' }); rascunhos = r.data || []; }catch(e){}
    const prio = p => ({baixa:'<span class="chip">baixa</span>', normal:'<span class="chip">normal</span>', alta:'<span class="chip amber">alta</span>', urgente:'<span class="chip warn">urgente</span>'}[p] || `<span class="chip">${esc(p||'normal')}</span>`);
    const draftRows = CMP.drafts.map(d => `<tr class="clickrow" data-onclick="cmpDraftDetail(${d.id})">
      <td><span class="chip">manual</span></td><td>${esc(cmpSupplierName(d.supplier_id))}</td><td>${esc(d.buyer_name||'—')}</td>
      <td class="r"><b>${BRL(d.total)}</b></td><td>${prio(d.priority)}</td>
      <td class="r" style="white-space:nowrap" data-onclick="event.stopPropagation()">
        <button class="btn green sm" data-onclick="cmpApproveDraft(${d.id})">Aprovar</button>
        <button class="btn ghost sm red" data-onclick="cmpRejectDraft(${d.id})">Rejeitar</button></td></tr>`).join('');
    const poRows = rascunhos.map(r => `<tr class="clickrow" data-onclick="poDetail('${r.id}')">
      <td><span class="chip amber">inteligente</span></td><td>${esc(r.fornecedor||'—')}</td><td><span class="muted">${esc(r.loja||'—')}</span></td>
      <td class="r"><b>${BRL(r.total_previsto)}</b></td><td><span class="muted">—</span></td>
      <td class="r" style="white-space:nowrap" data-onclick="event.stopPropagation()">
        <button class="btn green sm" data-onclick="cmpApprovePo('${r.id}')">Aprovar</button>
        <button class="btn ghost sm red" data-onclick="poCancel('${r.id}')">Cancelar</button></td></tr>`).join('');
    body.innerHTML = draftRows + poRows;
    if(empty) empty.style.display = (CMP.drafts.length || rascunhos.length) ? 'none' : 'block';
  }
  window.cmpDraftDetail = id => {
    const d = (CMP.drafts||[]).find(x => Number(x.id) === Number(id)); if(!d) return;
    const items = Array.isArray(d.items)?d.items:[];
    const rows = items.map(i => `<tr><td>${esc(i.descricao||i.product_id)}</td><td class="r">${num(i.qtd)}</td><td class="r">${BRL(num(i.custo))}</td><td class="r"><b>${BRL(num(i.qtd)*num(i.custo))}</b></td></tr>`).join('');
    modal(`<div class="m-head"><h3>Pedido · ${esc(cmpSupplierName(d.supplier_id))}</h3><button data-modal-close>✕</button></div>
      <div class="m-body">
        <p class="muted">Solicitante <b>${esc(d.buyer_name||'—')}</b> · prioridade <b>${esc(d.priority||'normal')}</b> · ${d.installments||1} boleto(s)${d.delivery_on?' · entrega '+fmtDate(d.delivery_on):''}</p>
        ${d.notes?`<p class="muted">Obs: ${esc(d.notes)}</p>`:''}
        <div class="tbl-wrap"><table><thead><tr><th>Produto</th><th class="r">Qtd</th><th class="r">Custo</th><th class="r">Subtotal</th></tr></thead><tbody>${rows||'<tr><td colspan="4" class="muted">Sem itens.</td></tr>'}</tbody></table></div>
        <div class="sum" style="margin-top:8px"><div class="l big"><span>Total</span><b>${BRL(d.total)}</b></div></div>
      </div>
      <div class="m-foot"><button class="btn ghost red" data-onclick="closeModal();cmpRejectDraft(${d.id})">Rejeitar</button><button class="btn green" data-onclick="closeModal();cmpApproveDraft(${d.id})">Aprovar</button></div>`);
  };
  window.cmpApproveDraft = async id => {
    const d = (CMP.drafts||[]).find(x => Number(x.id) === Number(id)); if(!d){ cmpRenderAprovacao(); return; }
    if(!d.supplier_id){ toast('Este pedido não tem fornecedor.', true); return; }
    if(!await uiConfirm('Aprovar este pedido? A conta a pagar prevista será criada agora.',{okText:'Aprovar',cancelText:'Voltar'})) return;
    const items = (Array.isArray(d.items)?d.items:[]).map(i => ({ product_id:String(i.product_id), descricao:i.descricao||'', qtd:num(i.qtd), custo:num(i.custo) }));
    const { data, error } = await sb.rpc('erp_po_create',{ p_supplier:d.supplier_id, p_store:d.store_id||CURRENT_STORE, p_items:items, p_venc:d.delivery_on||null, p_obs:d.notes||null });
    if(error){ toast('Erro: '+error.message, true); return; }
    const orderId = purchaseOrderId(data);
    if(orderId){
      await purchaseWorkflowSaveMeta(orderId, { store_id:d.store_id?String(d.store_id):null, supplier_id:String(d.supplier_id), buyer_name:d.buyer_name||null, priority:d.priority||'normal', delivery_on:d.delivery_on||null, installments:d.installments||1, approval_type:'manual', approved_at:new Date().toISOString() });
      await purchaseWorkflowRecordApproval(orderId,'manual');
      if((d.installments||1) > 1){ await sb.rpc('erp_purchase_split_payable',{ p_po:orderId, p_installments:d.installments, p_interval_days:d.interval_days||30, p_first_due:d.delivery_on||null }); }
    }
    await purchaseFlowRpc('erp_purchase_draft_set_status',{ p_id:Number(id), p_status:'approved', p_reason:null, p_order_id:orderId?String(orderId):null }, { silent:true });
    const nb = d.installments||1;
    toast('Pedido aprovado · '+(nb>1?nb+' boleto(s) de compra gravado(s) ✅':'conta a pagar de '+BRL(data && data.total)+' criada ✅'));
    cmpRenderAprovacao();
  };
  window.cmpRejectDraft = async id => {
    const reason = await uiPrompt('Justificativa para rejeitar o pedido:', '', { title:'Rejeitar pedido', okText:'Rejeitar' });
    if(reason===null) return; if(!reason.trim()){ toast('A justificativa é obrigatória.', true); return; }
    const r = await purchaseFlowRpc('erp_purchase_draft_set_status',{ p_id:Number(id), p_status:'rejected', p_reason:reason.trim() }, { silent:true });
    if(r.error) return; toast('Pedido rejeitado.'); cmpRenderAprovacao();
  };
  window.cmpApprovePo = async id => {
    if(!await uiConfirm('Aprovar este rascunho? A conta a pagar será criada agora.',{okText:'Aprovar',cancelText:'Voltar'})) return;
    const { data, error } = await sb.rpc('erp_po_approve',{ p_po:id });
    if(error){ toast('Erro: '+error.message, true); return; }
    await purchaseWorkflowSaveMeta(id, { approval_type:'manual', approved_at:new Date().toISOString(), buyer_name:(ME&&(ME.nome||ME.name))||null });
    await purchaseWorkflowRecordApproval(id,'manual');
    toast('Compra aprovada · conta a pagar de '+BRL(data && data.total)+' criada ✅'); cmpRenderAprovacao();
  };

  // =================== RECEBIMENTO ===================
  async function cmpRenderRecebimento(){
    const body = $('#cmpRecebimentoBody'), empty = $('#cmpRecebimentoEmpty');
    body.innerHTML='';
    let rows=[];
    try{
      const [a,b] = await Promise.all([ sb.rpc('erp_po_list',{p_status:'pendente'}), sb.rpc('erp_po_list',{p_status:'parcial'}) ]);
      rows = [...(a.data||[]), ...(b.data||[])];
    }catch(e){}
    const chip = s => ({pendente:'<span class="chip amber">pendente</span>', parcial:'<span class="chip">parcial</span>'}[s]||esc(s));
    body.innerHTML = rows.map(r => `<tr class="clickrow" data-onclick="poDetail('${r.id}')">
      <td>${new Date(r.created_at).toLocaleDateString('pt-BR')}</td><td>${esc(r.fornecedor||'—')}</td><td>${esc(r.loja||'—')}</td>
      <td class="r">${BRL(r.total_previsto)}</td><td class="r">${BRL(r.total_recebido)}</td><td>${chip(r.status)}</td>
      <td class="r" data-onclick="event.stopPropagation()"><button class="btn green sm" data-onclick="poReceive('${r.id}')">Receber</button></td></tr>`).join('');
    if(empty) empty.style.display = rows.length ? 'none' : 'block';
  }

  // =================== PEDIDOS CONCLUÍDOS ===================
  async function cmpRenderConcluido(){
    const body = $('#cmpConcluidoBody'), empty = $('#cmpConcluidoEmpty'); body.innerHTML='';
    let rows=[]; try{ const r = await sb.rpc('erp_po_list',{p_status:'recebido'}); rows = r.data||[]; }catch(e){}
    body.innerHTML = rows.map(r => `<tr class="clickrow" data-onclick="poDetail('${r.id}')">
      <td>${new Date(r.created_at).toLocaleDateString('pt-BR')}</td><td>${esc(r.fornecedor||'—')}</td><td>${esc(r.loja||'—')}</td>
      <td class="r"><b>${BRL(r.total_recebido)}</b></td><td>${r.received_at?fmtDT(r.received_at):'—'}</td>
      <td class="r" data-onclick="event.stopPropagation()"><button class="btn ghost sm" data-onclick="poDetail('${r.id}')">Detalhes</button></td></tr>`).join('');
    if(empty) empty.style.display = rows.length ? 'none' : 'block';
  }

  // =================== FINANCEIRO (boletos / contas a pagar) ===================
  async function cmpRenderFinanceiro(){
    cmpFillStores($('#cmpFinStore'), true);
    const loja = ($('#cmpFinStore')||{}).value || null;
    const body = $('#cmpFinBody'), empty = $('#cmpFinEmpty'); body.innerHTML='';
    let rows=[]; try{ const r = await sb.rpc('erp_payables_list',{ p_ini:null, p_fim:null, p_status:'abertas', p_store:loja }); rows = (r.data||[]).filter(x => x.fornecedor); }catch(e){}
    const tot = rows.reduce((a,r)=>a+ +r.valor,0), venc = rows.filter(r=>r.atrasada), totV = venc.reduce((a,r)=>a+ +r.valor,0);
    const prox = rows.filter(r=>!r.atrasada).sort((a,b)=> new Date(a.vencimento)-new Date(b.vencimento))[0];
    $('#cmpFinTotal').textContent = BRL(tot); $('#cmpFinCount').textContent = rows.length;
    $('#cmpFinVenc').textContent = BRL(totV); $('#cmpFinNext').textContent = prox?fmtDate(prox.vencimento):'—';
    body.innerHTML = rows.map(r => `<tr class="clickrow ${r.atrasada?'low':''}" data-onclick="payableDetail('${r.id}')">
      <td>${fmtDate(r.vencimento)}</td><td><b>${esc(r.fornecedor||'—')}</b></td><td>${esc(r.loja_nome||'—')}</td>
      <td>${r.categoria?`<span class="chip">${esc(r.categoria)}</span>`:'<span class="muted">—</span>'}</td>
      <td class="r"><b>${BRL(r.valor)}</b></td><td>${r.atrasada?'<span class="chip warn">vencida</span>':'<span class="chip amber">aberta</span>'}</td></tr>`).join('');
    if(empty) empty.style.display = rows.length ? 'none' : 'block';
  }

  // =================== FORNECEDORES (mesmos do onpdv) ===================
  async function cmpRenderFornecedores(){
    const body = $('#cmpFornecBody'), empty = $('#cmpFornecEmpty'); body.innerHTML='';
    let rows=[]; try{ const r = await sb.from('suppliers').select('*').eq('ativo',true).order('nome'); rows = r.data||[]; }catch(e){}
    body.innerHTML = rows.map(s => `<tr>
      <td><b>${esc(s.nome)}</b></td><td>${esc(s.cnpj||'—')}</td><td>${esc(s.telefone||'—')}</td><td>${esc(s.email||'—')}</td>
      <td class="r">${s.lead_time_days||7}</td>
      <td class="r"><button class="btn ghost sm" data-onclick='cmpSupplierForm(${JSON.stringify(s).replace(/'/g,"&#39;")})'>Editar</button></td></tr>`).join('');
    if(empty) empty.style.display = rows.length ? 'none' : 'block';
  }
  window.cmpSupplierForm = (s) => {
    s = s || {};
    modal(`<div class="m-head"><h3>${s.id?'Editar':'Novo'} fornecedor</h3><button data-modal-close>✕</button></div>
      <div class="m-body"><div class="grid2">
        <div class="field"><label class="lbl">Nome</label><input id="cmpSuNome" class="in" value="${esc(s.nome||'')}"></div>
        <div class="field"><label class="lbl">CNPJ</label><input id="cmpSuCnpj" class="in" value="${esc(s.cnpj||'')}"></div>
        <div class="field"><label class="lbl">Telefone</label><input id="cmpSuFone" class="in" value="${esc(s.telefone||'')}"></div>
        <div class="field"><label class="lbl">E-mail</label><input id="cmpSuEmail" class="in" value="${esc(s.email||'')}"></div>
        <div class="field"><label class="lbl">Prazo de entrega (dias)</label><input id="cmpSuLead" class="in" inputmode="numeric" value="${s.lead_time_days||7}"></div>
      </div></div>
      <div class="m-foot"><button class="btn ghost" data-modal-close>Cancelar</button><button class="btn green" data-onclick="cmpSupplierSave('${s.id||''}')">Salvar</button></div>`,'wide');
  };
  window.cmpSupplierSave = async id => {
    const nome = ($('#cmpSuNome')||{}).value.trim(); if(!nome){ toast('Informe o nome.', true); return; }
    const { error } = await sb.rpc('erp_supplier_upsert',{ p:{ id:id||null, nome, cnpj:($('#cmpSuCnpj')||{}).value, telefone:($('#cmpSuFone')||{}).value, email:($('#cmpSuEmail')||{}).value, lead_time_days:parseInt(($('#cmpSuLead')||{}).value)||7 } });
    if(error){ toast('Erro: '+error.message, true); return; }
    await loadSuppliers(); closeModal(); toast('Fornecedor salvo ✅'); cmpRenderFornecedores();
  };

  // =================== COTAÇÕES ===================
  function cmpRenderCotacoesForm(){
    const ps = $('#cmpQuoteProduct'); if(ps) ps.innerHTML = '<option value="">Selecione</option>' + (PRODUCTS||[]).map(p=>`<option value="${p.id}">${esc(p.nome)}</option>`).join('');
    cmpFillSuppliers($('#cmpQuoteSupplier'));
    cmpRenderCotacoes();
  }
  window.cmpQuoteSave = async () => {
    const pid = ($('#cmpQuoteProduct')||{}).value, sid = ($('#cmpQuoteSupplier')||{}).value, price = num(($('#cmpQuotePrice')||{}).value);
    if(!pid || !sid || !(price>0)){ toast('Produto, fornecedor e preço são obrigatórios.', true); return; }
    const item = { quote_ref:'catalog', product_id:String(pid), supplier_id:String(sid), unit_price:price, delivery_days:Math.max(0,parseInt(($('#cmpQuoteDays')||{}).value)||0), notes:($('#cmpQuoteNotes')||{}).value||null };
    const r = await purchaseFlowRpc('erp_purchase_quote_responses_save',{ p_items:[item] });
    if(r.error) return; toast('Cotação salva ✅'); const pv=$('#cmpQuotePrice'); if(pv) pv.value=''; const nv=$('#cmpQuoteNotes'); if(nv) nv.value=''; cmpRenderCotacoes();
  };
  async function cmpRenderCotacoes(){
    const body = $('#cmpCotacoesBody'), empty = $('#cmpCotacoesEmpty'); if(!body) return; body.innerHTML='';
    const r = await purchaseFlowRpc('erp_purchase_quote_responses_list',{ p_products:null, p_quote_ref:'catalog' }, { silent:true });
    const rows = (r && r.data) || [];
    body.innerHTML = rows.map(q => { const p = cmpProd(q.product_id);
      return `<tr><td>${esc(p?p.nome:q.product_id)}</td><td>${esc(cmpSupplierName(q.supplier_id))}</td>
        <td class="r"><b>${BRL(q.unit_price)}</b></td><td class="r">${q.delivery_days||0} d</td>
        <td>${q.is_best?'<span class="chip ok">melhor preço</span>':'<span class="muted">—</span>'}</td></tr>`; }).join('');
    if(empty) empty.style.display = rows.length ? 'none' : 'block';
  }

  // =================== HISTÓRICO DE PREÇO ===================
  function cmpRenderHistoricoInit(){
    const sel = $('#cmpHistProduct'); if(sel){ sel.innerHTML = '<option value="">Selecione um produto</option>' + (PRODUCTS||[]).map(p=>`<option value="${p.id}">${esc(p.nome)}</option>`).join(''); sel.onchange = () => cmpRenderHistorico(sel.value); }
    cmpRenderHistorico('');
  }
  async function cmpRenderHistorico(pid){
    const body = $('#cmpHistBody'), empty = $('#cmpHistEmpty');
    ['cmpHistCurrent','cmpHistVar','cmpHistMin','cmpHistMax'].forEach(id=>{ const e=$('#'+id); if(e) e.textContent='—'; });
    if(!pid){ body.innerHTML=''; if(empty){ empty.style.display='block'; empty.textContent='Selecione um produto.'; } return; }
    const r = await purchaseFlowRpc('erp_purchase_price_history_product',{ p_product:String(pid), p_limit:80 }, { silent:true });
    if(r && r.missing){ if(empty){ empty.style.display='block'; empty.textContent='Aplique a migration purchase_compras_module no Supabase.'; } return; }
    const rows = (r && r.data) || [];
    if(!rows.length){ body.innerHTML=''; if(empty){ empty.style.display='block'; empty.textContent='Sem histórico de preço para este produto.'; } return; }
    if(empty) empty.style.display='none';
    const prices = rows.map(x=>Number(x.unit_price)||0);
    $('#cmpHistCurrent').textContent = BRL(prices[0]);
    $('#cmpHistMin').textContent = BRL(Math.min(...prices));
    $('#cmpHistMax').textContent = BRL(Math.max(...prices));
    const variation = prices.length>1 && prices[1]>0 ? ((prices[0]-prices[1])/prices[1]*100) : null;
    $('#cmpHistVar').textContent = variation==null?'—':(variation>=0?'+':'')+variation.toFixed(1)+'%';
    const srcName = s => ({receipt:'recebimento', approval:'aprovação', quotation:'cotação', import:'importação'}[s]||s);
    body.innerHTML = rows.map((x,i) => { const prev = rows[i+1]?Number(rows[i+1].unit_price):null; const dv = prev&&prev>0?((Number(x.unit_price)-prev)/prev*100):null;
      return `<tr><td>${fmtDT(x.recorded_at)}</td><td>${esc(cmpSupplierName(x.supplier_id))}</td>
        <td class="r"><b>${BRL(x.unit_price)}</b></td>
        <td class="r ${dv==null?'muted':dv>0?'neg':''}">${dv==null?'—':(dv>=0?'+':'')+dv.toFixed(1)+'%'}</td>
        <td><span class="chip">${esc(srcName(x.source))}</span></td></tr>`; }).join('');
  }

  // =================== ALERTAS ===================
  async function cmpRenderAlertas(){
    const body = $('#cmpAlertasBody'), empty = $('#cmpAlertasEmpty'); if(!body) return;
    body.innerHTML='<tr><td colspan="3" class="muted" style="text-align:center;padding:14px">Analisando…</td></tr>'; if(empty) empty.style.display='none';
    await loadPurchaseWorkflowConfig().catch(()=>{});
    const [alertsR, draftsR, rasc, pay] = await Promise.all([
      purchaseFlowRpc('erp_purchase_price_alerts',{ p_limit:20 }, { silent:true }),
      purchaseFlowRpc('erp_purchase_draft_list',{ p_status:'pending' }, { silent:true }),
      sb.rpc('erp_po_list',{ p_status:'rascunho' }).catch(()=>({data:[]})),
      sb.rpc('erp_payables_list',{ p_ini:null, p_fim:null, p_status:'abertas', p_store:null }).catch(()=>({data:[]}))
    ]);
    const priceAlerts = (alertsR && alertsR.data) || [];
    const pendingDrafts = ((draftsR && draftsR.data) || []).length;
    const rascunhos = (rasc.data||[]).length;
    const overdue = (pay.data||[]).filter(x => x.fornecedor && x.atrasada);
    const rows = [];
    if(pendingDrafts) rows.push(`<tr class="clickrow" data-onclick="openBoPage('cmpAprovacao')"><td><span class="chip amber">aprovação</span></td><td>${pendingDrafts} pedido(s) aguardando aprovação</td><td class="r" data-onclick="event.stopPropagation()"><button class="btn ghost sm" data-onclick="openBoPage('cmpAprovacao')">Abrir</button></td></tr>`);
    if(rascunhos) rows.push(`<tr class="clickrow" data-onclick="openBoPage('cmpAprovacao')"><td><span class="chip amber">rascunho</span></td><td>${rascunhos} rascunho(s) do Pedido inteligente aguardando decisão</td><td class="r" data-onclick="event.stopPropagation()"><button class="btn ghost sm" data-onclick="openBoPage('cmpAprovacao')">Abrir</button></td></tr>`);
    if(overdue.length) rows.push(`<tr class="clickrow low" data-onclick="openBoPage('cmpFinanceiro')"><td><span class="chip warn">vencido</span></td><td>${overdue.length} boleto(s) de compra vencido(s) · total ${BRL(overdue.reduce((a,r)=>a+ +r.valor,0))}</td><td class="r" data-onclick="event.stopPropagation()"><button class="btn ghost sm" data-onclick="openBoPage('cmpFinanceiro')">Abrir</button></td></tr>`);
    priceAlerts.forEach(a => { const p = cmpProd(a.product_id); rows.push(`<tr><td><span class="chip warn">+${fmtNum(a.increase_percent)}%</span></td><td>Aumento de custo · <b>${esc(p?p.nome:a.product_id)}</b> — de ${BRL(a.previous_price)} para ${BRL(a.current_price)}</td><td class="r muted">${fmtDT(a.recorded_at)}</td></tr>`); });
    body.innerHTML = rows.join('');
    if(empty) empty.style.display = rows.length ? 'none' : 'block';
  }

  // =================== AUDITORIA ===================
  async function cmpRenderAuditoria(){
    const body = $('#cmpAuditoriaBody'), empty = $('#cmpAuditoriaEmpty'); body.innerHTML='';
    const r = await purchaseFlowRpc('erp_purchase_workflow_audit_list',{ p_limit:200 }, { silent:true });
    if(r && r.missing){ if(empty){ empty.style.display='block'; empty.textContent='Aplique a migration do fluxo de compras no Supabase.'; } return; }
    const rows = (r && r.data) || [];
    const actionName = a => ({ workflow_config_updated:'Regras atualizadas', order_metadata_saved:'Pedido salvo', receipt_recorded:'Recebimento', order_approved:'Aprovação', quote_responses_saved:'Cotação salva', purchase_draft_saved:'Pedido enviado', purchase_draft_approved:'Pedido aprovado', purchase_draft_rejected:'Pedido rejeitado', purchase_draft_deleted:'Rascunho excluído' }[a] || a);
    body.innerHTML = rows.map(x => `<tr><td>${fmtDT(x.created_at)}</td><td>${esc(actionName(x.action))}</td><td>${esc(x.entity_type||'—')}</td><td>${esc(x.entity_id||'—')}</td><td class="muted" style="font-size:12px">${esc(JSON.stringify(x.details||{}))}</td></tr>`).join('');
    if(empty) empty.style.display = rows.length ? 'none' : 'block';
  }

  // =================== PAINEL ===================
  async function cmpRenderPainel(){
    const st = $('#cmpDashStats'); if(st) st.innerHTML = '<div class="stat"><div class="k">Carregando…</div><div class="v">—</div></div>';
    const mes = mesAtualISO();
    const [poR, draftsR, salesData] = await Promise.all([
      sb.rpc('erp_po_list',{ p_status:null }).catch(()=>({data:[]})),
      purchaseFlowRpc('erp_purchase_draft_list',{ p_status:'pending' }, { silent:true }),
      cmpEnsureSales(true)
    ]);
    const pos = poR.data || [];
    const inMonth = d => { const s = String(d||''); return s >= mes.ini && s <= mes.fim+'T23:59:59'; };
    const comprasMes = pos.filter(p => p.status!=='cancelado' && p.status!=='rascunho' && inMonth(p.created_at)).reduce((a,p)=>a+ +p.total_previsto,0);
    const recebidoMes = pos.filter(p => inMonth(p.received_at||'')).reduce((a,p)=>a+ +p.total_recebido,0);
    const pendentes = pos.filter(p => p.status==='rascunho').length + (((draftsR&&draftsR.data)||[]).length);
    const divergencias = pos.filter(p => p.status==='parcial').length;
    if(st) st.innerHTML = `
      <div class="stat acc"><div class="k">Compras no mês</div><div class="v">${BRL(comprasMes)}</div></div>
      <div class="stat"><div class="k">Pedidos pendentes</div><div class="v">${pendentes}</div></div>
      <div class="stat"><div class="k">Recebido no mês</div><div class="v">${BRL(recebidoMes)}</div></div>
      <div class="stat warn"><div class="k">Entregas parciais</div><div class="v">${divergencias}</div></div>`;
    // compras por fornecedor
    const bySup = {}; pos.filter(p => p.status!=='cancelado' && p.status!=='rascunho').forEach(p => { const k = p.fornecedor||'—'; bySup[k] = (bySup[k]||0) + (+p.total_previsto||0); });
    const supArr = Object.entries(bySup).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const supBox = $('#cmpDashSuppliers');
    if(supBox) supBox.innerHTML = supArr.length ? supArr.map(([nome,val]) => `<tr><td>${esc(nome)}</td><td class="r"><b>${BRL(val)}</b></td></tr>`).join('') : '<tr><td colspan="2" class="muted" style="text-align:center;padding:14px">Sem compras registradas.</td></tr>';
    // ABC (vendas do onpdv)
    const abcBox = $('#cmpDashAbc'), scope = $('#cmpDashAbcScope');
    let abc = []; try{ const r = await sb.rpc('erp_abc',{ p_ini:mes.ini, p_fim:mes.fim, p_store:CURRENT_STORE }); abc = r.data||[]; }catch(e){}
    if(scope) scope.textContent = 'mês atual';
    if(abcBox) abcBox.innerHTML = abc.slice(0,10).map(r => `<tr><td>${esc(r.nome)}</td><td>${cmpAbcChip(r.classe)}</td><td class="r">${BRL(r.faturamento)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted" style="text-align:center;padding:14px">Sem vendas no período.</td></tr>';
  }

  // =================== ROTEAMENTO ===================
  window.CMP_PAGES = {
    cmpPainel: cmpRenderPainel,
    cmpLista: () => cmpRenderLista('geral'),
    cmpListaIconha: () => cmpRenderLista('iconha'),
    cmpListaReta: () => cmpRenderLista('reta'),
    cmpCatalogo: cmpRenderCatalogo,
    cmpPedido: cmpRenderPedido,
    cmpAprovacao: cmpRenderAprovacao,
    cmpRecebimento: cmpRenderRecebimento,
    cmpConcluido: cmpRenderConcluido,
    cmpFinanceiro: cmpRenderFinanceiro,
    cmpFornecedores: cmpRenderFornecedores,
    cmpCotacoes: cmpRenderCotacoesForm,
    cmpHistorico: cmpRenderHistoricoInit,
    cmpAlertas: cmpRenderAlertas,
    cmpAuditoria: cmpRenderAuditoria
  };
  // expõe render p/ os botões "Atualizar" declarativos
  Object.assign(window, { cmpRenderAprovacao, cmpRenderRecebimento, cmpRenderConcluido, cmpRenderFinanceiro, cmpRenderFornecedores, cmpRenderCotacoes, cmpRenderAlertas, cmpRenderAuditoria });
})();
