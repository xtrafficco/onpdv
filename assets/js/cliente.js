// ONPDV · cliente.js — extraído de cliente.html (CSP sem unsafe-inline em script).
const SUPABASE_URL='https://qkhpvqepgozsaamxmugk.supabase.co';
const SUPABASE_KEY='sb_publishable_rh5Whcvb9PFt9MI1iL6dlg_qS9BGRNw';
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const $=s=>document.querySelector(s);
const esc=s=>(s==null?'':String(s)).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const BRL=n=>(Number(n)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=v=>v?new Date(String(v).slice(0,10)+'T12:00:00-03:00').toLocaleDateString('pt-BR'):'—';
const TODAY=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const isoDay=v=>v?String(v).slice(0,10):null;
const daysUntil=v=>{const d=isoDay(v);if(!d)return null;return Math.round((new Date(d+'T12:00:00-03:00')-new Date(TODAY+'T12:00:00-03:00'))/864e5);};
const CB_KIND={earn:'Ganho',redeem:'Resgate',adjust:'Ajuste',expire:'Expirado'};
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),2600);}

// ===== Instalação do Portal do Cliente (PWA) =====
let PWA_INSTALL_PROMPT=null;
const PWA_UA=navigator.userAgent||'';
const PWA_IOS=/iPad|iPhone|iPod/.test(PWA_UA)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const PWA_ANDROID=/Android/i.test(PWA_UA);
const PWA_SAFARI=/Safari/i.test(PWA_UA)&&!/CriOS|FxiOS|EdgiOS|OPiOS/i.test(PWA_UA);
function pwaIsInstalled(){
  return window.matchMedia('(display-mode: standalone)').matches
    ||window.matchMedia('(display-mode: fullscreen)').matches
    ||navigator.standalone===true;
}
function refreshPwaInstallUi(){
  const show=!pwaIsInstalled();
  ['pwaInstallLogin','pwaInstallApp'].forEach(id=>{const el=$('#'+id);if(el)el.classList.toggle('hide',!show);});
}
function closePwaInstall(){closeModal('pwaInstallModal');}
function pwaInstallHelp(){
  let title='Instalar o Portal do Cliente',intro='',steps=[],note='';
  if(PWA_IOS){
    title='Instalar no iPhone ou iPad';
    intro='O iOS instala aplicativos pela opção da Tela de Início do Safari.';
    if(!PWA_SAFARI)note='Esta página foi aberta em outro navegador. Primeiro escolha “Abrir no Safari” e continue por lá.';
    steps=['No Safari, toque no botão Compartilhar (quadrado com seta para cima).','Role as opções e toque em “Adicionar à Tela de Início”.','Confirme em “Adicionar”. O ícone ONPDV aparecerá junto aos seus aplicativos.'];
  }else if(PWA_ANDROID){
    title='Instalar no Android';
    intro='Você pode deixar o Portal do Cliente na tela inicial e abrir como aplicativo.';
    steps=['Abra esta página no Google Chrome.','Toque no menu ⋮ no canto superior direito.','Escolha “Instalar app” ou “Adicionar à tela inicial” e confirme.'];
    note='Se o QR Code abriu dentro de WhatsApp, Instagram ou outro aplicativo, use o menu desse aplicativo e escolha “Abrir no Chrome”.';
  }else{
    steps=['Abra o menu do navegador.','Escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.','Confirme a instalação.'];
  }
  $('#pwaInstallSheet').innerHTML=`<h3 id="pwaInstallTitle">📲 ${esc(title)}</h3><p class="install-intro">${esc(intro)}</p>`
    +(note?`<div class="install-note">${esc(note)}</div>`:'')
    +`<div class="install-steps">${steps.map((s,i)=>`<div class="install-step"><b>${i+1}</b><span>${esc(s)}</span></div>`).join('')}</div>`
    +'<button class="btn block" type="button" data-act="closePwaInstall">Entendi</button>';
  $('#pwaInstallModal').classList.add('show');
}
async function requestPwaInstall(){
  if(pwaIsInstalled()){toast('O aplicativo já está instalado.');refreshPwaInstallUi();return;}
  if(PWA_INSTALL_PROMPT){
    const prompt=PWA_INSTALL_PROMPT;
    PWA_INSTALL_PROMPT=null;
    await prompt.prompt();
    const choice=await prompt.userChoice.catch(()=>null);
    if(choice&&choice.outcome==='accepted')toast('Instalação iniciada ✅');
    else pwaInstallHelp();
    refreshPwaInstallUi();
    return;
  }
  pwaInstallHelp();
}
window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();
  PWA_INSTALL_PROMPT=event;
  refreshPwaInstallUi();
});
window.addEventListener('appinstalled',()=>{
  PWA_INSTALL_PROMPT=null;
  refreshPwaInstallUi();
  closePwaInstall();
  toast('ONPDV instalado com sucesso ✅');
});
window.matchMedia('(display-mode: standalone)').addEventListener?.('change',refreshPwaInstallUi);
['pwaInstallLogin','pwaInstallApp'].forEach(id=>$('#'+id).addEventListener('click',requestPwaInstall));
refreshPwaInstallUi();

function showSec(name){
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.sec===name));
  document.querySelectorAll('.sec').forEach(s=>s.classList.toggle('active',s.id==='sec-'+name));
  window.scrollTo({top:0,behavior:'smooth'});
}
document.getElementById('nav').addEventListener('click',e=>{const b=e.target.closest('.tab');if(b)showSec(b.dataset.sec);});
let DATA=null;
async function load(){
  const {data,error}=await sb.rpc('portal_dashboard');
  if(error){await sb.auth.signOut();$('#app').classList.add('hide');$('#login').classList.remove('hide');$('#loginMsg').textContent='Este acesso ainda não está vinculado a um cliente.';return;}
  DATA=data||{};const p=DATA.profile||{};
  $('#login').classList.add('hide');$('#app').classList.remove('hide');$('#firstName').textContent=String(p.name||'cliente').split(/\s+/)[0];
  $('#phone').value=p.phone||'';$('#profileEmail').value=p.email||'';$('#address').value=p.address||'';$('#bairro').value=p.bairro||'';
  const rec=DATA.receivables||[],subs=DATA.subscriptions||[],orders=DATA.orders||[];
  const cb=DATA.cashback||{},pets=DATA.pets||[];
  const overdue=rec.filter(x=>isoDay(x.due_on)&&isoDay(x.due_on)<TODAY);
  const upcoming=rec.filter(x=>!(isoDay(x.due_on)&&isoDay(x.due_on)<TODAY));
  const sum=a=>a.reduce((s,x)=>s+(+x.amount||0),0);

  // Início: saldo, contas, assinaturas e extrato
  const entries=cb.entries||[];
  $('#cashback').innerHTML=`<div class="balance"><small>Saldo de cashback</small><b>${BRL(cb.balance||0)}</b>`
    +((+cb.expiring_30d>0)?`<span class="exp">⏳ ${BRL(cb.expiring_30d)} expiram em 30 dias</span>`:`<span class="exp">Use como desconto na loja</span>`)
    +'</div>';
  $('#cashbackEntries').innerHTML=entries.length?entries.map(e=>{const pos=(+e.amount||0)>=0;return `<div class="row"><div><b>${esc(CB_KIND[e.kind]||e.kind)}</b><br><span class="muted">${date(e.created_at)}${e.expires_at?' · expira '+date(e.expires_at):''}</span></div>
      <b style="color:${pos?'var(--green)':'var(--red)'};white-space:nowrap">${pos?'+':'−'} ${BRL(Math.abs(+e.amount||0))}</b></div>`;}).join(''):'<p class="muted">Ainda sem movimentações de cashback.</p>';

  // Totais e aviso das contas
  $('#overdueTot').textContent=overdue.length?BRL(sum(overdue)):'';
  $('#upcomingTot').textContent=upcoming.length?BRL(sum(upcoming)):'';
  const badge=$('#contasBadge');
  if(overdue.length){badge.textContent=overdue.length;badge.classList.remove('hide');}else{badge.classList.add('hide');}

  // Carteirinha editável pelo cliente
  $('#pets').innerHTML=pets.length?pets.map(pet=>{
    const idade=pet.nascimento?Math.max(0,Math.floor(-daysUntil(pet.nascimento)/365)):null;
    const saude=(pet.saude||[]);
    const items=saude.map(h=>{
      const d=daysUntil(h.proxima_em);
      let chip='';
      if(d!=null){chip=d<0?`<span class="chip warn">atrasada</span>`:(d<=30?`<span class="chip warn">em ${d} dia${d===1?'':'s'}</span>`:`<span class="chip ok">em dia</span>`);}
      return `<div class="row"><div><b>${esc(healthLabel(h.tipo))}${h.descricao?' · '+esc(h.descricao):''}</b><br><span class="muted">${h.aplicada_em?'realizada '+date(h.aplicada_em):'data não informada'}${h.proxima_em?' · próxima '+date(h.proxima_em):''}</span></div><div style="text-align:right">${chip}<br><button class="btn ghost sm" style="margin-top:5px" type="button" data-act="openHealthForm" data-a1="${pet.id}" data-a2="${h.id}">Editar</button></div></div>`;
    }).join('');
    return `<div class="petcard">
      <div class="pethead"><div><b>🐾 ${esc(pet.nome||'Pet')}</b><div class="petmeta">${esc([pet.especie,pet.raca,pet.porte,pet.sexo].filter(Boolean).join(' · '))}${idade!=null?' · '+idade+' ano'+(idade===1?'':'s'):''}${pet.peso?' · '+esc(pet.peso)+' kg':''}</div></div>
        <button class="btn ghost sm" type="button" data-act="openPetForm" data-a1="${pet.id}">Editar pet</button>
      </div>${pet.obs?`<p class="muted" style="font-size:13px;margin:0 0 10px">${esc(pet.obs)}</p>`:''}
      ${items||'<p class="muted" style="margin:8px 0">Nenhum cuidado registrado ainda.</p>'}
      <div class="actions" style="margin-top:12px"><button class="btn sm" type="button" data-act="openHealthForm" data-a1="${pet.id}">+ Vacina ou cuidado</button></div></div>`;
  }).join(''):'<div class="empty">Nenhum pet cadastrado ainda.<br>Toque em <b>+ Pet</b> para começar. 🐶🐱</div>';

  // Contas vencidas / a vencer — marque as parcelas e pague todas num único PIX
  const recRow=x=>{const d=daysUntil(x.due_on),over=isoDay(x.due_on)<TODAY;
    return `<div class="row rcrow">
      <input type="checkbox" class="rck" id="rc_${x.id}" data-rid="${x.id}" data-amount="${x.amount}" aria-label="Selecionar parcela de ${BRL(x.amount)}">
      <label class="rcl" for="rc_${x.id}"><b>${BRL(x.amount)}</b> <span class="chip ${over?'warn':''}">${over?'venceu '+date(x.due_on):'vence '+date(x.due_on)}</span><br>
      <span class="muted">parcela ${esc(x.installment||'')}/${esc(x.installments||'')}${x.sale_number?' · venda #'+esc(x.sale_number):''}${over&&d!=null?' · '+(-d)+' dia'+(d===-1?'':'s')+' em atraso':''}</span></label></div>`;};
  $('#overdue').innerHTML=overdue.length?overdue.map(recRow).join(''):'<p class="muted">Nenhuma conta vencida. 🎉</p>';
  $('#upcoming').innerHTML=upcoming.length?upcoming.map(recRow).join(''):'<p class="muted">Nenhuma conta a vencer.</p>';
  updatePayBar();

  $('#subscriptions').innerHTML=subs.map(x=>`<div class="row"><div><b>${esc(x.plan_name||'Assinatura')}</b><br><span class="muted">próximo ciclo ${date(x.next_run_on)} · ${x.interval_days} dias</span></div>
    <div><span class="chip ${x.status==='active'?'ok':'warn'}">${esc(x.status)}</span><br>
    ${x.status==='cancelled'?'':`<button class="btn ghost" style="margin-top:5px" data-act="setSub" data-a1="${x.id}" data-a2="${x.status==='active'?'paused':'active'}">${x.status==='active'?'Pausar':'Retomar'}</button>`}</div></div>`).join('')||'<p class="muted">Nenhuma assinatura ativa.</p>';
  const ordChip=s=>{const k=String(s||'').toLowerCase();return k==='paga'||k==='pago'?'ok':(k==='cancelada'?'warn':'');};
  $('#orders').innerHTML=orders.map(x=>{const d=x.delivery||null;const dl={aguardando_pagamento:'aguardando pagamento',fila:'na fila de entrega',em_rota:'saiu para entrega',entregue:'entregue',cancelada:'cancelada'};return `<div class="row" style="align-items:flex-start"><div><b>Pedido #${esc(x.numero)}</b> <span class="chip ${ordChip(x.status)}">${esc(x.status)}</span>${d?` <span class="chip ${d.status==='entregue'?'ok':d.status==='cancelada'?'warn':''}">🚚 ${esc(dl[d.status]||d.status)}</span>`:''}<br><span class="muted">${date(x.created_at)} · ${esc(x.forma_pagamento||'')}</span>${d&&d.status==='em_rota'?`<br><b style="color:var(--green)">Previsão: ${d.eta_minutes?'aprox. '+d.eta_minutes+' min':date(d.eta_arrival)}</b>`:''}<br><span class="cashback-earned">🎁 Cashback ganho: ${BRL(x.cashback_earned||0)}</span><div id="oi_${x.id}" class="muted" style="font-size:13px;margin-top:6px"></div></div><div style="text-align:right;white-space:nowrap"><b>${BRL(x.total)}</b>${d&&['fila','em_rota'].includes(d.status)?`<br><button class="btn sm" style="margin-top:6px" type="button" data-act="trackDelivery" data-a1="${x.id}">📍 Acompanhar</button>`:''}<br><button class="btn ghost sm" style="margin-top:6px" type="button" data-act="orderItems" data-a1="${x.id}">Ver itens</button><br><button class="btn ghost sm" style="margin-top:6px" type="button" data-act="reorder" data-a1="${x.id}">🔄 Comprar de novo</button></div></div>`;}).join('')||'<p class="muted">Nenhuma compra encontrada.</p>';
}
window.orderItems=async id=>{
  const box=document.getElementById('oi_'+id); if(!box) return;
  if(box.dataset.open==='1'){ box.innerHTML=''; box.dataset.open='0'; return; }
  box.textContent='Carregando itens…';
  const {data,error}=await sb.rpc('portal_order_items',{p_sale:id});
  if(error){ box.textContent='Não foi possível carregar os itens.'; return; }
  const its=data||[];
  box.innerHTML = its.length ? its.map(i=>`• ${esc(i.descricao||'Item')} — ${(+i.qtd||0)}× ${BRL(i.preco_unit||0)}`).join('<br>') : 'Sem itens detalhados neste pedido.';
  box.dataset.open='1';
};
window.trackDelivery=async id=>{
  const sheet=$('#trackingSheet');$('#trackingModal').classList.add('show');sheet.innerHTML='<h3>📍 Acompanhar entrega</h3><p class="muted">Atualizando localização e previsão…</p>';
  const {data:d,error}=await sb.rpc('portal_delivery_tracking',{p_sale:id});
  if(error){sheet.innerHTML=`<h3>📍 Acompanhar entrega</h3><p style="color:var(--red)">${esc(error.message||'Não foi possível carregar.')}</p><button class="btn ghost block" data-act="closeModal" data-a1="trackingModal">Fechar</button>`;return;}
  const labels={fila:'Pedido na fila da loja',em_rota:'Pedido a caminho',entregue:'Pedido entregue',cancelada:'Entrega cancelada',aguardando_pagamento:'Aguardando pagamento'};
  const eta=d.eta_arrival?new Date(d.eta_arrival).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):null;
  const updated=d.courier_updated_at?new Date(d.courier_updated_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):null;
  const map=d.courier_lat!=null?`https://www.google.com/maps/search/?api=1&query=${d.courier_lat},${d.courier_lng}`:null;
  sheet.innerHTML=`<h3>🚚 Pedido #${esc(d.numero||'')}</h3><p><span class="chip ${d.status==='entregue'?'ok':''}">${esc(labels[d.status]||d.status)}</span></p>
    ${d.status==='em_rota'?`<div class="balance" style="margin:12px 0"><small>Previsão de chegada</small><b>${d.eta_minutes?'aprox. '+d.eta_minutes+' min':(eta||'calculando…')}</b><span class="exp">${d.eta_distance_km?Number(d.eta_distance_km).toLocaleString('pt-BR',{maximumFractionDigits:1})+' km restantes':''}</span></div>`:''}
    <p class="muted"><b>Endereço:</b> ${esc(d.address||'—')}<br>${d.courier?`Entregador: <b>${esc(d.courier)}</b>`:''}${updated?` · posição atualizada às ${updated}`:''}</p>
    <div class="sheet-actions">${map?`<a class="btn" target="_blank" href="${map}">Abrir no mapa</a>`:''}<button class="btn ghost" data-act="trackDelivery" data-a1="${id}">Atualizar</button></div>
    <button class="btn ghost block" style="margin-top:8px" data-act="closeModal" data-a1="trackingModal">Fechar</button>`;
};
window.reorder=async (id,btn)=>{
  if(btn){ btn.disabled=true; btn.textContent='Enviando…'; }
  const {error}=await sb.rpc('portal_reorder_request',{p_sale:id});
  if(error){ toast(error.message||'Não foi possível enviar o pedido.'); if(btn){ btn.disabled=false; btn.textContent='🔄 Comprar de novo'; } return; }
  if(btn){ btn.textContent='✅ Enviado à loja'; }
  toast('Pedido de recompra enviado à loja! Em breve entram em contato. 🐾');
};
function closeModal(id){$('#'+id).classList.remove('show');}
function healthLabel(tipo){return ({vacina:'Vacina',vermifugo:'Vermífugo',antipulgas:'Antipulgas',consulta:'Consulta',exame:'Exame',medicamento:'Medicamento',outro:'Outro'})[tipo]||tipo||'Registro';}
function findPet(id){return ((DATA&&DATA.pets)||[]).find(p=>p.id===id);}
window.openPetForm=id=>{
  const p=id?findPet(id):null;
  $('#petForm').reset();$('#petId').value=p&&p.id||'';$('#petFormTitle').textContent=p?'Editar pet':'Adicionar pet';
  $('#petName').value=p&&p.nome||'';$('#petSpecies').value=p&&p.especie||'';$('#petBirthday').value=isoDay(p&&p.nascimento)||'';
  $('#petBreed').value=p&&p.raca||'';$('#petSize').value=p&&p.porte||'';$('#petSex').value=p&&p.sexo||'';
  $('#petWeight').value=p&&p.peso||'';$('#petNotes').value=p&&p.obs||'';$('#petBirthday').max=TODAY;
  $('#petModal').classList.add('show');setTimeout(()=>$('#petName').focus(),120);
};
window.openHealthForm=(petId,healthId)=>{
  const p=findPet(petId);if(!p)return;
  const h=healthId?(p.saude||[]).find(x=>x.id===healthId):null;
  $('#healthForm').reset();$('#healthId').value=h&&h.id||'';$('#healthPetId').value=petId;
  $('#healthFormTitle').textContent=h?'Editar cuidado':'Adicionar cuidado';$('#healthPetName').textContent='Pet: '+(p.nome||'Pet');
  $('#healthType').value=h&&h.tipo||'vacina';$('#healthDescription').value=h&&h.descricao||'';
  $('#healthApplied').value=isoDay(h&&h.aplicada_em)||'';$('#healthNext').value=isoDay(h&&h.proxima_em)||'';
  $('#healthNotes').value=h&&h.obs||'';$('#healthApplied').max=TODAY;
  $('#healthModal').classList.add('show');setTimeout(()=>$('#healthDescription').focus(),120);
};
$('#petForm').onsubmit=async e=>{
  e.preventDefault();const b=e.submitter;b.disabled=true;
  const p={id:$('#petId').value||null,name:$('#petName').value.trim(),species:$('#petSpecies').value,birthday:$('#petBirthday').value||null,breed:$('#petBreed').value,size:$('#petSize').value,sex:$('#petSex').value,weight:$('#petWeight').value||null,notes:$('#petNotes').value.trim()};
  const {error}=await sb.rpc('portal_upsert_pet',{p});b.disabled=false;
  if(error){toast(error.message&&error.message.includes('Nome')?error.message:'Não foi possível salvar o pet.');return;}
  closeModal('petModal');toast('Pet salvo ✅');await load();
};
$('#healthForm').onsubmit=async e=>{
  e.preventDefault();const b=e.submitter;b.disabled=true;
  const p={id:$('#healthId').value||null,pet_id:$('#healthPetId').value,type:$('#healthType').value,description:$('#healthDescription').value.trim(),applied_on:$('#healthApplied').value||null,next_on:$('#healthNext').value||null,notes:$('#healthNotes').value.trim()};
  const {error}=await sb.rpc('portal_upsert_pet_health',{p});b.disabled=false;
  if(error){toast('Não foi possível salvar o cuidado.');return;}
  closeModal('healthModal');toast('Cuidado salvo ✅');await load();
};
['petModal','healthModal','pixModal','pwaInstallModal'].forEach(id=>$('#'+id).addEventListener('click',e=>{if(e.target.id===id){if(id==='pixModal')pixClose();else closeModal(id);}}));
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal('petModal');closeModal('healthModal');closePwaInstall();pixClose();}});
$('#enter').onclick=async()=>{const email=$('#email').value.trim(),password=$('#password').value;if(!email||!password){$('#loginMsg').textContent='Preencha e-mail e senha.';return;}const b=$('#enter');b.disabled=true;$('#loginMsg').textContent='Entrando…';
  // Se a autenticação demorar (rede lenta ou espera de segurança do servidor após
  // tentativas anteriores com senha errada), avisa em vez de deixar o botão preso em silêncio.
  const slow=setTimeout(()=>{$('#loginMsg').textContent='Ainda entrando… a conexão está lenta. Aguarde alguns segundos.';},6000);
  try{const {data,error}=await sb.auth.signInWithPassword({email,password});if(error||!data.session){$('#loginMsg').textContent=/rate|too many|seconds|429/i.test(error&&error.message||'')?'Muitas tentativas. Aguarde alguns segundos e tente novamente.':'E-mail ou senha inválidos.';return;}$('#loginMsg').textContent='Carregando seus dados…';await load();}catch(e){$('#loginMsg').textContent='Não foi possível entrar agora. Verifique sua conexão.';}finally{clearTimeout(slow);b.disabled=false;}};
$('#password').onkeydown=e=>{if(e.key==='Enter')$('#enter').click();};
$('#logout').onclick=async()=>{await sb.auth.signOut();location.reload();};
$('#saveProfile').onclick=async()=>{const {error}=await sb.rpc('portal_update_profile',{p:{phone:$('#phone').value,email:$('#profileEmail').value,address:$('#address').value,bairro:$('#bairro').value}});if(error){toast('Não foi possível salvar.');return;}toast('Dados atualizados ✅');load();};
// Endereço por CEP (grava o número dentro do endereço, como no admin)
$('#cep').oninput=e=>{let v=e.target.value.replace(/\D/g,'').slice(0,8);e.target.value=v.length>5?v.slice(0,5)+'-'+v.slice(5):v;};
async function buscaCepPortal(){
  const cep=($('#cep').value||'').replace(/\D/g,'');
  if(cep.length!==8){toast('CEP deve ter 8 dígitos.');return;}
  const b=$('#btnCep');b.disabled=true;const old=b.textContent;b.textContent='…';
  try{
    const r=await fetch(`https://viacep.com.br/ws/${cep}/json/`);const d=await r.json();
    if(d.erro){toast('CEP não encontrado.');return;}
    const num=($('#num').value||'').trim();
    const rua=[d.logradouro,num].filter(Boolean).join(', ');
    $('#address').value=[rua,d.bairro,d.localidade&&d.uf?`${d.localidade}/${d.uf}`:''].filter(Boolean).join(' - ');
    $('#bairro').value=d.bairro||$('#bairro').value;
    toast('Endereço preenchido pelo CEP ✅');
    if(!num)$('#num').focus();
  }catch(e){toast('Falha ao consultar o CEP.');}
  finally{b.disabled=false;b.textContent=old;}
}
$('#btnCep').onclick=buscaCepPortal;
$('#num').onblur=()=>{if(($('#cep').value||'').replace(/\D/g,'').length===8&&$('#num').value.trim())buscaCepPortal();};
$('#savePassword').onclick=async()=>{const password=$('#newPassword').value;if(password.length<10){toast('Use pelo menos 10 caracteres.');return;}const b=$('#savePassword');b.disabled=true;const {error}=await sb.auth.updateUser({password});b.disabled=false;if(error){toast('Não foi possível alterar a senha.');return;}$('#newPassword').value='';toast('Senha atualizada ✅');};
// ===== Pagamento PIX (Mercado Pago) =====
let PIXPOLL=null;
function pixClose(){$('#pixModal').classList.remove('show');if(PIXPOLL){clearInterval(PIXPOLL);PIXPOLL=null;}}
function pixPaidHtml(){return '<h3>✅ Pagamento confirmado!</h3><p class="muted" style="margin:8px 0 0">Sua conta foi quitada e a loja já foi avisada. Obrigado! 🎉</p><button class="btn block" style="margin-top:14px" data-act="pixClose">Fechar</button>';}
window.pixCopy=()=>{const e=$('#pixCode');if(!e)return;if(navigator.clipboard)navigator.clipboard.writeText(e.value).then(()=>toast('Código copiado ✓'));else{e.select();document.execCommand('copy');toast('Código copiado ✓');}};
function pixRender(d){
  const img=d.qr_code_base64?`<img class="qrimg" alt="QR Code PIX" src="data:image/png;base64,${d.qr_code_base64}">`:'<p class="muted" style="text-align:center;margin:14px 0">QR indisponível — use o código copia e cola abaixo.</p>';
  $('#pixSheet').innerHTML=`<h3>💠 Pague ${BRL(d.amount)}</h3>
    <p class="muted" style="margin:2px 0 0">Abra o app do seu banco, escaneie o QR ou cole o código PIX.</p>
    ${img}
    ${d.qr_code?`<textarea class="pixcode" id="pixCode" readonly>${esc(d.qr_code)}</textarea><button class="btn block" style="margin-top:8px" data-act="pixCopy">📋 Copiar código PIX</button>`:''}
    <p id="pixStatusLine" class="muted" style="text-align:center;margin-top:12px">⏳ Aguardando o pagamento cair…</p>
    <button class="btn ghost block" style="margin-top:6px" data-act="pixClose">Fechar</button>`;
}
// Barra de pagamento: soma as parcelas marcadas e habilita o botão único de PIX.
function updatePayBar(){
  const boxes=[...document.querySelectorAll('#overdue .rck, #upcoming .rck')];
  const checked=boxes.filter(b=>b.checked);
  const total=checked.reduce((s,b)=>s+(Number(b.dataset.amount)||0),0);
  const bar=$('#payBar');if(!bar)return;
  const btn=$('#payBtn');
  $('#paySel').textContent=BRL(total);
  $('#payCount').textContent=checked.length;
  const show=boxes.length>0;
  bar.classList.toggle('hide',!show);
  document.body.classList.toggle('paybar-open',show);
  btn.disabled=checked.length===0;
  btn.textContent=checked.length?`💠 Pagar ${BRL(total)} no PIX`:'💠 Pagar no PIX';
}
document.addEventListener('change',e=>{if(e.target&&e.target.classList&&e.target.classList.contains('rck'))updatePayBar();});
// Fluxo PIX genérico: serve tanto p/ uma parcela quanto p/ várias somadas.
async function pixStart(reqBody){
  const sheet=$('#pixSheet');$('#pixModal').classList.add('show');
  sheet.innerHTML='<h3>💠 Pagamento PIX</h3><p class="muted" style="margin:10px 0">Gerando cobrança segura…</p>';
  let res;try{res=await sb.functions.invoke('portal-pix',{body:reqBody});}catch(e){res={error:e};}
  const data=res.data,error=res.error;
  if(error||!data||!data.ok){
    let msg=(data&&data.error)||(error&&error.message)||'Não foi possível gerar o PIX agora.';
    try{if(error&&error.context){const j=await error.context.json();if(j&&j.error)msg=j.error;}}catch(_){}
    sheet.innerHTML=`<h3>💠 Pagamento PIX</h3><p style="color:var(--red);margin:12px 0">${esc(msg)}</p><button class="btn ghost block" data-act="pixClose">Fechar</button>`;return;
  }
  if(data.status==='paid'){sheet.innerHTML=pixPaidHtml();toast('Pagamento confirmado ✅');setTimeout(load,1200);return;}
  pixRender(data);
  PIXPOLL=setInterval(async()=>{
    let r;try{r=await sb.functions.invoke('portal-pix',{body:{action:'status',charge_id:data.charge_id}});}catch(e){return;}
    const st=r.data&&r.data.status;
    if(st==='paid'){clearInterval(PIXPOLL);PIXPOLL=null;$('#pixSheet').innerHTML=pixPaidHtml();toast('Pagamento confirmado ✅');setTimeout(load,1400);}
    else if(st&&['cancelled','expired','error'].includes(st)){clearInterval(PIXPOLL);PIXPOLL=null;const s=$('#pixStatusLine');if(s){s.textContent='A cobrança expirou ou foi cancelada. Feche e tente de novo.';s.style.color='var(--red)';}}
  },4000);
}
window.payReceivable=id=>pixStart({action:'create',receivable_id:id});
window.paySelected=async()=>{
  const ids=[...document.querySelectorAll('#overdue .rck:checked, #upcoming .rck:checked')].map(b=>b.dataset.rid);
  if(!ids.length){toast('Selecione ao menos uma parcela.');return;}
  await pixStart({action:'create',receivable_ids:ids});
};
window.setSub=async(id,status)=>{const {error}=await sb.rpc('portal_set_subscription_status',{p_subscription:id,p_status:status});if(error){toast('Não foi possível alterar.');return;}toast(status==='paused'?'Assinatura pausada.':'Assinatura retomada ✅');load();};
(async()=>{const {data:{session}}=await sb.auth.getSession();if(session)await load();})();
// bloqueia zoom por pinça/duplo-toque no iOS (que ignora user-scalable=no)
['gesturestart','gesturechange','gestureend'].forEach(ev=>document.addEventListener(ev,e=>e.preventDefault(),{passive:false}));
let lastTouch=0;document.addEventListener('touchend',e=>{const n=Date.now();if(n-lastTouch<=350)e.preventDefault();lastTouch=n;},{passive:false});
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));

// ===== Delegação de cliques (CSP sem unsafe-inline) =====
// Substitui os antigos onclick="fn(arg)" por data-act/data-a1/data-a2.
// Handlers de propriedade (el.onclick=, form.onsubmit=, input.oninput=) seguem normais.
document.addEventListener('click', function(e){
  var el = e.target.closest && e.target.closest('[data-act]');
  if(!el) return;
  var act = el.dataset.act, a1 = el.dataset.a1, a2 = el.dataset.a2;
  var fn = window[act];
  if(typeof fn!=='function') return;
  if(act==='reorder'){ fn(a1, el); return; }   // reorder(id, botão) — mostra estado de carregando
  fn(a1, a2);
});
