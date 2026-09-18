/* =====================================================================
   ONPDV · Raio-X Financeiro
   Relatório gerencial profundo (14 capítulos) alimentado direto pelo
   banco do sistema, via RPC erp_raiox_dataset.

   Estrutura do arquivo:
     1. utilitários            (formatação, datas, agregação)
     2. leitura do dataset     (RPC -> {contas, receitas, meta})
     3. motor de análise       (analyze / deep / findings)
     4. gráficos SVG
     5. camada de interface    (abas, cards, relatório completo)

   Nada aqui depende de biblioteca externa: a CSP do ONPDV só permite
   script próprio e o gerador de gráficos é SVG na mão.
   ===================================================================== */
(function (root) {
'use strict';

/* ====================== 1. UTILITÁRIOS ====================== */
function norm(s){
  return String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
}
function toNum(v){
  if(v==null||v==='') return 0;
  if(typeof v==='number') return isFinite(v)?v:0;
  var s=String(v).replace(/[R$\s\u00a0]/g,'');
  if(s.indexOf(',')>-1) s=s.replace(/\./g,'').replace(',','.');
  var n=parseFloat(s); return isFinite(n)?n:0;
}
function toDate(v){
  if(v==null||v==='') return null;
  if(v instanceof Date) return isNaN(v.getTime())?null:new Date(v.getFullYear(),v.getMonth(),v.getDate());
  var s=String(v).trim();
  var m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m) return new Date(+m[1],+m[2]-1,+m[3]);
  m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if(m){ var y=+m[3]; if(y<100) y+=2000; return new Date(y,+m[2]-1,+m[1]); }
  var d2=new Date(s); return isNaN(d2.getTime())?null:new Date(d2.getFullYear(),d2.getMonth(),d2.getDate());
}
function ym(d){ return d? d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0') : null; }
function ymLabel(k){
  var M=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  var p=String(k||'').split('-'); return (M[+p[1]-1]||'?')+'/'+String(p[0]).slice(2);
}
function addM(k,n){ var p=k.split('-'); return ym(new Date(+p[0],+p[1]-1+n,1)); }
function rangeM(a,b){ var out=[],c=a,guard=0; while(c<=b && guard++<400){ out.push(c); c=addM(c,1); } return out; }
function days(a,b){ return Math.round((b-a)/86400000); }
var fmt0=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0});
var fmt2=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
function fm(v){ v=Math.round(v||0); return (v<0?'−R$ ':'R$ ')+fmt0.format(Math.abs(v)); }
function fm2(v){ v=v||0; return (v<0?'−R$ ':'R$ ')+fmt2.format(Math.abs(v)); }
function pc(v,d){ if(v==null||!isFinite(v)) return '—'; return (v*100).toFixed(d==null?1:d).replace('.',',')+'%'; }
function nf(v,d){ return v==null?'—':Number(v).toLocaleString('pt-BR',{minimumFractionDigits:d||0,maximumFractionDigits:d||0}); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
function sortDesc(obj){ return Object.keys(obj).map(function(k){return {k:k,v:obj[k]};}).sort(function(a,b){return b.v-a.v;}); }
function add(o,k,v){ o[k]=(o[k]||0)+(v||0); }
function sgnc(v){ return v<0?'rx-neg':'rx-pos'; }

/* Classificação do centro de custo em blocos gerenciais. Os nomes vêm do
   cadastro de centros de custo do ONPDV (fin_cost_centers). */
function blocoDe(cc,cat){
  var c=norm(cc), k=norm(cat);
  if(/TRAN[S]?FER/.test(c) || /TRAN[S]?FER/.test(k)) return 'TRANSF';
  if(c.indexOf('FORNECEDOR')>-1 || c.indexOf('MERCADORIA')>-1) return 'FORNECEDOR';
  if(c.indexOf('FUNCIONARIO')>-1 || c.indexOf('FOLHA')>-1) return 'FOLHA';
  if(c.indexOf('DESPESA FIXA')>-1) return 'OCUPACAO';
  if(c.indexOf('ADMINISTRATIVA')>-1) return 'ADM';
  if(c.indexOf('FINANCEIRA')>-1 || c.indexOf('EMPRESTIMO')>-1 || c.indexOf('BANCARIA')>-1) return 'FINANC';
  if(c.indexOf('IMPOSTO')>-1 || c.indexOf('TRIBUT')>-1) return 'IMPOSTO';
  if(c.indexOf('PESSOAL')>-1 || c.indexOf('RETIRADA')>-1 || c.indexOf('SOCIO')>-1) return 'SOCIOS';
  if(c.indexOf('INVESTIMENTO')>-1) return 'INVEST';
  return 'OUTROS';
}
var BLOCOS={
  FORNECEDOR:{n:'Compras de mercadoria',e:'🛒'}, FOLHA:{n:'Pessoal (folha + encargos)',e:'👥'},
  OCUPACAO:{n:'Custos fixos (aluguel, luz, água…)',e:'🏠'}, ADM:{n:'Administrativas',e:'📎'},
  FINANC:{n:'Financeiras e empréstimos',e:'🏦'}, IMPOSTO:{n:'Impostos',e:'🧾'},
  SOCIOS:{n:'Sócios (retiradas e pessoais)',e:'👤'}, INVEST:{n:'Investimentos',e:'🔧'},
  OUTROS:{n:'Outros',e:'📦'}, TRANSF:{n:'Transferência interna de mercadoria',e:'🔁'}
};
function lojaKey(s){
  var n=String(s==null?'':s).trim();
  n=n.replace(/PETVILLE RA[ÇC][ÕO]ES E BAZAR/ig,'').replace(/PETVILLE/ig,'')
     .replace(/^[\s\-–]+/,'').trim();
  return n||String(s||'—').trim();
}

/* ====================== 2. LEITURA DO DATASET ====================== */
/* Converte o retorno da RPC no mesmo formato que o motor de análise
   consome. A única diferença para a planilha original é que as receitas
   chegam agregadas por dia × loja × forma, com a contagem de vendas em
   `n` — por isso o motor soma `n` em vez de contar linhas. */
function fromDataset(payload, opts){
  opts=opts||{};
  var raw=payload||{};
  var contas=(raw.contas||[]).map(function(r){
    var venc=toDate(r.venc), dtp=toDate(r.dtp);
    return {
      conta:String(r.conta||'—').trim(),
      status:norm(r.status),
      forn:String(r.forn||'—').trim(),
      venc:venc, val:toNum(r.val), juros:toNum(r.juros), pago:toNum(r.pago), dtp:dtp,
      cat:String(r.cat||'').trim(), cc:String(r.cc||'').trim(),
      bl:blocoDe(r.cc,r.cat),
      ym:ym(venc), ymp:ym(dtp),
      atraso:(dtp&&venc)? days(venc,dtp) : null
    };
  }).filter(function(x){ return x.venc || x.val; });

  var receitas=[];
  (raw.receitas||[]).forEach(function(r){
    if(r.src==='hist' && !opts.incluirHistorico) return;
    var d=toDate(r.d), v=toNum(r.v);
    if(!d || !v) return;
    receitas.push({d:d, v:v, n:(+r.n||0), loja:String(r.loja||'—').trim(),
                   forma:String(r.forma||'—').trim(), src:r.src||'pdv', ym:ym(d)});
  });

  var mesesR={}, mesesC={};
  receitas.forEach(function(x){ mesesR[x.ym]=1; });
  contas.forEach(function(x){ if(x.ym) mesesC[x.ym]=1; });

  var meta=raw.meta||{};

  return {
    contas:contas, receitas:receitas,
    mesesReceita:Object.keys(mesesR).sort(), mesesContas:Object.keys(mesesC).sort(),
    meta:meta, margem:lerMargem(meta),
    geradoEm: raw.gerado_em ? new Date(raw.gerado_em) : new Date()
  };
}

/* Margem bruta medida pelo sistema, em tres fontes de qualidade decrescente.
   Aqui so organizamos as medicoes; qual delas vale em cada mes e decidido em
   `margemDoMes`, que precisa saber a receita do mes para julgar a cobertura. */
var FONTES={
  vendas:    {n:'medida item a item nas vendas'},
  historico: {n:'medida pelo giro de cada produto x o custo cadastrado'},
  catalogo:  {n:'calculada pelo cadastro de produtos'},
  manual:    {n:'informada manualmente'}
};
function fonteLabel(f){
  if(f==='global') return 'medida pelo sistema no conjunto das vendas custeadas';
  return (FONTES[f]||{}).n || f;
}
function lerMargem(meta){
  var M=(meta&&meta.margem)||{}, porMes={};
  (M.historico_mes||[]).forEach(function(o){
    var r=toNum(o.receita); if(r<=0) return;
    porMes[o.ym]={pct:1-toNum(o.cmv)/r, fonte:'historico', receita:r, cmv:toNum(o.cmv)};
  });
  /* item a item e a fonte mais forte: sobrescreve o historico do mesmo mes */
  (M.itens_mes||[]).forEach(function(o){
    var r=toNum(o.receita); if(r<=0) return;
    porMes[o.ym]={pct:1-toNum(o.cmv)/r, fonte:'vendas', receita:r, cmv:toNum(o.cmv)};
  });
  var g=M.global||{}, c=M.catalogo||{};
  return {
    porMes:porMes,
    global: (g.pct!=null) ? {pct:g.pct/100, receita:toNum(g.receita), cmv:toNum(g.cmv)} : null,
    catalogo: (c.pct!=null) ? {pct:c.pct/100, produtos:c.produtos||0, semCusto:c.sem_custo||0} : null,
    receitaConhecida: toNum(M.receita_conhecida)
  };
}
/* Cobertura minima para a medicao do proprio mes valer mais que a medicao
   global: abaixo disso a amostra e pequena demais e distorce o CMV. */
var COBERTURA_MIN=0.25;
function margemDoMes(R, k){
  var M=R.margemSrc||{porMes:{}}, recMes=R.rec.mes[k]||0;
  if(R.cfg.margemManual) return {pct:R.cfg.margem/100, fonte:'manual', cobertura:null};
  var c=M.porMes[k];
  if(c && recMes>0 && c.receita>=recMes*COBERTURA_MIN)
    return {pct:c.pct, fonte:c.fonte, cobertura:c.receita/recMes};
  if(M.global) return {pct:M.global.pct, fonte:'global', cobertura:null};
  if(M.catalogo) return {pct:M.catalogo.pct, fonte:'catalogo', cobertura:null};
  return {pct:R.cfg.margem/100, fonte:'manual', cobertura:null};
}

/* ====================== 3. MOTOR DE ANÁLISE ====================== */
var CFG_DEFAULT={ margem:32, txCred:3.0, txDeb:1.5, aliq:6.0, prazoCred:30 };
var DOW=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

function analyze(data, de, ate, cfg){
  cfg=Object.assign({},CFG_DEFAULT,cfg||{});
  var meses=rangeM(de,ate);
  var inR=function(k){ return k && k>=de && k<=ate; };
  var R={cfg:cfg, de:de, ate:ate, meses:meses, meta:data.meta||{}, margemSrc:data.margem||{porMes:{}}};

  /* --- receita --- */
  var rec=data.receitas.filter(function(x){ return inR(x.ym); });
  R.rec={total:0, mes:{}, loja:{}, forma:{}, lojaMes:{}, dia:{}, diaMes:{},
         dow:[0,0,0,0,0,0,0], dowN:[0,0,0,0,0,0,0], n:0, linhas:rec.length};
  rec.forEach(function(x){
    R.rec.total+=x.v; R.rec.n+=x.n;
    add(R.rec.mes,x.ym,x.v);
    var L=lojaKey(x.loja); add(R.rec.loja,L,x.v); add(R.rec.forma,x.forma,x.v);
    R.rec.lojaMes[L]=R.rec.lojaMes[L]||{}; add(R.rec.lojaMes[L],x.ym,x.v);
    add(R.rec.dia, x.d.getFullYear()+'-'+String(x.d.getMonth()+1).padStart(2,'0')+'-'+String(x.d.getDate()).padStart(2,'0'), x.v);
    R.rec.dow[x.d.getDay()]+=x.v; R.rec.dowN[x.d.getDay()]+=x.n;
    add(R.rec.diaMes, x.d.getDate(), x.v);
  });
  R.temReceita = R.rec.total>0;
  R.nMesesRec = Object.keys(R.rec.mes).length || meses.length;

  /* --- despesas (competência = vencimento) --- */
  var ct=data.contas.filter(function(x){ return inR(x.ym); });
  R.desp={total:0, bloco:{}, blocoMes:{}, cat:{}, catMes:{}, catBloco:{}, mes:{}, conta:{},
          contaBloco:{}, transf:0, transfConta:{}, juros:0, jurosMes:{}, jurosForn:{},
          vencDia:{}, n:ct.length};
  ct.forEach(function(x){
    R.desp.juros+=x.juros; add(R.desp.jurosMes,x.ym,x.juros);
    if(x.juros) add(R.desp.jurosForn,x.forn,x.juros);
    if(x.bl==='TRANSF'){ R.desp.transf+=x.val; add(R.desp.transfConta,x.conta,x.val); }
    R.desp.contaBloco[x.conta]=R.desp.contaBloco[x.conta]||{};
    add(R.desp.contaBloco[x.conta],x.bl,x.val);
    if(x.bl==='TRANSF') return;
    R.desp.total+=x.val;
    add(R.desp.bloco,x.bl,x.val); add(R.desp.mes,x.ym,x.val); add(R.desp.conta,x.conta,x.val);
    R.desp.blocoMes[x.bl]=R.desp.blocoMes[x.bl]||{}; add(R.desp.blocoMes[x.bl],x.ym,x.val);
    var ck=x.cat||'(sem categoria)'; add(R.desp.cat,ck,x.val); R.desp.catBloco[ck]=x.bl;
    R.desp.catMes[ck]=R.desp.catMes[ck]||{}; add(R.desp.catMes[ck],x.ym,x.val);
    if(x.venc) add(R.desp.vencDia, x.venc.getDate(), x.val);
  });

  /* --- mix de recebimento --- */
  var mix={cred:0,deb:0,cart:0,pix:0,dinh:0,crd:0,outros:0};
  Object.keys(R.rec.forma).forEach(function(f){
    var n=norm(f), v=R.rec.forma[f];
    if(n.indexOf('CREDIARIO')>-1||n.indexOf('CARNE')>-1) mix.crd+=v;
    else if(n.indexOf('CREDITO')>-1) mix.cred+=v;
    else if(n.indexOf('DEBITO')>-1) mix.deb+=v;
    else if(n.indexOf('CARTAO')>-1) mix.cart+=v;           // tipo não identificado no PDV
    else if(n.indexOf('PIX')>-1||n.indexOf('INSTANTANEO')>-1) mix.pix+=v;
    else if(n.indexOf('DINHEIRO')>-1||n.indexOf('ESPECIE')>-1) mix.dinh+=v;
    else mix.outros+=v;
  });
  R.mix=mix;
  R.mixAVista = mix.dinh+mix.pix;
  /* cartão sem tipo identificado: taxa média entre crédito e débito */
  var taxa = mix.cred*cfg.txCred/100 + mix.deb*cfg.txDeb/100
           + mix.cart*((cfg.txCred+cfg.txDeb)/2)/100;

  /* --- margem bruta, mes a mes, medida pelo sistema ---
     O CMV nao sai mais de um percentual unico digitado a mao: cada mes usa a
     melhor medicao disponivel (itens vendidos > giro x custo > catalogo) e o
     total do periodo e a soma dos meses, nao a receita vezes uma media. */
  R.margemMes={};
  meses.forEach(function(k){ R.margemMes[k]=margemDoMes(R,k); });
  var cmv=0;
  meses.forEach(function(k){ cmv+=(R.rec.mes[k]||0)*(1-R.margemMes[k].pct); });
  R.margem={
    pct: R.rec.total>0 ? 1-cmv/R.rec.total
       : (R.margemSrc.global? R.margemSrc.global.pct : cfg.margem/100),
    fontes:(function(){
      var f={}; meses.forEach(function(k){
        var v=R.rec.mes[k]||0; if(v) f[R.margemMes[k].fonte]=(f[R.margemMes[k].fonte]||0)+v; });
      return f;
    })()
  };
  R.margem.fonte=Object.keys(R.margem.fontes).sort(function(a,b){
    return R.margem.fontes[b]-R.margem.fontes[a]; })[0] || 'manual';
  R.margem.medida = R.margem.fonte!=='manual';
  R.margem.cobertura = (R.margemSrc.receitaConhecida>0 && R.margemSrc.global)
    ? R.margemSrc.global.receita/R.margemSrc.receitaConhecida : null;

  /* --- DRE --- */
  var compras=R.desp.bloco.FORNECEDOR||0;
  var d=R.desp.bloco;
  R.dre={
    receita:R.rec.total, taxaCartao:taxa, liquida:R.rec.total-taxa,
    cmv:cmv, lucroBruto:R.rec.total-taxa-cmv,
    folha:d.FOLHA||0, ocupacao:d.OCUPACAO||0, adm:d.ADM||0,
    financ:d.FINANC||0, imposto:d.IMPOSTO||0, socios:d.SOCIOS||0,
    outros:(d.OUTROS||0)+(d.INVEST||0), compras:compras
  };
  R.dre.despOper=R.dre.folha+R.dre.ocupacao+R.dre.adm+R.dre.financ+R.dre.imposto+R.dre.socios+R.dre.outros;
  R.dre.resultado=R.dre.lucroBruto-R.dre.despOper;
  R.dre.impostoDevido=R.rec.total*cfg.aliq/100;
  R.dre.gapImposto=Math.max(0,R.dre.impostoDevido-R.dre.imposto);
  R.dre.resultadoAjust=R.dre.resultado-R.dre.gapImposto;
  R.dre.caixa=R.rec.total-R.desp.total;
  R.dre.varEstoque=compras-cmv;
  R.dre.mcPct=R.rec.total? (R.rec.total-taxa-cmv)/R.rec.total : R.margem.pct;
  R.dre.pontoEquilibrio=R.dre.mcPct>0 ? R.dre.despOper/R.dre.mcPct : null;
  R.dre.pontoEquilibrioMes=R.dre.pontoEquilibrio!=null ? R.dre.pontoEquilibrio/Math.max(1,R.nMesesRec) : null;

  /* DRE mensal */
  R.dreMes=meses.map(function(k){
    var rc=R.rec.mes[k]||0;
    var bm=function(b){ return (R.desp.blocoMes[b]||{})[k]||0; };
    var mg=R.margemMes[k]||{pct:R.margem.pct,fonte:'manual'};
    var cmvK=rc*(1-mg.pct);
    var mixK=R.rec.total? taxa/R.rec.total*rc : 0;
    var oper=bm('FOLHA')+bm('OCUPACAO')+bm('ADM')+bm('FINANC')+bm('IMPOSTO')+bm('SOCIOS')+bm('OUTROS')+bm('INVEST');
    return {k:k, rec:rc, compras:bm('FORNECEDOR'), cmv:cmvK, taxa:mixK,
      marg:mg.pct, margFonte:mg.fonte, margCob:mg.cobertura,
      folha:bm('FOLHA'), ocup:bm('OCUPACAO'), adm:bm('ADM'), fin:bm('FINANC'),
      imp:bm('IMPOSTO'), soc:bm('SOCIOS'), outros:bm('OUTROS')+bm('INVEST'),
      oper:oper, result:rc-mixK-cmvK-oper, caixa:rc-(R.desp.mes[k]||0),
      varEst:bm('FORNECEDOR')-cmvK};
  });

  /* --- lojas --- */
  var hub=null, hubV=-1;
  Object.keys(R.desp.contaBloco).forEach(function(c){
    var v=R.desp.contaBloco[c].FORNECEDOR||0; if(v>hubV){ hubV=v; hub=c; }
  });
  var transfOutros=0;
  Object.keys(R.desp.transfConta).forEach(function(c){
    if(lojaKey(c)!==lojaKey(hub)) transfOutros+=R.desp.transfConta[c];
  });
  var lojas={};
  Object.keys(R.rec.loja).forEach(function(L){ lojas[L]={rec:R.rec.loja[L],dir:0,transf:0,aj:0}; });
  Object.keys(R.desp.conta).forEach(function(c){
    var L=lojaKey(c); lojas[L]=lojas[L]||{rec:0,dir:0,transf:0,aj:0};
    lojas[L].dir+=R.desp.conta[c];
  });
  Object.keys(R.desp.transfConta).forEach(function(c){
    var L=lojaKey(c); lojas[L]=lojas[L]||{rec:0,dir:0,transf:0,aj:0};
    lojas[L].transf+=R.desp.transfConta[c];
  });
  var hubL=lojaKey(hub);
  if(lojas[hubL]) lojas[hubL].aj=-transfOutros;
  R.lojas=Object.keys(lojas).map(function(L){
    var o=lojas[L], custo=o.dir+o.transf+o.aj;
    return {loja:L, rec:o.rec, dir:o.dir, transf:o.transf, aj:o.aj, custo:custo,
      result:o.rec-custo, marg:o.rec? (o.rec-custo)/o.rec : null, hub:(L===hubL)};
  }).filter(function(o){ return o.rec > R.rec.total*0.002 || Math.abs(o.custo) > R.desp.total*0.005; })
    .sort(function(a,b){ return b.rec-a.rec; });
  R.hub=hubL;

  /* --- fornecedores --- */
  var f={}, fn={};
  ct.forEach(function(x){ if(x.bl!=='FORNECEDOR') return; add(f,x.forn,x.val); fn[x.forn]=(fn[x.forn]||0)+1; });
  R.fornec=sortDesc(f).map(function(o){
    return {forn:o.k, val:o.v, n:fn[o.k], ticket:o.v/fn[o.k], juros:R.desp.jurosForn[o.k]||0};
  });
  R.nNotas=R.fornec.reduce(function(s,o){return s+o.n;},0);
  R.nFornec=R.fornec.length;
  R.top3=R.fornec.slice(0,3).reduce(function(s,o){return s+o.val;},0);

  /* --- atrasos (parcelas pagas dentro do período) --- */
  var pagas=data.contas.filter(function(x){ return x.dtp && inR(x.ymp) && x.atraso!=null; });
  var atr=pagas.filter(function(x){ return x.atraso>0; });
  R.atraso={
    n:pagas.length, nAtr:atr.length, pct: pagas.length? atr.length/pagas.length : 0,
    valAtr: atr.reduce(function(s,x){return s+x.val;},0),
    medDias: atr.length? atr.reduce(function(s,x){return s+x.atraso;},0)/atr.length : 0,
    maxDias: atr.reduce(function(s,x){return Math.max(s,x.atraso);},0),
    faixas:[{l:'No prazo ou adiantado',n:0,v:0},{l:'1 a 5 dias',n:0,v:0},{l:'6 a 15 dias',n:0,v:0},
            {l:'16 a 30 dias',n:0,v:0},{l:'Mais de 30 dias',n:0,v:0}]
  };
  pagas.forEach(function(x){
    var i = x.atraso<=0?0 : x.atraso<=5?1 : x.atraso<=15?2 : x.atraso<=30?3 : 4;
    R.atraso.faixas[i].n++; R.atraso.faixas[i].v+=x.val;
  });

  /* --- em aberto (base inteira, não só o período) --- */
  var hoje=new Date(); hoje=new Date(hoje.getFullYear(),hoje.getMonth(),hoje.getDate());
  var abertoStatus=function(s){ return s==='EM ATRASO'||s==='A VENCER'||s==='VENCE HOJE'||s==='ABERTO'||s==='PENDENTE'; };
  var ab=data.contas.filter(function(x){ return x.bl!=='TRANSF' && x.venc && (abertoStatus(x.status) || (!x.dtp && x.status!=='PAGA')); });
  R.aberto={total:0, vencido:0, aVencer:0, itens:[], mes:{}, bloco:{}, forn:{},
    faixas:[{l:'Vencido há mais de 30 dias',v:0,n:0},{l:'Vencido 15 a 30 dias',v:0,n:0},
            {l:'Vencido 1 a 14 dias',v:0,n:0},{l:'Vence hoje',v:0,n:0},
            {l:'Vence em até 7 dias',v:0,n:0},{l:'Vence em 8 a 30 dias',v:0,n:0},
            {l:'Vence depois de 30 dias',v:0,n:0}]};
  ab.forEach(function(x){
    var dd=days(hoje,x.venc);
    R.aberto.total+=x.val;
    if(dd<0) R.aberto.vencido+=x.val; else R.aberto.aVencer+=x.val;
    var i = dd<-30?0 : dd<-14?1 : dd<0?2 : dd===0?3 : dd<=7?4 : dd<=30?5 : 6;
    R.aberto.faixas[i].v+=x.val; R.aberto.faixas[i].n++;
    add(R.aberto.mes,x.ym,x.val); add(R.aberto.bloco,x.bl,x.val); add(R.aberto.forn,x.forn,x.val);
    R.aberto.itens.push({forn:x.forn, venc:x.venc, val:x.val, dd:dd, conta:x.conta, bl:x.bl, status:x.status});
  });
  R.aberto.itens.sort(function(a,b){ return a.venc-b.venc; });
  R.hoje=hoje;

  /* --- ritmo diário de caixa --- */
  var diasPeriodo=Math.max(1, days(new Date(+de.split('-')[0],+de.split('-')[1]-1,1),
                                   new Date(+ate.split('-')[0],+ate.split('-')[1],0))+1);
  R.diasPeriodo=diasPeriodo;
  R.caixaDia=R.rec.total/diasPeriodo;
  R.saidaDia=R.desp.total/diasPeriodo;

  /* --- série histórica do Simples (base inteira) --- */
  var dasAno={};
  data.contas.forEach(function(x){
    if(!x.venc) return;
    if(norm(x.cat).indexOf('SIMPLES')>-1 || norm(x.cat).indexOf('DAS')===0)
      add(dasAno, x.venc.getFullYear(), x.val);
  });
  R.dasAno=dasAno;

  /* --- tendência da receita --- */
  var serie=meses.filter(function(k){ return R.rec.mes[k]!=null; }).map(function(k){ return R.rec.mes[k]; });
  if(serie.length>=3){
    var n=serie.length, sx=0,sy=0,sxy=0,sxx=0;
    for(var i2=0;i2<n;i2++){ sx+=i2; sy+=serie[i2]; sxy+=i2*serie[i2]; sxx+=i2*i2; }
    var b=(n*sxy-sx*sy)/(n*sxx-sx*sx);
    R.tendencia={slope:b, pctMes:(sy/n)? b/(sy/n) : null, primeiro:serie[0], ultimo:serie[n-1], n:n};
  } else R.tendencia=null;

  deep(R, data);
  R.findings=findings(R);
  return R;
}

function deep(R, data){
  var m=R.nMesesRec||1, cfg=R.cfg;
  var d0=new Date(+R.de.split('-')[0], +R.de.split('-')[1]-1, 1);
  var d1=new Date(+R.ate.split('-')[0], +R.ate.split('-')[1], 0);
  var nMesesPer=R.meses.length||1;

  /* --- sazonalidade --- */
  var dowN=[0,0,0,0,0,0,0], dmN={};
  for(var t=new Date(d0); t<=d1; t.setDate(t.getDate()+1)){ dowN[t.getDay()]++; dmN[t.getDate()]=(dmN[t.getDate()]||0)+1; }
  R.sazon={dow:[],diaMes:[]};
  for(var i=0;i<7;i++) R.sazon.dow.push({n:DOW[i], tot:R.rec.dow[i], dias:dowN[i],
    med: dowN[i]? R.rec.dow[i]/dowN[i]:0, vendas:R.rec.dowN[i]});
  var medDiaGeral=R.rec.total/Math.max(1,R.diasPeriodo);
  R.sazon.dow.forEach(function(o){ o.idx = medDiaGeral? o.med/medDiaGeral : 0; });
  for(var dd=1; dd<=31; dd++){
    var nOc=dmN[dd]||0;
    R.sazon.diaMes.push({d:dd, tot:R.rec.diaMes[dd]||0, n:nOc,
      med: nOc? (R.rec.diaMes[dd]||0)/nOc : 0,
      venc:(R.desp.vencDia[dd]||0), vencMed:(R.desp.vencDia[dd]||0)/nMesesPer});
  }

  /* --- curva ABC de fornecedores --- */
  var totC=R.dre.compras, acc=0;
  R.abc={A:[],B:[],C:[]};
  R.fornec.forEach(function(f){
    acc+=f.val; f.acum=acc/Math.max(1,totC);
    f.classe = f.acum<=0.8?'A' : f.acum<=0.95?'B' : 'C';
    R.abc[f.classe].push(f);
  });
  R.abcResumo=['A','B','C'].map(function(k){
    var L=R.abc[k], v=L.reduce(function(s,x){return s+x.val;},0);
    return {classe:k, n:L.length, val:v, pct:v/Math.max(1,totC)};
  });

  /* --- histórico anual (base inteira) --- */
  var hist={};
  data.contas.forEach(function(x){
    if(!x.venc || x.bl==='TRANSF') return;
    var y=x.venc.getFullYear(); hist[y]=hist[y]||{TOTAL:0};
    hist[y][x.bl]=(hist[y][x.bl]||0)+x.val; hist[y].TOTAL+=x.val;
  });
  R.hist=hist; R.histAnos=Object.keys(hist).sort();

  /* --- 1ª metade x 2ª metade do período --- */
  var half=Math.floor(nMesesPer/2);
  var m1=R.meses.slice(0,half||1), m2=R.meses.slice(nMesesPer-(half||1));
  function somaCat(cat,arr){ var o=R.desp.catMes[cat]||{}; return arr.reduce(function(s,k){return s+(o[k]||0);},0); }
  R.tendCat=Object.keys(R.desp.cat).map(function(k){
    var a=somaCat(k,m1), b=somaCat(k,m2);
    return {cat:k, bl:R.desp.catBloco[k], ini:a, fim:b, dif:b-a, pct: a>0? (b-a)/a : null, val:R.desp.cat[k]};
  }).filter(function(o){ return o.val > R.desp.total*0.004; })
    .sort(function(a,b){ return b.dif-a.dif; });
  R.metades={m1:m1, m2:m2,
    recIni:m1.reduce(function(s,k){return s+(R.rec.mes[k]||0);},0),
    recFim:m2.reduce(function(s,k){return s+(R.rec.mes[k]||0);},0)};

  /* --- projeção de caixa: 13 semanas --- */
  var sem=[], base=new Date(R.hoje);
  for(var w=0; w<13; w++){
    var a=new Date(base.getFullYear(),base.getMonth(),base.getDate()+w*7);
    var b=new Date(a.getFullYear(),a.getMonth(),a.getDate()+6);
    var saida=0;
    R.aberto.itens.forEach(function(it){
      if(it.venc>=a && it.venc<=b) saida+=it.val;
      else if(w===0 && it.venc<a) saida+=it.val;
    });
    sem.push({ini:a, fim:b, entrada:R.caixaDia*7, saida:saida, saldo:R.caixaDia*7-saida});
  }
  var ac=0, ah=0;
  sem.forEach(function(x,i){
    ac+=x.saldo; x.acum=ac;
    x.saidaHist = i===0 ? x.saida : Math.max(x.saida, R.saidaDia*7);
    x.saldoHist = x.entrada-x.saidaHist;
    ah+=x.saldoHist; x.acumHist=ah;
  });
  R.proj=sem;
  R.projPior=sem.reduce(function(p,x){ return x.acum<p.acum? x : p; }, sem[0]);
  R.projPiorHist=sem.reduce(function(p,x){ return x.acumHist<p.acumHist? x : p; }, sem[0]);

  /* --- estoque medido pelo ONPDV (a planilha nunca teve isso) --- */
  var est=(R.meta.estoque||[]);
  R.estoqueMedido={
    total: est.reduce(function(s,o){ return s+toNum(o.valor); },0),
    unidades: est.reduce(function(s,o){ return s+toNum(o.unidades); },0),
    lojas: est.map(function(o){ return {loja:lojaKey(o.loja), valor:toNum(o.valor), unidades:toNum(o.unidades)}; })
  };
  R.estoqueMedido.meses = R.dre.cmv>0 ? R.estoqueMedido.total/(R.dre.cmv/m) : null;

  /* --- indicadores com referência --- */
  var d=R.dre, Rt=R.rec.total;
  function st(v,bom,ruim,inv){
    if(v==null||!isFinite(v)) return 'na';
    if(inv) return v<=bom?'ok' : v<=ruim?'at' : 'ru';
    return v>=bom?'ok' : v>=ruim?'at' : 'ru';
  }
  R.indic=[
    {g:'Resultado', n:'Margem líquida ajustada', v: Rt? d.resultadoAjust/Rt : null, f:'pct',
     ref:'≥ 5%', s: st(Rt? d.resultadoAjust/Rt:null, .05, .0),
     obs:'Sobra depois de tudo, inclusive do imposto que deveria ser recolhido.'},
    {g:'Resultado', n:'Margem de contribuição', v: d.mcPct, f:'pct', ref:'≥ 28%', s: st(d.mcPct,.28,.22),
     obs:'Quanto sobra de cada real vendido depois da mercadoria e da taxa de cartão.'},
    {g:'Resultado', n:'Receita × ponto de equilíbrio', v: d.pontoEquilibrioMes? (Rt/m)/d.pontoEquilibrioMes : null, f:'x',
     ref:'≥ 1,10', s: st(d.pontoEquilibrioMes? (Rt/m)/d.pontoEquilibrioMes:null, 1.1, 1.0),
     obs:'Abaixo de 1,00 a operação não cobre os próprios custos.'},
    {g:'Mercadoria', n:'Compras sobre receita', v: Rt? d.compras/Rt : null, f:'pct',
     ref:'≈ '+pc(1-R.margem.pct,0)+' (igual ao CMV)', s:'na',
     obs:'Muito abaixo do CMV significa estoque encolhendo; muito acima, dinheiro parado.'},
    {g:'Mercadoria', n:'Variação de estoque no período', v: d.varEstoque, f:'money',
     ref:'próximo de zero', s: Math.abs(d.varEstoque)<Rt*.02?'ok':(d.varEstoque<0?'ru':'at'),
     obs:'Negativo: você vendeu mais mercadoria do que repôs.'},
    {g:'Mercadoria', n:'Estoque a custo hoje (medido pelo PDV)', v: R.estoqueMedido.total||null, f:'money',
     ref: R.estoqueMedido.meses!=null? '≈ 1,5 a 2,5 meses de CMV' : '—',
     s: R.estoqueMedido.meses==null?'na': st(R.estoqueMedido.meses,1.0,0.5),
     obs: R.estoqueMedido.meses!=null? ('Equivale a '+R.estoqueMedido.meses.toFixed(1).replace('.',',')+' meses de consumo estimado.') : 'Depende do cadastro de custo dos produtos.'},
    {g:'Mercadoria', n:'Ticket médio por parcela de compra', v: R.nNotas? d.compras/R.nNotas : null, f:'money',
     ref:'≥ R$ 2.000', s: st(R.nNotas? d.compras/R.nNotas:null, 2000, 1000),
     obs:'Ticket baixo indica compra picada, com frete repetido e sem poder de negociação.'},
    {g:'Mercadoria', n:'Concentração nos 3 maiores fornecedores', v: R.top3/Math.max(1,d.compras), f:'pct',
     ref:'30% a 60%', s:'na', obs:'Concentração alta dá desconto, mas cria dependência.'},
    {g:'Pessoas', n:'Folha sobre receita', v: Rt? d.folha/Rt : null, f:'pct', ref:'8% a 12%',
     s: st(Rt? d.folha/Rt:null, .12, .16, true), obs:'Inclui salários, encargos, férias e rescisões.'},
    {g:'Estrutura', n:'Custos fixos sobre receita', v: Rt? d.ocupacao/Rt : null, f:'pct', ref:'≤ 8%',
     s: st(Rt? d.ocupacao/Rt:null, .08, .12, true), obs:'Aluguel, energia, água, contador, segurança, software.'},
    {g:'Estrutura', n:'Despesas administrativas sobre receita', v: Rt? d.adm/Rt : null, f:'pct', ref:'≤ 3%',
     s: st(Rt? d.adm/Rt:null, .03, .05, true), obs:''},
    {g:'Fiscal', n:'Imposto pago sobre receita', v: Rt? d.imposto/Rt : null, f:'pct',
     ref: pc(cfg.aliq/100,0)+' (Simples comércio)',
     s: st(Rt? d.imposto/Rt:null, cfg.aliq/100*0.8, cfg.aliq/100*0.4),
     obs:'Abaixo da referência, existe passivo se acumulando.'},
    {g:'Fiscal', n:'Provisão fiscal faltando no período', v: d.gapImposto, f:'money', ref:'R$ 0',
     s: d.gapImposto<Rt*.005?'ok':'ru', obs:'Dívida que não aparece nos lançamentos e corre com multa e juros.'},
    {g:'Caixa', n:'Juros e multa sobre compras', v: d.compras? R.desp.juros/d.compras : null, f:'pct', ref:'0%',
     s: st(d.compras? R.desp.juros/d.compras:null, .003, .015, true),
     obs:'É desconto que você concede e não recebe de volta.'},
    {g:'Caixa', n:'Parcelas pagas com atraso', v: R.atraso.pct, f:'pct', ref:'≤ 10%',
     s: st(R.atraso.pct, .10, .25, true),
     obs:'Atraso médio de '+R.atraso.medDias.toFixed(1).replace('.',',')+' dias.'},
    {g:'Caixa', n:'Entrada diária × saída diária', v: R.saidaDia? R.caixaDia/R.saidaDia : null, f:'x', ref:'≥ 1,10',
     s: st(R.saidaDia? R.caixaDia/R.saidaDia:null, 1.1, 1.0), obs:'Quanto entra por dia para cada real que sai.'},
    {g:'Caixa', n:'Contas em aberto em meses de faturamento', v: Rt? R.aberto.total/(Rt/m) : null, f:'x',
     ref:'≤ 1,0 mês', s: st(Rt? R.aberto.total/(Rt/m):null, 1.0, 1.6, true),
     obs:'Quanto do faturamento futuro já está comprometido.'},
    {g:'Venda', n:'Ticket médio de venda', v: R.rec.n? Rt/R.rec.n : null, f:'money', ref:'—', s:'na',
     obs: nf(R.rec.n)+' vendas registradas no período.'},
    {g:'Venda', n:'Vendas por dia', v: R.diasPeriodo? R.rec.n/R.diasPeriodo : null, f:'n', ref:'—', s:'na', obs:''},
    {g:'Venda', n:'Recebimento à vista (dinheiro + PIX)', v: Rt? R.mixAVista/Rt : null, f:'pct', ref:'≥ 60%',
     s: st(Rt? R.mixAVista/Rt:null, .6, .4), obs:'O resto vira caixa só depois, com taxa ou prazo.'},
    {g:'Venda', n:'Tendência da receita', v: R.tendencia? R.tendencia.pctMes : null, f:'pct', ref:'≥ 0%',
     s: st(R.tendencia? R.tendencia.pctMes:null, 0, -.01), obs:'Variação média por mês dentro do período.'}
  ];
  return R;
}

/* ====================== DIAGNÓSTICO ====================== */
function findings(R){
  var F=[], rec=R.rec.total, m=R.nMesesRec||1, d=R.dre;
  function push(sev,ico,tit,val,txt,acao,imp){ F.push({sev:sev,ico:ico,tit:tit,val:val,txt:txt,acao:acao,imp:imp||0}); }

  if(rec>0 && d.gapImposto > rec*0.01){
    var gap=d.gapImposto;
    push('c','🧾','Imposto praticamente não está sendo pago', fm(gap)+' de provisão faltando no período',
      'No período foram registrados '+fm(d.imposto)+' de imposto sobre '+fm(rec)+' de venda — '+pc(d.imposto/rec)+' do faturamento. Uma empresa de comércio no Simples costuma recolher entre 4% e 11%. Usando '+pc(R.cfg.aliq/100)+' como referência, faltam cerca de '+fm(gap)+' no período, ou '+fm(gap/m)+' por mês.',
      'Peça ao contador o extrato do Simples (DAS em aberto) e o saldo no e-CAC. Isso não é despesa que "sumiu": é dívida acumulando multa e juros, e é o motivo de o resultado no papel parecer melhor do que o caixa. Enquanto não entrar no orçamento mensal, todo cálculo de lucro está inflado.', gap/m);
  }
  if(rec>0){
    var pf=d.folha/rec;
    if(pf>0.14) push(pf>0.18?'c':'a','👥','Folha alta demais para o tamanho da venda', pc(pf)+' da receita',
      'A folha (salários, encargos, férias, rescisões) somou '+fm(d.folha)+' no período — '+fm(d.folha/m)+' por mês. No varejo pet o saudável fica entre 8% e 12% da receita. Cada ponto percentual acima disso vale '+fm(rec*0.01/m)+' por mês.',
      'Compare a folha loja a loja na aba Resultado por loja. O caminho não é só demitir: é medir venda por funcionário e por hora. Se uma loja fatura '+fm(rec/m/Math.max(1,R.lojas.length))+' por mês e carrega três pessoas, ou a venda sobe ou a escala muda.', (pf-0.12)*rec/m);
  }
  if(R.desp.juros>0){
    var pj=d.compras? R.desp.juros/d.compras : 0;
    push(pj>0.02?'c':'a','⏰','Juros por pagar boleto em atraso', fm(R.desp.juros)+' no período',
      'Foram pagos '+fm(R.desp.juros)+' de juros e multa — '+fm(R.desp.juros/m)+' por mês, o equivalente a '+pc(pj)+' de tudo que foi comprado. Isso sai direto da margem: é como dar um desconto extra de '+pc(pj)+' em cada compra sem receber nada em troca.',
      'Os campeões estão na aba Atrasos e juros. Ligue para os três maiores e negocie: ou o vencimento muda para o dia em que há caixa, ou o desconto à vista compensa antecipar. Um único fornecedor costuma explicar metade do valor.', R.desp.juros/m);
  }
  if(R.atraso.n>20 && R.atraso.pct>0.2){
    push(R.atraso.pct>0.4?'c':'a','📅','Boa parte dos boletos é paga depois do vencimento', pc(R.atraso.pct)+' das parcelas',
      R.atraso.nAtr+' das '+R.atraso.n+' parcelas pagas no período saíram atrasadas, em média '+R.atraso.medDias.toFixed(1).replace('.',',')+' dias depois — '+fm(R.atraso.valAtr)+' em valor. Atraso crônico de poucos dias quase nunca é falta de dinheiro no mês: é descasamento entre o dia em que o boleto vence e o dia em que o caixa enche.',
      'Concentre os vencimentos: negocie com os fornecedores maiores para todo boleto cair no dia 10 e no dia 25, logo depois dos picos de venda. Você paga o mesmo, só para de pagar juros.', 0);
  }
  if(rec>0){
    var ve=d.varEstoque;
    if(ve < -rec*0.02){
      push('c','📉','As compras estão abaixo do que a venda consome — o estoque está sendo consumido',
        fm(Math.abs(ve))+' a menos em '+m+' meses',
        'Com margem bruta de '+pc(R.margem.pct,0)+' ('+fonteLabel(R.margem.fonte)+'), vender '+fm(rec)+' consome cerca de '+fm(d.cmv)+' de mercadoria a preço de custo. Foram comprados '+fm(d.compras)+'. A diferença de '+fm(Math.abs(ve))+' saiu da prateleira e não voltou. É por isso que se compra o mês inteiro, há boleto todo dia e mesmo assim falta produto: o dinheiro da compra está pagando folha e conta fixa, não repondo mercadoria.',
        'Duas conferências antes de qualquer decisão: (1) rode o inventário no ONPDV e confirme se o estoque caiu mesmo esse valor — se não caiu, existe perda, quebra ou furo de registro; (2) confira o custo cadastrado dos 20 itens que mais saem — é dele que o sistema tira a margem que sustenta esta conta.', 0);
    } else if(ve > rec*0.05){
      push('a','📦','As compras superam o giro — dinheiro parado em estoque', fm(ve)+' a mais em '+m+' meses',
        'Foram comprados '+fm(d.compras)+' contra um consumo estimado de '+fm(d.cmv)+'. Sobraram '+fm(ve)+' virando prateleira. Estoque parado é caixa preso: o boleto vence em 28 dias, o produto sai em 90.',
        'Puxe a curva ABC em Estoque inteligente. Corte a compra do que gira devagar por dois ciclos e use esse dinheiro para nunca faltar o que gira rápido — ruptura no item campeão custa mais caro do que o excesso no item lento.', 0);
    }
  }
  if(R.nNotas>0){
    var notasMes=R.nNotas/m, tk=d.compras/R.nNotas;
    if(notasMes>40) push('a','🚚','Compra muito picada: '+Math.round(notasMes)+' notas por mês', 'ticket médio '+fm(tk),
      'São '+R.nFornec+' fornecedores e '+R.nNotas+' parcelas de compra no período, ticket médio de '+fm(tk)+'. Isso é aproximadamente '+Math.round(notasMes/22)+' a '+Math.ceil(notasMes/22)+' boletos por dia útil. Comprando pouco e sempre perde-se desconto de volume, paga-se frete repetido e cria-se a sensação de que "tem boleto todo dia" — porque tem mesmo.',
      'Junte pedidos: defina dois dias de compra por semana e um pedido mínimo por fornecedor. Com os 3 maiores ('+pc(R.top3/Math.max(1,d.compras))+' das compras) negocie tabela por volume mensal fechado em vez de preço por pedido.', 0);
  }
  if(R.tendencia && R.tendencia.pctMes!=null && R.tendencia.pctMes<-0.005){
    push('a','📉','A receita está em queda', pc(R.tendencia.pctMes)+' por mês',
      'A venda saiu de '+fm(R.tendencia.primeiro)+' no primeiro mês para '+fm(R.tendencia.ultimo)+' no último — tendência de '+pc(R.tendencia.pctMes)+' ao mês. Num negócio com custo fixo alto, queda de venda vira prejuízo rápido: a folha e o aluguel não caem junto.',
      'Veja se a queda bate com a falta de mercadoria (aba Compras e estoque). Se bater, o problema não é demanda, é ruptura: o cliente foi no concorrente porque a ração dele não estava lá. Esse tipo de queda se recupera repondo os itens campeões antes de qualquer ação de marketing.', 0);
  }
  if(rec>0){
    var mr=d.resultado/rec;
    if(d.resultadoAjust<0)
      push('c','🔴','Com imposto provisionado, o resultado é negativo', fm(d.resultadoAjust)+' no período',
        'Pelo que está lançado, sobram '+fm(d.resultado)+' ('+pc(mr)+' da receita). Descontando a provisão de imposto que não está sendo paga ('+fm(d.gapImposto)+'), o resultado vira '+fm(d.resultadoAjust)+' — '+fm(d.resultadoAjust/m)+' por mês. Ou seja: o negócio hoje se financia adiando imposto e consumindo estoque.',
        'Antes de cortar qualquer coisa, escolha a alavanca: cada 1 ponto de margem bruta vale '+fm(rec*0.01/m)+' por mês; cada 1% de corte na folha vale '+fm(d.folha*0.01/m)+'. Margem costuma ser a alavanca mais rápida num negócio que já enxugou estrutura.', 0);
    else if(mr<0.05)
      push('a','🟡','Margem apertada demais para absorver imprevisto', pc(mr)+' da receita',
        'Sobram '+fm(d.resultado)+' no período, '+fm(d.resultado/m)+' por mês. Com essa folga, um mês fraco ou uma rescisão já consome o resultado inteiro.',
        'Estabeleça um piso: nenhum mês pode fechar abaixo de 5% de sobra. Se fechar, o corte entra no mês seguinte automaticamente, sem discussão.', 0);
  }
  R.lojas.forEach(function(L){
    if(L.rec>0 && L.result<0)
      push('a','🏪','A loja '+L.loja+' fecha no vermelho', fm(L.result)+' no período',
        'Faturou '+fm(L.rec)+' e consumiu '+fm(L.custo)+' entre compras, folha, aluguel e rateios'+(L.hub?'. Atenção: esta é a loja que compra para as outras, então ela carrega o custo central da operação — já foram descontados '+fm(Math.abs(L.aj))+' de mercadoria transferida':'')+'.',
        (L.hub? 'Antes de concluir que ela dá prejuízo, separe o que é custo dela do que é custo da empresa inteira (administrativo, compras, entregas). Provavelmente parte disso deveria ser rateada para as outras lojas.'
              : 'Compare custo fixo (aluguel + folha) contra a margem bruta que ela gera: '+fm(L.rec*R.margem.pct)+' por período. Se o fixo passa disso, a loja não se paga nem vendendo bem.'), 0);
  });
  if(R.aberto.vencido>0){
    push(R.aberto.vencido > rec/m*0.1 ? 'c':'a','🔔','Tem boleto vencido em aberto agora', fm(R.aberto.vencido),
      'Hoje existem '+fm(R.aberto.vencido)+' de contas já vencidas e ainda não pagas, além de '+fm(R.aberto.aVencer)+' a vencer. O total em aberto é '+fm(R.aberto.total)+', o equivalente a '+(rec? (R.aberto.total/(rec/m)).toFixed(1).replace('.',',') : '?')+' meses de faturamento.',
      'A aba Contas a pagar já ordena por vencimento. Comece pelos vencidos com fornecedor ativo — esses travam a próxima entrega, que é o que gera ruptura na prateleira.', 0);
  }
  if(d.socios>0 && rec>0){
    var ps=d.socios/rec;
    push(ps>0.03?'a':'b','👤','Despesa pessoal dos sócios dentro da empresa', fm(d.socios)+' no período',
      'Foram '+fm(d.socios)+' ('+pc(ps)+' da receita, '+fm(d.socios/m)+' por mês) em retiradas e despesas pessoais lançadas na empresa.',
      'Transforme em pró-labore fixo, com valor definido e data marcada. Não é questão de moral: despesa pessoal diluída em dezenas de lançamentos impede saber se a loja se paga, e ainda cria problema fiscal e contábil.', 0);
  }
  if((R.mix.cred+R.mix.cart)>0 && rec>0){
    var pcr=(R.mix.cred+R.mix.cart)/rec;
    push('b','💳','Parte da venda só vira dinheiro depois', pc(pcr)+' no cartão',
      fm(R.mix.cred+R.mix.cart+R.mix.deb)+' das vendas passaram por maquininha e '+pc(R.mixAVista/rec)+' entram na hora (dinheiro e PIX). Sobre cartão incide taxa, estimada em '+fm(d.taxaCartao)+' no período — valor que não aparece nas contas a pagar.'+(R.mix.cart>0?' Atenção: '+fm(R.mix.cart)+' foram registrados como "cartão" sem distinguir crédito de débito no PDV, então a taxa desse pedaço usa a média das duas.':''),
      'Confira o extrato da adquirente e lance a taxa como despesa. Em '+fm(R.mix.cred+R.mix.deb+R.mix.cart)+' de volume, 0,3 ponto de taxa vale '+fm((R.mix.cred+R.mix.deb+R.mix.cart)*0.003/m)+' por mês. Registrar crédito e débito separados no caixa deixa esta conta exata.', 0);
  }
  if(R.mix.crd>0 && rec>0){
    push('b','🧾','Venda no crediário compromete caixa futuro', fm(R.mix.crd)+' ('+pc(R.mix.crd/rec)+')',
      'O crediário aparece como receita no dia da venda, mas o dinheiro entra depois — e parte não entra. Acompanhe a inadimplência em Contas a receber.',
      'Confronte o valor vendido no crediário com o efetivamente recebido no mesmo período. A diferença é capital de giro emprestado ao cliente.', 0);
  }
  var ordem={c:0,a:1,b:2};
  F.sort(function(a,b){ return ordem[a.sev]-ordem[b.sev] || b.imp-a.imp; });
  return F;
}

/* ====================== 4. GRÁFICOS SVG ====================== */
function chart(opt){
  var w=opt.w||880, h=opt.h||240, pl=54, pr=14, pt=14, pb=28;
  var labels=opt.labels||[], series=opt.series||[];
  var all=[]; series.forEach(function(s){ s.values.forEach(function(v){ all.push(v||0); }); });
  var max=Math.max.apply(null,all.concat([0])), min=Math.min.apply(null,all.concat([0]));
  if(max===min) max=min+1;
  var pad=(max-min)*0.12; max+=pad; if(min<0) min-=pad;
  var iw=w-pl-pr, ih=h-pt-pb, n=labels.length||1;
  var bw=iw/n, y=function(v){ return pt+ih-((v||0)-min)/(max-min)*ih; };
  var s=['<svg viewBox="0 0 '+w+' '+h+'" width="100%" height="'+h+'" role="img" aria-label="gráfico">'];
  for(var g=0; g<=4; g++){
    var vv=min+(max-min)*g/4, yy=y(vv);
    s.push('<line x1="'+pl+'" y1="'+yy.toFixed(1)+'" x2="'+(w-pr)+'" y2="'+yy.toFixed(1)+'" stroke="#edf0f4"/>');
    s.push('<text x="'+(pl-7)+'" y="'+(yy+3.5).toFixed(1)+'" font-size="10" fill="#8a94a6" text-anchor="end">'+(Math.abs(vv)>=1000?Math.round(vv/1000)+'k':Math.round(vv))+'</text>');
  }
  if(min<0) s.push('<line x1="'+pl+'" y1="'+y(0).toFixed(1)+'" x2="'+(w-pr)+'" y2="'+y(0).toFixed(1)+'" stroke="#c7cfd9"/>');
  var bars=series.filter(function(x){ return x.type!=='line'; });
  bars.forEach(function(ser,si){
    var gap=6, tw=(bw-gap)/Math.max(1,bars.length);
    ser.values.forEach(function(v,i){
      var x=pl+i*bw+gap/2+si*tw, y0=y(Math.max(0,v)), y1=y(Math.min(0,v));
      s.push('<rect x="'+x.toFixed(1)+'" y="'+y0.toFixed(1)+'" width="'+Math.max(1,tw-1).toFixed(1)+'" height="'+Math.max(0.5,(y1-y0)).toFixed(1)+'" fill="'+ser.color+'" rx="2"><title>'+esc(labels[i])+' · '+esc(ser.name)+': '+fm(v)+'</title></rect>');
    });
  });
  series.filter(function(x){ return x.type==='line'; }).forEach(function(ser){
    var pts=ser.values.map(function(v,i){ return (pl+i*bw+bw/2).toFixed(1)+','+y(v).toFixed(1); }).join(' ');
    s.push('<polyline points="'+pts+'" fill="none" stroke="'+ser.color+'" stroke-width="2.2" stroke-linejoin="round"/>');
    ser.values.forEach(function(v,i){
      s.push('<circle cx="'+(pl+i*bw+bw/2).toFixed(1)+'" cy="'+y(v).toFixed(1)+'" r="3.2" fill="#fff" stroke="'+ser.color+'" stroke-width="2"><title>'+esc(labels[i])+' · '+esc(ser.name)+': '+fm(v)+'</title></circle>');
    });
  });
  labels.forEach(function(l,i){
    if(n>18 && i%2) return;
    s.push('<text x="'+(pl+i*bw+bw/2).toFixed(1)+'" y="'+(h-9)+'" font-size="10.5" fill="#596579" text-anchor="middle">'+esc(l)+'</text>');
  });
  s.push('</svg>');
  return s.join('');
}
function legend(series){
  return '<div class="rx-legend">'+series.map(function(s){
    return '<span><i style="background:'+s.color+'"></i>'+esc(s.name)+'</span>';
  }).join('')+'</div>';
}

/* ====================== 5. INTERFACE ====================== */
var C={acc:'#12307a',acc2:'#3b7de0',pos:'#1f7a45',neg:'#c0342e',warn:'#e2a400',gray:'#b7c2cd'};
var L=ymLabel;
var DATA=null, A=null, VIEW='visao', LOADING=false, ERRO=null;
var CFG=Object.assign({},CFG_DEFAULT);
var OPTS={incluirHistorico:false, storeId:''};
var RAW=null;
var CFG_KEY='onpdv.raiox.cfg';

try{
  var saved=JSON.parse(localStorage.getItem(CFG_KEY)||'null');
  if(saved && typeof saved==='object') CFG=Object.assign({},CFG_DEFAULT,saved);
}catch(e){}
function saveCfg(){ try{ localStorage.setItem(CFG_KEY,JSON.stringify(CFG)); }catch(e){} }

var TITLES={
  visao:['Visão geral','O retrato do período: o que entrou, o que saiu e o que sobrou de verdade.'],
  dre:['DRE gerencial','Demonstrativo de resultado mês a mês, com estimativa de custo da mercadoria vendida.'],
  lojas:['Resultado por loja','Faturamento contra custo de cada unidade, já ajustando a mercadoria transferida.'],
  compras:['Compras e estoque','Por que se compra o mês inteiro e a prateleira continua vazia.'],
  fornec:['Fornecedores','Onde o dinheiro da mercadoria está indo e com quem vale negociar.'],
  pagar:['Contas a pagar','O que vence, quando vence e quanto o caixa aguenta.'],
  atrasos:['Atrasos e juros','Quanto custa pagar depois do vencimento.'],
  diag:['Diagnóstico','Tudo que os números apontam, em ordem de gravidade.'],
  plano:['Plano de ação','O que fazer, nesta ordem, e quanto vale cada medida.'],
  relatorio:['Relatório completo','Documento em 14 capítulos, pronto para imprimir, levar ao contador ou ao banco.'],
  config:['Premissas','Os números que o relatório estima. Ajuste para a realidade da operação.']
};
var TABS=[
  ['visao','📊 Visão geral'],['dre','📄 DRE'],['lojas','🏪 Por loja'],null,
  ['compras','🛒 Compras e estoque'],['fornec','🚚 Fornecedores'],['pagar','🔔 Contas a pagar'],['atrasos','⏰ Atrasos e juros'],null,
  ['diag','⚠️ Diagnóstico'],['plano','✅ Plano de ação'],['relatorio','📑 Relatório completo'],['config','⚙️ Premissas']
];

/* ---------- helpers de render ---------- */
function kpi(lb,vl,hint,cls){
  return '<div class="rx-kpi"><div class="rx-lb">'+lb+'</div><div class="rx-vl rx-num '+(cls||'')+'">'+vl+'</div>'
    +(hint?'<div class="rx-hint">'+hint+'</div>':'')+'</div>';
}
function card(title,sub,body){
  return '<div class="rx-card"><h2>'+title+'</h2>'+(sub?'<p class="rx-sub">'+sub+'</p>':'')+body+'</div>';
}
function tbl(head,rows){
  return '<div class="rx-scroll"><table class="rx-tb"><thead><tr>'
    +head.map(function(h){return '<th>'+h+'</th>';}).join('')
    +'</tr></thead><tbody>'+rows.join('')+'</tbody></table></div>';
}
function barCell(v,max){
  var p=max>0?Math.max(2,Math.min(100,v/max*100)):0;
  return '<div class="rx-bar"><i style="width:'+p.toFixed(1)+'%"></i></div>';
}
function h3(t){ return '<h3 class="rx-h3">'+t+'</h3>'; }
function pp(t){ return '<p class="rx-rp">'+t+'</p>'; }
function callout(t,danger){ return '<div class="rx-callout'+(danger?' rx-danger':'')+'">'+t+'</div>'; }

/* ---------- VISÃO GERAL ---------- */
function vVisao(){
  var d=A.dre, m=A.nMesesRec||1;
  var labels=A.meses.map(L);
  var s1=[{name:'Receita',color:C.acc},{name:'Saídas lançadas',color:C.gray},{name:'Resultado estimado',color:C.neg}];
  var g1=chart({labels:labels,h:250,series:[
    {name:'Receita',color:C.acc,values:A.dreMes.map(function(x){return x.rec;})},
    {name:'Saídas lançadas',color:C.gray,values:A.meses.map(function(k){return A.desp.mes[k]||0;})},
    {name:'Resultado estimado',color:C.neg,type:'line',values:A.dreMes.map(function(x){return x.result;})}
  ]});
  var blocos=sortDesc(A.desp.bloco), maxB=blocos.length?blocos[0].v:0;
  var rowsB=blocos.map(function(o){
    var B=BLOCOS[o.k]||{n:o.k,e:'•'};
    return '<tr><td>'+B.e+' '+esc(B.n)+'</td><td class="rx-num">'+fm(o.v)+'</td><td class="rx-num">'+fm(o.v/m)
      +'</td><td class="rx-num">'+(A.rec.total?pc(o.v/A.rec.total):'—')+'</td><td style="width:130px">'+barCell(o.v,maxB)+'</td></tr>';
  });
  rowsB.push('<tr class="rx-tot"><td>Total de saídas</td><td class="rx-num">'+fm(A.desp.total)+'</td><td class="rx-num">'
    +fm(A.desp.total/m)+'</td><td class="rx-num">'+(A.rec.total?pc(A.desp.total/A.rec.total):'—')+'</td><td></td></tr>');

  return card('🧭 Leitura do período','', '<p style="font-size:14.5px;line-height:1.68;margin:0">'+frase()+'</p>')
    + '<div class="rx-grid rx-g4" style="margin-bottom:16px">'
    + kpi('💰 Receita no período',fm(A.rec.total),fm(A.rec.total/m)+' por mês · '+nf(A.rec.n)+' vendas')
    + kpi('💸 Saídas lançadas',fm(A.desp.total),fm(A.desp.total/m)+' por mês')
    + kpi('📊 Resultado estimado',fm(d.resultado),'depois de taxa de cartão e custo da mercadoria',sgnc(d.resultado))
    + kpi('🧾 Com imposto provisionado',fm(d.resultadoAjust),'faltam '+fm(d.gapImposto)+' de imposto no período',sgnc(d.resultadoAjust))
    + '</div>'
    + '<div class="rx-grid rx-g4" style="margin-bottom:16px">'
    + kpi('📉 Variação de estoque',fm(d.varEstoque),d.varEstoque<0?'vendeu mais do que repôs':'mercadoria acumulando',sgnc(d.varEstoque))
    + kpi('⚖️ Ponto de equilíbrio',d.pontoEquilibrioMes!=null?fm(d.pontoEquilibrioMes):'—','venda mensal necessária · hoje: '+fm(A.rec.total/m),(d.pontoEquilibrioMes!=null&&A.rec.total/m<d.pontoEquilibrioMes)?'rx-neg':'rx-pos')
    + kpi('⏰ Juros por atraso',fm(A.desp.juros),pc(A.atraso.pct)+' das parcelas pagas com atraso','rx-neg')
    + kpi('🔔 Em aberto hoje',fm(A.aberto.total),fm(A.aberto.vencido)+' já vencido',A.aberto.vencido>0?'rx-neg':'')
    + '</div>'
    + cardMedido()
    + card('📈 Receita, saídas e resultado mês a mês','Barras: dinheiro que entrou e que saiu. Linha: resultado depois de estimar taxa de cartão e custo da mercadoria.',g1+legend(s1))
    + card('🧱 Para onde vai cada real','Saídas do período agrupadas por natureza. A coluna % mostra o peso sobre a receita.',
        tbl(['Grupo','No período','Por mês','% da receita',''],rowsB))
    + card('🚨 Os três pontos mais graves','A lista completa está na aba Diagnóstico.',
        A.findings.slice(0,3).map(findCard).join('') || '<p class="rx-rp">Nada crítico no período.</p>');
}
function frase(){
  var d=A.dre, m=A.nMesesRec||1, r=A.rec.total/m, t=[];
  t.push('No período analisado a empresa faturou <b>'+fm(A.rec.total)+'</b> ('+fm(r)+' por mês) e lançou <b>'+fm(A.desp.total)+'</b> de saídas, o que nos lançamentos parece uma sobra de '+fm(d.caixa)+'.');
  t.push('Só que essa sobra não considera três coisas: a taxa da maquininha (estimada em '+fm(d.taxaCartao)+'), o imposto que deixou de ser recolhido ('+fm(d.gapImposto)+') e o fato de a compra de mercadoria do período ter ficado <b>'+fm(Math.abs(d.varEstoque))+' '+(d.varEstoque<0?'abaixo':'acima')+'</b> do que a venda consumiu.');
  if(d.varEstoque<0) t.push('Traduzindo: parte do que foi vendido saiu de estoque que já estava na loja e não foi reposto. Por isso a prateleira esvazia enquanto os boletos continuam chegando — o dinheiro da mercadoria vendida foi usado para pagar folha, aluguel e contas, não para comprar de volta.');
  t.push('Considerando tudo, o resultado real do período é <b class="'+sgnc(d.resultadoAjust)+'">'+fm(d.resultadoAjust)+'</b>, ou '+fm(d.resultadoAjust/m)+' por mês.');
  return t.join(' ');
}

/* Card exclusivo da versão integrada: o que o ONPDV mediu de verdade. */
function cardMedido(){
  var M=A.margemSrc||{}, est=A.estoqueMedido||{}, tx=(A.meta.taxa_cartao)||{};
  var linhas=[];

  linhas.push('<tr><td><b>Margem bruta em uso no relatório</b></td>'
    +'<td class="rx-num"><b>'+pc(A.margem.pct)+'</b></td>'
    +'<td class="rx-num">'+(A.margem.cobertura!=null?pc(A.margem.cobertura)+' da receita conhecida':'—')+'</td>'
    +'<td style="text-align:left;white-space:normal;color:var(--rx-tx2)">'+esc(fonteLabel(A.margem.fonte))
    +(A.margem.medida?'. É este número que define o CMV, o lucro bruto e a variação de estoque.'
                     :'. Nenhuma venda custeada foi encontrada, então o relatório caiu na premissa manual.')
    +'</td></tr>');

  if(M.global) linhas.push('<tr><td>→ medida no conjunto das vendas custeadas</td><td class="rx-num">'
    +pc(M.global.pct)+'</td><td class="rx-num">'+fm(M.global.receita)+'</td>'
    +'<td style="text-align:left;white-space:normal;color:var(--rx-tx2)">Receita com custo conhecido, ponderada pelo que realmente saiu da prateleira. CMV apurado: '+fm(M.global.cmv)+'.</td></tr>');

  if(M.catalogo) linhas.push('<tr><td>→ calculada só pelo cadastro (preço × custo)</td><td class="rx-num">'
    +pc(M.catalogo.pct)+'</td><td class="rx-num">'+nf(M.catalogo.produtos)+' produtos</td>'
    +'<td style="text-align:left;white-space:normal;color:var(--rx-tx2)">Não é ponderada por venda: um item caro que quase não gira pesa igual à ração do dia a dia. Serve de referência, não de base.</td></tr>');

  linhas.push('<tr><td>Estoque a custo, hoje</td><td class="rx-num">'+fm(est.total||0)+'</td><td class="rx-num">'
    +nf(est.unidades||0)+' un.</td><td style="text-align:left;white-space:normal;color:var(--rx-tx2)">'
    +(est.meses!=null? 'Equivale a '+est.meses.toFixed(1).replace('.',',')+' meses do consumo do período. Vem do saldo por loja × custo cadastrado.' : 'Depende do custo cadastrado nos produtos.')
    +'</td></tr>');

  linhas.push('<tr><td>Taxa real da maquininha (Mercado Pago)</td><td class="rx-num">'
    +(tx.credito!=null?pc(tx.credito/100,2):'—')+'</td><td class="rx-num">'+(tx.debito!=null?pc(tx.debito/100,2):'—')
    +'</td><td style="text-align:left;white-space:normal;color:var(--rx-tx2)">'
    +(tx.amostras? nf(tx.amostras)+' liquidações conciliadas. Crédito · débito.' : 'Sem liquidações conciliadas ainda.')+'</td></tr>');

  var pSem=(M.catalogo&&M.catalogo.semCusto)||0;
  if(pSem) linhas.push('<tr><td>Produtos ativos sem custo cadastrado</td><td class="rx-num rx-neg">'+nf(pSem)
    +'</td><td class="rx-num">—</td><td style="text-align:left;white-space:normal;color:var(--rx-tx2)">Ficam de fora da medição de margem. Cada um que entra deixa o CMV mais exato.</td></tr>');

  var rodape = Object.keys(A.margem.fontes||{}).length>1
    ? '<p class="rx-note">Neste período o relatório usou mais de uma fonte de margem, conforme o mês. A abertura mês a mês está na aba DRE.</p>' : '';

  return card('🔬 Margem e demais números medidos pelo sistema',
    'Nada aqui é digitado: sai das vendas, do cadastro de produtos e da conciliação de cartão do próprio ONPDV.',
    tbl(['Indicador','Valor','Base','Leitura'],linhas)+rodape);
}

/* marca discreta da fonte da margem, para a coluna nao ficar ambigua */
function FONTE_MARCA(f){
  return f==='vendas' ? '<sup title="medida item a item">*</sup>'
       : f==='historico' ? '<sup title="medida pelo giro x custo">*</sup>'
       : f==='manual' ? '<sup title="informada manualmente">m</sup>' : '';
}
function margemNota(){
  var f=A.margem.fontes||{}, ks=Object.keys(f);
  if(!ks.length) return '';
  if(ks.length===1) return 'Margem ' + fonteLabel(ks[0]) + ' em todo o período.';
  return 'O período combina mais de uma fonte de margem: ' + ks.map(fonteLabel).join('; ') + '.';
}

/* ---------- DRE ---------- */
function vDre(){
  var d=A.dre, m=A.nMesesRec||1, R=A.rec.total;
  var mensal=A.dreMes.map(function(x){
    return '<tr><td>'+L(x.k)+'</td><td class="rx-num">'+fm(x.rec)+'</td><td class="rx-num">'+fm(x.compras)
      +'</td><td class="rx-num" title="'+esc(fonteLabel(x.margFonte))+'">'+pc(x.marg)+FONTE_MARCA(x.margFonte)
      +'</td><td class="rx-num">'+fm(x.cmv)+'</td><td class="rx-num">'+fm(x.folha)+'</td><td class="rx-num">'+fm(x.ocup)
      +'</td><td class="rx-num">'+fm(x.oper-x.folha-x.ocup)+'</td><td class="rx-num '+sgnc(x.result)+'">'+fm(x.result)
      +'</td><td class="rx-num '+sgnc(x.varEst)+'">'+fm(x.varEst)+'</td></tr>';
  });
  mensal.push('<tr class="rx-tot"><td>Total</td><td class="rx-num">'+fm(R)+'</td><td class="rx-num">'+fm(d.compras)
    +'</td><td class="rx-num">'+pc(A.margem.pct)+'</td>'
    +'<td class="rx-num">'+fm(d.cmv)+'</td><td class="rx-num">'+fm(d.folha)+'</td><td class="rx-num">'+fm(d.ocupacao)
    +'</td><td class="rx-num">'+fm(d.adm+d.financ+d.imposto+d.socios+d.outros)+'</td><td class="rx-num '+sgnc(d.resultado)+'">'
    +fm(d.resultado)+'</td><td class="rx-num '+sgnc(d.varEstoque)+'">'+fm(d.varEstoque)+'</td></tr>');

  var g=chart({labels:A.meses.map(L),h:230,series:[
    {name:'Lucro bruto estimado',color:C.acc,values:A.dreMes.map(function(x){return x.rec-x.taxa-x.cmv;})},
    {name:'Despesas operacionais',color:C.gray,values:A.dreMes.map(function(x){return x.oper;})},
    {name:'Resultado',color:C.neg,type:'line',values:A.dreMes.map(function(x){return x.result;})}
  ]});
  var cats=sortDesc(A.desp.cat).slice(0,25), maxC=cats.length?cats[0].v:0;
  var rowsCat=cats.map(function(o){
    var B=BLOCOS[A.desp.catBloco[o.k]]||{n:'',e:'•'};
    return '<tr><td>'+esc(o.k)+' <span class="rx-pill rx-a">'+B.e+' '+esc(String(B.n).split(' ')[0])+'</span></td>'
      +'<td class="rx-num">'+fm(o.v)+'</td><td class="rx-num">'+fm(o.v/m)+'</td><td class="rx-num">'
      +(R?pc(o.v/R):'—')+'</td><td style="width:120px">'+barCell(o.v,maxC)+'</td></tr>';
  });

  return card('📄 DRE do período','Regime de competência pela data de vencimento. O custo da mercadoria usa a margem '+(A.margem.medida?'medida pelo próprio sistema':'informada em Premissas')+', aplicada mês a mês.',
      vDreTabela()
      +'<p class="rx-note">O ponto de equilíbrio é '+(d.pontoEquilibrioMes!=null?'<b>'+fm(d.pontoEquilibrioMes)+' por mês</b>':'—')
      +': abaixo disso a operação não cobre os custos fixos. A média atual é '+fm(R/m)+'.</p>')
    + card('📅 Mês a mês','Compare a coluna Compras com CMV: quando compras ficam abaixo do CMV, o estoque encolheu naquele mês. A coluna Margem mostra o percentual que o sistema mediu para aquele mês.',
      tbl(['Mês','Receita','Compras','Margem','CMV','Pessoal','Fixos','Demais','Resultado','Δ Estoque'],mensal)+g
      + '<p class="rx-note">'+esc(margemNota())+'</p>')
    + card('🔎 Maiores despesas por categoria','As 25 categorias que mais consomem caixa.',
      tbl(['Categoria','No período','Por mês','% da receita',''],rowsCat));
}
function vDreTabela(){
  var d=A.dre, m=A.nMesesRec||1, R=A.rec.total;
  function ln(lb,v,cls,ind){
    return '<tr class="'+(cls||'')+'"><td'+(ind?' style="padding-left:26px"':'')+'>'+lb+'</td>'
      +'<td class="rx-num">'+fm(v)+'</td><td class="rx-num">'+fm(v/m)+'</td><td class="rx-num">'+(R?pc(v/R):'—')+'</td></tr>';
  }
  return tbl(['Linha','No período','Por mês','% da receita'],[
    ln('Receita bruta de vendas',R,'rx-tot'),
    ln('(−) Taxa de cartão (estimada)',-d.taxaCartao,'rx-sub2',1),
    ln('(=) Receita líquida de taxas',d.liquida,'rx-tot'),
    ln('(−) Custo da mercadoria vendida ('+pc(1-A.margem.pct,0)+' da venda, margem '+(A.margem.medida?'medida pelo sistema':'informada')+')',-d.cmv,'rx-sub2',1),
    ln('(=) Lucro bruto',d.lucroBruto,'rx-tot'),
    ln('(−) Pessoal: salários, encargos, férias, rescisões',-d.folha,'rx-sub2',1),
    ln('(−) Custos fixos: aluguel, energia, água, contador…',-d.ocupacao,'rx-sub2',1),
    ln('(−) Administrativas',-d.adm,'rx-sub2',1),
    ln('(−) Financeiras e empréstimos',-d.financ,'rx-sub2',1),
    ln('(−) Impostos efetivamente pagos',-d.imposto,'rx-sub2',1),
    ln('(−) Sócios: retiradas e despesas pessoais',-d.socios,'rx-sub2',1),
    ln('(−) Outros',-d.outros,'rx-sub2',1),
    ln('(=) Resultado operacional estimado',d.resultado,'rx-tot'),
    ln('(−) Provisão do imposto não recolhido',-d.gapImposto,'rx-sub2',1),
    ln('(=) Resultado ajustado',d.resultadoAjust,'rx-tot')
  ]);
}
function vDreMensal(){
  var d=A.dre;
  var rows=A.dreMes.map(function(x){
    return '<tr><td>'+L(x.k)+'</td><td class="rx-num">'+fm(x.rec)+'</td><td class="rx-num">'+fm(x.compras)
      +'</td><td class="rx-num">'+fm(x.cmv)+'</td><td class="rx-num">'+fm(x.folha)+'</td><td class="rx-num">'+fm(x.ocup)
      +'</td><td class="rx-num">'+fm(x.oper-x.folha-x.ocup)+'</td><td class="rx-num '+sgnc(x.result)+'">'+fm(x.result)+'</td></tr>';
  });
  rows.push('<tr class="rx-tot"><td>Total</td><td class="rx-num">'+fm(A.rec.total)+'</td><td class="rx-num">'+fm(d.compras)
    +'</td><td class="rx-num">'+fm(d.cmv)+'</td><td class="rx-num">'+fm(d.folha)+'</td><td class="rx-num">'+fm(d.ocupacao)
    +'</td><td class="rx-num">'+fm(d.adm+d.financ+d.imposto+d.socios+d.outros)+'</td><td class="rx-num '+sgnc(d.resultado)+'">'
    +fm(d.resultado)+'</td></tr>');
  return tbl(['Mês','Receita','Compras','CMV est.','Pessoal','Fixos','Demais','Resultado'],rows);
}

/* ---------- LOJAS ---------- */
function vLojas(){
  var m=A.nMesesRec||1;
  var rows=A.lojas.map(function(l){
    return '<tr><td><b>'+esc(l.loja)+'</b>'+(l.hub?' <span class="rx-pill rx-w">compra para as outras</span>':'')+'</td>'
      +'<td class="rx-num">'+fm(l.rec)+'</td><td class="rx-num">'+fm(l.rec/m)+'</td>'
      +'<td class="rx-num">'+fm(l.dir)+'</td><td class="rx-num">'+(l.transf?fm(l.transf):'—')+'</td>'
      +'<td class="rx-num">'+(l.aj?fm(l.aj):'—')+'</td><td class="rx-num">'+fm(l.custo)+'</td>'
      +'<td class="rx-num '+sgnc(l.result)+'">'+fm(l.result)+'</td>'
      +'<td class="rx-num '+sgnc(l.result)+'">'+(l.marg!=null?pc(l.marg):'—')+'</td></tr>';
  });
  var tr=A.lojas.reduce(function(s,l){return s+l.rec;},0), tc=A.lojas.reduce(function(s,l){return s+l.custo;},0);
  rows.push('<tr class="rx-tot"><td>Total</td><td class="rx-num">'+fm(tr)+'</td><td class="rx-num">'+fm(tr/m)
    +'</td><td colspan="3"></td><td class="rx-num">'+fm(tc)+'</td><td class="rx-num '+sgnc(tr-tc)+'">'+fm(tr-tc)
    +'</td><td class="rx-num">'+(tr?pc((tr-tc)/tr):'—')+'</td></tr>');

  var cores=[C.acc,C.acc2,C.warn,C.gray,C.pos];
  var series=A.lojas.filter(function(l){return l.rec>0;}).map(function(l,i){
    return {name:l.loja,color:cores[i%cores.length],values:A.meses.map(function(k){return (A.rec.lojaMes[l.loja]||{})[k]||0;})};
  });
  var g=series.length? chart({labels:A.meses.map(L),h:240,series:series})+legend(series) : '<p class="rx-rp">Sem receita por loja no período.</p>';

  var est=(A.estoqueMedido.lojas||[]);
  var estRows=est.map(function(o){
    return '<tr><td>'+esc(o.loja)+'</td><td class="rx-num">'+fm(o.valor)+'</td><td class="rx-num">'+nf(o.unidades)+'</td></tr>';
  });

  return card('🏪 Resultado por loja',
      'Como ler: <b>Custo direto</b> é o que foi lançado na conta daquela loja. <b>Mercadoria recebida</b> é o que ela pegou da loja central. <b>Ajuste</b> retira da loja central a mercadoria que ela comprou para as outras, para não contar duas vezes.',
      tbl(['Loja','Receita','Receita/mês','Custo direto','Mercadoria recebida','Ajuste','Custo total','Resultado','Margem'],rows)
      +'<p class="rx-note">A loja marcada como central concentra a folha administrativa e as compras de toda a rede. Antes de decidir qualquer coisa sobre ela, separe o que é custo dela do que é custo da empresa inteira: parte desse valor deveria ser rateada para as outras unidades.</p>')
    + card('📈 Faturamento mensal por loja','',g)
    + (estRows.length? card('📦 Estoque a custo por loja (medido agora)','Saldo de estoque × custo cadastrado, na data de hoje.',
        tbl(['Loja','Valor a custo','Unidades'],estRows)) : '');
}

/* Cenarios de margem: a medida pelo sistema entra na lista e fica destacada;
   as demais mostram como a conclusao mudaria se a margem real fosse outra. */
function cenariosMargem(){
  var real=+(A.margem.pct*100).toFixed(1);
  var lista=[22,26,30,32,35,38,42].filter(function(v){ return Math.abs(v-real)>0.6; }).concat([real]);
  lista.sort(function(a,b){ return a-b; });
  return {lista:lista, real:real};
}

/* ---------- COMPRAS ---------- */
function vCompras(){
  var d=A.dre, m=A.nMesesRec||1;
  var s=[{name:'Compras',color:C.acc},{name:'CMV estimado',color:C.warn},{name:'Variação de estoque',color:C.neg}];
  var g=chart({labels:A.meses.map(L),h:250,series:[
    {name:'Compras de mercadoria',color:C.acc,values:A.dreMes.map(function(x){return x.compras;})},
    {name:'CMV estimado',color:C.warn,values:A.dreMes.map(function(x){return x.cmv;})},
    {name:'Variação de estoque',color:C.neg,type:'line',values:A.dreMes.map(function(x){return x.varEst;})}
  ]});
  var rows=A.dreMes.map(function(x){
    return '<tr><td>'+L(x.k)+'</td><td class="rx-num">'+fm(x.rec)+'</td><td class="rx-num">'+fm(x.compras)
      +'</td><td class="rx-num">'+(x.rec?pc(x.compras/x.rec):'—')+'</td><td class="rx-num">'+fm(x.cmv)
      +'</td><td class="rx-num '+sgnc(x.varEst)+'">'+fm(x.varEst)+'</td></tr>';
  });
  rows.push('<tr class="rx-tot"><td>Total</td><td class="rx-num">'+fm(A.rec.total)+'</td><td class="rx-num">'+fm(d.compras)
    +'</td><td class="rx-num">'+(A.rec.total?pc(d.compras/A.rec.total):'—')+'</td><td class="rx-num">'+fm(d.cmv)
    +'</td><td class="rx-num '+sgnc(d.varEstoque)+'">'+fm(d.varEstoque)+'</td></tr>');

  var cn=cenariosMargem();
  var sim=cn.lista.map(function(mg){
    var cmv=A.rec.total*(1-mg/100), ve=d.compras-cmv, eh=(mg===cn.real);
    return '<tr'+(eh?' style="background:var(--rx-accsoft);font-weight:700"':'')+'><td>'
      +mg.toFixed(1).replace('.',',')+'%'+(eh?' <span class="rx-pill rx-a">medida pelo sistema</span>':'')+'</td>'
      +'<td class="rx-num">'+fm(cmv)+'</td><td class="rx-num '+sgnc(ve)+'">'+fm(ve)+'</td><td>'
      +(ve<0?'estoque encolheu':'estoque cresceu')+'</td></tr>';
  });

  var est=A.estoqueMedido;
  var conf = est.total>0 ? card('🔍 Conferência com o estoque real do sistema',
      'Aqui o ONPDV faz o que a planilha não fazia: compara a variação inferida com o estoque que existe de fato.',
      '<div class="rx-grid rx-g3">'
      + kpi('📦 Estoque a custo hoje',fm(est.total),nf(est.unidades)+' unidades no saldo por loja')
      + kpi('🔄 Cobertura',est.meses!=null?est.meses.toFixed(1).replace('.',',')+' meses':'—','de consumo estimado (CMV)')
      + kpi('📉 Variação inferida no período',fm(d.varEstoque),'compras menos CMV estimado',sgnc(d.varEstoque))
      + '</div>'
      + '<p class="rx-note">Se a variação inferida for muito negativa e o estoque atual ainda for alto, o problema não é reposição: é margem mal estimada, perda ou registro. Rode o inventário rotativo e feche essa conta.</p>') : '';

  return card('🛒 A conta que explica a prateleira vazia',
      'Vendeu-se '+fm(A.rec.total)+'. Com margem bruta de '+pc(A.margem.pct,0)+' ('+fonteLabel(A.margem.fonte)+'), isso consumiu cerca de '+fm(d.cmv)+' de mercadoria a preço de custo. Foram comprados '+fm(d.compras)+'.',
      '<div class="rx-grid rx-g3">'
      + kpi('🛒 Compras no período',fm(d.compras),fm(d.compras/m)+' por mês · '+pc(d.compras/Math.max(1,A.rec.total))+' da receita')
      + kpi('📤 Consumo de mercadoria (CMV)',fm(d.cmv),'a preço de custo, pela margem '+(A.margem.medida?'medida':'informada'))
      + kpi(d.varEstoque<0?'📉 Estoque consumido':'📦 Estoque acumulado',fm(Math.abs(d.varEstoque)),
            d.varEstoque<0?'saiu da prateleira e não voltou':'dinheiro parado em mercadoria',sgnc(d.varEstoque))
      + '</div>'
      + '<p class="rx-note" style="font-size:13px;color:var(--rx-tx2)">'+(d.varEstoque<0
        ? 'A diferença de <b>'+fm(Math.abs(d.varEstoque))+'</b> em '+m+' meses ('+fm(Math.abs(d.varEstoque)/m)+' por mês) é exatamente a sensação de comprar todo dia, ver boleto todo dia e mesmo assim faltar produto. O caixa da venda está cobrindo folha e conta fixa antes de repor a mercadoria, então a reposição vem sempre menor que a saída. Cada mês que isso se repete, a prateleira fica um pouco mais vazia — e prateleira vazia derruba a venda do mês seguinte, o que aperta o caixa de novo.'
        : 'As compras estão acima do consumo. Isso prende caixa: o boleto vence antes de o produto girar.')+'</p>')
    + conf
    + card('📊 Compras contra consumo, mês a mês','Quando a barra azul fica menor que a laranja, o estoque encolheu naquele mês.',
      g+legend(s)+tbl(['Mês','Receita','Compras','Compras / receita','CMV estimado','Δ Estoque'],rows))
    + card('🧮 E se a margem for outra?','A conta acima depende da margem real. Veja o resultado em cada cenário.',
      tbl(['Margem bruta','CMV no período','Δ Estoque','Leitura'],sim));
}

/* ---------- FORNECEDORES ---------- */
function vFornec(){
  var m=A.nMesesRec||1, tot=A.dre.compras, max=A.fornec.length?A.fornec[0].val:0, acc=0;
  var rows=A.fornec.slice(0,60).map(function(o,i){
    acc+=o.val;
    return '<tr><td>'+(i+1)+'. '+esc(o.forn)+'</td><td class="rx-num">'+fm(o.val)+'</td><td class="rx-num">'
      +pc(o.val/Math.max(1,tot))+'</td><td class="rx-num">'+pc(acc/Math.max(1,tot))+'</td><td class="rx-num">'+o.n
      +'</td><td class="rx-num">'+fm(o.ticket)+'</td><td class="rx-num '+(o.juros?'rx-neg':'')+'">'
      +(o.juros?fm2(o.juros):'—')+'</td><td style="width:110px">'+barCell(o.val,max)+'</td></tr>';
  });
  return card('🚚 Onde o dinheiro da mercadoria vai','',
      '<div class="rx-grid rx-g4">'
      + kpi('🚚 Fornecedores ativos',String(A.nFornec),'no período')
      + kpi('🧾 Parcelas de compra',nf(A.nNotas),Math.round(A.nNotas/m)+' por mês · '+Math.round(A.nNotas/m/22)+' por dia útil')
      + kpi('🎟️ Ticket médio por parcela',fm(tot/Math.max(1,A.nNotas)),'quanto menor, mais picada é a compra')
      + kpi('🥇 Concentração nos 3 maiores',pc(A.top3/Math.max(1,tot)),'do total comprado')
      + '</div>')
    + card('📋 Ranking de fornecedores','Coluna acumulado: onde estão os 80% que valem negociação de tabela.',
      tbl(['Fornecedor','Comprado','% do total','Acumulado','Parcelas','Ticket médio','Juros pagos',''],rows));
}

/* ---------- CONTAS A PAGAR ---------- */
function vPagar(){
  var f=A.aberto.faixas, maxF=Math.max.apply(null,f.map(function(x){return x.v;}).concat([1]));
  var rowsF=f.map(function(x){
    var venc=x.l.indexOf('Vencido')===0;
    return '<tr><td>'+(venc?'🔴 ':'🕒 ')+esc(x.l)+'</td><td class="rx-num">'+x.n+'</td><td class="rx-num '
      +(venc?'rx-neg':'')+'">'+fm(x.v)+'</td><td style="width:150px">'+barCell(x.v,maxF)+'</td></tr>';
  });
  var itens=A.aberto.itens.slice(0,200).map(function(i){
    var st=i.dd<0?'<span class="rx-pill rx-n">vencido há '+(-i.dd)+'d</span>'
         :i.dd===0?'<span class="rx-pill rx-w">vence hoje</span>'
         :'<span class="rx-pill rx-a">em '+i.dd+'d</span>';
    var B=BLOCOS[i.bl]||{e:'•',n:''};
    return '<tr><td>'+esc(i.forn)+'</td><td>'+i.venc.toLocaleDateString('pt-BR')+'</td><td class="rx-num">'+fm2(i.val)
      +'</td><td>'+st+'</td><td>'+esc(i.conta)+'</td><td>'+B.e+'</td></tr>';
  });
  var porMes=sortDesc(A.aberto.mes).sort(function(a,b){ return a.k<b.k?-1:1; });
  var g=porMes.length? chart({labels:porMes.map(function(o){return L(o.k);}),h:200,series:[
    {name:'A pagar por mês de vencimento',color:C.warn,values:porMes.map(function(o){return o.v;})}]}) : '';
  var receitaMes=A.rec.total/Math.max(1,A.nMesesRec);
  var cob=receitaMes? A.aberto.total/receitaMes : 0;

  return card('🔔 Situação agora','Fotografia de tudo que está em aberto no sistema, na data de hoje.',
      '<div class="rx-grid rx-g4">'
      + kpi('📦 Total em aberto',fm(A.aberto.total),cob.toFixed(1).replace('.',',')+' meses de faturamento')
      + kpi('🔴 Já vencido',fm(A.aberto.vencido),'precisa de decisão hoje',A.aberto.vencido>0?'rx-neg':'')
      + kpi('🕒 A vencer',fm(A.aberto.aVencer),'ainda dá para planejar')
      + kpi('💵 Entrada média por dia',fm(A.caixaDia),'contra '+fm(A.saidaDia)+' de saída média',A.caixaDia<A.saidaDia?'rx-neg':'rx-pos')
      + '</div>'
      + '<p class="rx-note">É aqui que mora a sensação de "os boletos ainda nem venceram e já não tem dinheiro". Entra '+fm(A.caixaDia)+' por dia e sai '+fm(A.saidaDia)+' por dia. Quando a saída média encosta na entrada média, o caixa vira uma corrida: qualquer boleto que chegue antes da venda do dia já falta dinheiro, mesmo que no fechamento do mês as contas quase batam.</p>')
    + card('📅 Distribuição por prazo','',tbl(['Faixa','Parcelas','Valor',''],rowsF))
    + (g? card('📊 A pagar por mês de vencimento','',g) : '')
    + card('📋 Próximos vencimentos','Ordenado do mais antigo para o mais distante. Até 200 itens.',
      tbl(['Fornecedor','Vencimento','Valor','Situação','Loja',''],itens));
}

/* ---------- ATRASOS ---------- */
function vAtrasos(){
  var a=A.atraso, max=Math.max.apply(null,a.faixas.map(function(x){return x.v;}).concat([1]));
  var rows=a.faixas.map(function(x){
    return '<tr><td>'+esc(x.l)+'</td><td class="rx-num">'+x.n+'</td><td class="rx-num">'+(a.n?pc(x.n/a.n):'—')
      +'</td><td class="rx-num">'+fm(x.v)+'</td><td style="width:150px">'+barCell(x.v,max)+'</td></tr>';
  });
  var jf=sortDesc(A.desp.jurosForn).slice(0,25), maxJ=jf.length?jf[0].v:1;
  var rowsJ=jf.map(function(o,i){
    var f=A.fornec.filter(function(x){return x.forn===o.k;})[0];
    return '<tr><td>'+(i+1)+'. '+esc(o.k)+'</td><td class="rx-num rx-neg">'+fm2(o.v)+'</td><td class="rx-num">'
      +(f?fm(f.val):'—')+'</td><td class="rx-num">'+(f&&f.val?pc(o.v/f.val):'—')+'</td><td style="width:120px">'
      +barCell(o.v,maxJ)+'</td></tr>';
  });
  var g=chart({labels:A.meses.map(L),h:200,series:[
    {name:'Juros e multa pagos',color:C.neg,values:A.meses.map(function(k){return A.desp.jurosMes[k]||0;})}]});
  var m=A.nMesesRec||1;
  return card('⏰ O custo do atraso','Comparação entre a data de vencimento e a data em que a parcela foi efetivamente paga.',
      '<div class="rx-grid rx-g4">'
      + kpi('📉 Parcelas pagas com atraso',pc(a.pct),a.nAtr+' de '+a.n+' parcelas','rx-neg')
      + kpi('📆 Atraso médio',a.medDias.toFixed(1).replace('.',',')+' dias','pior caso: '+a.maxDias+' dias')
      + kpi('💸 Juros e multa',fm(A.desp.juros),fm(A.desp.juros/m)+' por mês','rx-neg')
      + kpi('🔥 Peso sobre as compras',pc(A.desp.juros/Math.max(1,A.dre.compras)),'é desconto que você dá e não recebe','rx-neg')
      + '</div>'
      + '<p class="rx-note">Atraso médio de '+a.medDias.toFixed(1).replace('.',',')+' dias quase nunca significa falta de dinheiro no mês. Significa que o boleto vence num dia em que o caixa está baixo. Concentrar vencimentos logo depois dos picos de venda resolve boa parte disso sem custo nenhum.</p>')
    + card('📊 Faixas de atraso','',tbl(['Faixa','Parcelas','% das parcelas','Valor',''],rows))
    + card('📈 Juros pagos mês a mês','',g)
    + card('🥇 Onde os juros são pagos','Comece a negociação por estes. Um ou dois fornecedores costumam explicar metade do valor.',
      tbl(['Fornecedor','Juros pagos','Comprado no período','Juros / compras',''],rowsJ));
}

/* ---------- DIAGNÓSTICO ---------- */
function findCard(f){
  var sev={c:'Crítico',a:'Atenção',b:'Observação'}[f.sev];
  return '<div class="rx-find rx-'+f.sev+'"><h3><span class="rx-sev">'+sev+'</span> '+f.ico+' '+esc(f.tit)
    +' <span class="rx-money">'+esc(f.val)+'</span></h3><p>'+f.txt+'</p>'
    +(f.acao?'<div class="rx-do"><b>O que fazer:</b> '+f.acao+'</div>':'')+'</div>';
}
function vDiag(){
  var c=A.findings.filter(function(f){return f.sev==='c';});
  var a=A.findings.filter(function(f){return f.sev==='a';});
  var b=A.findings.filter(function(f){return f.sev==='b';});
  var out='';
  if(c.length) out+=card('🔴 Crítico — mexe no resultado agora','',c.map(findCard).join(''));
  if(a.length) out+=card('🟡 Atenção — corrige nos próximos 90 dias','',a.map(findCard).join(''));
  if(b.length) out+=card('🔵 Observação — bom saber','',b.map(findCard).join(''));
  return out || card('✅ Nada crítico encontrado','','<p class="rx-rp">Com as premissas atuais, o relatório não encontrou problemas graves no período.</p>');
}

/* ---------- PLANO ---------- */
function vPlano(){ return card('✅ Plano de ação','Em ordem. Nada aqui depende de vender mais — depende de parar de perder.', vPlanoCorpo()); }
function vPlanoCorpo(){
  var d=A.dre, m=A.nMesesRec||1, R=A.rec.total, rMes=R/m, acoes=[];
  function ac(pz,tit,txt,val,como){ acoes.push({pz:pz,tit:tit,txt:txt,val:val,como:como}); }

  if(d.gapImposto>0) ac('Esta semana','Descobrir o tamanho da dívida fiscal',
    'Peça ao contador o relatório de DAS em aberto e a situação no e-CAC. Enquanto esse número não estiver na mesa, todo cálculo de lucro aqui está otimista.',
    0,'Ter o valor exato do débito e a simulação de parcelamento em mãos.');

  ac('Esta semana','Inventário nas lojas',
    'Conte o estoque pelo Inventário rotativo do ONPDV. O relatório estima que ele variou '+fm(d.varEstoque)+' no período'
    +(A.estoqueMedido.total>0? ' e o sistema registra hoje '+fm(A.estoqueMedido.total)+' a custo' : '')
    +'. Se o inventário confirmar a queda, é reposição insuficiente. Se não confirmar, existe perda, quebra ou venda sem registro.',
    0,'Valor de estoque a preço de custo, por loja, numa data única.');

  ac('Esta semana','Cadastrar o custo dos produtos que faltam',
    'Cada produto sem custo obriga este relatório a estimar a margem em vez de medir. Com o custo cadastrado, o CMV deixa de ser premissa e vira número.'
    +((A.meta.contagem||{}).produtos_sem_custo? ' Faltam '+nf(A.meta.contagem.produtos_sem_custo)+' produtos ativos.' : ''),
    rMes*0.01,'Nenhum produto ativo sem custo em Produtos e estoque.');

  if(A.desp.juros>0) ac('Este mês','Renegociar data de vencimento com os maiores fornecedores',
    'Paga-se '+fm(A.desp.juros/m)+' por mês de juros e '+pc(A.atraso.pct)+' das parcelas saem atrasadas, em média '+A.atraso.medDias.toFixed(1).replace('.',',')+' dias. Peça vencimento no dia 10 e no dia 25. Não custa nada e elimina a maior parte do juro.',
    A.desp.juros/m,'Juros pagos no mês seguinte, na aba Atrasos e juros.');

  if(A.nNotas/m>40) ac('Este mês','Fechar dois dias de compra por semana',
    'São '+Math.round(A.nNotas/m)+' parcelas de compra por mês com ticket médio de '+fm(d.compras/Math.max(1,A.nNotas))+'. Juntar pedidos reduz frete, melhora tabela e acaba com a sensação de boleto diário.',
    d.compras/m*0.02,'Número de parcelas por mês e ticket médio.');

  if(R>0 && d.folha/R>0.13) ac('Este mês','Medir venda por pessoa em cada loja',
    'A folha é '+pc(d.folha/R)+' da receita ('+fm(d.folha/m)+' por mês). O saudável no varejo pet fica entre 8% e 12%. Antes de decidir qualquer coisa, monte a conta: faturamento da loja dividido pelo número de pessoas.',
    (d.folha/R-0.12)*rMes,'Receita por funcionário e por loja, mês a mês.');

  if(A.mix.cart>0) ac('Este mês','Separar crédito de débito no fechamento do caixa',
    fm(A.mix.cart)+' de venda foram registrados apenas como "cartão". Sem distinguir, a taxa da maquininha entra pela média e o custo real do recebimento fica escondido.',
    0,'Zero vendas com forma de pagamento genérica no próximo fechamento.');

  ac('Próximos 90 dias','Nunca deixar faltar os campeões de giro',
    'Ruptura no item que mais vende custa mais caro que excesso no item lento: o cliente que não acha a ração dele compra no concorrente e às vezes não volta. Defina estoque mínimo dos 50 itens de maior giro e compre esses primeiro.',
    rMes*0.03,'Número de dias no mês em que um item da lista dos 50 ficou zerado.');

  if(d.socios>0) ac('Próximos 90 dias','Separar sócio de empresa',
    'Foram '+fm(d.socios)+' em retiradas e despesas pessoais no período. Defina um pró-labore fixo com data. Sem isso é impossível saber se a loja se paga.',
    0,'Uma única linha de pró-labore por mês, nada de despesa pessoal diluída.');

  if(A.lojas.filter(function(l){return l.rec>0 && l.result<0;}).length) ac('Próximos 90 dias','Fechar a conta de cada loja separadamente',
    'Hoje a loja central carrega o custo administrativo de toda a rede, o que distorce a comparação. Rateie folha administrativa, entrega e compras por faturamento e refaça a conta.',
    0,'Resultado por loja com rateio, revisado todo mês.');

  var totalImpacto=acoes.reduce(function(s,a){return s+a.val;},0);
  var rows=acoes.map(function(a,i){
    return '<tr><td><b>'+(i+1)+'. '+esc(a.tit)+'</b><div style="color:var(--rx-tx2);font-size:12.5px;margin-top:3px;white-space:normal">'
      +a.txt+'</div></td><td>'+esc(a.pz)+'</td><td class="rx-num">'+(a.val>0?fm(a.val):'—')
      +'</td><td style="white-space:normal;color:var(--rx-tx2)">'+esc(a.como)+'</td></tr>';
  });

  return '<div class="rx-grid rx-g3">'
    + kpi('🎯 Ganho estimado somado',fm(totalImpacto)+'/mês','só das medidas com valor calculável','rx-pos')
    + kpi('📉 Resultado hoje',fm(d.resultadoAjust/m)+'/mês','com imposto provisionado',sgnc(d.resultadoAjust))
    + kpi('📈 Resultado possível',fm(d.resultadoAjust/m+totalImpacto)+'/mês','sem aumentar uma venda sequer',sgnc(d.resultadoAjust/m+totalImpacto))
    + '</div>'
    + tbl(['Ação','Prazo','Impacto/mês','Como medir'],rows)
    + '<p class="rx-note">Os valores são estimativas do relatório a partir das premissas atuais, não promessas. Servem para ordenar prioridade: comece pelo que vale mais e custa menos para fazer.</p>';
}

/* ---------- PREMISSAS ---------- */
function vConfig(){
  var M=(A&&A.margemSrc)||{}, tx=(A&&A.meta.taxa_cartao)||{};
  function row(id,lb,sub,val,suf,medido){
    return '<div class="rx-cfgrow"><div><b>'+lb+'</b><small>'+sub+'</small></div>'
      +'<div style="white-space:nowrap"><input type="number" step="0.1" id="rxcfg_'+id+'" value="'+val+'"> '+suf
      +(medido!=null? ' <button type="button" class="rx-med" data-usar="'+id+'" data-val="'+medido+'">usar medido: '+medido.toFixed(1).replace('.',',')+suf+'</button>':'')
      +'</div></div>';
  }
  return cardMargemConfig()
    + card('⚙️ Demais premissas',
      'A margem vem do sistema (acima). Estes quatro números ainda não existem no banco e precisam vir de você ou do contador. Mudar qualquer um recalcula o relatório inteiro.',
      row('txCred','Taxa da maquininha — crédito','Vem do extrato da adquirente. A conciliação do Mercado Pago já calcula a taxa efetiva quando há liquidações importadas.',CFG.txCred,'%',tx.credito!=null?+tx.credito:null)
    + row('txDeb','Taxa da maquininha — débito','',CFG.txDeb,'%',tx.debito!=null?+tx.debito:null)
    + row('aliq','Alíquota efetiva de imposto sobre venda','Simples Nacional, comércio. Peça o percentual efetivo ao contador; costuma ficar entre 4% e 11% conforme o faturamento dos últimos 12 meses.',CFG.aliq,'%',null)
    + row('prazoCred','Prazo de recebimento do crédito','Dias até o dinheiro do cartão de crédito cair na conta.',CFG.prazoCred,'dias',null)
    + '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">'
      +'<button class="btn sm" id="rxCfgApply" type="button">Recalcular</button> '
      +'<button class="btn ghost sm" id="rxCfgReset" type="button">Voltar ao padrão</button></div>')
  + card('📚 De onde vem cada número','Rastreabilidade completa: nenhuma linha deste relatório sai do nada.',
      tbl(['Informação','Origem no ONPDV'],[
        '<tr><td>Receita, ticket médio e forma de pagamento</td><td style="text-align:left;white-space:normal;color:var(--rx-tx2)">Vendas do PDV (exceto canceladas e orçamentos), agrupadas por dia, loja e forma de pagamento</td></tr>',
        '<tr><td>Despesas por natureza</td><td style="text-align:left;white-space:normal;color:var(--rx-tx2)">Contas a pagar, valor da parcela, agrupado pelo centro de custo, na data de vencimento</td></tr>',
        '<tr><td>Juros e multa</td><td style="text-align:left;white-space:normal;color:var(--rx-tx2)">Campo Juros das contas a pagar</td></tr>',
        '<tr><td>Atraso</td><td style="text-align:left;white-space:normal;color:var(--rx-tx2)">Diferença entre a data de pagamento e a data de vencimento da parcela</td></tr>',
        '<tr><td>Transferência entre lojas</td><td style="text-align:left;white-space:normal;color:var(--rx-tx2)">Transferências confirmadas, a custo, lançadas na loja de destino e excluídas do total de despesas</td></tr>',
        '<tr><td>Estoque a custo</td><td style="text-align:left;white-space:normal;color:var(--rx-tx2)">Saldo por loja × custo cadastrado no produto</td></tr>',
        '<tr><td>Margem bruta</td><td style="text-align:left;white-space:normal;color:var(--rx-tx2)"><b>Medida pelo sistema</b>, na melhor fonte disponível em cada mês: itens vendidos com custo registrado; senão quantidade vendida de cada produto × custo cadastrado; senão o cadastro de produtos</td></tr>',
        '<tr><td>Taxa real de cartão</td><td style="text-align:left;white-space:normal;color:var(--rx-tx2)">Liquidações conciliadas do Mercado Pago (tarifa ÷ valor da transação)</td></tr>',
        '<tr><td>Custo da mercadoria vendida</td><td style="text-align:left;white-space:normal;color:var(--rx-tx2)">Receita do mês × (1 − margem medida daquele mês), somado mês a mês</td></tr>',
        '<tr><td>Imposto devido</td><td style="text-align:left;white-space:normal;color:var(--rx-tx2)"><b>Estimado</b> pela alíquota efetiva informada acima</td></tr>'
      ]));
}

/* A margem deixou de ser campo digitado: aqui ela e apresentada como leitura do
   sistema, com a substituicao manual disponivel apenas como excecao declarada. */
function cardMargemConfig(){
  var M=A.margemSrc||{}, manual=!!CFG.margemManual;
  var linhas=[];
  var meses=A.meses.filter(function(k){ return (A.rec.mes[k]||0)>0; });
  meses.forEach(function(k){
    var g=A.margemMes[k]||{};
    linhas.push('<tr><td>'+L(k)+'</td><td class="rx-num">'+pc(g.pct)+'</td><td>'+esc(fonteLabel(g.fonte))
      +'</td><td class="rx-num">'+(g.cobertura!=null?pc(g.cobertura)+' do mês':'—')+'</td></tr>');
  });
  if(!linhas.length) linhas.push('<tr><td colspan="4">Sem receita no período.</td></tr>');

  var corpo=''
    + '<div class="rx-grid rx-g3" style="margin-bottom:12px">'
    + kpi('📐 Margem em uso',pc(A.margem.pct),fonteLabel(A.margem.fonte),A.margem.medida?'rx-pos':'rx-warn')
    + kpi('🧾 Base custeada',M.global?fm(M.global.receita):'—',
          A.margem.cobertura!=null? pc(A.margem.cobertura)+' de toda a receita conhecida':'sem venda custeada')
    + kpi('📦 Produtos sem custo',nf((M.catalogo&&M.catalogo.semCusto)||0),
          'cada um que entra melhora a medição',((M.catalogo&&M.catalogo.semCusto)?'rx-neg':'rx-pos'))
    + '</div>'
    + tbl(['Mês','Margem aplicada','Como foi obtida','Cobertura'],linhas)
    + '<div class="rx-cfgrow" style="margin-top:14px">'
      + '<div><b>Substituir por um valor manual</b>'
      + '<small>Só para simulação. Marcando esta opção o relatório passa a ignorar a medição do sistema e usar o percentual digitado em todos os meses — o cabeçalho da DRE passa a dizer “margem informada”.</small></div>'
      + '<div style="white-space:nowrap">'
        + '<label class="rx-chk" style="display:inline-flex;gap:6px;align-items:center;margin-right:8px">'
          + '<input type="checkbox" id="rxMargemManual"'+(manual?' checked':'')+'> usar manual</label>'
        + '<input type="number" step="0.1" id="rxcfg_margem" value="'+CFG.margem+'"'+(manual?'':' disabled')+'> % '
        + '<button class="btn ghost sm" type="button" id="rxMargemAplicar">Aplicar</button>'
      + '</div></div>';

  return card('📐 Margem bruta — medida pelo sistema',
    'O custo da mercadoria vendida sai daqui. O relatório escolhe, mês a mês, a melhor fonte que existir no banco.',
    corpo);
}

/* ---------- RELATÓRIO COMPLETO ---------- */
var CH=0;
function ch(titulo,sub,body){
  CH++;
  return '<div class="rx-card rx-ch"><div class="rx-chnum">Capítulo '+CH+'</div><h2>'+titulo+'</h2>'
    +(sub?'<p class="rx-sub">'+sub+'</p>':'')+body+'</div>';
}
function fmtInd(o){
  if(o.v==null||!isFinite(o.v)) return '—';
  if(o.f==='pct') return pc(o.v);
  if(o.f==='money') return fm(o.v);
  if(o.f==='x') return o.v.toFixed(2).replace('.',',')+'×';
  return nf(o.v,1);
}
function vRelatorio(){
  CH=0;
  var d=A.dre, m=A.nMesesRec||1, R=A.rec.total, rMes=R/m;
  var hoje=new Date();
  var per=L(A.meses[0])+' a '+L(A.meses[A.meses.length-1]);
  var empresa=A.meta.empresa||'';
  var out=barraRelatorio();

  /* CAPA */
  out+='<div class="rx-card rx-cover">'
    +'<div class="rx-chnum">Diagnóstico financeiro'+(empresa?' · '+esc(empresa):'')+'</div>'
    +'<h1>Raio-X Financeiro</h1>'
    +'<p class="rx-lead">Análise completa de resultado, caixa, estoque e estrutura de custos, construída a partir dos lançamentos de contas a pagar e do movimento de vendas registrados no ONPDV.</p>'
    +'<div class="rx-hl">'
      +'<div><small>Receita</small><b>'+fm(R)+'</b></div>'
      +'<div><small>Saídas lançadas</small><b>'+fm(A.desp.total)+'</b></div>'
      +'<div><small>Resultado ajustado</small><b>'+fm(d.resultadoAjust)+'</b></div>'
      +'<div><small>Variação de estoque</small><b>'+fm(d.varEstoque)+'</b></div>'
    +'</div>'
    +'<div class="rx-meta">'
      +'<div><small>Período</small><b>'+per+'</b></div>'
      +'<div><small>Meses</small><b>'+m+'</b></div>'
      +'<div><small>Lançamentos</small><b>'+nf(A.desp.n)+'</b></div>'
      +'<div><small>Vendas</small><b>'+nf(A.rec.n)+'</b></div>'
      +'<div><small>Gerado em</small><b>'+hoje.toLocaleDateString('pt-BR')+'</b></div>'
    +'</div></div>';

  /* SUMÁRIO EXECUTIVO */
  var crit=A.findings.filter(function(f){return f.sev==='c';});
  out+='<div class="rx-card"><h2>📌 Sumário executivo</h2>'
    + pp('No período de <b>'+per+'</b> a empresa faturou <b>'+fm(R)+'</b>, média de '+fm(rMes)+' por mês, distribuídos em '+nf(A.rec.n)+' vendas — ticket médio de '+fm(R/Math.max(1,A.rec.n))+'. No mesmo intervalo foram lançadas <b>'+fm(A.desp.total)+'</b> de saídas, excluídas as transferências de mercadoria entre lojas ('+fm(A.desp.transf)+'), que não são despesa e sim movimentação interna.')
    + pp('Pelos lançamentos, isso sugere uma sobra de '+fm(d.caixa)+'. Essa leitura é enganosa porque três valores relevantes não estão lançados: a taxa das maquininhas (estimada em '+fm(d.taxaCartao)+'), o imposto que deixou de ser recolhido ('+fm(d.gapImposto)+') e a diferença entre o que foi comprado de mercadoria e o que a venda consumiu ('+fm(d.varEstoque)+'). Corrigindo os três, o resultado do período é <b class="'+sgnc(d.resultadoAjust)+'">'+fm(d.resultadoAjust)+'</b>, ou '+fm(d.resultadoAjust/m)+' por mês.')
    + pp('O ponto de equilíbrio calculado é <b>'+(d.pontoEquilibrioMes!=null?fm(d.pontoEquilibrioMes):'—')+' por mês</b>. A média realizada foi '+fm(rMes)+' — '+(d.pontoEquilibrioMes&&rMes<d.pontoEquilibrioMes ? 'abaixo do necessário para cobrir a estrutura atual' : 'acima do necessário, com folga de '+fm(rMes-(d.pontoEquilibrioMes||0)))+'.')
    + (crit.length? h3('Os pontos que exigem decisão')
        + '<ol class="rx-rp" style="padding-left:20px">'
        + crit.slice(0,6).map(function(f){ return '<li style="margin-bottom:7px"><b>'+esc(f.tit)+'</b> — '+esc(f.val)+'</li>'; }).join('')
        + '</ol>' : '')
    + callout('<b>Leitura em uma frase:</b> '+(d.varEstoque<0
        ? 'a operação está se financiando com o próprio estoque e com imposto não recolhido; enquanto isso durar, a prateleira encolhe todo mês e a venda cai junto.'
        : 'a operação está prendendo caixa em estoque acima do giro, o que aperta o pagamento de boletos mesmo com resultado positivo no papel.'), d.resultadoAjust<0)
    + '</div>';

  /* ÍNDICE */
  var idx=['Metodologia, fontes e premissas','Desempenho da receita','Estrutura de custos','Demonstrativo de resultado (DRE)',
    'Resultado por loja','Compras, estoque e ruptura','Fornecedores e curva ABC','Ciclo de pagamento, atrasos e juros',
    'Contas a pagar e projeção de caixa','Situação fiscal','Painel de indicadores','Diagnóstico detalhado','Plano de ação','Limitações e ressalvas'];
  out+='<div class="rx-card"><h2>📖 Índice</h2><div class="rx-toc">'
    + idx.map(function(t,i){ return '<div><span>'+(i+1)+'.</span>'+esc(t)+'</div>'; }).join('')
    + '</div></div>';

  /* 1. METODOLOGIA */
  out+=ch('Metodologia, fontes e premissas','De onde vem cada número deste relatório.',
      pp('As despesas vêm de <b>Contas a pagar</b>, pelo valor da parcela, agrupadas pelo centro de custo e alocadas pela <b>data de vencimento</b> — regime de competência. As receitas vêm das <b>vendas do PDV</b>, somadas pela data da venda, excluídas canceladas e orçamentos. Os juros vêm do campo Juros da parcela, e o atraso é a diferença entre a data de pagamento e a de vencimento.')
    + pp('As transferências internas de mercadoria entre lojas ('+fm(A.desp.transf)+' no período) foram <b>excluídas</b> do total de despesas: representam mercadoria que sai de uma unidade e entra em outra, e contá-las duplicaria o custo. No capítulo de lojas elas voltam a aparecer, porque lá interessa saber quanto de mercadoria cada unidade consumiu.')
    + pp('A margem bruta é <b>medida pelo próprio sistema</b> e não é digitada: em cada mês vale a melhor fonte disponível — os itens vendidos com custo registrado, ou a quantidade vendida de cada produto multiplicada pelo custo cadastrado. Os quatro números da tabela abaixo, esses sim, ainda são premissas: não existem no banco e podem ser ajustados na aba Premissas.')
    + tbl(['Premissa','Valor usado','Efeito no relatório'],[
        '<tr><td>Margem bruta média <span class="rx-pill rx-a">medida</span></td><td class="rx-num">'+pc(A.margem.pct)+'</td><td style="text-align:left;white-space:normal">Não é premissa: é '+esc(fonteLabel(A.margem.fonte))+'. Define o custo da mercadoria vendida e, por consequência, a variação de estoque e o lucro bruto</td></tr>',
        '<tr><td>Taxa de cartão — crédito</td><td class="rx-num">'+pc(CFG.txCred/100,2)+'</td><td style="text-align:left;white-space:normal">Deduzida da receita; não aparece nas contas a pagar</td></tr>',
        '<tr><td>Taxa de cartão — débito</td><td class="rx-num">'+pc(CFG.txDeb/100,2)+'</td><td style="text-align:left;white-space:normal">Idem</td></tr>',
        '<tr><td>Alíquota efetiva de imposto</td><td class="rx-num">'+pc(CFG.aliq/100,1)+'</td><td style="text-align:left;white-space:normal">Base da provisão fiscal comparada ao imposto efetivamente pago</td></tr>',
        '<tr><td>Prazo do crédito</td><td class="rx-num">'+CFG.prazoCred+' dias</td><td style="text-align:left;white-space:normal">Velocidade com que a venda no crédito vira caixa</td></tr>'
      ])
    + callout('Este relatório é uma leitura gerencial, não uma peça contábil. Serve para decidir, não para declarar. Números marcados como estimados dependem das premissas acima.'));

  /* 2. RECEITA */
  var rowsMes=A.dreMes.map(function(x,i){
    var ant=i>0?A.dreMes[i-1].rec:null;
    var vr=(ant)? (x.rec-ant)/ant : null;
    return '<tr><td>'+L(x.k)+'</td><td class="rx-num">'+fm(x.rec)+'</td><td class="rx-num '
      +(vr!=null?(vr<0?'rx-neg':'rx-pos'):'')+'">'+(vr!=null?(vr>0?'+':'')+pc(vr):'—')+'</td><td class="rx-num">'
      +fm(x.rec/30.4)+'</td></tr>';
  });
  var rowsLoja=A.lojas.filter(function(l){return l.rec>0;}).map(function(l){
    return '<tr><td>'+esc(l.loja)+'</td><td class="rx-num">'+fm(l.rec)+'</td><td class="rx-num">'+pc(l.rec/R)
      +'</td><td class="rx-num">'+fm(l.rec/m)+'</td></tr>';
  });
  var rowsForma=sortDesc(A.rec.forma).map(function(o){
    var n=norm(o.k);
    var pr = n.indexOf('CREDIARIO')>-1 ? 'conforme o carnê'
           : n.indexOf('CREDITO')>-1 ? 'cerca de '+CFG.prazoCred+' dias'
           : n.indexOf('DEBITO')>-1 ? '1 dia útil'
           : n.indexOf('CARTAO')>-1 ? 'de 1 a '+CFG.prazoCred+' dias' : 'imediato';
    return '<tr><td>'+esc(o.k)+'</td><td class="rx-num">'+fm(o.v)+'</td><td class="rx-num">'+pc(o.v/R)+'</td><td>'+pr+'</td></tr>';
  });
  var maxDow=Math.max.apply(null,A.sazon.dow.map(function(z){return z.med;}).concat([1]));
  var rowsDow=A.sazon.dow.map(function(o){
    return '<tr><td>'+esc(o.n)+'</td><td class="rx-num">'+fm(o.tot)+'</td><td class="rx-num">'+fm(o.med)
      +'</td><td class="rx-num">'+o.idx.toFixed(2).replace('.',',')+'×</td><td style="width:120px">'+barCell(o.med,maxDow)+'</td></tr>';
  });
  var melhorDow=A.sazon.dow.slice().sort(function(a,b){return b.med-a.med;})[0];
  var piorDow=A.sazon.dow.slice().sort(function(a,b){return a.med-b.med;})[0];
  var gRec=chart({labels:A.meses.map(L),h:210,series:[{name:'Receita',color:C.acc,values:A.dreMes.map(function(x){return x.rec;})}]});

  out+=ch('Desempenho da receita','Volume, composição, prazo de recebimento e sazonalidade.',
      pp('A receita somou <b>'+fm(R)+'</b> em '+m+' meses. '+(A.tendencia&&A.tendencia.pctMes!=null
        ? 'A tendência do período é de <b class="'+(A.tendencia.pctMes<0?'rx-neg':'rx-pos')+'">'+(A.tendencia.pctMes>0?'+':'')+pc(A.tendencia.pctMes)+' ao mês</b>, saindo de '+fm(A.tendencia.primeiro)+' no primeiro mês para '+fm(A.tendencia.ultimo)+' no último.'
        : 'O período é curto demais para calcular tendência — são necessários pelo menos três meses com venda.'))
    + gRec
    + tbl(['Mês','Receita','Variação','Média por dia'],rowsMes)
    + h3('Composição por unidade')
    + tbl(['Loja','Receita','Participação','Por mês'],rowsLoja)
    + h3('Forma de pagamento e velocidade do dinheiro')
    + pp('Esta tabela explica boa parte da sensação de aperto: parte do que é vendido hoje só vira dinheiro depois. '+pc(A.mixAVista/R)+' da receita entra na hora (dinheiro e PIX). Sobre cartão incide a taxa da maquininha, estimada em '+fm(d.taxaCartao)+' no período.')
    + tbl(['Forma','Valor','Participação','Prazo até virar caixa'],rowsForma)
    + h3('Sazonalidade semanal')
    + pp('O melhor dia é <b>'+melhorDow.n.toLowerCase()+'</b> ('+fm(melhorDow.med)+' em média, índice '+melhorDow.idx.toFixed(2).replace('.',',')+'×) e o mais fraco é <b>'+piorDow.n.toLowerCase()+'</b> ('+fm(piorDow.med)+'). Índice 1,00 representa o dia médio. Essa curva é a base para escalar equipe e para escolher o dia de vencimento dos boletos.')
    + tbl(['Dia da semana','Receita total','Média por dia','Índice',''],rowsDow));

  /* 3. ESTRUTURA DE CUSTOS */
  var blocos=sortDesc(A.desp.bloco), maxB=blocos.length?blocos[0].v:1;
  var rowsB=blocos.map(function(o){
    var B=BLOCOS[o.k]||{n:o.k,e:'•'};
    return '<tr><td>'+B.e+' '+esc(B.n)+'</td><td class="rx-num">'+fm(o.v)+'</td><td class="rx-num">'+fm(o.v/m)
      +'</td><td class="rx-num">'+pc(o.v/Math.max(1,R))+'</td><td style="width:110px">'+barCell(o.v,maxB)+'</td></tr>';
  });
  rowsB.push('<tr class="rx-tot"><td>Total</td><td class="rx-num">'+fm(A.desp.total)+'</td><td class="rx-num">'
    +fm(A.desp.total/m)+'</td><td class="rx-num">'+pc(A.desp.total/Math.max(1,R))+'</td><td></td></tr>');
  var cats=sortDesc(A.desp.cat).slice(0,30), maxC=cats.length?cats[0].v:1;
  var rowsC=cats.map(function(o,i){
    return '<tr><td>'+(i+1)+'. '+esc(o.k)+'</td><td class="rx-num">'+fm(o.v)+'</td><td class="rx-num">'+fm(o.v/m)
      +'</td><td class="rx-num">'+pc(o.v/Math.max(1,R))+'</td><td style="width:100px">'+barCell(o.v,maxC)+'</td></tr>';
  });
  var sobe=A.tendCat.filter(function(o){return o.dif>0;}).slice(0,8);
  var desce=A.tendCat.filter(function(o){return o.dif<0;}).slice(-8).reverse();
  var rowsT=sobe.concat(desce).map(function(o){
    return '<tr><td>'+esc(o.cat)+'</td><td class="rx-num">'+fm(o.ini)+'</td><td class="rx-num">'+fm(o.fim)
      +'</td><td class="rx-num '+(o.dif>0?'rx-neg':'rx-pos')+'">'+(o.dif>0?'+':'')+fm(o.dif)+'</td><td class="rx-num">'
      +(o.pct!=null?((o.pct>0?'+':'')+pc(o.pct)):'—')+'</td></tr>';
  });
  var recVar=A.metades.recIni? (A.metades.recFim-A.metades.recIni)/A.metades.recIni : null;
  var rowsH=A.histAnos.map(function(y){
    var h=A.hist[y];
    return '<tr><td>'+y+'</td><td class="rx-num">'+fm(h.TOTAL)+'</td><td class="rx-num">'+fm(h.FORNECEDOR||0)
      +'</td><td class="rx-num">'+fm(h.FOLHA||0)+'</td><td class="rx-num">'+fm(h.OCUPACAO||0)+'</td><td class="rx-num">'
      +fm(h.IMPOSTO||0)+'</td><td class="rx-num">'+fm(h.FINANC||0)+'</td></tr>';
  });

  out+=ch('Estrutura de custos','Para onde vai cada real que sai do caixa.',
      pp('As saídas do período somaram <b>'+fm(A.desp.total)+'</b>, ou '+pc(A.desp.total/Math.max(1,R))+' da receita. A tabela abaixo agrupa por natureza — é a visão que interessa para decidir onde cortar.')
    + tbl(['Grupo','No período','Por mês','% da receita',''],rowsB)
    + h3('As 30 maiores categorias')
    + tbl(['Categoria','No período','Por mês','% da receita',''],rowsC)
    + h3('O que subiu e o que caiu dentro do período')
    + pp('Comparação entre os primeiros e os últimos '+A.metades.m1.length+' meses do período. A receita '+(recVar!=null?('variou <b class="'+(recVar<0?'rx-neg':'rx-pos')+'">'+(recVar>0?'+':'')+pc(recVar)+'</b>'):'não pôde ser comparada')+' no mesmo intervalo. Despesa que sobe mais rápido que a receita é o alerta a observar aqui.')
    + tbl(['Categoria','1ª metade','2ª metade','Diferença','Variação'],rowsT)
    + h3('Histórico anual (base inteira)')
    + pp('Série de todos os anos com lançamento no sistema, independentemente do período selecionado. Serve para enxergar a evolução da operação e a mudança de comportamento de cada bloco de custo ao longo do tempo.')
    + tbl(['Ano','Total','Mercadoria','Pessoal','Fixos','Impostos','Financeiro'],rowsH));

  /* 4. DRE */
  out+=ch('Demonstrativo de resultado (DRE)','Da venda bruta até o resultado ajustado, mês a mês.',
      pp('A DRE abaixo parte da receita bruta e desce até o resultado. A taxa de cartão é estimada pelas premissas; o custo da mercadoria vendida usa a margem bruta de '+pc(A.margem.pct,0)+', '+fonteLabel(A.margem.fonte)+', aplicada mês a mês.')
    + vDreTabela()
    + h3('Abertura mensal')
    + vDreMensal()
    + pp('O ponto de equilíbrio — faturamento mínimo para cobrir a estrutura — é '+(d.pontoEquilibrioMes!=null?'<b>'+fm(d.pontoEquilibrioMes)+' por mês</b>':'—')+'. Cada ponto percentual a mais de margem bruta vale '+fm(rMes*0.01)+' por mês; cada 1% cortado da folha vale '+fm(d.folha*0.01/m)+'.'));

  /* 5. LOJAS */
  var rowsL=A.lojas.map(function(l){
    return '<tr><td><b>'+esc(l.loja)+'</b>'+(l.hub?' <span class="rx-pill rx-w">central</span>':'')+'</td><td class="rx-num">'
      +fm(l.rec)+'</td><td class="rx-num">'+fm(l.dir)+'</td><td class="rx-num">'+(l.transf?fm(l.transf):'—')
      +'</td><td class="rx-num">'+(l.aj?fm(l.aj):'—')+'</td><td class="rx-num">'+fm(l.custo)+'</td><td class="rx-num '
      +sgnc(l.result)+'">'+fm(l.result)+'</td><td class="rx-num '+sgnc(l.result)+'">'+(l.marg!=null?pc(l.marg):'—')+'</td></tr>';
  });
  var estRows=(A.estoqueMedido.lojas||[]).map(function(o){
    return '<tr><td>'+esc(o.loja)+'</td><td class="rx-num">'+fm(o.valor)+'</td><td class="rx-num">'+nf(o.unidades)+'</td></tr>';
  });
  out+=ch('Resultado por loja','Cada unidade contra o custo que ela realmente consome.',
      pp('O cálculo funciona assim: <b>custo direto</b> é o que foi lançado na conta daquela loja; <b>mercadoria recebida</b> é o que a unidade pegou da loja central; <b>ajuste</b> retira da central a mercadoria comprada para as outras, para não contar a mesma compra duas vezes.')
    + tbl(['Loja','Receita','Custo direto','Mercadoria recebida','Ajuste','Custo total','Resultado','Margem'],rowsL)
    + (estRows.length? h3('Estoque a custo por loja, hoje')+tbl(['Loja','Valor a custo','Unidades'],estRows) : '')
    + callout('A unidade marcada como <b>central</b> ('+esc(A.hub||'—')+') concentra as compras e boa parte da folha administrativa de toda a rede. O resultado dela aparece pior do que é. Antes de tomar qualquer decisão sobre essa loja, ratear folha administrativa, entregas e estrutura de compras entre as unidades, proporcionalmente ao faturamento.'));

  /* 6. COMPRAS E ESTOQUE */
  var rowsCE=A.dreMes.map(function(x){
    return '<tr><td>'+L(x.k)+'</td><td class="rx-num">'+fm(x.rec)+'</td><td class="rx-num">'+fm(x.compras)
      +'</td><td class="rx-num">'+(x.rec?pc(x.compras/x.rec):'—')+'</td><td class="rx-num">'+fm(x.cmv)
      +'</td><td class="rx-num '+sgnc(x.varEst)+'">'+fm(x.varEst)+'</td></tr>';
  });
  rowsCE.push('<tr class="rx-tot"><td>Total</td><td class="rx-num">'+fm(R)+'</td><td class="rx-num">'+fm(d.compras)
    +'</td><td class="rx-num">'+pc(d.compras/Math.max(1,R))+'</td><td class="rx-num">'+fm(d.cmv)+'</td><td class="rx-num '
    +sgnc(d.varEstoque)+'">'+fm(d.varEstoque)+'</td></tr>');
  var cnR=cenariosMargem();
  var cen=cnR.lista.map(function(mg){
    var cmv=R*(1-mg/100), ve=d.compras-cmv, eh=(mg===cnR.real);
    return '<tr'+(eh?' style="background:var(--rx-accsoft);font-weight:700"':'')+'><td>'
      +mg.toFixed(1).replace('.',',')+'%'+(eh?' <span class="rx-pill rx-a">medida</span>':'')+'</td><td class="rx-num">'
      +fm(cmv)+'</td><td class="rx-num '+sgnc(ve)+'">'+fm(ve)+'</td><td>'+(ve<0?'estoque encolheu':'estoque cresceu')+'</td></tr>';
  });
  out+=ch('Compras, estoque e ruptura','A conta que explica por que a prateleira esvazia enquanto os boletos chegam.',
      pp('Vender '+fm(R)+' com margem bruta de '+pc(A.margem.pct,0)+' ('+fonteLabel(A.margem.fonte)+') consome aproximadamente <b>'+fm(d.cmv)+'</b> de mercadoria a preço de custo. No mesmo período foram comprados <b>'+fm(d.compras)+'</b>. A diferença é <b class="'+sgnc(d.varEstoque)+'">'+fm(d.varEstoque)+'</b>.')
    + (d.varEstoque<0
      ? callout('<b>Diagnóstico da ruptura.</b> Comprando '+fm(Math.abs(d.varEstoque))+' a menos do que a venda consumiu em '+m+' meses ('+fm(Math.abs(d.varEstoque)/m)+' por mês), o estoque das lojas encolhe de forma contínua. O mecanismo é sempre o mesmo: o dinheiro da venda cobre folha, aluguel e boletos vencidos antes de repor a mercadoria, então a reposição sai sempre menor que a saída. Prateleira vazia derruba a venda do mês seguinte, que aperta o caixa de novo — é um ciclo que se realimenta e não se resolve comprando mais no mesmo ritmo de pagamento.',1)
      : callout('As compras superaram o consumo estimado em '+fm(d.varEstoque)+'. Isso prende caixa: o boleto vence antes de o produto girar.'))
    + (A.estoqueMedido.total>0 ? pp('O ONPDV registra hoje <b>'+fm(A.estoqueMedido.total)+'</b> de estoque a custo ('+nf(A.estoqueMedido.unidades)+' unidades)'+(A.estoqueMedido.meses!=null?', equivalente a '+A.estoqueMedido.meses.toFixed(1).replace('.',',')+' meses de consumo estimado':'')+'. Confrontar este saldo com a variação inferida acima é a forma mais rápida de descobrir se a queda de estoque é reposição insuficiente ou perda não registrada.') : '')
    + tbl(['Mês','Receita','Compras','Compras / receita','CMV estimado','Δ Estoque'],rowsCE)
    + h3('Sensibilidade à margem real')
    + pp('A linha destacada é a margem que o sistema mediu. As demais mostram de que tamanho seria a conclusão se a margem real fosse outra — é o teste de robustez do diagnóstico, não uma escolha a fazer.')
    + tbl(['Margem bruta','CMV no período','Δ Estoque','Leitura'],cen));

  /* 7. FORNECEDORES / ABC */
  var rowsABC=A.abcResumo.map(function(o){
    var txt={A:'Fornecedores estratégicos: concentram a maior parte da compra e é neles que negociação de tabela, prazo e bonificação tem efeito real.',
             B:'Intermediários: vale padronizar pedido e prazo, sem esforço de negociação individual.',
             C:'Cauda longa: muitos fornecedores, pouco valor. Cada um gera boleto, frete e trabalho administrativo desproporcionais.'}[o.classe];
    return '<tr><td>Classe '+o.classe+'</td><td class="rx-num">'+o.n+'</td><td class="rx-num">'+fm(o.val)
      +'</td><td class="rx-num">'+pc(o.pct)+'</td><td style="text-align:left;white-space:normal;color:var(--rx-tx2)">'+txt+'</td></tr>';
  });
  var rowsF=A.fornec.slice(0,40).map(function(o,i){
    return '<tr><td>'+(i+1)+'. '+esc(o.forn)+'</td><td>'+o.classe+'</td><td class="rx-num">'+fm(o.val)+'</td><td class="rx-num">'
      +pc(o.val/Math.max(1,d.compras))+'</td><td class="rx-num">'+pc(o.acum)+'</td><td class="rx-num">'+o.n
      +'</td><td class="rx-num">'+fm(o.ticket)+'</td><td class="rx-num '+(o.juros?'rx-neg':'')+'">'+(o.juros?fm2(o.juros):'—')+'</td></tr>';
  });
  out+=ch('Fornecedores e curva ABC','Com quem negociar e onde a compra está picada demais.',
      pp('São <b>'+A.nFornec+' fornecedores</b> e <b>'+nf(A.nNotas)+' parcelas de compra</b> no período — cerca de '+Math.round(A.nNotas/m)+' por mês, ou '+Math.round(A.nNotas/m/22)+' por dia útil. O ticket médio por parcela é '+fm(d.compras/Math.max(1,A.nNotas))+'.')
    + pp('Comprar pouco e sempre tem três custos invisíveis: perde-se desconto de volume, paga-se frete repetido e cria-se um fluxo de boletos diário que torna impossível planejar caixa. A curva ABC mostra onde está o dinheiro de verdade.')
    + tbl(['Classe','Fornecedores','Valor comprado','% do total','Como tratar'],rowsABC)
    + h3('Os 40 maiores')
    + tbl(['Fornecedor','Classe','Comprado','% total','Acumulado','Parcelas','Ticket médio','Juros'],rowsF));

  /* 8. CICLO DE PAGAMENTO */
  var a=A.atraso;
  var rowsAt=a.faixas.map(function(x){
    return '<tr><td>'+esc(x.l)+'</td><td class="rx-num">'+x.n+'</td><td class="rx-num">'+(a.n?pc(x.n/a.n):'—')
      +'</td><td class="rx-num">'+fm(x.v)+'</td></tr>';
  });
  var rowsJ=sortDesc(A.desp.jurosForn).slice(0,15).map(function(o,i){
    var f=A.fornec.filter(function(x){return x.forn===o.k;})[0];
    return '<tr><td>'+(i+1)+'. '+esc(o.k)+'</td><td class="rx-num rx-neg">'+fm2(o.v)+'</td><td class="rx-num">'
      +(f?fm(f.val):'—')+'</td><td class="rx-num">'+(f&&f.val?pc(o.v/f.val):'—')+'</td></tr>';
  });
  var dm=A.sazon.diaMes, maxV=Math.max.apply(null,dm.map(function(o){return o.vencMed;}).concat([1]));
  var rowsDM=dm.filter(function(o){return o.n>0;}).map(function(o){
    var folga=o.med-o.vencMed;
    return '<tr><td>Dia '+o.d+'</td><td class="rx-num">'+fm(o.med)+'</td><td class="rx-num">'+fm(o.vencMed)
      +'</td><td class="rx-num '+(folga<0?'rx-neg':'rx-pos')+'">'+fm(folga)+'</td><td style="width:110px">'
      +barCell(o.vencMed,maxV)+'</td></tr>';
  });
  var apertados=dm.filter(function(o){return o.n>0 && o.med-o.vencMed<0;});
  out+=ch('Ciclo de pagamento, atrasos e juros','Quanto custa pagar depois do vencimento e por que isso acontece.',
      pp('No período, <b>'+a.nAtr+' das '+a.n+' parcelas pagas</b> ('+pc(a.pct)+') saíram depois do vencimento, com atraso médio de '+a.medDias.toFixed(1).replace('.',',')+' dias e pior caso de '+a.maxDias+' dias. O custo direto foi <b>'+fm(A.desp.juros)+'</b> em juros e multa — '+fm(A.desp.juros/m)+' por mês, equivalente a '+pc(A.desp.juros/Math.max(1,d.compras))+' de tudo que foi comprado.')
    + tbl(['Faixa de atraso','Parcelas','% das parcelas','Valor'],rowsAt)
    + h3('Onde os juros são pagos')
    + tbl(['Fornecedor','Juros pagos','Comprado','Juros / compras'],rowsJ)
    + h3('Descasamento por dia do mês')
    + pp('Esta é a tabela mais útil para acabar com o atraso sem precisar de mais dinheiro. Ela compara, para cada dia do mês, quanto entra em média de venda contra quanto vence em média de boleto. '+(apertados.length? 'Existem <b>'+apertados.length+' dias</b> em que o vencimento supera a entrada — esses são os dias em que o atraso nasce.' : 'Nenhum dia apresenta vencimento acima da entrada média.'))
    + tbl(['Dia do mês','Entrada média','Vencimento médio','Folga',''],rowsDM)
    + callout('Atraso médio de poucos dias raramente significa falta de dinheiro no mês. Significa boleto vencendo no dia errado. Negociar com os fornecedores da classe A para concentrar vencimentos nos dias de maior entrada elimina a maior parte do juro sem custo nenhum.'));

  /* 9. CONTAS A PAGAR / PROJEÇÃO */
  var rowsAg=A.aberto.faixas.map(function(x){
    return '<tr><td>'+esc(x.l)+'</td><td class="rx-num">'+x.n+'</td><td class="rx-num">'+fm(x.v)+'</td></tr>';
  });
  var rowsP=A.proj.map(function(x,i){
    return '<tr><td>S'+(i+1)+' · '+x.ini.toLocaleDateString('pt-BR')+' a '+x.fim.toLocaleDateString('pt-BR')+'</td><td class="rx-num">'
      +fm(x.entrada)+'</td><td class="rx-num">'+fm(x.saida)+'</td><td class="rx-num '+sgnc(x.acum)+'">'+fm(x.acum)
      +'</td><td class="rx-num">'+fm(x.saidaHist)+'</td><td class="rx-num '+sgnc(x.acumHist)+'">'+fm(x.acumHist)+'</td></tr>';
  });
  var sP=[{name:'Entrada estimada',color:C.acc},{name:'Saída no ritmo histórico',color:C.warn},
          {name:'Acumulado — só boletos lançados',color:C.gray},{name:'Acumulado — cenário realista',color:C.neg}];
  var gP=chart({labels:A.proj.map(function(x,i){return 'S'+(i+1);}),h:215,series:[
    {name:'Entrada estimada',color:C.acc,values:A.proj.map(function(x){return x.entrada;})},
    {name:'Saída no ritmo histórico',color:C.warn,values:A.proj.map(function(x){return x.saidaHist;})},
    {name:'Acumulado — só boletos lançados',color:C.gray,type:'line',values:A.proj.map(function(x){return x.acum;})},
    {name:'Acumulado — cenário realista',color:C.neg,type:'line',values:A.proj.map(function(x){return x.acumHist;})}
  ]});
  out+=ch('Contas a pagar e projeção de caixa','O que está em aberto hoje e como as próximas 13 semanas se comportam.',
      pp('Estão em aberto <b>'+fm(A.aberto.total)+'</b>, sendo '+fm(A.aberto.vencido)+' já vencidos e '+fm(A.aberto.aVencer)+' a vencer. Isso equivale a '+(R?(A.aberto.total/rMes).toFixed(1).replace('.',','):'—')+' meses de faturamento já comprometidos.')
    + tbl(['Faixa','Parcelas','Valor'],rowsAg)
    + h3('Projeção semanal de caixa')
    + pp('A entrada é projetada pela média diária de venda do período ('+fm(A.caixaDia)+' por dia). Há <b>dois cenários de saída</b>. O primeiro usa apenas os vencimentos já lançados, com os boletos vencidos entrando integralmente na primeira semana — ele fica otimista a partir da segunda semana, porque compras futuras, folha e impostos ainda não foram lançados. O segundo repõe o ritmo histórico de saída do período ('+fm(A.saidaDia)+' por dia, '+fm(A.saidaDia*7)+' por semana), que é o retrato mais próximo da realidade.')
    + gP + legend(sP)
    + tbl(['Semana','Entrada estimada','Boletos lançados','Acumulado (lançado)','Saída realista','Acumulado (realista)'],rowsP)
    + callout('No cenário realista, o pior momento é a semana de <b>'+A.projPiorHist.ini.toLocaleDateString('pt-BR')+'</b>, com acumulado de <b>'+fm(A.projPiorHist.acumHist)+'</b>, e o trimestre termina em <b>'+fm(A.proj[A.proj.length-1].acumHist)+'</b>. A diferença entre os dois cenários — '+fm(A.proj[A.proj.length-1].acum-A.proj[A.proj.length-1].acumHist)+' em 13 semanas — é exatamente o volume de compromissos que ainda vai aparecer e hoje não está lançado. É por isso que sobra pouco mesmo quando o boleto ainda não venceu.', A.projPiorHist.acumHist<0));

  /* 10. FISCAL */
  var rowsD=Object.keys(A.dasAno).sort().map(function(y){
    var h=A.hist[y]||{};
    return '<tr><td>'+y+'</td><td class="rx-num">'+fm(A.dasAno[y])+'</td><td class="rx-num">'+fm(h.IMPOSTO||0)
      +'</td><td class="rx-num">'+fm(h.FORNECEDOR||0)+'</td></tr>';
  });
  out+=ch('Situação fiscal','O passivo que não aparece nos lançamentos.',
      pp('No período, o imposto efetivamente pago foi <b>'+fm(d.imposto)+'</b> sobre '+fm(R)+' de receita, ou '+pc(d.imposto/Math.max(1,R))+'. Usando '+pc(CFG.aliq/100,1)+' como alíquota efetiva de referência para comércio no Simples Nacional, o valor esperado seria '+fm(d.impostoDevido)+' — uma diferença de <b class="rx-neg">'+fm(d.gapImposto)+'</b> no período, ou '+fm(d.gapImposto/m)+' por mês.')
    + (rowsD.length? h3('Recolhimento do Simples ao longo dos anos')
        + pp('Série extraída de toda a base, para enxergar a mudança de comportamento ao longo do tempo.')
        + tbl(['Ano','Simples Nacional (DAS)','Total de impostos','Compras no ano'],rowsD) : '')
    + callout('<b>Imposto não recolhido não desaparece:</b> acumula multa e juros, impede certidão negativa, bloqueia crédito bancário e pode levar a exclusão do Simples. Enquanto ele não estiver no orçamento mensal, qualquer cálculo de lucro está superestimado — inclusive o deste relatório antes do ajuste. Primeira providência: solicitar ao contador o extrato de débitos no e-CAC e a simulação de parcelamento.', d.gapImposto>0));

  /* 11. INDICADORES */
  var grupos={};
  A.indic.forEach(function(o){ (grupos[o.g]=grupos[o.g]||[]).push(o); });
  var rowsI=[];
  Object.keys(grupos).forEach(function(g){
    rowsI.push('<tr class="rx-tot"><td colspan="5">'+esc(g)+'</td></tr>');
    grupos[g].forEach(function(o){
      rowsI.push('<tr><td><span class="rx-st rx-'+o.s+'"></span>'+esc(o.n)+'</td><td class="rx-num">'+fmtInd(o)
        +'</td><td>'+esc(o.ref)+'</td><td>'+({ok:'adequado',at:'atenção',ru:'crítico',na:'referência'}[o.s])
        +'</td><td style="text-align:left;white-space:normal;color:var(--rx-tx2)">'+esc(o.obs)+'</td></tr>');
    });
  });
  var nRu=A.indic.filter(function(o){return o.s==='ru';}).length;
  var nAt=A.indic.filter(function(o){return o.s==='at';}).length;
  var nOk=A.indic.filter(function(o){return o.s==='ok';}).length;
  out+=ch('Painel de indicadores','Cada número contra uma referência de mercado para varejo pet.',
      pp('Dos '+A.indic.length+' indicadores avaliados, <b>'+nRu+'</b> estão em situação crítica, <b>'+nAt+'</b> em atenção e <b>'+nOk+'</b> adequados. As referências são valores usuais para varejo de pequeno porte com estoque próprio e devem ser lidas como ordem de grandeza, não como regra.')
    + tbl(['Indicador','Valor','Referência','Situação','Observação'],rowsI));

  /* 12. DIAGNÓSTICO */
  out+=ch('Diagnóstico detalhado','Todos os achados, em ordem de gravidade.',
      A.findings.map(findCard).join('') || pp('Nenhum achado relevante com as premissas atuais.'));

  /* 13. PLANO */
  out+=ch('Plano de ação','O que fazer, em que ordem e quanto vale.', vPlanoCorpo());

  /* 14. LIMITAÇÕES */
  out+=ch('Limitações e ressalvas','O que este relatório não sabe.',
      '<ul class="rx-rp" style="padding-left:20px">'
    + '<li style="margin-bottom:8px">O <b>custo da mercadoria vendida é apurado pela margem medida</b>, aplicada sobre a receita de cada mês. A medição é ponderada pelo giro real, mas continua sendo uma margem média: dentro do mesmo mês ela não distingue ração de acessório ou de medicamento. Meses sem venda custeada herdam a margem medida no conjunto.</li>'
    + '<li style="margin-bottom:8px">A <b>variação de estoque é inferida</b> pela diferença entre compras e CMV. O saldo de estoque a custo apresentado é medido, mas só um inventário físico confirma se a mercadoria realmente encolheu ou se existe perda, quebra, furto ou venda sem registro.</li>'
    + '<li style="margin-bottom:8px">As <b>taxas de cartão e a alíquota de imposto são premissas</b> enquanto não houver conciliação completa da adquirente e informação do contador.</li>'
    + '<li style="margin-bottom:8px">A análise usa a <b>data de vencimento</b> como competência. Despesas lançadas fora do mês de origem deslocam a leitura mensal, embora não alterem o total do período.</li>'
    + '<li style="margin-bottom:8px">O <b>resultado por loja</b> depende de as contas a pagar estarem atribuídas à loja correta. Custos centrais lançados numa única loja distorcem a comparação, como indicado no capítulo 5.</li>'
    + '<li style="margin-bottom:8px">A <b>projeção de caixa</b> considera apenas os boletos já lançados. Compras futuras, folha do mês corrente e impostos não lançados não aparecem — o quadro real tende a ser mais apertado.</li>'
    + '<li>Este documento é uma <b>leitura gerencial</b>, não substitui contabilidade, auditoria nem parecer fiscal.</li>'
    + '</ul>');

  return out + barraRodape();
}
function barraRelatorio(){
  return '<div class="rx-card rx-noprint" style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap">'
    +'<div><b style="font-size:14.5px">📑 Relatório completo em 14 capítulos</b>'
    +'<div style="color:var(--rx-tx2);font-size:12.5px;margin-top:2px">Formatado para papel A4. Use “Salvar como PDF” na janela de impressão para gerar o arquivo.</div></div>'
    +'<div><button class="btn sm" type="button" data-rxprint="1">🖨️ Imprimir relatório</button></div></div>';
}
function barraRodape(){
  return '<div class="rx-card rx-noprint" style="text-align:center">'
    +'<button class="btn sm" type="button" data-rxprint="1">🖨️ Imprimir relatório completo</button>'
    +'<div style="color:var(--rx-tx2);font-size:12.5px;margin-top:8px">Na janela de impressão, escolha “Salvar como PDF” e ative “Gráficos de fundo” para manter as cores.</div></div>';
}

/* ====================== ROTEAMENTO / DOM ====================== */
var RENDER={visao:vVisao,dre:vDre,lojas:vLojas,compras:vCompras,fornec:vFornec,pagar:vPagar,
            atrasos:vAtrasos,diag:vDiag,plano:vPlano,relatorio:vRelatorio,config:vConfig};

function el(){ return document.getElementById('page-raiox'); }
function q(sel){ var p=el(); return p? p.querySelector(sel) : null; }
function qa(sel){ var p=el(); return p? Array.prototype.slice.call(p.querySelectorAll(sel)) : []; }

function shell(){
  var t=TITLES[VIEW]||['',''];
  return '<div class="rx-printhead" id="rxPrinthead"></div>'
    + '<div class="rx-topbar">'
      + '<div><h1 id="rxTtl">'+esc(t[0])+'</h1><p id="rxDsc">'+esc(t[1])+'</p></div>'
      + '<div class="rx-ctrl" id="rxCtrl"></div>'
    + '</div>'
    + '<div class="rx-tabs" id="rxTabs"></div>'
    + '<div id="rxBody"></div>';
}
function ctrlHtml(){
  if(!DATA) return '';
  var todos=DATA.mesesContas.slice();
  DATA.mesesReceita.forEach(function(k){ if(todos.indexOf(k)<0) todos.push(k); });
  todos.sort();
  if(!todos.length) return '';
  var de=q('#rxDe')&&q('#rxDe').value, ate=q('#rxAte')&&q('#rxAte').value;
  de=de||CUR.de; ate=ate||CUR.ate;
  var opts=function(sel){ return todos.map(function(k){
    return '<option value="'+k+'"'+(k===sel?' selected':'')+'>'+L(k)+'</option>'; }).join(''); };
  var lojas=(DATA.meta.lojas||[]);
  return '<label>Período</label><select id="rxDe">'+opts(de)+'</select>'
    + '<span style="color:var(--rx-tx3)">até</span><select id="rxAte">'+opts(ate)+'</select>'
    + '<button class="btn ghost sm" id="rxFull" type="button">Tudo</button>'
    + (lojas.length>1? '<select id="rxLoja" title="Filtrar por loja"><option value="">Todas as lojas</option>'
        + lojas.map(function(l){ return '<option value="'+esc(l.id)+'"'+(OPTS.storeId===l.id?' selected':'')+'>'+esc(l.nome)+'</option>'; }).join('')
        + '</select>' : '')
    + '<label class="rx-chk"><input type="checkbox" id="rxHist"'+(OPTS.incluirHistorico?' checked':'')+'> histórico importado</label>'
    + '<button class="btn ghost sm" id="rxReload" type="button" title="Buscar de novo no sistema">↻</button>'
    + '<button class="btn ghost sm" type="button" data-rxprint="1" title="Imprimir ou salvar em PDF">🖨️</button>';
}
function tabsHtml(){
  return TABS.map(function(t){
    if(!t) return '<span class="rx-sep"></span>';
    return '<button type="button" data-rxview="'+t[0]+'" class="'+(VIEW===t[0]?'act':'')+'">'+t[1]+'</button>';
  }).join('');
}
var CUR={de:null, ate:null};

function paint(){
  var host=el(); if(!host) return;
  if(!host.dataset.rxReady){ host.innerHTML=shell(); host.dataset.rxReady='1'; }

  if(LOADING){
    q('#rxBody').innerHTML='<div class="rx-card"><div class="rx-empty"><div class="rx-ico">⏳</div>'
      +'<p>Lendo os lançamentos e o movimento de vendas…</p></div></div>';
    q('#rxCtrl').innerHTML=''; q('#rxTabs').innerHTML=''; return;
  }
  if(ERRO){
    q('#rxBody').innerHTML='<div class="rx-card"><div class="rx-empty"><div class="rx-ico">⚠️</div>'
      +'<p><b>Não consegui montar o relatório.</b></p><p style="font-size:13px">'+esc(ERRO)+'</p>'
      +'<p style="margin-top:12px"><button class="btn sm" type="button" id="rxRetry">Tentar de novo</button></p></div></div>';
    q('#rxCtrl').innerHTML=''; q('#rxTabs').innerHTML='';
    var rb=q('#rxRetry'); if(rb) rb.onclick=function(){ load(true); };
    return;
  }
  if(!A){
    q('#rxBody').innerHTML='<div class="rx-card"><div class="rx-empty"><div class="rx-ico">📊</div>'
      +'<p><b>Ainda não há dados suficientes.</b></p>'
      +'<p style="font-size:13px">O Raio-X precisa de lançamentos em Contas a pagar e de vendas registradas no PDV. Assim que existir pelo menos um mês com movimento, o relatório aparece aqui automaticamente.</p></div></div>';
    q('#rxCtrl').innerHTML=''; q('#rxTabs').innerHTML=''; return;
  }

  var t=TITLES[VIEW]||['',''];
  q('#rxTtl').textContent=t[0];
  q('#rxDsc').textContent=t[1];
  q('#rxCtrl').innerHTML=ctrlHtml();
  q('#rxTabs').innerHTML=tabsHtml();
  q('#rxBody').innerHTML=(RENDER[VIEW]||vVisao)();
  printhead();
  wire();
  var c=document.querySelector('.bo-content'); if(c) c.scrollTop=0;
}
function printhead(){
  var el2=q('#rxPrinthead'); if(!el2||!A) return;
  var t=TITLES[VIEW]||['',''];
  el2.textContent=(A.meta.empresa? A.meta.empresa+' · ':'')+'Raio-X Financeiro · '+t[0]
    +' · período '+L(A.meses[0])+' a '+L(A.meses[A.meses.length-1])
    +' · gerado em '+new Date().toLocaleDateString('pt-BR')+' às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}
function wire(){
  qa('[data-rxview]').forEach(function(b){
    b.onclick=function(){ VIEW=b.dataset.rxview; paint(); };
  });
  qa('[data-rxprint]').forEach(function(b){ b.onclick=doPrint; });
  var de=q('#rxDe'), ate=q('#rxAte'), full=q('#rxFull'), hist=q('#rxHist'), loja=q('#rxLoja'), rel=q('#rxReload');
  if(de) de.onchange=function(){ CUR.de=de.value; recalc(); paint(); };
  if(ate) ate.onchange=function(){ CUR.ate=ate.value; recalc(); paint(); };
  if(full) full.onclick=function(){
    var todos=allMonths(); if(!todos.length) return;
    CUR.de=todos[0]; CUR.ate=todos[todos.length-1]; recalc(); paint();
  };
  if(hist) hist.onchange=function(){ OPTS.incluirHistorico=hist.checked; rebuild(); paint(); };
  if(loja) loja.onchange=function(){ OPTS.storeId=loja.value; load(true); };
  if(rel) rel.onclick=function(){ load(true); };

  /* substituicao manual da margem: excecao declarada, nao o caminho normal */
  var mm=q('#rxMargemManual');
  if(mm) mm.onchange=function(){
    CFG.margemManual=mm.checked;
    var i=q('#rxcfg_margem'); if(i) i.disabled=!mm.checked;
    if(!mm.checked){ saveCfg(); recalc(); paint();
      say('Margem de volta à medição do sistema.'); }
  };
  var ap=q('#rxCfgApply');
  if(ap) ap.onclick=function(){
    ['txCred','txDeb','aliq','prazoCred'].forEach(function(k){
      var i=q('#rxcfg_'+k); if(i){ var v=parseFloat(i.value); if(isFinite(v)) CFG[k]=v; }
    });
    saveCfg(); recalc(); VIEW='visao'; paint();
    say('Relatório recalculado com as novas premissas.');
  };
  var am=q('#rxMargemAplicar');
  if(am) am.onclick=function(){
    var i=q('#rxcfg_margem'), v=i?parseFloat(i.value):NaN;
    if(isFinite(v)) CFG.margem=v;
    CFG.margemManual=!!(mm&&mm.checked);
    saveCfg(); recalc(); paint();
    say(CFG.margemManual? 'Relatório recalculado com a margem informada.'
                        : 'Margem de volta à medição do sistema.');
  };
  var rs=q('#rxCfgReset');
  if(rs) rs.onclick=function(){ CFG=Object.assign({},CFG_DEFAULT); saveCfg(); recalc(); paint(); };
  qa('.rx-med').forEach(function(b){
    b.onclick=function(){
      var i=q('#rxcfg_'+b.dataset.usar); if(i) i.value=b.dataset.val;
    };
  });
}
function doPrint(){
  document.body.classList.add('rx-print');
  printhead();
  var clean=function(){ document.body.classList.remove('rx-print'); window.removeEventListener('afterprint',clean); };
  window.addEventListener('afterprint',clean);
  setTimeout(function(){ window.print(); setTimeout(clean,1500); },60);
}
function say(msg,err){
  if(typeof root.toast==='function'){ root.toast(msg,err); return; }
  if(typeof toast==='function'){ toast(msg,err); return; }
}

function allMonths(){
  if(!DATA) return [];
  var todos=DATA.mesesContas.slice();
  DATA.mesesReceita.forEach(function(k){ if(todos.indexOf(k)<0) todos.push(k); });
  return todos.sort();
}
function defaultRange(){
  var todos=allMonths(); if(!todos.length) return null;
  var r=DATA.mesesReceita;
  return { de: r.length? r[0] : todos[0], ate: r.length? r[r.length-1] : todos[todos.length-1] };
}
function recalc(){
  if(!DATA) { A=null; return; }
  var todos=allMonths(); if(!todos.length){ A=null; return; }
  var de=CUR.de||todos[0], ate=CUR.ate||todos[todos.length-1];
  if(todos.indexOf(de)<0) de=todos[0];
  if(todos.indexOf(ate)<0) ate=todos[todos.length-1];
  if(de>ate){ var t=de; de=ate; ate=t; }
  CUR.de=de; CUR.ate=ate;
  A=analyze(DATA,de,ate,CFG);
  root.__RAIOX_A=A;   // atalho de inspeção
}
function rebuild(){
  if(!RAW) return;
  DATA=fromDataset(RAW,OPTS);
  var r=defaultRange();
  if(r && (!CUR.de || allMonths().indexOf(CUR.de)<0)){ CUR.de=r.de; CUR.ate=r.ate; }
  recalc();
}

/* ---------- carregamento ---------- */
function sbClient(){
  if(root.ONPDV_SB) return root.ONPDV_SB;
  try{ return sb; }catch(e){ return null; }
}
var loaded=false, loading=null;
function load(force){
  if(loading) return loading;
  if(loaded && !force){ paint(); return Promise.resolve(); }
  var client=sbClient();
  if(!client){ ERRO='Conexão com o banco indisponível.'; paint(); return Promise.resolve(); }
  LOADING=true; ERRO=null; paint();
  loading=client.rpc('erp_raiox_dataset',{ p_store: OPTS.storeId || null })
    .then(function(res){
      if(res.error) throw new Error(res.error.message||'Falha ao ler os dados.');
      RAW=res.data||{};
      OPTS.incluirHistorico = OPTS.incluirHistorico && (RAW.receitas||[]).some(function(r){return r.src==='hist';});
      DATA=fromDataset(RAW,OPTS);
      var r=defaultRange();
      if(r){ CUR.de=r.de; CUR.ate=r.ate; recalc(); } else { A=null; }
      loaded=true;
    })
    .catch(function(e){
      ERRO=(e&&e.message)||'Falha ao ler os dados.';
      console.error('[raio-x]',e);
    })
    .then(function(){ LOADING=false; loading=null; paint(); });
  return loading;
}

/* ---------- API pública ---------- */
root.ONPDV_RAIOX={
  open:function(){ var h=el(); if(h) h.dataset.rxReady=''; load(false); },
  reload:function(){ return load(true); },
  invalidate:function(){ loaded=false; },
  /* expostos para teste automatizado (supabase/tests) */
  _engine:{
    fromDataset:fromDataset, analyze:analyze, blocoDe:blocoDe, lojaKey:lojaKey,
    findings:findings, fm:fm, pc:pc, CFG_DEFAULT:CFG_DEFAULT,
    /* renderiza todas as abas sem DOM: devolve {aba: html} */
    renderAll:function(payload,opts,cfg,de,ate){
      DATA=fromDataset(payload,opts||{});
      if(cfg) CFG=Object.assign({},CFG_DEFAULT,cfg);
      var todos=allMonths();
      CUR.de=de||(defaultRange()||{}).de||todos[0];
      CUR.ate=ate||(defaultRange()||{}).ate||todos[todos.length-1];
      recalc();
      var out={};
      Object.keys(RENDER).forEach(function(v){ VIEW=v; out[v]=RENDER[v](); });
      out.__analise=A;
      return out;
    }
  }
};

})(typeof window!=='undefined'?window:globalThis);
