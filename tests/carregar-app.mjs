// Carrega assets/js/onpdv-app.js fora do navegador para poder testá-lo.
//
// O app é um script clássico de navegador, não um módulo: não tem export e mexe em
// document/window/localStorage já no topo. Em vez de reestruturar o app inteiro (que
// é justamente o risco que não queremos correr), rodamos o arquivo dentro de um
// contexto `vm` cujo global é um stub que absorve qualquer acesso desconhecido — toda
// propriedade lida devolve o próprio stub e toda chamada devolve o próprio stub. Os
// efeitos colaterais do topo acontecem no vazio e as funções ficam testáveis.
//
// A vantagem é testar O ARQUIVO QUE VAI PARA A LOJA, sem uma cópia paralela que
// envelhece sozinha.
//
// Cuidado que custou caro: NÃO dá para recuperar os nomes com `eval` dentro do vm —
// o próprio `eval` resolve no stub, e aí tudo "existe" e todo teste passa sem testar
// nada. Por isso a lista de nomes é explícita e cada valor é conferido contra o stub.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

// Intrínsecos reais: sem eles, `Array`, `Math` e afins cairiam no stub e o código
// sob teste se comportaria de um jeito que nunca aconteceria no navegador.
const INTRINSECOS = [
  'Object', 'Array', 'String', 'Number', 'Boolean', 'Date', 'Math', 'JSON',
  'Promise', 'Error', 'TypeError', 'RangeError', 'RegExp', 'Map', 'Set',
  'WeakMap', 'Symbol', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'encodeURIComponent', 'decodeURIComponent', 'Intl', 'BigInt', 'console',
];

function criarStub() {
  const alvo = function () {};
  const stub = new Proxy(alvo, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive) return () => '';
      if (prop === Symbol.iterator) return function* () {};
      if (prop === 'then') return undefined;          // não se passar por promise
      if (prop === Symbol.toStringTag) return 'Stub';
      return stub;
    },
    set: () => true,
    has: () => true,
    apply: () => stub,
    construct: () => stub,
  });
  return stub;
}

/**
 * Roda o onpdv-app.js num sandbox e devolve os nomes pedidos.
 * @param {string[]} nomes nomes de nível superior (funções ou const) do app
 * @returns {Record<string, any>}
 */
export function carregarApp(nomes) {
  if (!Array.isArray(nomes) || !nomes.length) {
    throw new Error('carregarApp precisa da lista de nomes a extrair');
  }
  for (const n of nomes) {
    if (!/^[A-Za-z_$][\w$]*$/.test(n)) throw new Error(`nome inválido: ${n}`);
  }

  const codigo = readFileSync(join(raiz, 'assets/js/onpdv-app.js'), 'utf8');
  const stub = criarStub();

  const sandbox = Object.create(null);
  for (const k of INTRINSECOS) sandbox[k] = globalThis[k];

  const globalProxy = new Proxy(sandbox, {
    get(alvo, prop) {
      if (prop in alvo) return alvo[prop];
      if (prop === Symbol.unscopables) return undefined;
      return stub;
    },
    set(alvo, prop, valor) { alvo[prop] = valor; return true; },
    has() { return true; },     // faz qualquer nome livre resolver no proxy
    getOwnPropertyDescriptor(alvo, prop) {
      if (prop in alvo) return Object.getOwnPropertyDescriptor(alvo, prop);
      return { value: stub, writable: true, enumerable: false, configurable: true };
    },
  });

  const contexto = vm.createContext(globalProxy);
  // A epílogo referencia os nomes LEXICALMENTE (sem eval), então `const`/`let` de
  // nível superior também são capturados.
  const epilogo = `\n;var __api = { ${nomes.join(', ')} };`;
  new vm.Script(codigo + epilogo, { filename: 'onpdv-app.js' })
    .runInContext(contexto, { timeout: 30000 });

  const api = sandbox.__api;
  if (!api) throw new Error('o epílogo de exportação não rodou');

  const faltando = nomes.filter((n) => api[n] === stub || api[n] === undefined);
  if (faltando.length) {
    throw new Error(
      `não encontrei em onpdv-app.js: ${faltando.join(', ')}. ` +
      'O nome mudou? (valores que caem no stub são tratados como ausentes de propósito, ' +
      'para o teste não passar em cima de nada.)'
    );
  }
  return api;
}
