/* Teste do Raio-X Financeiro sem navegador.
   Monta um dataset com o mesmo formato de erp_raiox_dataset, roda o motor
   de análise e renderiza as 11 abas, conferindo os números-chave.

   Uso:  node supabase/tests/raiox.js
*/
'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

/* ---- carrega o módulo do navegador num contexto mínimo ---- */
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'js', 'onpdv-raiox.js'), 'utf8');
const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'onpdv-raiox.js' });
const E = sandbox.ONPDV_RAIOX._engine;

const payload = require('./raiox-fixture.js').build();
const contas = payload.contas;
const receitas = payload.receitas;
const LOJAS = payload._lojas;

/* ---- 1. leitura do dataset ---- */
let d = E.fromDataset(payload, { incluirHistorico: false });
assert.strictEqual(d.contas.length, contas.length, 'todas as contas devem ser lidas');
assert.ok(d.mesesReceita.indexOf('2026-01') < 0, 'histórico desligado não deve criar mês');
assert.ok(d.medido.margem > 0.3 && d.medido.margem < 0.35, 'margem medida deve sair do cmv_mes');

const comHist = E.fromDataset(payload, { incluirHistorico: true });
assert.ok(comHist.mesesReceita.indexOf('2026-01') > -1, 'histórico ligado deve criar o mês');

/* ---- 2. classificação de centro de custo ---- */
assert.strictEqual(E.blocoDe('Custo com Fornecedor', 'Fornecedor'), 'FORNECEDOR');
assert.strictEqual(E.blocoDe('Custo com Funcionário', 'Salários'), 'FOLHA');
assert.strictEqual(E.blocoDe('Despesa Fixa', 'Aluguel'), 'OCUPACAO');
assert.strictEqual(E.blocoDe('Despesa Administrativa', 'Combustíveis'), 'ADM');
assert.strictEqual(E.blocoDe('Imposto', 'Simples Nacional'), 'IMPOSTO');
assert.strictEqual(E.blocoDe('Despesa Pessoal', 'Despesas Pessoais dos Sócios'), 'SOCIOS');
assert.strictEqual(E.blocoDe('Despesa Financeira', 'Empréstimo bancário'), 'FINANC');
assert.strictEqual(E.blocoDe('Transferência interna', 'Transferência interna de mercadoria'), 'TRANSF');

/* ---- 3. análise ---- */
const A = E.analyze(d, '2026-03', '2026-06', E.CFG_DEFAULT);

const receitaEsperada = receitas
  .filter(r => r.src === 'pdv')
  .reduce((s, r) => s + r.v, 0);
assert.ok(Math.abs(A.rec.total - receitaEsperada) < 0.01, 'receita do período deve bater com a soma das vendas');

const vendasEsperadas = receitas.filter(r => r.src === 'pdv').reduce((s, r) => s + r.n, 0);
assert.strictEqual(A.rec.n, vendasEsperadas, 'contagem de vendas deve somar o campo n, não as linhas');

// transferências ficam FORA do total de despesas e DENTRO do custo da loja de destino
const transfEsperada = 4 * (6000 + 5000);
assert.strictEqual(A.desp.transf, transfEsperada, 'transferências devem ser somadas à parte');
assert.ok(!('TRANSF' in A.desp.bloco), 'transferência não pode virar bloco de despesa');
const iconha = A.lojas.find(l => l.loja === 'Iconha');
assert.ok(iconha && iconha.transf === 4 * 6000, 'mercadoria recebida vai para a loja de destino');
const central = A.lojas.find(l => l.hub);
assert.strictEqual(central.loja, 'Modelo', 'a loja que mais compra é a central');
assert.strictEqual(central.aj, -transfEsperada, 'a central devolve a mercadoria repassada');

// juros e atraso
const jurosEsperado = 4 * 3 * 35.5;
assert.ok(Math.abs(A.desp.juros - jurosEsperado) < 0.01, 'juros somados do campo próprio');
assert.ok(A.atraso.nAtr === 12 && A.atraso.medDias === 9, 'atraso medido entre vencimento e pagamento');

// DRE coerente
assert.ok(Math.abs(A.dre.lucroBruto - (A.dre.receita - A.dre.taxaCartao - A.dre.cmv)) < 0.01);
assert.ok(Math.abs(A.dre.resultado - (A.dre.lucroBruto - A.dre.despOper)) < 0.01);
assert.ok(Math.abs(A.dre.resultadoAjust - (A.dre.resultado - A.dre.gapImposto)) < 0.01);
assert.ok(Math.abs(A.dre.varEstoque - (A.dre.compras - A.dre.cmv)) < 0.01);
const somaMes = A.dreMes.reduce((s, x) => s + x.rec, 0);
assert.ok(Math.abs(somaMes - A.rec.total) < 0.01, 'abertura mensal deve fechar com o total');

// em aberto usa a base inteira e ignora transferências
assert.strictEqual(A.aberto.itens.length, 7, 'sete parcelas em aberto');
assert.ok(A.aberto.vencido > 0 && A.aberto.aVencer > 0);
assert.strictEqual(A.proj.length, 13, 'projeção de 13 semanas');

// curva ABC fecha 100%
const somaAbc = A.abcResumo.reduce((s, o) => s + o.val, 0);
assert.ok(Math.abs(somaAbc - A.dre.compras) < 0.01, 'ABC deve somar o total comprado');

// estoque medido chega do meta
assert.strictEqual(A.estoqueMedido.total, 30000 + 21000 + 12000);

// indicadores e achados
assert.ok(A.indic.length >= 18, 'painel de indicadores completo');
assert.ok(A.findings.length > 0, 'diagnóstico deve encontrar algo neste cenário');
A.findings.forEach(f => {
  assert.ok(['c', 'a', 'b'].includes(f.sev), 'severidade válida');
  assert.ok(f.tit && f.txt, 'achado precisa de título e texto');
});

/* ---- 4. renderização das 11 abas ---- */
const views = sandbox.ONPDV_RAIOX._engine.renderAll(payload, { incluirHistorico: false });
['visao', 'dre', 'lojas', 'compras', 'fornec', 'pagar', 'atrasos', 'diag', 'plano', 'relatorio', 'config']
  .forEach(v => {
    const html = views[v];
    assert.ok(typeof html === 'string' && html.length > 500, `aba ${v} deve gerar HTML`);
    assert.ok(html.indexOf('undefined') < 0, `aba ${v} não pode conter "undefined"`);
    assert.ok(html.indexOf('NaN') < 0, `aba ${v} não pode conter "NaN"`);
    assert.ok(html.indexOf('[object Object]') < 0, `aba ${v} não pode conter "[object Object]"`);
  });
assert.ok(views.relatorio.indexOf('Capítulo 14') > -1, 'o relatório completo tem 14 capítulos');
assert.ok(views.relatorio.indexOf('rx-cover') > -1, 'o relatório tem capa');

/* ---- 5. período de um único mês (caso-limite) ---- */
const A1 = E.analyze(d, '2026-06', '2026-06', E.CFG_DEFAULT);
assert.strictEqual(A1.meses.length, 1);
assert.strictEqual(A1.tendencia, null, 'um mês não gera tendência');
const v1 = sandbox.ONPDV_RAIOX._engine.renderAll(payload, {}, null, '2026-06', '2026-06');
assert.ok(v1.relatorio.indexOf('NaN') < 0, 'relatório de mês único sem NaN');

/* ---- 6. base vazia ---- */
const vazio = E.fromDataset({ contas: [], receitas: [], meta: {} }, {});
assert.strictEqual(vazio.contas.length, 0);
assert.strictEqual(vazio.mesesContas.length, 0);

console.log('Raio-X Financeiro: todos os testes passaram.');
console.log('  receita            ', E.fm(A.rec.total));
console.log('  saídas             ', E.fm(A.desp.total));
console.log('  compras            ', E.fm(A.dre.compras));
console.log('  CMV estimado       ', E.fm(A.dre.cmv));
console.log('  resultado ajustado ', E.fm(A.dre.resultadoAjust));
console.log('  achados            ', A.findings.length);
