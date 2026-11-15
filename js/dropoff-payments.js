/* In-app notifications for payments at rider drop-off. */
(() => {
  'use strict';

  const storePortal=document.currentScript.dataset.portal==='store';
  const root=document.getElementById('root');
  const money=new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'});
  const localTime=new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'});
  const activityLabels={
    cash_collected:'Cash collected by rider',
    gcash_pending:'GCash awaiting verification',
    gcash_verified:'GCash received by Papalita',
    gcash_cancelled:'GCash request closed'
  };
  let userId, snapshot, lastSeen=0, dialog, busy=false, refreshPromise;

  const isUnseen=row=>(storePortal||row.state==='cash_collected')&&Date.parse(row.updated_at)>lastSeen;

  function updateButton() {
    const unseen=snapshot?.payments.filter(isUnseen).length||0;
    if(storePortal){
      const bell=root.querySelector('#pp-store-notifications');
      const dot=bell?.querySelector('[data-cod-badge]');
      if(dot){
        dot.hidden=!unseen;
        bell.setAttribute('aria-label',unseen?'Notifications · '+unseen+' payment updates':'Notifications');
      }
      return;
    }
    const button=root.querySelector('[data-cod-payments]');
    if(!button)return;
    const count=(snapshot?.pending_count||0)+unseen;
    const label=count?'Payments ('+count+')':'Payments';
    if(button.textContent!==label)button.textContent=label;
  }

  function acknowledgeUpdates() {
    const latest=snapshot.payments.filter(isUnseen).reduce((time,row)=>Math.max(time,Date.parse(row.updated_at)),lastSeen);
    if(latest===lastSeen)return;
    lastSeen=latest;
    try {localStorage.setItem('papalita.cod-payments.seen.'+userId,String(lastSeen));} catch {}
  }

  function paint() {
    if(!dialog?.open||!dialog.isConnected||busy)return;
    const list=dialog.querySelector('[data-cod-payment-list]');
    if(!snapshot)return;
    acknowledgeUpdates();
    const signature=JSON.stringify(snapshot.payments);
    if(list.dataset.signature===signature)return;
    list.dataset.signature=signature;
    list.innerHTML=snapshot.payments.length?snapshot.payments.map(row=>`
      <section class="${storePortal?'pp-notice':'panel'}" style="margin-bottom:10px;${storePortal?'display:block':''}">
        <h3>${esc(activityLabels[row.state])}</h3>
        <p><b>${money.format(row.amount)}</b> · Order #${esc(row.order_id.slice(0,8))}</p>
        <p class="mu sm">${row.rider?esc(row.rider)+' · ':''}${esc(localTime.format(new Date(row.updated_at)))}</p>
        ${!storePortal&&row.state==='gcash_pending'?`<p>Check the receiving GCash account for the transfer.</p>
          ${!row.can_verify?'<p class="err">The order or amount changed. Review the order first.</p>':''}
          <div class="row wrap">
            ${row.can_verify?`<button type="button" class="btn p sm" data-cod-order="${esc(row.order_id)}" data-cod-received="true">Verify GCash received</button>`:''}
            <button type="button" class="btn s sm" data-cod-order="${esc(row.order_id)}" data-cod-received="false">Close GCash request</button>
          </div>`:''}
      </section>`).join(''):'<p>No rider payments recorded yet.</p>';
  }

  function refresh() {
    if(!userId||document.hidden||busy)return Promise.resolve();
    if(refreshPromise)return refreshPromise;
    const activeUser=userId;
    refreshPromise=(async()=>{
      try {
        const dbClient=storePortal?client():getAuthClient();
        const {data,error}=await dbClient.rpc('papalita_dropoff_payments',storePortal?{p_store_id:storeUuid}:{});
        if(userId!==activeUser)return;
        if(error||!Array.isArray(data?.payments))throw error||Error('Payments could not load.');
        const prev=snapshot;
        snapshot=data;
        if(prev&&!(dialog?.open&&dialog.isConnected)){
          const prior=new Set(prev.payments.map(row=>row.order_id+row.state+row.updated_at));
          const incoming=data.payments.filter(row=>(storePortal||['cash_collected','gcash_pending'].includes(row.state))
            &&!prior.has(row.order_id+row.state+row.updated_at));
          if(incoming.length)toast(incoming.length===1
            ?activityLabels[incoming[0].state]+' · Order #'+incoming[0].order_id.slice(0,8)
            :'New rider payment updates');
        }
        paint();
        updateButton();
      } catch {
        const list=dialog?.querySelector('[data-cod-payment-list]');
        if(userId===activeUser&&dialog?.open&&list&&!snapshot){
          list.textContent='Unable to load rider payments. Refresh or check the Rider trip SQL setup.';
        }
      } finally {
        refreshPromise=undefined;
      }
    })();
    return refreshPromise;
  }

  function openPayments() {
    const current=dialog=paDialog('Rider payments',`
      <p class="mu sm">Pending GCash requests and up to 50 recent rider payment updates.</p>
      <button type="button" class="btn s sm" data-cod-refresh>Refresh</button>
      <p data-cod-result role="status"></p>
      <div data-cod-payment-list>Loading rider payments…</div>`);
    paint();
    updateButton();
    void refresh();
    current.addEventListener('click',async event=>{
      if(event.target.closest('[data-cod-refresh]')){await refresh();return;}
      const action=event.target.closest('[data-cod-order]');
      if(!action||busy)return;
      const row=snapshot?.payments.find(payment=>payment.order_id===action.dataset.codOrder);
      if(row?.state!=='gcash_pending')return;
      const received=action.dataset.codReceived==='true';
      const status=current.querySelector('[data-cod-result]');
      const orderLabel='order #'+row.order_id.slice(0,8);
      busy=true;
      try {
        const confirmed=await paConfirm(received?'Verify GCash payment?':'Close GCash request?',
          received?'Confirm that '+money.format(row.amount)+' reached Papalita’s GCash for '+orderLabel+'.'
            :'Confirm no GCash was received for '+orderLabel+'. The rider can choose again.',
          received?'Verify received payment':'Close request');
        if(!confirmed||!current.open||!current.isConnected)return;
        status.textContent='Saving…';
        const {data,error}=await getAuthClient().rpc('papalita_admin_review_gcash',{
          p_order_id:row.order_id,p_received:received,p_requested_at:row.updated_at
        });
        if(error||data!==true)throw error||Error('The review could not be saved.');
        status.textContent=received?'GCash payment verified.':'GCash request closed.';
      } catch(error) {
        status.textContent=error.message||'The review could not be saved.';
      } finally {
        await refreshPromise;
        busy=false;
        await refresh();
      }
    });
  }

  function mountStoreInbox() {
    const bell=root.querySelector('#pp-store-notifications');
    if(bell&&!bell.querySelector('[data-cod-badge]')){
      const dot=document.createElement('span');
      dot.className='pp-notification-dot';
      dot.style.cssText='right:auto;left:4px;';
      dot.dataset.codBadge='';
      dot.setAttribute('aria-hidden','true');
      bell.append(dot);
      updateButton();
      void refresh();
    }
    const modal=root.querySelector('#pp-modal[open]');
    const content=modal?.querySelector('.pp-modal-body');
    if(!content||!modal.querySelector('#pp-order-sound')||content.querySelector('[data-cod-payment-list]'))return;
    const updates=document.createElement('section');
    updates.innerHTML='<h3>Rider payments</h3><p class="pp-muted">Payment updates for this store.</p><div data-cod-payment-list>Loading rider payments…</div>';
    dialog=modal;
    content.prepend(updates);
    paint();
    updateButton();
    void refresh();
  }

  function mount() {
    const nextUser=storePortal?storeUuid:(sess?.role==='platform'?sess.userId:null);
    if(nextUser!==userId){
      userId=nextUser;
      snapshot=undefined;
      lastSeen=0;
      if(userId){
        try {lastSeen=Number(localStorage.getItem('papalita.cod-payments.seen.'+userId))||0;} catch {}
      }
    }
    if(storePortal){
      if(userId)mountStoreInbox();
      return;
    }
    const actions=root.querySelector('.pa-top-actions');
    if(!userId||!actions||actions.querySelector('[data-cod-payments]'))return;
    const button=document.createElement('button');
    button.type='button';
    button.className='btn s sm';
    button.dataset.codPayments='';
    button.addEventListener('click',openPayments);
    actions.prepend(button);
    updateButton();
    void refresh();
  }

  new MutationObserver(mount).observe(root,{childList:true,subtree:storePortal});
  mount();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
  setInterval(refresh,10000);
})();
