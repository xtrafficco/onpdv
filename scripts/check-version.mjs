#!/usr/bin/env node
// Guarda de publicação: a versão do ONPDV aparece em quatro lugares e todos
// precisam bater. Quando não batem, o sintoma chega longe da causa — na v56 o
// ONPDV_VERSION ficou na v50 e todo caixa recém-instalado passou a avisar que
// existia uma versão nova, baixando o mesmo instalador para sempre.
//
// Uso:  node scripts/check-version.mjs
// Sai com código 1 e lista as divergências quando algo está fora de sincronia.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (p) => readFileSync(join(raiz, p), 'utf8');

// version.json é a fonte da verdade: é o que os caixas instalados consultam.
const esperado = JSON.parse(ler('version.json')).version;
if (!esperado || !/^\d{4}\.\d{2}\.\d{2}-v\d+$/.test(esperado)) {
  console.error(`version.json: versão ausente ou fora do formato AAAA.MM.DD-vNN (lido: ${esperado ?? '—'})`);
  process.exit(1);
}

// O badge da tela usa " · " no lugar do hífen: 2026.09.09-v56 → "2026.09.09 · v56".
const badgeEsperado = esperado.replace(/-(v\d+)$/, ' · $1');

const pontos = [
  {
    arquivo: 'sw.js',
    descricao: "const CACHE (nome do cache do Service Worker)",
    achar: /const CACHE\s*=\s*'onpdv-([^']+)'/,
    esperado,
  },
  {
    arquivo: 'assets/js/onpdv-app.js',
    descricao: 'ONPDV_VERSION (usado na checagem de atualização do caixa)',
    achar: /const ONPDV_VERSION\s*=\s*'([^']+)'/,
    esperado,
  },
  {
    arquivo: 'partials/onpdv-app.html',
    descricao: 'badge do card "Instalador da Frente de Caixa"',
    achar: /id="pdvInstallerVersion"[^>]*>([^<]+)</,
    esperado: badgeEsperado,
  },
];

const problemas = [];
for (const p of pontos) {
  let conteudo;
  try {
    conteudo = ler(p.arquivo);
  } catch {
    problemas.push(`${p.arquivo}: arquivo não encontrado`);
    continue;
  }
  const m = conteudo.match(p.achar);
  if (!m) {
    problemas.push(`${p.arquivo}: não achei ${p.descricao} — o padrão mudou?`);
    continue;
  }
  const lido = m[1].trim();
  if (lido !== p.esperado) {
    problemas.push(`${p.arquivo}: ${p.descricao}\n    esperado "${p.esperado}"\n    encontrado "${lido}"`);
  }
}

if (problemas.length) {
  console.error(`Versões fora de sincronia (version.json diz ${esperado}):\n`);
  for (const p of problemas) console.error(`  - ${p}`);
  console.error('\nAlinhe os arquivos acima antes de publicar.');
  process.exit(1);
}

console.log(`Versão consistente em todos os arquivos: ${esperado}`);
