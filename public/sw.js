/* Service worker do HIIT.
   O app inteiro é estático e pesa poucas dezenas de KB, então a estratégia é
   simples: guardar tudo o que for pedido e servir do cache primeiro. Depois da
   primeira visita o app abre sem rede nenhuma. */

// Trocar a versão descarta o cache anterior por completo na ativação. Serve
// para garantir que uma correção chegue mesmo em aparelhos com cache teimoso.
const CACHE = 'hiit-v2'
const SCOPE = new URL(self.registration.scope).pathname

const SHELL = [SCOPE, `${SCOPE}index.html`, `${SCOPE}manifest.webmanifest`]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Navegação: rede primeiro para pegar uma versão nova quando houver, com o
  // index guardado como rede de segurança offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          void caches.open(CACHE).then((cache) => cache.put(`${SCOPE}index.html`, copy))
          return response
        })
        .catch(() =>
          caches
            .match(`${SCOPE}index.html`)
            .then((cached) => cached ?? Response.error()),
        ),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone()
          void caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      })
    }),
  )
})
