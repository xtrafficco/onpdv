/* Dataset de teste do Raio-X Financeiro, no mesmo formato de erp_raiox_dataset.
   Usado pelo teste de motor (raiox.js) e pelo harness visual (raiox-ui.html). */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.RAIOX_FIXTURE = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function build() {
    var contas = [], receitas = [];
    var MESES = ['2026-03', '2026-04', '2026-05', '2026-06'];
    var LOJAS = ['Modelo', 'Iconha', 'Reta'];
    var pad = function (n) { return String(n).padStart(2, '0'); };

    MESES.forEach(function (ym) {
      for (var k = 0; k < 12; k++) {
        var dia = 3 + k * 2, atrasado = k % 4 === 0;
        contas.push({
          conta: 'Modelo', status: 'PAGA', forn: 'Fornecedor ' + (k % 5),
          venc: ym + '-' + pad(dia), val: 4000 + k * 120, juros: atrasado ? 35.5 : 0,
          pago: 4000 + k * 120, dtp: ym + '-' + pad(Math.min(28, dia + (atrasado ? 9 : 0))),
          cat: 'Fornecedor', cc: 'Custo com Fornecedor'
        });
      }
      [['Custo com Funcionário', 'Salários', 9000],
       ['Despesa Fixa', 'Aluguel', 4200],
       ['Despesa Fixa', 'Energia Elétrica', 900],
       ['Despesa Administrativa', 'Combustíveis', 400],
       ['Imposto', 'Simples Nacional', 1200],
       ['Despesa Pessoal', 'Despesas Pessoais dos Sócios', 1500],
       ['Despesa Financeira', 'Empréstimo bancário', 800]
      ].forEach(function (f, j) {
        contas.push({ conta: LOJAS[j % 3], status: 'PAGA', forn: f[1], venc: ym + '-10',
          val: f[2], juros: 0, pago: f[2], dtp: ym + '-10', cat: f[1], cc: f[0] });
      });
      contas.push({ conta: 'Iconha', status: 'PAGA', forn: 'Transferência de Modelo',
        venc: ym + '-15', val: 6000, juros: 0, pago: 6000, dtp: ym + '-15',
        cat: 'Transferência interna de mercadoria', cc: 'Transferência interna' });
      contas.push({ conta: 'Reta', status: 'PAGA', forn: 'Transferência de Modelo',
        venc: ym + '-15', val: 5000, juros: 0, pago: 5000, dtp: ym + '-15',
        cat: 'Transferência interna de mercadoria', cc: 'Transferência interna' });

      for (var dia2 = 1; dia2 <= 26; dia2++) {
        LOJAS.forEach(function (loja, li) {
          var base = 900 - li * 220 + (dia2 % 7) * 40, dt = ym + '-' + pad(dia2);
          receitas.push({ d: dt, v: base * 0.62, n: 14, loja: loja, forma: 'Dinheiro', src: 'pdv' });
          receitas.push({ d: dt, v: base * 0.24, n: 5, loja: loja, forma: 'Cartão de crédito', src: 'pdv' });
          receitas.push({ d: dt, v: base * 0.14, n: 3, loja: loja, forma: 'PIX', src: 'pdv' });
        });
      }
    });

    var hoje = new Date();
    [-40, -20, -5, 0, 3, 12, 45].forEach(function (delta, i) {
      var d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + delta);
      contas.push({
        conta: LOJAS[i % 3], status: delta < 0 ? 'EM ATRASO' : 'A VENCER',
        forn: 'Fornecedor ' + (i % 5),
        venc: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
        val: 3000 + i * 400, juros: 0, pago: 0, dtp: null,
        cat: 'Fornecedor', cc: 'Custo com Fornecedor'
      });
    });

    receitas.push({ d: '2026-01-01', v: 160000, n: 0, loja: 'Iconha',
                    forma: '(histórico importado)', src: 'hist' });

    return {
      gerado_em: new Date().toISOString(),
      contas: contas, receitas: receitas,
      meta: {
        empresa: 'PETVILLE RAÇÕES E BAZAR LTDA',
        lojas: LOJAS.map(function (n, i) { return { id: 'id-' + i, nome: n, matriz: i === 0 }; }),
        cmv_mes: [{ ym: '2026-06', cmv: 3400, rec_com_custo: 5000, rec_itens: 6000 }],
        devolucoes: [],
        estoque: LOJAS.map(function (n, i) { return { loja: n, valor: 30000 - i * 9000, unidades: 800 - i * 200 }; }),
        taxa_cartao: { credito: 4.12, debito: 1.44, amostras: 320 },
        contagem: { contas: contas.length, vendas: 1000, produtos_sem_custo: 16 }
      },
      _meses: MESES, _lojas: LOJAS
    };
  }

  return { build: build };
});
