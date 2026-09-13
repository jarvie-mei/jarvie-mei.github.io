/* global workbox, importScripts */
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.4.1/workbox-sw.js')

const { registerRoute, setCatchHandler } = workbox.routing
const { NetworkFirst, CacheFirst, StaleWhileRevalidate, NetworkOnly } = workbox.strategies
const { ExpirationPlugin } = workbox.expiration
const { CacheableResponsePlugin } = workbox.cacheableResponse
const scope = new URL(self.registration.scope)
const cachePrefix = `jarvis-blog:${scope.href}:`
const cacheName = (name) => `${cachePrefix}${name}`
const nextStaticPath = `${scope.pathname}_next/static/`

// Activation remains opt-in while an older worker controls open pages.
workbox.core.clientsClaim()
workbox.navigationPreload.enable()
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

const plugins = (maxEntries, days, opaque = false) => [
  new CacheableResponsePlugin({ statuses: opaque ? [0, 200] : [200] }),
  new ExpirationPlugin({
    maxEntries,
    maxAgeSeconds: days * 24 * 60 * 60,
    purgeOnQuotaError: true,
  }),
]

const isAnalytics = ({ url }) =>
  url.hostname === 'google-analytics.com' ||
  url.hostname.endsWith('.google-analytics.com') ||
  url.pathname.includes('/g/collect')

// Workbox routes default to GET; explicitly exclude POST collection requests too.
registerRoute(isAnalytics, new NetworkOnly())
registerRoute(isAnalytics, new NetworkOnly(), 'POST')

registerRoute(
  ({ request, url }) => request.mode === 'navigate' && url.origin === scope.origin,
  new NetworkFirst({
    cacheName: cacheName('pages-v2'),
    networkTimeoutSeconds: 4,
    plugins: plugins(50, 7),
  })
)

// The deployed assetPrefix puts Next's immutable chunks on this CDN.
// Match the original request URL, before any CDN redirect is followed.
registerRoute(
  ({ url }) =>
    (url.origin === scope.origin && url.pathname.startsWith(nextStaticPath)) ||
    (url.hostname === 'cdn.mjtech.top' &&
      url.pathname.startsWith('/gh/jarvie-mei/jarvie-mei.github.io/_next/static/')),
  new CacheFirst({
    cacheName: cacheName('next-static-v2'),
    plugins: plugins(150, 30),
  })
)

registerRoute(
  ({ url, request }) =>
    url.hostname === 'cdn.mjtech.top' &&
    (request.destination === 'script' || request.destination === 'style'),
  new StaleWhileRevalidate({
    cacheName: cacheName('cdn-static-v2'),
    plugins: plugins(60, 7, true),
  })
)

// Images and unversioned fonts can change without their URLs changing.
// Opaque failures are retried in the background instead of staying cache-first.
registerRoute(
  ({ request }) => request.destination === 'image' || request.destination === 'font',
  new StaleWhileRevalidate({
    cacheName: cacheName('assets-v2'),
    plugins: plugins(100, 7, true),
  })
)

// Keep the fallback inside the worker: no stylesheet, script, or extra install
// request is needed offline, and changes update with the worker itself.
setCatchHandler(async ({ request }) => {
  if (request.mode !== 'navigate') return Response.error()

  return new Response(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>You're offline — Jarvis' Blog</title>
  <style>
    body { font: 18px/1.6 system-ui, sans-serif; margin: 0; padding: 24px;
      min-height: 80vh; display: grid; place-items: center; }
    main { max-width: 32rem; }
    h1 { line-height: 1.2; }
    a { color: inherit; display: inline-block; padding: 10px 18px;
      border: 1px solid currentColor; border-radius: 8px; }
  </style>
</head>
<body><main>
  <h1>You're offline</h1>
  <p>This page isn't available offline yet. Check your connection and try again.</p>
  <a href="">Try again</a>
</main></body>
</html>`,
    {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    }
  )
})
