// ONPDV — service worker único (raiz). Cacheia a casca dos DOIS apps do mesmo domínio:
//  • index.html      → Caixa/ERP (PDV)
//  • entregador.html → app do entregador
// Estratégia: navegação = network-first (pega a versão nova; cai no cache quando offline);
// estáticos (ícones, lib) = cache-first. Chamadas ao Supabase NUNCA são cacheadas.
const CACHE = 'onpdv-2026.09.16-v59';
// supabase-js fixado (mesma versão+SRI do HTML): pré-cacheado para os apps abrirem
// offline mesmo se a CDN estiver fora do ar.
const SUPABASE_LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.8';
const SHELL = [
  './index.html',
  './assets/css/onpdv.css',
  './assets/js/onpdv-bootstrap.js',
  './assets/js/onpdv-app.js',
  './assets/js/onpdv-raiox.js',
  './assets/js/onpdv-compras.js',
  './assets/css/onpdv-raiox.css',
  './partials/onpdv-app.html',
  './entregador.html',
  './vitrine.html',
  './cliente.html',
  // O JS de cada portal junto com a página dele. A casca sozinha não serve de nada:
  // entregador/vitrine/cliente têm o CSS embutido no <style>, mas o comportamento
  // inteiro vive nestes três arquivos — sem eles a página abre offline e não faz nada.
  './assets/js/entregador.js',
  './assets/js/vitrine.js',
  './assets/js/cliente.js',
  // Pedido pelo site: a casca abre offline e avisa que precisa de internet, em vez de
  // cair na tela de login do caixa (que era o fallback de qualquer caminho desconhecido).
  './pedido.html',
  './assets/js/pedido.js',
  './manifest.webmanifest',
  './app.webmanifest',
  './vitrine.webmanifest',
  './cliente.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './lib/leaflet/leaflet.js',
  './lib/leaflet/leaflet.css',
  './lib/leaflet/images/layers.png',
  './lib/leaflet/images/layers-2x.png',
  './lib/leaflet/images/marker-icon.png',
  './lib/leaflet/images/marker-icon-2x.png',
  './lib/leaflet/images/marker-shadow.png',
  './lib/qrcode.js',
  SUPABASE_LIB
];

// Sem estes cinco o caixa não abre: são a casca mínima do PDV. Todo o resto do SHELL
// (os outros portais, Leaflet, ícones, a lib da CDN) é acessório e pode faltar.
const NUCLEO = [
  './index.html',
  './assets/css/onpdv.css',
  './assets/js/onpdv-bootstrap.js',
  './assets/js/onpdv-app.js',
  './partials/onpdv-app.html',
];

self.addEventListener('install', (e) => {
  // O NÚCLEO é tudo-ou-nada; o resto é tolerante.
  //
  // Antes o pré-cache inteiro era tolerante, o que parecia prudente e não era: se o
  // onpdv.css falhasse aqui, o SW instalava do mesmo jeito e ficava sem rede de
  // segurança justamente no arquivo sem o qual a tela abre sem estilo nenhum. E o
  // caixa não tem como perceber — só aparece no dia em que a rede oscila.
  //
  // Falhar a instalação é melhor: o SW anterior continua no comando e o app segue
  // funcionando online, em vez de ficar com um cache furado que só se revela offline.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(NUCLEO).then(() => {
        const resto = SHELL.filter((u) => !NUCLEO.includes(u));
        return Promise.allSettled(resto.map((u) => c.add(u)));
      }))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// respondWith() com algo que não seja Response estoura um TypeError e o navegador
// registra "Failed to convert value to 'Response'" — erro que não diz nada sobre a
// causa real. Os três caminhos abaixo terminavam em `caches.match()`, que resolve
// `undefined` quando o item não está no cache; era o que acontecia quando a rede
// falhava num arquivo que o pré-cache não guardou.
//
// Aqui a falha volta a ser o que seria sem Service Worker nenhum: um erro de rede
// honesto, que aparece no console com o nome do arquivo que faltou.
const falhaDeRede = () => Response.error();

// Navegação é o único caso em que dá para fazer melhor que um erro cru: quem abriu o
// sistema merece uma frase explicando, não a tela de dinossauro do navegador.
const paginaSemConexao = () => new Response(
  '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<title>ONPDV — sem conexão</title></head>'
  + '<body style="font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#1c2333">'
  + '<h1 style="font-size:1.25rem">Sem conexão</h1>'
  + '<p>O ONPDV não conseguiu carregar esta tela e não há uma cópia guardada para abrir offline.</p>'
  + '<p>Verifique a internet e tente de novo.</p>'
  + '<p><button onclick="location.reload()" style="font:inherit;padding:.6rem 1.2rem;border:0;border-radius:.5rem;background:#12307a;color:#fff;cursor:pointer">Tentar de novo</button></p>'
  + '</body></html>',
  { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Nunca cachear chamadas do Supabase (auth, RPC, realtime) nem outras APIs — sempre rede.
  if (url.origin.includes('supabase.co') || url.pathname.includes('/functions/v1/') || url.pathname.includes('/rest/v1/') || url.pathname.includes('/auth/v1/')) {
    return; // deixa o navegador ir direto à rede
  }
  // version.json precisa ser sempre fresco (checagem de atualização) — nunca do cache.
  if (url.pathname.endsWith('/version.json')) { return; }

  // Navegações (documentos HTML): NETWORK-FIRST. Este SW tem escopo raiz e controla
  // todo o site — os quatro frontends. Cache-first serviria uma versão
  // velha para o caixa. Então buscamos sempre a versão fresca na rede e só caímos no
  // cache quando estiver offline, devolvendo a casca certa conforme o caminho pedido.
  if (req.mode === 'navigate' || (req.destination === 'document')) {
    const fallback = url.pathname.includes('entregador') ? './entregador.html'
      : url.pathname.includes('vitrine') ? './vitrine.html'
      : url.pathname.includes('cliente') ? './cliente.html'
      : url.pathname.includes('pedido') ? './pedido.html'
      : './index.html';
    e.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(req)
        .then((c) => c || caches.match(fallback))
        .then((c) => c || paginaSemConexao()))
    );
    return;
  }

  // Código do próprio app (JS, CSS e partials): NETWORK-FIRST.
  // Cache-first aqui era a causa do sintoma "publiquei o arquivo e o sistema continua
  // com a versão velha": o navegador servia o onpdv-app.js antigo do cache enquanto o
  // bootstrap buscava o partial com no-store, então a tela nova aparecia no menu mas o
  // JS por trás dela era o antigo — e a página abria em branco. Com network-first a
  // publicação passa a valer na recarga seguinte, e o cache só entra quando está offline.
  const isAppCode = url.origin === self.location.origin
    && (url.pathname.includes('/assets/') || url.pathname.includes('/partials/'));
  if (isAppCode) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(req).then((c) => c || falhaDeRede()))
    );
    return;
  }

  // Demais estáticos (ícones, fontes, leaflet, lib supabase): cache-first com
  // atualização em 2º plano. São arquivos versionados ou que não mudam.
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached || falhaDeRede());
      return cached || network;
    })
  );
});

// ============ WEB PUSH (notificações mesmo com o app fechado) ============
// O servidor (edge function push-dispatch) envia { title, body, url, tag }.
// Aqui só exibimos e, ao clicar, focamos/abrimos a tela certa do ONPDV.

// Só quatro frontends existem neste domínio. Qualquer outra URL (ex.: o
// legado "/dashboard.html" dos enfileiradores) cai no ERP/Caixa (index.html).
function resolveNotificationUrl(raw) {
  try {
    const target = new URL(raw || '', self.registration.scope);
    const path = target.pathname.toLowerCase();
    if (path.includes('entregador')) return './entregador.html';
    if (path.includes('vitrine')) return './vitrine.html';
    if (path.includes('cliente')) return './cliente.html';
    if (path.endsWith('/index.html') || path.endsWith('/')) return './index.html';
    return './index.html';
  } catch (_) {
    return './index.html';
  }
}

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; }
  catch (_) { data = { body: (e.data && e.data.text && e.data.text()) || '' }; }
  const title = data.title || 'ONPDV';
  const options = {
    body: data.body || '',
    tag: data.tag || 'onpdv',
    renotify: true,
    icon: './icon-192.png',
    badge: './icon-192.png',
    data: { url: resolveNotificationUrl(data.url) }
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || './index.html';
  const targetUrl = new URL(target, self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .filter((c) => c.url.startsWith(self.registration.scope) && 'focus' in c);
    // Reaproveita uma janela já aberta, mas só se for do MESMO app. Antes qualquer
    // janela sob o escopo servia: um push de entrega clicado com o caixa aberto
    // focava o caixa e a tela do entregador nunca aparecia.
    const alvoArquivo = targetUrl.split('/').pop();
    const mesmaTela = wins.find((c) => c.url.split('?')[0].endsWith(alvoArquivo))
      || (alvoArquivo === 'index.html' ? wins.find((c) => c.url.replace(self.registration.scope, '').split('?')[0] === '') : null);
    if (mesmaTela) { try { await mesmaTela.focus(); return; } catch (_) { /* segue */ } }
    // Tem janela aberta, mas de outra tela: navega ela em vez de abrir mais uma.
    for (const c of wins) {
      try { const nav = c.navigate ? await c.navigate(targetUrl) : null; await (nav || c).focus(); return; }
      catch (_) { /* navegação entre documentos pode ser recusada: tenta a próxima */ }
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
  })());
});
