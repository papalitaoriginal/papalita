
/* Papalita Notifications */
(() => {
  'use strict';

  const db = () => window.PAPALITA_DB;
  const state = { user: null, rows: [], serverRows: [], panel: false, error: '', enabling: false, pushReady: false };

  // Add your VAPID PUBLIC key after Supabase push setup.
  const vapidPublicKey = (window.FOODIE_CONFIG?.notifications?.vapidPublicKey || 'BIcPxYq1yt-b1NcNV61wT8Ix8KLEAc6pFsmQJZzYYcF8JOnpQS1_dCXW3JzhSdwxKsTgPOBwY8fiCal_oRk9vT8').trim();

  const esc = value => String(value ?? '').replace(
    /[&<>"']/g,
    c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[c]
  );

  const style = document.createElement('style');
  style.textContent = `
    .pn-badge {
      position:absolute;top:-3px;right:-3px;
      background:#dc2626;color:white;
      border-radius:99px;min-width:17px;
      padding:1px 4px;font-size:10px;
      font-weight:800;text-align:center
    }
    .pn-shade {
      position:fixed;inset:0;
      background:#101b1499;z-index:99990;
      display:flex;align-items:flex-end;
      justify-content:center
    }
    .pn-panel {
      width:min(100%,540px);max-height:85dvh;
      overflow:auto;background:white;
      border-radius:22px 22px 0 0;
      padding:22px 18px 32px;color:#15251b
    }
    .pn-row {
      border:1px solid #e4eee7;
      border-radius:14px;padding:13px;
      margin:9px 0;background:white
    }
    .pn-row.unread {
      background:#edf8f0;
      border-color:#c2e8cc
    }
    .pn-actions {
      display:flex;gap:8px;
      flex-wrap:wrap;margin:12px 0
    }
    .pn-btn {
      background:#087f32;color:white;
      border:0;border-radius:11px;
      padding:10px 14px;font-weight:700;
      cursor:pointer
    }
    .pn-btn.alt {
      background:#eef4ef;color:#14502a
    }
    .pn-panel small { color:#64756a }
  `;
  style.textContent += '\n    .pn-status-toast{position:fixed;z-index:100000;left:16px;right:16px;top:calc(12px + env(safe-area-inset-top,0px));max-width:500px;margin:auto;display:flex;align-items:center;gap:12px;background:#153c26;color:#fff;padding:14px 16px;border:1px solid #377149;border-radius:15px;box-shadow:0 12px 35px #12351f25;font:13px/1.5 Inter,system-ui,sans-serif}\n    .pn-status-toast span{flex:1;min-width:0}.pn-status-toast b{display:block}.pn-status-toast small{display:block;color:#dbeddd;font-size:12px;margin-top:3px}.pn-status-toast a{color:#fff;white-space:nowrap;text-decoration:underline;font-size:12px}.pn-status-toast button{background:none;border:0;color:white;min-width:36px;min-height:40px;font-size:24px;cursor:pointer}\n    .pn-error{color:#a23a2d;background:#fff2ed;border:1px solid #f1d9d0;padding:12px;border-radius:10px;font-size:12px;line-height:1.6;margin:14px 0}\n    .pn-btn:disabled{opacity:.5;cursor:not-allowed}.pn-panel .pn-btn{min-height:44px;font-size:12px}.pn-panel h2{font-size:21px}.pn-panel small{font-size:12px;line-height:1.6}\n    .pn-panel:focus{outline:none}\n';
  document.head.append(style);

  // Only real, customer-owned Supabase order transitions create these alerts.
  const statusCopy = {
    confirmed: ['Order confirmed', 'The store has accepted your order.'],
    preparing: ['Preparing your order', 'The store is preparing your food.'],
    ready: ['Your order is ready', 'Your order is ready for pickup or rider handoff.'],
    out_for_delivery: ['Your order is on the way', 'Your order is out for delivery.'],
    completed: ['Order completed', 'Your order has been completed.'],
    cancelled: ['Order cancelled', 'The recorded order status is cancelled.']
  };
  let requestId = 0, refreshPending = false, refreshAgain = false;
  let activeClient = null, authSubscription = null, identityPending = false, identityAgain = false;
  let channel = null, trackedUser = null, orderBaseline = false;
  const knownOrders = new Map(), seenAlerts = new Set();
  let fallbackRows = [], pushSubscription = null, pushChecked = false;
  let triggerFocus = null;
  const ownRows = (rows, id) => rows.filter(row => row.user_id === undefined || row.user_id === id);

  function resetUser(user) {
    ++requestId;
    if (channel && activeClient) void activeClient.removeChannel(channel).catch(() => {});
    channel = null; trackedUser = user?.id || null;
    state.user = user; state.rows = []; state.serverRows = []; state.error = ''; fallbackRows = [];
    document.querySelector('.pn-status-toast')?.remove();
    knownOrders.clear(); seenAlerts.clear(); orderBaseline = false;
    pushChecked=false;pushSubscription=null;state.pushReady=false;
    if (!user) close();
    updateBadges();
  }
  function localAlert(note) {
    if (seenAlerts.has(note.id) || !state.user) return;
    seenAlerts.add(note.id);
    window.dispatchEvent(new CustomEvent('papalita-order-status', {detail:{
      order_id:note.order_id, status:note.status, title:note.title,
      body:note.body, url:note.url
    }}));
    document.querySelector('.pn-status-toast')?.remove();
    const toast = document.createElement('div'); toast.className = 'pn-status-toast';
    toast.setAttribute('role','status');
    toast.innerHTML = `<span><b>${esc(note.title)}</b><small>${esc(note.body)}</small></span><a href="${esc(note.url)}">View order</a><button type="button" aria-label="Dismiss order update">×</button>`;
    toast.querySelector('button').onclick = () => toast.remove();
    document.body.append(toast); setTimeout(() => toast.remove(), 9000);
    // A running customer app can display its own verified order updates even
    // when background Web Push is registered but the server sender is delayed.
    if (window.isSecureContext &&
        'Notification' in window && Notification.permission === 'granted' &&
        navigator.serviceWorker) {
      const recipient = state.user.id;
      void navigator.serviceWorker.getRegistration().then(reg => {
        if (reg && state.user?.id === recipient) return reg.showNotification(note.title, {
          body:note.body,tag:'papalita-order:'+note.order_id,renotify:true,
          icon:'./images/papalita-icon-192-v2.png',badge:'./images/papalita-icon-192-v2.png',
          data:{url:'./'+note.url,order_id:note.order_id,status:note.status}
        });
      }).catch(error => console.warn('[Papalita] Order phone alert:',error.message));
    }
  }
  function recordOrder(row, announce) {
    if (!state.user || !row?.id || row.customer_id !== state.user.id) return;
    const previous = knownOrders.get(row.id);
    const timestamp = Date.parse(row.updated_at || row.created_at) || 0;
    if (previous && timestamp < previous.timestamp) return;
    knownOrders.set(row.id, {status:row.status,timestamp});
    if (!announce || !previous || previous.status === row.status || !statusCopy[row.status]) return;
    const [title,body] = statusCopy[row.status];
    const note = {id:`order:${row.id}:${row.status}:${timestamp}`, order_id:row.id,
      status:row.status, title, body, type:'order', url:'#/track/'+row.id,
      read_at:null, created_at:new Date(timestamp || Date.now()).toISOString(), local:true};
    fallbackRows = [note,...fallbackRows].slice(0,80);
    localAlert(note);
  }
  async function orderPlaced(orderId) {
    // Called only after the checkout RPC confirms its actual order IDs.
    // Read the saved row under the current customer's RLS before announcing it.
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(orderId||'')))return false;
    const client=db();if(!client)return false;
    try{
      const auth=await client.auth.getUser();if(auth.error)throw auth.error;
      const user=auth.data?.user;if(!user)return false;
      if(state.user?.id!==user.id){resetUser(user);subscribe(user.id);}
      const seq=requestId;
      const q=await client.from('orders').select('id,customer_id,status,created_at,updated_at')
        .eq('id',orderId).eq('customer_id',user.id).maybeSingle();
      if(q.error)throw q.error;
      const row=q.data;
      if(seq!==requestId||state.user?.id!==user.id||!row||row.id!==orderId||row.customer_id!==user.id)return false;
      const id='order:'+row.id+':placed';if(seenAlerts.has(id))return true;
      recordOrder(row,false);orderBaseline=true;
      const note={id,order_id:row.id,status:row.status,title:'Order placed',
        body:row.status==='pending'?'Your Papalita order was received. Waiting for the store to confirm.':'Your Papalita order was saved. Open it to see the latest status.',
        type:'order',url:'#/track/'+row.id,read_at:null,created_at:row.created_at,local:true};
      fallbackRows=[note,...fallbackRows].slice(0,80);localAlert(note);combineRows();
      if(state.panel)draw();return true;
    }catch(error){console.warn('[Papalita] Saved-order alert:',error.message);return false;}
  }
  function subscribe(userId) {
    if (channel || typeof db()?.channel !== 'function') return;
    channel = db().channel('papalita-customer-alerts-'+userId)
      .on('postgres_changes', {event:'*',schema:'public',table:'customer_notifications',filter:'user_id=eq.'+userId}, () => {
        if (state.user?.id === userId) void refresh();
      })
      .on('postgres_changes', {event:'UPDATE',schema:'public',table:'orders',filter:'customer_id=eq.'+userId}, payload => {
        if (state.user?.id !== userId) return;
        recordOrder(payload.new,orderBaseline); combineRows();
        if (state.panel) draw();
      }).subscribe();
  }
  function combineRows(serverRows) {
    if (serverRows) state.serverRows = serverRows;
    const rows = state.serverRows || [];
    // If the server has a matching record, its durable notification wins.
    const fallback = fallbackRows.filter(note => !rows.some(n => n.url === note.url && n.title === note.title));
    state.rows = [...rows,...fallback].sort((a,b) => Date.parse(b.created_at)-Date.parse(a.created_at)).slice(0,100);
    updateBadges();
  }
  async function inspectSubscription(){
    const id=state.user?.id;if(!id)return;
    if(!navigator.serviceWorker){pushChecked=true;return;}
    try{const reg=await navigator.serviceWorker.getRegistration();const sub=await reg?.pushManager?.getSubscription();
      let registered=false;if(sub){const q=await db().from('push_subscriptions').select('endpoint').eq('user_id',id).eq('endpoint',sub.endpoint||sub.toJSON().endpoint).maybeSingle();registered=!q.error&&!!q.data;}
      if(state.user?.id===id){pushSubscription=registered?sub:null;pushChecked=true;state.pushReady=registered;}
    }catch{if(state.user?.id===id){pushChecked=false;state.pushReady=false;}}
  }
  async function refresh() {
    if (refreshPending) { refreshAgain = true; return; }
    if (!state.user || !db()) { updateBadges(); return; }
    refreshPending = true;
    const userId = state.user.id, seq = requestId;
    try {
      const results = await Promise.allSettled([
        db().from('customer_notifications').select('id,user_id,title,body,type,url,read_at,created_at')
          .eq('user_id',userId).order('created_at',{ascending:false}).limit(80),
        db().from('orders').select('id,customer_id,status,updated_at,created_at')
          .eq('customer_id',userId).order('created_at',{ascending:false}).limit(100)
      ]);
      if (seq !== requestId || state.user?.id !== userId) return;
      const errors = [];
      const notes = results[0].status === 'fulfilled' ? results[0].value : {error:results[0].reason};
      if (notes.error) errors.push('Notification history: '+notes.error.message);
      else state.serverRows = ownRows(notes.data || [],userId);
      const orders = results[1].status === 'fulfilled' ? results[1].value : {error:results[1].reason};
      if (orders.error) errors.push('Order updates: '+orders.error.message);
      else { for (const row of orders.data || []) recordOrder(row,orderBaseline); orderBaseline = true; }
      state.error = errors.join(' · '); combineRows();
      if (state.panel) draw();
    } finally {
      refreshPending = false;
      if (refreshAgain) { refreshAgain = false; setTimeout(() => void refresh(),0); }
    }
  }
  async function syncIdentity() {
    if (identityPending) { identityAgain = true; return; }
    if (!db()) return;
    identityPending = true; const seq = requestId;
    try {
      const result = await db().auth.getUser();
      if (seq !== requestId) return;
      const user = result.error ? null : result.data?.user || null;
      if (user?.id !== trackedUser) { resetUser(user); state.serverRows = []; }
      else state.user = user;
      if (user) { subscribe(user.id); await inspectSubscription(); await refresh(); }
    } catch (error) { state.error = error.message; if (state.panel) draw(); }
    finally { identityPending = false; if(identityAgain){identityAgain=false;setTimeout(()=>void syncIdentity(),0);} }
  }
  function attachAuth() {
    const client = db(); if (!client || activeClient === client) return;
    authSubscription?.unsubscribe(); activeClient = client;
    const listener = client.auth.onAuthStateChange((event,session) => {
      if (event === 'SIGNED_OUT' || !session?.user) { resetUser(null); state.serverRows = []; return; }
      // Do not await Supabase calls from inside its auth callback.
      setTimeout(() => void syncIdentity(),0);
    });
    authSubscription = listener?.data?.subscription;
    void syncIdentity();
  }

  function updateBadges() {
    const count = state.rows.filter(n => !n.read_at).length;

    document.querySelectorAll('a[href="#/notifications"], [data-notifications-open], [data-a="go"][data-id="/notifications"]')
      .forEach(el => {
        el.style.position = 'relative';
        el.querySelector('[data-un]')?.setAttribute('hidden','');

        let badge = el.querySelector('.pn-badge');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'pn-badge';
          el.append(badge);
        }

        badge.hidden = !count;
        badge.textContent = count > 99 ? '99+' : count;
      });
  }

  function draw() {
    let shade = document.querySelector('#pn-shade');

    if (!state.panel) {
      shade?.remove();
      return;
    }

    const opening = !shade;
    if (!shade) {
      shade = document.createElement('div');
      shade.id = 'pn-shade';
      shade.className = 'pn-shade';
      document.body.append(shade);
    }

    const supported =
      window.isSecureContext && 'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;

    shade.innerHTML = `
      <div class="pn-panel" role="dialog"
           aria-modal="true" aria-label="Papalita notifications">
        <div style="display:flex;align-items:center;
                    justify-content:space-between">
          <h2 style="margin:0">🔔 Notifications</h2>
          <button class="pn-btn alt" data-pn="close">
            Close ✕
          </button>
        </div>

        <div class="pn-actions">
          <button class="pn-btn" data-pn="enable"
            ${!state.user || !supported || state.enabling ? 'disabled' : ''}>
            ${state.enabling ? 'Enabling…' : state.pushReady ? 'Reconnect phone notifications' : 'Enable phone notifications'}
          </button>
          <button class="pn-btn alt" data-pn="readall"
            ${!state.user ? 'disabled' : ''}>
            Mark all read
          </button>
        </div>

        <small>
          ${!state.user
            ? 'Sign in to sync notifications across devices.'
            : !supported
              ? 'Phone notifications need HTTPS and a supported browser. On iPhone, open the installed home-screen app.'
              : Notification.permission === 'granted'
                ? state.pushReady ? 'This browser’s subscription is registered with Papalita.' : 'Permission allowed. Tap Enable to register this phone.'
                : 'Tap Enable to request permission.'}
        </small>

        ${state.error ? `<p class="pn-error" role="alert">${esc(state.error)}</p><button class="pn-btn alt" data-pn="refresh">Try again</button>` : ''}
        ${state.rows.length
          ? state.rows.map(n => `
            <div class="pn-row ${n.read_at ? '' : 'unread'}">
              <strong>${esc(n.title)}</strong>
              <p style="margin:6px 0">${esc(n.body)}</p>
              <small>${new Date(n.created_at)
                .toLocaleString('en-PH',{timeZone:'Asia/Manila'})}</small>
              <div class="pn-actions">
                ${!n.read_at ? `
                  <button class="pn-btn alt"
                    data-pn="read" data-id="${esc(n.id)}">
                    Mark read
                  </button>` : ''}
                ${n.url ? `
                  <button class="pn-btn"
                    data-pn="open" data-id="${esc(n.id)}">
                    View
                  </button>` : ''}
              </div>
            </div>
          `).join('')
          : '<p style="padding:20px 0">No new notifications yet.</p>'}
      </div>
    `;
    const panel=shade.querySelector('.pn-panel'); panel.tabIndex=-1;
    if(opening)panel.focus();
  }

  function close() {
    state.panel = false;
    draw();
    if (triggerFocus?.isConnected) triggerFocus.focus();
  }

  function decodeKey(key) {
    key = String(key || '').trim();
    const padding = '='.repeat((4 - key.length % 4) % 4);
    const raw = atob(
      (key + padding).replace(/-/g, '+').replace(/_/g, '/')
    );
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }

  async function saveOwnedSubscription(client,userId,subscription) {
    const verified=await client.auth.getUser();
    if(verified.error)throw verified.error;
    if(verified.data?.user?.id!==userId||state.user?.id!==userId)throw Error('Your account changed. Sign in and try again.');
    const raw=subscription.toJSON();
    if(!raw.endpoint||!raw.keys?.p256dh||!raw.keys?.auth)throw Error('The browser returned an incomplete phone subscription.');
    const own=await client.from('push_subscriptions').select('endpoint').eq('user_id',userId).eq('endpoint',raw.endpoint).maybeSingle();
    if(own.error)throw own.error;
    const keys={p256dh:raw.keys.p256dh,auth:raw.keys.auth,user_agent:navigator.userAgent};
    const write=own.data
      ? await client.from('push_subscriptions').update(keys).eq('user_id',userId).eq('endpoint',raw.endpoint).select('endpoint').maybeSingle()
      : await client.from('push_subscriptions').insert({user_id:userId,endpoint:raw.endpoint,...keys}).select('endpoint').single();
    if(write.error)throw write.error;
    if(!write.data?.endpoint)throw Error('The database did not confirm the phone subscription.');
    return subscription;
  }
  async function registerPhone(client,userId,registration) {
    const options={userVisibleOnly:true,applicationServerKey:decodeKey(vapidPublicKey)};
    const previous=await registration.pushManager.getSubscription();
    let subscription=previous||await registration.pushManager.subscribe(options);
    try { return await saveOwnedSubscription(client,userId,subscription); }
    catch(error) {
      // A shared browser may still hold a subscription saved by another login.
      // Never overwrite that other account's row or bypass its RLS policy.
      const conflict=error?.code==='23505'||error?.code==='42501'||/row.level security|duplicate key/i.test(error?.message||'');
      if(!previous||!conflict)throw error;
      if(state.user?.id!==userId)throw Error('Your account changed. Please try again.');
      const removed=await subscription.unsubscribe();
      if(!removed)throw Error('Could not reset the old phone subscription. Restart Papalita and try again.');
      subscription=await registration.pushManager.subscribe(options);
      try { return await saveOwnedSubscription(client,userId,subscription); }
      catch(second) {
        const blocked=second?.code==='42501'||/row.level security/i.test(second?.message||'');
        if(blocked)throw Error('Supabase still blocked this account’s phone subscription. Apply the supplied push-subscription SQL policy fix, then tap Enable again.');
        throw second;
      }
    }
  }

  async function enable() {
    if (state.enabling) return;
    if (!window.isSecureContext || !('Notification' in window) || !navigator.serviceWorker || !('PushManager' in window)) { alert('Open Papalita through HTTPS in Chrome, or use the installed app on iPhone.'); return; }
    if (!state.user) {
      alert('Please sign in first.');
      return;
    }

    if (!vapidPublicKey) {
      alert('Push notifications need the VAPID public key configured.');
      return;
    }

    state.enabling=true;state.pushReady=false;
    const enablingUserId = state.user.id;
    try {
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();

      if (permission !== 'granted') {
        alert('Notifications were not allowed. Enable Papalita notifications in your browser’s site settings, then try again.');
        return;
      }

      let timeout;
      const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('The app is not ready for push. Reload Papalita and try again.')),10000);})]).finally(()=>clearTimeout(timeout));
      if (state.user?.id !== enablingUserId) throw Error('Your account changed. Sign in and enable notifications again.');
      const sub=await registerPhone(db(),enablingUserId,reg);
      if(state.user?.id!==enablingUserId)throw Error('Your account changed. Please try again.');
      pushSubscription = sub; pushChecked = true; state.pushReady = true;
      try {
        await reg.showNotification('Papalita notifications enabled', {
          body:'This phone is registered for Papalita notifications.',
          tag:'papalita-phone-registered',icon:'./images/papalita-icon-192-v2.png',
          data:{url:'./#/notifications'}
        });
        alert('Phone notifications enabled. Check your phone notification panel.');
      } catch(displayError) {
        alert('Phone registered, but Android could not display the notification. Check Chrome/Papalita notification settings: '+displayError.message);
      }
    } catch (err) {
      console.error(err);
      alert('Could not enable notifications: ' + err.message);
    } finally { state.enabling = false; if (state.panel) draw(); }
  }

  async function mark(ids) {
    if (!state.user || !ids.length) return;

    const localIds = ids.filter(id=>String(id).startsWith('order:'));
    fallbackRows.forEach(n=>{if(localIds.includes(n.id))n.read_at=new Date().toISOString();});
    ids = ids.filter(id=>!String(id).startsWith('order:'));
    if(!ids.length){combineRows();if(state.panel)draw();return;}
    const { error } = await db()
      .from('customer_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id',state.user.id).in('id', ids);

    if (error) alert(error.message);
    await refresh();
  }

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-pn]');

    if (button) {
      event.preventDefault();
      const action = button.dataset.pn;

      if (action === 'close') close();
      if (action === 'refresh') await refresh();
      if (action === 'enable') await enable();
      if (action === 'read') await mark([button.dataset.id]);

      if (action === 'readall') {
        await mark(
          state.rows.filter(n => !n.read_at).map(n => n.id)
        );
      }

      if (action === 'open') {
        const n = state.rows.find(
          x => x.id === button.dataset.id
        );

        if (n) {
          await mark([n.id]);
          close();

          if (/^#\/[a-z0-9/?=&_-]*$/i.test(n.url || '')) {
            location.hash = n.url;
          }
        }
      }
      return;
    }

    if (event.target.id === 'pn-shade') close();

    const link = event.target.closest(
      'a[href="#/notifications"], [data-notifications-open], [data-a="go"][data-id="/notifications"]'
    );

    if (link) {
      event.preventDefault();
      event.stopPropagation();
      triggerFocus = link; state.panel = true; draw();
      if (!state.user) await syncIdentity(); else await refresh();
      draw();
    }
  }, true);

  window.addEventListener('hashchange', () => {
    if (location.hash === '#/notifications') {
      state.panel = true;
      refresh().then(draw).catch(error=>{state.error=error.message;draw();});
    }
  });

  window.addEventListener('focus', () => { attachAuth(); void syncIdentity(); updateBadges(); });
  window.addEventListener('papalita-session-ready', () => { attachAuth(); void syncIdentity(); updateBadges(); });
  window.addEventListener('papalita-ui-rendered',updateBadges);
  window.addEventListener('online', () => void refresh());

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });

  setInterval(() => { attachAuth(); if (!document.hidden && state.user) void refresh(); },15000);

  function start() {
    attachAuth();
    if (location.hash === '#/notifications') {
      state.panel = true;
      draw();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.PAPALITA_NOTIFICATIONS = {
    refresh,
    orderPlaced,
    disconnectPhone:async()=>{
      try{const reg=await navigator.serviceWorker?.getRegistration();const sub=await reg?.pushManager?.getSubscription();if(sub)await sub.unsubscribe();}
      catch(error){console.warn('[Papalita] Phone sign-out:',error.message);}
      pushSubscription=null;state.pushReady=false;pushChecked=false;
    },
    open: () => {
      triggerFocus = document.activeElement; state.panel = true; draw();
      refresh().then(draw).catch(error=>{state.error=error.message;draw();});
    }
  };
  document.addEventListener('keydown', event => {
    if(!state.panel)return;
    if(event.key==='Escape'){event.preventDefault();close();return;}
    if(event.key==='Tab'){
      const controls=[...document.querySelectorAll('#pn-shade button:not(:disabled),#pn-shade a[href]')];
      const first=controls[0],last=controls[controls.length-1];if(!first)return;
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
})();
