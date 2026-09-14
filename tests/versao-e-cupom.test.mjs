// Duas funções puras que já custaram caro em produção:
//
//  • _updateIsNewer decide se o caixa avisa "saiu versão nova". Com ONPDV_VERSION
//    parada na v50 enquanto o site já era v56, todo caixa recém-instalado se
//    autoavisava para sempre. O guarda de versão (scripts/check-version.mjs) impede
//    o descompasso; aqui garantimos que a comparação em si está certa.
//
//  • pdvAscii é o ponto único por onde passa TODO texto enviado à impressora
//    térmica. Se ela deixar passar um acento ou um emoji, sai lixo no cupom do
//    cliente — e só se descobre no balcão.

import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarApp } from './carregar-app.mjs';

const { _updateIsNewer, _verKey, pdvAscii } = carregarApp([
  '_updateIsNewer', '_verKey', 'pdvAscii',
]);

test('_verKey separa data e número da versão', () => {
  assert.deepEqual([..._verKey('2026.09.09-v56')], [20260909, 56]);
  assert.deepEqual([..._verKey('2026.09.01-v50')], [20260901, 50]);
});

test('versão publicada mais nova é reconhecida', () => {
  assert.equal(_updateIsNewer('2026.09.09-v56', '2026.09.01-v50'), true);
});

test('a MESMA versão não pode se anunciar como nova', () => {
  // O sintoma exato do bug: o caixa na v56 sendo avisado de que existe uma v56.
  assert.equal(_updateIsNewer('2026.09.09-v56', '2026.09.09-v56'), false);
});

test('versão mais antiga no site não dispara aviso', () => {
  assert.equal(_updateIsNewer('2026.09.01-v50', '2026.09.09-v56'), false);
});

test('no mesmo dia, decide pelo número da build', () => {
  assert.equal(_updateIsNewer('2026.09.09-v57', '2026.09.09-v56'), true);
  assert.equal(_updateIsNewer('2026.09.09-v56', '2026.09.09-v57'), false);
});

test('v100 é mais nova que v99 (comparação numérica, não alfabética)', () => {
  assert.equal(_updateIsNewer('2026.09.09-v100', '2026.09.09-v99'), true);
});

test('versão vazia ou inválida não dispara aviso', () => {
  assert.equal(_updateIsNewer('', '2026.09.09-v56'), false);
  assert.equal(_updateIsNewer('qualquer coisa', '2026.09.09-v56'), false);
});

test('pdvAscii tira acentos mantendo a letra base', () => {
  assert.equal(pdvAscii('Ração'), 'Racao');
  assert.equal(pdvAscii('Coração'), 'Coracao');
  assert.equal(pdvAscii('ÁÉÍÓÚ áéíóú ÃÕ ãõ Ç ç Ê ê'), 'AEIOU aeiou AO ao C c E e');
});

test('pdvAscii remove emoji do cupom', () => {
  assert.equal(pdvAscii('Obrigado! 🐶🐱').trim(), 'Obrigado!');
});

test('pdvAscii não deixa passar byte acima de 127', () => {
  const saida = pdvAscii('Ração 🐶 — "aspas" R$ 10,00');
  for (const ch of saida) {
    assert.ok(ch.charCodeAt(0) <= 127, `caractere não-ASCII no cupom: ${JSON.stringify(ch)}`);
  }
});

test('pdvAscii preserva o que já é ASCII', () => {
  const puro = 'PEDIDO 1234 / TOTAL R$ 99,90';
  assert.equal(pdvAscii(puro), puro);
});
