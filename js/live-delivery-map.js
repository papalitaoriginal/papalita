/* Customer tracking. The server returns only the customer's active delivery. */
(() => {
  'use strict';
  const base = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/';
  let loading;
  function leaflet() {
    if (window.L?.map) return Promise.resolve(window.L);
    if (loading) return loading;
    const link = Object.assign(document.createElement('link'), {
      rel: 'stylesheet', href: base + 'leaflet.css',
      integrity: 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=', crossOrigin: 'anonymous'
    });
    const script = Object.assign(document.createElement('script'), {
      src: base + 'leaflet.js', integrity: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=',
      crossOrigin: 'anonymous'
    });
    loading = Promise.all([link, script].map(node => new Promise((resolve,reject) => {
      node.onload = resolve;
      node.onerror = () => reject(Error('The map could not load. Reopen it to retry.'));
      document.head.append(node);
    }))).then(() => window.L).catch(error => {
      link.remove(); script.remove(); loading = null; throw error;
    });
    return loading;
  }

  const riderIcon = `<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
    <g stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8 38h18l9-10h12l10 16-10 6H19z" fill="#15a653"/>
      <path d="M27 13c9-5 17 1 16 9l-5 3-4 8 9 7H32l-11-9z" fill="#0c8c47"/>
      <path d="M6 24h16v15H6z" fill="#21b45c"/>
      <circle cx="17" cy="49" r="10" fill="#142b26"/><circle cx="51" cy="49" r="10" fill="#142b26"/>
    </g>
    <g stroke="#173b2a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="17" cy="49" r="9" fill="#182b25"/><circle cx="51" cy="49" r="9" fill="#182b25"/>
      <circle cx="17" cy="49" r="4" fill="#e3e9e6"/><circle cx="51" cy="49" r="4" fill="#e3e9e6"/>
      <path d="M8 39h21l8-9h8l10 10-10 6H27l-9 3z" fill="#16a34a"/>
      <path d="M46 27l5 22m-8-22h5" fill="none"/>
      <rect x="6" y="24" width="17" height="15" rx="3" fill="#30c56b"/><path d="M7 29h15" fill="none"/>
      <path d="M30 23c-4 2-8 8-7 13l12 4 1 7h8l-3-13-7-3 2-6" fill="#149b52"/>
      <path d="M30 36l11 3 1 8h-8l-1-6-8-3z" fill="#243834"/>
      <path d="M32 25l8 4 7-2" fill="none"/>
      <circle cx="35" cy="18" r="8" fill="#18a653"/><path d="M35 17h9l-2 5h-5" fill="#d5f7ee"/>
    </g></svg>`;
  const homeIcon = `<svg viewBox="0 0 34 44" width="34" height="44" aria-hidden="true">
    <path d="M17 42S2 25 2 16a15 15 0 1 1 30 0c0 9-15 26-15 26z" fill="#075839" stroke="#fff" stroke-width="2"/>
    <path d="M8 16l9-8 9 8h-3v8h-5v-5h-2v5h-5v-8z" fill="#fff"/></svg>`;
  const active = new Set(['pending','confirmed','preparing','ready','out_for_delivery']);
  const valid = (lat,lng) => Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const point = (lat,lng) => valid(lat,lng) ? [lat,lng] : null;
  let currentDialog;

  function open(order, db, isCurrent) {
    if (currentDialog?.open) return;
    const previous = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'papa-live-map-dialog';
    dialog.setAttribute('aria-label','Track delivery on map');
    dialog.innerHTML = `<div class="papa-map-stage"><div class="papa-live-map" aria-label="Delivery map"></div>
      <span class="papa-map-crosshair" aria-hidden="true" hidden></span></div>
      <button class="papa-map-back btn s" type="button" autofocus aria-label="Back to order tracking">‹ Track order</button>
      <button class="papa-map-center btn s" type="button" aria-label="Fit rider and drop-off on map" hidden>◎</button>
      <div class="papa-map-sheet">
        <div class="papa-map-brand">Papalita</div>
        <h2>Delivery tracking</h2>
        <p class="papa-map-status" role="status">Loading delivery map…</p>
        <p class="papa-map-guide" hidden>Dashed line points toward the drop-off.</p>
        <div class="papa-map-actions">
          <button class="btn s sm papa-map-pin" type="button" hidden>Set drop-off pin</button>
          <button class="btn s sm papa-map-use-center" type="button" hidden>Use map center</button>
          <button class="btn p sm papa-map-save" type="button" hidden>Save pin</button>
          <button class="btn s sm papa-map-cancel" type="button" hidden>Cancel</button>
        </div>
      </div>`;
    currentDialog = dialog;
    document.body.append(dialog);
    dialog.showModal();
    const select = selector => dialog.querySelector(selector);
    const status = select('.papa-map-status'), heading = select('h2');
    const pin = select('.papa-map-pin'), save = select('.papa-map-save'), cancel = select('.papa-map-cancel');
    const guide = select('.papa-map-guide'), center = select('.papa-map-center');
    const useCenter = select('.papa-map-use-center'), crosshair = select('.papa-map-crosshair');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let L, map, rider, home, line, frame, timer, expiry, resize, busy=false, editing=false, draft, snapshot, fitted=false;
    let errorMessage='', tilesUnavailable=false, loadingMap=true, mapError='';
    const alive = () => dialog.open && isCurrent();
    const destination = () => draft || point(snapshot?.drop_lat,snapshot?.drop_lng);
    const gps = () => document.hidden ? null : point(snapshot?.rider_lat,snapshot?.rider_lng);

    function clearGPS() {
      if(snapshot)snapshot={...snapshot,rider_lat:null,rider_lng:null};
      paint();describe();
    }

    function fit() {
      const points = [destination(),gps()].filter(Boolean);
      if (points.length === 1) map.setView(points[0],16);
      if (points.length === 2) map.fitBounds(points,{paddingTopLeft:[52,82],paddingBottomRight:[64,58],maxZoom:16,animate:!reduced.matches});
    }
    function paint() {
      if (!map) return;
      const target = destination(), position = gps();
      if (target) {
        if (!home) home = L.marker(target,{icon:L.divIcon({html:homeIcon+'<span class="papa-map-pin-label">Drop-off</span>',className:'papa-map-marker',iconSize:[34,44],iconAnchor:[17,43]}),title:'Drop-off'}).addTo(map);
        else home.setLatLng(target);
      } else if (home) { home.remove(); home=null; }

      cancelAnimationFrame(frame);
      if (position) {
        if (!rider) rider = L.marker(position,{icon:L.divIcon({html:riderIcon,className:'papa-map-marker',iconSize:[64,64],iconAnchor:[32,50]}),title:'Assigned rider',zIndexOffset:500}).addTo(map);
        else if (reduced.matches) rider.setLatLng(position);
        else {
          const from = rider.getLatLng(), start = performance.now();
          if (from.lat !== position[0] || from.lng !== position[1]) {
            const move = now => {
              const f = Math.min(1,(now-start)/650);
              rider.setLatLng([from.lat+(position[0]-from.lat)*f,from.lng+(position[1]-from.lng)*f]);
              if (line && target) line.setLatLngs([rider.getLatLng(),target]);
              if (f < 1) frame=requestAnimationFrame(move);
            };
            frame=requestAnimationFrame(move);
          }
        }
      } else if (rider) { rider.remove(); rider=null; }

      if (target && position) {
        const endpoints = [rider.getLatLng(),target];
        if (!line) line = L.polyline(endpoints,{color:'#087f32',weight:4,dashArray:'7 8',interactive:false}).addTo(map);
        else line.setLatLngs(endpoints);
      } else if (line) { line.remove(); line=null; }
      guide.hidden=!(target && position);
      center.hidden=!(target || position);
      if (!fitted && (target || position)) { fit(); fitted=true; }
    }
    function describe() {
      const phase=snapshot?.status;
      const complete=['completed','delivered','refunded'].includes(phase);
      const title=phase ? window.PapalitaOrderStatus?.copy({status:phase,fulfillment:'delivery'})[0] : null;
      heading.textContent=title || 'Delivery tracking';
      const message=mapError || errorMessage || (loadingMap?'Loading delivery map…':editing
        ? (draft?'Check that the pin matches your delivery address.':'Tap your drop-off or move the map and choose its center.')
        : gps()?'Your rider is on the way.'
        : phase==='out_for_delivery'?(snapshot.assigned?'Waiting for a recent rider GPS update.':'Waiting for Papalita to assign a rider.')
        : complete || phase==='cancelled'?'Live location sharing has ended.'
        :'Rider location appears when delivery starts and the rider shares GPS.');
      const copy=message+(tilesUnavailable ? ' Map tiles may be unavailable.' : '');
      if(status.textContent!==copy)status.textContent=copy;
      pin.hidden=!map || editing || !active.has(phase);
      pin.textContent=destination()?'Change drop-off pin':'Set drop-off pin';
      useCenter.hidden=crosshair.hidden=!editing;
      useCenter.disabled=busy;
      save.hidden=!editing; save.disabled=!draft || busy; cancel.hidden=!editing;
    }
    async function sync(write) {
      if (!alive() || busy) return;
      busy=true; describe();
      const started=performance.now();
      try {
        const args={p_order_id:order.id};
        if (write) [args.p_drop_lat,args.p_drop_lng]=write;
        const {data,error}=await db.rpc('papalita_tracking_customer',args);
        if (!alive()) return;
        if(error?.code==='PGRST202')throw Error('Live delivery setup is required. Contact Papalita support.');
        if(error?.code==='42501')throw Error('This delivery map is unavailable for your account.');
        if (error || !data?.status) throw Error(write?'Could not save the drop-off pin. Try again.':'Tracking is unavailable. Retrying…');
        clearTimeout(expiry);
        const lifetime=Math.min(60000,Number(data.fresh_for_ms)||0)-(performance.now()-started);
        snapshot=lifetime>0 ? data : {...data,rider_lat:null,rider_lng:null};
        if(gps())expiry=setTimeout(clearGPS,lifetime);
        errorMessage='';
        if (write || !active.has(data.status)) {editing=false;draft=null;}
      } catch(error) {
        if (!alive()) return;
        if (!write && snapshot) snapshot={...snapshot,rider_lat:null,rider_lng:null};
        errorMessage=error.message;
      } finally {
        busy=false;
        if (alive()) { paint(); describe(); }
      }
    }

    select('.papa-map-back').onclick=()=>dialog.close();
    center.onclick=fit;
    pin.onclick=()=>{editing=true;errorMessage='';describe();useCenter.focus();};
    function choosePoint(coords) {
      if(!editing || busy)return;
      draft=point(coords.lat,coords.lng);
      paint();describe();
    }
    useCenter.onclick=()=>choosePoint(map.getCenter());
    cancel.onclick=()=>{editing=false;draft=null;errorMessage='';paint();describe();};
    save.onclick=()=>{if (draft) void sync(draft);};
    const leave = () => { if (!isCurrent() && dialog.open) dialog.close(); };
    const resume = () => {
      if(document.hidden)clearGPS();
      else if(alive())void sync();
    };
    window.addEventListener('hashchange',leave);
    document.addEventListener('visibilitychange',resume);
    dialog.addEventListener('close',()=>{
      clearInterval(timer); clearTimeout(expiry); cancelAnimationFrame(frame); resize?.disconnect(); map?.remove();
      window.removeEventListener('hashchange',leave);
      document.removeEventListener('visibilitychange',resume);
      dialog.remove(); currentDialog=null;
      if(previous?.isConnected) previous.focus();
    },{once:true});

    void sync();
    timer=setInterval(()=>{
      leave();
      if (!document.hidden) void sync();
    },5000);
    leaflet().then(leafletApi=>{
      if (!alive()) { leave(); return; }
      L=leafletApi;
      map=L.map(select('.papa-live-map'),{zoomControl:false,zoomSnap:.5}).setView([9.4671,125.5744],14);
      resize=new ResizeObserver(()=>map.invalidateSize({pan:false}));
      resize.observe(select('.papa-map-stage'));
      L.control.zoom({position:'topright'}).addTo(map);
      const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
        maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      });
      tiles.on('tileerror',()=>{tilesUnavailable=true;describe();}).on('load',()=>{tilesUnavailable=false;describe();});
      tiles.addTo(map);
      map.on('click',event=>choosePoint(event.latlng));
      loadingMap=false;paint();describe();
    }).catch(error=>{if(alive()){mapError=error.message;describe();}});
  }
  window.PapalitaLiveMap = {open, close:()=>{if(currentDialog?.open)currentDialog.close();}};
})();
