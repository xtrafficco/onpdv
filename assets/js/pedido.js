/* pedido.js — página pública de pedido (pedido.html).
 *
 * Aberta pelo link que a mensagem de saudação do WhatsApp Business manda para quem
 * escreve para a loja. Fluxo (app de compras): ENDEREÇO (CEP + número, que decide a
 * loja mais perto) → produtos com foto → carrinho e dados → acompanhar.
 *
 * O que decide preço, distância e se o pedido é aceito é o banco (site_pedido_criar).
 * As contas aqui existem para o cliente ver na tela o mesmo valor que o servidor vai
 * calcular — e as regras seguem as de lá, linha por linha.
 *
 * As funções de nível superior são puras (sem DOM) de propósito, para os testes
 * carregarem este arquivo num sandbox. Tudo que mexe na tela está em iniciar().
 */
'use strict';

const PEDIDO_API = (function () {
  const PADRAO = 'https://qkhpvqepgozsaamxmugk.supabase.co/functions/v1/pedido-site';
  try {
    const u = new URL(location.href);
    if ((u.hostname === 'localhost' || u.hostname === '127.0.0.1') && u.searchParams.get('api')) {
      return u.searchParams.get('api');
    }
  } catch (_) { /* sem location: sandbox de teste */ }
  return PADRAO;
})();

// Base pública do Storage do Supabase (bucket 'produtos'). A CSP de pedido.html libera
// este host em img-src. imagem_path é o nome do objeto (ex.: "<id>.webp"), sem barras.
const STORAGE_PUBLICO = 'https://qkhpvqepgozsaamxmugk.supabase.co/storage/v1/object/public/produtos/';

const CHAVE_CARRINHO = 'pedido.carrinho.v1';
const CHAVE_DADOS = 'pedido.dados.v1';
const CHAVE_ULTIMO = 'pedido.ultimo.v1';

// ------------------------------------------------------------------ regras puras

function arred2(n) {
  const v = Number(n) || 0;
  return Math.round((v + Math.sign(v) * Number.EPSILON) * 100) / 100;
}

const FORMATO_BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
function fmtBRL(n) {
  return FORMATO_BRL.format(Number(n) || 0);
}

function ehGranel(unidade) {
  return String(unidade || '').toUpperCase() === 'KG';
}

/** Granel anda de meio em meio quilo; o resto, de um em um. Igual ao banco. */
function passoQtd(unidade) {
  return ehGranel(unidade) ? 0.5 : 1;
}

function qtdValida(unidade, q) {
  const n = Number(q);
  if (!Number.isFinite(n)) return false;
  if (ehGranel(unidade)) return n > 0 && n <= 100 && Math.abs(n * 2 - Math.round(n * 2)) < 1e-9;
  return n >= 1 && n <= 99 && Number.isInteger(n);
}

/** Próxima quantidade ao tocar em + (direcao 1) ou − (direcao -1). 0 = sai do carrinho. */
function ajustarQtd(unidade, atual, direcao) {
  const passo = passoQtd(unidade);
  const max = ehGranel(unidade) ? 100 : 99;
  const n = arred2((Number(atual) || 0) + direcao * passo);
  if (n < passo - 1e-9) return 0;
  return Math.min(n, max);
}

function fmtQtd(unidade, q) {
  if (!ehGranel(unidade)) return String(q);
  return String(q).replace('.', ',') + ' kg';
}

/**
 * Totais do carrinho com o mesmo arredondamento do banco: cada linha arredondada a
 * centavos, soma das linhas, e o total arredondado de novo com o frete.
 */
function totaisCarrinho(itens, frete) {
  let subtotal = 0;
  let quantidade = 0;
  for (const it of itens || []) {
    subtotal = arred2(subtotal + arred2((Number(it.qtd) || 0) * (Number(it.preco) || 0)));
    quantidade += 1;
  }
  const f = arred2(frete);
  return { subtotal, frete: f, total: arred2(subtotal + f), quantidade };
}

function normalizarFone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  return d;
}

function foneValido(v) {
  const d = normalizarFone(v);
  return d.length === 10 || d.length === 11;
}

/** "50", "50,00", "R$ 1.050,50" → número; vazio ou lixo → null. */
function lerDinheiro(v) {
  let s = String(v == null ? '' : v).replace(/[^\d,.]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? arred2(n) : null;
}

/** Só dígitos do CEP, no máximo 8. */
function soCep(v) {
  return String(v || '').replace(/\D/g, '').slice(0, 8);
}

/** Máscara do CEP enquanto digita: 00000-000. */
function mascaraCep(v) {
  const d = soCep(v);
  return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d;
}

/**
 * Primeiro problema do pedido, na mesma ordem e com o mesmo texto que o banco usa.
 * O endereço é coletado no passo 1; aqui só confirmamos que veio.
 * Devolve { campo, mensagem } ou null.
 */
function validarPedido(dados, totais, pedidoMinimo) {
  const d = dados || {};
  if (!totais || !totais.quantidade) return { campo: null, mensagem: 'Seu carrinho está vazio.' };
  const minimo = Number(pedidoMinimo) || 0;
  if (totais.subtotal < minimo) {
    return { campo: null, mensagem: 'O pedido mínimo desta loja é ' + fmtBRL(minimo) + '.' };
  }
  if (String(d.nome || '').trim().length < 2) return { campo: 'fNome', mensagem: 'Informe seu nome.' };
  if (!foneValido(d.telefone)) return { campo: 'fFone', mensagem: 'Informe o WhatsApp com DDD.' };
  if (String(d.endereco || '').trim().length < 5) {
    return { campo: null, mensagem: 'Falta o endereço de entrega. Toque em "Editar" para informar.' };
  }
  if (!['dinheiro', 'cartao', 'pix'].includes(d.pagamento)) {
    return { campo: 'pagDinheiro', mensagem: 'Escolha a forma de pagamento.' };
  }
  if (d.pagamento === 'dinheiro' && d.troco_para != null && d.troco_para < totais.total) {
    return { campo: 'fTroco', mensagem: 'O valor para troco precisa ser maior que o total do pedido.' };
  }
  return null;
}

function linkWhatsApp(numero, texto) {
  const d = String(numero || '').replace(/\D/g, '');
  if (!d) return '';
  return 'https://wa.me/' + d + '?text=' + encodeURIComponent(texto || '');
}

function mensagemParaLoja(st) {
  return 'Olá! Fiz o pedido ' + st.codigo + ' pelo site, no valor de ' + fmtBRL(st.total) + '.';
}

const NOME_PAGAMENTO = { dinheiro: 'Dinheiro', cartao: 'Cartão', pix: 'PIX' };

/** O que mostrar no topo do acompanhamento, a partir do status devolvido pelo banco. */
function descreverStatus(st) {
  const s = st || {};
  if (s.status === 'recusado') {
    return { classe: 'erro', selo: 'erro', titulo: 'A loja não pôde aceitar',
      texto: s.motivo ? 'Motivo: ' + s.motivo : 'Fale com a loja pelo WhatsApp para entender.', final: true };
  }
  if (s.status === 'cancelado') {
    return { classe: 'erro', selo: 'erro', titulo: 'Pedido cancelado', texto: '', final: true };
  }
  if (s.status === 'aceito') {
    if (s.etapa === 'entregue') {
      return { classe: 'ok', selo: 'ok', titulo: 'Pedido entregue', texto: 'Obrigado pela compra!', final: true };
    }
    if (s.etapa === 'em_rota') {
      return { classe: 'ok', selo: 'rota', titulo: 'Saiu para entrega', texto: 'Seu pedido está a caminho.', final: false };
    }
    return { classe: 'ok', selo: 'ok', titulo: 'Pedido confirmado',
      texto: 'A loja ' + (s.loja || '') + ' já está separando seus produtos.', final: false };
  }
  return { classe: '', selo: 'espera', titulo: 'Pedido enviado!',
    texto: (s.loja ? 'A loja ' + s.loja : 'A loja') + ' vai conferir e confirmar em instantes.', final: false };
}

/** Linha do tempo do pedido. estado: 'feita', 'atual' ou ''. */
function etapasDoPedido(st) {
  const s = st || {};
  const nomes = ['Pedido enviado', 'Confirmação da loja', 'Saída para entrega', 'Entrega'];
  let feitas = 1;
  if (s.status === 'aceito') feitas = s.etapa === 'entregue' ? 4 : s.etapa === 'em_rota' ? 3 : 2;
  if (s.status === 'recusado' || s.status === 'cancelado') return [];
  return nomes.map((nome, i) => ({
    nome,
    estado: i < feitas ? 'feita' : i === feitas ? 'atual' : '',
  }));
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** Quanto falta em produtos para chegar ao pedido mínimo (0 = já chegou). */
function faltaParaMinimo(subtotal, minimo) {
  return arred2(Math.max(0, (Number(minimo) || 0) - (Number(subtotal) || 0)));
}

/** Formata o WhatsApp enquanto o cliente digita: (21) 99876-5432 ou (21) 2632-1234. */
function mascaraFone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  d = d.slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return '(' + d;
  const ddd = '(' + d.slice(0, 2) + ') ';
  const resto = d.slice(2);
  if (resto.length <= 4) return ddd + resto;
  if (d.length === 11) return ddd + resto.slice(0, 5) + '-' + resto.slice(5);
  return ddd + resto.slice(0, 4) + '-' + resto.slice(4);
}

/**
 * Loja do link ?loja=<código>. O código é o começo do id da loja (8 caracteres ou
 * mais). Código que não bate com exatamente uma loja recebendo pedidos → null.
 */
function encontrarLojaPorLink(lojas, codigo) {
  const c = String(codigo || '').trim().toLowerCase();
  if (!/^[0-9a-f-]{8,36}$/.test(c)) return null;
  const achadas = (lojas || []).filter((l) => String(l.id || '').toLowerCase().startsWith(c));
  return achadas.length === 1 ? achadas[0] : null;
}

/** A loja que vai entregar num endereço: a mais próxima que atende. null se nenhuma. */
function lojaMaisProxima(lojas) {
  return (lojas || []).find((l) => l.atende) || null;
}

function mensagemProdutoNaoEncontrado(busca) {
  return 'Olá! Procurei "' + busca + '" no site de pedidos e não encontrei. Vocês têm?';
}

// ------------------------------------------------------------------ horário da loja
const NOME_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function minutosDe(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function fmtHora(hhmm) {
  const m = minutosDe(hhmm);
  if (m == null) return '';
  const min = m % 60;
  return Math.floor(m / 60) + 'h' + (min ? String(min).padStart(2, '0') : '');
}

function faixaDoDia(horarios, dia) {
  const f = horarios && horarios[String(dia)];
  if (!Array.isArray(f) || f.length !== 2) return null;
  const abre = minutosDe(f[0]);
  const fecha = minutosDe(f[1]);
  if (abre == null || fecha == null || abre >= fecha) return null;
  return { abre, fecha, textoAbre: fmtHora(f[0]), textoFecha: fmtHora(f[1]) };
}

function situacaoHorario(horarios, dia, minutos) {
  if (!horarios || typeof horarios !== 'object' || Array.isArray(horarios)) return null;
  const hoje = faixaDoDia(horarios, dia);
  if (hoje && minutos >= hoje.abre && minutos < hoje.fecha) {
    return { aberta: true, quando: '', texto: 'Aberta agora · fecha às ' + hoje.textoFecha };
  }
  if (hoje && minutos < hoje.abre) {
    const quando = 'hoje às ' + hoje.textoAbre;
    return { aberta: false, quando, texto: 'Fechada agora · abre ' + quando };
  }
  for (let i = 1; i <= 7; i++) {
    const d = (dia + i) % 7;
    const f = faixaDoDia(horarios, d);
    if (f) {
      const quando = (i === 1 ? 'amanhã' : NOME_DIA[d]) + ' às ' + f.textoAbre;
      return { aberta: false, quando, texto: 'Fechada agora · abre ' + quando };
    }
  }
  return null;
}

const FORMATO_AGORA_LOJA = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function agoraNaLoja(data) {
  const p = {};
  for (const x of FORMATO_AGORA_LOJA.formatToParts(data || new Date())) p[x.type] = x.value;
  return {
    dia: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday),
    minutos: (Number(p.hour) % 24) * 60 + Number(p.minute),
  };
}

// ------------------------------------------------------------------ ícones
const ICONES = {
  espera: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  rota: '<path d="M2.5 6.5h11v9h-11z"/><path d="M13.5 9.5h4l3 3.5v2.5h-7"/>'
    + '<circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  erro: '<path d="M7 7l10 10M17 7L7 17"/>',
};

function icone(nome) {
  return '<svg class="ico" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"'
    + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
    + (ICONES[nome] || '') + '</svg>';
}

// Placeholder de foto por categoria: enquanto o produto não tem foto cadastrada, mostra
// um desenho simples escolhido pela categoria. Traço 24×24, herda a cor do container.
const ICONE_CATEGORIA = {
  racao: '<path d="M4 10h16l-1.5 8a2 2 0 0 1-2 2H7.5a2 2 0 0 1-2-2z"/><path d="M8 10c0-3 1.8-5 4-5s4 2 4 5"/><circle cx="10.5" cy="14.5" r="1"/><circle cx="14" cy="15.5" r="1"/>',
  petisco: '<path d="M6.5 6.5a2 2 0 1 0-2 2l1 1 6 6 1 1a2 2 0 1 0 2-2l-1-1-6-6z"/><path d="M17.5 6.5a2 2 0 1 1 2 2"/><path d="M17.5 17.5a2 2 0 1 0 2-2"/>',
  areia: '<path d="M5 4h14v3H5z"/><path d="M6 7l1.5 12a1.5 1.5 0 0 0 1.5 1.3h6a1.5 1.5 0 0 0 1.5-1.3L18 7"/><path d="M9.5 11l1 6M14.5 11l-1 6"/>',
  brinquedo: '<circle cx="12" cy="12" r="7.5"/><path d="M12 4.5v15M4.5 12h15"/>',
  higiene: '<path d="M12 3s5 5.5 5 9a5 5 0 0 1-10 0c0-3.5 5-9 5-9z"/>',
  farmacia: '<rect x="4.5" y="4.5" width="15" height="15" rx="3"/><path d="M12 8.5v7M8.5 12h7"/>',
  acessorio: '<circle cx="12" cy="9" r="4.5"/><path d="M8.5 12.5 6 20l6-2 6 2-2.5-7.5"/>',
  pet: '<circle cx="7.5" cy="10" r="1.7"/><circle cx="12" cy="8" r="1.7"/><circle cx="16.5" cy="10" r="1.7"/><path d="M9 15.5c0-2 1.5-3.5 3-3.5s3 1.5 3 3.5c0 1.6-1.3 2.5-3 2.5s-3-.9-3-2.5z"/>',
};

/** Normaliza uma categoria e escolhe o ícone do placeholder. */
function iconeDaCategoria(cat) {
  const c = String(cat || '').toLowerCase();
  if (/ra[çc][aã]o|alimento|comida|petfood/.test(c)) return ICONE_CATEGORIA.racao;
  if (/petisco|snack|osso|bifinho|biscoito/.test(c)) return ICONE_CATEGORIA.petisco;
  if (/areia|granulado|sanit[aá]ri/.test(c)) return ICONE_CATEGORIA.areia;
  if (/brinquedo|toy|bola/.test(c)) return ICONE_CATEGORIA.brinquedo;
  if (/higien|shampoo|banho|limpez|tapete/.test(c)) return ICONE_CATEGORIA.higiene;
  if (/farm|medic|rem[eé]dio|vermif|antipulg|sa[uú]de/.test(c)) return ICONE_CATEGORIA.farmacia;
  if (/coleira|guia|acess|cama|comedouro|bebedouro|roupa/.test(c)) return ICONE_CATEGORIA.acessorio;
  return ICONE_CATEGORIA.pet;
}

function placeholderFoto(cat, classe) {
  return '<div class="' + classe + '" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"'
    + ' stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + iconeDaCategoria(cat) + '</svg></div>';
}

function urlFoto(p) {
  return p && p.imagem_path ? STORAGE_PUBLICO + encodeURIComponent(p.imagem_path) : '';
}

// ------------------------------------------------------------------ tela

function iniciar() {
  const $ = (id) => document.getElementById(id);

  const estado = {
    empresa: '',
    lojas: [],
    loja: null,                     // loja escolhida (commit no "Continuar")
    sugerida: null,                 // loja mais próxima do endereço, ainda não commitada
    coords: null,                   // { lat, lng } do endereço/GPS
    endereco: null,                 // { cep, rua, numero, bairro, complemento, localidade, uf }
    carrinho: new Map(),            // id → { id, nome, preco, unidade, qtd, imagem_path, categoria }
    produtos: new Map(),
    cat: { q: '', categoria: '', offset: 0, temMais: false, seq: 0, categorias: null },
    ultimo: null,
    temPedidoAberto: false,
    polling: null,
    passo: 'passoLocal',
    verLojas: false,
    codigoLink: null,
  };

  // -------------------------------------------------------------- armazenamento
  const guardar = (chave, valor) => { try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (_) {} };
  const ler = (chave) => { try { return JSON.parse(localStorage.getItem(chave) || 'null'); } catch (_) { return null; } };
  const apagar = (chave) => { try { localStorage.removeItem(chave); } catch (_) {} };

  function salvarCarrinho() {
    if (!estado.loja || !estado.carrinho.size) { apagar(CHAVE_CARRINHO); return; }
    guardar(CHAVE_CARRINHO, { storeId: estado.loja.id, itens: [...estado.carrinho.values()] });
  }

  // -------------------------------------------------------------- utilidades
  let toastTimer = null;
  function toast(texto) {
    const t = $('toast');
    t.textContent = texto;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  async function api(acao, dados) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch(PEDIDO_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ acao }, dados || {})),
        signal: ctrl.signal,
      });
      let corpo = null;
      try { corpo = await r.json(); } catch (_) { /* resposta sem JSON */ }
      if (!r.ok) {
        const e = new Error((corpo && corpo.erro) || 'Não foi possível concluir agora. Tente de novo.');
        e.status = r.status;
        throw e;
      }
      return corpo;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('A conexão demorou demais. Confira a internet e tente de novo.');
      if (e instanceof TypeError) throw new Error('Sem conexão com a internet. Confira e tente de novo.');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  // -------------------------------------------------------------- navegação
  function mostrarPasso(passo, empilhar) {
    for (const id of ['passoLocal', 'passoCatalogo', 'passoCarrinho', 'passoEnviado']) {
      $(id).hidden = id !== passo;
    }
    estado.passo = passo;
    if (empilhar) history.pushState({ passo }, '', '');
    const titulo = { passoLocal: 'tLocal', passoCatalogo: 'busca', passoCarrinho: 'tCarrinho', passoEnviado: 'tEnviado' }[passo];
    window.scrollTo(0, 0);
    if (passo !== 'passoCatalogo') { const h = $(titulo); if (h) h.focus({ preventScroll: true }); }
    $('lojaChip').hidden = !estado.loja || passo === 'passoLocal' || passo === 'passoEnviado';
    $('pedidoAberto').hidden = !estado.temPedidoAberto || !(passo === 'passoLocal' || passo === 'passoCatalogo');
    if (passo !== 'passoEnviado') pararPolling();
    atualizarAvisosHorario();
    atualizarBarra();
  }

  window.addEventListener('popstate', (ev) => {
    const passo = ev.state && ev.state.passo;
    if (!passo) { mostrarPasso('passoLocal', false); return; }
    if ((passo === 'passoCatalogo' || passo === 'passoCarrinho') && !estado.loja) { mostrarPasso('passoLocal', false); return; }
    if (passo === 'passoCarrinho') renderCarrinho();
    if (passo === 'passoEnviado' && !estado.ultimo) { mostrarPasso('passoLocal', false); return; }
    mostrarPasso(passo, false);
  });

  function atualizarBarra() {
    const barra = $('barra');
    const itens = [...estado.carrinho.values()];
    const t = totaisCarrinho(itens, estado.loja ? estado.loja.frete : 0);
    const minimo = estado.loja ? Number(estado.loja.pedido_minimo) || 0 : 0;
    const falta = faltaParaMinimo(t.subtotal, minimo);
    const faixa = $('barraMin');
    if (estado.passo === 'passoCatalogo' && t.quantidade && falta > 0) {
      $('barraMinTexto').textContent = 'Faltam ' + fmtBRL(falta) + ' para o pedido mínimo de ' + fmtBRL(minimo);
      faixa.style.setProperty('--p', Math.round(Math.min(1, t.subtotal / minimo) * 100) + '%');
      faixa.hidden = false;
    } else {
      faixa.hidden = true;
    }
    if (estado.passo === 'passoCatalogo' && t.quantidade) {
      $('barraQtd').textContent = t.quantidade + (t.quantidade === 1 ? ' item' : ' itens');
      $('barraTotal').textContent = fmtBRL(t.subtotal);
      $('barraBtn').textContent = 'Ver carrinho';
      $('barraBtn').disabled = false;
      barra.hidden = false;
    } else if (estado.passo === 'passoCarrinho' && t.quantidade) {
      $('barraQtd').textContent = 'Total';
      $('barraTotal').textContent = fmtBRL(t.total);
      $('barraBtn').textContent = 'Enviar pedido';
      barra.hidden = false;
    } else {
      barra.hidden = true;
    }
    document.body.classList.toggle('com-faixa', !barra.hidden && !faixa.hidden);
  }

  // -------------------------------------------------------------- horário
  function situacaoDaLoja(loja) {
    if (!loja) return null;
    const agora = agoraNaLoja();
    return situacaoHorario(loja.horarios, agora.dia, agora.minutos);
  }

  function atualizarAvisosHorario() {
    const s = situacaoDaLoja(estado.loja);
    const texto = s && !s.aberta
      ? 'A loja ' + estado.loja.nome + ' está fechada agora e abre ' + s.quando
        + '. Pode fazer o pedido: ela confirma assim que abrir.'
      : '';
    for (const id of ['avisoHorario', 'avisoHorarioCarrinho']) {
      $(id).textContent = texto;
      $(id).hidden = !texto;
    }
  }

  $('barraBtn').addEventListener('click', () => {
    if (estado.passo === 'passoCatalogo') { renderCarrinho(); mostrarPasso('passoCarrinho', true); }
    else if (estado.passo === 'passoCarrinho') enviarPedido();
  });

  // -------------------------------------------------------------- 1 · endereço
  function detalhesLoja(l) {
    return [
      l.bairro,
      Number(l.frete) > 0 ? 'entrega ' + fmtBRL(l.frete) : 'entrega grátis',
      Number(l.pedido_minimo) > 0 ? 'mínimo ' + fmtBRL(l.pedido_minimo) : '',
    ].filter(Boolean).join(' · ');
  }

  function renderLojaSugerida() {
    const box = $('lojaSugerida');
    const l = estado.sugerida;
    if (!l) { box.hidden = true; box.innerHTML = ''; return; }
    const dist = l.distancia_km != null
      ? '<span class="dist">' + esc(String(l.distancia_km).replace('.', ',')) + ' km</span>' : '';
    box.innerHTML = '<div class="loja-sug">'
      + '<span class="pino" aria-hidden="true">' + icone('ok') + '</span>'
      + '<b>' + esc(l.nome) + '</b>' + dist
      + '<small>Entrega neste endereço · ' + esc(detalhesLoja(l)) + '</small>'
      + '</div>';
    box.hidden = false;
  }

  function renderListaLojas() {
    const box = $('listaLojas');
    if (!estado.verLojas) { box.hidden = true; return; }
    const comDist = estado.lojas.some((l) => l.distancia_km != null);
    const agora = agoraNaLoja();
    box.innerHTML = estado.lojas.map((l) => {
      const sit = situacaoHorario(l.horarios, agora.dia, agora.minutos);
      const linhaHorario = sit
        ? '<br><span class="hor ' + (sit.aberta ? 'aberta' : 'fechada') + '">' + esc(sit.texto) + '</span>' : '';
      const fora = comDist && l.atende === false;
      const dist = l.distancia_km != null
        ? '<span class="dist">' + esc(String(l.distancia_km).replace('.', ',')) + ' km<em>'
          + (fora ? 'fora da área' : 'entrega aqui') + '</em></span>' : '';
      return '<button type="button" class="loja' + (fora ? ' fora' : '')
        + (estado.sugerida && estado.sugerida.id === l.id ? ' sugerida' : '')
        + '" data-loja="' + esc(l.id) + '"' + (fora ? ' aria-disabled="true"' : '') + '>'
        + '<b>' + esc(l.nome) + '</b>' + dist
        + '<small>' + esc(detalhesLoja(l)) + (l.horario ? '<br>' + esc(l.horario) : '') + linhaHorario + '</small>'
        + '</button>';
    }).join('');
    box.hidden = false;
  }

  function podeContinuar() {
    const rua = $('fRua').value.trim();
    const numero = $('fNumero').value.trim();
    return !!(estado.sugerida && rua.length >= 3 && numero.length >= 1);
  }

  function atualizarContinuar() {
    $('btnContinuar').disabled = !podeContinuar();
  }

  function aplicarEndereco(dados, comGps) {
    estado.empresa = dados.empresa || estado.empresa || '';
    if (estado.empresa) { $('marca').textContent = estado.empresa; document.title = 'Fazer pedido · ' + estado.empresa; }
    estado.lojas = dados.lojas || [];
    estado.coords = (dados.lat != null && dados.lng != null) ? { lat: dados.lat, lng: dados.lng } : estado.coords;
    if (!comGps) {
      estado.endereco = {
        cep: dados.cep || '', rua: dados.logradouro || '', numero: $('fNumero').value.trim(),
        bairro: dados.bairro || '', complemento: $('fComplemento').value.trim(),
        localidade: dados.localidade || '', uf: dados.uf || '',
      };
      if (dados.logradouro && !$('fRua').value.trim()) $('fRua').value = dados.logradouro;
      if (dados.bairro && !$('fBairro').value.trim()) $('fBairro').value = dados.bairro;
    }
    $('endDetalhe').hidden = false;
    const linkLoja = estado.codigoLink ? encontrarLojaPorLink(estado.lojas, estado.codigoLink) : null;
    estado.sugerida = lojaMaisProxima(estado.lojas) || linkLoja || null;
    renderLojaSugerida();
    // Sem loja que atenda: mostra o aviso e deixa escolher manualmente.
    const foraBox = $('foraArea');
    if (!estado.sugerida && estado.lojas.length) {
      const perto = estado.lojas[0];
      const link = perto && perto.whatsapp
        ? linkWhatsApp(perto.whatsapp, 'Olá! Queria fazer um pedido, mas o site diz que meu endereço está fora da área de entrega.') : '';
      foraBox.innerHTML = '<div class="aviso erro"><b>Ainda não entregamos nesse endereço.</b>'
        + (perto && perto.distancia_km != null
          ? ' A loja mais perto, ' + esc(perto.nome) + ', fica a ' + esc(String(perto.distancia_km).replace('.', ',')) + ' km.' : '')
        + (link ? '<a class="btn zap bloco" target="_blank" rel="noopener" href="' + esc(link) + '">Falar com a loja no WhatsApp</a>' : '')
        + '</div>';
      foraBox.hidden = false;
    } else {
      foraBox.hidden = true;
    }
    $('btnOutrasLojas').hidden = estado.lojas.length < 2;
    renderListaLojas();
    atualizarContinuar();
  }

  async function buscarCep() {
    const cep = soCep($('fCep').value);
    const msg = $('cepMsg');
    msg.classList.remove('erro');
    if (cep.length !== 8) { msg.textContent = 'Informe um CEP com 8 dígitos.'; msg.classList.add('erro'); return; }
    $('btnBuscarCep').disabled = true;
    msg.textContent = 'Procurando seu endereço…';
    try {
      const dados = await api('endereco', { cep });
      msg.textContent = dados.sem_coordenadas
        ? 'Encontramos o endereço. Confirme o número; se a loja não aparecer, escolha abaixo.'
        : '';
      aplicarEndereco(dados, false);
      if (dados.sem_coordenadas) { estado.verLojas = true; renderListaLojas(); $('btnOutrasLojas').hidden = true; }
      $('fNumero').focus({ preventScroll: true });
    } catch (e) {
      msg.textContent = e.message; msg.classList.add('erro');
    } finally {
      $('btnBuscarCep').disabled = false;
    }
  }

  $('fCep').addEventListener('input', () => {
    const c = $('fCep');
    c.value = mascaraCep(c.value);
    if (soCep(c.value).length === 8) buscarCep();
  });
  $('btnBuscarCep').addEventListener('click', buscarCep);
  $('formEndereco').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); if (ev.target.id === 'fCep') buscarCep(); else atualizarContinuar(); }
  });
  ['fRua', 'fNumero', 'fBairro', 'fComplemento'].forEach((id) => {
    $(id).addEventListener('input', () => {
      if (estado.endereco) {
        estado.endereco.rua = $('fRua').value.trim();
        estado.endereco.numero = $('fNumero').value.trim();
        estado.endereco.bairro = $('fBairro').value.trim();
        estado.endereco.complemento = $('fComplemento').value.trim();
      }
      atualizarContinuar();
    });
  });

  $('btnOutrasLojas').addEventListener('click', () => {
    estado.verLojas = !estado.verLojas;
    $('btnOutrasLojas').textContent = estado.verLojas ? 'Ocultar lojas' : 'Ver outras lojas';
    renderListaLojas();
  });

  $('listaLojas').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-loja]');
    if (!b) return;
    const loja = estado.lojas.find((l) => l.id === b.dataset.loja);
    if (!loja) return;
    if (estado.coords && loja.atende === false) { toast('Essa loja não entrega no seu endereço.'); return; }
    estado.sugerida = loja;
    renderLojaSugerida();
    renderListaLojas();
    atualizarContinuar();
    $('lojaSugerida').scrollIntoView({ block: 'center' });
  });

  $('btnContinuar').addEventListener('click', () => {
    if (!podeContinuar()) { atualizarContinuar(); return; }
    if (!estado.endereco) estado.endereco = { cep: soCep($('fCep').value), localidade: '', uf: '' };
    estado.endereco.rua = $('fRua').value.trim();
    estado.endereco.numero = $('fNumero').value.trim();
    estado.endereco.bairro = $('fBairro').value.trim();
    estado.endereco.complemento = $('fComplemento').value.trim();
    guardar(CHAVE_DADOS, Object.assign(ler(CHAVE_DADOS) || {}, { endereco_v2: estado.endereco }));
    escolherLoja(estado.sugerida);
  });

  // GPS: atalho para achar a loja mais perto. O endereço (rua/número) ainda é digitado.
  $('btnLocalizacao').addEventListener('click', () => {
    const msg = $('localMsg');
    msg.classList.remove('erro');
    if (!('geolocation' in navigator)) { msg.textContent = 'Este aparelho não informa a localização. Use o CEP acima.'; return; }
    const btn = $('btnLocalizacao');
    btn.disabled = true;
    msg.textContent = 'Procurando a loja mais perto…';
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      try {
        const dados = await api('lojas', coords);
        dados.lat = coords.lat; dados.lng = coords.lng;
        aplicarEndereco(dados, true);
        msg.textContent = estado.sugerida
          ? 'Loja ' + estado.sugerida.nome + ' é a mais perto. Confirme rua e número abaixo.'
          : '';
        $('fRua').focus({ preventScroll: true });
      } catch (e) { msg.textContent = e.message; msg.classList.add('erro'); }
      finally { btn.disabled = false; }
    }, (erro) => {
      btn.disabled = false; msg.classList.add('erro');
      msg.textContent = erro.code === 1
        ? 'A localização não foi liberada. Use o CEP acima.'
        : 'Não conseguimos pegar sua localização. Use o CEP acima.';
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  });

  function escolherLoja(loja) {
    if (!loja) return;
    const salvo = ler(CHAVE_CARRINHO);
    if (estado.loja && estado.loja.id !== loja.id && estado.carrinho.size) {
      estado.carrinho.clear();
      toast('Carrinho esvaziado: cada loja tem seus preços.');
    } else if (!estado.carrinho.size && salvo && salvo.storeId === loja.id && Array.isArray(salvo.itens)) {
      for (const it of salvo.itens) {
        if (it && it.id && qtdValida(it.unidade, it.qtd)) estado.carrinho.set(it.id, it);
      }
    }
    estado.loja = loja;
    salvarCarrinho();
    $('lojaChip').textContent = loja.nome + ' · trocar';
    estado.cat = { q: '', categoria: '', offset: 0, temMais: false, seq: estado.cat.seq, categorias: null };
    $('busca').value = '';
    mostrarPasso('passoCatalogo', true);
    carregarProdutos(false);
  }

  $('lojaChip').addEventListener('click', () => mostrarPasso('passoLocal', true));

  // -------------------------------------------------------------- 2 · produtos
  function renderCategorias() {
    const box = $('categorias');
    const cats = estado.cat.categorias || [];
    if (!cats.length) { box.innerHTML = ''; return; }
    const botao = (valor, nome) => '<button type="button" class="chip" data-cat="' + esc(valor) + '" aria-pressed="'
      + (estado.cat.categoria === valor ? 'true' : 'false') + '">' + esc(nome) + '</button>';
    box.innerHTML = botao('', 'Todos') + cats.map((c) => botao(c, c.charAt(0) + c.slice(1).toLowerCase())).join('');
  }

  function controleProduto(p) {
    const noCarrinho = estado.carrinho.get(p.id);
    if (!noCarrinho) {
      return '<button type="button" class="btn btn-add" data-acao="add" data-id="' + esc(p.id) + '"'
        + ' aria-label="Adicionar ' + esc(p.nome) + '">Adicionar</button>';
    }
    return '<div class="stepper" role="group" aria-label="Quantidade de ' + esc(p.nome) + '">'
      + '<button type="button" data-acao="menos" data-id="' + esc(p.id) + '" aria-label="Diminuir">−</button>'
      + '<output aria-live="polite">' + esc(fmtQtd(p.unidade, noCarrinho.qtd)) + '</output>'
      + '<button type="button" data-acao="mais" data-id="' + esc(p.id) + '" aria-label="Aumentar">+</button>'
      + '</div>';
  }

  function fotoProduto(p, classeImg, classePh) {
    const url = urlFoto(p);
    return url
      ? '<img class="' + classeImg + '" src="' + esc(url) + '" alt="" loading="lazy" decoding="async"'
        + ' data-foto data-cat="' + esc(p.categoria || '') + '">'
      : placeholderFoto(p.categoria, classePh);
  }

  function cardProduto(p) {
    const granel = ehGranel(p.unidade);
    const embalagem = /^(un|und|unid|kg|pc|pç|cx)$/i.test(String(p.embalagem || '').trim()) ? '' : p.embalagem;
    const meta = [embalagem, granel ? 'vendido por kg' : ''].filter(Boolean).join(' · ');
    return '<div class="prod" data-prod="' + esc(p.id) + '">'
      + fotoProduto(p, 'prod-foto', 'prod-ph')
      + '<div class="prod-corpo">'
      + '<div class="prod-nome">' + esc(p.nome) + '</div>'
      + (meta ? '<div class="prod-meta">' + esc(meta) + '</div>' : '')
      + '<div class="prod-preco">' + fmtBRL(p.preco) + (granel ? ' <small>/kg</small>' : '') + '</div>'
      + '<div class="prod-acao">' + controleProduto(p) + '</div>'
      + '</div></div>';
  }

  // Foto que não carrega volta para o placeholder da categoria (CSP não deixa usar
  // onerror inline; ligamos o listener após inserir).
  function ligarFallbackFotos(container) {
    container.querySelectorAll('img[data-foto]').forEach((img) => {
      img.addEventListener('error', () => {
        const div = document.createElement('div');
        div.innerHTML = placeholderFoto(img.dataset.cat, 'prod-foto prod-ph');
        const ph = div.firstElementChild;
        if (ph && img.parentNode) img.parentNode.replaceChild(ph, img);
      }, { once: true });
    });
  }

  async function carregarProdutos(anexar) {
    const box = $('produtos');
    const seq = ++estado.cat.seq;
    const fimDaEspera = () => { box.classList.remove('buscando'); box.removeAttribute('aria-busy'); };
    if (!anexar) {
      estado.cat.offset = 0;
      if (box.querySelector('.prod')) {
        box.classList.add('buscando');
        box.setAttribute('aria-busy', 'true');
      } else {
        box.innerHTML = '<p class="carregando">Carregando produtos…</p>';
      }
    }
    $('btnMais').hidden = true;
    try {
      const r = await api('catalogo', {
        store_id: estado.loja.id, q: estado.cat.q, categoria: estado.cat.categoria, offset: estado.cat.offset,
      });
      if (seq !== estado.cat.seq) return;
      fimDaEspera();
      const itens = r.itens || [];
      for (const p of itens) estado.produtos.set(p.id, p);
      if (r.categorias) { estado.cat.categorias = r.categorias; renderCategorias(); }
      estado.cat.offset += itens.length;
      estado.cat.temMais = !!r.tem_mais;
      const html = itens.map(cardProduto).join('');
      if (anexar) box.insertAdjacentHTML('beforeend', html);
      else box.innerHTML = html || semResultado();
      ligarFallbackFotos(box);
      $('btnMais').hidden = !estado.cat.temMais;
    } catch (e) {
      if (seq !== estado.cat.seq) return;
      fimDaEspera();
      box.innerHTML = '<div class="aviso erro">' + esc(e.message)
        + '<button type="button" class="btn fantasma bloco" data-acao="recarregar">Tentar de novo</button></div>';
    }
  }

  function semResultado() {
    const q = estado.cat.q;
    const link = q && estado.loja && estado.loja.whatsapp
      ? linkWhatsApp(estado.loja.whatsapp, mensagemProdutoNaoEncontrado(q)) : '';
    return '<div class="vazio"><p>Nenhum produto encontrado' + (q ? ' para “' + esc(q) + '”' : '') + '.</p>'
      + (link
        ? '<p class="apoio">A loja pode ter e ele não estar no site.</p>'
          + '<a class="btn zap" target="_blank" rel="noopener" href="' + esc(link) + '">Perguntar à loja no WhatsApp</a>'
        : '')
      + '</div>';
  }

  let buscaTimer = null;
  $('busca').addEventListener('input', () => {
    clearTimeout(buscaTimer);
    buscaTimer = setTimeout(() => {
      estado.cat.q = $('busca').value.trim();
      carregarProdutos(false);
    }, 350);
  });
  $('busca').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); $('busca').blur(); }
  });

  $('categorias').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-cat]');
    if (!b) return;
    estado.cat.categoria = b.dataset.cat;
    renderCategorias();
    carregarProdutos(false);
  });

  $('btnMais').addEventListener('click', () => carregarProdutos(true));

  function mudarQuantidade(id, acao) {
    const p = estado.produtos.get(id) || estado.carrinho.get(id);
    if (!p) return;
    const atual = estado.carrinho.get(id);
    let nova;
    if (acao === 'add') nova = 1;
    else nova = ajustarQtd(p.unidade, atual ? atual.qtd : 0, acao === 'mais' ? 1 : -1);
    if (nova > 0) {
      estado.carrinho.set(id, { id, nome: p.nome, preco: Number(p.preco), unidade: p.unidade, qtd: nova,
        imagem_path: p.imagem_path || null, categoria: p.categoria || '' });
    } else {
      estado.carrinho.delete(id);
    }
    salvarCarrinho();
    return p;
  }

  $('produtos').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-acao]');
    if (!b) return;
    if (b.dataset.acao === 'recarregar') { carregarProdutos(false); return; }
    const p = mudarQuantidade(b.dataset.id, b.dataset.acao);
    if (!p) return;
    const linha = b.closest('.prod');
    if (linha) linha.querySelector('.prod-acao').innerHTML = controleProduto(estado.produtos.get(p.id) || p);
    atualizarBarra();
  });

  // -------------------------------------------------------------- 3 · carrinho
  function textoEntrega() {
    const e = estado.endereco || {};
    const linha1 = [e.rua, e.numero].filter(Boolean).join(', ');
    const linha2 = [e.bairro, e.localidade].filter(Boolean).join(' · ');
    return { linha1, linha2, loja: estado.loja ? estado.loja.nome : '' };
  }

  function renderEntregaResumo() {
    const box = $('entregaResumo');
    if (!estado.endereco || !estado.loja) { box.hidden = true; return; }
    const t = textoEntrega();
    $('entregaResumoTxt').innerHTML = '<b>' + esc(t.linha1 || 'Endereço de entrega') + '</b>'
      + '<small>' + esc([t.linha2, t.loja ? 'entrega pela ' + t.loja : ''].filter(Boolean).join(' · ')) + '</small>';
    box.hidden = false;
  }

  function renderCarrinho() {
    const itens = [...estado.carrinho.values()];
    const loja = estado.loja || {};
    const t = totaisCarrinho(itens, loja.frete);
    renderEntregaResumo();
    $('itensCarrinho').innerHTML = itens.length
      ? itens.map((it) => '<div class="item-car" data-item="' + esc(it.id) + '">'
          + fotoProduto(it, 'mini-foto', 'mini-ph')
          + '<div><div class="prod-nome">' + esc(it.nome) + '</div>'
          + '<div class="prod-meta">' + fmtBRL(it.preco) + (ehGranel(it.unidade) ? '/kg' : ' cada') + '</div></div>'
          + '<button type="button" class="remover" data-acao="remover" data-id="' + esc(it.id) + '">Remover</button>'
          + '<div class="linha">' + controleProduto(it)
          + '<span class="sub">' + fmtBRL(arred2(it.qtd * it.preco)) + '</span></div>'
          + '</div>').join('')
      : '<p class="vazio">Seu carrinho está vazio.</p>';
    ligarFallbackFotos($('itensCarrinho'));
    $('tSub').textContent = fmtBRL(t.subtotal);
    $('tFrete').textContent = t.frete > 0 ? fmtBRL(t.frete) : 'Grátis';
    $('tTotal').textContent = fmtBRL(t.total);
    const minimo = Number(loja.pedido_minimo) || 0;
    const aviso = $('avisoMinimo');
    if (itens.length && t.subtotal < minimo) {
      aviso.textContent = 'O pedido mínimo desta loja é ' + fmtBRL(minimo) + '. Faltam '
        + fmtBRL(faltaParaMinimo(t.subtotal, minimo)) + ' em produtos.';
      aviso.hidden = false;
    } else {
      aviso.hidden = true;
    }
    atualizarBarra();
  }

  $('itensCarrinho').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-acao]');
    if (!b) return;
    if (b.dataset.acao === 'remover') {
      estado.carrinho.delete(b.dataset.id);
      salvarCarrinho();
    } else {
      mudarQuantidade(b.dataset.id, b.dataset.acao);
    }
    renderCarrinho();
  });

  $('btnVoltarCatalogo').addEventListener('click', () => history.back());
  $('btnEditarEndereco').addEventListener('click', () => mostrarPasso('passoLocal', true));

  function preencherDados() {
    const d = ler(CHAVE_DADOS);
    if (!d) return;
    if (d.nome && !$('fNome').value) $('fNome').value = d.nome;
    if (d.telefone && !$('fFone').value) $('fFone').value = mascaraFone(d.telefone);
    // Endereço lembrado (v2): repõe no passo 1.
    const e = d.endereco_v2;
    if (e) {
      if (e.cep) $('fCep').value = mascaraCep(e.cep);
      if (e.rua) $('fRua').value = e.rua;
      if (e.numero) $('fNumero').value = e.numero;
      if (e.bairro) $('fBairro').value = e.bairro;
      if (e.complemento) $('fComplemento').value = e.complemento;
    }
  }

  $('fFone').addEventListener('input', () => {
    const c = $('fFone');
    if (c.selectionStart !== c.value.length) return;
    const formatado = mascaraFone(c.value);
    if (formatado !== c.value) c.value = formatado;
  });
  $('fFone').addEventListener('blur', () => { $('fFone').value = mascaraFone($('fFone').value); });

  const ORDEM_CAMPOS = ['fNome', 'fFone'];
  $('formPedido').addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || ev.target.tagName === 'TEXTAREA' || ev.target.type === 'checkbox') return;
    ev.preventDefault();
    const i = ORDEM_CAMPOS.indexOf(ev.target.id);
    if (i >= 0 && i < ORDEM_CAMPOS.length - 1) $(ORDEM_CAMPOS[i + 1]).focus();
    else if (ev.target.id === 'fFone') { ev.target.blur(); $('pagDinheiro').closest('fieldset').scrollIntoView({ block: 'center' }); }
    else if (ev.target.id === 'fTroco') $('fObs').focus();
    else ev.target.blur();
  });

  document.querySelectorAll('input[name="pagamento"]').forEach((r) => {
    r.addEventListener('change', () => {
      $('trocoWrap').hidden = !$('pagDinheiro').checked;
      $('pixNota').hidden = !$('pagPix').checked;
    });
  });

  function lerFormulario() {
    const pag = document.querySelector('input[name="pagamento"]:checked');
    const e = estado.endereco || {};
    const endereco = [e.rua, e.numero].filter(Boolean).join(', ');
    return {
      nome: $('fNome').value.trim(),
      telefone: $('fFone').value.trim(),
      endereco,
      bairro: e.bairro || '',
      complemento: e.complemento || '',
      pagamento: pag ? pag.value : '',
      troco_para: pag && pag.value === 'dinheiro' ? lerDinheiro($('fTroco').value) : null,
      obs: $('fObs').value.trim(),
    };
  }

  function limparErroCampo() {
    const e = $('erroCampo');
    if (e) e.remove();
    document.querySelectorAll('#formPedido [aria-invalid]').forEach((c) => {
      c.removeAttribute('aria-invalid');
      c.removeAttribute('aria-describedby');
    });
  }

  function mostrarErroCampo(id, mensagem) {
    limparErroCampo();
    const campo = $(id);
    const aviso = document.createElement('p');
    aviso.id = 'erroCampo';
    aviso.className = 'msg erro campo';
    aviso.setAttribute('role', 'alert');
    aviso.textContent = mensagem;
    if (campo.type === 'radio') {
      campo.closest('fieldset').insertAdjacentElement('beforeend', aviso);
    } else {
      campo.setAttribute('aria-invalid', 'true');
      campo.setAttribute('aria-describedby', 'erroCampo');
      campo.insertAdjacentElement('afterend', aviso);
    }
    campo.focus({ preventScroll: true });
    campo.scrollIntoView({ block: 'center' });
  }

  $('formPedido').addEventListener('input', limparErroCampo);
  $('formPedido').addEventListener('change', limparErroCampo);

  let enviando = false;
  async function enviarPedido() {
    if (enviando) return;
    const msg = $('formMsg');
    msg.textContent = '';
    limparErroCampo();
    const dados = lerFormulario();
    const itens = [...estado.carrinho.values()];
    const t = totaisCarrinho(itens, estado.loja.frete);
    const problema = validarPedido(dados, t, estado.loja.pedido_minimo);
    if (problema) {
      if (problema.campo) { mostrarErroCampo(problema.campo, problema.mensagem); return; }
      const minimo = $('avisoMinimo');
      if (!minimo.hidden) { minimo.scrollIntoView({ block: 'center' }); return; }
      msg.textContent = problema.mensagem;
      msg.scrollIntoView({ block: 'center' });
      return;
    }

    enviando = true;
    $('barraBtn').disabled = true;
    $('barraBtn').textContent = 'Enviando…';
    try {
      const r = await api('criar', {
        pedido: Object.assign({}, dados, {
          store_id: estado.loja.id,
          cep: estado.endereco ? soCep(estado.endereco.cep) : null,
          lat: estado.coords ? estado.coords.lat : null,
          lng: estado.coords ? estado.coords.lng : null,
          pix_online: dados.pagamento === 'pix',
          itens: itens.map((it) => ({ product_id: it.id, qtd: it.qtd })),
        }),
      });
      if ($('fLembrar').checked) {
        guardar(CHAVE_DADOS, { nome: dados.nome, telefone: dados.telefone, endereco_v2: estado.endereco });
      } else {
        apagar(CHAVE_DADOS);
      }
      estado.carrinho.clear();
      salvarCarrinho();
      estado.ultimo = { token: r.token, codigo: r.codigo };
      guardar(CHAVE_ULTIMO, estado.ultimo);
      history.replaceState({ passo: 'passoEnviado' }, '', '');
      mostrarPasso('passoEnviado', false);
      renderStatus({ codigo: r.codigo, status: 'pendente', loja: r.loja, total: r.total, itens: [] });
      tratarPixAoCriar(r);
      atualizarStatus();
    } catch (e) {
      msg.textContent = e.message;
      msg.scrollIntoView({ block: 'center' });
    } finally {
      enviando = false;
      $('barraBtn').disabled = false;
      atualizarBarra();
    }
  }

  // -------------------------------------------------------------- 4 · acompanhamento
  function renderStatus(st) {
    const d = descreverStatus(st);
    if (st.status === 'pendente' && estado.loja && st.loja === estado.loja.nome) {
      const sit = situacaoDaLoja(estado.loja);
      if (sit && !sit.aberta) d.texto = 'A loja ' + estado.loja.nome + ' abre ' + sit.quando + ' e confirma seu pedido assim que abrir.';
    }
    $('statusCard').className = 'status ' + d.classe;
    $('statusSelo').innerHTML = icone(d.selo);
    $('tEnviado').textContent = d.titulo;
    $('statusTexto').textContent = d.texto;
    $('codigoValor').textContent = st.codigo || '';

    $('etapas').innerHTML = etapasDoPedido(st)
      .map((e) => '<li class="' + e.estado + '"' + (e.estado === 'atual' ? ' aria-current="step"' : '') + '>'
        + '<span>' + esc(e.nome) + '</span></li>').join('');

    const itens = st.itens || [];
    $('resumoItens').innerHTML = itens.length
      ? itens.map((it) => '<div class="item-car"><div><div class="prod-nome">' + esc(it.nome) + '</div>'
          + '<div class="prod-meta">' + esc(fmtQtd(it.unidade, it.qtd)) + ' × ' + fmtBRL(it.preco_unit) + '</div></div>'
          + '<span class="sub">' + fmtBRL(it.subtotal) + '</span></div>').join('')
      : '<p class="carregando">Carregando…</p>';
    $('resumoTotais').innerHTML = st.subtotal != null
      ? '<dt>Produtos</dt><dd>' + fmtBRL(st.subtotal) + '</dd>'
        + '<dt>Entrega</dt><dd>' + (Number(st.frete) > 0 ? fmtBRL(st.frete) : 'Grátis') + '</dd>'
        + '<dt class="total">Total</dt><dd class="total">' + fmtBRL(st.total) + '</dd>'
        + '<dt>Pagamento</dt><dd>' + esc(NOME_PAGAMENTO[st.pagamento] || '')
        + (st.troco_para ? ' · troco para ' + fmtBRL(st.troco_para) : '') + '</dd>'
      : '';

    const zap = $('btnZapLoja');
    const link = st.whatsapp ? linkWhatsApp(st.whatsapp, mensagemParaLoja(st)) : '';
    zap.hidden = !link;
    if (link) zap.href = link;

    if (d.final) {
      pararPolling();
      apagar(CHAVE_ULTIMO);
    }
    return d;
  }

  // -------------------------------------------------------------- PIX
  let pixTimer = null;
  function pararPix() { if (pixTimer) { clearInterval(pixTimer); pixTimer = null; } }

  function mostrarPix(st) {
    const box = $('pixBox');
    if (!st || st.pix_status == null || st.pix_status === 'na_entrega' || st.pagamento !== 'pix') {
      box.hidden = true; pararPix(); return;
    }
    box.hidden = false;
    const pago = st.pix_status === 'pago';
    const pix = st.pix || {};
    $('pixValor').textContent = fmtBRL(st.total);
    const pagar = $('pixPagar');
    const vencido = $('pixVencido');
    if (pago) {
      pagar.hidden = true; vencido.hidden = true; pararPix();
      $('pixMsg').textContent = '';
      return;
    }
    if (st.pix_status === 'expirado' || !pix.copia_cola) {
      pagar.hidden = true; vencido.hidden = false; pararPix();
      return;
    }
    pagar.hidden = false; vencido.hidden = true;
    if ($('pixCodigo').value !== pix.copia_cola) $('pixCodigo').value = pix.copia_cola;
    $('pixValidade').textContent = pix.expira_em
      ? 'O código vale por alguns minutos. Se vencer, você gera outro aqui.' : '';
  }

  function tratarPixAoCriar(r) {
    if (r && r.pix_status && r.pix_status !== 'na_entrega') {
      mostrarPix({ pagamento: 'pix', pix_status: r.pix_status, pix: r.pix, total: r.total });
    } else if (r && r.pix_falhou) {
      toast('Não deu para gerar o PIX; você paga na entrega.');
    }
  }

  $('btnCopiarPix').addEventListener('click', async () => {
    const cod = $('pixCodigo').value;
    try { await navigator.clipboard.writeText(cod); toast('Código PIX copiado.'); }
    catch (_) { $('pixCodigo').focus(); $('pixCodigo').select(); toast('Selecione e copie o código.'); }
  });
  $('btnJaPaguei').addEventListener('click', () => { toast('Estamos conferindo o pagamento…'); atualizarStatus(); });
  $('btnNovoPix').addEventListener('click', async () => {
    if (!estado.ultimo) return;
    $('pixMsg').textContent = '';
    $('btnNovoPix').disabled = true;
    try {
      const st = await api('pix', { token: estado.ultimo.token });
      renderStatus(st); mostrarPix(st);
    } catch (e) { $('pixMsg').textContent = e.message; }
    finally { $('btnNovoPix').disabled = false; }
  });
  $('btnPixEntrega').addEventListener('click', async () => {
    if (!estado.ultimo) return;
    $('pixMsg').textContent = '';
    $('btnPixEntrega').disabled = true;
    try {
      const st = await api('pix_na_entrega', { token: estado.ultimo.token });
      renderStatus(st); mostrarPix(st); toast('Você vai pagar na entrega.');
    } catch (e) { $('pixMsg').textContent = e.message; }
    finally { $('btnPixEntrega').disabled = false; }
  });

  async function atualizarStatus() {
    if (!estado.ultimo) return;
    try {
      const st = await api('status', { token: estado.ultimo.token });
      const d = renderStatus(st);
      mostrarPix(st);
      if (!d.final && !estado.polling) {
        estado.polling = setInterval(() => { if (document.visibilityState === 'visible') atualizarStatus(); }, 20000);
      }
    } catch (e) {
      if (e.status === 404) { apagar(CHAVE_ULTIMO); estado.ultimo = null; pararPolling(); }
    }
  }

  function pararPolling() {
    if (estado.polling) { clearInterval(estado.polling); estado.polling = null; }
    pararPix();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && estado.passo === 'passoEnviado') atualizarStatus();
  });

  $('btnVerPedido').addEventListener('click', () => {
    estado.temPedidoAberto = false;
    history.pushState({ passo: 'passoEnviado' }, '', '');
    mostrarPasso('passoEnviado', false);
    renderStatus({ codigo: estado.ultimo.codigo, status: 'pendente', itens: [] });
    atualizarStatus();
  });

  $('btnNovoPedido').addEventListener('click', () => {
    pararPolling();
    estado.temPedidoAberto = !!ler(CHAVE_ULTIMO);
    mostrarPasso('passoLocal', true);
  });

  $('formPedido').addEventListener('submit', (ev) => { ev.preventDefault(); enviarPedido(); });

  // -------------------------------------------------------------- partida
  history.replaceState({ passo: 'passoLocal' }, '', '');
  if (!('geolocation' in navigator)) $('btnLocalizacao').hidden = true;
  preencherDados();

  try { estado.codigoLink = new URLSearchParams(location.search).get('loja'); } catch (_) { /* sem URL */ }

  estado.ultimo = ler(CHAVE_ULTIMO);
  if (estado.ultimo && estado.ultimo.token) {
    api('status', { token: estado.ultimo.token }).then((st) => {
      if (!descreverStatus(st).final) {
        estado.temPedidoAberto = true;
        $('pedidoAberto').hidden = !(estado.passo === 'passoLocal' || estado.passo === 'passoCatalogo');
      } else {
        apagar(CHAVE_ULTIMO);
        estado.ultimo = null;
      }
    }).catch(() => {});
  }

  // Se o cliente já tem endereço lembrado, tenta resolver a loja de cara.
  if (soCep($('fCep').value).length === 8) buscarCep();
}

document.addEventListener('DOMContentLoaded', iniciar);
