/* Papalita customer app: live Supabase data and explicit unavailable states. */
(async () => {
'use strict';
const C=window.FOODIE_CONFIG,RS=window.RESTAURANTS,CATS=window.CATEGORIES;
const APP_VERSION = '1.0';
const orderStatus = window.PapalitaOrderStatus;
let catalogueError='',commercialError='';
const deliveryFees=new Map();
let promoRequest=null;
function refreshPromotions(){
  if(promoRequest)return promoRequest;
  promoRequest=(async()=>{
    try{
      const {data,error}=await window.PAPALITA_DB.from('papalita_promo_codes')
        .select('code,title,type,value,cap,min_order,expires_at,status')
        .eq('status','active').gte('expires_at',new Date().toISOString());
      if(error)throw error;
      const now=Date.now();
      window.PROMOS=(data||[]).filter(p=>p.status==='active'&&['flat','percent','ship'].includes(p.type)&&Date.parse(p.expires_at)>now)
        .map(p=>({code:p.code,title:p.title,desc:'',type:p.type,value:Number(p.value),cap:p.cap==null?null:Number(p.cap),min:Number(p.min_order),exp:p.expires_at.slice(0,10),expires_at:p.expires_at,active:true}));
      return true;
    }catch{
      window.PROMOS=[];
      return false;
    }
  })().finally(()=>{promoRequest=null;});
  return promoRequest;
}
async function refreshCommercialData(){
  const client=window.PAPALITA_DB;deliveryFees.clear();
  if(!client){window.PROMOS=[];commercialError='Supabase is not configured.';return;}
  const [fees,promos]=await Promise.allSettled([
    client.from('papalita_delivery_fees').select('barangay,fee,extra_minutes,distance_km'),
    refreshPromotions()
  ]);
  const errors=[];
  if(fees.status==='fulfilled'&&!fees.value.error){for(const f of fees.value.data||[])if(f.fee!=null&&Number.isFinite(Number(f.fee))&&Number(f.fee)>=0)deliveryFees.set(f.barangay,Number(f.fee));}
  else errors.push('Delivery charges could not load.');
  if(promos.status!=='fulfilled'||!promos.value)errors.push('Promotions could not load.');
  commercialError=errors.join(' ');
}
try{
  if(typeof window.loadPapalitaProducts!=='function')throw Error('Supabase catalogue is not configured.');
  const [stores]=await Promise.all([window.loadPapalitaProducts(),refreshCommercialData()]);
  if(!Array.isArray(stores))throw Error('The catalogue could not be read.');
  RS.splice(0,RS.length,...stores.map(s=>{
    const items=(s.items||[]).filter(p=>Number.isFinite(Number(p.price))&&Number(p.price)>0).map(p=>({id:String(p.id),name:p.name,price:Number(p.price),cat:p.cat||'Other',img:p.img||'',desc:p.desc||'',sec:p.cat||'Menu',available:p.available===true,opts:Array.isArray(p.opts)?p.opts:[]}));
    const business=String(s.business_type||'Food business');
    return{id:String(s.id),name:s.name,kind:business.replace(/_/g,' '),description:s.description||'',items,
      cat:items[0]?.cat||'Other',cover:s.cover||s.logo_url||'',logo_url:s.logo_url||'',addr:s.address||'',phone:s.phone||'',messenger:'',
      hours:[s.open_time||'',s.close_time||''],verifiedHours:!!(s.open_time&&s.close_time),open_state:s.is_open,closed:s.is_open===false,
      closureReason:s.closure_reason||'',pauseUntil:s.orders_paused_until||null,pauseReason:s.orders_pause_reason||'',
      rating:null,reviews:'',reviewsList:[],min:0,
      catering:/^(restaurant|carinderia|bulaloan|specialty[_\s-]*restaurant)$/i.test(business)&&s.catering_enabled===true,
      stay:false,feature:null,promo:null};
  }));
}catch(error){RS.splice(0);catalogueError='Stores could not load. Check your connection and refresh.';console.error('[Papalita] Catalogue:',error.message);}
const categoryIds=[...new Set(RS.flatMap(r=>r.items).map(i=>String(i.cat)))];
CATS.splice(0,CATS.length,...categoryIds.map(id=>({id,name:id.replace(/[_-]/g,' ').replace(/\b\w/g,c=>c.toUpperCase()),img:''})));

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const peso = n => '₱' + (Number(n) || 0).toLocaleString('en-PH', {minimumFractionDigits:2, maximumFractionDigits:2});
const delay = ms => new Promise(r => setTimeout(r, ms));
const uid = p => p + Math.random().toString(36).slice(2, 8);
const ICONS = {
 home:'<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
 orders:'<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
 send:'<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>', pin:'<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
 usercircle:'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="9" r="3"/><path d="M5.8 19a6.8 6.8 0 0 1 12.4 0"/>',
 user:'<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', search:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
 x:'<path d="M18 6 6 18M6 6l12 12"/>', heart:'<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
 star:'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>', clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
 plus:'<path d="M5 12h14M12 5v14"/>', minus:'<path d="M5 12h14"/>', cart:'<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
 bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>', chev:'<path d="m9 18 6-6-6-6"/>', back:'<path d="m15 18-6-6 6-6"/>',
 fork:'<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>', bike:'<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
 ticket:'<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 17v2M13 11v2"/>',
 grid:'<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
 sliders:'<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M2 14h4M10 8h4M18 16h4"/>', check:'<path d="M20 6 9 17l-5-5"/>',
 phone:'<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
 flame:'<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
 trash:'<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>', logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
 card:'<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/>', map:'<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"/>', list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
 help:'<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/>', edit:'<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
 percent:'<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>', arrow:'<path d="M5 12h14M12 5l7 7-7 7"/>', copy:'<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
 nav:'<path d="m3 11 19-9-9 19-2-8z"/>', store:'<path d="M3 9l1-5h16l1 5M4 9v11h16V9M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/>', shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>', box:'<path d="m21 8-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8"/>'
};
ICONS.chat='<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>';ICONS.eye='<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>';ICONS.eyeoff='<path d="M17.9 17.9A10.7 10.7 0 0 1 12 19c-6.4 0-10-7-10-7a18 18 0 0 1 5.1-5.9M9.9 5.2A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a18 18 0 0 1-2.2 3.2M1 1l22 22M9.9 9.9a3 3 0 0 0 4.2 4.2"/>';ICONS.chevd='<path d="m6 9 6 6 6-6"/>';ICONS.share='<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>';
const ic = (n, s = 20, c = '') => `<svg class="i ${c}" width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const photo = (key, alt, o = {}) => { const u = window.photoUrl(key, o.w || 600), u2 = window.photoUrl(key, (o.w || 600) * 2);
  return `<span class="ph ${o.cls || ''}" style="${o.ar ? '--ar:' + o.ar : ''}">${ic('fork', 48)}${u ? `<img src="${esc(u)}"${u2 !== u ? ` srcset="${esc(u)} 1x, ${esc(u2)} 2x"` : ''} alt="${esc(alt)}" loading="${o.eager ? 'eager' : 'lazy'}" decoding="async">` : ''}${o.closedLabel ? `<span class="pp-store-photo-status" aria-hidden="true">${esc(o.closedLabel)}</span>` : ''}</span>`; };
document.addEventListener('error', e => { const t = e.target; if (t.tagName === 'IMG' && t.closest('.ph')) t.closest('.ph').classList.add('failed'); }, true);

/* ---------- store ---------- */
const KEY = 'foodie.alegria.v1';
const R = id => RS.find(r => String(r.id) === String(id));
const ITEM = id => { for (const r of RS) { const i = r.items.find(i => i.id === id); if (i) return { item: i, rest: r }; } return null; };
const ALL = () => RS.flatMap(r => r.items.map(i => ({ item: i, rest: r })));
const brg = () => window.BRGYS.find(b => b.n === (S.loc || {}).brgy) || window.BRGYS[0];
const feeOf = (barangay = S.loc.brgy) => deliveryFees.get(barangay) ?? null;
const iso = d => new Date(d).toISOString();
function seed(){return {v:1,user:{id:null,name:'',email:'',phone:'',photo:'',in:false},users:{},recent:[],cart:{rid:null,lines:[]},fav:{items:[],rests:[]},promo:null,orders:[],cater:[],notes:[],addrs:[],pay:[],loc:{label:C.location?.label||'Poblacion, Alegria',brgy:'Poblacion',perm:'unknown'}};}
let S; try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) {} if (!S || S.v !== 1) S = seed();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
// Migrate only authenticated, server-confirmed orders from the previous cache.
const realId=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||''));
S.orders=(S.orders||[]).filter(o=>realId(o.id)&&realId(o.uid)&&(o.source==='supabase'||o.demo===false)).map(o=>{const copy={...o,source:'supabase',pay:{...o.pay}};delete copy.demo;delete copy.pay.demo;return copy;});
S.cater=(S.cater||[]).filter(q=>realId(q.id)&&realId(q.uid));
S.notes=[];S.users=S.users||{};S.cart=S.cart||{rid:null,lines:[]};S.promo=null;S.pay=[];
const unread=()=>S.notes.filter(n=>!n.read&&n.uid===S.user.id).length;
const cartCount = () => S.cart.lines.reduce((a, l) => a + l.qty, 0);
// Backward-compatible migration: old carts had one rid for all lines.
S.cart.lines.forEach(l => { if (!l.rid) l.rid = S.cart.rid || (ITEM(l.itemId) || {}).rest?.id; });
S.cart.lines=S.cart.lines.filter(l=>ITEM(l.itemId)&&R(l.rid));
const cartGroups = (cart = S.cart) => { const groups = new Map(); for (const line of cart.lines) { const rid = String(line.rid || cart.rid || ''); if (!groups.has(rid)) groups.set(rid, []); groups.get(rid).push(line); } return [...groups].map(([rid, lines]) => ({ rid, rest: R(rid), lines, sub: lines.reduce((sum, l) => sum + l.unit * l.qty, 0) })); };

const notify = (type, t, b, who) => { S.notes.unshift({ id: uid('n'), type, t, b, at: Date.now(), read: false, uid: who || S.user.id }); save(); };

/* ---------- domain ---------- */
const nowMin = () => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()); return +p[0].value % 24 * 60 + +p[2].value; };
const toMin = s => { const [h, m] = s.split(':'); return +h * 60 + +m; };
const fmtT = s => { let [h, m] = s.split(':').map(Number); h %= 24; return ((h + 11) % 12 + 1) + (m ? ':' + String(m).padStart(2, '0') : ':00') + (h < 12 ? ' AM' : ' PM'); };
const isStorePaused = r => Date.parse(r.pauseUntil) > Date.now();
const isOpen=r=>{if(r.closed||r.open_state===false||isStorePaused(r))return false;if(!r.verifiedHours)return r.open_state===true;const o=toMin(r.hours[0]),c=toMin(r.hours[1]),n=nowMin();return c<o?n>=o||n<c:n>=o&&n<c;};
const storeClosureReason = r => String(isStorePaused(r) ? r.pauseReason : r.open_state===false ? r.closureReason : '').trim();
function storeAvailabilityLabel(r) {
  if (isOpen(r)) return 'Open';
  const reason = storeClosureReason(r);
  if (/^emergency(?: clos(?:e|ure))?$/i.test(reason)) return 'Emergency closure';
  if (/^power (?:interruption|outage)$/i.test(reason)) return 'Power interruption';
  return 'Not open';
}

function watchStoreAvailability(repaint) {
  const route = location.hash;
  const key = () => JSON.stringify(RS.map(r=>[r.id,storeAvailabilityLabel(r),storeClosureReason(r),...r.hours]));
  let displayed = key(), busy = false;
  const refresh = async () => {
    if (!window.loadPapalitaStoreAvailability || busy || location.hash !== route || sheetEl) return;
    busy = true;
    try {
      const {data,error} = await window.loadPapalitaStoreAvailability();
      if (error || !Array.isArray(data) || location.hash !== route || sheetEl) return;
      for (const row of data) {
        const store = R(String(row.id));
        if (store) Object.assign(store,{
          hours:[row.open_time||'',row.close_time||''],
          verifiedHours:!!(row.open_time&&row.close_time),open_state:row.is_open,closed:row.is_open===false,
          closureReason:row.closure_reason||'',pauseUntil:row.orders_paused_until||null,pauseReason:row.orders_pause_reason||''
        });
      }
      const current = key();
      if (current !== displayed) { displayed = current; repaint(); }
    } catch (error) {
      console.warn('[Papalita] Store availability:',error.message);
    } finally { busy = false; }
  };
  refresh();
  timers.push(setInterval(refresh,15000));
}
const hoursText = r => r.hours[0] === '00:00' && r.hours[1] === '24:00' ? 'Open 24 hours' : `${fmtT(r.hours[0])} – ${fmtT(r.hours[1])}`;

const defSel = item => { const s = {}; (item.opts||[]).forEach(g => { if (g.req && g.ch?.length) s[g.id] = [g.ch[0].n]; }); return s; };
const unitPrice = (item, sel) => Number(item.price) + (item.opts||[]).reduce((a, g) => a + (sel[g.id] || []).reduce((b, n) => b + Number((g.ch.find(c => c.n === n) || {}).p || 0), 0), 0);
const selText = l => Object.values(l.sel || {}).flat().join(', ');
const activeVouchers = (now = Date.now()) => window.PROMOS.filter(p => p.active !== false && Date.parse(p.expires_at) > now)
  .sort((a,b) => Date.parse(a.expires_at) - Date.parse(b.expires_at) || a.code.localeCompare(b.code));
const promoMatchesStore = (promo, rid) => !promo?.rid || String(promo.rid) === String(rid);
const validPromo = p => { if (p.active === false) return 'This code is no longer active.'; if(p.expires_at&&Date.parse(p.expires_at)<=Date.now()) return 'This code has expired.'; return ''; };
function calc(cart = S.cart, code = S.promo, barangay = onCheckout() ? addressBarangay(checkoutAddress()) : S.loc.brgy) {
  const groups = cartGroups(cart);
  const sub = groups.reduce((n, g) => n + g.sub, 0);
  const pickup = CK.fulfillment === 'pickup';
  const quoted = !pickup && onCheckout() && deliveryConfig?.enabled;
  const quote = quoted ? activeDeliveryQuote() : null;
  const storeFees = new Map(groups.map(g => [
    g.rid, pickup ? 0 : quoted
      ? (quote?.byStore.has(g.rid) ? quote.byStore.get(g.rid).details.total_centavos/100 : null)
      : onCheckout() && !deliveryConfig ? null : feeOf(barangay)
  ]));
  const feeKnown = groups.every(g => storeFees.get(g.rid) !== null);
  const fee = groups.reduce((sum,g) => sum + (storeFees.get(g.rid) ?? 0),0);
  const p = code && window.PROMOS.find(x => x.code === code);
  // Store-specific codes apply only to the matching store, never another store.
  const eligible = groups.filter(g => promoMatchesStore(p, g.rid));
  const eligibleSub = eligible.reduce((n, g) => n + g.sub, 0);
  const eligibleFee = eligible.filter(g => g.rest).reduce((sum,g) => sum + (storeFees.get(g.rid) ?? 0),0);
  let promoShortfall = 0;
  let perr = code && !p ? 'This promotion is no longer available.' : '';
  if (p) {
    perr = eligible.length ? validPromo(p) : 'This voucher is not valid for the stores in your cart.';
    if (!perr && p.type === 'ship') {
      if (pickup) perr = 'This voucher is for delivery orders only.';
      else if (!feeKnown) perr = 'Delivery charges are unavailable for this barangay.';
      else if (eligibleFee === 0) perr = 'There is no delivery fee to discount.';
    }
    if (!perr) {
      promoShortfall = Math.max(0, Math.round(p.min * 100) - Math.round(eligibleSub * 100)) / 100;
      if (promoShortfall) perr = `Add ${peso(promoShortfall)} more to use ${p.code}.`;
    }
  }
  let disc = 0;
  if (p && !perr) disc = p.type === 'flat' ? Math.min(p.value, eligibleSub) : p.type === 'percent' ? Math.min(Math.round(eligibleSub * p.value / 100), p.cap ?? Infinity, eligibleSub) : eligibleFee;
  const total = Math.max(0, sub + fee - disc);
  return { r: groups[0]?.rest, groups, sub, fee, feeKnown, storeFees, disc, perr, promo: p, promoShortfall, eligibleSub, total,
    minOk: pickup || groups.every(g => g.rest && g.sub >= (g.rest.min || 0)), pickup };
}

function addToCart(item, rest, sel, qty, note, replaceKey, fx) {
  if (!item.available) return toast('Sold out right now.');
  if (!isOpen(rest)) return toast(`${rest.name} is not accepting orders right now.`);
  const unit = unitPrice(item, sel), k = JSON.stringify([rest.id, item.id, sel, note]);
  if (replaceKey) S.cart.lines = S.cart.lines.filter(l => l.key !== replaceKey);
  const ex = S.cart.lines.find(l => JSON.stringify([l.rid || S.cart.rid, l.itemId, l.sel, l.note]) === k);
  if (ex) ex.qty += qty;
  else S.cart.lines.push({ key: uid('l'), rid: rest.id, itemId: item.id, name: item.name, img: item.img, qty, unit, sel, note });
  S.cart.rid = S.cart.lines[0]?.rid || null;
  save();
  try { navigator.vibrate && navigator.vibrate(15); } catch (e) {}
  if (fx) { holdCart = true; updateChrome(false); flyTo(fx); } else updateChrome(true);
  toast(replaceKey ? 'Cart updated.' : `${item.name} added to cart.`, 'View cart', () => nav('/cart'));
}

const stageOf=o=>o.status==='cancelled'?-1:({pending:0,confirmed:1,preparing:2,ready:3,out_for_delivery:4,completed:5})[o.status]??-1;
const isCurrent=o=>stageOf(o)>=0&&stageOf(o)<5;
const canCancelOrder=o=>['pending','confirmed','preparing'].includes(o?.status);
/* ---------- services ---------- */
const PAYNAME = { gcash: 'GCash', maya: 'Maya', cod: 'Cash on Delivery', card: 'Credit / debit card' };

/* ---------- UI primitives ---------- */
function toast(msg, act, fn) { const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.innerHTML = `<span>${esc(msg)}</span>${act ? `<button>${esc(act)}</button>` : ''}`; if (act) el.querySelector('button').onclick = () => { fn(); el.remove(); };
  $('#toasts').append(el); setTimeout(() => el.remove(), 3800); }
let sheetEl = null, lastFocus = null;
function openSheet(html, o = {}) { closeSheet(); lastFocus = document.activeElement; sheetEl = document.createElement('div'); sheetEl.className = 'ov'; sheetEl.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(o.label || 'Dialog')}"><div class="sheet-in">${o.noX ? '' : `<button class="ib w x" data-a="close" aria-label="Close">${ic('x')}</button>`}${html}</div></div>`;
  sheetEl.addEventListener('mousedown', e => { if (e.target === sheetEl) closeSheet(); }); document.body.append(sheetEl); document.body.style.overflow = 'hidden';
  const f = sheetEl.querySelector('[autofocus],input,button:not(.x)'); f && f.focus(); return sheetEl; }
function closeSheet() { if (!sheetEl) return; sheetEl.remove(); sheetEl = null; document.body.style.overflow = ''; lastFocus && lastFocus.focus && lastFocus.focus(); }
function confirmDlg(msg, okLabel = 'Confirm', danger) { return new Promise(res => { const el = openSheet(`<div class="pd" style="padding-top:34px"><h3 style="font-size:19px">${esc(msg)}</h3><div class="row" style="margin-top:20px"><button class="btn o grow" data-r="0">Cancel</button><button class="btn ${danger ? 'd' : 'p'} grow" data-r="1">${esc(okLabel)}</button></div></div>`, { noX: true, label: 'Confirm' });
  el.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) { const v = b.dataset.r === '1'; closeSheet(); res(v); } }); }); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); if (e.key === 'Tab' && sheetEl) { const f = $$('button,input,select,textarea,a[href]', sheetEl).filter(x => !x.disabled); if (!f.length) return; const a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } } });
const pageHead = (t, back = true, right = '') => `<div class="pg-h">${back ? `<button class="ib" data-a="back" aria-label="Go back">${ic('back')}</button>` : ''}<h1 class="grow">${esc(t)}</h1>${right}</div>`;
const emptyState = (icn, t, b, btn, a) => `<div class="empty"><div class="big">${ic(icn, 38)}</div><h3>${esc(t)}</h3><p>${esc(b)}</p>${btn ? `<button class="btn p" data-a="${a}">${esc(btn)}</button>` : ''}</div>`;
const stars = (r, rv) => r == null || !Number.isFinite(Number(r)) ? '' : `<span class="rt">${ic('star', 15, 'star')}${r}${rv ? ` <span class="mu" style="font-weight:500">(${rv})</span>` : ''}</span>`;
const initial = () => esc((S.user.name || 'U').trim()[0].toUpperCase());
const avatar = () => `<span class="avatar">${S.user.photo ? `<img src="${esc(S.user.photo)}" alt="">` : initial()}</span>`;
const hrt = (kind, id) => { const on = S.fav[kind].includes(id); return `<button class="ib w hrt" data-a="fav" data-k="${kind}" data-id="${id}" aria-pressed="${on}" aria-label="${on ? 'Remove from' : 'Add to'} favorites">${ic('heart', 20, on ? 'on' : '')}</button>`; };
function dishCard({item:i,rest:r}) {
  const available = i.available && isOpen(r);
  return `<article class="card" data-reveal tabindex="0" role="link" data-a="item" data-id="${esc(i.id)}" aria-label="${esc(i.name)} from ${esc(r.name)}">
    ${hrt('items',i.id)}${photo(i.img, `${i.name} from ${r.name}`)}<div class="bd"><div class="nm"><span>${esc(i.name)}</span></div><div class="meta">${esc(r.name)}</div>
    <div class="ft"><span class="pr">${peso(i.price)}</span><button class="add" data-a="quick" data-id="${esc(i.id)}" ${available?'':'disabled'} aria-label="Add ${esc(i.name)} to cart">${ic('plus',19)}</button></div>${available?'':`<span class="pp-stock">${!i.available?'Sold out':'Store closed'}</span>`}</div></article>`;
}
function restCard(r) {
  const op = isOpen(r);
  const status = storeAvailabilityLabel(r);
  const fee = feeOf();
  const delivery = fee === null || deliveryConfig?.enabled !== false ? 'Check delivery fee at checkout' : `${peso(fee)} delivery to ${S.loc.brgy}`;
  return `<article class="card big" data-reveal tabindex="0" role="link" data-a="rest" data-id="${esc(r.id)}" aria-label="${esc(r.name)}, ${esc(status)}">
    ${hrt('rests',r.id)}${op?'<span class="pp-store-state">Open</span>':''}
    ${photo(r.cover, `${r.name} store photo`, {closedLabel:op?'':status})}
    <div class="bd"><h3>${esc(r.name)}</h3><div class="meta2">${esc(r.kind)}</div>
      ${op?`<p class="pp-store-delivery">${ic('bike',15)}<span>${esc(delivery)}</span></p>`:''}
    </div></article>`;
}
function groupStores(stores) {
  const open = [], unavailable = [];
  for (const store of stores) (isOpen(store) ? open : unavailable).push(store);
  return {open,unavailable};
}
const storeGrid = stores => `<div class="grid restaurant-results-grid">${stores.map(restCard).join('')}</div>`;

/* ---------- router ---------- */
let timers = [], first = true;
const nav = p => { if (location.hash === '#' + p) render(); else location.hash = p; };
const ROUTES = [[/^\/?$/, 'home'], [/^\/discover$/, 'discover'], [/^\/restaurant\/(.+)$/, 'restaurant'], [/^\/cart$/, 'cartView'], [/^\/checkout$/, 'cartView'], [/^\/confirmation\/(.+)$/, 'confirmation'], [/^\/track\/(.+)$/, 'track'],
  [/^\/orders$/, 'ordersView'], [/^\/order\/(.+)$/, 'orderDetail'], [/^\/nearby$/, 'nearby'], [/^\/promos$/, 'promos'], [/^\/profile$/, 'profile'], [/^\/profile\/edit$/, 'editProfile'], [/^\/addresses$/, 'addresses'],
  [/^\/payments$/, 'payments'], [/^\/favorites$/, 'favorites'], [/^\/notifications$/, 'notifications'], [/^\/support$/, 'support'], [/^\/categories$/, 'categories'], [/^\/catering$/, 'catering'], [/^\/catering\/request$/, 'cateringForm'], [/^\/catering\/sent\/(.+)$/, 'cateringSent']];
const V = {};
function render() {
  timers.forEach(clearInterval); timers = []; closeSheet();
  if(!S.user.in || AU.view==='reset') window.PapalitaLiveMap?.close();
  const [path, qs] = (location.hash.slice(1) || '/').split('?'), params = new URLSearchParams(qs || '');
  const main = $('#view');
  if (!S.user.in || AU.view==='reset') { document.body.classList.add('authing'); main.innerHTML = authLayout(); window.PapalitaMotion?.refresh(main); afterAuth(); window.scrollTo(0, 0); updateChrome(); return; }
  document.body.classList.remove('authing');
  let m, fn; for (const [re, f] of ROUTES) if ((m = path.match(re))) { fn = f; break; }
  if (!fn) { fn = 'notFound'; m = []; }
  const run = () => { try { const out = V[fn](m[1] ? decodeURIComponent(m[1]) : null, params); main.innerHTML = out.html; out.after && out.after(); window.PapalitaMotion?.refresh(main); main.focus({ preventScroll: true }); window.scrollTo(0, out.keep ? scrollY : 0); }
    catch (e) { console.error(e); main.innerHTML = `<div class="view">${emptyState('help', 'Something went wrong', 'We could not load this screen. Please try again.', 'Try again', 'reload')}</div>`; } updateChrome(); };
  first = false; run();
}
V.notFound = () => ({ html: `<div class="view">${emptyState('map', 'Page not found', 'That screen does not exist.', 'Go home', 'home')}</div>` });
const NAVS = [['home', 'Home', '/'], ['search', 'Search', '/discover'], ['cart', 'Cart', '/cart'], ['orders', 'Orders', '/orders'], ['usercircle', 'Profile', '/profile']];
const DNAV = [['Home', '/'], ['Browse', '/discover'], ['Catering', '/catering'], ['Orders', '/orders'], ['Nearby', '/nearby'], ['Favorites', '/favorites']];
const curPath = () => (location.hash.slice(1) || '/').split('?')[0];
const activeNav = () => { const p=curPath(); return p==='/cart'||p==='/checkout'?'/cart':/^\/(discover|restaurant|categories)/.test(p)?'/discover':/^\/(orders|order\/|track|confirmation)/.test(p)?'/orders':/^\/(profile|addresses|payments|notifications|support|promos|favorites)/.test(p)?'/profile':'/'; };
const deskNav = () => { const p = curPath(); return p === '/' ? '/' : /^\/catering/.test(p) ? '/catering' : /^\/(discover|restaurant|categories)/.test(p) ? '/discover' : /^\/(orders|order\/|track|confirmation)/.test(p) ? '/orders' : /^\/nearby/.test(p) ? '/nearby' : /^\/favorites/.test(p) ? '/favorites' : ''; };
function chrome() {
  $('#chrome').innerHTML = `<header class="topbar"><a class="logo" href="#/" aria-label="Papalita home"><i><img src="images/papalita_mark_color.png" alt="" style="width:34px;height:34px;object-fit:contain"></i>Papalita</a>
  <nav aria-label="Main">${DNAV.map(([l, p]) => `<a href="#${p}" data-d="${p}">${l}</a>`).join('')}</nav>
  <button class="locpill" data-a="loc" style="margin:0">${ic('pin', 15)}<span data-loc></span>${ic('chevd', 14)}</button>
  <a class="ib" href="#/notifications" aria-label="Notifications">${ic('bell')}<span class="badge" data-un hidden></span></a>
  <a class="ib pp-desktop-cart" href="#/cart" aria-label="Cart">${ic('cart')}<span class="badge" data-cc hidden></span></a><a href="#/profile" aria-label="Profile">${avatar()}</a></header>
  <a class="pp-cart-summary" href="#/cart" hidden>${ic('cart',20)}<span class="pp-cart-summary-copy"><b data-cart-summary-count></b><small data-cart-summary-subtotal></small></span><span class="pp-cart-summary-cta">View cart ${ic('chev',16)}</span></a>
  <nav class="bnav" aria-label="Main" style="grid-template-columns:repeat(${NAVS.length},minmax(0,1fr))">${NAVS.map(([i, l, p]) => `<a href="#${p}" data-p="${p}">${i === 'cart' ? `<span class="icw">${ic(i, 26)}<span class="badge" data-cc hidden></span></span>` : ic(i, 26)}<span>${l}</span></a>`).join('')}</nav>`;
}
const defAddr = () => S.addrs.find(a => a.def) || S.addrs[0];
const checkoutAddress = () => S.addrs.find(a => a.id === CK.addr) || defAddr();
const addressBarangay = a => a?.city?.split(',')[0].trim() || S.loc.brgy;
let holdCart = false;
function updateChrome(bump) {
  setTimeout(()=>window.dispatchEvent(new Event('papalita-ui-rendered')),0);
  const count = cartCount();
  const a = activeNav(), d = deskNav(); $$('[data-p]').forEach(el => { const on = el.dataset.p === a; el.classList.toggle('on', on); on ? el.setAttribute('aria-current', 'page') : el.removeAttribute('aria-current'); });
  $$('[data-d]').forEach(el => el.classList.toggle('on', el.dataset.d === d));
  if (!holdCart) $$('[data-cc]').forEach(el => { el.hidden = !count; el.textContent = count; if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } });
  $$('[data-un]').forEach(el => { const n = unread(); el.hidden = !n; el.textContent = n; });
  $$('[data-loc]').forEach(el => el.textContent = S.loc.label);
  const bar = $('.pp-cart-summary');
  bar.hidden = !S.user.in || AU.view === 'reset' || !count || !/^\/(?:$|(?:discover|categories|favorites|promos)$|restaurant\/)/.test(curPath());
  if (!bar.hidden) {
    $('[data-cart-summary-count]', bar).textContent = `${count} ${count === 1 ? 'item' : 'items'}`;
    $('[data-cart-summary-subtotal]', bar).textContent = `${peso(calc().sub)} subtotal`;
  }
  const progress = $('[data-voucher-progress]');
  if (progress) {
    const promo = activeVouchers().find(p => p.code === progress.dataset.voucherProgress);
    if (promo) progress.textContent = voucherProgress(promo);
  }
}

/* ---------- home ---------- */

let HC = 'all';

/* Home: swipeable stores and category-filtered popular food */
let PD = 'all';

const fillCurated = () => {
  const target = $('#cur');
  if (!target) return;
  const stores = RS.filter(r => HC === 'all' || r.cat === HC || (r.items || []).some(i => i.cat === HC));
  const {open,unavailable} = groupStores(stores);
  target.innerHTML = stores.length ? [...open,...unavailable].map(restCard).join('')
    : emptyState('search', 'No stores yet', 'Check back later or try another category.');
  $$('[data-a=hcat]').forEach(b => {
    b.classList.toggle('on', b.dataset.id === HC);
    b.setAttribute('aria-pressed', String(b.dataset.id === HC));
  });
  window.PapalitaMotion?.refresh($('#view'));
};

const popularDishes = () => ALL()
  .filter(({item,rest}) => isOpen(rest) && (PD === 'all' || item.cat === PD))
  .slice(0, 8);

const fillPopular = () => {
  const target = $('#popular-dishes');
  if (!target) return;
  const dishes = popularDishes();
  target.innerHTML = dishes.length ? dishes.map(dishCard).join('')
    : emptyState('search', 'No dishes yet', 'Try another food category.');
  $$('[data-a=pcat]').forEach(b => {
    b.classList.toggle('on', b.dataset.id === PD);
    b.setAttribute('aria-pressed', String(b.dataset.id === PD));
  });
  window.PapalitaMotion?.refresh($('#view'));
};

const foodVisual = () => {
  const seen = new Set();
  const rounds = [];
  for (const rest of RS) {
    let round = 0;
    for (const item of rest.items) {
      if (!item.available) continue;
      const url = window.photoUrl(item.img);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      (rounds[round++] ??= []).push({item, rest});
    }
  }
  const choices = rounds.flat();
  if (!choices.length) return `<div class="pp-hero-logo"><img src="images/papalita_mark_color.png" alt="Papalita"></div>`;
  return `<div class="pp-food-slides" data-food-slideshow aria-label="Food from the Papalita menu">${choices.map(({item,rest},i)=>`<div class="pp-food-slide ${i===0?'pp-slide-active':''}" data-food-slide aria-hidden="${i!==0}" ${i?'inert':''}>${photo(item.img,`${item.name} from ${rest.name}`,{eager:i===0,w:780})}<div class="pp-food-caption"><b>${esc(item.name)}</b><small>${esc(rest.name)}</small></div></div>`).join('')}${choices.length>1?`<div class="pp-food-controls" aria-label="Food photos">${choices.map(({item},i)=>`<button type="button" data-slide-index="${i}" aria-label="Show ${esc(item.name)}" aria-pressed="${i===0}"></button>`).join('')}</div>`:''}</div>`;
};
const voucherMoney = n => Number.isInteger(n) ? '₱' + n.toLocaleString('en-PH') : peso(n);
const voucherTitle = promo => promo.type==='ship'?'Free delivery':promo.type==='percent'?`${promo.value}% off your order`:`${voucherMoney(promo.value)} off your order`;
function voucherProgress(promo) {
  if (!S.cart.lines.length) return 'Add items to check voucher eligibility.';
  const quote = calc(S.cart, promo.code);
  if (quote.promoShortfall) return `Add ${voucherMoney(quote.promoShortfall)} to unlock ${voucherTitle(promo).toLowerCase()}.`;
  return quote.perr || (S.promo === promo.code ? 'Applied to your cart' : 'Ready to use');
}
function voucherTerms(promo){
  const terms=[promo.min>0?`Min. order ${voucherMoney(promo.min)}`:'No minimum order'];
  if(promo.type==='percent'&&promo.cap!==null)terms.push(`Up to ${voucherMoney(promo.cap)} off`);
  return terms.join(' · ');
}
function watchHomeVoucher(){
  const slot=$('#pp-home-voucher');
  if(!slot)return;
  const slide=$('[data-voucher-slide]',slot), controls=$('[data-voucher-controls]',slot);
  let shown='', key='', nextAt=Date.now()+7000, rotating=true;
  function update(step=0){
    const now=Date.now(), promos=activeVouchers(now);
    slot.hidden=!promos.length;
    if(!promos.length){
      if(key)slide.innerHTML='';
      shown='';key='';
      return;
    }
    const current=promos.findIndex(p=>p.code===shown);
    const index=current<0?0:(current+step+promos.length)%promos.length;
    const promo=promos[index];
    if(promo.code!==shown)nextAt=now+7000;
    shown=promo.code;
    const title=voucherTitle(promo), details=voucherTerms(promo);
    const nextKey=JSON.stringify([shown,title,details]);
    if(key!==nextKey){
      slide.innerHTML=`<div class="pp-voucher-slide">
      <div class="pp-voucher-top"><span class="pp-voucher-label">Limited-time offer</span><span class="pp-voucher-timer">${ic('clock',15)} Ends in <span data-voucher-clock></span></span></div>
      <h2>${esc(title)}</h2><p>${esc(details)}</p>
      <div class="pp-voucher-code"><code>${esc(promo.code)}</code><button type="button" class="btn p" data-a="copy" data-id="${esc(promo.code)}" aria-label="Copy code ${esc(promo.code)}">Copy code</button></div>
      <p class="pp-voucher-progress" data-voucher-progress="${esc(promo.code)}"></p>
      </div>`;
      key=nextKey;
    }
    controls.hidden=promos.length<2;
    $('[data-voucher-position]',controls).textContent=`${index+1} / ${promos.length}`;
    const seconds=Math.ceil((Date.parse(promo.expires_at)-now)/1000);
    $('[data-voucher-clock]',slide).textContent=[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
    const progress = $('[data-voucher-progress]', slide), message = voucherProgress(promo);
    if (progress.textContent !== message) progress.textContent = message;
  }
  slot.addEventListener('click',event=>{
    const arrow=event.target.closest('[data-voucher-step]');
    if(!arrow)return;
    rotating=false;
    update(Number(arrow.dataset.voucherStep));
  });
  const refresh=async()=>{
    if(document.hidden)return;
    await refreshPromotions();
    if(slot.isConnected)update();
  };
  update();
  void refresh();
  timers.push(setInterval(()=>{
    if(document.hidden)return;
    const advance=rotating&&Date.now()>=nextAt&&!window.PapalitaMotion?.stopped()
      &&!slot.contains(document.activeElement)&&!slot.matches(':hover');
    if(advance)nextAt=Date.now()+7000;
    update(advance?1:0);
  },1000),setInterval(refresh,60000));
}
const customerFooter = () => `<footer class="pp-customer-footer"><span>Papalita · Good Food, Good Mood.</span><nav aria-label="Footer"><button type="button" data-a="about-papalita">About</button><a href="#/support">Contact</a><button type="button" data-papalita-legal>Terms & Privacy</button></nav></footer>`;
V.home = () => {
  const act = myOrders().find(isCurrent);
  return {html:`<section class="view pp-customer-home">
    <header class="pp-home-header"><a href="#/" class="pp-mini-brand" aria-label="Papalita home"><img src="images/papalita_mark_color.png" alt="">Papalita</a><button class="loc" data-a="loc" aria-label="Change delivery location"><span class="lab">Deliver to</span><span class="locv">${esc(S.loc.label)}${ic('chevd',14)}</span></button><a class="pp-home-bell pp-home-cart" href="#/notifications" aria-label="Notifications">${ic('bell',21)}</a></header>
    ${window.PapalitaInstall?.canOffer() ? `<aside class="pp-install-strip" aria-label="Install Papalita">
      <img src="images/papalita-icon-192-v2.png" width="40" height="40" alt="">
      <span class="grow"><b>Papalita on your phone</b><small>Open straight from your home screen.</small></span>
      <button type="button" class="btn p" data-a="install">Install</button>
      <button type="button" class="pp-install-close" data-a="noinstall" aria-label="Dismiss install banner">${ic('x',17)}</button>
    </aside>` : ''}
    ${catalogueError?`<div class="pp-catalog-error" role="alert">${esc(catalogueError)} <button class="link gl" data-a="retry-catalogue">Refresh</button></div>`:''}
    <div class="pp-hero"><div class="pp-hero-copy"><span class="pp-kicker">Made for your everyday</span><h1>Your local favorites,<br><em>delivered.</em></h1><p>Find your next coffee, comfort meal, or something worth sharing in Alegria.</p><button class="btn p" data-a="qa" data-id="rests">Explore stores ${ic('arrow',17)}</button></div><div class="pp-hero-visual">${foodVisual()}</div></div>
    <div id="pp-home-voucher" hidden><section class="pp-home-voucher pp-paper-ticket" aria-label="Limited-time vouchers">
      <div data-voucher-slide></div>
      <div class="pp-voucher-controls" data-voucher-controls hidden><button type="button" data-voucher-step="-1" aria-label="Previous voucher">${ic('back',17)}</button><span data-voucher-position></span><button type="button" data-voucher-step="1" aria-label="Next voucher">${ic('chev',17)}</button></div>
    </section></div>
    <div class="search pp-home-search" id="hs"><div class="sbox">${ic('search',21)}<input id="q" type="search" placeholder="Search food or stores" aria-label="Search food or stores" aria-controls="sg" autocomplete="off"><button class="ib" data-a="clearq" aria-label="Clear search" hidden>${ic('x',18)}</button><button class="ib" data-a="filters" aria-label="Search filters">${ic('sliders',19)}</button></div><div id="sg"></div></div>
    ${CATS.length?`<div class="pp-categories" role="group" aria-label="Menu categories"><button class="chipc on" data-a="hcat" data-id="all" aria-pressed="true">${ic('grid',16)}All food</button>${CATS.map(c=>`<button class="chipc" data-a="hcat" data-id="${esc(c.id)}" aria-pressed="false">${esc(c.name)}</button>`).join('')}</div>`:''}
    ${act?`<a class="mint row" href="#/track/${esc(act.id)}" style="margin-top:18px">${ic(orderStatus.mode(act)==='pickup'?'store':'orders',24)}<span class="grow"><b>Your order</b><br><span class="sm mu">${esc(R(act.rid)?.name || 'Store')} · ${esc(orderStatus.copy(act)[0])}</span></span>${ic('chev',18)}</a>`:''}
    <div class="sec"><div class="sec-h"><h2>Stores near you</h2><button class="link gl" data-a="qa" data-id="rests">See all ${ic('arrow',16)}</button></div><div class="store-swipe" id="cur" aria-label="Stores near you"></div></div>
    <div class="sec"><div class="sec-h"><h2>On the menu</h2><button class="link gl" data-a="qa" data-id="order">See all ${ic('arrow',16)}</button></div><div class="chips popular-chips" role="group" aria-label="Filter menu"><button class="chip on" data-a="pcat" data-id="all" aria-pressed="true">All food</button>${CATS.map(c=>`<button class="chip" data-a="pcat" data-id="${esc(c.id)}" aria-pressed="false">${esc(c.name)}</button>`).join('')}</div><div class="popular-grid" id="popular-dishes"></div></div>
    ${RS.some(r=>r.catering)?`<a class="mint row home-promo-card" href="#/catering">${ic('box',24)}<span class="grow"><b>Bring everyone to the table.</b><br><span class="sm mu">Ask participating stores about catering.</span></span>${ic('arrow',19)}</a>`:''}
    ${customerFooter()}</section>`,after:()=>{fillCurated();fillPopular();watchHomeVoucher();watchStoreAvailability(()=>{fillCurated();fillPopular();});}};
};
function authLayout() {
  return `<div class="pp-auth-layout">
    <aside class="pp-auth-pitch" aria-label="About Papalita">
      <img class="pp-auth-photo" src="images/papalita-auth-food.webp" alt="" fetchpriority="high">
      <div class="pp-auth-story">
        <span class="pp-auth-kicker">Alegria, Surigao del Norte</span>
        <h2>Good food.<br><em>Good mood.</em></h2>
        <p>From your morning coffee to dinner with the family, find your favorites close to home.</p>
      </div>
    </aside>
    <div class="pp-auth-form">${authScreen()}</div>
  </div>`;
}

function suggestions(q) {
  q = q.trim().toLowerCase(); if (!q) return ''; const has = s => s.toLowerCase().includes(q), out = [];
  CATS.filter(c => has(c.name)).slice(0, 2).forEach(c => out.push(`<button data-a="sugg" data-t="cat" data-id="${c.id}">${photo(c.img, '', { w: 100 })}<span><b>${esc(c.name)}</b><br><span class="sm mu">Cuisine</span></span></button>`));
  const stores = groupStores(RS.filter(r => has(r.name) || has(r.kind)));
  [...stores.open,...stores.unavailable].slice(0, 3).forEach(r => out.push(`<button data-a="sugg" data-t="rest" data-id="${r.id}">${photo(r.cover, '', { w: 100 })}<span><b>${esc(r.name)}</b><br><span class="sm mu">${esc(storeAvailabilityLabel(r))} · ${esc(r.kind)}</span></span></button>`));
  ALL().filter(x => isOpen(x.rest) && (has(x.item.name) || has(x.item.desc))).slice(0, 4).forEach(x => out.push(`<button data-a="sugg" data-t="item" data-id="${x.item.id}">${photo(x.item.img, '', { w: 100 })}<span><b>${esc(x.item.name)}</b><br><span class="sm mu">${esc(x.rest.name)} · ${peso(x.item.price)}</span></span></button>`));
  return `<div class="sugg" role="listbox">${out.join('') || `<p class="mu" style="padding:14px">No matches for “${esc(q)}”. Try “burger”, “ramen” or “milk tea”.</p>`}<button data-a="sugg" data-t="q" data-id="${esc(q)}">${ic('search', 18)}<span>Search all for “<b>${esc(q)}</b>”</span></button></div>`;
}

/* ---------- discover ---------- */
let F = { tab: 'dishes', q: '', cat: 'all', price: 0, rating: 0, eta: 0, promo: false, sort: 'popular', open: false };
V.discover = (_, p) => { if (p.get('reset')) F = { ...F, q: '', cat: 'all', price: 0, rating: 0, eta: 0, promo: false, sort: 'popular', open: false }; if (p.has('q')) F.q = p.get('q'); if (p.has('cat')) F.cat = p.get('cat'); if (p.has('tab')) F.tab = p.get('tab'); if (p.get('f')) F.open = true;
  return { html: `<section class="view">${pageHead(F.tab === 'dishes' ? 'Order food' : 'Restaurants')}<div class="search" style="margin-top:0"><div class="sbox">${ic('search', 22)}<input id="dq" type="search" value="${esc(F.q)}" placeholder="Search dishes, restaurants, cuisines, ingredients" aria-label="Search" autocomplete="off"><button class="ib" data-a="dclear" aria-label="Clear search" ${F.q ? '' : 'hidden'}>${ic('x', 18)}</button><i class="vr"></i><button class="ib" data-a="ftoggle" aria-label="Toggle filters" aria-expanded="${F.open}">${ic('sliders', 22)}</button></div></div>
  <div class="chips" style="margin-top:14px" role="tablist">${[['dishes', 'Dishes'], ['rests', 'Restaurants']].map(([k, l]) => `<button class="chip ${F.tab === k ? 'on' : ''}" role="tab" aria-selected="${F.tab === k}" data-a="ftab" data-v="${k}">${l}</button>`).join('')}</div><div id="dfilters"></div><div id="results" aria-live="polite"></div></section>`, after:()=>{fillDiscover();watchStoreAvailability(fillResults);} }; };
const chipRow = (k, opts) => `<div class="chips">${opts.map(([v, l]) => `<button class="chip ${F[k] === v ? 'on' : ''}" data-a="flt" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
function fillDiscover() {
  $('#dfilters').innerHTML = `<div class="chips" style="margin:14px 0 4px"><button class="chip ${F.cat==='all'?'on':''}" data-a="flt" data-k="cat" data-v="all">All</button>${CATS.map(c=>`<button class="chip ${F.cat===c.id?'on':''}" data-a="flt" data-k="cat" data-v="${esc(c.id)}">${esc(c.name)}</button>`).join('')}</div>${F.open?`<div class="panel" style="margin-top:12px"><div class="field"><label>Item price</label>${chipRow('price',[[0,'Any'],[150,'Under ₱150'],[300,'Under ₱300']])}</div><div class="field" style="margin:0"><label for="sort">Sort by</label><select id="sort" class="in" data-sort><option value="popular">Menu order</option><option value="price">Lowest price</option></select></div></div>`:''}`;
  const s=$('#sort');if(s)s.value=F.sort;fillResults();
}
function fillResults() {
  const terms = F.q.toLowerCase().split(/\s+/).filter(Boolean), cn = id => (CATS.find(c => c.id === id) || {}).name || '';
  let html, n;
  if (F.tab === 'dishes') {
    let a = ALL().filter(({ item: i, rest: r }) => isOpen(r) && (F.cat === 'all' || i.cat === F.cat) && (!F.price || i.price <= F.price) && terms.every(t => `${i.name} ${i.desc} ${r.name} ${r.kind} ${cn(i.cat)}`.toLowerCase().includes(t)));
    if(F.sort==='price')a.sort((x,y)=>x.item.price-y.item.price);
    n = a.length; html = `<div class="grid">${a.map(dishCard).join('')}</div>`;
  } else {
    let a = RS.filter(r => (F.cat === 'all' || r.cat === F.cat || r.items.some(i => i.cat === F.cat)) && (!F.price || Math.min(...r.items.map(i => i.price)) <= F.price) && terms.every(t => `${r.name} ${r.kind} ${r.items.map(i => i.name + ' ' + i.desc).join(' ')}`.toLowerCase().includes(t)));
    if(F.sort==='price')a.sort((x,y)=>Math.min(...x.items.map(i=>i.price))-Math.min(...y.items.map(i=>i.price)));
    const {open,unavailable} = groupStores(a);
    n = a.length;
    html = storeGrid([...open,...unavailable]);
  }
  $('#results').innerHTML = n ? `<p class="mu sm" style="margin:12px 0">${n} ${F.tab === 'dishes' ? 'dish' : 'restaurant'}${n > 1 ? (F.tab === 'dishes' ? 'es' : 's') : ''} found</p>${html}` : emptyState('search', 'No matches', 'Try a different word or remove a filter.', 'Clear filters', 'fclear');
}

/* ---------- restaurant ---------- */
V.restaurant = id => { const r = R(id); if (!r) return V.notFound(); const op = isOpen(r), secs = [...new Set(r.items.map(i => i.sec))];
  const label = storeAvailabilityLabel(r);
  const reason = storeClosureReason(r);
  return { html: `<section class="view"><div class="cover">${photo(r.cover, r.name + ' cover photo', { w: 1200, eager: 1 })}<div class="cov-sh"></div><div class="cov-b"><button class="ib w" data-a="back" aria-label="Go back">${ic('back')}</button><span class="row">${hrt('rests', r.id)}<button class="ib w" data-a="share" data-id="${r.id}" aria-label="Share restaurant">${ic('share')}</button></span></div></div>
  <div class="fcard"><div class="row sp wrap"><h1 style="font-size:28px">${esc(r.name)}</h1><span class="status ${op?'open':'closed'}">${esc(label)}</span></div><p class="mu" style="margin-top:6px">${esc(r.kind)} • ${esc(r.addr)}</p>
  ${label==='Not open' && reason && !/^closed by owner$/i.test(reason)?`<p class="mu sm" style="margin-top:8px">${esc(reason)}</p>`:''}
  <div class="stats"><div>${ic('store',18,'gc')}Menu & availability</div><div>${ic('pin',18,'gc')}Alegria</div></div></div>
  <p class="sm mu" style="margin:12px 6px 0">${r.busy ? `<span class="status closed">Busy · +${r.busy} min</span> ` : ''}${r.promo ? ` · <button class="link gl" style="padding:0" data-a="usepromo" data-id="${r.promo}">Code ${r.promo}</button>` : ''}</p>
  ${r.feature ? `<button class="mint row" data-a="jump" data-id="s-${esc(r.feature.sec)}" style="width:100%;text-align:left;margin-top:14px">${photo(r.feature.img, r.feature.title, { ar: '1', w: 200 }).replace('class="ph', 'style="width:64px;border-radius:16px;flex:none" class="ph')}<span class="grow"><b style="font-size:17px">${esc(r.feature.title)}</b><br><span class="sm mu">${esc(r.feature.sub)}</span></span>${ic('chev', 18, 'mu')}</button>` : ''}
  ${r.catering ? `<div class="mint row" style="margin-top:12px">${ic('box', 26, 'gc')}<span class="grow"><b>Ask about catering</b><br><span class="sm mu">Confirm menus, prices and availability with the store.</span></span><button class="btn p sm" data-a="cater" data-id="${r.id}">Request</button></div>` : ''}
  <div class="chips solid" style="margin-top:12px;position:sticky;top:var(--st);background:var(--bg);z-index:5;padding:10px 0">${secs.map((s, k) => `<button class="chip ${k ? '' : 'on'}" data-a="jump" data-id="s-${esc(s)}">${esc(s)}</button>`).join('')}${r.catering ? '<button class="chip" data-a="jump" data-id="s-catering">Catering</button>' : ''}${r.stay ? '<button class="chip" data-a="jump" data-id="s-stay">Stay &amp; Events</button>' : ''}</div>
  ${secs.map((s, k) => `<div id="s-${esc(s)}" style="margin-top:18px"><div class="sec-h" style="margin-bottom:4px"><h2>${esc(s)}</h2></div><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,420px),1fr));gap:0 28px">${r.items.filter(i => i.sec === s).map(i => `<div class="mi" tabindex="0" role="button" data-a="item" data-id="${i.id}" aria-label="${esc(i.name)} ${peso(i.price)}">${photo(i.img, i.name, { ar: '1', w: 300 })}<div class="bd"><div class="row sp" style="align-items:flex-start"><h3 style="font-size:18px">${esc(i.name)}</h3><span class="mu">${peso(i.price)}</span></div><p class="mu sm" style="margin:6px 0 10px">${esc(i.desc)}</p>${i.available ? `<button class="addp" data-a="quick" data-id="${i.id}" ${op ? '' : 'disabled'} aria-label="Quick add ${esc(i.name)}">${ic('plus', 16)}Add</button>` : '<span class="status closed">Sold out</span>'}</div></div>`).join('')}</div></div>`).join('')}
  ${r.catering ? cateringSection(r) : ''}
  <div class="sec"><h2 style="margin-bottom:10px">Contact</h2><div class="panel">${contactBtns(r)}</div></div>
  <div class="sec"><h2 style="margin-bottom:10px">Opening hours</h2><div class="panel"><div class="row sp"><span>Store hours</span><b>${r.verifiedHours?hoursText(r):'Ask the store'}</b></div></div></div>
</section>`, after:()=>watchStoreAvailability(render) }; };

/* Match instructions to the actual product; seller-configured option groups remain unchanged. */
function instructionPlaceholder(item, rest) {
  const product = `${item.name || ''} ${item.cat || ''} ${item.sec || ''}`.toLowerCase();
  const business = String(rest.kind || '').toLowerCase();
  if (/coffee|café|cafe|latte|mocha|macchiato|cappuccino|espresso|americano|frappe|frappé|choco|chocolate|milk.?tea|matcha|smoothie|juice|shake|drink|beverage|iced|tea|lemonade/.test(product) ||
      (/café|cafe|coffee|milk tea|beverage/.test(business) && !/sandwich|burger|rice|pasta|meal|bread|cake|cookie|pastry/.test(product)))
    return 'E.g. less sweet, extra milk, no whipped cream';
  if (/cake|dessert|ice cream|pastry|cookie|donut|doughnut|halo.?halo/.test(product))
    return 'E.g. less syrup, extra toppings';
  return 'E.g. no onions, extra sauce, separate rice';
}

/* ---------- item sheet ---------- */
function openItem(id, editKey) {
  const { item, rest } = ITEM(id), ed = editKey && S.cart.lines.find(l => l.key === editKey), st = { sel: ed ? JSON.parse(JSON.stringify(ed.sel)) : defSel(item), qty: ed ? ed.qty : 1, note: ed ? ed.note : '' };
  const el = openSheet(`<div style="margin-top:0">${photo(item.img, `${item.name} from ${rest.name}`, { ar: '16/10', w: 900, eager: 1 })}</div><div class="pd"><div class="row sp"><h2 style="font-size:24px">${esc(item.name)}</h2><b style="font-size:20px">${peso(item.price)}</b></div><p class="mu" style="margin:6px 0 10px">${esc(item.desc)}</p><div class="row g sm"><span class="mu">${esc(rest.name)}</span></div></div>
  <form class="pd" style="padding-top:0" novalidate>${item.opts.map(g => `<fieldset style="border:0;padding:0;margin:14px 0 0"><legend style="font-weight:800;margin-bottom:8px">${esc(g.label)} ${g.req ? '<span class="status n">Required</span>' : '<span class="mu sm">Optional</span>'}</legend>${g.ch.map(c => `<label class="opt"><input type="${g.type === 'radio' ? 'radio' : 'checkbox'}" name="${esc(g.id)}" value="${esc(c.n)}" ${(st.sel[g.id] || []).includes(c.n) ? 'checked' : ''}><span class="grow">${esc(c.n)}</span><span class="mu">${c.p ? '+' + peso(c.p) : 'Free'}</span></label>`).join('')}</fieldset>`).join('')}
  <div class="field" style="margin-top:16px"><label for="note">Special instructions</label><textarea class="in" id="note" maxlength="200" placeholder="${esc(instructionPlaceholder(item, rest))}">${esc(st.note)}</textarea></div></form>
  <div class="sticky-foot row"><div class="qty" role="group" aria-label="Quantity"><button data-sa="dec" aria-label="Decrease quantity">${ic('minus', 18)}</button><b data-qty aria-live="polite">${st.qty}</b><button data-sa="inc" aria-label="Increase quantity">${ic('plus', 18)}</button></div><button class="btn p grow" data-sa="add" ${item.available ? '' : 'disabled'}><span data-tot></span></button></div>`, { label: item.name });
  const upd = () => { const f = $('form', el); st.sel = {}; item.opts.forEach(g => { st.sel[g.id] = $$(`input[name=${g.id}]:checked`, f).map(i => i.value); }); st.note = $('#note', el).value.trim(); $('[data-qty]', el).textContent = st.qty;
    $('[data-tot]', el).textContent = `${ed ? 'Update' : 'Add to cart'} · ${peso(unitPrice(item, st.sel) * st.qty)}`; };
  el.addEventListener('input', upd); el.addEventListener('change', upd); upd();
  el.addEventListener('click', e => { const b = e.target.closest('[data-sa]'); if (!b) return; const a = b.dataset.sa;
    if (a === 'inc') st.qty = Math.min(99, st.qty + 1); if (a === 'dec') st.qty = Math.max(1, st.qty - 1); upd();
    if (a === 'add') { upd(); const missing=(item.opts||[]).find(g=>g.req && !(st.sel[g.id]||[]).length);if(missing){toast('Please choose '+missing.label);return;} const fx = { rect: $('.ph', el).getBoundingClientRect(), img: item.img }; closeSheet(); addToCart(item, rest, st.sel, st.qty, st.note, ed ? ed.key : null, ed ? null : fx); if (ed) render(); } });
}

/* ---------- cart ---------- */
const sumHTML = c => `<div class="sum"><div class="r"><span>Subtotal</span><span>${peso(c.sub)}</span></div>${orderStatus.mode(c) === 'pickup' ? '' : `<div class="r"><span>Delivery fee</span><span>${c.promo && !c.perr && c.promo.type === 'ship' ? `<s class="mu">${peso(c.fee)}</s> <b class="ok">Free</b>` : c.fee==null?'Not supplied':peso(c.fee)}</span></div>`}
  ${c.disc && c.promo?.type !== 'ship' ? `<div class="r ok"><span>Promo ${esc(c.promo?.code||'Recorded discount')}</span><span>−${peso(c.disc)}</span></div>` : ''}${c.tip ? `<div class="r"><span>Rider tip</span><span>${peso(c.tip)}</span></div>` : ''}<div class="r tot"><span>Total</span><span>${peso(c.total)}</span></div><p class="mu sm" style="margin-top:6px">Check tax details with the store.</p></div>`;
const promoBox = c => `<section class="panel pp-voucher-panel" aria-labelledby="pp-checkout-vouchers">
  <div class="row sp wrap"><div><h3 id="pp-checkout-vouchers">Vouchers</h3><p class="mu sm">One voucher per checkout.</p></div>
  <button type="button" class="btn s sm" data-a="choosevoucher">${ic('ticket',17)}${S.promo?'Change voucher':'Choose voucher'}</button></div>
  ${S.promo?`<div class="row sp wrap pp-selected-voucher"><div><b>${esc(S.promo)}</b><p class="${c.perr?'err':'ok sm'}">${esc(c.perr||`You save ${peso(c.disc)}.`)}</p></div><button type="button" class="btn o sm" data-a="rmpromo">Remove voucher</button></div>`:''}
</section>`;
function voucherOptions(){
  const vouchers=activeVouchers();
  return vouchers.length?vouchers.map(p=>{
    const quote=calc(S.cart,p.code),selected=S.promo===p.code&&!quote.perr;
    return `<button type="button" class="pp-voucher-option pp-paper-ticket" data-a="usepromo" data-id="${esc(p.code)}" aria-pressed="${selected}" ${quote.perr?'disabled':''}>
      <span>${esc(voucherTitle(p))}<small>${esc(p.code)} · ${esc(voucherTerms(p))}</small></span>
      <small>${esc(quote.perr||(selected?`Selected · Save ${peso(quote.disc)}`:`Save ${peso(quote.disc)}`))}</small>
    </button>`;
  }).join(''):'<p class="mu sm">No active vouchers right now.</p>';
}
async function chooseVoucher(){
  const sheet=openSheet(`<div class="pd pp-voucher-picker"><h2 tabindex="-1" autofocus>Choose a voucher</h2><p class="mu sm">You can apply one voucher to this checkout.</p>
    <div class="pp-voucher-options" data-voucher-options><p class="mu sm" role="status">Loading vouchers…</p></div>
    <div class="row"><input class="in" id="pc" placeholder="Enter voucher code" autocapitalize="characters" aria-label="Voucher code" maxlength="20"><button type="button" class="btn p sm" data-a="applypromo">Apply</button></div>
    <p class="err" id="pcerr" role="alert"></p></div>`,{label:'Choose a voucher'});
  const loaded=await refreshPromotions();
  if(sheet===sheetEl)$('[data-voucher-options]',sheet).innerHTML=loaded?voucherOptions():'<p class="err">Vouchers could not load. Close and reopen to try again.</p>';
}
function renderVoucherCheckout(focusVoucher=true){
  const phone=$('#cp')?.value, note=$('#di')?.value, position=scrollY;
  render();
  if(phone!=null&&$('#cp'))$('#cp').value=phone;
  if(note!=null&&$('#di'))$('#di').value=note;
  if(focusVoucher) $('[data-a=choosevoucher]')?.focus({preventScroll:true});
  window.scrollTo(0,position);
}
V.cartView = () => {
  if (pendingCheckout(S.user.id)) return {html: `<section class="view">${pageHead('Order review')}
    <div class="panel"><h2>Check your order</h2><p class="mu" style="margin:8px 0 16px">We could not confirm your previous checkout. Retrying sends the same order request and returns the original order if it was already saved.</p>
    <button class="btn p" id="place" data-a="place">Retry checkout</button></div></section>`};
  const c = calc();
  if (!S.cart.lines.length) return { html: `<section class="view">${pageHead('Your cart')}${emptyState('cart', 'Your cart is empty', 'Add something delicious and it will show up here.', 'Browse food', 'browse')}</section>` };
  const a = checkoutAddress(); if (a) CK.addr = a.id; const r=c.r;
  const pl = payLabel(), tip = CK.tip || 0; const fee = c.promo && !c.perr && c.promo.type === 'ship' ? `<s class="mu">${peso(c.fee)}</s> <b class="gl">Free</b>` : c.feeKnown?peso(c.fee):deliveryConfig?.enabled?'Awaiting quote':deliveryConfig?'Not configured':'Loading…';
  return { after:()=>void prepareDeliveryPricing(), html: `<section class="view pp-cart-view" style="max-width:640px;margin:0 auto"><div class="rv-h"><button class="ib w" data-a="back" aria-label="Go back">${ic('back')}</button><h1>ORDER REVIEW</h1><span style="width:44px"></span></div>
  <div class="rv-lab"><span>Order type</span></div><div class="chips"><button class="chip ${CK.fulfillment === 'delivery' ? 'on' : ''}" data-a="fulfillment" data-v="delivery">Delivery</button><button class="chip ${CK.fulfillment === 'pickup' ? 'on' : ''}" data-a="fulfillment" data-v="pickup">Pickup at store</button></div><div class="rv-lab"><span>${CK.fulfillment === 'pickup' ? 'Pickup locations' : 'Delivery address'}</span>${CK.fulfillment === 'pickup' ? '' : '<button data-a="addrpick">EDIT</button>'}</div>
  ${CK.fulfillment === 'pickup' ? `<div class="panel">${c.groups.map(g => `<p><b>${esc(g.rest?.name || 'Store')}</b><br>${esc(g.rest?.addr || 'Contact the store for pickup location')}</p>`).join('')}</div>` : `<div class="row" style="gap:14px"><span class="pbtn" style="width:56px;height:56px;background:#fff;color:var(--ink);box-shadow:var(--sh)">${ic('pin', 22)}</span><div class="grow">${a ? `<b style="font-size:20px">${esc(a.label)}</b> ${a.def ? '<span class="status n" style="letter-spacing:.06em">PRIMARY</span>' : ''}<p class="mu">${esc(a.line)} • ${esc(a.city)}${a.landmark ? '<br>Landmark: ' + esc(a.landmark) : ''}</p>` : `<b>No address yet</b><p class="mu">Add where we should deliver.</p>`}</div></div>`}
  ${c.pickup?'':quotePanel(a)}
  <div class="field" style="margin-top:14px"><label for="cp">Contact number</label><input class="in" id="cp" inputmode="tel" value="${esc(S.user.phone || '')}" placeholder="09XXXXXXXXX" autocomplete="tel"><p class="err" id="cpe"></p></div>
  <div class="mint row" style="margin-top:6px">${ic('clock',22)}<p class="sm">${CK.fulfillment === 'pickup' ? 'We’ll let you know when your order is ready to collect.' : 'The store confirms preparation and delivery timing after accepting your order.'}</p></div>
  <div class="rv-lab"><span>Your selection · ${c.groups.length} store(s)</span><button data-a="browse">ADD ITEMS</button></div>
  ${c.groups.map(g => `<h3 style="margin:16px 0 6px;color:var(--gc,#087F32)">${esc(g.rest?.name || 'Store')} · ${peso(g.sub)}</h3>${g.lines.map(l => `<div class="row pp-cart-line" style="gap:16px;align-items:flex-start;padding:8px 0">${photo(l.img, l.name, { ar: '1', w: 240 }).replace('class="ph', 'style="width:100px;border-radius:18px;flex:none" class="ph')}<div class="grow"><div class="row sp" style="align-items:flex-start"><h3 style="font-size:19px">${esc(l.name)}</h3><b style="font-size:19px">${peso(l.unit * l.qty)}</b></div><p class="mu sm">${esc(selText(l)) || 'Standard'}${l.note ? ' · “' + esc(l.note) + '”' : ''}</p>
  <div class="row sp" style="margin-top:10px"><div class="qty mintq"><button data-a="qty" data-k="${l.key}" data-d="-1" aria-label="Decrease ${esc(l.name)}">${ic('minus', 16)}</button><b>${l.qty}</b><button data-a="qty" data-k="${l.key}" data-d="1" aria-label="Increase ${esc(l.name)}">${ic('plus', 16)}</button></div><span><button class="rm" data-a="editline" data-k="${l.key}" data-id="${l.itemId}" style="color:var(--mu)">EDIT</button> <button class="rm" data-a="rmline" data-k="${l.key}" aria-label="Remove ${esc(l.name)}">REMOVE</button></span></div></div></div>`).join('')}`).join('')}
  <div class="rv-lab"><span>Payment method</span><button data-a="paypick">CHANGE</button></div>
  <div class="mint row" style="gap:14px"><span class="paybadge">${ic('card', 22)}</span><div class="grow"><b style="font-size:18px">${esc(pl[0])}</b><div class="lab" style="font-size:12px">${esc(pl[1])}</div></div><span class="tick">${ic('check', 16)}</span></div>
  <div class="field" style="margin-top:14px"><label for="di">Instructions (optional)</label><textarea class="in" id="di" maxlength="200" placeholder="Gate color, landmarks, leave at lobby…"></textarea></div>
  ${CK.fulfillment === 'pickup' ? '' : `<div class="rv-lab" style="margin-top:24px"><span>Tip your rider</span><span class="sm mu" style="letter-spacing:0;text-transform:none;font-weight:600">Optional</span></div><div class="chips">${[0, 20, 30, 50, 100].map(v => `<button class="chip ${tip === v ? 'on' : ''}" data-a="tip" data-v="${v}" aria-pressed="${tip === v}">${v ? peso(v) : 'No tip'}</button>`).join('')}</div>`}
  <div style="margin-top:14px">${promoBox(c)}</div>
  <div class="sum" style="margin-top:18px;font-size:18px"><div class="r mu"><span>Order Subtotal</span><b style="color:var(--ink)">${peso(c.sub)}</b></div><div class="r mu"><span>${CK.fulfillment === 'pickup' ? 'Pickup Fee' : deliveryConfig?.enabled ? 'Delivery fee' : 'Delivery fee estimate'}</span><b style="color:var(--ink)">${fee}</b></div>${c.disc && c.promo?.type !== 'ship' ? `<div class="r gl"><span>Promo ${esc(c.promo?.code||'Recorded discount')}</span><b>−${peso(c.disc)}</b></div>` : ''}${tip ? `<div class="r mu"><span>Rider tip</span><b style="color:var(--ink)">${peso(tip)}</b></div>` : ''}<p class="sm mu">Check tax details with the store.</p></div>
  ${!c.feeKnown&&deliveryConfig?.enabled===false?'<p class="note" style="margin-top:15px">Delivery charges are not configured for this barangay. Choose pickup or contact the store.</p>':''}
  ${!c.minOk ? `<p class="err" style="margin:10px 0">Some stores have not reached their minimum order amount.</p>` : ''}
  <button class="pbar" id="place" data-a="place" data-total="${c.total+tip}" ${c.minOk&&c.feeKnown&&!c.perr?'':'disabled'}><span>Place Order</span><i></i><b>${c.feeKnown?peso(c.total+tip):'Fee unavailable'}</b></button>
  <p class="mu sm" style="text-align:center;margin-top:12px;letter-spacing:.04em">TAPPING PLACE ORDER CONFIRMS YOUR ACCEPTANCE OF TERMS</p><p style="text-align:center;margin-top:8px"><span class="sm mu">Orders are submitted securely to Papalita. Cash payment only.</span></p></section>` }; };

/* ---------- checkout ---------- */
let CK = { addr: null, pay: 'cod', det: {}, fulfillment: 'delivery', tip: 0 };
let deliveryConfig, deliveryConfigRequest, phoneLocationRequest, phonePin, selectedPin;
let currentDeliveryQuote, deliveryEstimate, deliveryRequest, deliveryMessage = '';
const checkoutStoreIds = () => cartGroups().map(g => g.rid).sort();
const confirmedPin = a => selectedPin?.customerId === S.user.id && selectedPin.addressId === a?.id ? selectedPin.point : null;
const quoteKey = a => JSON.stringify([S.user.id, checkoutStoreIds(), a?.id, a?.areaId,
  a?.label, a?.line, a?.landmark, a?.city, confirmedPin(a)]);
function activeDeliveryQuote(a = checkoutAddress()) {
  const q = currentDeliveryQuote;
  return q?.key === quoteKey(a) && q.expires > Date.now() ? q : null;
}

function updateDeliveryView() {
  if (S.user.in && onCheckout() && !sheetEl) renderVoucherCheckout(false);
}

async function loadDeliveryConfig() {
  if (deliveryConfig) return deliveryConfig;
  if (deliveryConfigRequest) return deliveryConfigRequest;
  deliveryConfigRequest = (async () => {
    const {data,error} = await window.PAPALITA_DB.rpc('papalita_delivery_checkout_config');
    if (error && !['PGRST202','42883'].includes(error.code)) throw Error('Delivery setup could not load. Retry.');
    deliveryConfig = data?.enabled === true ? data : {enabled:false};
    return deliveryConfig;
  })().finally(() => { deliveryConfigRequest = null; });
  return deliveryConfigRequest;
}

function getPhonePin() {
  if (!navigator.geolocation) return Promise.reject(Error('Location is unavailable. You can use the map instead.'));
  return new Promise((resolve,reject) => {
    navigator.geolocation.getCurrentPosition(({coords}) => {
      if (coords.accuracy > 75) return reject(Error('Phone location is imprecise. Confirm the address on the map.'));
      resolve([coords.longitude,coords.latitude]);
    }, () => reject(Error('Could not get your phone location. You can use the map instead.')),
    {enableHighAccuracy:true,maximumAge:15000,timeout:8000});
  });
}

async function getAlreadyAllowedLocation() {
  if (phonePin) return;
  if (!phoneLocationRequest) phoneLocationRequest = (async () => {
    const permission = await navigator.permissions?.query({name:'geolocation'});
    if (permission?.state === 'granted' && !document.hidden) phonePin = await getPhonePin();
  })().catch(() => {});
  await phoneLocationRequest;
}

async function invokeDeliveryQuote(body) {
  const {data,error} = await window.PAPALITA_DB.functions.invoke('delivery-quote',{body});
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw Error(detail?.error || 'Delivery quote could not load. Try again.');
  }
  return data;
}

async function prepareDeliveryPricing() {
  if (!S.user.in) return;
  const hadConfig = !!deliveryConfig;
  try {
    const config = await loadDeliveryConfig();
    if (!hadConfig) { deliveryMessage = ''; updateDeliveryView(); }
    if (!config.enabled) return;
    await getAlreadyAllowedLocation();
    if (!phonePin || !onCheckout() || CK.fulfillment !== 'delivery' || deliveryRequest || activeDeliveryQuote()) return;
    const store_ids = checkoutStoreIds(), key = JSON.stringify([S.user.id,store_ids,phonePin]);
    if (!store_ids.length || store_ids.length > 5 || deliveryEstimate?.key === key) return;
    deliveryEstimate = {key};
    const data = await invokeDeliveryQuote({store_ids,pin:phonePin,estimate:true});
    if (deliveryEstimate.key === key) {
      deliveryEstimate.total = data.quotes.reduce((sum,q) => sum + q.details.total_centavos,0) / 100;
      deliveryEstimate.area = data.area + ', ' + data.barangay;
      updateDeliveryView();
    }
  } catch (error) {
    if (!deliveryConfig && !deliveryMessage) { deliveryMessage = error.message; updateDeliveryView(); }
  }
}

function quotePanel(a) {
  if (!deliveryConfig) return `<p class="sm mu" role="status">${esc(deliveryMessage || 'Loading delivery pricing…')}</p>
    ${deliveryMessage ? '<button type="button" class="btn s sm" data-a="delivery-retry">Retry delivery setup</button>' : ''}`;
  if (!deliveryConfig.enabled) return '';
  const q = activeDeliveryQuote(a), pin = confirmedPin(a);
  const area = deliveryConfig.areas.find(x => x.id === a?.areaId && x.barangay === addressBarangay(a));
  const estimateKey = JSON.stringify([S.user.id,checkoutStoreIds(),phonePin]);
  const estimated = !q && deliveryEstimate?.key === estimateKey && Number.isFinite(deliveryEstimate.total);
  return `<section class="panel" style="margin-top:14px" aria-label="Delivery quote">
    <h3>Delivery quote</h3>
    <p class="sm mu">${area ? esc(area.name + ', ' + area.barangay) : 'Choose a barangay and purok or sitio to confirm your delivery area.'}</p>
    ${estimated ? `<p class="sm mu">Phone location estimate for ${esc(deliveryEstimate.area)} · ${peso(deliveryEstimate.total)}</p>` : ''}
    ${q ? [...q.byStore.values()].map(({store_id,details:d}) => `<p class="sm" style="margin-top:8px"><b>${esc(R(store_id)?.name || 'Store')} · ${peso(d.total_centavos/100)}</b><br>
      ${d.source==='fixed_area'?'Fixed area rate':(d.road_m/1000).toFixed(2)+' km by road'} · Base ${peso(d.base_centavos/100)}${d.interior_centavos?' + '+peso(d.interior_centavos/100)+' interior top-up':''}${d.terrain_centavos?' + '+peso(d.terrain_centavos/100)+' upland surcharge':''}</p>`).join('') : ''}
    <p class="sm mu" role="status" style="margin-top:8px">${esc(deliveryMessage || (pin ? 'Delivery pin selected.' : 'Add a delivery pin for a road-based quote.'))}</p>
    <div class="row wrap" style="margin-top:8px">
      ${a && !area ? `<button type="button" class="btn s sm" data-a="addrform" data-id="${esc(a.id)}">Confirm area</button>` : ''}
      ${!a ? '<button type="button" class="btn s sm" data-a="addrform">Add delivery address</button>' : ''}
      ${area ? `<button type="button" class="btn s sm" data-a="delivery-gps">Use phone location</button>
        <button type="button" class="btn s sm" data-a="delivery-pin">Set map pin</button>
        <button type="button" class="btn p sm" data-a="delivery-quote" ${deliveryRequest?'disabled':''}>${deliveryRequest?'Getting quote…':'Get delivery quote'}</button>` : ''}
    </div></section>`;
}

async function selectDeliveryPin(fromMap, button) {
  const address = checkoutAddress(), key = quoteKey(address);
  if (!address || deliveryRequest || !deliveryConfig?.enabled) return;
  button.disabled = true;
  try {
    const center = deliveryConfig.center;
    const start = confirmedPin(address) || phonePin || [center[1],center[0]];
    const point = fromMap ? await window.PapalitaLiveMap.pickPin(start) : await getPhonePin();
    if (!point || !S.user.in || !onCheckout() || quoteKey(checkoutAddress()) !== key) return;
    if (!fromMap) phonePin = point;
    selectedPin = {customerId:S.user.id,addressId:address.id,point};
    deliveryMessage = 'Delivery pin selected. Get a quote to confirm the fee.';
    updateDeliveryView();
  } catch (error) {
    if (button.isConnected) { deliveryMessage = error.message; updateDeliveryView(); }
  } finally { button.disabled = false; }
}

async function getDeliveryQuote() {
  const a = checkoutAddress();
  if (!a?.areaId || deliveryRequest || !deliveryConfig?.enabled) return;
  const store_ids = checkoutStoreIds();
  const key = quoteKey(a);
  const body = {store_ids,area_id:a.areaId,pin:confirmedPin(a),address:{label:a.label,line:a.line,landmark:a.landmark}};
  deliveryMessage = '';
  currentDeliveryQuote = null;
  deliveryRequest = invokeDeliveryQuote(body);
  updateDeliveryView();
  try {
    const data = await deliveryRequest;
    if (key !== quoteKey(checkoutAddress())) return;
    const byStore = new Map(data.quotes.map(q => [q.store_id,q]));
    if (byStore.size !== store_ids.length || !store_ids.every(id => byStore.has(id)) || !data.address) {
      throw Error('The server could not quote every store. Try again.');
    }
    const expires = Math.min(...data.quotes.map(q => Date.parse(q.expires_at)));
    if (!Number.isFinite(expires) || expires <= Date.now()) throw Error('The delivery quote expired. Try again.');
    currentDeliveryQuote = {key,byStore,address:data.address,expires};
    deliveryMessage = body.pin && data.pin_accepted === false
      ? 'Your pin is outside the selected area. This quote uses the verified fixed area rate.'
      : 'Review your delivery fee before placing your order.';
  } catch (error) {
    if (key === quoteKey(checkoutAddress())) deliveryMessage = error.message;
  } finally {
    deliveryRequest = null;
    updateDeliveryView();
  }
}


const PH = /^(09|\+639)\d{9}$/;
const payLabel=()=>[CK.fulfillment==='pickup'?'Cash on Pickup':'Cash on Delivery',CK.fulfillment==='pickup'?'PAY AT THE STORE':'PAY ON ARRIVAL'];
function addrPick() { const current = checkoutAddress(); const el = openSheet(`<div class="pd" style="padding-top:34px"><h2 style="margin-bottom:12px">Deliver to</h2>${S.addrs.map(a => `<label class="opt"><input type="radio" name="ap" value="${a.id}" ${current?.id === a.id ? 'checked' : ''}><span class="grow"><b>${esc(a.label)}</b><br><span class="mu sm">${esc(a.line)}, ${esc(a.city)}</span></span></label>`).join('')}<button class="btn s blk" data-a="addrform" style="margin-top:6px">${ic('plus', 18)}Add new address</button>${current ? `<button class="btn o blk" data-a="addrform" data-id="${esc(current.id)}" style="margin-top:8px">${ic('edit', 18)}Edit delivery address</button>` : ''}</div>`, { label: 'Delivery address' });
  el.addEventListener('change', e => { if (e.target.name === 'ap') { CK.addr = e.target.value; S.addrs.forEach(a => a.def = a.id === CK.addr); syncLoc(S.addrs.find(a => a.id === CK.addr)); save(); closeSheet(); updateChrome(); render(); } }); }
let checkoutBusy = false, pendingAttempt = null;
const checkoutStorageKey = customer => 'papalita.pending-checkout.' + customer;
const checkoutCartStamp = () => JSON.stringify(S.cart.lines);
function pendingCheckout(customer) {
  if (!customer) return null;
  if (pendingAttempt?.customer === customer) return pendingAttempt;
  try {
    const attempt = JSON.parse(sessionStorage.getItem(checkoutStorageKey(customer)));
    return attempt?.customer === customer && realId(attempt.request?.p_checkout_id) ? attempt : null;
  } catch { return null; }
}
function savePendingCheckout(customer, attempt) {
  pendingAttempt = attempt;
  try {
    if (attempt) sessionStorage.setItem(checkoutStorageKey(customer), JSON.stringify(attempt));
    else sessionStorage.removeItem(checkoutStorageKey(customer));
  } catch {}
}
async function sendCheckout(db, attempt) {
  const {data,error} = await db.rpc('papalita_checkout_v2', attempt.request);
  if (error) {
    // A database rejection rolled back the submission. Keep the key on a lost response.
    if (['PT429','P0001','22023','22P02','23514','PGRST202'].includes(error.code)) {
      savePendingCheckout(attempt.customer, null);
    }
    throw error;
  }
  if (!Array.isArray(data) || data.length !== attempt.request.p_groups.length || data.some(row => !realId(row?.order_id))) {
    throw Error('Checkout did not confirm every store order.');
  }
  return data;
}
function finishCheckout(attempt, orders) {
  if (S.user.id !== attempt.customer || !S.user.in) return;
  const newOrders = orders.filter(order => !ORD(order.id));
  S.orders.unshift(...newOrders);
  if (checkoutCartStamp() === attempt.cart) {
    S.user.phone = attempt.request.p_phone;
    CK.tip = 0;
    S.cart = {rid:null,lines:[]};
    S.promo = null;
  }
  save();
  savePendingCheckout(attempt.customer, null);
  updateChrome();
  nav('/confirmation/' + orders[0].id);
  for (const order of newOrders) {
    try {
      notify('order', `Order submitted · ${order.id}`, 'Your order was saved.');
      Promise.resolve(window.PAPALITA_NOTIFICATIONS?.orderPlaced(order.id)).catch(error => console.warn('[Papalita] Order phone alert:', error.message));
    } catch (error) { console.warn('[Papalita] Order phone alert:', error.message); }
  }
  if (orders.length > 1) toast(`${orders.length} store orders submitted successfully.`);
}
async function placeOrder() {
  if (checkoutBusy) return;
  checkoutBusy = true;
  const customer = S.user.id, attempt = pendingCheckout(customer), btn = $('#place');
  try {
    if (!attempt) return await submitOrder();
    btn.disabled = true;
    btn.textContent = 'Retrying checkout…';
    const db = authDB();
    const {data: auth, error: authError} = await db.auth.getUser();
    if (authError) throw authError;
    if (auth?.user?.id !== customer || S.user.id !== customer) throw Error('Sign in to the account that placed this order.');
    const receipts = await sendCheckout(db, attempt);
    const orders = await Promise.all(receipts.map(row => fetchCustomerOrder(db,row.order_id,customer)));
    finishCheckout(attempt, orders);
  } catch (error) {
    console.error('[Papalita] Checkout retry failed:', error);
    if (S.user.id === customer) toast(pendingCheckout(customer)
      ? 'Order status is unconfirmed. Retry the same checkout.'
      : error.message || 'Review your order and try again.');
    if (btn?.isConnected) render();
  } finally { checkoutBusy = false; }
}
async function submitOrder() {
  const a = checkoutAddress(), barangay = addressBarangay(a);
  let c = calc(S.cart, S.promo, barangay);
  if (!S.cart.lines.length) return;
  const phoneField = $('#cp'), phone = (phoneField.value || '').trim().replace(/\s/g, '');
  $('#cpe').textContent = ''; phoneField.classList.remove('bad');
  if (CK.fulfillment !== 'pickup' && !a) { toast('Add a delivery address first.'); return addrForm(); }
  if (!PH.test(phone)) { phoneField.classList.add('bad'); $('#cpe').textContent = 'Use a PH mobile number like 09171234567.'; return phoneField.focus(); }
  if (!c.minOk) return toast('One or more stores have not reached their minimum order.');
  if(!c.feeKnown) {
    if(deliveryConfig?.enabled) { updateDeliveryView(); return toast('Get a fresh delivery quote.'); }
    return toast('Delivery charges are not available. Choose pickup or try again.');
  }
  if (CK.pay !== 'cod') return toast('Only cash payment is available.');
  const db = window.PAPALITA_DB;
  if (!db) return toast('Supabase is unavailable. Please try again.');
  const btn = $('#place'); btn.disabled = true; btn.firstElementChild.textContent = 'Placing orders…';
  const customer = S.user.id;
  const reviewedTotal=Number(btn.dataset.total??(c.total+CK.tip)), reviewedPromo=S.promo;
  const reviewedCart = checkoutCartStamp();
  try {
    const { data: auth, error: authError } = await db.auth.getUser();
    if (authError) throw authError;
    if (!customer || auth?.user?.id !== customer) throw new Error('Please sign in again before ordering.');
    const quote = !c.pickup && deliveryConfig?.enabled ? activeDeliveryQuote(a) : null;
    const address = c.pickup ? 'Pickup at store' : quote?.address ||
      `${a.label} — ${a.line}${a.landmark ? ' (' + a.landmark + ')' : ''}, ${a.city}`;
    await refreshCommercialData();
    if (!btn.isConnected || S.user.id !== customer || checkoutCartStamp() !== reviewedCart) {
      throw Error('Checkout changed. Review your order and try again.');
    }
    c=calc(S.cart, S.promo, barangay);
    if(c.perr||reviewedPromo!==S.promo||Math.abs(reviewedTotal-c.total-CK.tip)>.009){
      renderVoucherCheckout();
      throw Error(c.perr||'Charges or promotions changed. Review the updated total before ordering.');
    }
    if(!c.feeKnown || (!c.pickup && deliveryConfig?.enabled && (!quote || quote !== activeDeliveryQuote()))) {
      updateDeliveryView();
      throw Error('Get a fresh delivery quote before placing your order.');
    }
    let eligibleRunning=0, allocatedCents=0;
    const groups = c.groups.map((g, index) => {
      if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(g.rid))) throw new Error('Invalid store ID. Refresh the menu and retry.');
      const storeFee = c.storeFees.get(g.rid);
      let discount=0;
      if(c.disc&&promoMatchesStore(c.promo,g.rid)){
        if(c.promo.type==='ship')discount=storeFee;
        else{
          eligibleRunning+=g.sub;
          const runningCents=Math.round(c.disc*100*eligibleRunning/c.eligibleSub);
          discount=(runningCents-allocatedCents)/100;
          allocatedCents=runningCents;
        }
      }
      const tip = CK.fulfillment === 'pickup' ? 0 : (index === 0 ? (CK.tip || 0) : 0);
      return { store_id: g.rid, delivery_fee: storeFee, discount, tip,
        ...(quote ? {quote_id:quote.byStore.get(g.rid).id} : {}),
        items: g.lines.map(l => ({ product_id: l.itemId, quantity: l.qty, selected_options: l.sel || {}, special_instructions: l.note || '' })) };
    });
    const attempt = {customer,cart:reviewedCart,request:{
      p_checkout_id: crypto.randomUUID(), p_groups: groups, p_address: address, p_phone: phone,
      p_fulfillment: CK.fulfillment, p_payment_method: 'cod'
    }};
    const note = ($('#di')?.value || '').trim();
    savePendingCheckout(customer, attempt);
    const data = await sendCheckout(db, attempt);
    const createdAt = Date.now();
    const orders = groups.map((g, index) => {
      const group = c.groups[index], result = data[index];
      return { id: result.order_id, rid: g.store_id, items: group.lines.map(l => ({ ...l })),
        sub: Number(result.subtotal), fee: Number(result.delivery_fee), disc: g.discount,
        deliveryPricing:quote?.byStore.get(g.rid)?.details || null,
        total: Number(result.total_amount), tip: g.tip, promo: g.discount ? reviewedPromo : null,
        createdAt, source: 'supabase', status: 'pending', stage: 0, upd: createdAt, uid: auth.user.id,
        fulfillment: attempt.request.p_fulfillment, addr: address, note,
        contact: { name: S.user.name, phone }, pay: { method: 'cod', status: 'unpaid', source: 'supabase' } };
    });
    finishCheckout(attempt, orders);
  } catch (error) {
    console.error('[Papalita] Checkout failed:', error);
    if (S.user.id !== customer) return;
    if (pendingCheckout(customer)) {
      toast('Order status is unconfirmed. Retry the same checkout.');
      if (onCheckout()) render();
    } else {
      toast(error.message || 'Order not confirmed. Try again.');
      if (btn.isConnected) { btn.disabled = false; btn.firstElementChild.textContent = 'Place Order'; }
    }
  }
}

const ORD=id=>S.orders.find(o=>o.id===id&&o.uid===S.user.id&&o.source==='supabase');
const orderLines = o => o.items.map(l => `<div class="row sp sm" style="padding:5px 0"><span>${l.qty} × ${esc(l.name)}${selText(l) ? `<br><span class="mu">${esc(selText(l))}</span>` : ''}</span><span>${peso(l.unit * l.qty)}</span></div>`).join('');
const payTag = o => esc(o.pay?.method === 'cod'
  ? orderStatus.mode(o) === 'pickup' ? 'Cash at pickup'
    : orderStatus.mode(o) === 'delivery' ? 'Cash on Delivery' : 'Cash payment'
  : PAYNAME[o.pay?.method] || o.pay?.method || 'Payment method not supplied');
const orderLocationLabel = o => ({pickup: 'Pickup at', delivery: 'Deliver to'})[orderStatus.mode(o)] || 'Order location';
const orderLocation = o => orderStatus.mode(o) === 'pickup'
  ? R(o.rid)?.addr || R(o.rid)?.name || 'Collect at the store'
  : o.addr || 'Address on order';
const localMapAddress = address => /\bSurigao del Norte\b/i.test(address) ? address
  : address + (/\bAlegria\b/i.test(address) ? '' : ', Alegria') + ', Surigao del Norte';
function orderMapLink(order, fulfillment) {
  if (order.status === 'cancelled' || !['pickup','delivery'].includes(fulfillment)) return '';
  const store = R(order.rid);
  const place = fulfillment === 'pickup'
    ? [store?.name?.trim(),store?.addr?.trim()].filter(Boolean).join(', ')
    : String(order.addr || '').replace(/^.*? — /, '').trim();
  if (!place || place.toLowerCase() === 'pickup at store') return '';
  const destination = localMapAddress(place);
  const action = fulfillment === 'pickup' ? 'dir/?api=1&destination=' : 'search/?api=1&query=';
  const url = 'https://www.google.com/maps/' + action + encodeURIComponent(destination);
  return `<a class="btn s sm" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${ic('pin',16)}${fulfillment === 'pickup' ? 'Directions to store' : 'View drop-off map'}</a>`;
}
const liveOrderMapButton = order => `<button type="button" class="btn p sm" data-a="livemap" data-id="${esc(order.id)}">${ic('map',16)}Live delivery map</button>`;
const orderHelpLink = order => `<a class="btn s blk" href="#/support?order=${encodeURIComponent(order.id)}" style="margin-top:10px">${ic('help',16)}Need help with this order?</a>`;

function orderProgress(order) {
  const [title, detail, icon] = orderStatus.copy(order);
  const mode = orderStatus.mode(order);
  const status = orderStatus.status(order);
  const pickupReady = mode === 'pickup' && status === 'ready';
  const onTheWay = mode === 'delivery' && status === 'out_for_delivery';
  const store = pickupReady ? R(order.rid) : null;
  const address = store?.addr?.trim();
  return {
    pickupReady, onTheWay,
    html: `<section class="panel pp-order-status" aria-label="Order progress">
      <span class="pp-order-status-icon">${ic(icon,24)}</span>
      <div class="grow" style="min-width:0">
        <p class="pp-order-status-mode">${mode === 'pickup' ? 'Store pickup' : mode === 'delivery' ? 'Delivery' : 'Order status'}</p>
        <h2>${esc(title)}</h2>
        <p class="mu sm">${esc(detail)}</p>
        ${pickupReady ? `<p class="sm" style="margin-top:10px"><b>${esc(store?.name || 'Pickup location')}</b><br>
          ${esc(address || 'Confirm the pickup address with the store.')}</p>
          ${address ? `<div style="margin-top:10px">${orderMapLink(order, 'pickup')}</div>` : ''}` : ''}
        ${onTheWay ? `<p class="sm mu" style="margin:10px 0">Keep your phone nearby in case your rider needs directions.</p>
          ${liveOrderMapButton(order)}` : ''}
      </div>
    </section>`
  };
}
/* ---------- receipt ---------- */
const receiptDate = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila'
});
// Code 128 symbol widths, indexed by codeword. Bars and gaps alternate, starting with a bar.
const receiptBarcodeWidths = `
  212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212
  112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131
  311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321
  112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121
  313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111
  314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114
  122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212
  124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113
  114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112
`.trim().split(/\s+/);
function receiptBarcode(orderNumber) {
  if (typeof orderNumber !== 'string' || !/^[\x20-\x7e]{1,36}$/.test(orderNumber)) return '';
  const startB = 104;
  const data = Array.from(orderNumber, character => character.charCodeAt(0) - 32);
  const checksum = data.reduce((sum, code, i) => sum + code * (i + 1), startB) % 103;
  const quietZone = 10;
  let x = quietZone;
  let bars = '';
  for (const code of [startB, ...data, checksum, 106]) {
    for (const [i, digit] of Array.from(receiptBarcodeWidths[code]).entries()) {
      const width = Number(digit);
      if (i % 2 === 0) bars += `M${x} 0h${width}v42h-${width}z`;
      x += width;
    }
  }
  return `<svg class="pp-receipt-barcode" aria-hidden="true" viewBox="0 0 ${x + quietZone} 42" preserveAspectRatio="none"><path fill="currentColor" d="${bars}"></path></svg>`;
}
function receiptHTML(o, animate = false) {
  const store = R(o.rid);
  const promo = o.promo && window.PROMOS.find(p => p.code === o.promo);
  const freeDelivery = o.disc && promo?.type === 'ship';
  const deliveryFee = freeDelivery ? 'Free' : o.fee == null ? 'Not supplied' : peso(o.fee);
  const paymentStatus = o.pay?.status === 'paid' ? 'Payment recorded'
    : o.pay?.method === 'cod' ? '' : 'Payment not confirmed';
  const placed = new Date(o.createdAt);
  const placedHTML = Number.isFinite(placed.getTime())
    ? `<time class="pp-receipt-date" datetime="${placed.toISOString()}">${receiptDate.format(placed)}</time>`
    : '';
  const items = o.items.map(line => {
    const options = selText(line);
    return `<tr>
      <td class="pp-receipt-qty">${esc(line.qty)}</td>
      <th scope="row">${esc(line.name)}${options ? `<small class="pp-receipt-options">${esc(options)}</small>` : ''}</th>
      <td class="pp-receipt-amount">${peso(line.unit * line.qty)}</td>
    </tr>`;
  }).join('');
  return `<div class="pp-receipt-frame"><article class="pp-receipt${animate ? ' pp-receipt-enter' : ''}" aria-label="Order receipt">
    <header class="pp-receipt-head">
      <p class="pp-receipt-brand">PAPALITA</p>
      <p class="pp-receipt-store">${esc(store?.name || 'Store')}</p>
      <h2><span aria-hidden="true">*** </span>Order receipt<span aria-hidden="true"> ***</span></h2>
      ${placedHTML}
      <dl class="pp-receipt-ref"><dt>Order number</dt><dd>${esc(o.id)}</dd></dl>
      ${orderStatus.status(o) === 'cancelled' ? '<p class="pp-receipt-cancelled">Order cancelled</p>' : ''}
    </header>
    <div class="pp-receipt-body">
      <table class="pp-receipt-items">
        <thead><tr><th scope="col" class="pp-receipt-qty">Qty</th><th scope="col">Item</th><th scope="col" class="pp-receipt-amount">Amount</th></tr></thead>
        <tbody>${items || '<tr><td colspan="3">Item details unavailable</td></tr>'}</tbody>
      </table>
      <dl class="pp-receipt-totals">
        <div><dt>Subtotal</dt><dd>${peso(o.sub)}</dd></div>
        ${orderStatus.mode(o) === 'pickup' ? '' : `<div><dt>Delivery fee</dt><dd>${deliveryFee}</dd></div>`}
        ${o.disc && !freeDelivery ? `<div class="pp-receipt-discount"><dt>Discount${promo?.code ? ' (' + esc(promo.code) + ')' : ''}</dt><dd>−${peso(o.disc)}</dd></div>` : ''}
        ${o.tip ? `<div><dt>Rider tip</dt><dd>${peso(o.tip)}</dd></div>` : ''}
        <div class="pp-receipt-total"><dt>Total</dt><dd>${peso(o.total)}</dd></div>
      </dl>
      <dl class="pp-receipt-meta">
        <div><dt>Payment</dt><dd>${payTag(o)}${paymentStatus ? `<small class="pp-receipt-options">${paymentStatus}</small>` : ''}</dd></div>
        <div><dt>${orderLocationLabel(o)}</dt><dd>${esc(orderLocation(o))}</dd></div>
        ${o.note ? `<div><dt>Order note</dt><dd>${esc(o.note)}</dd></div>` : ''}
      </dl>
      <footer class="pp-receipt-end">
        ${receiptBarcode(o.id)}
        <p class="pp-receipt-footer">Ask the store for a tax invoice.</p>
      </footer>
    </div>
  </article></div>`;
}
V.confirmation = id => { const o = ORD(id); if (!o) return V.notFound();
  return { html: `<section class="view" style="max-width:520px;margin:0 auto;text-align:center"><div class="okh"><span class="okc">${ic('check', 40)}</span><h1>Order placed!</h1><p class="mu">The store will review your order.</p></div>${receiptHTML(o, !calmMotion())}
  <div class="row" style="margin-top:22px"><button class="btn s grow" data-a="printrcpt" data-id="${o.id}">${ic('copy', 16)}Save receipt</button><button class="btn p grow" data-a="gotrack" data-id="${o.id}">${ic(orderStatus.mode(o)==='pickup'?'store':'orders',18)}${orderStatus.mode(o)==='pickup'?'Track pickup':'Track order'}</button></div><button class="btn o blk" style="margin-top:10px" data-a="home">Back home</button></section>` }; };
/* ---------- motion: fly to cart ---------- */
const calmMotion = () => window.PapalitaMotion?.stopped() || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function cartTarget() { for (const el of [$('.bnav a[href="#/cart"]'), $('.topbar a[href="#/cart"]')]) { if (el) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) return { r, el }; } } return null; }
function pulseCart() { holdCart = false; updateChrome(true); const t = cartTarget(); if (t) { t.el.classList.remove('cshake'); void t.el.offsetWidth; t.el.classList.add('cshake'); } }
function flyTo(fx) { if (!fx || !document.body.animate || calmMotion()) return pulseCart(); const t = cartTarget(); if (!t || !fx.rect || !fx.rect.width) return pulseCart();
  const size = 58, x0 = fx.rect.left + fx.rect.width / 2 - size / 2, y0 = fx.rect.top + fx.rect.height / 2 - size / 2, x1 = t.r.left + t.r.width / 2 - size / 2, y1 = t.r.top + t.r.height / 2 - size / 2, dx = x1 - x0, dy = y1 - y0;
  const el = document.createElement('div'); el.className = 'fly'; const u = window.photoUrl(fx.img, 120); if (u) el.style.backgroundImage = `url("${u}")`; else el.innerHTML = ic('plus', 26); el.style.left = x0 + 'px'; el.style.top = y0 + 'px'; document.body.append(el);
  if (!el.animate) { el.remove(); return pulseCart(); }
  holdCart = true;
  const a = el.animate([{ transform: 'translate(0,0) scale(.9)', opacity: 1 }, { transform: `translate(${dx * .5}px,${Math.min(dy, 0) - 40 - Math.abs(dy) * .25}px) scale(1.08) rotate(-8deg)`, opacity: 1, offset: .45 }, { transform: `translate(${dx}px,${dy}px) scale(.28) rotate(8deg)`, opacity: .8 }], { duration: 800, easing: 'cubic-bezier(.45,.05,.35,1)' });
  const done = () => { el.remove(); pulseCart(); }; a.onfinish = done; setTimeout(() => { if (el.isConnected || holdCart) done(); }, 1500); }
function tickBtn(b) { if (!b || !b.isConnected) return; const html = b.innerHTML; b.classList.add('pop'); b.innerHTML = ic('check', 18) + (b.classList.contains('addp') ? 'Added' : ''); setTimeout(() => { if (b.isConnected) { b.classList.remove('pop'); b.innerHTML = html; } }, 900); }
function printReceipt(id) { const o = ORD(id); if (!o) return; const old = $('#print-root'); old && old.remove(); const d = document.createElement('div'); d.id = 'print-root'; d.innerHTML = receiptHTML(o, false); document.body.append(d); document.body.classList.add('printing'); try { window.print(); } catch (e) { toast('Printing is not available here.'); } setTimeout(() => { document.body.classList.remove('printing'); d.remove(); }, 800); }

/* ---------- tracking ---------- */

async function fetchCustomerOrder(db,id,uid) {
  const result=await db.from('orders').select('*').eq('id',id).eq('customer_id',uid).maybeSingle();
  if(result.error)throw result.error;
  const row=result.data;if(!row||row.customer_id!==uid)throw Error('This order is unavailable for your account.');
  const items=await db.from('order_items').select('product_id,product_name,quantity,unit_price,selected_options,special_instructions').eq('order_id',id);
  if(items.error)throw items.error;
  const order={id:row.id,rid:row.store_id,total:Number(row.total_amount)||0,
    status:row.status,fulfillment:orderStatus.mode(row),source:'supabase',uid,createdAt:Date.parse(row.created_at)||Date.now(),
    upd:Date.parse(row.updated_at)||Date.now(),addr:row.delivery_address||'',
    contact:{name:row.customer_name||S.user.name,phone:row.contact_number||''},
    pay:{method:row.payment_method||'cod',status:row.payment_status||'unpaid',source:'supabase'},
    items:(items.data||[]).map(i=>({itemId:i.product_id,name:i.product_name,qty:Number(i.quantity)||0,
      unit:Number(i.unit_price)||0,sel:i.selected_options||{},note:i.special_instructions||'',
      img:ITEM(i.product_id)?.item.img||''}))};
  order.sub=order.items.reduce((n,i)=>n+i.unit*i.qty,0);
  order.fee=row.delivery_fee==null?null:Number(row.delivery_fee);
  order.deliveryPricing=row.delivery_pricing || null;
  order.disc=Number(row.discount_amount??row.discount)||0;
  order.tip=Number(row.tip)||0;
  return order;
}

// A push link can refer to a real order that has not been cached on this device.
function linkedOrderView(id) {
  return {html:`<section class="view"><div class="panel" id="linked-order-state" role="status"><h2>Loading your order…</h2><p class="mu sm">Checking the latest details with Papalita.</p></div></section>`,after:async()=>{
    try {
      const auth=await authDB().auth.getUser();
      if(auth.error||!auth.data?.user)throw Error('Please sign in to view this order.');
      const uid=auth.data.user.id;
      const order=await fetchCustomerOrder(authDB(),id,uid);
      if(S.user.id!==uid||!S.user.in)return;
      const old=S.orders.findIndex(o=>String(o.id)===String(order.id));
      if(old<0)S.orders.push(order);else S.orders[old]=order;save();
      if(curPath()==='/track/'+id)render();
    } catch(error) {
      const target=document.getElementById('linked-order-state');
      if(target&&curPath()==='/track/'+id)target.innerHTML=`<h2>Could not load this order</h2><p class="mu sm">${esc(error.message||'Check your connection and try again.')}</p><button class="btn s" data-a="reload" style="margin-top:16px">Try again</button>`;
    }
  }};
}

function watchCustomerOrder(order, selector, make) {
  const route = curPath();
  let busy = false;
  const sync = async () => {
    if (busy || curPath() !== route || !S.user.in || ORD(order.id) !== order) return;
    const db = window.PAPALITA_DB;
    if (!db) return;
    const previous = {status:order.status, fulfillment:order.fulfillment, upd:order.upd};
    busy = true;
    try {
      const {data,error} = await db.from('orders').select('id,status,fulfillment_type,updated_at')
        .eq('id',order.id).eq('customer_id',order.uid).single();
      if (error) throw error;
      if (!data || curPath() !== route || !S.user.in || ORD(order.id) !== order ||
        order.status !== previous.status || order.fulfillment !== previous.fulfillment || order.upd !== previous.upd) return;
      const fulfillment = data.fulfillment_type || order.fulfillment;
      if (data.status === order.status && fulfillment === order.fulfillment) return;
      order.status = data.status;
      order.fulfillment = fulfillment;
      order.upd = Date.parse(data.updated_at) || Date.now();
      save();
      const view = $(selector);
      if (view) view.innerHTML = make();
      updateChrome();
    } catch (error) {
      console.warn('[Papalita] Order status refresh:',error.message);
    } finally {
      busy = false;
    }
  };
  sync();
  if (isCurrent(order)) timers.push(setInterval(sync,5000));
}

V.track = id => {
  const o = ORD(id);
  if (!o) return linkedOrderView(id);
  const make = () => {
    const statuses = orderStatus.timeline(o);
    const idx = statuses.findIndex(([key]) => key === orderStatus.status(o));
    const fulfillment = orderStatus.mode(o);
    const progress = orderProgress(o);
    return `${pageHead(fulfillment === 'pickup' ? 'Track pickup' : 'Track order', true)}
      ${progress.html}
      ${idx >= 0 ? `<div class="panel"><ol class="tl">${statuses.map(([,title],i)=>
        `<li class="${i<=idx?'done':''} ${i===idx?'cur':''}"${i===idx?' aria-current="step"':''}>
          <span class="b">${ic(i<idx?'check':'clock',16)}</span><b>${esc(title)}</b></li>`).join('')}
      </ol></div>` : ''}
      <div class="panel">${progress.pickupReady ? '' : `<div class="row sp wrap" style="margin-bottom:10px">
        <div><b>${orderLocationLabel(o)}</b><p>${esc(orderLocation(o))}</p></div>
        <div class="row wrap">${orderMapLink(o,fulfillment)}
          ${fulfillment === 'delivery' && isCurrent(o) && !progress.onTheWay ? liveOrderMapButton(o) : ''}</div>
      </div>`}
      <div class="row sp"><b>Total</b><b>${peso(o.total)}</b></div></div>
      ${orderHelpLink(o)}`;
  };
  return {
    html: `<section class="view" id="trk">${make()}</section>`,
    after: () => watchCustomerOrder(o, '#trk', make)
  };
};

function reorder(o) { const lines = []; o.items.forEach(l => { const x = ITEM(l.itemId); if (x && x.item.available) lines.push({ ...l, key: uid('l'), unit: unitPrice(x.item, l.sel) }); }); if (!lines.length) return toast('Those items are no longer available.'); if(!R(o.rid)||!isOpen(R(o.rid)))return toast('This store is not accepting orders right now.');
  const go = () => { S.cart = { rid: o.rid, lines: lines.map(l => ({...l, rid: o.rid})) }; save(); updateChrome(true); nav('/cart'); }; S.cart.lines.length && S.cart.rid !== o.rid ? confirmDlg('Replace your current cart with this order?', 'Replace cart').then(ok => ok && go()) : go(); }
let OT='current';
V.ordersView = (_, p) => { if (p && p.get('t')) OT = p.get('t'); const cur = myOrders().filter(isCurrent), hist = myOrders().filter(o => !isCurrent(o)), list = OT === 'current' ? cur : hist;
  const card = o => { const s = stageOf(o), r=R(o.rid)||{name:'Store'}, st = orderStatus.copy(o)[0], cancellable = canCancelOrder(o);
    return `<div class="panel" tabindex="0" role="link" style="cursor:pointer${cancellable ? ';-webkit-user-select:none;user-select:none;-webkit-touch-callout:none' : ''}" data-a="odetail" data-id="${o.id}"${cancellable ? ' data-order-cancel-gesture' : ''}><div class="row">${`<div style="width:64px">${photo(o.items[0]?.img, o.items[0]?.name||'Order', { ar: '1', w: 200 }).replace('class="ph', 'style="border-radius:14px" class="ph')}</div>`}<div class="grow"><div class="row sp"><h3>${esc(r.name)}</h3><span class="status ${s < 0 ? 'closed' : s === 5 ? 'open' : 'n'}">${st}</span></div><p class="mu sm">${o.id} · ${new Date(o.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} · ${o.items.reduce((a, l) => a + l.qty, 0)} items</p><b>${peso(o.total)}</b></div></div>
    <div class="row" style="margin-top:12px">${isCurrent(o) ? `<button class="btn p sm grow" data-a="gotrack" data-id="${o.id}">${ic(orderStatus.mode(o)==='pickup'?'store':'orders',16)}Track</button>` : `<button class="btn p sm grow" data-a="reorder" data-id="${o.id}">Reorder</button>`}<button class="btn s sm grow" data-a="odetail" data-id="${o.id}">Details</button>${cancellable ? '<button type="button" class="btn s sm" data-a="orderoptions" aria-label="Order options" aria-expanded="false" style="width:44px;min-height:44px;padding:0;font-size:22px">&hellip;</button>' : ''}</div>
    ${cancellable ? `<div data-order-cancel-action hidden style="margin-top:8px;text-align:right"><button type="button" class="btn d sm" data-a="cancel" data-id="${o.id}">Cancel order</button></div>` : ''}</div>`; };
  return { html: `<section class="view">${pageHead('Orders', false)}<div class="chips" role="tablist" style="margin-bottom:14px">${[['current', `Current (${cur.length})`], ['history', 'History'], ['catering', `Catering (${myCater().length})`]].map(([k, l]) => `<button class="chip ${OT === k ? 'on' : ''}" role="tab" aria-selected="${OT === k}" data-a="otab" data-v="${k}">${l}</button>`).join('')}</div>
  ${OT === 'current' && cur.some(canCancelOrder) ? '<p class="sm mu" style="margin-bottom:12px">Press and hold an order or tap &hellip; for order options.</p>' : ''}
  ${OT === 'catering' ? cateringList() : list.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,360px),1fr))">${list.map(card).join('')}</div>` : emptyState('orders', OT === 'current' ? 'No active orders' : 'No past orders yet', 'Your orders will appear here.', 'Order food', 'browse')}</section>` }; };
V.orderDetail = id => {
  const o = ORD(id);
  if (!o) return V.notFound();
  const make = () => {
    const progress = orderProgress(o);
    const store = R(o.rid);
    return `${pageHead('Order details')}
  ${progress.html}
  <article class="panel pp-order-paper" aria-label="Order summary">
    <header class="pp-order-paper-head">
      <div><p class="pp-paper-label">Order summary</p><h2>${esc(store?.name || 'Store')}</h2><p class="pp-order-ref">${esc(o.id)}</p><p class="mu sm">${new Date(o.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</p></div>
    </header>
    ${o.cancelReason ? `<p class="sm" style="color:var(--er);margin-top:8px">${esc(o.cancelReason)}</p>` : ''}
    <div class="pp-order-paper-lines">${orderLines(o)}<div style="margin-top:10px">${sumHTML({ ...o, promo: o.promo && window.PROMOS.find(p => p.code === o.promo), perr: '', vat: (o.total - (o.tip || 0)) * 12 / 112 })}</div></div>
    <dl class="pp-order-paper-meta sm">${progress.pickupReady ? '' : `<div><dt>${orderLocationLabel(o)}</dt><dd>${esc(orderLocation(o))}</dd></div>`}<div><dt>Payment</dt><dd>${payTag(o)}</dd></div></dl>
  </article>
  <div class="row pp-order-actions">${isCurrent(o) ? `<button class="btn p grow" data-a="gotrack" data-id="${esc(o.id)}">${orderStatus.mode(o) === 'pickup' ? 'Track pickup' : 'Track order'}</button>` : `<button class="btn p grow" data-a="reorder" data-id="${esc(o.id)}">Reorder</button>`}${canCancelOrder(o) ? `<button class="btn d grow" data-a="cancel" data-id="${esc(o.id)}">Cancel order</button>` : ''}</div>
  <button class="btn s blk" data-a="receipt" data-id="${esc(o.id)}">${ic('copy', 16)}View receipt</button>
  ${orderHelpLink(o)}`;
  };
  return {
    html: `<section class="view pp-order-detail" id="order-details">${make()}</section>`,
    after: () => watchCustomerOrder(o, '#order-details', make)
  };
};

/* ---------- promos ---------- */
V.promos = () => ({ html: `<section class="view pp-promotions" style="max-width:680px;margin:0 auto">${pageHead('Promotions')}${!window.PROMOS.length?emptyState('ticket','No current offers','Approved promotions will appear here when available.'):''}${window.PROMOS.filter(p => p.active !== false).map(p => { const exp=p.expires_at&&Date.parse(p.expires_at)<=Date.now(), on = S.promo === p.code;
  return `<div class="panel pp-paper-ticket pp-promo-ticket"><div class="row sp wrap pp-promo-ticket-head"><div class="grow"><p class="pp-paper-label">${esc(p.title)}</p><h3>${esc(voucherTitle(p))}</h3>${p.desc ? `<p class="mu sm">${esc(p.desc)}</p>` : ''}</div><span class="pp-promo-code">${ic('ticket',16)}${esc(p.code)}</span></div>
  <ul class="sm mu" style="margin:10px 0 12px 18px"><li>Minimum order ${peso(p.min)}</li><li>${p.rid ? 'Valid at ' + esc(R(p.rid).name) + ' only' : 'Valid at all restaurants'}</li><li>${exp ? 'Expired' : 'Expires ' + new Date(p.exp + 'T00:00:00+08:00').toLocaleDateString('en-PH', { dateStyle: 'long' })}</li></ul>
  ${exp ? '' : `<p class="pp-voucher-progress">${esc(voucherProgress(p))}</p>`}
  <div class="row"><button class="btn ${on ? 's' : 'p'} sm grow" data-a="usepromo" data-id="${p.code}" ${exp ? 'disabled' : ''}>${on ? 'Applied ✓' : 'Apply promo'}</button><button class="btn o sm" data-a="copy" data-id="${p.code}" aria-label="Copy code ${esc(p.code)}">${ic('copy', 16)}Copy</button></div></div>`; }).join('')}</section>` });

/* ---------- profile & account ---------- */
const row = (i, t, s, a, extra = '') => `<button class="li" data-a="${a}"><span class="ic">${ic(i, 20)}</span><span class="grow"><b>${t}</b>${s ? `<br><span class="sm mu">${s}</span>` : ''}</span>${extra}${ic('chev', 18, 'mu')}</button>`;
V.profile = () => ({ html: `<section class="view" style="max-width:680px;margin:0 auto">${pageHead('Profile', false)}<div class="panel row">${avatar()}<div class="grow"><h2>${esc(S.user.name)}</h2><p class="mu sm">${esc(S.user.email)}${S.user.phone ? ' · ' + esc(S.user.phone) : ''}</p></div><button class="btn s sm" data-a="go" data-id="/profile/edit">Edit</button></div>
  <div class="panel" style="padding:4px 16px">${row('pin', 'Saved addresses', S.addrs.length + ' saved', 'go2', '').replace('data-a="go2"', 'data-a="go" data-id="/addresses"')}${[['orders', 'My orders', myOrders().filter(isCurrent).length + ' active', '/orders'], ['box', 'Catering requests', myCater().length + ' sent', '/orders?t=catering'], ['nav', 'Store locations', 'Supplied store addresses', '/nearby'], ['card', 'Payment methods', 'Cash payment', '/payments'], ['heart', 'Favorites', S.fav.items.length + S.fav.rests.length + ' saved', '/favorites'], ['ticket', 'Promotions', 'Discounts and codes', '/promos'], ['bell', 'Notifications', unread() ? unread() + ' unread' : 'All caught up', '/notifications'], ['help', 'Support', 'FAQs and contact', '/support']].map(([i, t, s, p]) => row(i, t, s, 'go').replace('data-a="go"', `data-a="go" data-id="${p}"`)).join('')}</div>
  <div class="panel" style="padding:4px 16px"><div class="li"><span class="ic">${ic('bike',20)}</span><span class="grow"><b>Order updates</b><br><span class="sm mu">Open an order to check its recorded status.</span></span></div><button class="li" data-a="pwchange"><span class="ic">${ic('shield', 20)}</span><span class="grow"><b>Change password</b></span>${ic('chev', 18, 'mu')}</button><button class="li" data-a="delacct" style="color:var(--er)"><span class="ic" style="background:#FEECEA;color:var(--er)">${ic('trash', 20)}</span><b>Delete account</b></button><button class="li" data-a="logout" style="color:var(--er)"><span class="ic" style="background:#FEECEA;color:var(--er)">${ic('logout', 20)}</span><b>Log out</b></button></div><footer class="sm mu" style="margin-top:20px;text-align:center">Papalita &middot; Version ${APP_VERSION}</footer></section>` });
V.editProfile = () => ({ html: `<section class="view" style="max-width:560px;margin:0 auto">${pageHead('Edit profile')}<form id="pf" class="panel" novalidate><div class="row" style="margin-bottom:16px">${avatar()}<label class="btn s sm" style="cursor:pointer">Change photo (this device)<input type="file" id="pimg" accept="image/*" class="sr"></label></div><div class="field"><label for="pn">Name</label><input class="in" id="pn" value="${esc(S.user.name)}"><p class="err" data-e="pn"></p></div><div class="field"><label for="pe">Email</label><input class="in" id="pe" type="email" value="${esc(S.user.email)}"><p class="err" data-e="pe"></p></div><div class="field"><label for="pp">Mobile number</label><input class="in" id="pp" value="${esc(S.user.phone || '')}"><p class="err" data-e="pp"></p></div><button class="btn p blk">Save changes</button></form></section>` });
V.addresses = () => ({ html: `<section class="view" style="max-width:680px;margin:0 auto">${pageHead('Saved addresses', true, `<button class="btn p sm" data-a="addrform">${ic('plus', 16)}Add</button>`)}${S.addrs.length ? S.addrs.map(a => `<div class="panel"><div class="row sp"><div><h3>${esc(a.label)} ${a.def ? '<span class="status open">Default</span>' : ''}</h3><p class="mu sm">${esc(a.line)}, ${esc(a.city)}</p></div></div><div class="row" style="margin-top:10px"><button class="btn s sm" data-a="addrform" data-id="${a.id}">Edit</button>${a.def ? '' : `<button class="btn s sm" data-a="addrdef" data-id="${a.id}">Make default</button>`}<button class="btn d sm" data-a="addrdel" data-id="${a.id}">Delete</button></div></div>`).join('') : emptyState('pin', 'No saved addresses', 'Add one for faster checkout.', 'Add address', 'addrform')}</section>` });
function addrForm(id) { const a = S.addrs.find(x => x.id === id) || { label: '', line: '', city: '' };
  const el = openSheet(`<form class="pd" style="padding-top:34px" novalidate><h2 style="margin-bottom:14px">${id ? 'Edit' : 'Add'} address</h2><div class="field"><label for="fl">Label</label><input class="in" id="fl" value="${esc(a.label)}" maxlength="20" placeholder="Home, Work…"><p class="err" data-e="fl"></p></div><div class="field"><label for="fs">Purok, street or building</label><input class="in" id="fs" value="${esc(a.line)}"><p class="err" data-e="fs"></p></div><div class="field"><label for="fc">Barangay</label><select class="in" id="fc">${window.BRGYS.map(b => `<option value="${b.n}, Alegria" ${a.city === b.n + ', Alegria' || (!a.city && b.n === S.loc.brgy) ? 'selected' : ''}>${b.n}</option>`).join('')}</select><p class="err" data-e="fc"></p></div><div class="field" data-delivery-area hidden style="display:none"><label for="fa">Purok or sitio</label><select class="in" id="fa"></select><p class="err" data-e="fa"></p></div><div class="field"><label for="fk">Landmark (optional)</label><input class="in" id="fk" value="${esc(a.landmark || '')}" maxlength="80" placeholder="Near the chapel, blue gate…"></div><button class="btn p blk">Save address</button></form>`, { label: 'Address' });
  const areaField = $('[data-delivery-area]',el), areaSelect = $('#fa',el);
  let areaRequired = false;
  const setAreas = selected => {
    areaRequired = deliveryConfig?.enabled === true;
    areaField.hidden = !areaRequired;
    areaField.style.display = areaRequired ? '' : 'none';
    if (!areaRequired) return;
    const barangay = $('#fc',el).value.split(',')[0];
    const areas = deliveryConfig.areas.filter(area => area.barangay === barangay);
    areaSelect.innerHTML = '<option value="">Choose a purok or sitio</option>' +
      areas.map(area => `<option value="${esc(area.id)}">${esc(area.name)}</option>`).join('');
    if (areas.some(area => area.id === selected)) areaSelect.value = selected;
    if (!areas.length) $('[data-e="fa"]',el).textContent = 'Delivery is not configured for this barangay.';
    else $('[data-e="fa"]',el).textContent = '';
  };
  setAreas(a.areaId);
  $('#fc',el).addEventListener('change',()=>setAreas(null));
  if (!deliveryConfig) void loadDeliveryConfig().then(()=>{if(el.isConnected)setAreas(a.areaId);}).catch(()=>{});
  $('form', el).onsubmit = e => { e.preventDefault(); const v = k => $('#' + k, el).value.trim(), er = {}; if (!v('fl')) er.fl = 'Give it a name.'; if (v('fs').length < 5) er.fs = 'Enter a street or building.'; if (!v('fc')) er.fc = 'Choose your barangay.'; if (areaRequired && !v('fa')) er.fa = 'Choose a supported purok or sitio.';
    $$('[data-e]', el).forEach(x => x.textContent = ''); const k = Object.keys(er); if (k.length) { k.forEach(x => $(`[data-e=${x}]`, el).textContent = er[x]); return $('#' + k[0], el).focus(); }
    const address = {label:v('fl'),line:v('fs').slice(0,180),city:v('fc'),landmark:v('fk'),areaId:areaRequired ? v('fa') : a.areaId};
    if (selectedPin?.addressId === a.id) selectedPin = null;
    deliveryMessage = '';
    if (id) { Object.assign(a,address); if (a.def) syncLoc(a); } else { const n = {id:uid('a'),...address,def:true}; S.addrs.forEach(x => x.def = false); S.addrs.push(n); CK.addr = n.id; syncLoc(n); } save(); closeSheet(); toast('Address saved.'); updateChrome(); render(); };
}
let FT='items';
V.favorites = () => { const its = S.fav.items.map(ITEM).filter(Boolean), rs = S.fav.rests.map(R).filter(Boolean);
  return { html: `<section class="view">${pageHead('Favorites')}<div class="chips" style="margin-bottom:14px">${[['items', 'Dishes'], ['rests', 'Restaurants']].map(([k, l]) => `<button class="chip ${FT === k ? 'on' : ''}" data-a="ftb" data-v="${k}">${l}</button>`).join('')}</div>${(FT === 'items' ? its : rs).length ? `<div class="grid">${FT === 'items' ? its.map(dishCard).join('') : rs.map(restCard).join('')}</div>` : emptyState('heart', 'No favorites yet', 'Tap the heart on any dish or restaurant to save it.', 'Explore food', 'browse')}</section>` }; };
let NT = 'all';
V.notifications = () => { const l = myNotes().filter(n => NT === 'all' || n.type === NT), tm = t => { const m = Math.round((Date.now() - t) / 6e4); return m < 1 ? 'Just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
  return { html: `<section class="view" style="max-width:680px;margin:0 auto">${pageHead('Notifications', true, `<button class="btn s sm" data-a="readall" ${unread() ? '' : 'disabled'}>Mark all read</button>`)}<div class="chips" style="margin-bottom:14px">${[['all', 'All'], ['order', 'Orders'], ['promo', 'Promotions'], ['account', 'Account']].map(([k, t]) => `<button class="chip ${NT === k ? 'on' : ''}" data-a="ntab" data-v="${k}">${t}</button>`).join('')}</div>
  ${l.length ? l.map(n => `<button class="panel row" style="width:100%;text-align:left;${n.read ? '' : 'background:var(--or-s);border-color:#FFD2A8'}" data-a="nopen" data-id="${n.id}"><span class="ic" style="width:42px;height:42px;border-radius:14px;background:#fff;color:var(--or);display:grid;place-items:center;flex:none">${ic(n.type === 'order' ? 'bike' : n.type === 'promo' ? 'ticket' : 'user', 20)}</span><span class="grow"><b>${esc(n.t)}</b><br><span class="sm mu">${esc(n.b)}</span><br><span class="sm mu">${tm(n.at)}</span></span>${n.read ? '' : '<i style="width:10px;height:10px;border-radius:50%;background:var(--or)" aria-label="Unread"></i>'}</button>`).join('') : emptyState('bell', 'Nothing here', 'We will let you know when something changes.')}</section>` }; };
V.categories = () => ({ html: `<section class="view">${pageHead('All categories')}<div class="grid">${CATS.map(c => `<button class="card" data-a="cat" data-id="${c.id}" style="text-align:left">${photo(c.img, c.name, { w: 500 })}<div class="bd"><div class="nm"><span>${c.name}</span>${ic('chev', 18, 'mu')}</div><div class="meta">${ALL().filter(x => x.item.cat === c.id).length} dishes</div></div></button>`).join('')}</div></section>` });
/* ---------- Supabase customer account ---------- */
const clearSession=()=>{try{sessionStorage.removeItem('foodie.alegria.session');localStorage.removeItem('foodie.alegria.session');}catch{}};
const normPhone=p=>{p=String(p||'').replace(/[\s-]/g,'');return p.startsWith('+63')?'0'+p.slice(3):p;};
const pwOk=p=>p.length>=8&&/[A-Za-z]/.test(p)&&/\d/.test(p);
const pwScore=p=>Number(p.length>=8)+Number(/[a-z]/.test(p)&&/[A-Z]/.test(p))+Number(/\d/.test(p))+Number(/[^A-Za-z0-9]/.test(p)||p.length>=12);
const BUCKET = ['fav', 'addrs', 'pay', 'cart', 'promo', 'loc', 'recent'];
const freshBucket = brgy => ({ fav: { items: [], rests: [] }, addrs: [], pay: [], cart: { rid: null, lines: [] }, promo: null, recent: [], loc: { label: (brgy || 'Poblacion') + ', Alegria', brgy: brgy || 'Poblacion', perm: 'unknown' } });
function stashUser() { if (!S.user || !S.user.id) return; (S.users = S.users || {})[S.user.id] = Object.assign(Object.fromEntries(BUCKET.map(k => [k, S[k]])), { prof: { name: S.user.name, email: S.user.email, phone: S.user.phone, photo: S.user.photo || '' } }); }
function adoptUser(acc) { S.users = S.users || {}; const b = S.users[acc.id] || {}, f = freshBucket(acc.brgy); BUCKET.forEach(k => S[k] = b[k] !== undefined ? b[k] : f[k]); const p = b.prof || {}; S.user = { id: acc.id, name: p.name || acc.name, email: p.email ?? acc.email ?? '', phone: p.phone || acc.phone, photo: p.photo || '', in: false }; }
const own=x=>realId(S.user.id)&&x.uid===S.user.id;
const myOrders=()=>S.orders.filter(o=>own(o)&&o.source==='supabase'), myNotes = () => S.notes.filter(own), myCater = () => (S.cater || []).filter(own);

let AU={view:'login',prefill:'',busy:false,googleError:''};
let pendingPolicyUser = null;
let pendingGoogleProfile = null;
const googleAttemptKey = 'papalita.customer-google-attempt';
const authHead = (title, intro) => `<header class="pp-auth-heading">
  <div class="pp-auth-lockup">
    <img src="images/papalita_mark_white.png" alt="" width="256" height="350">
    <div><b>PAPALITA</b><span>Good Food, Good Mood.</span></div>
  </div>
  <h1>${title}</h1><p>${intro}</p>
</header>`;
const pwField = (id, label, auto, extra = '') => `<div class="field"><label for="${id}">${label}</label><div class="pw"><input class="in" id="${id}" type="password" autocomplete="${auto}">${`<button type="button" class="pwt" data-a="pwtoggle" data-id="${id}" aria-label="Show password">${ic('eye', 20)}</button>`}</div>${extra}<p class="err" data-e="${id}"></p></div>`;
const meterHTML = id => `<div class="meter" data-m="${id}" aria-hidden="true"><i></i><i></i><i></i><i></i></div><p class="sm mu" data-mt="${id}">Use 8+ characters with letters and numbers.</p>`;
const policyConsent = () => `<div class="pp-auth-consent">
  <label class="pp-auth-consent-choice" for="rt"><input type="checkbox" id="rt" aria-describedby="rt-error"><span>I agree to the Terms and acknowledge the Privacy Policy</span></label>
  <button type="button" class="link gl" data-a="terms">Read Terms &amp; Privacy</button>
</div><p class="err" id="rt-error" data-e="rt" role="alert"></p>`;
const policySubmit = label => `<button type="submit" class="btn p blk" data-policy-submit disabled style="margin-top:10px">${label}</button>`;
const googleButton = submit => `<button type="${submit ? 'submit' : 'button'}" class="btn o blk pp-auth-google" ${submit ? '' : 'data-a="google-login"'} data-policy-submit disabled>
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5.4c-.2 1.2-.9 2.2-2 2.9v2.4h3.2c1.9-1.7 3-4.1 3-7Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.4c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.8-5.6-4.1H3.1v2.5A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-4V7.5H3.1a10 10 0 0 0 0 9l3.3-2.5Z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A9.5 9.5 0 0 0 12 2a10 10 0 0 0-8.9 5.5L6.4 10A6 6 0 0 1 12 5.9Z"/></svg>
  Continue with Google</button>`;
const googleNotice = () => `<p class="err" data-e="google" role="alert">${esc(AU.googleError)}</p>`;
const googleFields = (draft = {}) => `
  <div class="field"><label for="gn">Full name</label><input class="in" id="gn" autocomplete="name" maxlength="60" value="${esc(draft.name || '')}"><p class="err" data-e="gn"></p></div>
  <div class="field"><label for="gm">Mobile number</label><input class="in" id="gm" inputmode="tel" autocomplete="tel" placeholder="09XXXXXXXXX" value="${esc(draft.phone || '')}"><p class="err" data-e="gm"></p></div>
  <div class="field"><label for="gb">Barangay</label><select class="in" id="gb"><option value="">Choose your barangay</option>${window.BRGYS.map(b => `<option ${b.n === draft.barangay ? 'selected' : ''}>${esc(b.n)}</option>`).join('')}</select><p class="err" data-e="gb"></p></div>
  <div class="field"><label for="ga">Purok, street or building</label><input class="in" id="ga" autocomplete="address-line1" maxlength="180" value="${esc(draft.address || '')}"><p class="err" data-e="ga"></p></div>`;
function authScreen() {
  const tabs = t => `<div class="seg" role="tablist"><button role="tab" aria-selected="${t === 'login'}" class="${t === 'login' ? 'on' : ''}" data-a="authtab" data-v="login">Log in</button><button role="tab" aria-selected="${t !== 'login'}" class="${t !== 'login' ? 'on' : ''}" data-a="authtab" data-v="google-register">Register</button></div>`;
  if (pendingPolicyUser && AU.view !== 'reset') return `<section class="view auth">${authHead('Review the updated policies', 'Read and accept the Terms and acknowledge the Privacy Policy to continue to Papalita.')}
    <form id="policy-form">${policyConsent()}${policySubmit('Continue')}</form>
    <button type="button" class="btn o blk" style="margin-top:12px" data-a="logout">Log out</button></section>`;
  if (pendingGoogleProfile && AU.view !== 'reset') return `<section class="view auth">${authHead('Finish setting up your account', 'Add the details we need to deliver your orders.')}
    <form id="google-profile" novalidate>${googleFields(pendingGoogleProfile.draft)}${googleNotice()}<button type="submit" class="btn p blk">Save and continue</button></form>
    <button type="button" class="btn o blk" style="margin-top:12px" data-a="logout">Log out</button></section>`;
  if (AU.view === 'forgot') return `<section class="view auth">${authHead('Reset your password', 'Enter the email address you used to sign up for Papalita.')}
    <form id="ff" novalidate>
      <div class="field"><label for="fe">Email address</label><input class="in" id="fe" type="email" autocomplete="email" required aria-describedby="forgot-error" value="${esc(AU.prefill)}"><p class="err" id="forgot-error" data-e="fe" role="alert"></p></div>
      <button type="submit" class="btn p blk">Send reset link</button>
      <p class="sm mu" id="forgot-result" role="status"></p>
      <button type="button" class="btn o blk" style="margin-top:12px" data-a="authtab" data-v="login">Back to log in</button>
    </form></section>`;
  if (AU.view === 'reset') return `<section class="view auth">${authHead('Create a new password', 'Choose a new password for your Papalita account.')}<form id="rp" novalidate>${pwField('np1', 'New password', 'new-password', meterHTML('np1'))}${pwField('np2', 'Confirm new password', 'new-password')}<button class="btn p blk">Save password</button></form></section>`;
  if (AU.view === 'google-register') return `<section class="view auth">${authHead('Create your account', 'Enter your delivery details, then choose your Google account.')}${tabs('register')}
    <form id="google-register" novalidate>${googleFields(AU.googleDraft)}${policyConsent()}${googleButton(true)}${googleNotice()}</form>
    <p class="pp-auth-switch"><button type="button" class="link gl" data-a="authtab" data-v="register">Register with email and password</button></p></section>`;
  if (AU.view === 'register') return `<section class="view auth">${authHead('Create your account', 'Sign up to order from local stores in Alegria.')}${tabs('register')}
    <form id="rf" novalidate><div class="field"><label for="rn">Full name</label><input class="in" id="rn" autocomplete="name" maxlength="60"><p class="err" data-e="rn"></p></div><div class="field"><label for="rm">Mobile number</label><input class="in" id="rm" inputmode="tel" placeholder="09XXXXXXXXX" autocomplete="tel"><p class="err" data-e="rm"></p></div>
    <div class="field">
      <label for="re">Email address (required)</label>
      <input class="in" id="re" type="email" autocomplete="email" aria-describedby="re-hint re-error">
      <p class="sm mu" id="re-hint" style="margin-top:6px">Use an active email address you can access. We’ll send your confirmation link there.</p>
      <p class="err" id="re-error" data-e="re" role="alert"></p>
    </div><div class="field"><label for="rb">Barangay</label><select class="in" id="rb"><option value="">Choose your barangay</option>${window.BRGYS.map(b => `<option>${b.n}</option>`).join('')}</select><p class="err" data-e="rb"></p></div>
    ${pwField('rpw', 'Password', 'new-password', meterHTML('rpw'))}${pwField('rpc', 'Confirm password', 'new-password')}
    ${policyConsent()}${policySubmit('Create account')}</form>
    <p class="pp-auth-switch"><button type="button" class="link gl" data-a="authtab" data-v="google-register">Register with Google</button></p></section>`;
  return `<section class="view auth">${authHead('Welcome back', 'Log in to order from your local favorites and track your delivery.')}${tabs('login')}
    <form id="lf" novalidate><div class="field"><label for="li">Email address</label><input class="in" id="li" type="email" autocomplete="username" value="${esc(AU.prefill)}"><p class="err" data-e="li"></p></div>${pwField('lp', 'Password', 'current-password')}
    <div class="pp-auth-recovery"><button type="button" class="link gl" data-a="forgot">Forgot password?</button></div>
    ${policyConsent()}${policySubmit('Log in')}${googleButton(false)}${googleNotice()}</form></section>`;
}
const clearErrs = f => { $$('.in', f).forEach(i => i.classList.remove('bad')); $$('[data-e]', f).forEach(x => x.textContent = ''); };
const showErrs = (f, er) => { clearErrs(f); const k = Object.keys(er); k.forEach(x => { const i = $('#' + x, f); i && i.classList.add('bad'); const e = $(`[data-e=${x}]`, f); e && (e.textContent = er[x]); }); if (k.length) { const i = $('#' + k[0], f); i && i.focus(); } return k.length; };
const authDB = () => {
  if (!window.PAPALITA_DB) throw new Error('Supabase client not available. Check js/config.js and script loading.');
  return window.PAPALITA_DB;
};
const authRedirect = () => new URL('./', location.href).href;
const googleRedirect = () => new URL('?auth=google', authRedirect()).href;
const hasPolicyAgreement = f => Boolean(window.PapalitaLegal?.accepted() && $('#rt', f)?.checked);
const policyError = 'Read both policies to the end and accept to continue.';
function googleDetails(form) {
  const value = id => ($('#'+id, form).value || '').trim();
  const draft = {
    name:value('gn').replace(/\s+/g, ' ').slice(0, 60), phone:normPhone(value('gm')),
    barangay:value('gb'), address:value('ga').slice(0, 180)
  };
  const errors = {};
  if (draft.name.length < 2) errors.gn = 'Enter your full name.';
  if (!PH.test(draft.phone)) errors.gm = 'Use a PH mobile number like 09171234567.';
  if (!window.BRGYS.some(b => b.n === draft.barangay)) errors.gb = 'Choose your barangay.';
  if (draft.address.length < 5) errors.ga = 'Enter your purok, street or building.';
  return { draft, errors };
}
function takeGoogleAttempt() {
  try {
    const raw = sessionStorage.getItem(googleAttemptKey);
    sessionStorage.removeItem(googleAttemptKey);
    const attempt = JSON.parse(raw);
    if (attempt && Date.now() - attempt.startedAt < 15 * 60_000) return attempt;
  } catch {}
  return null;
}
async function startGoogle(form, register = false) {
  if (!form || AU.busy) return;
  const { draft, errors } = register ? googleDetails(form) : { draft:null, errors:{} };
  if (!hasPolicyAgreement(form)) errors.rt = policyError;
  if (showErrs(form, errors)) return;
  setAuthPending(form, true);
  AU.googlePendingForm = form;
  try {
    sessionStorage.setItem(googleAttemptKey, JSON.stringify({
      startedAt:Date.now(), policyVersion:window.PapalitaLegal.version, draft
    }));
    const { error } = await authDB().auth.signInWithOAuth({
      provider:'google', options:{ redirectTo:googleRedirect(), queryParams:{ prompt:'select_account' } }
    });
    if (error) throw error;
  } catch {
    takeGoogleAttempt();
    AU.googlePendingForm = null;
    showErrs(form, { google:'Google sign-in could not start. Try again or log in with email and password.' });
    setAuthPending(form, false);
  }
}
window.addEventListener('pageshow', event => {
  if (!event.persisted || !AU.googlePendingForm) return;
  setAuthPending(AU.googlePendingForm, false);
  AU.googlePendingForm = null;
  takeGoogleAttempt();
});
function useAuthUser(user) {
  pendingPolicyUser = null;
  pendingGoogleProfile = null;
  const meta = user.user_metadata || {};
  const acc = { id:user.id, name:meta.full_name || user.email?.split('@')[0] || 'Customer',
    phone:meta.phone || '', email:user.email || '', brgy:meta.barangay || 'Poblacion' };
  if(S.user.id!==acc.id){stashUser();adoptUser(acc);} S.user.name=acc.name;S.user.phone=acc.phone;
  S.user.in = true;
  S.user.email = acc.email;S.cart.lines=S.cart.lines.filter(l=>ITEM(l.itemId)&&R(l.rid||S.cart.rid));
  setTimeout(()=>window.dispatchEvent(new Event('papalita-session-ready')),0);
  save();
}
function admitAuthUser(user) {
  if (user.app_metadata?.provider === 'google' && !PH.test(normPhone(user.user_metadata?.phone))) {
    pendingPolicyUser = null;
    pendingGoogleProfile = { user, draft:{ name:user.user_metadata?.full_name, barangay:user.user_metadata?.barangay } };
  } else useAuthUser(user);
}
function restoreAuthUser(user) {
  if (window.PapalitaLegal?.hasAccepted(user.id)) admitAuthUser(user);
  else pendingPolicyUser = user;
}
function continueAfterPolicy(form) {
  if (!pendingPolicyUser || showErrs(form, hasPolicyAgreement(form) ? {} : { rt:policyError })) return;
  window.PapalitaLegal.record(pendingPolicyUser.id);
  admitAuthUser(pendingPolicyUser);
  render();
  if (S.user.in && !onCheckout()) void prepareDeliveryPricing();
}
function setAuthPending(form, pending) {
  AU.busy = pending;
  form.querySelectorAll('[data-policy-submit]').forEach(button => button.toggleAttribute('data-auth-pending', pending));
  window.PapalitaLegal?.sync();
}
async function saveGoogleProfile(user, draft) {
  const auth = authDB().auth;
  if (!PH.test(normPhone(user.user_metadata?.phone))) {
    const { data, error } = await auth.updateUser({
      data:{ full_name:draft.name, phone:draft.phone, barangay:draft.barangay }
    });
    if (error || data?.user?.id !== user.id) throw new Error('Could not save your delivery details. Please try again.');
    user = data.user;
  }
  useAuthUser(user);
  if (!S.addrs.length) {
    const address = { id:uid('a'), label:'Home', line:draft.address, city:draft.barangay+', Alegria', landmark:'', def:true };
    S.addrs.push(address);
    CK.addr = address.id;
    syncLoc(address);
    save();
  }
}
async function finishGoogleProfile(form) {
  if (AU.busy || !pendingGoogleProfile) return;
  const { draft, errors } = googleDetails(form);
  if (showErrs(form, errors)) return;
  const button = form.querySelector('button[type="submit"]');
  AU.busy = button.disabled = true;
  try {
    const { data, error } = await authDB().auth.getUser();
    if (error || data?.user?.id !== pendingGoogleProfile?.user.id) throw new Error('Your session expired. Log out and continue with Google again.');
    await saveGoogleProfile(data.user, draft);
    render();
    if (!onCheckout()) void prepareDeliveryPricing();
  } catch (error) {
    showErrs(form, { google:error.message || 'Could not save your delivery details. Please try again.' });
  } finally {
    AU.busy = button.disabled = false;
  }
}
async function restoreCustomerAuth() {
  const auth = authDB().auth;
  const googleReturn = window.papalitaGoogleReturn;
  delete window.papalitaGoogleReturn;
  const attempt = googleReturn ? takeGoogleAttempt() : null;
  const { data, error } = await auth.getUser();
  const user = error ? null : data?.user;
  if (!googleReturn) {
    if (user) restoreAuthUser(user);
    return;
  }
  const url = new URL(location.href);
  for (const name of ['auth', 'error', 'error_code', 'error_description']) url.searchParams.delete(name);
  if (!url.hash.startsWith('#/')) url.hash = '';
  history.replaceState(history.state, '', url.href);
  const googleUser = user?.identities?.some(identity => identity.provider === 'google') || user?.app_metadata?.provider === 'google';
  if (!googleUser || !await googleReturn(auth, user.id)) {
    AU.view = attempt?.draft ? 'google-register' : 'login';
    AU.googleDraft = attempt?.draft || undefined;
    AU.googleError = 'Google sign-in did not finish. Try again or log in with email and password.';
    if (user) restoreAuthUser(user);
    return;
  }
  const legal = window.PapalitaLegal;
  pendingPolicyUser = null;
  if (attempt?.policyVersion === legal.version) legal.record(user.id, attempt.policyVersion);
  if (!legal.hasAccepted(user.id) && attempt?.policyVersion !== legal.version) {
    restoreAuthUser(user);
    return;
  }
  if (attempt?.draft) {
    try { await saveGoogleProfile(user, attempt.draft); }
    catch {
      pendingGoogleProfile = { user, draft:attempt.draft };
      AU.googleError = 'Could not save your delivery details. Tap Save and continue to retry.';
    }
  } else if (!PH.test(normPhone(user.user_metadata?.phone))) {
    pendingGoogleProfile = { user, draft:{ name:user.user_metadata?.full_name, barangay:user.user_metadata?.barangay } };
  } else useAuthUser(user);
}
async function doLogin(f) {
  const email = $('#li',f).value.trim(), password = $('#lp',f).value;
  const er = {};
  if (!/^\S+@\S+\.\S+$/.test(email)) er.li = 'Enter a valid email address.';
  if (!password) er.lp = 'Enter your password.';
  if (!hasPolicyAgreement(f)) er.rt = policyError;
  if (showErrs(f,er)) return;
  if (AU.busy) return;
  setAuthPending(f, true);
  try {
    const {data,error} = await authDB().auth.signInWithPassword({email,password});
    if (error) throw error;
    if (!data?.session?.user) throw new Error('Confirm your email before logging in.');
    window.PapalitaLegal.record(data.session.user.id);
    useAuthUser(data.session.user);
    void prepareDeliveryPricing();
    location.hash = '#/';
    render();
    refreshCateringRequests().catch(err=>console.error('[Papalita] Catering load:',err));
  } catch(err) { showErrs(f,{lp:err.message || 'Login failed.'}); }
  finally { setAuthPending(f, false); }
}
async function doRegister(f) {
  const v = id => $('#'+id,f).value.trim();
  const name = v('rn').replace(/\s+/g,' '), phone = normPhone(v('rm')),
    email = v('re').toLowerCase(), password = $('#rpw',f).value, barangay = v('rb');
  const er = {};
  if (name.length < 2) er.rn = 'Enter your full name.';
  if (!PH.test(phone)) er.rm = 'Use a PH mobile number like 09171234567.';
  if (!/^\S+@\S+\.\S+$/.test(email)) er.re = 'Valid email is required.';
  if (!barangay) er.rb = 'Choose your barangay.';
  if (!pwOk(password)) er.rpw = 'Use 8+ characters, a letter and a number.';
  else if ($('#rpc',f).value !== password) er.rpc = 'Passwords do not match.';
  if (!hasPolicyAgreement(f)) er.rt = policyError;
  if (showErrs(f,er)) return;
  if (AU.busy) return;
  setAuthPending(f, true);
  try {
    const {data,error} = await authDB().auth.signUp({
      email,password,
      options:{ emailRedirectTo:authRedirect(), data:{full_name:name,phone,barangay} }
    });
    if (error) throw error;
    if (data?.session?.user) window.PapalitaLegal.record(data.session.user.id);
    AU.prefill = email;
    AU.view = 'login';
    render();
    if (data?.session) {
      toast('Account created. You can now log in.');
    } else {
      openSheet(`<div class="pd" style="padding-top:38px">
        <h2>Check your email</h2>
        <p class="mu" style="margin-top:10px">Look for the Papalita confirmation email at <strong style="overflow-wrap:anywhere">${esc(email)}</strong>.</p>
        <p class="mu sm" style="margin-top:10px">Open the link to confirm your account, then return to log in. If you don’t see the email, check your Spam or Junk folder.</p>
        <button type="button" class="btn p blk" data-a="close" style="margin-top:18px">Back to log in</button>
      </div>`, { label: 'Check your email' });
    }
  } catch(err) { showErrs(f,{re:err.message || 'Registration failed.'}); }
  finally { setAuthPending(f, false); }
}
function meter(input) { const id = input.id, n = pwScore(input.value), bars = $$(`[data-m=${id}] i`), t = $(`[data-mt=${id}]`); bars.forEach((b, i) => { b.className = i < n ? 's' + n : ''; }); if (t) t.textContent = !input.value ? 'Use 8+ characters with letters and numbers.' : ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'][n] + (pwOk(input.value) ? '' : ' · needs 8+ characters, a letter and a number'); }
function termsSheet() {
  if (window.papalitaOpenLegal) window.papalitaOpenLegal();
  else toast('Terms and Privacy could not load. Refresh to try again.');
}
async function doForgotPassword(form) {
  const button = form.querySelector('button[type="submit"]');
  if (button.disabled) return;
  const input = $('#fe', form), email = input.value.trim();
  const status = $('#forgot-result', form);
  const valid = /^\S+@\S+\.\S+$/.test(email);
  input.setAttribute('aria-invalid', String(!valid));
  status.textContent = '';
  if (showErrs(form, valid ? {} : { fe: 'Enter a valid email address.' })) return;
  AU.prefill = email;
  button.disabled = true;
  button.textContent = 'Sending…';
  try {
    const { error } = await authDB().auth.resetPasswordForEmail(email, { redirectTo: authRedirect() });
    if (error) throw error;
    status.textContent = 'If you have a Papalita account with this email, check your inbox for a reset link.';
  } catch {
    status.textContent = 'Could not send a reset link right now. Please try again later.';
  } finally {
    button.disabled = false;
    button.textContent = 'Send reset link';
  }
}
async function doReset(f){
  const password=$('#np1',f).value,er={};if(!pwOk(password))er.np1='Use 8+ characters, a letter and a number.';if($('#np2',f).value!==password)er.np2='Passwords do not match.';if(showErrs(f,er))return;
  const button=f.querySelector('button.btn.p');button.disabled=true;
  try{const verified=await authDB().auth.getUser();if(verified.error)throw verified.error;if(!verified.data?.user)throw Error('The password reset session has expired. Request another email.');
    const q=await authDB().auth.updateUser({password});if(q.error)throw q.error;if(!q.data?.user)throw Error('The server did not confirm the password update.');
    await window.PAPALITA_NOTIFICATIONS?.disconnectPhone();const signedOut=await authDB().auth.signOut({scope:'local'});if(signedOut.error){toast('Password updated. Please sign out manually.');return;}
    S.user.in=false;AU.view='login';save();render();toast('Password updated. Sign in with your new password.');
  }catch(error){showErrs(f,{np1:error.message});}finally{if(button.isConnected)button.disabled=false;}
}
function pwChangeSheet(){AU.view='reset';render();}
function afterAuth(){window.PapalitaLegal?.sync();}
document.addEventListener('input',e=>{if(['rpw','np1'].includes(e.target.id))meter(e.target);});
document.addEventListener('submit',e=>{
  const f=e.target;if(f.id==='lf'){e.preventDefault();void doLogin(f);}
  else if(f.id==='rf'){e.preventDefault();void doRegister(f);}
  else if(f.id==='google-register'){e.preventDefault();void startGoogle(f,true);}
  else if(f.id==='google-profile'){e.preventDefault();void finishGoogleProfile(f);}
  else if(f.id==='policy-form'){e.preventDefault();continueAfterPolicy(f);}
  else if(f.id==='ff'){e.preventDefault();void doForgotPassword(f);}
  else if(f.id==='rp'){e.preventDefault();void doReset(f);}
});
const AUTH_A={
  authtab:b=>{if(!AU.busy&&['login','register','google-register'].includes(b.dataset.v)){AU.view=b.dataset.v;AU.googleError='';render();}},
  'google-login':b=>{void startGoogle(b.closest('form'));},
  forgot:()=>{if(AU.busy)return;AU.prefill=($('#li')?.value || '').trim();AU.view='forgot';render();$('#fe')?.focus();},
  terms:termsSheet,pwchange:pwChangeSheet,delacct:deleteAcctSheet,
  pwtoggle:b=>{const input=document.getElementById(b.dataset.id),show=input.type==='password';input.type=show?'text':'password';b.innerHTML=ic(show?'eyeoff':'eye',20);b.setAttribute('aria-label',show?'Hide password':'Show password');}
};

/* ---------- catering ---------- */
window.addEventListener('focus',()=>{ if(S.user.in)refreshCateringRequests().catch(console.error); });
const CATER_STORE_IDS=Object.fromEntries(RS.filter(r=>r.catering).map(r=>[r.id,r.id]));
function fromCateringRow(x) {
  return { id:x.id,kind:'catering',rid:x.store_id,
    type:x.event_type||'',name:x.customer_name,phone:x.customer_phone,date:x.event_date||'',
    time:x.event_time||'',guests:x.guests,brgy:x.venue_barangay||'',venue:x.venue_details||'',
    pkg:x.package||'',notes:x.notes||'',status:x.status==='pending'?'sent':x.status,
    createdAt:Date.parse(x.created_at)||Date.now(),uid:x.customer_id };
}
async function refreshCateringRequests() {
  const db=authDB(), {data:{user},error:authError}=await db.auth.getUser();
  if(authError)throw authError;
  if(!user)return;
  const {data,error}=await db.from('catering_requests').select('*').eq('customer_id',user.id).order('created_at',{ascending:false});
  if(error)throw error;
  if(S.user.id!==user.id||!S.user.in)return;
  const remote=(data||[]).map(fromCateringRow);
  S.cater=remote;save();
  if(/^\/(orders|catering)/.test(curPath()))render();
}
const CSTAT = { sent: ['Sent', 'n'], confirmed: ['Confirmed', 'open'], quoted: ['Quoted', 'n'], completed: ['Completed', 'open'], cancelled: ['Cancelled', 'closed'] };
const EVENTS = ['Birthday', 'Wedding', 'Company event', 'Fiesta', 'Other'], PKGS = ['Discuss with the store'];
const todayPH = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
const cateringSection = r => `<div class="sec" id="s-catering"><div class="sec-h" style="margin-bottom:10px"><h2>Catering</h2><span class="gl lab2">Events</span></div>${cateringCard(r)}</div>`;
V.catering = () => { const rs = RS.filter(r => r.catering);
  return { html: `<section class="view">${pageHead('Catering')}<div class="mint row"><span class="grow"><b style="font-size:19px">Food for every gathering</b><br><span class="sm mu">Birthdays, weddings, fiestas and company events across Alegria. Send a request and the store will confirm by phone or message.</span></span></div>
  <div class="row" style="margin:14px 0"><button class="btn s sm" data-a="go" data-id="/orders?t=catering">${ic('orders', 16)}My requests (${myCater().length})</button></div><div class="grid2">${rs.map(cateringCard).join('')}</div></section>` }; };
V.cateringForm = (_, p) => { const rs = RS.filter(r => r.catering), rid = p.get('rid') || rs[0]?.id;
  return { html: `<section class="view" style="max-width:640px;margin:0 auto">${pageHead('Request catering')}<form id="cf" class="panel" novalidate>
  <div class="field"><label for="cr">Store</label><select class="in" id="cr">${rs.map(r => `<option value="${r.id}" ${r.id === rid ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>
  <div class="two"><div class="field"><label for="cn">Your name</label><input class="in" id="cn" value="${esc(S.user.name)}" autocomplete="name"><p class="err" data-e="cn"></p></div><div class="field"><label for="cp">Mobile number</label><input class="in" id="cp" inputmode="tel" value="${esc(S.user.phone || '')}" placeholder="09XXXXXXXXX"><p class="err" data-e="cp"></p></div></div>
  <div class="field"><label for="ce">Event type</label><select class="in" id="ce">${EVENTS.map(x => `<option>${x}</option>`).join('')}</select></div>
  <div class="two"><div class="field"><label for="cd">Event date</label><input class="in" id="cd" type="date" min="${todayPH()}"><p class="err" data-e="cd"></p></div><div class="field"><label for="ct">Time</label><input class="in" id="ct" type="time"><p class="err" data-e="ct"></p></div></div>
  <div class="two"><div class="field"><label for="cg">Number of guests</label><input class="in" id="cg" type="number" inputmode="numeric" min="10" max="500" placeholder="10 – 500"><p class="err" data-e="cg"></p></div><div class="field"><label for="ck">Package</label><select class="in" id="ck">${PKGS.map(x => `<option>${x}</option>`).join('')}</select></div></div>
  <div class="two"><div class="field"><label for="cb">Venue barangay</label><select class="in" id="cb">${window.BRGYS.map(b => `<option ${b.n === S.loc.brgy ? 'selected' : ''}>${b.n}</option>`).join('')}</select></div><div class="field"><label for="cv">Venue (purok, landmark)</label><input class="in" id="cv" maxlength="100" placeholder="Barangay hall, Purok 2…"></div></div>
  <div class="field"><label for="cx">Notes</label><textarea class="in" id="cx" maxlength="400" placeholder="Dietary needs, budget, setup time…"></textarea></div>
  <button class="btn p blk">Send request</button><p class="sm mu" style="margin-top:8px">An inquiry is sent to the store; it is not a confirmed booking.</p></form></section>` }; };
V.cateringSent = id => { const q = (S.cater || []).find(x => x.id === id&&own(x)); if (!q) return V.notFound();
  return { html: `<section class="view" style="max-width:600px;margin:0 auto;text-align:center"><div class="empty" style="padding-bottom:10px"><div class="big" style="background:var(--or);color:#fff;width:96px;height:96px">${ic('check', 48)}</div><h1 style="font-size:30px">Request sent</h1><p style="margin-top:8px">Reference <b style="color:var(--ink)">${q.id}</b></p><p>${esc(R(q.rid)?.name||'Store')} will confirm by phone or message.</p></div>
  <div class="panel sm" style="text-align:left">${[['Event', q.type], ['Date', q.date + (q.time ? ' · ' + q.time : '')], ['Guests', q.guests], ['Package', q.pkg], ['Venue', (q.venue ? q.venue + ', ' : '') + q.brgy + ', Alegria']].filter(x => x[1]).map(([a, b]) => `<div class="row sp" style="padding:5px 0"><span class="mu">${a}</span><b style="text-align:right">${esc(b)}</b></div>`).join('')}</div>
  <div class="row" style="margin-top:16px"><button class="btn s grow" data-a="home">Back home</button><button class="btn p grow" data-a="go" data-id="/orders?t=catering">My requests</button></div></section>` }; };
function cateringList() { const l = myCater(); if (!l.length) return emptyState('box', 'No catering requests', 'Plan a gathering and send your first request.', 'Request catering', 'newcater');
  return `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,360px),1fr))">${l.map(q => { const [lb, cl] = CSTAT[q.status] || CSTAT.sent;
    return `<div class="panel" style="margin:0"><div class="row sp"><h3>${esc(R(q.rid)?.name||'Store')}</h3><span class="status ${cl}">${lb}</span></div><p class="mu sm">${q.id} · ${q.kind === 'inquiry' ? 'Resort inquiry · ' : ''}${esc(q.type)}${q.date ? ' · ' + q.date : ''}${q.guests ? ' · ' + q.guests + ' guests' : ''}</p>${q.pkg ? `<p class="sm" style="margin-top:4px">${esc(q.pkg)}</p>` : ''}
    <div class="row" style="margin-top:12px"><button class="btn s sm grow" data-a="contact" data-k="call" data-id="${q.rid}">${ic('phone', 16)}Call store</button></div></div>`; }).join('')}</div>`; }
V.nearby=()=>({html:`<section class="view">${pageHead('Store locations')}${RS.length?`<div class="grid">${RS.map(r=>{
  const address = r.addr.trim();
  const query = address && encodeURIComponent([r.name, localMapAddress(address)].filter(Boolean).join(', '));
  return `<article class="panel"><h2>${esc(r.name)}</h2><p class="mu sm" style="margin:10px 0">${esc(address||'Address not supplied by the store.')}</p><button class="btn s sm" data-a="rest" data-id="${esc(r.id)}">Open menu</button>${query?` <a class="btn s sm" href="https://www.google.com/maps/search/?api=1&query=${query}" target="_blank" rel="noopener">Open map</a>`:''}</article>`;
}).join('')}</div>`:emptyState('store','No stores available','Please check again later.')}</section>`});
V.payments=()=>({html:`<section class="view" style="max-width:680px;margin:auto">${pageHead('Payment methods')}<div class="panel"><h2>Cash payment</h2><p class="mu" style="margin-top:10px">Pay cash on delivery or at pickup. Online wallet and card processing are not connected.</p></div></section>`});
const SUPPORT_EMAIL = 'papalitaoriginal@gmail.com';
const SUPPORT_PHONE = '09243873785';
const SUPPORT_DIAL = '+63' + SUPPORT_PHONE.slice(1);
const GMAIL_COMPOSE_URL = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(SUPPORT_EMAIL);
const SUPPORT_EMAIL_URL = /Android.*Chrome\//.test(navigator.userAgent)
  ? `intent:${SUPPORT_EMAIL}#Intent;scheme=mailto;action=android.intent.action.SENDTO;package=com.google.android.gm;S.browser_fallback_url=${encodeURIComponent(GMAIL_COMPOSE_URL)};end`
  : GMAIL_COMPOSE_URL;
const FAQ=[['How do I check an order?','Open Orders, choose your order, and tap Track order or Track pickup.'],['How do I cancel?','Press and hold an order in Current to reveal Cancel order, or open its details. You can cancel before the store marks it Ready.'],['How can I pay?','Cash payment is supported. Online payments are not connected.'],['I need help with an order.','Tap Need help with this order? from Order details or tracking to include the order number in your email.']];
V.support = (_, params) => {
  const order = ORD(params?.get('order'));
  const subject = order ? encodeURIComponent(`Help with Papalita order ${order.id}`) : '';
  const body = order ? encodeURIComponent(`Hello Papalita,\r\n\r\nI need help with order ${order.id}.\r\n\r\nMy concern:\r\n`) : '';
  const emailUrl = order ? `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}` : SUPPORT_EMAIL_URL;
  return {html:`<section class="view" style="max-width:680px;margin:auto">
  ${pageHead(order ? 'Order support' : 'Support')}
  <div class="panel">
    <h2>Contact Papalita</h2>
    ${order ? `<p class="sm" style="margin:8px 0;overflow-wrap:anywhere">Order number <b>${esc(order.id)}</b></p>
      <button type="button" class="btn s sm" data-a="copy" data-id="${esc(order.id)}">${ic('copy',16)}Copy order number</button>`
      : '<p class="mu sm" style="margin:8px 0">Get help with your order, account, or the app. For order concerns, include your order reference.</p>'}
    <a class="li" href="${esc(emailUrl)}"><span class="ic">${ic('send',20)}</span><span class="grow"><b>Email Papalita</b><br><span class="sm mu" style="overflow-wrap:anywhere">${order ? 'Order number included in your draft' : SUPPORT_EMAIL}</span></span>${ic('chev',18,'mu')}</a>
    <a class="li" href="tel:${SUPPORT_DIAL}"><span class="ic">${ic('phone',20)}</span><span class="grow"><b>Call Papalita</b><br><span class="sm mu">${SUPPORT_PHONE}</span></span>${ic('chev',18,'mu')}</a>
    <a class="li" href="sms:${SUPPORT_DIAL}"><span class="ic">${ic('chat',20)}</span><span class="grow"><b>Text Papalita</b><br><span class="sm mu">${SUPPORT_PHONE}</span></span>${ic('chev',18,'mu')}</a>
  </div>
  <div class="panel"><h2>Frequently asked questions</h2>${FAQ.map(([q,a])=>`<details style="padding:12px 0"><summary style="font-weight:700;cursor:pointer">${esc(q)}</summary><p class="mu sm" style="margin-top:10px">${esc(a)}</p></details>`).join('')}</div>
</section>`};
};
function payPick(){const el=openSheet(`<form class="pd" style="padding-top:34px"><h2>Payment method</h2><label class="opt" style="margin-top:16px"><input type="radio" checked name="cash"><span>Cash on delivery or pickup</span></label><p class="mu sm" style="margin:12px 0">No online payment is processed by this app.</p><button class="btn p blk">Use cash payment</button></form>`,{label:'Payment method'});$('form',el).onsubmit=e=>{e.preventDefault();CK.pay='cod';CK.det={};closeSheet();render();};}
function deleteAcctSheet() {
  openSheet(`<div class="pd" style="padding-top:34px">
    <h2>Delete your account?</h2>
    <p class="mu" style="margin-top:10px">This permanently deletes your Papalita customer account. Wait for any ongoing orders to finish before deleting it.</p>
    <p class="err" id="delete-account-message" role="alert" style="margin-top:10px"></p>
    <button type="button" class="btn o blk" data-a="go" data-id="/orders?t=current" id="delete-account-orders" hidden>View current orders</button>
    <div class="row" style="margin-top:16px">
      <button type="button" class="btn o grow" data-a="close">Cancel</button>
      <button type="button" class="btn d grow" data-a="confirmdelacct">Delete account</button>
    </div>
  </div>`, { noX: true, label: 'Delete your account?' });
}

async function deleteCustomerAccount(button) {
  if (button.disabled) return;
  const customerId = S.user.id;
  const dialog = button.closest('[role="dialog"]');
  const message = $('#delete-account-message', dialog);
  const orders = $('#delete-account-orders', dialog);
  const db = authDB();
  button.disabled = true;
  button.textContent = 'Deleting…';
  message.textContent = '';
  orders.hidden = true;
  try {
    const {data, error} = await db.rpc('papalita_delete_customer_account', {p_expected_user_id:customerId});
    if (error) throw error;
    if (data === 'active_orders') {
      message.textContent = 'You have an ongoing order. Wait until it is completed or cancelled, then try again.';
      orders.hidden = false;
      return;
    }
    if (data === 'partner_account' || data === 'linked_records') {
      message.textContent = 'This account has linked records. Contact Papalita support for help deleting it.';
      return;
    }
    if (data !== 'deleted') throw Error('The server did not confirm deletion.');
  } catch (error) {
    message.textContent = error.code === '42501' ? 'Please log in again before deleting your account.' :
      'Papalita could not confirm account deletion. Please try again.';
    return;
  } finally {
    button.disabled = false;
    button.textContent = 'Delete account';
  }

  window.PapalitaLegal?.forget(customerId);
  delete S.users?.[customerId];
  for (const key of ['orders', 'cater', 'notes']) S[key] = (S[key] || []).filter(row => row.uid !== customerId);
  if (S.user.id === customerId) {
    const fresh = seed();
    for (const key of BUCKET) S[key] = fresh[key];
    S.user = fresh.user;
    savePendingCheckout(customerId, null);
    clearSession();
    AU.prefill = '';
    AU.view = 'login';
    save();
    await Promise.allSettled([
      window.PAPALITA_NOTIFICATIONS?.disconnectPhone(),
      db.auth.signOut({scope:'local'})
    ]);
    render();
  } else {
    save();
  }
  toast('Your Papalita account has been deleted.');
}
const contactBtns=r=>r.phone?`<div class="contact"><a class="cbtn" href="tel:${esc(r.phone.replace(/[^+\d]/g,''))}">${ic('phone',20)}Call store</a><a class="cbtn" href="sms:${esc(r.phone.replace(/[^+\d]/g,''))}">${ic('send',20)}Text store</a></div><p class="sm mu" style="margin-top:10px">${esc(r.phone)}</p>`:'<p class="mu sm">The store has not supplied a contact number.</p>';
const cateringCard=r=>`<article class="card"><div class="bd" style="padding:20px"><h2>${esc(r.name)}</h2><p class="mu" style="margin:10px 0">Ask this participating store about catering, availability and pricing. An inquiry is not a confirmed booking.</p><button class="btn p" data-a="cater" data-id="${esc(r.id)}">Request catering</button></div></article>`;
function locSheet(){const el=openSheet(`<div class="pd" style="padding-top:36px"><h2>Your barangay</h2><p class="mu sm" style="margin:10px 0">Choose your delivery area in Alegria.</p>${window.BRGYS.map(b=>`<label class="opt"><input type="radio" name="lc" value="${esc(b.n)}" ${S.loc.brgy===b.n?'checked':''}><span class="grow">${esc(b.n)}</span><small>${deliveryFees.has(b.n)?peso(deliveryFees.get(b.n)):'Delivery fee not configured'}</small></label>`).join('')}</div>`,{label:'Choose barangay'});el.addEventListener('change',e=>{if(e.target.name==='lc'){S.loc={...S.loc,brgy:e.target.value,label:e.target.value+', Alegria'};save();closeSheet();updateChrome();render();}});}
async function cancelRealOrder(button){
  const id = button.dataset.id;
  if (!canCancelOrder(ORD(id)) || !await confirmDlg('Cancel this order? It will be removed from Current Orders.', 'Cancel order', true)) return;
  button.disabled = true;
  try {
    const db = authDB();
    const verified = await db.auth.getUser();
    if (verified.error) throw verified.error;
    const uid = verified.data?.user?.id;
    if (!uid || uid !== S.user.id) throw Error('Please sign in again.');

    const {data, error} = await db.rpc('papalita_customer_cancel_order', {p_order_id:id});
    if (error) throw error;
    if (data?.id !== id || data.status !== 'cancelled') throw Error('The server did not confirm cancellation.');
    if (uid !== S.user.id) return;

    const order = ORD(id);
    if (order) {
      order.status = data.status;
      order.upd = Date.parse(data.updated_at) || Date.now();
      save();
    }
    toast('Your order was cancelled and removed from Current Orders.');
    render();
  } catch (error) {
    toast('Order not cancelled: ' + error.message);
  } finally {
    button.disabled = false;
  }
}
async function saveProfile(f){
  const name=$('#pn',f).value.trim(),phone=normPhone($('#pp',f).value),email=$('#pe',f).value.trim(),er={};
  if(name.length<2)er.pn='Enter your name.';if(!/^\S+@\S+\.\S+$/.test(email))er.pe='Enter a valid email.';if(phone&&!PH.test(phone))er.pp='Enter a valid Philippine mobile number.';if(showErrs(f,er))return;
  const button=f.querySelector('button[type=submit],button.btn.p');if(button)button.disabled=true;
  try{const verified=await authDB().auth.getUser();if(verified.error)throw verified.error;if(verified.data?.user?.id!==S.user.id)throw Error('Please sign in again.');
    const payload={data:{...verified.data.user.user_metadata,full_name:name,phone}};if(email!==verified.data.user.email)payload.email=email;
    const q=await authDB().auth.updateUser(payload);if(q.error)throw q.error;if(!q.data?.user)throw Error('The server did not confirm the profile change.');
    S.user.name=q.data.user.user_metadata?.full_name||name;S.user.phone=q.data.user.user_metadata?.phone||phone;S.user.email=q.data.user.email||S.user.email;save();toast(payload.email?'Details saved. Confirm the email change using the link sent to you.':'Account details saved.');go('/profile');
  }catch(error){showErrs(f,{pn:error.message});}finally{if(button)button.disabled=false;}
}

/* ---------- actions ---------- */
const go = p => nav(p), browse = () => nav('/discover?tab=dishes&reset=1');
function toggleFav(k, id) { const a = S.fav[k], i = a.indexOf(id); i >= 0 ? a.splice(i, 1) : a.push(id); save(); const on = i < 0;
  $$(`[data-a=fav][data-k=${k}][data-id="${id}"]`).forEach(b => { b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', on ? 'Remove from favorites' : 'Add to favorites'); $('svg', b).classList.toggle('on', on); }); toast(on ? 'Saved to favorites.' : 'Removed from favorites.'); if (/favorites/.test(location.hash)) render(); }
const onCheckout = () => /^\/(?:cart|checkout)$/.test(curPath());
function setPromo(code, onError=toast){
  if(!activeVouchers().some(p=>p.code===code))return onError('This voucher is no longer available.');
  const quote=calc(S.cart,code), checkout=onCheckout();
  if(checkout&&quote.perr)return onError(quote.perr);
  S.promo=code;
  save();
  if(checkout)renderVoucherCheckout();
  else if(curPath()==='/promos')render();
  toast(!S.cart.lines.length?`${code} saved for checkout.`:quote.perr||`${code} applied. You save ${peso(quote.disc)}.`);
}
const syncLoc = a => { const n = (a && a.city || '').split(',')[0].trim(), b = window.BRGYS.find(x => x.n === n); if (b) { S.loc.brgy = b.n; S.loc.label = b.n + ', Alegria'; save(); } };
function moreSheet() { openSheet(`<div class="pd" style="padding-top:34px"><h2 style="margin-bottom:6px">More</h2>${[['grid', 'All categories', '/categories'], ['heart', 'Favorites', '/favorites'], ['bell', 'Notifications', '/notifications'], ['pin', 'Saved addresses', '/addresses'], ['help', 'Support', '/support'], ['user', 'Profile', '/profile']].map(([i, t, p]) => `<button class="li" data-a="go" data-id="${p}"><span class="ic">${ic(i)}</span><b class="grow">${t}</b>${ic('chev', 18, 'mu')}</button>`).join('')}</div>`, { label: 'More' }); }
const A = {
  livemap: b => {
    const order=ORD(b.dataset.id), uid=S.user.id;
    if(!order || orderStatus.mode(order)!=='delivery')return;
    if(!window.PapalitaLiveMap){toast('Live map could not load. Refresh to retry.');return;}
    window.PapalitaLiveMap.open(order,authDB(),()=>S.user.in&&S.user.id===uid&&curPath()==='/track/'+order.id);
  },
  tip: b => { CK.tip = +b.dataset.v; render(); },
  receipt: b => {
    const o = ORD(b.dataset.id);
    if (!o) return;
    openSheet(`<div class="pd" style="padding-top:52px">${receiptHTML(o)}<button class="btn p blk" style="margin-top:14px" data-a="printrcpt" data-id="${esc(o.id)}">Save / print receipt</button></div>`, { label: 'Receipt' });
  },
  printrcpt: b => printReceipt(b.dataset.id),
  cater: b => go('/catering/request?rid=' + b.dataset.id), newcater: () => go('/catering/request'),
  contact: b => { const r = R(b.dataset.id), k = b.dataset.k; if(!r.phone)return toast('The store has not supplied a contact number.');
    if (k === 'call') location.href = 'tel:' + r.phone; else if (k === 'sms') location.href = 'sms:' + r.phone; else if (k === 'msgr') r.messenger ? window.open(r.messenger, '_blank', 'noopener') : toast('Messenger link not set yet.'); else { try { navigator.clipboard.writeText(r.phone); toast('Number copied.'); } catch (e) { toast('Copy is not available here.'); } } },
  place: () => placeOrder(), addrpick: addrPick, paypick: payPick,
  pcat: b => { PD = b.dataset.id; fillPopular(); },
  hcat: b => { if (b.dataset.id === 'catering') return go('/catering'); HC = HC === b.dataset.id ? 'all' : b.dataset.id; fillCurated(); },
  share: b => { const r = R(b.dataset.id), u = location.href; if (navigator.share) navigator.share({ title: r.name + ' on Papalita', url: u }).catch(() => {}); else { try { navigator.clipboard.writeText(u); toast('Link copied.'); } catch (e) { toast('Sharing is not available here.'); } } },
  close: closeSheet, confirmdelacct: deleteCustomerAccount, reload: () => render(), home: () => go('/'), browse, back: () => history.length > 1 ? history.back() : go('/'), go: (b) => { closeSheet(); go(b.dataset.id); },
  fav: b => toggleFav(b.dataset.k, b.dataset.id), item: b => openItem(b.dataset.id),
  rest: b => { const restaurant = R(b.dataset.id); if (restaurant) go('/restaurant/' + encodeURIComponent(restaurant.id)); },
  restmenu: b => go('/restaurant/' + b.dataset.id),
  quick: b => { const x = ITEM(b.dataset.id); if ((x.item.opts||[]).length) { openItem(x.item.id); return; } const host = b.closest('.card,.mi'), src = (host && $('.ph', host)) || b; addToCart(x.item, x.rest, defSel(x.item), 1, '', null, { rect: src.getBoundingClientRect(), img: x.item.img }); tickBtn(b); },
  loc: locSheet, askloc:locSheet,
  qa: b => { const id = b.dataset.id; if (id === 'rests') go('/discover?tab=rests&reset=1' + (HC !== 'all' ? '&cat=' + HC : '')); else if (id === 'order') go('/discover?tab=dishes&reset=1'); else if (id === 'track') { const o = myOrders().find(isCurrent); o ? go('/track/' + o.id) : (toast('No active orders to track.'), go('/orders')); } else if (id === 'promo') go('/promos'); else moreSheet(); },
  filters: () => go('/discover?f=1&tab=dishes'), catall: () => go('/categories'), cat: b => b.dataset.id === 'catering' ? go('/catering') : go('/discover?tab=dishes&reset=1&cat=' + b.dataset.id),
  sugg: b => { const t = b.dataset.t, id = b.dataset.id; if (t === 'cat') go('/discover?tab=dishes&reset=1&cat=' + id); else if (t === 'rest') go('/restaurant/' + id); else if (t === 'item') { $('#sg').innerHTML = ''; openItem(id); } else { S.recent = [id, ...(S.recent || []).filter(x => x !== id)].slice(0, 6); save(); go('/discover?tab=dishes&reset=1&q=' + encodeURIComponent(id)); } },
  clearq: () => { const q = $('#q'); q.value = ''; $('#sg').innerHTML = ''; $('[data-a=clearq]').hidden = true; q.focus(); },
  dclear: () => { F.q = ''; $('#dq').value = ''; $('[data-a=dclear]').hidden = true; fillResults(); $('#dq').focus(); },
  ftoggle: () => { F.open = !F.open; fillDiscover(); },
  ftab: b => { const tab = b.dataset.v; if (tab === 'dishes' || tab === 'rests') { F.tab = tab; nav('/discover?tab=' + tab); } },
  flt: b => { const k = b.dataset.k, v = b.dataset.v; if (k === 'cat' && v === 'catering') return go('/catering'); F[k] = k === 'cat' ? v : +v; fillDiscover(); }, fpromo: () => { F.promo = !F.promo; fillDiscover(); },
  fclear: () => { F = { ...F, q: '', cat: 'all', price: 0, rating: 0, eta: 0, promo: false }; render(); },
  jump: b => { $$('.chips.solid .chip').forEach(x => x.classList.toggle('on', x === b)); const e = document.getElementById(b.dataset.id); e && e.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  choosevoucher: chooseVoucher,
  usepromo: b => setPromo(b.dataset.id), rmpromo: () => { S.promo = null; save(); renderVoucherCheckout(); },
  applypromo: () => {
    const code=$('#pc').value.trim().toUpperCase(), error=$('#pcerr');
    error.textContent='';
    if(!code){error.textContent='Enter a voucher code.';return;}
    setPromo(code,message=>{error.textContent=message;});
  },
  copy: async b => { try { await navigator.clipboard.writeText(b.dataset.id); toast(`Copied ${b.dataset.id}.`); } catch { toast('Could not copy the code. You can enter it manually at checkout.'); } },
  qty: b => { const l = S.cart.lines.find(x => x.key === b.dataset.k); l.qty += +b.dataset.d; if (l.qty < 1) return A.rmline(b); if (l.qty > 99) l.qty = 99; save(); updateChrome(); render(); },
  editline: b => openItem(b.dataset.id, b.dataset.k),
  rmline: b => { const i = S.cart.lines.findIndex(x => x.key === b.dataset.k), l = S.cart.lines[i], rid = S.cart.rid; S.cart.lines.splice(i, 1); S.cart.rid = S.cart.lines[0]?.rid || null; save(); updateChrome(); render(); toast(`${l.name} removed.`, 'Undo', () => { S.cart.lines.splice(i, 0, l); S.cart.rid = rid; save(); updateChrome(); render(); }); },
  clearcart: () => confirmDlg('Remove everything from your cart?', 'Clear cart', true).then(ok => { if (ok) { S.cart = { rid: null, lines: [] }; save(); updateChrome(); render(); } }),
  fulfillment: b => { CK.fulfillment = b.dataset.v; if (CK.fulfillment === 'pickup') CK.tip = 0; render(); },
  tocheckout: () => { const c = calc(); if (!S.cart.lines.length) return toast('Your cart is empty.'); if (!c.minOk) return toast('Some stores have not reached their minimum order.'); go('/checkout'); },
  gotrack: b => go('/track/' + b.dataset.id), odetail: b => go('/order/' + b.dataset.id), otab: b => { OT = b.dataset.v; render(); }, reorder: b => reorder(ORD(b.dataset.id)),
  
hideagain: b => {
  const id = String(b.dataset.id || '');
  if (!id) return;

  S.dismissedAgain = [
    ...new Set([...(S.dismissedAgain || []).map(String), id])
  ];

  save();
  toast('Removed from Order Again.');
  render();
},

  cancel:b=>void cancelRealOrder(b),
  orderoptions: b => {
    const card = b.closest('[data-order-cancel-gesture]');
    showOrderCancel(card, b.getAttribute('aria-expanded') === 'false');
  },
  'delivery-retry': () => { deliveryMessage = ''; updateDeliveryView(); },
  'delivery-gps': b => void selectDeliveryPin(false,b),
  'delivery-pin': b => void selectDeliveryPin(true,b),
  'delivery-quote': () => void getDeliveryQuote(),
  addrform: b => addrForm(b.dataset.id), addrdef: b => { S.addrs.forEach(a => a.def = a.id === b.dataset.id); save(); render(); },
  addrdel: b => confirmDlg('Delete this address?', 'Delete', true).then(ok => { if (ok) { S.addrs = S.addrs.filter(a => a.id !== b.dataset.id); if (S.addrs.length && !S.addrs.some(a => a.def)) S.addrs[0].def = true; save(); toast('Address deleted.'); render(); } }),
  payform:payPick,
  ftb: b => { FT = b.dataset.v; render(); }, ntab: b => { NT = b.dataset.v; render(); }, readall: () => { myNotes().forEach(n => n.read = true); save(); updateChrome(); render(); },
  nopen: b => { const n = S.notes.find(x => x.id === b.dataset.id); n.read = true; save(); updateChrome(); const m = n.t.match(/FD-\d+/); if (n.type === 'order' && m && ORD(m[0])) go('/track/' + m[0]); else if (n.type === 'promo') go('/promos'); else render(); },
  logout: () => confirmDlg('Log out of Papalita?', 'Log out').then(async ok => { if(ok){await window.PAPALITA_NOTIFICATIONS?.disconnectPhone();const result=await authDB().auth.signOut();if(result.error)return toast('Could not sign out: '+result.error.message);S.user.in=false; clearSession(); save(); AU.view = 'login'; render(); } }),
  clrrecent: () => { S.recent = []; save(); const g = $('#sg'); g && (g.innerHTML = ''); },
  install: () => window.PapalitaInstall?.open(), noinstall: () => window.PapalitaInstall?.dismiss(),
  'retry-catalogue': () => location.reload(),
  'about-papalita': () => openSheet(`<div class="pd" style="padding-top:40px">
    <h2 tabindex="-1" autofocus>About Papalita</h2>
    <p class="mu sm" style="margin-top:4px">Good Food, Good Mood.</p>
    <div style="line-height:1.65;margin-top:14px">
      <p>Papalita brings local food businesses in Alegria, Surigao del Norte, together in one app. You can find a familiar favorite, discover a nearby store, or see what is on the menu before you order.</p>
      <p style="margin-top:12px">Stores share their menus, prices, and availability through Papalita. Choose delivery or pickup where available, then follow your order in the Orders tab.</p>
      <p style="margin-top:12px">Planning a fiesta or family gathering? Send a catering inquiry to a participating store to discuss the menu, date, and number of guests.</p>
      <p style="margin-top:12px">We built Papalita to make local food easier to find and give Alegria's food businesses a place to share what they make.</p>
    </div>
  </div>`, {label:'About Papalita'})
};

let orderPress = null, heldOrderCard = null;
function stopOrderPress() {
  if (orderPress) clearTimeout(orderPress.timer);
  orderPress = null;
}
const orderPressCard = target => target.closest('button, a, input, select, textarea') ? null : target.closest('[data-order-cancel-gesture]');
function showOrderCancel(card, open) {
  $$('[data-order-cancel-action]:not([hidden])').forEach(action => { action.hidden = true; });
  $$('[data-a=orderoptions][aria-expanded=true]').forEach(button => button.setAttribute('aria-expanded', 'false'));
  if (!open) return;
  $('[data-order-cancel-action]', card).hidden = false;
  $('[data-a=orderoptions]', card).setAttribute('aria-expanded', 'true');
}
function revealHeldOrder(card) {
  stopOrderPress();
  if (!card.isConnected) return;
  showOrderCancel(card, true);
  heldOrderCard = card;
}
document.addEventListener('pointerdown', e => {
  if (!e.isPrimary || e.button !== 0) return;
  stopOrderPress();
  heldOrderCard = null;
  const card = orderPressCard(e.target);
  if (!card) return;
  const timer = setTimeout(() => revealHeldOrder(card), 500);
  orderPress = { id: e.pointerId, x: e.clientX, y: e.clientY, card, timer };
});
document.addEventListener('pointermove', e => {
  if (orderPress?.id === e.pointerId && Math.hypot(e.clientX - orderPress.x, e.clientY - orderPress.y) > 12) stopOrderPress();
});
for (const event of ['pointerup', 'pointercancel']) {
  document.addEventListener(event, e => {
    if (orderPress?.id === e.pointerId) stopOrderPress();
  });
}
window.addEventListener('scroll', stopOrderPress, { passive: true });
window.addEventListener('blur', stopOrderPress);
document.addEventListener('contextmenu', e => {
  const card = orderPressCard(e.target);
  if (!card) return;
  e.preventDefault();
  if (orderPress?.card === card) revealHeldOrder(card);
});
document.addEventListener('click', function (e) {
  // A control inside a card takes precedence over the card action.
  const button = e.target.closest('[data-a]');
  if (!button || button.disabled) return;
  if (button === heldOrderCard && e.detail > 0) {
    heldOrderCard = null;
    e.preventDefault();
    return;
  }
  const action = A[button.dataset.a];
  if (typeof action === 'function') {
    e.preventDefault();
    action(button, e);
  }
});
document.addEventListener('keydown', e => { const t = e.target; if ((e.key === 'Enter' || e.key === ' ') && t.matches('[role=link],[role=button]') && t.dataset.a) { e.preventDefault(); t.click(); }
  if (e.key === 'Enter' && t.id === 'q' && t.value.trim()) { e.preventDefault(); A.sugg({ dataset: { t: 'q', id: t.value.trim() } }); } });
document.addEventListener('input', e => { const t = e.target;
  if (t.id === 'q') { $('#sg').innerHTML = suggestions(t.value); $('[data-a=clearq]').hidden = !t.value; }
  if (t.id === 'dq') { F.q = t.value; $('[data-a=dclear]').hidden = !t.value; fillResults(); } });
document.addEventListener('change', e => { const t = e.target;
  if (t.matches('[data-sort]')) { F.sort = t.value; fillResults(); }
  if (t.id === 'pimg' && t.files[0]) { const f = t.files[0]; if (!/^image\//.test(f.type) || f.size > 6e6) return toast('Choose an image under 6 MB.'); const im = new Image(), u = URL.createObjectURL(f);
    im.onload = () => { const c = document.createElement('canvas'), s = Math.min(1, 256 / Math.max(im.width, im.height)); c.width = im.width * s; c.height = im.height * s; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); S.user.photo = c.toDataURL('image/jpeg', .85); save(); URL.revokeObjectURL(u); render(); toast('Photo saved on this device.'); }; im.src = u; } });
document.addEventListener('click', e => { if (!e.target.closest('#hs') && $('#sg')) $('#sg').innerHTML = ''; });
document.addEventListener('submit', async e => { e.preventDefault(); const f = e.target, v = id => ($('#' + id, f) || {}).value?.trim() || '', er = {}, show = () => { $$('.in', f).forEach(i => i.classList.remove('bad')); $$('[data-e]', f).forEach(x => x.textContent = ''); const k = Object.keys(er); k.forEach(x => { $('#' + x, f).classList.add('bad'); $(`[data-e=${x}]`, f).textContent = er[x]; }); if (k.length) $('#' + k[0], f).focus(); return k.length; };
  if(f.id==='pf'){await saveProfile(f);return;}
  if (f.id === 'cf') { if (v('cn').length < 2) er.cn = 'Enter your name.'; if (!PH.test(v('cp').replace(/\s/g, ''))) er.cp = 'Use a PH mobile number like 09171234567.'; if (!v('cd')) er.cd = 'Choose the event date.'; else if (v('cd') < todayPH()) er.cd = 'The date cannot be in the past.'; if (!v('ct')) er.ct = 'Choose a start time.'; const g = +v('cg'); if (!(g >= 10 && g <= 500)) er.cg = 'Enter 10 – 500 guests.'; if (show()) return;
    const btn=f.querySelector('button[type=submit],button.btn.p.blk');
    if(btn) {btn.disabled=true;btn.textContent='Sending request…';}
    try {
      const db=authDB(), {data:{user},error:authError}=await db.auth.getUser();
      if(authError)throw authError;
      if(!user)throw new Error('Please log in to send a catering request.');
      const rid=v('cr'),store_id=CATER_STORE_IDS[rid];
      if(!store_id)throw new Error('This store is not yet connected to Supabase.');
      const payload={store_id,customer_id:user.id,customer_name:v('cn'),customer_phone:v('cp'),
        event_type:v('ce'),event_date:v('cd'),event_time:v('ct'),guests:g,package:v('ck'),
        venue_barangay:v('cb'),venue_details:v('cv'),notes:v('cx'),status:'pending'};
      const {data,error}=await db.from('catering_requests').insert(payload).select('*').single();
      if(error)throw error;
      const q=fromCateringRow(data);
      S.cater=(S.cater||[]).filter(x=>x.id!==q.id);
      S.cater.unshift(q);S.user.phone=q.phone;
      notify('order',`Catering request sent · ${q.id}`,`${R(q.rid).name} will confirm by phone or message.`);
      save();go('/catering/sent/'+q.id);
    } catch(error) {toast('Request not sent: '+(error.message||'Unknown error'));}
    finally {if(btn){btn.disabled=false;btn.textContent='Send request';}}
    return; }
});


/* ---------- boot ---------- */
window.addEventListener('papalita-order-status', event => {
  const change=event.detail,order=S.orders.find(o=>String(o.id)===String(change?.order_id)&&o.source==='supabase'&&o.uid===S.user.id);
  if(!order||!['confirmed','preparing','ready','out_for_delivery','completed','cancelled'].includes(change.status))return;
  order.status=change.status;order.fulfillment=change.fulfillment_type||order.fulfillment;order.upd=Date.now();save();updateChrome();
  if(/^\/(orders|order\/|track\/)/.test(curPath())&&!sheetEl&&!/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName||''))render();
});
document.body.insertAdjacentHTML('afterbegin', '<div id="chrome"></div><div id="app"><main id="view" tabindex="-1"></main></div><div id="toasts" role="status" aria-live="polite"></div>');
window.addEventListener('papalita-install-ready', () => { if (S.user.in && curPath() === '/') render(); });
const recentHTML = () => (S.recent || []).length ? `<div class="sugg"><div class="row sp" style="padding:8px 10px"><b class="sm">Recent searches</b><button class="link gl" data-a="clrrecent" style="padding:4px">Clear</button></div>${S.recent.map(q => `<button data-a="sugg" data-t="q" data-id="${esc(q)}">${ic('clock', 18)}<span>${esc(q)}</span></button>`).join('')}</div>` : '';
document.addEventListener('focusin', e => { if (e.target.id === 'q' && !e.target.value && $('#sg')) $('#sg').innerHTML = recentHTML(); });
document.body.insertAdjacentHTML('beforeend', '<div id="offline" role="status" hidden>You are offline. Some features may not work.</div>');
const netUi = () => { const o = $('#offline'); if (o) o.hidden = navigator.onLine !== false; }; window.addEventListener('online', netUi); window.addEventListener('offline', () => { const o = $('#offline'); o && (o.hidden = false); });
authDB().auth.onAuthStateChange((event)=>{
  if(event==='PASSWORD_RECOVERY')setTimeout(()=>{AU.view='reset';render();},0);
  if(event==='SIGNED_OUT'){
    pendingPolicyUser=null;
    pendingGoogleProfile=null;
    takeGoogleAttempt();
    AU.googleDraft=undefined;
    AU.googleError='';
    AU.googlePendingForm=null;
    AU.busy=false;
    window.PapalitaLegal?.reset();
    setTimeout(()=>{S.user.in=false;AU.view='login';save();render();},0);
  }
});
Object.assign(A, AUTH_A);
// Supabase Auth is the source of truth.
S.user.in = false;
clearSession();
try {
  await restoreCustomerAuth();
} catch (err) { console.error('[Papalita] Auth restore failed:',err); }
chrome(); window.addEventListener('hashchange', render); render();
if (S.user.in && !onCheckout()) void prepareDeliveryPricing();
const bootstrapSkeleton = document.getElementById('papalita-bootstrap-skeleton');
if (bootstrapSkeleton) bootstrapSkeleton.remove();
Promise.resolve(window.papalitaSplashReady).then(() => {
  const splash = $('#splash');
  if (!splash) return;
  splash.classList.add('out');
  setTimeout(() => splash.remove(), 420);
});
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
