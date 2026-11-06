/* Only public static files are cached. Supabase requests always use the network. */
const CACHE = 'papalita-customer-ui-20261106-v1';
const ASSETS = ['./index.html','./customer-polish.css','./manifest.webmanifest',
 './js/app.js','./js/config.js','./js/supabase.js','./js/images.js','./js/data.js',
 './js/customer-motion.js','./js/customer-install.js','./js/customer-legal.js',
 './images/papalita_mark_color.png','./images/papalita_full_white.png',
 './images/papalita-icon-192-v2.png','./images/papalita-icon-512-v2.png'];
const ALLOWED = new Set(ASSETS.map(p => new URL(p,self.registration.scope).pathname));
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 await Promise.allSettled(ASSETS.map(async path=>{const res=await fetch(path,{cache:'reload'});if(res.ok)await cache.put(new URL(path,self.registration.scope).href,res);}));
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();
 await Promise.all(keys.filter(k=>k!==CACHE&&(k.startsWith('papalita-customer-ui-')||k.startsWith('papalita-static-'))).map(k=>caches.delete(k)));
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url),scope=new URL(self.registration.scope);
 if(req.method!=='GET'||url.origin!==scope.origin)return;
 const entry=req.mode==='navigate'&&(url.pathname===scope.pathname||url.pathname===new URL('./index.html',scope).pathname);
 if(!entry&&!ALLOWED.has(url.pathname))return;
 const key=new URL(entry?'./index.html':url.pathname,scope).href;
 event.respondWith((async()=>{
  try{const res=await fetch(req,{cache:'no-store'});if(res.ok){const cache=await caches.open(CACHE);await cache.put(key,res.clone());}return res;}
  catch{ return await caches.match(key)||Response.error(); }
 })());
});
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch(e) { data = {body:event.data?.text() || ''}; }
  const orderId = typeof data.order_id === 'string' && /^[0-9a-f-]{36}$/i.test(data.order_id)
    ? data.order_id : null;
  const safeUrl = orderId ? './#/track/' + orderId :
    typeof data.url === 'string' && /^\.\/#\/(orders|notifications|track\/[0-9a-f-]{36})$/i.test(data.url)
      ? data.url : './#/orders';
  const options = {
    body: String(data.body || 'You have an order update.'),
    icon: './images/papalita-icon-192-v2.png',
    badge: './images/papalita-icon-192-v2.png',
    tag: String(data.tag || orderId || 'papalita-update'),
    data: {url: safeUrl}
  };
  event.waitUntil(self.registration.showNotification(String(data.title || 'Papalita'), options));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL(event.notification.data?.url || './#/orders', self.registration.scope).href;
    const openClients = await clients.matchAll({type:'window',includeUncontrolled:true});
    const existing = openClients.find(c => c.url.startsWith(self.registration.scope));
    if (existing) { await existing.navigate(target); return existing.focus(); }
    return clients.openWindow(target);
  })());
});
