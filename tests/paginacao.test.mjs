// fetchAllRows existe para um bug que não dá erro: quando a consulta passa do teto
// de linhas do PostgREST, a resposta volta 200 OK com menos linhas do que existem e
// o que ficou de fora simplesmente some da tela. Estes testes cobrem justamente os
// casos em que uma paginação ingênua perderia linhas em silêncio.

import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarApp } from './carregar-app.mjs';

const { fetchAllRows, PAGE_SIZE } = carregarApp(['fetchAllRows', 'PAGE_SIZE']);

/**
 * Imita uma tabela servida pelo PostgREST.
 * @param {number} total linhas que existem de verdade
 * @param {number} teto máximo que o servidor devolve numa resposta ("Max rows")
 */
function tabelaFalsa(total, teto = Infinity) {
  const todas = Array.from({ length: total }, (_, i) => ({ id: i }));
  const chamadas = [];
  const novaConsulta = () => ({
    range(de, ate) {
      const pedido = ate - de + 1;
      const fatia = todas.slice(de, de + Math.min(pedido, teto));
      chamadas.push({ de, ate, devolvidas: fatia.length });
      return Promise.resolve({ data: fatia, error: null });
    },
  });
  return { novaConsulta, chamadas, todas };
}

test('traz tudo quando cabe numa página só', async () => {
  const t = tabelaFalsa(42);
  const linhas = await fetchAllRows(t.novaConsulta);
  assert.equal(linhas.length, 42);
  assert.deepEqual([...linhas], t.todas);
});

test('tabela vazia devolve lista vazia sem estourar', async () => {
  const t = tabelaFalsa(0);
  assert.deepEqual([...(await fetchAllRows(t.novaConsulta))], []);
  assert.equal(t.chamadas.length, 1);
});

test('atravessa a fronteira exata de uma página', async () => {
  const t = tabelaFalsa(PAGE_SIZE);
  const linhas = await fetchAllRows(t.novaConsulta);
  assert.equal(linhas.length, PAGE_SIZE, 'não pode parar só porque a página veio cheia');
  assert.equal(t.chamadas.length, 2, 'precisa de uma consulta extra para saber que acabou');
});

test('o caso real: 1.749 produtos com o teto do servidor em 1.000', async () => {
  const t = tabelaFalsa(1749, 1000);
  const linhas = await fetchAllRows(t.novaConsulta);
  assert.equal(linhas.length, 1749, 'nenhum produto pode ficar para trás');
  assert.deepEqual([...linhas].map((r) => r.id), t.todas.map((r) => r.id));
});

test('teto do servidor MENOR que a página não faz perder linhas', async () => {
  // Este é o caso que uma paginação de passo fixo erra: pede 500, recebe 120 e
  // conclui que acabou — ou pula para o offset 500 e perde 380 linhas.
  const t = tabelaFalsa(1000, 120);
  const linhas = await fetchAllRows(t.novaConsulta);
  assert.equal(linhas.length, 1000);
  assert.deepEqual([...linhas].map((r) => r.id), t.todas.map((r) => r.id));
});

test('não pede offsets sobrepostos nem deixa buracos', async () => {
  const t = tabelaFalsa(1200, 250);
  await fetchAllRows(t.novaConsulta);
  let esperado = 0;
  for (const c of t.chamadas) {
    assert.equal(c.de, esperado, 'cada consulta começa onde a anterior parou');
    esperado += c.devolvidas;
  }
});

test('erro do servidor é propagado, não engolido como lista vazia', async () => {
  const novaConsulta = () => ({
    range: () => Promise.resolve({ data: null, error: { message: 'permission denied' } }),
  });
  await assert.rejects(() => fetchAllRows(novaConsulta), (e) => e.message === "permission denied");
});

test('erro no meio da paginação não devolve resultado parcial como se fosse completo', async () => {
  let n = 0;
  const novaConsulta = () => ({
    range(de, ate) {
      n += 1;
      if (n > 1) return Promise.resolve({ data: null, error: { message: 'caiu no meio' } });
      return Promise.resolve({
        data: Array.from({ length: ate - de + 1 }, (_, i) => ({ id: de + i })),
        error: null,
      });
    },
  });
  await assert.rejects(() => fetchAllRows(novaConsulta), (e) => e.message === "caiu no meio");
});
