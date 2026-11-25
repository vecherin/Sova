// The owl works offline: everything is cached on install; after that the cache answers first
// and a fresh copy is fetched in the background, so a new version shows on the next launch.
const CACHE='sova-v54-8fc9a928';
const FILES=["./", "index.html", "styles.css", "app.js", "fonts.css", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png", "fonts/caveat-cyrillic-600-normal.woff2", "fonts/caveat-cyrillic-700-normal.woff2", "fonts/caveat-latin-600-normal.woff2", "fonts/caveat-latin-700-normal.woff2", "fonts/lora-cyrillic-600-normal.woff2", "fonts/lora-cyrillic-700-normal.woff2", "fonts/lora-latin-600-normal.woff2", "fonts/lora-latin-700-normal.woff2", "fonts/nunito-cyrillic-400-normal.woff2", "fonts/nunito-cyrillic-600-normal.woff2", "fonts/nunito-cyrillic-700-normal.woff2", "fonts/nunito-cyrillic-800-normal.woff2", "fonts/nunito-latin-400-normal.woff2", "fonts/nunito-latin-600-normal.woff2", "fonts/nunito-latin-700-normal.woff2", "fonts/nunito-latin-800-normal.woff2"];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
  const key=r.mode==='navigate'?'index.html':r;
  e.respondWith(caches.open(CACHE).then(async c=>{
    const hit=await c.match(key,{ignoreSearch:true});
    const net=fetch(r).then(res=>{if(res.ok)c.put(key,res.clone());return res}).catch(()=>hit);
    if(hit){e.waitUntil(net);return hit}
    return net;
  }));
});
