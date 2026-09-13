importScripts(
  'https://storage.googleapis.com/workbox-cdn/releases/7.4.1/workbox-sw.js'
)

if (workbox) {
  const {
    routing,
    strategies,
    expiration,
    cacheableResponse,
  } = workbox

  const { registerRoute } = routing
  const {
    NetworkFirst,
    CacheFirst,
    StaleWhileRevalidate,
    NetworkOnly,
  } = strategies

  const { ExpirationPlugin } = expiration
  const { CacheableResponsePlugin } = cacheableResponse

  // 让新版 Service Worker 尽快接管页面
  workbox.core.clientsClaim()

  // ============================================================
  // 1. Analytics
  //
  // 必须放前面，不允许进入任何缓存规则
  // ============================================================

  registerRoute(
    ({ url }) =>
      url.hostname.includes('google-analytics.com') ||
      url.pathname.includes('/g/collect'),

    new NetworkOnly()
  )


  // ============================================================
  // 2. HTML 页面
  //
  // 优先网络，网络失败时再使用缓存
  // ============================================================

  registerRoute(
    ({ request }) => request.mode === 'navigate',

    new NetworkFirst({
      cacheName: 'pages-v1',

      networkTimeoutSeconds: 4,

      plugins: [
        new CacheableResponsePlugin({
          statuses: [200],
        }),

        new ExpirationPlugin({
          maxEntries: 50,
          maxAgeSeconds: 7 * 24 * 60 * 60,
          purgeOnQuotaError: true,
        }),
      ],
    })
  )


  // ============================================================
  // 3. GitHub Pages 本站的 Next.js 静态资源
  //
  // 例如：
  // /_next/static/chunks/xxx-abcd1234.js
  // /_next/static/css/xxx-abcd1234.css
  //
  // 文件名带 hash，因此可以放心 CacheFirst
  // ============================================================

  registerRoute(
    ({ url }) =>
      url.origin === self.location.origin &&
      url.pathname.startsWith('/_next/static/'),

    new CacheFirst({
      cacheName: 'next-static-v1',

      plugins: [
        new CacheableResponsePlugin({
          statuses: [200],
        }),

        new ExpirationPlugin({
          maxEntries: 150,
          maxAgeSeconds: 30 * 24 * 60 * 60,
          purgeOnQuotaError: true,
        }),
      ],
    })
  )


  // ============================================================
  // 4. cdn.mjtech.top 上的 CSS / JS
  //
  // 实际链路：
  //
  // cdn.mjtech.top
  //       ↓ 302
  // jsDelivr / jsDMirror
  //
  // 使用 StaleWhileRevalidate：
  // 有缓存时立即返回，同时后台刷新
  // ============================================================

  registerRoute(
    ({ url, request }) =>
      url.hostname === 'cdn.mjtech.top' &&
      (
        request.destination === 'script' ||
        request.destination === 'style'
      ),

    new StaleWhileRevalidate({
      cacheName: 'cdn-static-v1',

      plugins: [
        new CacheableResponsePlugin({
          // 0 = opaque 跨域响应
          // 200 = 正常响应
          statuses: [0, 200],
        }),

        new ExpirationPlugin({
          maxEntries: 60,
          maxAgeSeconds: 7 * 24 * 60 * 60,
          purgeOnQuotaError: true,
        }),
      ],
    })
  )


  // ============================================================
  // 5. 图片和字体
  //
  // 图片和字体变化频率较低，可以长期 CacheFirst
  // ============================================================

  registerRoute(
    ({ request }) =>
      request.destination === 'image' ||
      request.destination === 'font',

    new CacheFirst({
      cacheName: 'assets-v1',

      plugins: [
        new CacheableResponsePlugin({
          statuses: [0, 200],
        }),

        new ExpirationPlugin({
          maxEntries: 100,
          maxAgeSeconds: 30 * 24 * 60 * 60,
          purgeOnQuotaError: true,
        }),
      ],
    })
  )
}