// ONPDV — service worker único (raiz). Cacheia a casca dos DOIS apps do mesmo domínio:
//  • index.html      → Caixa/ERP (PDV)
//  • entregador.html → app do entregador
// Estratégia: navegação = network-first (pega a versão nova; cai no cache quando offline);
// estáticos (ícones, lib) = cache-first. Chamadas ao Supabase NUNCA são cacheadas.
const CACHE = 'onpdv-v48';
// supabase-js fixado (mesma versão+SRI do HTML): pré-cacheado para os apps abrirem
// offline mesmo se a CDN estiver fora do ar.
const SUPABASE_LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.8';
const SHELL = [
  './index.html',
  './assets/css/onpdv.css',
  './assets/js/onpdv-bootstrap.js',
  './assets/js/onpdv-app.js',
  './assets/js/onpdv-raiox.js',
  './assets/css/onpdv-raiox.css',
  './partials/onpdv-app.html',
  './entregador.html',
  './vitrine.html',
  './cliente.html',
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

self.addEventListener('install', (e) => {
  // Pré-cache TOLERANTE: se um item falhar (ex.: a lib do Supabase via CDN indisponível na
  // primeira instalação), o SW ainda instala e cacheia todo o resto — o que falhar é
  // buscado depois pelo handler de fetch. Evita que o app fique sem casca offline por um
  // único recurso externo. (addAll é tudo-ou-nada; allSettled sobre add() não é.)
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

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
      : './index.html';
    e.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(req).then((c) => c || caches.match(fallback)))
    );
    return;
  }

  // Estáticos (ícones, fontes, lib supabase): cache-first com atualização em 2º plano.
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
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
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of wins) {
      // Reaproveita uma janela já aberta do mesmo app em vez de abrir outra.
      if (c.url.startsWith(self.registration.scope) && 'focus' in c) {
        try { await c.focus(); return; } catch (_) { /* segue para openWindow */ }
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
  })());
});
