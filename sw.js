// Service Worker - 巫カードフィルター キャッシュ戦略
// GitHub Pages対応: 静的リソースをキャッシュしてリピーターの読み込みを高速化

const CACHE_VERSION = 'kannagi-v1';
const STATIC_CACHE = CACHE_VERSION + '-static';
const IMAGE_CACHE = CACHE_VERSION + '-images';

// 静的リソース（必ずキャッシュ）
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './scripts.js',
  './cards.js',
  './placeholder.jpg',
  './favicon/favicon.ico'
];

// インストール: 静的リソースを事前キャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// アクティベーション: 古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('kannagi-') && name !== STATIC_CACHE && name !== IMAGE_CACHE)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// フェッチ戦略
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 外部リソース（Google Analytics等）はネットワーク優先で通す
  if (url.origin !== self.location.origin) {
    return;
  }

  // 画像ファイル: キャッシュ優先、なければネットワーク（Cache First）
  if (url.pathname.match(/\.(jpg|jpeg|png|webp|gif|svg)$/i)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(event.request).then((networkResponse) => {
            if (networkResponse.ok) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => {
            // オフライン時のフォールバック: プレースホルダーを返す
            return cache.match('./placeholder.jpg');
          });
        });
      })
    );
    return;
  }

  // 静的リソース（HTML/CSS/JS）: ネットワーク優先、失敗時キャッシュ（Stale While Revalidate）
  event.respondWith(
    caches.open(STATIC_CACHE).then((cache) => {
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse.ok) {
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      }).catch(() => {
        return cache.match(event.request);
      });
    })
  );
});
