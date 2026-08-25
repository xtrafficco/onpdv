(async()=>{
  const tableData={
    app_users:{id:'00000000-0000-0000-0000-000000000001',nome:'Administrador QA',papel:'admin',ativo:true,store_id:null,permissoes:{}},
    stores:[{id:'store-qa',nome:'Loja QA',ativo:true,is_matriz:true}],
    suppliers:[{id:'supplier-qa',nome:'Fornecedor QA',ativo:true}],
    products:[{id:'product-qa',nome:'Produto QA',sku:'QA-001',ativo:true,custo:10,preco:20,estoque:2}]
  };
  const resultFor=table=>({data:Array.isArray(tableData[table])?tableData[table]:[],error:null});
  const builder=table=>{
    const api={select(){return api;},eq(){return api;},neq(){return api;},gte(){return api;},lte(){return api;},gt(){return api;},lt(){return api;},in(){return api;},is(){return api;},or(){return api;},ilike(){return api;},order(){return api;},limit(){return api;},range(){return api;},insert(){return api;},update(){return api;},upsert(){return api;},delete(){return api;},single(){return Promise.resolve({data:tableData[table]||null,error:null});},maybeSingle(){return Promise.resolve({data:tableData[table]||null,error:null});},then(ok,bad){return Promise.resolve(resultFor(table)).then(ok,bad);}};
    return api;
  };
  const rpcData=name=>{
    if(name==='erp_products')return tableData.products;
    if(name==='erp_purchase_workflow_config')return {auto_approval_limit:500,price_increase_alert_percent:10,default_priority:'normal'};
    if(name==='erp_purchase_price_alerts')return [];
    if(name==='erp_purchase_order_workflow_list')return [{order_id:'po-qa',buyer_name:'Administrador QA',priority:'alta',delivery_on:'2026-08-30',installments:2,approval_type:'manual',decision_reason:null,receipt_count:1,received_total:20}];
    if(name==='erp_purchase_order_context')return {metadata:{order_id:'po-qa',buyer_name:'Administrador QA',priority:'alta',delivery_on:'2026-08-30',installments:2,approval_type:'manual'},receipts:[{id:1,confirmed_at:'2026-08-25T12:00:00Z',total:20,status:'parcial'}],prices:[]};
    if(name==='erp_po_list')return [{id:'po-qa',created_at:'2026-08-25T11:00:00Z',fornecedor:'Fornecedor QA',loja:'Loja QA',total_previsto:50,total_recebido:20,status:'parcial'}];
    if(name==='erp_po_detail')return {id:'po-qa',created_at:'2026-08-25T11:00:00Z',fornecedor:'Fornecedor QA',loja:'Loja QA',status:'parcial',total_previsto:50,total_recebido:20,itens:[{product_id:'product-qa',descricao:'Produto QA',qtd_pedida:5,qtd_recebida:2,custo_unit:10}]};
    if(name==='erp_smart_order')return {fornecedores:[{supplier_id:'supplier-qa',fornecedor:'Fornecedor QA',total_custo:30,itens:[{product_id:'product-qa',nome:'Produto QA',sku:'QA-001',unidade:'UN',velocidade:1,forecast_demand:30,weekday_factor:1,season_factor:1,promo_programada:false,lead_days:3,lead_source:'fornecedor',saldo:2,safety_stock:5,expired_qty:0,expiring_qty:0,transfer_qty:0,sugestao:3,custo:10,custo_total:30}]}],encalhados:[]};
    if(name==='erp_purchase_quote_responses_list')return [];
    if(name==='cashback_config_get')return {ativo:false};
    return null;
  };
  const channel={on(){return channel;},subscribe(){return channel;},unsubscribe(){return Promise.resolve();}};
  window.ONPDV_SB={
    auth:{getSession:async()=>({data:{session:{user:{id:tableData.app_users.id}}}}),signInWithPassword:async()=>({data:{session:{user:{id:tableData.app_users.id}}},error:null}),signOut:async()=>({error:null}),updateUser:async()=>({error:null}),resetPasswordForEmail:async()=>({error:null})},
    from:table=>builder(table),rpc:async name=>({data:rpcData(name),error:null}),channel:()=>channel,removeChannel:()=>{},
    functions:{invoke:async()=>({data:{ok:true},error:null})}
  };
  document.querySelector('#appHost').innerHTML=await (await fetch('../../partials/onpdv-app.html')).text();
  const script=document.createElement('script');script.src='../../assets/js/onpdv-app.js';document.body.appendChild(script);
})();
