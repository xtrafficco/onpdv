// ONPDV — service worker único (raiz). Cacheia a casca dos DOIS apps do mesmo domínio:
//  • index.html      → Caixa/ERP (PDV)
//  • entregador.html → app do entregador
// Estratégia: navegação = network-first (pega a versão nova; cai no cache quando offline);
// estáticos (ícones, lib) = cache-first. Chamadas ao Supabase NUNCA são cacheadas.
const CACHE = 'onpdv-v33';
// supabase-js fixado (mesma versão+SRI do HTML): pré-cacheado para os apps abrirem
// offline mesmo se a CDN estiver fora do ar.
const SUPABASE_LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.8';
const SHELL = [
  './index.html',
  './assets/css/onpdv.css',
  './assets/js/onpdv-bootstrap.js',
  './assets/js/onpdv-app.js',
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
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
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
