/**
 * SMART FINDER KIOSK - SERVICE WORKER
 * Menangani offline caching aset statis untuk menjamin kiosk 100% aktif tanpa internet
 * Versi: 2.0.0
 */

const CACHE_NAME = "smart-finder-kiosk-v2.0.8";

const STATIC_ASSETS = [
  "./",
  "index.html",
  "app.js",
  "manifest.json",
  "eurekabookhouse.png",
  "assets/css/style.min.css",
  "assets/js/lucide.min.js",
  "assets/fonts/inter-latin.woff2",
  "assets/images/book-placeholder.svg",
  "assets/images/icon-192.png",
  "assets/images/icon-512.png",
];

// 1. Install Event: Pra-unduh dan simpan semua aset statis ke Cache Storage
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("[SW] Menyimpan aset statis ke cache offline...");
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting()),
  );
});

// 2. Activate Event: Bersihkan cache versi lama jika ada pembaruan versi
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => {
              console.log("[SW] Menghapus cache usang:", key);
              return caches.delete(key);
            }),
        );
      })
      .then(() => self.clients.claim()),
  );
});

// 3. Fetch Event: Strategi Cache-First untuk aset lokal, Fallback placeholder untuk gambar
self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  // Jangan cegat request Google Sheets (biarkan ditangani oleh app.js + localStorage)
  if (
    requestUrl.hostname.includes("google.com") ||
    requestUrl.hostname.includes("googleusercontent.com")
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).catch(() => {
        // Jika request gambar gagal saat offline, kembalikan placeholder lokal
        if (event.request.destination === "image") {
          return caches.match("assets/images/book-placeholder.svg");
        }
      });
    }),
  );
});
