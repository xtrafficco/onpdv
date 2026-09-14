#!/usr/bin/env node
// Associa cada <label> visual ao seu campo, adicionando for="<id>".
//
// O ERP tinha ~290 campos cujo rótulo era apenas visual: o padrão
// `<label class="lbl">Nome *</label><input id="cfNome">` mostra o texto para
// quem enxerga, mas não diz a leitor de tela nenhum que aquele texto é o nome
// daquele campo — e também não faz o clique no rótulo focar o campo.
//
// Regras, na ordem:
//   1. Label que já tem `for=`            → não mexe.
//   2. Label que ENVOLVE um controle      → não mexe (envolver já associa).
//   3. Label seguido de controle com id   → recebe for="<id>".
//   4. Qualquer outro caso                → não mexe, e é listado no relatório
//      (rótulo de container, id dinâmico, controle sem id: nenhum deles pode
//      ser resolvido mecanicamente sem chutar).
//
// Idempotente: rodar de novo não muda nada. Use --escrever para aplicar;
// sem a flag, só mostra o que faria.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const escrever = process.argv.includes('--escrever');
const ALVOS = ['partials/onpdv-app.html', 'assets/js/onpdv-app.js'];

const JANELA = 220;              // quanto olhar depois do </label>
const CONTROLE = /<(input|select|textarea)\b([^>]*)>/;

let totalAlterados = 0;
const pulados = [];

for (const alvo of ALVOS) {
  const caminho = join(raiz, alvo);
  const original = readFileSync(caminho, 'utf8');

  // Lookahead para não consumir o contexto: sem isso, um label vizinho que
  // caia dentro da janela do anterior seria pulado em silêncio.
  const re = /<label\b([^>]*)>([\s\S]*?)<\/label>(?=([\s\S]{0,220}))/g;
  let edicoes = [];
  let m;

  while ((m = re.exec(original))) {
    const [tudo, attrs, dentro, depois] = m;
    // Posição do ">" que fecha a tag de abertura. O atributo entra ANTES dele —
    // depois do ">" começa o texto visível do rótulo, e o atributo apareceria
    // escrito na tela.
    const posFecha = m.index + '<label'.length + attrs.length;

    if (/\bfor\s*=/.test(attrs)) continue;              // regra 1
    if (CONTROLE.test(dentro)) continue;                // regra 2

    const ctrl = depois.match(CONTROLE);
    if (!ctrl) {
      pulados.push({ alvo, motivo: 'nenhum controle depois do rótulo', trecho: resumo(tudo) });
      continue;
    }
    const id = ctrl[2].match(/\bid="([^"]*)"/);
    if (!id) {
      pulados.push({ alvo, motivo: 'controle sem id', trecho: resumo(tudo) });
      continue;
    }
    if (/[`${}]/.test(id[1])) {
      pulados.push({ alvo, motivo: 'id montado em template', trecho: resumo(tudo) });
      continue;
    }

    // Entre o </label> e o controle pode haver uma VARIÁVEL com o HTML do campo
    // (ex.: `<label>Terminal</label>' + termField + '`). Não dá para ver dentro
    // dela, então o primeiro controle que aparece depois é de OUTRO rótulo — foi
    // assim que "Terminal" quase recebeu o campo do "Troco inicial".
    const gap = depois.slice(0, depois.indexOf(ctrl[0]));
    if (/\+\s*[A-Za-z_$]/.test(gap) || /[A-Za-z_$]\s*\+/.test(gap) || /\$\{/.test(gap)) {
      pulados.push({ alvo, motivo: 'campo vem de variável — alvo incerto', trecho: resumo(tudo) });
      continue;
    }

    edicoes.push({ posFecha, id: id[1], texto: resumo(dentro) });   // regra 3
  }

  // Nenhum id pode ser reivindicado por dois rótulos: se acontecer, pelo menos um
  // está errado, e um rótulo errado é pior que rótulo nenhum. Descarta os dois.
  const vezes = {};
  for (const e of edicoes) vezes[e.id] = (vezes[e.id] || 0) + 1;
  const ambiguos = edicoes.filter((e) => vezes[e.id] > 1);
  for (const e of ambiguos) {
    pulados.push({ alvo, motivo: `id "${e.id}" disputado por mais de um rótulo`, trecho: e.texto });
  }
  edicoes = edicoes.filter((e) => vezes[e.id] === 1);

  if (!edicoes.length) { console.log(`${alvo}: nada a fazer`); continue; }

  // De trás para frente: assim cada inserção não desloca as posições seguintes.
  let saida = original;
  for (const e of edicoes.reverse()) {
    saida = saida.slice(0, e.posFecha) + ` for="${e.id}"` + saida.slice(e.posFecha);
  }

  console.log(`${alvo}: ${edicoes.length} rótulos associados`);
  totalAlterados += edicoes.length;
  if (escrever) writeFileSync(caminho, saida);
}

if (pulados.length) {
  console.log(`\nNão associados (${pulados.length}) — precisam de decisão humana:`);
  for (const p of pulados) console.log(`  [${p.motivo}] ${p.trecho}`);
}

console.log(`\nTotal: ${totalAlterados} rótulos${escrever ? ' associados' : ' seriam associados (use --escrever)'}.`);

function resumo(s) {
  return s.replace(/\s+/g, ' ').slice(0, 90);
}
