
/* Papalita Notifications */
(() => {
  'use strict';

  const db = () => window.PAPALITA_DB;
  const orderStatus = window.PapalitaOrderStatus;
  const state = { user: null, rows: [], serverRows: [], panel: false, error: '', feedback: null, enabling: false, pushReady: false };

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
    state.user = user; state.rows = []; state.serverRows = []; state.error = ''; state.feedback = null; fallbackRows = [];
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
      body:note.body, url:note.url, fulfillment_type:note.fulfillment_type
    }}));
    document.querySelector('.pn-status-toast')?.remove();
    const toast = document.createElement('div'); toast.className = 'pn-status-toast';
    toast.setAttribute('role','status');
    toast.innerHTML = `${messageAvatar()}<div class="pn-toast-copy"><small>Papalita · Now</small><b>${esc(note.title)}</b><p>${esc(note.body)}</p><a href="${esc(note.url)}">Track order</a></div><button class="pn-icon-button" type="button" aria-label="Dismiss order update">×</button>`;
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
          data:{url:'./'+note.url,order_id:note.order_id,status:note.status,fulfillment_type:note.fulfillment_type}
        });
      }).catch(error => console.warn('[Papalita] Order phone alert:',error.message));
    }
  }
  function recordOrder(row, announce) {
    if (!state.user || !row?.id || row.customer_id !== state.user.id) return;
    const previous = knownOrders.get(row.id);
    const timestamp = Date.parse(row.updated_at || row.created_at) || 0;
    if (previous && timestamp < previous.timestamp) return;
    const fulfillment = orderStatus.mode(row) || previous?.fulfillment || '';
    knownOrders.set(row.id, {status:row.status, fulfillment, timestamp});
    if (!announce || !previous || previous.status === row.status ||
        !['confirmed','preparing','ready','out_for_delivery','completed','cancelled'].includes(row.status)) return;
    const [title,body] = orderStatus.copy({status:row.status, fulfillment});
    const note = {id:`order:${row.id}:${row.status}:${timestamp}`, order_id:row.id,
      status:row.status, fulfillment_type:fulfillment, title, body, type:'order', url:'#/track/'+row.id,
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
      const q=await client.from('orders').select('id,customer_id,status,fulfillment_type,created_at,updated_at')
        .eq('id',orderId).eq('customer_id',user.id).maybeSingle();
      if(q.error)throw q.error;
      const row=q.data;
      if(seq!==requestId||state.user?.id!==user.id||!row||row.id!==orderId||row.customer_id!==user.id)return false;
      const id='order:'+row.id+':placed';if(seenAlerts.has(id))return true;
      recordOrder(row,false);orderBaseline=true;
      const fulfillment = orderStatus.mode(row);
      const note={id,order_id:row.id,status:row.status,fulfillment_type:fulfillment,title:'Order placed',
        body:fulfillment === 'pickup' ? 'The store received your pickup order. We’ll let you know when it’s ready.'
          : row.status === 'pending' ? 'The store received your order. Waiting for confirmation.'
          : 'Your order was saved. Open tracking for the latest status.',
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
    const rows = (state.serverRows || []).map(note => {
      const orderId = String(note.url || '').match(/#\/track\/([a-f0-9-]{36})(?:[?&#]|$)/i)?.[1];
      if (!orderId && note.type !== 'order') return note;
      const [title, body] = orderStatus.message(note.title || '', note.body || '', knownOrders.get(orderId));
      return {...note, order_id: orderId, title, body};
    });
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
        db().from('orders').select('id,customer_id,status,fulfillment_type,updated_at,created_at')
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

  const messageAvatar = () => '<span class="pn-avatar"><img src="images/papalita_mark_color.png" width="26" height="26" alt=""></span>';
  const messageDate = new Intl.DateTimeFormat('en-PH', {timeZone:'Asia/Manila', month:'short', day:'numeric', hour:'numeric', minute:'2-digit'});

  function messageRow(note) {
    const date = new Date(note.created_at);
    const safeUrl = /^#\/[a-z0-9/?=&_-]*$/i.test(note.url || '');
    return `<li class="pn-message">
      ${messageAvatar()}
      <div class="pn-message-content">
        <div class="pn-message-meta"><b>Papalita</b>${Number.isNaN(date.valueOf()) ? '' : `<time datetime="${esc(note.created_at)}">${esc(messageDate.format(date))}</time>`}</div>
        <div class="pn-bubble ${note.read_at ? '' : 'unread'}">
          <strong>${esc(note.title)}</strong>${note.read_at ? '' : '<span class="pn-unread" aria-label="Unread"></span>'}
          <p>${esc(note.body)}</p>
          ${safeUrl || !note.read_at ? `<div class="pn-message-actions">
            ${safeUrl ? `<button type="button" data-pn="open" data-id="${esc(note.id)}">${note.order_id ? 'Track order' : 'Open'} <span aria-hidden="true">→</span></button>` : ''}
            ${note.read_at ? '' : `<button type="button" class="pn-mark" data-pn="read" data-id="${esc(note.id)}">Mark read</button>`}
          </div>` : ''}
        </div>
      </div>
    </li>`;
  }

  function draw() {
    let shade = document.querySelector('#pn-shade');
    if (!state.panel) {
      shade?.remove();
      return;
    }

    const opening = !shade;
    if (opening) {
      shade = document.createElement('div');
      shade.id = 'pn-shade';
      shade.className = 'pn-shade';
      document.body.append(shade);
    }

    const scroll = shade.querySelector('.pn-messages')?.scrollTop || 0;
    const focused = shade.contains(document.activeElement) ? document.activeElement.dataset : null;
    const supported = window.isSecureContext && 'serviceWorker' in navigator &&
      'PushManager' in window && 'Notification' in window;
    const unread = state.rows.filter(note => !note.read_at).length;

    shade.innerHTML = `
      <section class="pn-panel" role="dialog" aria-modal="true" aria-labelledby="pn-heading" tabindex="-1">
        <header class="pn-header">
          ${messageAvatar()}
          <div class="pn-heading"><h2 id="pn-heading">Messages</h2><p>Order updates from Papalita</p></div>
          <button type="button" class="pn-icon-button" data-pn="close" aria-label="Close messages">×</button>
        </header>
        <div class="pn-toolbar">
          <span>${unread ? `${unread} unread` : 'You’re all caught up'}</span>
          <button type="button" class="pn-text-button" data-pn="readall" ${unread ? '' : 'disabled'}>Mark all read</button>
        </div>
        <div class="pn-messages">
          ${state.error ? `<div class="pn-error" role="alert">${esc(state.error)} <button type="button" class="pn-text-button" data-pn="refresh">Try again</button></div>` : ''}
          ${state.rows.length ? `<ul class="pn-thread">${state.rows.map(messageRow).join('')}</ul>`
            : `<div class="pn-empty">${messageAvatar()}<b>${state.user ? 'No messages yet' : 'Sign in to see your messages'}</b><p>${state.user ? 'Updates about your orders will appear here.' : 'Your order updates are linked to your account.'}</p></div>`}
        </div>
        ${state.feedback ? `<p class="pn-feedback${state.feedback.error ? ' is-error' : ''}" role="${state.feedback.error ? 'alert' : 'status'}">${esc(state.feedback.text)}</p>` : ''}
        <footer class="pn-settings">
          <span>${state.pushReady ? 'Phone alerts on' : 'Get updates on your phone'}</span>
          <button type="button" class="pn-text-button" data-pn="enable" ${!state.user || !supported || state.enabling ? 'disabled' : ''}>
            ${state.enabling ? 'Connecting…' : state.pushReady ? 'Reconnect' : 'Enable alerts'}
          </button>
        </footer>
      </section>`;
    shade.querySelector('.pn-messages').scrollTop = scroll;
    const panel = shade.querySelector('.pn-panel');
    if (focused?.pn) {
      const next = [...panel.querySelectorAll('[data-pn]')].find(button =>
        button.dataset.pn === focused.pn && button.dataset.id === focused.id && !button.disabled);
      (next || panel).focus({preventScroll:true});
    } else if (opening) panel.focus();
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

  function report(text, error = false) {
    state.feedback = {text, error};
    if (state.panel) draw();
  }

  async function enable() {
    if (state.enabling) return;
    if (!window.isSecureContext || !('Notification' in window) || !navigator.serviceWorker || !('PushManager' in window)) { report('Open Papalita in Chrome, or use the installed app on iPhone.', true); return; }
    if (!state.user) {
      report('Please sign in first.', true);
      return;
    }

    if (!vapidPublicKey) {
      report('Phone alerts need a notification key.', true);
      return;
    }

    state.enabling=true;state.pushReady=false;state.feedback=null;
    if (state.panel) draw();
    const enablingUserId = state.user.id;
    try {
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();

      if (permission !== 'granted') {
        report('Notifications were not allowed. Enable them in Chrome site settings and try again.', true);
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
        report('Phone alerts are on. Check your Android notification panel.');
      } catch(displayError) {
        console.warn('[Papalita] Phone alert preview:', displayError.message);
        report('Phone registered. Check that Android allows Chrome or Papalita notifications.', true);
      }
    } catch (err) {
      console.error(err);
      report('Could not enable alerts. ' + err.message, true);
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

    if (error) { report('Could not mark messages as read. Try again.', true); return; }
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
