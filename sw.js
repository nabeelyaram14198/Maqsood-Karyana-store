const CACHE = "maqsood-karyana-v21";
const IMAGE_ASSETS = ["aata","chawal","cheeni","daal-chana","daal-masoor","daal-moong","daal-mash","daal-arhar","besan","suji","maida","namak","laal-mirch","kali-mirch","haldi","dhania-powder","zeera","garam-masala","cooking-oil","ghee","chai-patti","doodh","dahi","anday","bread","biscuit","pyaaz","aloo","tamatar","lehsan","adrak","lemon","chicken","beef","fish","soap"].map((name) => `./item-images/${name}.jpg`);
const ASSETS = ["./", "./index.html", "./styles.css", "./app.js", "./mode.js", "./config.js", "./manifest.webmanifest", "./app-icon-192.png", "./app-icon-512.png", "./grocery-quick-items-v12.jpg", "./grocery-core-items-v12.png", "./grocery-household-items-v13.png", ...IMAGE_ASSETS];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || (event.request.mode === "navigate" ? caches.match("./index.html") : Response.error()))));
});
