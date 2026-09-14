#!/usr/bin/env node
// Guardas de frontend. São invariantes que o ONPDV já cumpre hoje — o objetivo é
// que continuem valendo sem depender de alguém lembrar na revisão.
//
//  1. Todo HTML servido tem CSP estrita no <meta>.
//  2. Nenhum script-src aceita 'unsafe-inline' ou 'unsafe-eval'.
//  3. Nenhuma página tem <script> inline com código (o padrão da casa é delegação
//     por data-act/data-onclick, e um inline quebraria a própria CSP).
//  4. Todo .json e .webmanifest é JSON válido.
//
// Uso: node scripts/check-frontend.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const problemas = [];
const erro = (arquivo, msg) => problemas.push(`${arquivo}: ${msg}`);

const naRaiz = readdirSync(raiz);
const paginas = naRaiz.filter((f) => extname(f) === '.html');
const jsons = naRaiz.filter((f) => ['.json', '.webmanifest'].includes(extname(f)));

if (!paginas.length) erro('raiz', 'nenhum .html encontrado — o script está no lugar certo?');

for (const pagina of paginas) {
  const html = readFileSync(join(raiz, pagina), 'utf8');

  const meta = html.match(
    /<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*content=["']([\s\S]*?)["']\s*>/i,
  );
  if (!meta) {
    erro(pagina, 'sem <meta> de Content-Security-Policy');
  } else {
    const csp = meta[1].replace(/\s+/g, ' ').trim();
    const scriptSrc = csp.match(/script-src([^;]*)/i);
    if (!scriptSrc) erro(pagina, 'CSP sem script-src');
    else {
      if (/'unsafe-inline'/.test(scriptSrc[1])) erro(pagina, "script-src aceita 'unsafe-inline'");
      if (/'unsafe-eval'/.test(scriptSrc[1])) erro(pagina, "script-src aceita 'unsafe-eval'");
    }
    if (!/default-src\s+'self'/i.test(csp)) erro(pagina, "CSP sem default-src 'self'");
    if (!/object-src\s+'none'/i.test(csp)) erro(pagina, "CSP sem object-src 'none'");
  }

  // Zoom: nenhuma página pode impedir o usuário de ampliar. É requisito de
  // acessibilidade (WCAG 1.4.4) e aqui não compra nada — os campos das telas
  // móveis já usam 16px, que é o que evita o autozoom do iOS.
  const viewport = html.match(/<meta[^>]+name=["']viewport["'][^>]*content=["']([^"']*)["']/i);
  if (!viewport) erro(pagina, 'sem <meta name="viewport">');
  else {
    const v = viewport[1].replace(/\s+/g, '');
    if (/user-scalable=no/i.test(v)) erro(pagina, 'viewport com user-scalable=no (bloqueia o zoom)');
    const max = v.match(/maximum-scale=([\d.]+)/i);
    if (max && parseFloat(max[1]) < 2) erro(pagina, `viewport com maximum-scale=${max[1]} (bloqueia o zoom)`);
  }

  // <script> com corpo (ignorando os que só têm src=)
  const scripts = html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi);
  for (const [, attrs, corpo] of scripts) {
    if (/\bsrc\s*=/.test(attrs)) continue;
    if (corpo.trim()) erro(pagina, 'tem <script> inline com código (a CSP estrita bloqueia)');
  }
}

for (const arquivo of jsons) {
  try {
    JSON.parse(readFileSync(join(raiz, arquivo), 'utf8'));
  } catch (e) {
    erro(arquivo, `JSON inválido: ${e.message}`);
  }
}

// 5. Rótulos de formulário: todo <label for="x"> tem que apontar para um id que
//    existe no mesmo arquivo. Um for= órfão é pior que rótulo nenhum — o leitor
//    de tela anuncia um campo que não é aquele.
for (const arquivo of ['partials/onpdv-app.html', 'assets/js/onpdv-app.js',
                       'cliente.html', 'entregador.html', 'vitrine.html']) {
  let conteudo;
  try { conteudo = readFileSync(join(raiz, arquivo), 'utf8'); } catch { continue; }

  const ids = new Set([...conteudo.matchAll(/\bid="([^"]*)"/g)].map((m) => m[1]));
  const fors = [...conteudo.matchAll(/<label\b[^>]*\bfor="([^"]*)"/g)].map((m) => m[1]);

  for (const alvo of new Set(fors)) {
    if (!ids.has(alvo) && !/[`${}]/.test(alvo)) {
      erro(arquivo, `<label for="${alvo}"> aponta para um id que não existe`);
    }
  }
  const repetidos = [...new Set(fors.filter((f, i) => fors.indexOf(f) !== i))];
  for (const r of repetidos) {
    erro(arquivo, `id "${r}" é alvo de mais de um <label for=> (um deles está errado)`);
  }
}

// 6. Módulos carregados sob demanda (Raio-X, Compras): o arquivo precisa existir
//    E estar na lista do Service Worker. Se ficar de fora do cache, a aba abre no
//    escritório e falha na loja quando a internet cai — que é justamente o caso
//    para o qual o ONPDV existe.
{
  const app = readFileSync(join(raiz, 'assets/js/onpdv-app.js'), 'utf8');
  const sw = readFileSync(join(raiz, 'sw.js'), 'utf8');
  const dinamicos = [...app.matchAll(/\.src\s*=\s*['"](assets\/[^'"]+\.js)['"]/g)].map((m) => m[1]);

  if (!dinamicos.length) erro('assets/js/onpdv-app.js', 'nenhum módulo sob demanda encontrado — o padrão mudou?');

  for (const caminho of [...new Set(dinamicos)]) {
    try {
      readFileSync(join(raiz, caminho));
    } catch {
      erro('assets/js/onpdv-app.js', `carrega "${caminho}" sob demanda, mas o arquivo não existe`);
      continue;
    }
    if (!sw.includes(`./${caminho}`)) {
      erro('sw.js', `"${caminho}" é carregado sob demanda mas não está no SHELL (não abriria offline)`);
    }
  }
}

if (problemas.length) {
  console.error('Guardas de frontend falharam:\n');
  for (const p of problemas) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`Guardas de frontend OK (${paginas.length} páginas, ${jsons.length} arquivos JSON).`);
