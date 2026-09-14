/* ONPDV — Módulo Compras (fusão 247)
   ---------------------------------------------------------------------------
   Carregado SOB DEMANDA por openCompras(), em onpdv-app.js, quando uma aba de
   Compras abre — mesmo padrão do Raio-X Financeiro. Roda depois do app, então
   pode usar os globais dele (PRODUCTS, CURRENT_STORE, sb, esc, BRL, toast…).

   Expõe window.CMP_PAGES (o roteador das abas) e alguns window.cmpRender* para
   os botões "Atualizar" declarativos. Transferências chama window.cmpClearList
   protegido por typeof, e TR_SOURCE_LISTS só é preenchido aqui dentro — então
   nada fora daqui depende deste arquivo já estar carregado.
   --------------------------------------------------------------------------- */
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
