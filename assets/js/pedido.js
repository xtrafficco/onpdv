/* pedido.js — página pública de pedido (pedido.html).
 *
 * Aberta pelo link que a mensagem de saudação do WhatsApp Business manda para quem
 * escreve para a loja. Fluxo: onde entregar → produtos → carrinho e dados → acompanhar.
 *
 * O que decide preço, distância e se o pedido é aceito é o banco (site_pedido_criar).
 * As contas aqui existem para o cliente ver na tela o mesmo valor que o servidor vai
 * calcular — e as regras seguem as de lá, linha por linha. Se mudar uma, mude a outra;
 * tests/pedido-site.test.mjs trava as duas coisas que mais importam: arredondamento
 * e quantidade de granel.
 *
 * As funções de nível superior são puras (sem DOM) de propósito, para os testes
 * carregarem este arquivo num sandbox. Tudo que mexe na tela está em iniciar().
 */
'use strict';

const PEDIDO_API = (function () {
  const PADRAO = 'https://qkhpvqepgozsaamxmugk.supabase.co/functions/v1/pedido-site';
  // Só para testar localmente contra um servidor na mesma origem. Em produção o
  // hostname nunca é localhost, então não há como apontar a página para outro lugar.
  try {
    const u = new URL(location.href);
    if ((u.hostname === 'localhost' || u.hostname === '127.0.0.1') && u.searchParams.get('api')) {
      return u.searchParams.get('api');
    }
  } catch (_) { /* sem location: sandbox de teste */ }
  return PADRAO;
})();

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

/**
 * Primeiro problema do pedido, na mesma ordem e com o mesmo texto que o banco usa.
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
    return { campo: 'fEndereco', mensagem: 'Informe o endereço de entrega.' };
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
  // selo = nome do ícone em ICONES (SVG): emoji muda de desenho entre aparelhos e vira
  // quadradinho em Android antigo.
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
  // Nomes neutros de propósito: "Loja confirmou" destacado como passo atual era lido
  // como se a loja já tivesse confirmado.
  const nomes = ['Pedido enviado', 'Confirmação da loja', 'Saída para entrega', 'Entrega'];
  let feitas = 1;                                   // pendente: só o envio
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
 * mais, gerado em Configurações). Código que não bate com exatamente uma loja
 * recebendo pedidos → null, e a página mostra a lista.
 */
function encontrarLojaPorLink(lojas, codigo) {
  const c = String(codigo || '').trim().toLowerCase();
  if (!/^[0-9a-f-]{8,36}$/.test(c)) return null;
  const achadas = (lojas || []).filter((l) => String(l.id || '').toLowerCase().startsWith(c));
  return achadas.length === 1 ? achadas[0] : null;
}

function mensagemProdutoNaoEncontrado(busca) {
  return 'Olá! Procurei "' + busca + '" no site de pedidos e não encontrei. Vocês têm?';
}

// ------------------------------------------------------------------ horário da loja
// horarios vem do banco: { "0": null, "1": ["08:00","19:00"], … } — 0 = domingo.

const NOME_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function minutosDe(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** "08:00" → "8h"; "08:30" → "8h30". */
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

/**
 * Aberta ou fechada num momento (dia 0–6 e minutos desde a meia-noite, no fuso da
 * loja). Sem horário cadastrado → null: a página não afirma nada.
 * Devolve { aberta, texto, quando } — quando = "amanhã às 8h", para compor frases.
 */
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
  return null;                                      // nenhum dia aberto: nada a afirmar
}

const FORMATO_AGORA_LOJA = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** Dia da semana e minutos no horário de Brasília — o do celular pode estar em outro fuso. */
function agoraNaLoja(data) {
  const p = {};
  for (const x of FORMATO_AGORA_LOJA.formatToParts(data || new Date())) p[x.type] = x.value;
  return {
    dia: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday),
    minutos: (Number(p.hour) % 24) * 60 + Number(p.minute),
  };
}

// ------------------------------------------------------------------ ícones
// Traço simples, 24×24, cor do texto. Desenhados aqui para não depender de biblioteca.
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

// ------------------------------------------------------------------ tela

function iniciar() {
  const $ = (id) => document.getElementById(id);

  const estado = {
    empresa: '',
    lojas: [],
    loja: null,
    coords: null,
    carrinho: new Map(),            // id → { id, nome, preco, unidade, qtd }
    produtos: new Map(),            // cache do que já apareceu na tela
    cat: { q: '', categoria: '', offset: 0, temMais: false, seq: 0, categorias: null },
    ultimo: null,
    temPedidoAberto: false,
    polling: null,
    passo: 'passoLocal',
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
  // Cada passo entra no histórico: o botão voltar do Android volta um passo em vez de
  // fechar a página e jogar o carrinho fora.
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
    // Quem abre o link da loja cai direto nos produtos: o aviso do pedido em andamento
    // precisa aparecer ali também, não só na escolha da loja.
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
    // Faixa do mínimo: só enquanto escolhe. No carrinho o aviso fica junto dos totais.
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

  // -------------------------------------------------------------- 1 · lojas
  function renderLojas() {
    const box = $('listaLojas');
    if (!estado.lojas.length) {
      box.innerHTML = '<p class="vazio">Nenhuma loja está recebendo pedidos pelo site agora.</p>';
      return;
    }
    const comGps = !!estado.coords;
    const melhor = comGps ? estado.lojas.find((l) => l.atende) : null;
    const agora = agoraNaLoja();
    box.innerHTML = estado.lojas.map((l) => {
      const sit = situacaoHorario(l.horarios, agora.dia, agora.minutos);
      const linhaHorario = sit
        ? '<br><span class="hor ' + (sit.aberta ? 'aberta' : 'fechada') + '">' + esc(sit.texto) + '</span>'
        : '';
      const fora = comGps && l.atende === false;
      // Espaço não separável: a linha quebra entre os itens, nunca entre "mínimo" e o valor.
      const detalhes = [
        l.bairro,
        Number(l.frete) > 0 ? 'entrega ' + fmtBRL(l.frete) : 'entrega grátis',
        Number(l.pedido_minimo) > 0 ? 'mínimo ' + fmtBRL(l.pedido_minimo) : '',
      ].filter(Boolean).join(' · ');
      const dist = l.distancia_km != null
        ? '<span class="dist">' + esc(String(l.distancia_km).replace('.', ',')) + ' km<em>'
          + (fora ? 'fora da área' : 'entrega aqui') + '</em></span>'
        : '';
      return '<button type="button" class="loja' + (fora ? ' fora' : '') + (melhor && melhor.id === l.id ? ' sugerida' : '')
        + '" data-loja="' + esc(l.id) + '"' + (fora ? ' aria-disabled="true"' : '') + '>'
        + '<b>' + esc(l.nome) + '</b>' + dist
        + '<small>' + esc(detalhes) + (l.horario ? '<br>' + esc(l.horario) : '') + linhaHorario + '</small>'
        + '</button>';
    }).join('');
  }

  $('listaLojas').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-loja]');
    if (!b) return;
    const loja = estado.lojas.find((l) => l.id === b.dataset.loja);
    if (!loja) return;
    if (estado.coords && loja.atende === false) {
      toast('Essa loja não entrega no seu endereço.');
      return;
    }
    escolherLoja(loja);
  });

  async function carregarLojas(coords) {
    const dados = await api('lojas', coords ? { lat: coords.lat, lng: coords.lng } : {});
    estado.empresa = dados.empresa || '';
    estado.lojas = dados.lojas || [];
    if (estado.empresa) {
      $('marca').textContent = estado.empresa;
      document.title = 'Fazer pedido · ' + estado.empresa;
    }
    renderLojas();
  }

  $('btnLocalizacao').addEventListener('click', () => {
    const msg = $('localMsg');
    msg.classList.remove('erro');
    $('foraArea').hidden = true;
    if (!('geolocation' in navigator)) {
      msg.textContent = 'Este aparelho não informa a localização. Escolha a loja abaixo.';
      return;
    }
    const btn = $('btnLocalizacao');
    btn.disabled = true;
    msg.textContent = 'Procurando a loja mais perto…';
    navigator.geolocation.getCurrentPosition(async (pos) => {
      estado.coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      try {
        await carregarLojas(estado.coords);
        const melhor = estado.lojas.find((l) => l.atende);
        if (melhor) {
          msg.textContent = '';
          toast('Loja ' + melhor.nome + ' · ' + String(melhor.distancia_km).replace('.', ',') + ' km de você');
          escolherLoja(melhor);
        } else {
          msg.textContent = '';
          mostrarForaDeArea();
        }
      } catch (e) {
        msg.textContent = e.message;
        msg.classList.add('erro');
      } finally {
        btn.disabled = false;
      }
    }, (erro) => {
      btn.disabled = false;
      msg.classList.add('erro');
      msg.textContent = erro.code === 1
        ? 'A localização não foi liberada. Escolha a loja abaixo.'
        : 'Não conseguimos pegar sua localização. Escolha a loja abaixo.';
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  });

  function mostrarForaDeArea() {
    const box = $('foraArea');
    const perto = estado.lojas[0];
    const link = perto && perto.whatsapp
      ? linkWhatsApp(perto.whatsapp, 'Olá! Queria fazer um pedido, mas o site diz que meu endereço está fora da área de entrega.')
      : '';
    box.innerHTML = '<div class="aviso erro"><b>Ainda não entregamos no seu endereço.</b>'
      + (perto && perto.distancia_km != null
        ? ' A loja mais perto, ' + esc(perto.nome) + ', fica a ' + esc(String(perto.distancia_km).replace('.', ',')) + ' km.'
        : '')
      + (link ? '<a class="btn zap bloco" target="_blank" rel="noopener" href="' + esc(link) + '">Falar com a loja no WhatsApp</a>' : '')
      + '</div>';
    box.hidden = false;
  }

  function escolherLoja(loja) {
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

  function linhaProduto(p) {
    const granel = ehGranel(p.unidade);
    // No cadastro, "embalagem" quase sempre repete a unidade (UN, KG). Só aparece quando diz algo.
    const embalagem = /^(un|und|unid|kg|pc|pç|cx)$/i.test(String(p.embalagem || '').trim()) ? '' : p.embalagem;
    const meta = [embalagem, granel ? 'vendido por kg' : ''].filter(Boolean).join(' · ');
    return '<div class="prod" data-prod="' + esc(p.id) + '">'
      + '<div><div class="prod-nome">' + esc(p.nome) + '</div>'
      + (meta ? '<div class="prod-meta">' + esc(meta) + '</div>' : '')
      + '<div class="prod-preco">' + fmtBRL(p.preco) + (granel ? ' <small>/kg</small>' : '') + '</div></div>'
      + '<div class="prod-acao">' + controleProduto(p) + '</div>'
      + '</div>';
  }

  async function carregarProdutos(anexar) {
    const box = $('produtos');
    const seq = ++estado.cat.seq;
    const fimDaEspera = () => { box.classList.remove('buscando'); box.removeAttribute('aria-busy'); };
    if (!anexar) {
      estado.cat.offset = 0;
      // Com produtos na tela, a lista fica apagada até a resposta chegar, em vez de
      // sumir e voltar a cada letra digitada.
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
      if (seq !== estado.cat.seq) return;                // resposta velha: já digitaram outra coisa
      fimDaEspera();
      const itens = r.itens || [];
      for (const p of itens) estado.produtos.set(p.id, p);
      if (r.categorias) { estado.cat.categorias = r.categorias; renderCategorias(); }
      estado.cat.offset += itens.length;
      estado.cat.temMais = !!r.tem_mais;
      const html = itens.map(linhaProduto).join('');
      if (anexar) box.insertAdjacentHTML('beforeend', html);
      else box.innerHTML = html || semResultado();
      $('btnMais').hidden = !estado.cat.temMais;
    } catch (e) {
      if (seq !== estado.cat.seq) return;
      fimDaEspera();
      box.innerHTML = '<div class="aviso erro">' + esc(e.message)
        + '<button type="button" class="btn fantasma bloco" data-acao="recarregar">Tentar de novo</button></div>';
    }
  }

  // Busca sem resultado não pode ser beco sem saída: a loja pode ter o produto e ele
  // não estar no site (categoria oculta, cadastro com outro nome).
  function semResultado() {
    const q = estado.cat.q;
    const link = q && estado.loja && estado.loja.whatsapp
      ? linkWhatsApp(estado.loja.whatsapp, mensagemProdutoNaoEncontrado(q))
      : '';
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
    if (acao === 'add') nova = 1;                       // granel também começa em 1 kg
    else nova = ajustarQtd(p.unidade, atual ? atual.qtd : 0, acao === 'mais' ? 1 : -1);
    if (nova > 0) {
      estado.carrinho.set(id, { id, nome: p.nome, preco: Number(p.preco), unidade: p.unidade, qtd: nova });
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
  function renderCarrinho() {
    const itens = [...estado.carrinho.values()];
    const loja = estado.loja || {};
    const t = totaisCarrinho(itens, loja.frete);
    $('itensCarrinho').innerHTML = itens.length
      ? itens.map((it) => '<div class="item-car" data-item="' + esc(it.id) + '">'
          + '<div><div class="prod-nome">' + esc(it.nome) + '</div>'
          + '<div class="prod-meta">' + fmtBRL(it.preco) + (ehGranel(it.unidade) ? '/kg' : ' cada') + '</div></div>'
          + '<button type="button" class="remover" data-acao="remover" data-id="' + esc(it.id) + '">Remover</button>'
          + '<div class="linha">' + controleProduto(it)
          + '<span class="sub">' + fmtBRL(arred2(it.qtd * it.preco)) + '</span></div>'
          + '</div>').join('')
      : '<p class="vazio">Seu carrinho está vazio.</p>';
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

  function preencherDados() {
    const d = ler(CHAVE_DADOS);
    if (!d) return;
    for (const [campo, id] of [['nome', 'fNome'], ['telefone', 'fFone'], ['endereco', 'fEndereco'],
      ['bairro', 'fBairro'], ['complemento', 'fComplemento']]) {
      if (d[campo] && !$(id).value) $(id).value = d[campo];
    }
    $('fFone').value = mascaraFone($('fFone').value);
  }

  // Máscara só quando o cursor está no fim: editar no meio do número não faz o
  // cursor pular para o final a cada tecla.
  $('fFone').addEventListener('input', () => {
    const c = $('fFone');
    if (c.selectionStart !== c.value.length) return;
    const formatado = mascaraFone(c.value);
    if (formatado !== c.value) c.value = formatado;
  });
  $('fFone').addEventListener('blur', () => { $('fFone').value = mascaraFone($('fFone').value); });

  // Enter do teclado do celular leva ao próximo campo em vez de enviar o pedido sem querer.
  const ORDEM_CAMPOS = ['fNome', 'fFone', 'fEndereco', 'fBairro', 'fComplemento'];
  $('formPedido').addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' || ev.target.tagName === 'TEXTAREA' || ev.target.type === 'checkbox') return;
    ev.preventDefault();
    const i = ORDEM_CAMPOS.indexOf(ev.target.id);
    if (i >= 0 && i < ORDEM_CAMPOS.length - 1) {
      $(ORDEM_CAMPOS[i + 1]).focus();
    } else if (ev.target.id === 'fComplemento') {
      ev.target.blur();
      $('pagDinheiro').closest('fieldset').scrollIntoView({ block: 'center' });
    } else if (ev.target.id === 'fTroco') {
      $('fObs').focus();
    } else {
      ev.target.blur();
    }
  });

  document.querySelectorAll('input[name="pagamento"]').forEach((r) => {
    r.addEventListener('change', () => { $('trocoWrap').hidden = !$('pagDinheiro').checked; });
  });

  function lerFormulario() {
    const pag = document.querySelector('input[name="pagamento"]:checked');
    return {
      nome: $('fNome').value.trim(),
      telefone: $('fFone').value.trim(),
      endereco: $('fEndereco').value.trim(),
      bairro: $('fBairro').value.trim(),
      complemento: $('fComplemento').value.trim(),
      pagamento: pag ? pag.value : '',
      troco_para: pag && pag.value === 'dinheiro' ? lerDinheiro($('fTroco').value) : null,
      obs: $('fObs').value.trim(),
    };
  }

  // Erro de campo aparece colado no campo. No fim do formulário ele ficava fora da tela:
  // o cliente via o cursor no Nome e não sabia por que o pedido não foi.
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
      // Carrinho vazio ou abaixo do mínimo: o aviso certo está no topo, junto dos totais.
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
          lat: estado.coords ? estado.coords.lat : null,
          lng: estado.coords ? estado.coords.lng : null,
          itens: itens.map((it) => ({ product_id: it.id, qtd: it.qtd })),
        }),
      });
      if ($('fLembrar').checked) {
        guardar(CHAVE_DADOS, { nome: dados.nome, telefone: dados.telefone, endereco: dados.endereco,
          bairro: dados.bairro, complemento: dados.complemento });
      } else {
        apagar(CHAVE_DADOS);
      }
      estado.carrinho.clear();
      salvarCarrinho();
      estado.ultimo = { token: r.token, codigo: r.codigo };
      guardar(CHAVE_ULTIMO, estado.ultimo);
      // Substitui o histórico: voltar da tela de acompanhamento não pode reabrir o
      // carrinho que acabou de ser enviado.
      history.replaceState({ passo: 'passoEnviado' }, '', '');
      mostrarPasso('passoEnviado', false);
      renderStatus({ codigo: r.codigo, status: 'pendente', loja: r.loja, total: r.total, itens: [] });
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
    // Pedido feito com a loja fechada: dizer quando ela abre, em vez de "em instantes".
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

  async function atualizarStatus() {
    if (!estado.ultimo) return;
    try {
      const st = await api('status', { token: estado.ultimo.token });
      const d = renderStatus(st);
      if (!d.final && !estado.polling) {
        estado.polling = setInterval(() => { if (document.visibilityState === 'visible') atualizarStatus(); }, 20000);
      }
    } catch (e) {
      if (e.status === 404) { apagar(CHAVE_ULTIMO); estado.ultimo = null; pararPolling(); }
    }
  }

  function pararPolling() {
    if (estado.polling) { clearInterval(estado.polling); estado.polling = null; }
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

  // Link da loja (?loja=<código>), vindo da saudação do WhatsApp daquela loja: o cliente
  // já escolheu a loja ao escrever para ela, então vai direto para os produtos.
  // Vale só na primeira carga — "trocar loja" depois volta para a lista normalmente.
  let codigoDoLink = null;
  try { codigoDoLink = new URLSearchParams(location.search).get('loja'); } catch (_) { /* sem URL */ }

  function aplicarLinkDaLoja() {
    if (!codigoDoLink) return;
    const codigo = codigoDoLink;
    codigoDoLink = null;
    const loja = encontrarLojaPorLink(estado.lojas, codigo);
    if (loja) { escolherLoja(loja); return; }
    $('foraArea').innerHTML = '<div class="aviso">A loja deste link não está recebendo pedidos pelo site agora.'
      + (estado.lojas.length ? ' Escolha uma das lojas abaixo.' : '') + '</div>';
    $('foraArea').hidden = false;
  }

  // Se a segunda tentativa também falhar, volta o aviso com o botão — antes a lista
  // ficava presa em "Carregando lojas…".
  function carregarLojasComAviso() {
    $('listaLojas').innerHTML = '<p class="carregando">Carregando lojas…</p>';
    carregarLojas(estado.coords).then(aplicarLinkDaLoja, (e) => {
      $('listaLojas').innerHTML = '<div class="aviso erro">' + esc(e.message)
        + '<button type="button" class="btn fantasma bloco" id="btnRecarregarLojas">Tentar de novo</button></div>';
      $('btnRecarregarLojas').addEventListener('click', carregarLojasComAviso);
    });
  }
  carregarLojasComAviso();
}

document.addEventListener('DOMContentLoaded', iniciar);
