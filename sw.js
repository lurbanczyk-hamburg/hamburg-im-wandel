// sw.js — Service Worker für "Einzelhandel im Wandel"
// ======================================================
// Aufgabe: Offline-Fähigkeit. Die Seite selbst (HTML/Manifest/Icons) sowie bereits einmal
// geladene Kartenkacheln/Schriften (MapTiler) werden zwischengespeichert, damit die App
// auch mit schwachem/fehlendem Netz nutzbar bleibt (wichtig für den Spaziergang-Modus auf
// der Straße). Noch nie geladene Kartenausschnitte brauchen weiterhin Netz - es wird nicht
// die ganze Stadt im Voraus heruntergeladen.
//
// Push-Benachrichtigungen sind erst einmal herausgenommen (Stand 15.10.2026, auf Wunsch) -
// siehe Leitfaden Abschnitt 7.11d/g für die Recherche zu OneSignal und WonderPush, falls
// das Feature später wieder aufgegriffen wird.

const SHELL_CACHE = "eiw-shell-v1";
const TILE_CACHE = "eiw-tiles-v1";

// Pfade relativ zu dieser Datei - beim Hosten bitte sw.js im selben Ordner wie die
// HTML-Datei lassen, sonst stimmen diese relativen Pfade nicht mehr.
const SHELL_FILES = [
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-192-maskable.png",
  "./icons/icon-512-maskable.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)).catch((err) => {
      // addAll bricht ab, wenn eine einzelne Datei fehlt (z.B. Icons noch nicht hochgeladen) -
      // das soll die Installation des Service Workers nicht komplett verhindern.
      console.error("Einige App-Shell-Dateien konnten nicht gecacht werden:", err);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          // Nur alte Versionen unserer EIGENEN Caches löschen (Präfix "eiw-"). So bleiben
          // Caches, die WonderPush oder ein künftiger Anbieter selbst anlegt, unberührt,
          // ohne dass wir deren genaues Namensschema kennen müssen.
          .filter((n) => n.startsWith("eiw-") && n !== SHELL_CACHE && n !== TILE_CACHE)
          .map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

function isMapAsset(url) {
  return (
    url.hostname.endsWith("maptiler.com") ||
    url.hostname.endsWith("jsdelivr.net") ||
    url.hostname.endsWith("googleapis.com") ||
    url.hostname.endsWith("gstatic.com")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // App-Shell: cache-first, im Hintergrund aktualisieren (stale-while-revalidate) -
  // so läuft die Seite auch offline sofort, zeigt aber bei vorhandenem Netz immer
  // bald die neueste Version.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(SHELL_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          const network = fetch(req)
            .then((resp) => {
              if (resp && resp.ok) cache.put(req, resp.clone());
              return resp;
            })
            .catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // Kartenkacheln/Schriften/Skripte: cache-first, damit bereits besuchte Kartenausschnitte
  // offline nutzbar sind. Wird laufend befüllt, je mehr man sich die Karte ansieht.
  if (isMapAsset(url)) {
    event.respondWith(
      caches.open(TILE_CACHE).then((cache) =>
        cache.match(req).then(
          (cached) =>
            cached ||
            fetch(req).then((resp) => {
              if (resp && resp.ok) cache.put(req, resp.clone());
              return resp;
            })
        )
      )
    );
  }
});
