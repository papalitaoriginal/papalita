/* Only public static files are cached. Supabase requests always use the network. */
importScripts('./js/order-status.js?v=20261107-customer-v5');
const CACHE = 'papalita-customer-ui-20261110-auth';
const ASSETS = ['./index.html','./customer-polish.css','./customer-auth.css','./manifest.webmanifest',
 './js/notifications.js','./js/order-status.js','./js/app.js','./js/live-delivery-map.js','./js/config.js','./js/supabase.js','./js/customer-data.js',
 './js/customer-motion.js','./js/customer-install.js','./js/customer-legal.js',
 './images/papalita_mark_color.png','./images/papalita_full_white.png','./images/papalita-auth-food.webp',
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
    typeof data.url === 'string' && /^(?:\.\/)?#\/[a-z0-9/?=&_-]*$/i.test(data.url)
      ? './'+data.url.replace(/^\.\//,'') : './#/orders';
  const routeOrder=safeUrl.match(/^\.\/#\/track\/([0-9a-f-]{36})(?:\?|$)/i)?.[1];
  const notificationOrderId=orderId||routeOrder;
  const title = String(data.title || 'Papalita');
  const body = String(data.body || 'You have an order update.');
  const [heading, message] = notificationOrderId || data.type === 'order'
    ? self.PapalitaOrderStatus.message(title, body, data)
    : [title, body];
  const options = {
    body: message,
    icon: './images/papalita-icon-192-v2.png',
    badge: './images/papalita-icon-192-v2.png',
    // Foreground and background updates share one phone card per actual order.
    tag:notificationOrderId?'papalita-order:'+notificationOrderId:String(data.tag||'papalita-update'),
    renotify:!!notificationOrderId,
    data:{url:safeUrl,order_id:notificationOrderId||null}
  };
  event.waitUntil(self.registration.showNotification(heading, options));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL(event.notification.data?.url || './#/orders', self.registration.scope).href;
    const openClients = await clients.matchAll({type:'window',includeUncontrolled:true});
    const customerRoot = new URL('./', self.registration.scope);
    const customerPage = new URL('./index.html', customerRoot);
    const existing = openClients.find(client => {
      const url = new URL(client.url);
      return url.origin === customerRoot.origin &&
        (url.pathname === customerRoot.pathname || url.pathname === customerPage.pathname);
    });
    if (existing) { await existing.navigate(target); return existing.focus(); }
    return clients.openWindow(target);
  })());
});
