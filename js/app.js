/* Papalita customer app: live Supabase data and explicit unavailable states. */
(async () => {
'use strict';
const C=window.FOODIE_CONFIG,RS=window.RESTAURANTS,CATS=window.CATEGORIES;
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
  if(fees.status==='fulfilled'&&!fees.value.error){for(const f of fees.value.data||[])if(Number.isFinite(Number(f.fee))&&Number(f.fee)>=0)deliveryFees.set(f.barangay,Number(f.fee));}
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
  return `<span class="ph ${o.cls || ''}" style="${o.ar ? '--ar:' + o.ar : ''}">${ic('fork', 48)}${u ? `<img src="${esc(u)}"${u2 !== u ? ` srcset="${esc(u)} 1x, ${esc(u2)} 2x"` : ''} alt="${esc(alt)}" loading="${o.eager ? 'eager' : 'lazy'}" decoding="async">` : ''}</span>`; };
document.addEventListener('error', e => { const t = e.target; if (t.tagName === 'IMG' && t.closest('.ph')) t.closest('.ph').classList.add('failed'); }, true);

/* ---------- store ---------- */
const KEY = 'foodie.alegria.v1';
const R = id => RS.find(r => String(r.id) === String(id));
const ITEM = id => { for (const r of RS) { const i = r.items.find(i => i.id === id); if (i) return { item: i, rest: r }; } return null; };
const ALL = () => RS.flatMap(r => r.items.map(i => ({ item: i, rest: r })));
const brg = () => window.BRGYS.find(b => b.n === (S.loc || {}).brgy) || window.BRGYS[0];
const feeOf = () => deliveryFees.has(S.loc.brgy)?deliveryFees.get(S.loc.brgy):null;
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
const isOpen=r=>{if(r.closed||r.open_state===false)return false;if(!r.verifiedHours)return r.open_state===true;const o=toMin(r.hours[0]),c=toMin(r.hours[1]),n=nowMin();return c<o?n>=o||n<c:n>=o&&n<c;};
const hoursText = r => r.hours[0] === '00:00' && r.hours[1] === '24:00' ? 'Open 24 hours' : `${fmtT(r.hours[0])} – ${fmtT(r.hours[1])}`;

const defSel = item => { const s = {}; (item.opts||[]).forEach(g => { if (g.req && g.ch?.length) s[g.id] = [g.ch[0].n]; }); return s; };
const unitPrice = (item, sel) => Number(item.price) + (item.opts||[]).reduce((a, g) => a + (sel[g.id] || []).reduce((b, n) => b + Number((g.ch.find(c => c.n === n) || {}).p || 0), 0), 0);
const selText = l => Object.values(l.sel || {}).flat().join(', ');
const activeVouchers = (now = Date.now()) => window.PROMOS.filter(p => p.active !== false && Date.parse(p.expires_at) > now)
  .sort((a,b) => Date.parse(a.expires_at) - Date.parse(b.expires_at) || a.code.localeCompare(b.code));
const promoMatchesStore = (promo, rid) => !promo?.rid || String(promo.rid) === String(rid);
const validPromo = (p, sub, rid) => { if (!p || p.active === false) return 'This code is no longer active.'; if(p.expires_at&&Date.parse(p.expires_at)<=Date.now()) return 'This code has expired.'; if (p.rid && p.rid !== rid) return `Only valid for ${R(p.rid)?.name || "another store"} orders.`; if (sub < p.min) return `Add ${peso(p.min - sub)} more to use ${p.code}.`; return ''; };
function calc(cart = S.cart, code = S.promo) {
  const groups = cartGroups(cart);
  const sub = groups.reduce((n, g) => n + g.sub, 0);
  const pickup = CK.fulfillment === 'pickup';
  const feeKnown=pickup||Number.isFinite(feeOf());
  const fee=pickup?0:groups.reduce((n,g)=>n+(Number(feeOf(g.rest))||0),0);
  const p = code && window.PROMOS.find(x => x.code === code);
  // Store-specific codes apply only to the matching store, never another store.
  const eligible = groups.filter(g => promoMatchesStore(p, g.rid));
  const eligibleSub = eligible.reduce((n, g) => n + g.sub, 0);
  const eligibleFee = pickup ? 0 : eligible.reduce((n, g) => n + (g.rest ? feeOf(g.rest) : 0), 0);
  let perr = code && !p ? 'This promotion is no longer available.' : '';
  if (p) {
    perr = eligible.length ? validPromo(p, eligibleSub, p.rid || eligible[0].rid) : 'This voucher is not valid for the stores in your cart.';
    if (!perr && p.type === 'ship') {
      if (pickup) perr = 'This voucher is for delivery orders only.';
      else if (!feeKnown) perr = 'Delivery charges are unavailable for this barangay.';
      else if (eligibleFee === 0) perr = 'There is no delivery fee to discount.';
    }
  }
  let disc = 0;
  if (p && !perr) disc = p.type === 'flat' ? Math.min(p.value, eligibleSub) : p.type === 'percent' ? Math.min(Math.round(eligibleSub * p.value / 100), p.cap ?? Infinity, eligibleSub) : eligibleFee;
  const total = Math.max(0, sub + fee - disc);
  return { r: groups[0]?.rest, groups, sub, fee, feeKnown, disc, perr, promo: p, eligibleSub, total,
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
  return `<article class="card big" data-reveal tabindex="0" role="link" data-a="rest" data-id="${esc(r.id)}" aria-label="${esc(r.name)}">${hrt('rests',r.id)}<span class="pp-store-state ${op?'':'pp-store-closed'}">${op?'Open':'Closed'}</span>${photo(r.cover, `${r.name} store photo`)}<div class="bd"><h3>${esc(r.name)}</h3><div class="meta2">${esc(r.kind)}</div></div></article>`;
}

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
const NAVS = [['home', 'Home', '/'], ['search', 'Search', '/discover'], ['orders', 'Orders', '/orders'], ['usercircle', 'Profile', '/profile']];
const DNAV = [['Home', '/'], ['Browse', '/discover'], ['Catering', '/catering'], ['Orders', '/orders'], ['Nearby', '/nearby'], ['Favorites', '/favorites']];
const curPath = () => (location.hash.slice(1) || '/').split('?')[0];
const activeNav = () => { const p=curPath(); return /^\/(discover|restaurant|categories)/.test(p)?'/discover':/^\/(orders|order\/|track|confirmation)/.test(p)?'/orders':/^\/(profile|addresses|payments|notifications|support|promos|favorites)/.test(p)?'/profile':'/'; };
const deskNav = () => { const p = curPath(); return p === '/' ? '/' : /^\/catering/.test(p) ? '/catering' : /^\/(discover|restaurant|categories)/.test(p) ? '/discover' : /^\/(orders|order\/|track|confirmation)/.test(p) ? '/orders' : /^\/nearby/.test(p) ? '/nearby' : /^\/favorites/.test(p) ? '/favorites' : ''; };
function chrome() {
  $('#chrome').innerHTML = `<header class="topbar"><a class="logo" href="#/" aria-label="Papalita home"><i><img src="images/papalita_mark_color.png" alt="" style="width:34px;height:34px;object-fit:contain"></i>Papalita</a>
  <nav aria-label="Main">${DNAV.map(([l, p]) => `<a href="#${p}" data-d="${p}">${l}</a>`).join('')}</nav>
  <button class="locpill" data-a="loc" style="margin:0">${ic('pin', 15)}<span data-loc></span>${ic('chevd', 14)}</button>
  <a class="ib" href="#/notifications" aria-label="Notifications">${ic('bell')}<span class="badge" data-un hidden></span></a>
  <a class="ib pp-desktop-cart" href="#/cart" aria-label="Cart">${ic('cart')}<span class="badge" data-cc hidden></span></a><a href="#/profile" aria-label="Profile">${avatar()}</a></header>
  <a class="pp-cart-anchor" href="#/cart" aria-label="View cart">${ic('cart',21)}<span class="badge" data-cc hidden></span></a><nav class="bnav" aria-label="Main">${NAVS.map(([i, l, p]) => `<a href="#${p}" data-p="${p}">${i === 'cart' ? `<span class="icw">${ic(i, 26)}<span class="badge" data-cc hidden></span></span>` : ic(i, 26)}<span>${l}</span></a>`).join('')}</nav>`;
}
const defAddr = () => S.addrs.find(a => a.def) || S.addrs[0];
let holdCart = false;
function updateChrome(bump) {
  setTimeout(()=>window.dispatchEvent(new Event('papalita-ui-rendered')),0);
  const a = activeNav(), d = deskNav(); $$('[data-p]').forEach(el => { const on = el.dataset.p === a; el.classList.toggle('on', on); on ? el.setAttribute('aria-current', 'page') : el.removeAttribute('aria-current'); });
  $$('[data-d]').forEach(el => el.classList.toggle('on', el.dataset.d === d));
  if (!holdCart) $$('[data-cc]').forEach(el => { const n = cartCount(); el.hidden = !n; el.textContent = n; if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } });
  $$('[data-un]').forEach(el => { const n = unread(); el.hidden = !n; el.textContent = n; });
  $$('[data-loc]').forEach(el => el.textContent = S.loc.label);
}

/* ---------- home ---------- */

let HC = 'all';

/* Home: swipeable stores and category-filtered popular food */
let PD = 'all';

const fillCurated = () => {
  const target = $('#cur');
  if (!target) return;
  const stores = RS.filter(r => HC === 'all' || r.cat === HC || (r.items || []).some(i => i.cat === HC));
  target.innerHTML = stores.length
    ? stores.map(restCard).join('')
    : emptyState('search', 'No stores yet', 'Try another category.');
  $$('[data-a=hcat]').forEach(b => {
    b.classList.toggle('on', b.dataset.id === HC);
    b.setAttribute('aria-pressed', String(b.dataset.id === HC));
  });
  window.PapalitaMotion?.refresh($('#view'));
};

const popularDishes = () => ALL()
  .filter(({item}) => PD === 'all' || item.cat === PD)
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
  const choices = RS.flatMap(rest => {
    for(const item of rest.items){
      if(!item.available)continue;
      const url=window.photoUrl(item.img);
      if(!url||seen.has(url))continue;
      seen.add(url);
      return [{item, rest}];
    }
    return [];
  });
  if (!choices.length) return `<div class="pp-hero-logo"><img src="images/papalita_mark_color.png" alt="Papalita"></div>`;
  return `<div class="pp-food-slides" data-food-slideshow aria-label="Food from the Papalita menu">${choices.map(({item,rest},i)=>`<div class="pp-food-slide ${i===0?'pp-slide-active':''}" data-food-slide aria-hidden="${i!==0}" ${i?'inert':''}>${photo(item.img,`${item.name} from ${rest.name}`,{eager:i===0,w:780})}<div class="pp-food-caption"><b>${esc(item.name)}</b><small>${esc(rest.name)}</small></div></div>`).join('')}${choices.length>1?`<div class="pp-food-controls" aria-label="Food photos">${choices.map(({item},i)=>`<button type="button" data-slide-index="${i}" aria-label="Show ${esc(item.name)}" aria-pressed="${i===0}"></button>`).join('')}</div>`:''}</div>`;
};
const voucherMoney = n => Number.isInteger(n) ? '₱' + n.toLocaleString('en-PH') : peso(n);
const voucherTitle = promo => promo.type==='ship'?'Free delivery':promo.type==='percent'?`${promo.value}% off your order`:`${voucherMoney(promo.value)} off your order`;
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
      </div>`;
      key=nextKey;
    }
    controls.hidden=promos.length<2;
    $('[data-voucher-position]',controls).textContent=`${index+1} / ${promos.length}`;
    const seconds=Math.ceil((Date.parse(promo.expires_at)-now)/1000);
    $('[data-voucher-clock]',slide).textContent=[Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':');
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
    <header class="pp-home-header"><a href="#/" class="pp-mini-brand" aria-label="Papalita home"><img src="images/papalita_mark_color.png" alt="">Papalita</a><button class="loc" data-a="loc" aria-label="Change delivery location"><span class="lab">Deliver to</span><span class="locv">${esc(S.loc.label)}${ic('chevd',14)}</span></button><a class="pp-home-bell pp-home-cart" href="#/notifications" aria-label="Notifications">${ic('bell',21)}</a><a class="pp-home-cart" href="#/cart" aria-label="View cart">${ic('cart',21)}<span class="badge" data-cc hidden></span></a></header>
    ${window.PapalitaInstall?.canOffer() ? `<aside class="pp-install-strip" aria-label="Install Papalita">
      <img src="images/papalita-icon-192-v2.png" width="40" height="40" alt="">
      <span class="grow"><b>Papalita on your phone</b><small>Open straight from your home screen.</small></span>
      <button type="button" class="btn p" data-a="install">Install</button>
      <button type="button" class="pp-install-close" data-a="noinstall" aria-label="Dismiss install banner">${ic('x',17)}</button>
    </aside>` : ''}
    ${catalogueError?`<div class="pp-catalog-error" role="alert">${esc(catalogueError)} <button class="link gl" data-a="retry-catalogue">Refresh</button></div>`:''}
    <div class="pp-hero"><div class="pp-hero-copy"><span class="pp-kicker">Made for your everyday</span><h1>Your local favorites,<br><em>delivered.</em></h1><p>Find your next coffee, comfort meal, or something worth sharing in Alegria.</p><button class="btn p" data-a="qa" data-id="rests">Explore stores ${ic('arrow',17)}</button></div><div class="pp-hero-visual">${foodVisual()}<div class="pp-float-note">${ic('store',23)}<span><b>From around the neighborhood</b><small>Alegria, Surigao del Norte</small></span></div></div></div>
    <div id="pp-home-voucher" hidden><section class="pp-home-voucher" aria-label="Limited-time vouchers">
      <div data-voucher-slide></div>
      <div class="pp-voucher-controls" data-voucher-controls hidden><button type="button" data-voucher-step="-1" aria-label="Previous voucher">${ic('back',17)}</button><span data-voucher-position></span><button type="button" data-voucher-step="1" aria-label="Next voucher">${ic('chev',17)}</button></div>
    </section></div>
    <div class="search pp-home-search" id="hs"><div class="sbox">${ic('search',21)}<input id="q" type="search" placeholder="Search food or stores" aria-label="Search food or stores" aria-controls="sg" autocomplete="off"><button class="ib" data-a="clearq" aria-label="Clear search" hidden>${ic('x',18)}</button><button class="ib" data-a="filters" aria-label="Search filters">${ic('sliders',19)}</button></div><div id="sg"></div></div>
    ${CATS.length?`<div class="pp-categories" role="group" aria-label="Menu categories"><button class="chipc on" data-a="hcat" data-id="all" aria-pressed="true">${ic('grid',16)}All food</button>${CATS.map(c=>`<button class="chipc" data-a="hcat" data-id="${esc(c.id)}" aria-pressed="false">${esc(c.name)}</button>`).join('')}</div>`:''}
    ${act?`<a class="mint row" href="#/track/${esc(act.id)}" style="margin-top:18px">${ic(orderStatus.mode(act)==='pickup'?'store':'orders',24)}<span class="grow"><b>Your order</b><br><span class="sm mu">${esc(R(act.rid)?.name || 'Store')} · ${esc(orderStatus.copy(act)[0])}</span></span>${ic('chev',18)}</a>`:''}
    <div class="sec"><div class="sec-h"><h2>Stores near you</h2><button class="link gl" data-a="qa" data-id="rests">See all ${ic('arrow',16)}</button></div><div class="store-swipe" id="cur" aria-label="Stores carousel"></div></div>
    <div class="sec"><div class="sec-h"><h2>On the menu</h2><button class="link gl" data-a="qa" data-id="order">See all ${ic('arrow',16)}</button></div><div class="chips popular-chips" role="group" aria-label="Filter menu"><button class="chip on" data-a="pcat" data-id="all" aria-pressed="true">All food</button>${CATS.map(c=>`<button class="chip" data-a="pcat" data-id="${esc(c.id)}" aria-pressed="false">${esc(c.name)}</button>`).join('')}</div><div class="popular-grid" id="popular-dishes"></div></div>
    ${RS.some(r=>r.catering)?`<a class="mint row home-promo-card" href="#/catering">${ic('box',24)}<span class="grow"><b>Bring everyone to the table.</b><br><span class="sm mu">Ask participating stores about catering.</span></span>${ic('arrow',19)}</a>`:''}
    ${customerFooter()}</section>`,after:()=>{fillCurated();fillPopular();watchHomeVoucher();}};
};
function authLayout(){return `<div class="pp-auth-layout"><aside class="pp-auth-pitch" aria-label="About Papalita"><div class="pp-auth-brand"><img src="images/papalita_mark_color.png" alt=""><span><b>Papalita</b><small>GOOD FOOD, GOOD MOOD.</small></span></div><div><span class="pp-kicker">Alegria, Surigao del Norte</span><h2>A good mood<br>is <em>on the menu.</em></h2><p>Cafés, comfort food, and local favorites. Find your next delicious moment with Papalita.</p></div><div class="pp-auth-photo">${foodVisual()}</div></aside><div class="pp-auth-form">${authScreen()}</div></div>`;}

function suggestions(q) {
  q = q.trim().toLowerCase(); if (!q) return ''; const has = s => s.toLowerCase().includes(q), out = [];
  CATS.filter(c => has(c.name)).slice(0, 2).forEach(c => out.push(`<button data-a="sugg" data-t="cat" data-id="${c.id}">${photo(c.img, '', { w: 100 })}<span><b>${esc(c.name)}</b><br><span class="sm mu">Cuisine</span></span></button>`));
  RS.filter(r => has(r.name) || has(r.kind)).slice(0, 3).forEach(r => out.push(`<button data-a="sugg" data-t="rest" data-id="${r.id}">${photo(r.cover, '', { w: 100 })}<span><b>${esc(r.name)}</b><br><span class="sm mu">Restaurant · ${esc(r.kind)}</span></span></button>`));
  ALL().filter(x => has(x.item.name) || has(x.item.desc)).slice(0, 4).forEach(x => out.push(`<button data-a="sugg" data-t="item" data-id="${x.item.id}">${photo(x.item.img, '', { w: 100 })}<span><b>${esc(x.item.name)}</b><br><span class="sm mu">${esc(x.rest.name)} · ${peso(x.item.price)}</span></span></button>`));
  return `<div class="sugg" role="listbox">${out.join('') || `<p class="mu" style="padding:14px">No matches for “${esc(q)}”. Try “burger”, “ramen” or “milk tea”.</p>`}<button data-a="sugg" data-t="q" data-id="${esc(q)}">${ic('search', 18)}<span>Search all for “<b>${esc(q)}</b>”</span></button></div>`;
}

/* ---------- discover ---------- */
let F = { tab: 'dishes', q: '', cat: 'all', price: 0, rating: 0, eta: 0, promo: false, sort: 'popular', open: false };
V.discover = (_, p) => { if (p.get('reset')) F = { ...F, q: '', cat: 'all', price: 0, rating: 0, eta: 0, promo: false, sort: 'popular', open: false }; if (p.has('q')) F.q = p.get('q'); if (p.has('cat')) F.cat = p.get('cat'); if (p.has('tab')) F.tab = p.get('tab'); if (p.get('f')) F.open = true;
  return { html: `<section class="view">${pageHead(F.tab === 'dishes' ? 'Order food' : 'Restaurants')}<div class="search" style="margin-top:0"><div class="sbox">${ic('search', 22)}<input id="dq" type="search" value="${esc(F.q)}" placeholder="Search dishes, restaurants, cuisines, ingredients" aria-label="Search" autocomplete="off"><button class="ib" data-a="dclear" aria-label="Clear search" ${F.q ? '' : 'hidden'}>${ic('x', 18)}</button><i class="vr"></i><button class="ib" data-a="ftoggle" aria-label="Toggle filters" aria-expanded="${F.open}">${ic('sliders', 22)}</button></div></div>
  <div class="chips" style="margin-top:14px" role="tablist">${[['dishes', 'Dishes'], ['rests', 'Restaurants']].map(([k, l]) => `<button class="chip ${F.tab === k ? 'on' : ''}" role="tab" aria-selected="${F.tab === k}" data-a="ftab" data-v="${k}">${l}</button>`).join('')}</div><div id="dfilters"></div><div id="results" aria-live="polite"></div></section>`, after: fillDiscover }; };
const chipRow = (k, opts) => `<div class="chips">${opts.map(([v, l]) => `<button class="chip ${F[k] === v ? 'on' : ''}" data-a="flt" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`;
function fillDiscover() {
  $('#dfilters').innerHTML = `<div class="chips" style="margin:14px 0 4px"><button class="chip ${F.cat==='all'?'on':''}" data-a="flt" data-k="cat" data-v="all">All</button>${CATS.map(c=>`<button class="chip ${F.cat===c.id?'on':''}" data-a="flt" data-k="cat" data-v="${esc(c.id)}">${esc(c.name)}</button>`).join('')}</div>${F.open?`<div class="panel" style="margin-top:12px"><div class="field"><label>Item price</label>${chipRow('price',[[0,'Any'],[150,'Under ₱150'],[300,'Under ₱300']])}</div><div class="field" style="margin:0"><label for="sort">Sort by</label><select id="sort" class="in" data-sort><option value="popular">Menu order</option><option value="price">Lowest price</option></select></div></div>`:''}`;
  const s=$('#sort');if(s)s.value=F.sort;fillResults();
}
function fillResults() {
  const terms = F.q.toLowerCase().split(/\s+/).filter(Boolean), cn = id => (CATS.find(c => c.id === id) || {}).name || '';
  let html, n;
  if (F.tab === 'dishes') {
    let a = ALL().filter(({ item: i, rest: r }) => (F.cat === 'all' || i.cat === F.cat) && (!F.price || i.price <= F.price) && terms.every(t => `${i.name} ${i.desc} ${r.name} ${r.kind} ${cn(i.cat)}`.toLowerCase().includes(t)));
    if(F.sort==='price')a.sort((x,y)=>x.item.price-y.item.price);
    n = a.length; html = a.map(dishCard).join('');
  } else {
    let a = RS.filter(r => (F.cat === 'all' || r.cat === F.cat || r.items.some(i => i.cat === F.cat)) && (!F.price || Math.min(...r.items.map(i => i.price)) <= F.price) && terms.every(t => `${r.name} ${r.kind} ${r.items.map(i => i.name + ' ' + i.desc).join(' ')}`.toLowerCase().includes(t)));
    if(F.sort==='price')a.sort((x,y)=>Math.min(...x.items.map(i=>i.price))-Math.min(...y.items.map(i=>i.price)));
    n = a.length; html = a.map(restCard).join('');
  }
  $('#results').innerHTML = n ? `<p class="mu sm" style="margin:12px 0">${n} ${F.tab === 'dishes' ? 'dish' : 'restaurant'}${n > 1 ? (F.tab === 'dishes' ? 'es' : 's') : ''} found</p><div class="grid ${F.tab === 'rests' ? 'restaurant-results-grid' : ''}">${html}</div>` : emptyState('search', 'No matches', 'Try a different word or remove a filter.', 'Clear filters', 'fclear');
}

/* ---------- restaurant ---------- */
V.restaurant = id => { const r = R(id); if (!r) return V.notFound(); const op = isOpen(r), secs = [...new Set(r.items.map(i => i.sec))];
  return { html: `<section class="view"><div class="cover">${photo(r.cover, r.name + ' cover photo', { w: 1200, eager: 1 })}<div class="cov-sh"></div><div class="cov-b"><button class="ib w" data-a="back" aria-label="Go back">${ic('back')}</button><span class="row">${hrt('rests', r.id)}<button class="ib w" data-a="share" data-id="${r.id}" aria-label="Share restaurant">${ic('share')}</button></span></div></div>
  <div class="fcard"><div class="row sp"><h1 style="font-size:28px">${esc(r.name)}</h1><span class="status ${op?'open':'closed'}">${op?'Open':'Closed'}</span></div><p class="mu" style="margin-top:6px">${esc(r.kind)} • ${esc(r.addr)}${op?'':' • Not accepting orders'}</p>
  <div class="stats"><div>${ic('store',18,'gc')}Menu & availability</div><div>${ic('pin',18,'gc')}Alegria</div></div></div>
  <p class="sm mu" style="margin:12px 6px 0">${r.busy ? `<span class="status closed">Busy · +${r.busy} min</span> ` : ''}${r.promo ? ` · <button class="link gl" style="padding:0" data-a="usepromo" data-id="${r.promo}">Code ${r.promo}</button>` : ''}</p>
  ${r.feature ? `<button class="mint row" data-a="jump" data-id="s-${esc(r.feature.sec)}" style="width:100%;text-align:left;margin-top:14px">${photo(r.feature.img, r.feature.title, { ar: '1', w: 200 }).replace('class="ph', 'style="width:64px;border-radius:16px;flex:none" class="ph')}<span class="grow"><b style="font-size:17px">${esc(r.feature.title)}</b><br><span class="sm mu">${esc(r.feature.sub)}</span></span>${ic('chev', 18, 'mu')}</button>` : ''}
  ${r.catering ? `<div class="mint row" style="margin-top:12px">${ic('box', 26, 'gc')}<span class="grow"><b>Ask about catering</b><br><span class="sm mu">Confirm menus, prices and availability with the store.</span></span><button class="btn p sm" data-a="cater" data-id="${r.id}">Request</button></div>` : ''}
  <div class="chips solid" style="margin-top:12px;position:sticky;top:var(--st);background:var(--bg);z-index:5;padding:10px 0">${secs.map((s, k) => `<button class="chip ${k ? '' : 'on'}" data-a="jump" data-id="s-${esc(s)}">${esc(s)}</button>`).join('')}${r.catering ? '<button class="chip" data-a="jump" data-id="s-catering">Catering</button>' : ''}${r.stay ? '<button class="chip" data-a="jump" data-id="s-stay">Stay &amp; Events</button>' : ''}</div>
  ${secs.map((s, k) => `<div id="s-${esc(s)}" style="margin-top:18px"><div class="sec-h" style="margin-bottom:4px"><h2>${esc(s)}</h2></div><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,420px),1fr));gap:0 28px">${r.items.filter(i => i.sec === s).map(i => `<div class="mi" tabindex="0" role="button" data-a="item" data-id="${i.id}" aria-label="${esc(i.name)} ${peso(i.price)}">${photo(i.img, i.name, { ar: '1', w: 300 })}<div class="bd"><div class="row sp" style="align-items:flex-start"><h3 style="font-size:18px">${esc(i.name)}</h3><span class="mu">${peso(i.price)}</span></div><p class="mu sm" style="margin:6px 0 10px">${esc(i.desc)}</p>${i.available ? `<button class="addp" data-a="quick" data-id="${i.id}" ${op ? '' : 'disabled'} aria-label="Quick add ${esc(i.name)}">${ic('plus', 16)}Add</button>` : '<span class="status closed">Sold out</span>'}</div></div>`).join('')}</div></div>`).join('')}
  ${r.catering ? cateringSection(r) : ''}
  <div class="sec"><h2 style="margin-bottom:10px">Contact</h2><div class="panel">${contactBtns(r)}</div></div>
  <div class="sec"><h2 style="margin-bottom:10px">Opening hours</h2><div class="panel"><div class="row sp"><span>Store hours</span><b>${r.verifiedHours?hoursText(r):'Ask the store'}</b></div></div></div>
</section>` }; };

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
    return `<button type="button" class="pp-voucher-option" data-a="usepromo" data-id="${esc(p.code)}" aria-pressed="${selected}" ${quote.perr?'disabled':''}>
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
function renderVoucherCheckout(){
  const phone=$('#cp')?.value, note=$('#di')?.value, position=scrollY;
  render();
  if(phone!=null&&$('#cp'))$('#cp').value=phone;
  if(note!=null&&$('#di'))$('#di').value=note;
  $('[data-a=choosevoucher]')?.focus({preventScroll:true});
  window.scrollTo(0,position);
}
V.cartView = () => { const c = calc();
  if (!S.cart.lines.length) return { html: `<section class="view">${pageHead('Your cart')}${emptyState('cart', 'Your cart is empty', 'Add something delicious and it will show up here.', 'Browse food', 'browse')}</section>` };
  const a = S.addrs.find(x => x.id === CK.addr) || defAddr(); if (a) CK.addr = a.id; const r=c.r;
  const pl = payLabel(), tip = CK.tip || 0; const fee = c.promo && !c.perr && c.promo.type === 'ship' ? `<s class="mu">${peso(c.fee)}</s> <b class="gl">Free</b>` : c.feeKnown?peso(c.fee):'Not configured';
  return { html: `<section class="view pp-cart-view" style="max-width:640px;margin:0 auto"><div class="rv-h"><button class="ib w" data-a="back" aria-label="Go back">${ic('back')}</button><h1>ORDER REVIEW</h1><span style="width:44px"></span></div>
  <div class="rv-lab"><span>Order type</span></div><div class="chips"><button class="chip ${CK.fulfillment === 'delivery' ? 'on' : ''}" data-a="fulfillment" data-v="delivery">Delivery</button><button class="chip ${CK.fulfillment === 'pickup' ? 'on' : ''}" data-a="fulfillment" data-v="pickup">Pickup at store</button></div><div class="rv-lab"><span>${CK.fulfillment === 'pickup' ? 'Pickup locations' : 'Delivery address'}</span>${CK.fulfillment === 'pickup' ? '' : '<button data-a="addrpick">EDIT</button>'}</div>
  ${CK.fulfillment === 'pickup' ? `<div class="panel">${c.groups.map(g => `<p><b>${esc(g.rest?.name || 'Store')}</b><br>${esc(g.rest?.addr || 'Contact the store for pickup location')}</p>`).join('')}</div>` : `<div class="row" style="gap:14px"><span class="pbtn" style="width:56px;height:56px;background:#fff;color:var(--ink);box-shadow:var(--sh)">${ic('pin', 22)}</span><div class="grow">${a ? `<b style="font-size:20px">${esc(a.label)}</b> ${a.def ? '<span class="status n" style="letter-spacing:.06em">PRIMARY</span>' : ''}<p class="mu">${esc(a.line)} • ${esc(a.city)}${a.landmark ? '<br>Landmark: ' + esc(a.landmark) : ''}</p>` : `<b>No address yet</b><p class="mu">Add where we should deliver.</p>`}</div></div>`}
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
  <div class="sum" style="margin-top:18px;font-size:18px"><div class="r mu"><span>Order Subtotal</span><b style="color:var(--ink)">${peso(c.sub)}</b></div><div class="r mu"><span>${CK.fulfillment === 'pickup' ? 'Pickup Fee' : 'Delivery fee estimate'}</span><b style="color:var(--ink)">${fee}</b></div>${c.disc && c.promo?.type !== 'ship' ? `<div class="r gl"><span>Promo ${esc(c.promo?.code||'Recorded discount')}</span><b>−${peso(c.disc)}</b></div>` : ''}${tip ? `<div class="r mu"><span>Rider tip</span><b style="color:var(--ink)">${peso(tip)}</b></div>` : ''}<p class="sm mu">Check tax details with the store.</p></div>
  ${!c.feeKnown?'<p class="note" style="margin-top:15px">Delivery charges are not configured for this barangay. Choose pickup or contact the store.</p>':''}
  ${!c.minOk ? `<p class="err" style="margin:10px 0">Some stores have not reached their minimum order amount.</p>` : ''}
  <button class="pbar" id="place" data-a="place" data-total="${c.total+tip}" ${c.minOk&&c.feeKnown&&!c.perr?'':'disabled'}><span>Place Order</span><i></i><b>${c.feeKnown?peso(c.total+tip):'Fee unavailable'}</b></button>
  <p class="mu sm" style="text-align:center;margin-top:12px;letter-spacing:.04em">TAPPING PLACE ORDER CONFIRMS YOUR ACCEPTANCE OF TERMS</p><p style="text-align:center;margin-top:8px"><span class="sm mu">Orders are submitted securely to Papalita. Cash payment only.</span></p></section>` }; };

/* ---------- checkout ---------- */
let CK = { addr: null, pay: 'cod', det: {}, fulfillment: 'delivery', tip: 0 };
const PH = /^(09|\+639)\d{9}$/;
const payLabel=()=>[CK.fulfillment==='pickup'?'Cash on Pickup':'Cash on Delivery',CK.fulfillment==='pickup'?'PAY AT THE STORE':'PAY ON ARRIVAL'];
function addrPick() { const el = openSheet(`<div class="pd" style="padding-top:34px"><h2 style="margin-bottom:12px">Deliver to</h2>${S.addrs.map(a => `<label class="opt"><input type="radio" name="ap" value="${a.id}" ${(CK.addr || (defAddr() || {}).id) === a.id ? 'checked' : ''}><span class="grow"><b>${esc(a.label)}</b><br><span class="mu sm">${esc(a.line)}, ${esc(a.city)}</span></span></label>`).join('')}<button class="btn s blk" data-a="addrform" style="margin-top:6px">${ic('plus', 18)}Add new address</button><button class="btn o blk" data-a="loc" style="margin-top:8px">${ic('pin', 18)}Change barangay</button></div>`, { label: 'Delivery address' });
  el.addEventListener('change', e => { if (e.target.name === 'ap') { CK.addr = e.target.value; S.addrs.forEach(a => a.def = a.id === CK.addr); syncLoc(S.addrs.find(a => a.id === CK.addr)); save(); closeSheet(); updateChrome(); render(); } }); }
async function placeOrder() {
  let c=calc();const a=S.addrs.find(x=>x.id===CK.addr)||defAddr();
  if (!S.cart.lines.length) return;
  const phoneField = $('#cp'), phone = (phoneField.value || '').trim().replace(/\s/g, '');
  $('#cpe').textContent = ''; phoneField.classList.remove('bad');
  if (CK.fulfillment !== 'pickup' && !a) { toast('Add a delivery address first.'); return addrForm(); }
  if (!PH.test(phone)) { phoneField.classList.add('bad'); $('#cpe').textContent = 'Use a PH mobile number like 09171234567.'; return phoneField.focus(); }
  if (!c.minOk) return toast('One or more stores have not reached their minimum order.');
  if(!c.feeKnown)return toast('Delivery charges are not configured. Choose pickup or contact the store.');
  if (CK.pay !== 'cod') return toast('Only cash payment is available.');
  const db = window.PAPALITA_DB;
  if (!db) return toast('Supabase is unavailable. Please try again.');
  const btn = $('#place'); btn.disabled = true; btn.firstElementChild.textContent = 'Placing orders…';
  const reviewedTotal=Number(btn.dataset.total??(c.total+CK.tip)), reviewedPromo=S.promo;
  try {
    const { data: auth, error: authError } = await db.auth.getUser();
    if (authError) throw authError;
    if (!auth?.user) throw new Error('Please sign in again before ordering.');
    const address = CK.fulfillment === 'pickup' ? 'Pickup at store' : `${a.label} — ${a.line}${a.landmark ? ' (' + a.landmark + ')' : ''}, ${a.city}`;
    await refreshCommercialData();
    c=calc();
    if(c.perr||reviewedPromo!==S.promo||Math.abs(reviewedTotal-c.total-CK.tip)>.009){
      renderVoucherCheckout();
      throw Error(c.perr||'Charges or promotions changed. Review the updated total before ordering.');
    }
    if(!c.feeKnown)throw Error('Delivery charges are not configured. Choose pickup or contact the store.');
    let eligibleRunning=0, allocatedCents=0;
    const groups = c.groups.map((g, index) => {
      if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(g.rid))) throw new Error('Invalid store ID. Refresh the menu and retry.');
      const storeFee = CK.fulfillment === 'pickup' ? 0 : feeOf(g.rest);
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
        items: g.lines.map(l => ({ product_id: l.itemId, quantity: l.qty, selected_options: l.sel || {}, special_instructions: l.note || '' })) };
    });
    // Atomic database transaction: do not clear the cart until the server confirms all orders.
    const { data, error } = await db.rpc('papalita_place_orders', {
      p_groups: groups, p_address: address, p_phone: phone,
      p_fulfillment: CK.fulfillment, p_payment_method: 'cod'
    });
    if (error) throw error;
    if (!Array.isArray(data) || data.length !== groups.length) throw new Error('Server did not confirm all store orders. Check order history before retrying.');
    const createdAt = Date.now();
    const orders = groups.map((g, index) => {
      const group = c.groups[index], result = data[index];
      return { id: result.order_id, rid: g.store_id, items: group.lines.map(l => ({ ...l })),
        sub: Number(result.subtotal), fee: Number(result.delivery_fee), disc: g.discount,
        total: Number(result.total_amount), tip: g.tip, promo: g.discount ? reviewedPromo : null,
        createdAt, source: 'supabase', status: 'pending', stage: 0, upd: createdAt, uid: auth.user.id,
        fulfillment: CK.fulfillment, addr: address, note: ($('#di').value || '').trim(),
        contact: { name: S.user.name, phone }, pay: { method: 'cod', status: 'unpaid', source: 'supabase' } };
    });
    S.user.phone = phone; CK.tip = 0; S.orders.unshift(...orders);
    S.cart = { rid: null, lines: [] }; S.promo = null;
    orders.forEach(o => notify('order', `Order submitted · ${o.id}`, `${R(o.rid)?.name || 'Store'} order saved to Supabase.`));
    save(); updateChrome(); nav('/confirmation/' + orders[0].id);
    // Notification failures must never turn an already saved order into a
    // checkout failure or invite a second purchase.
    for(const order of orders){
      try{Promise.resolve(window.PAPALITA_NOTIFICATIONS?.orderPlaced(order.id)).catch(error=>console.warn('[Papalita] Order phone alert:',error.message));}
      catch(error){console.warn('[Papalita] Order phone alert:',error.message);}
    }
    if (orders.length > 1) toast(`${orders.length} store orders submitted successfully.`);
  } catch (error) {
    console.error('[Papalita] Checkout failed:', error);
    toast('Order not confirmed: ' + (error.message || 'Please try again.'));
    if(btn.isConnected){btn.disabled=false;btn.firstElementChild.textContent='Place Order';}
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
function orderMapLink(order, fulfillment) {
  if (order.status === 'cancelled' || !['pickup','delivery'].includes(fulfillment)) return '';
  const store = R(order.rid);
  const place = fulfillment === 'pickup'
    ? [store?.name?.trim(),store?.addr?.trim()].filter(Boolean).join(', ')
    : String(order.addr || '').replace(/^.*? — /, '').trim();
  if (!place || place.toLowerCase() === 'pickup at store') return '';
  const destination = /\bSurigao del Norte\b/i.test(place) ? place
    : place + (/\bAlegria\b/i.test(place) ? '' : ', Alegria') + ', Surigao del Norte';
  const action = fulfillment === 'pickup' ? 'dir/?api=1&destination=' : 'search/?api=1&query=';
  const url = 'https://www.google.com/maps/' + action + encodeURIComponent(destination);
  return `<a class="btn s sm" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${ic('pin',16)}${fulfillment === 'pickup' ? 'Directions to store' : 'View drop-off map'}</a>`;
}
/* ---------- receipt ---------- */
function receiptHTML(o, anim) { const r=R(o.rid)||{name:'Store',items:[]}, pr = o.promo && window.PROMOS.find(p => p.code === o.promo); let n = 0; const L = (a, b, cls = '') => `<div class="ln ${cls}" style="--i:${n++}"><span>${a}</span><i></i><span>${b}</span></div>`;
  const stamp=o.pay?.status==='paid'?'PAYMENT RECORDED':o.pay?.method==='cod'?'CASH PAYMENT':'PAYMENT NOT CONFIRMED';
  return `<div class="rwrap ${anim ? 'print' : ''}"><div class="rcpt" id="rcpt-${o.id}"><div class="rhead"><b>PAPALITA</b><span>Good food, good mood</span><span class="rst">${esc(r.name)}</span><span>${new Date(o.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).toUpperCase()}</span></div><div class="dash"></div>
  <div class="rno"><span>ORDER NO.</span><b>${esc(o.id)}</b></div><div class="dash"></div>
  ${o.items.map(l => L(`${l.qty} x ${esc(l.name).toUpperCase()}`, peso(l.unit * l.qty)) + (selText(l) ? `<div class="sub" style="--i:${n++}">${esc(selText(l))}</div>` : '')).join('')}<div class="dash"></div>
  ${L('SUBTOTAL', peso(o.sub))}${orderStatus.mode(o) === 'pickup' ? '' : L('DELIVERY FEE', o.disc && pr && pr.type === 'ship' ? 'FREE' : o.fee==null?'Not supplied':peso(o.fee))}${o.disc && (!pr||pr.type !== 'ship') ? L('PROMO ' + esc(pr?.code||'RECORDED'), '-' + peso(o.disc), 'g') : ''}${o.tip ? L('RIDER TIP', peso(o.tip)) : ''}
  <div class="ln tot" style="--i:${n++}"><span>TOTAL</span><i></i><span>${peso(o.total)}</span></div><div class="sub" style="--i:${n++}">Order summary · ask the store for a tax invoice</div><div class="dash"></div>
  ${L('PAYMENT', payTag(o).toUpperCase())}<div class="ln" style="--i:${n++}"><span>${orderLocationLabel(o).toUpperCase()}</span></div><div class="sub" style="--i:${n++};color:#222">${esc(orderLocation(o))}</div>${o.note ? `<div class="sub" style="--i:${n++}">Note: ${esc(o.note)}</div>` : ''}<div class="dash"></div>
  <div class="rbar" style="--i:${n++}"><span>${esc(o.id)}</span></div><p class="thx" style="--i:${n++}">SALAMAT, ALEGRIA!<br><small>Thank you for ordering local.</small></p><div class="stamp">${stamp}</div></div></div>`; }
V.confirmation = id => { const o = ORD(id); if (!o) return V.notFound(); const r=R(o.rid)||{name:'Store',items:[]};
  return { html: `<section class="view" style="max-width:520px;margin:0 auto;text-align:center"><div class="okh"><span class="okc">${ic('check', 40)}</span><h1>Order placed!</h1><p class="mu">The store will review your order.</p></div><div class="slot" aria-hidden="true"></div>${receiptHTML(o, true)}
  <div class="row" style="margin-top:22px"><button class="btn s grow" data-a="printrcpt" data-id="${o.id}">${ic('copy', 16)}Save receipt</button><button class="btn p grow" data-a="gotrack" data-id="${o.id}">${ic(orderStatus.mode(o)==='pickup'?'store':'orders',18)}${orderStatus.mode(o)==='pickup'?'Track pickup':'Track order'}</button></div><button class="btn o blk" style="margin-top:10px" data-a="home">Back home</button></section>` }; };
/* ---------- motion: fly to cart ---------- */
const calmMotion = () => window.PapalitaMotion?.stopped() || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function cartTarget() { for (const el of [$('.pp-home-cart:not(.pp-home-bell)'), $('.pp-cart-anchor'), $('.topbar a[href="#/cart"]')]) { if (el) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) return { r, el }; } } return null; }
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

// A push link can refer to a real order that has not been cached on this device.
function linkedOrderView(id) {
  return {html:`<section class="view"><div class="panel" id="linked-order-state" role="status"><h2>Loading your order…</h2><p class="mu sm">Checking the latest details with Papalita.</p></div></section>`,after:async()=>{
    try {
      const auth=await authDB().auth.getUser();
      if(auth.error||!auth.data?.user)throw Error('Please sign in to view this order.');
      const uid=auth.data.user.id;
      const result=await authDB().from('orders').select('*').eq('id',id).eq('customer_id',uid).maybeSingle();
      if(result.error)throw result.error;
      const row=result.data;if(!row||row.customer_id!==uid)throw Error('This order is unavailable for your account.');
      const items=await authDB().from('order_items').select('product_id,product_name,quantity,unit_price,selected_options,special_instructions').eq('order_id',id);
      if(items.error)throw items.error;
      if(S.user.id!==uid||!S.user.in)return;
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
      order.disc=Number(row.discount_amount??row.discount)||0;
      order.tip=Number(row.tip)||0;
      const old=S.orders.findIndex(o=>String(o.id)===String(row.id));
      if(old<0)S.orders.push(order);else S.orders[old]=order;save();
      if(curPath()==='/track/'+id)render();
    } catch(error) {
      const target=document.getElementById('linked-order-state');
      if(target&&curPath()==='/track/'+id)target.innerHTML=`<h2>Could not load this order</h2><p class="mu sm">${esc(error.message||'Check your connection and try again.')}</p><button class="btn s" data-a="reload" style="margin-top:16px">Try again</button>`;
    }
  }};
}

V.track = id => { const o = ORD(id); if (!o) return linkedOrderView(id);

    const make = () => {
      const statuses = orderStatus.timeline(o);
      const idx = statuses.findIndex(([key]) => key === orderStatus.status(o));
      const [title, detail, icon] = orderStatus.copy(o);
      const fulfillment = orderStatus.mode(o);
      const cancelled = o.status === 'cancelled';
      return `${pageHead(fulfillment === 'pickup' ? 'Track pickup' : 'Track order', true)}
        <div class="panel pp-order-status">
          <span class="pp-order-status-icon">${ic(icon,24)}</span>
          <div><p class="pp-order-status-mode">${fulfillment === 'pickup' ? 'Store pickup' : fulfillment === 'delivery' ? 'Delivery' : 'Order status'}</p>
          <h2>${esc(title)}</h2><p class="mu sm">${esc(detail)}</p></div>
        </div>
        <div class="panel"><ol class="tl">${cancelled
          ? `<li class="cur"><b>Cancelled</b><div class="sm">This order was cancelled.</div></li>`
          : statuses.map(([,title],i)=>`<li class="${i<=idx?'done':''} ${i===idx?'cur':''}"${i===idx?' aria-current="step"':''}>
              <span class="b">${ic(i<idx?'check':'clock',16)}</span><b>${title}</b></li>`).join('')}
        </ol></div>
        <div class="panel"><div class="row sp wrap" style="margin-bottom:10px"><div><b>${orderLocationLabel(o)}</b><p>${esc(orderLocation(o))}</p></div><div class="row wrap">${orderMapLink(o,fulfillment)}
          ${fulfillment==='delivery'&&isCurrent(o)?`<button class="btn p sm" data-a="livemap" data-id="${esc(id)}">${ic('map',16)}Live delivery map</button>`:''}</div></div>
        <div class="row sp"><b>Total</b><b>${peso(o.total)}</b></div></div>`;
    };
    return {html:`<section class="view" id="trk">${make()}</section>`,after:()=>{
      // Poll server as fallback even if Supabase Realtime is not enabled.
      let busy=false;
      const sync=async()=>{
        if(busy || curPath() !== '/track/'+id) return;
        busy=true;
        try {
          const db=window.PAPALITA_DB;
          if(!db) return;
          const {data,error}=await db.from('orders').select('id,status,fulfillment_type,updated_at').eq('id',id).eq('customer_id',S.user.id).single();
          if(error) throw error;
          if(data && (data.status!==o.status || (data.fulfillment_type && data.fulfillment_type!==o.fulfillment))){
            o.status=data.status; o.fulfillment=data.fulfillment_type || o.fulfillment; o.upd=Date.parse(data.updated_at)||Date.now();
            save(); const el=$('#trk'); if(el) el.innerHTML=make();
            updateChrome();
          }
        }catch(e){console.warn('[Papalita] Tracking refresh:',e.message)}
        finally{busy=false}
      };
      sync(); timers.push(setInterval(sync,5000));
    }};
  
};

function reorder(o) { const lines = []; o.items.forEach(l => { const x = ITEM(l.itemId); if (x && x.item.available) lines.push({ ...l, key: uid('l'), unit: unitPrice(x.item, l.sel) }); }); if (!lines.length) return toast('Those items are no longer available.'); if(!R(o.rid)||!isOpen(R(o.rid)))return toast('This store is not accepting orders right now.');
  const go = () => { S.cart = { rid: o.rid, lines: lines.map(l => ({...l, rid: o.rid})) }; save(); updateChrome(true); nav('/cart'); }; S.cart.lines.length && S.cart.rid !== o.rid ? confirmDlg('Replace your current cart with this order?', 'Replace cart').then(ok => ok && go()) : go(); }
let OT='current';
V.ordersView = (_, p) => { if (p && p.get('t')) OT = p.get('t'); const cur = myOrders().filter(isCurrent), hist = myOrders().filter(o => !isCurrent(o)), list = OT === 'current' ? cur : hist;
  const card = o => { const s = stageOf(o), r=R(o.rid)||{name:'Store'}, st = orderStatus.copy(o)[0];
    return `<div class="panel" tabindex="0" role="link" style="cursor:pointer" data-a="odetail" data-id="${o.id}"><div class="row">${`<div style="width:64px">${photo(o.items[0]?.img, o.items[0]?.name||'Order', { ar: '1', w: 200 }).replace('class="ph', 'style="border-radius:14px" class="ph')}</div>`}<div class="grow"><div class="row sp"><h3>${esc(r.name)}</h3><span class="status ${s < 0 ? 'closed' : s === 5 ? 'open' : 'n'}">${st}</span></div><p class="mu sm">${o.id} · ${new Date(o.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} · ${o.items.reduce((a, l) => a + l.qty, 0)} items</p><b>${peso(o.total)}</b></div></div>
    <div class="row" style="margin-top:12px">${isCurrent(o) ? `<button class="btn p sm grow" data-a="gotrack" data-id="${o.id}">${ic(orderStatus.mode(o)==='pickup'?'store':'orders',16)}Track</button>` : `<button class="btn p sm grow" data-a="reorder" data-id="${o.id}">Reorder</button>`}<button class="btn s sm grow" data-a="odetail" data-id="${o.id}">Details</button></div></div>`; };
  return { html: `<section class="view">${pageHead('Orders', false)}<div class="chips" role="tablist" style="margin-bottom:14px">${[['current', `Current (${cur.length})`], ['history', 'History'], ['catering', `Catering (${myCater().length})`]].map(([k, l]) => `<button class="chip ${OT === k ? 'on' : ''}" role="tab" aria-selected="${OT === k}" data-a="otab" data-v="${k}">${l}</button>`).join('')}</div>
  ${OT === 'catering' ? cateringList() : list.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,360px),1fr))">${list.map(card).join('')}</div>` : emptyState('orders', OT === 'current' ? 'No active orders' : 'No past orders yet', 'Your orders will appear here.', 'Order food', 'browse')}</section>` }; };
V.orderDetail = id => { const o = ORD(id); if (!o) return V.notFound(); const s = stageOf(o), r=R(o.rid)||{name:'Store'};
  return { html: `<section class="view" style="max-width:680px;margin:0 auto">${pageHead(o.id)}<div class="panel"><div class="row sp"><h3>${esc(r.name)}</h3><span class="status ${s < 0 ? 'closed' : s === 5 ? 'open' : 'n'}">${orderStatus.copy(o)[0]}</span></div><p class="mu sm">${new Date(o.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</p>${o.cancelReason ? `<p class="sm" style="color:var(--er);margin-top:4px">${esc(o.cancelReason)}</p>` : ''}</div>
  <div class="panel">${orderLines(o)}<div style="margin-top:10px">${sumHTML({ ...o, promo: o.promo && window.PROMOS.find(p => p.code === o.promo), perr: '', vat: (o.total - (o.tip || 0)) * 12 / 112 })}</div></div><div class="panel sm"><div class="row sp"><span class="mu">${orderLocationLabel(o)}</span><span style="text-align:right">${esc(orderLocation(o))}</span></div><div class="row sp" style="margin-top:8px"><span class="mu">Payment</span><span>${payTag(o)}</span></div></div>
  <button class="btn s blk" data-a="receipt" data-id="${o.id}" style="margin-bottom:10px">${ic('copy', 16)}View receipt</button><div class="row">${isCurrent(o) ? `<button class="btn p grow" data-a="gotrack" data-id="${o.id}">Track order</button>` : `<button class="btn p grow" data-a="reorder" data-id="${o.id}">Reorder</button>`}${s >= 0 && s <= 1 ? `<button class="btn d grow" data-a="cancel" data-id="${o.id}">Cancel order</button>` : ''}</div></section>` }; };

/* ---------- promos ---------- */
V.promos = () => ({ html: `<section class="view" style="max-width:760px;margin:0 auto">${pageHead('Promotions')}${!window.PROMOS.length?emptyState('ticket','No current offers','Approved promotions will appear here when available.'):''}${window.PROMOS.filter(p => p.active !== false).map(p => { const exp=p.expires_at&&Date.parse(p.expires_at)<=Date.now(), on = S.promo === p.code;
  return `<div class="panel"><div class="row sp"><div><h3>${esc(p.title)}</h3><p class="mu sm" style="margin-top:2px">${esc(p.desc)}</p></div><span class="chip" style="border:1.5px dashed var(--or);color:var(--or-d)">${esc(p.code)}</span></div>
  <ul class="sm mu" style="margin:10px 0 12px 18px"><li>Minimum order ${peso(p.min)}</li><li>${p.rid ? 'Valid at ' + esc(R(p.rid).name) + ' only' : 'Valid at all restaurants'}</li><li>${exp ? 'Expired' : 'Expires ' + new Date(p.exp + 'T00:00:00+08:00').toLocaleDateString('en-PH', { dateStyle: 'long' })}</li></ul>
  <div class="row"><button class="btn ${on ? 's' : 'p'} sm grow" data-a="usepromo" data-id="${p.code}" ${exp ? 'disabled' : ''}>${on ? 'Applied ✓' : 'Apply promo'}</button><button class="btn o sm" data-a="copy" data-id="${p.code}" aria-label="Copy code ${esc(p.code)}">${ic('copy', 16)}Copy</button></div></div>`; }).join('')}</section>` });

/* ---------- profile & account ---------- */
const row = (i, t, s, a, extra = '') => `<button class="li" data-a="${a}"><span class="ic">${ic(i, 20)}</span><span class="grow"><b>${t}</b>${s ? `<br><span class="sm mu">${s}</span>` : ''}</span>${extra}${ic('chev', 18, 'mu')}</button>`;
V.profile = () => ({ html: `<section class="view" style="max-width:680px;margin:0 auto">${pageHead('Profile', false)}<div class="panel row">${avatar()}<div class="grow"><h2>${esc(S.user.name)}</h2><p class="mu sm">${esc(S.user.email)}${S.user.phone ? ' · ' + esc(S.user.phone) : ''}</p></div><button class="btn s sm" data-a="go" data-id="/profile/edit">Edit</button></div>
  <div class="panel" style="padding:4px 16px">${row('pin', 'Saved addresses', S.addrs.length + ' saved', 'go2', '').replace('data-a="go2"', 'data-a="go" data-id="/addresses"')}${[['orders', 'My orders', myOrders().filter(isCurrent).length + ' active', '/orders'], ['box', 'Catering requests', myCater().length + ' sent', '/orders?t=catering'], ['nav', 'Store locations', 'Supplied store addresses', '/nearby'], ['card', 'Payment methods', 'Cash payment', '/payments'], ['heart', 'Favorites', S.fav.items.length + S.fav.rests.length + ' saved', '/favorites'], ['ticket', 'Promotions', 'Discounts and codes', '/promos'], ['bell', 'Notifications', unread() ? unread() + ' unread' : 'All caught up', '/notifications'], ['help', 'Support', 'FAQs and contact', '/support']].map(([i, t, s, p]) => row(i, t, s, 'go').replace('data-a="go"', `data-a="go" data-id="${p}"`)).join('')}</div>
  <div class="panel" style="padding:4px 16px"><div class="li"><span class="ic">${ic('bike',20)}</span><span class="grow"><b>Order updates</b><br><span class="sm mu">Open an order to check its recorded status.</span></span></div><button class="li" data-a="pwchange"><span class="ic">${ic('shield', 20)}</span><span class="grow"><b>Change password</b></span>${ic('chev', 18, 'mu')}</button><button class="li" data-a="delacct" style="color:var(--er)"><span class="ic" style="background:#FEECEA;color:var(--er)">${ic('trash', 20)}</span><b>Delete account</b></button><button class="li" data-a="logout" style="color:var(--er)"><span class="ic" style="background:#FEECEA;color:var(--er)">${ic('logout', 20)}</span><b>Log out</b></button></div></section>` });
V.editProfile = () => ({ html: `<section class="view" style="max-width:560px;margin:0 auto">${pageHead('Edit profile')}<form id="pf" class="panel" novalidate><div class="row" style="margin-bottom:16px">${avatar()}<label class="btn s sm" style="cursor:pointer">Change photo (this device)<input type="file" id="pimg" accept="image/*" class="sr"></label></div><div class="field"><label for="pn">Name</label><input class="in" id="pn" value="${esc(S.user.name)}"><p class="err" data-e="pn"></p></div><div class="field"><label for="pe">Email</label><input class="in" id="pe" type="email" value="${esc(S.user.email)}"><p class="err" data-e="pe"></p></div><div class="field"><label for="pp">Mobile number</label><input class="in" id="pp" value="${esc(S.user.phone || '')}"><p class="err" data-e="pp"></p></div><button class="btn p blk">Save changes</button></form></section>` });
V.addresses = () => ({ html: `<section class="view" style="max-width:680px;margin:0 auto">${pageHead('Saved addresses', true, `<button class="btn p sm" data-a="addrform">${ic('plus', 16)}Add</button>`)}${S.addrs.length ? S.addrs.map(a => `<div class="panel"><div class="row sp"><div><h3>${esc(a.label)} ${a.def ? '<span class="status open">Default</span>' : ''}</h3><p class="mu sm">${esc(a.line)}, ${esc(a.city)}</p></div></div><div class="row" style="margin-top:10px"><button class="btn s sm" data-a="addrform" data-id="${a.id}">Edit</button>${a.def ? '' : `<button class="btn s sm" data-a="addrdef" data-id="${a.id}">Make default</button>`}<button class="btn d sm" data-a="addrdel" data-id="${a.id}">Delete</button></div></div>`).join('') : emptyState('pin', 'No saved addresses', 'Add one for faster checkout.', 'Add address', 'addrform')}</section>` });
function addrForm(id) { const a = S.addrs.find(x => x.id === id) || { label: '', line: '', city: '' };
  const el = openSheet(`<form class="pd" style="padding-top:34px" novalidate><h2 style="margin-bottom:14px">${id ? 'Edit' : 'Add'} address</h2><div class="field"><label for="fl">Label</label><input class="in" id="fl" value="${esc(a.label)}" maxlength="20" placeholder="Home, Work…"><p class="err" data-e="fl"></p></div><div class="field"><label for="fs">Purok, street or building</label><input class="in" id="fs" value="${esc(a.line)}"><p class="err" data-e="fs"></p></div><div class="field"><label for="fc">Barangay</label><select class="in" id="fc">${window.BRGYS.map(b => `<option value="${b.n}, Alegria" ${a.city === b.n + ', Alegria' || (!a.city && b.n === S.loc.brgy) ? 'selected' : ''}>${b.n}</option>`).join('')}</select><p class="err" data-e="fc"></p></div><div class="field"><label for="fk">Landmark (optional)</label><input class="in" id="fk" value="${esc(a.landmark || '')}" maxlength="80" placeholder="Near the chapel, blue gate…"></div><button class="btn p blk">Save address</button></form>`, { label: 'Address' });
  $('form', el).onsubmit = e => { e.preventDefault(); const v = k => $('#' + k, el).value.trim(), er = {}; if (!v('fl')) er.fl = 'Give it a name.'; if (v('fs').length < 5) er.fs = 'Enter a street or building.'; if (!v('fc')) er.fc = 'Choose your barangay.';
    $$('[data-e]', el).forEach(x => x.textContent = ''); const k = Object.keys(er); if (k.length) { k.forEach(x => $(`[data-e=${x}]`, el).textContent = er[x]); return $('#' + k[0], el).focus(); }
    if (id) { Object.assign(a, { label: v('fl'), line: v('fs'), city: v('fc'), landmark: v('fk') }); if (a.def) syncLoc(a); } else { const n = { id: uid('a'), label: v('fl'), line: v('fs'), city: v('fc'), landmark: v('fk'), def: true }; S.addrs.forEach(x => x.def = false); S.addrs.push(n); CK.addr = n.id; syncLoc(n); } save(); closeSheet(); toast('Address saved.'); updateChrome(); render(); };
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

let AU={view:'login',prefill:'',busy:false};
const authHead = () => `<div class="auth-top"><span class="auth-logo papalita-logo-motion"><img src="images/papalita_mark_color.png" alt="Papalita official logo"></span><div><b>PAPALITA</b><span>Good Food, Good Mood.</span></div></div>`;
const pwField = (id, label, auto, extra = '') => `<div class="field"><label for="${id}">${label}</label><div class="pw"><input class="in" id="${id}" type="password" autocomplete="${auto}">${`<button type="button" class="pwt" data-a="pwtoggle" data-id="${id}" aria-label="Show password">${ic('eye', 20)}</button>`}</div>${extra}<p class="err" data-e="${id}"></p></div>`;
const meterHTML = id => `<div class="meter" data-m="${id}" aria-hidden="true"><i></i><i></i><i></i><i></i></div><p class="sm mu" data-mt="${id}">Use 8+ characters with letters and numbers.</p>`;
function authScreen() {
  const tabs = t => `<div class="seg" role="tablist"><button role="tab" aria-selected="${t === 'login'}" class="${t === 'login' ? 'on' : ''}" data-a="authtab" data-v="login">Log in</button><button role="tab" aria-selected="${t === 'register'}" class="${t === 'register' ? 'on' : ''}" data-a="authtab" data-v="register">Register</button></div>`;
  if (AU.view === 'reset') return `<section class="view auth">${authHead()}<h1 style="margin-top:22px">Create a new password</h1><form id="rp" novalidate style="margin-top:16px">${pwField('np1', 'New password', 'new-password', meterHTML('np1'))}${pwField('np2', 'Confirm new password', 'new-password')}<button class="btn p blk">Save password</button></form></section>`;
  if (AU.view === 'register') return `<section class="view auth">${authHead()}<h1 style="margin-top:22px">Create your account</h1><p class="mu" style="margin-bottom:14px">Order from local stores in Alegria. Verify your email after registration to activate your account.</p>${tabs('register')}
    <form id="rf" novalidate><div class="field"><label for="rn">Full name</label><input class="in" id="rn" autocomplete="name" maxlength="60"><p class="err" data-e="rn"></p></div><div class="field"><label for="rm">Mobile number</label><input class="in" id="rm" inputmode="tel" placeholder="09XXXXXXXXX" autocomplete="tel"><p class="err" data-e="rm"></p></div>
    <div class="field"><label for="re">Email address (required)</label><input class="in" id="re" type="email" autocomplete="email"><p class="err" data-e="re"></p></div><div class="field"><label for="rb">Barangay</label><select class="in" id="rb"><option value="">Choose your barangay</option>${window.BRGYS.map(b => `<option>${b.n}</option>`).join('')}</select><p class="err" data-e="rb"></p></div>
    ${pwField('rpw', 'Password', 'new-password', meterHTML('rpw'))}${pwField('rpc', 'Confirm password', 'new-password')}
    <label class="row sm" style="align-items:flex-start;margin:4px 0 4px"><input type="checkbox" id="rt" style="accent-color:var(--or);width:20px;height:20px;margin-top:2px"><span>I agree to the <button type="button" class="link gl" style="padding:0" data-a="terms">Terms and Privacy Policy</button></span></label><p class="err" data-e="rt"></p><button class="btn p blk" style="margin-top:10px">Create account</button></form></section>`;
  return `<section class="view auth">${authHead()}<h1 style="margin-top:22px">Welcome back</h1><p class="mu" style="margin-bottom:14px">Log in to order, track your rider and manage catering requests.</p>${tabs('login')}
    <form id="lf" novalidate><div class="field"><label for="li">Email address</label><input class="in" id="li" autocomplete="username" value="${esc(AU.prefill)}"><p class="err" data-e="li"></p></div>${pwField('lp', 'Password', 'current-password')}
    <div class="row sp" style="margin-bottom:12px"><span class="sm mu">Papalita account</span><button type="button" class="link gl" data-a="forgot">Forgot password?</button></div><button class="btn p blk">Log in</button></form>
    <p class="note" style="margin-top:16px">Secure login powered by Supabase Auth.</p></section>`;
}
const clearErrs = f => { $$('.in', f).forEach(i => i.classList.remove('bad')); $$('[data-e]', f).forEach(x => x.textContent = ''); };
const showErrs = (f, er) => { clearErrs(f); const k = Object.keys(er); k.forEach(x => { const i = $('#' + x, f); i && i.classList.add('bad'); const e = $(`[data-e=${x}]`, f); e && (e.textContent = er[x]); }); if (k.length) { const i = $('#' + k[0], f); i && i.focus(); } return k.length; };
const authDB = () => {
  if (!window.PAPALITA_DB) throw new Error('Supabase client not available. Check js/config.js and script loading.');
  return window.PAPALITA_DB;
};
function useAuthUser(user) {
  const meta = user.user_metadata || {};
  const acc = { id:user.id, name:meta.full_name || user.email?.split('@')[0] || 'Customer',
    phone:meta.phone || '', email:user.email || '', brgy:meta.barangay || 'Poblacion' };
  if(S.user.id!==acc.id){stashUser();adoptUser(acc);} S.user.name=acc.name;S.user.phone=acc.phone;
  S.user.in = true;
  S.user.email = acc.email;S.cart.lines=S.cart.lines.filter(l=>ITEM(l.itemId)&&R(l.rid||S.cart.rid));
  setTimeout(()=>window.dispatchEvent(new Event('papalita-session-ready')),0);
  save();
}
async function doLogin(f) {
  const email = $('#li',f).value.trim(), password = $('#lp',f).value;
  const er = {};
  if (!/^\S+@\S+\.\S+$/.test(email)) er.li = 'Enter a valid email address.';
  if (!password) er.lp = 'Enter your password.';
  if (showErrs(f,er)) return;
  if (AU.busy) return;
  AU.busy = true;
  try {
    const {data,error} = await authDB().auth.signInWithPassword({email,password});
    if (error) throw error;
    if (!data?.session?.user) throw new Error('Confirm your email before logging in.');
    useAuthUser(data.session.user);
    location.hash = '#/';
    render();
    refreshCateringRequests().catch(err=>console.error('[Papalita] Catering load:',err));
  } catch(err) { showErrs(f,{lp:err.message || 'Login failed.'}); }
  finally { AU.busy = false; }
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
  if (!window.papalitaLegalAccepted || !$('#rt',f).checked) er.rt = 'Read and accept both policies to continue.';
  if (showErrs(f,er)) return;
  if (AU.busy) return;
  AU.busy = true;
  try {
    const redirect = 'https://tomcaberio99-design.github.io/papalita/';
    const {error} = await authDB().auth.signUp({
      email,password,
      options:{ emailRedirectTo:redirect, data:{full_name:name,phone,barangay} }
    });
    if (error) throw error;
    AU.prefill = email;
    AU.view = 'login';
    render();
    toast('Check your email for the confirmation link, then log in.');
  } catch(err) { showErrs(f,{re:err.message || 'Registration failed.'}); }
  finally { AU.busy = false; }
}
function meter(input) { const id = input.id, n = pwScore(input.value), bars = $$(`[data-m=${id}] i`), t = $(`[data-mt=${id}]`); bars.forEach((b, i) => { b.className = i < n ? 's' + n : ''; }); if (t) t.textContent = !input.value ? 'Use 8+ characters with letters and numbers.' : ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'][n] + (pwOk(input.value) ? '' : ' · needs 8+ characters, a letter and a number'); }
function termsSheet() { window.papalitaOpenLegal?.(); }
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
function afterAuth(){}
document.addEventListener('input',e=>{if(['rpw','np1'].includes(e.target.id))meter(e.target);});
document.addEventListener('submit',e=>{
  const f=e.target;if(f.id==='lf'){e.preventDefault();void doLogin(f);}
  else if(f.id==='rf'){e.preventDefault();void doRegister(f);}
  else if(f.id==='rp'){e.preventDefault();void doReset(f);}
});
const AUTH_A={
  authtab:b=>{if(['login','register'].includes(b.dataset.v)){AU.view=b.dataset.v;render();}},
  forgot:async()=>{const email=prompt('Enter your registered email address:');if(!email)return;if(!/^\S+@\S+\.\S+$/.test(email.trim()))return toast('Enter a valid email address.');try{const q=await authDB().auth.resetPasswordForEmail(email.trim(),{redirectTo:location.origin+location.pathname});if(q.error)throw q.error;toast('If this email is registered, check its password-reset message.');}catch(error){toast('Reset request failed: '+error.message);}},
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
V.nearby=()=>({html:`<section class="view">${pageHead('Store locations')}${RS.length?`<div class="grid">${RS.map(r=>`<article class="panel"><h2>${esc(r.name)}</h2><p class="mu sm" style="margin:10px 0">${esc(r.addr||'Address not supplied by the store.')}</p><button class="btn s sm" data-a="rest" data-id="${esc(r.id)}">Open menu</button>${r.addr?` <a class="btn s sm" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.addr+', Alegria, Surigao del Norte')}" target="_blank" rel="noopener">Open map</a>`:''}</article>`).join('')}</div>`:emptyState('store','No stores available','Please check again later.')}</section>`});
V.payments=()=>({html:`<section class="view" style="max-width:680px;margin:auto">${pageHead('Payment methods')}<div class="panel"><h2>Cash payment</h2><p class="mu" style="margin-top:10px">Pay cash on delivery or at pickup. Online wallet and card processing are not connected.</p></div></section>`});
const FAQ=[['How do I check an order?','Open Orders, select your order and view its recorded status. Timing is confirmed by the store.'],['How do I cancel?','Open the order before preparation and request cancellation. The database must confirm the change.'],['How can I pay?','Cash payment is supported. Online payments are not connected.'],['I need help with an order.','Contact the store shown on your order. Include your order reference when discussing a problem.']];
V.support=()=>({html:`<section class="view" style="max-width:680px;margin:auto">${pageHead('Support')}<div class="panel">${FAQ.map(([q,a])=>`<details style="padding:12px 0"><summary style="font-weight:700;cursor:pointer">${esc(q)}</summary><p class="mu sm" style="margin-top:10px">${esc(a)}</p></details>`).join('')}</div><div class="panel"><h2>Contact a store</h2><p class="mu sm" style="margin:10px 0">Papalita’s central support messaging service is not connected. Use the store’s supplied contact number for order questions.</p>${RS.filter(r=>r.phone).map(r=>`<p style="margin-top:12px"><b>${esc(r.name)}</b><br><a class="link gl" href="tel:${esc(r.phone.replace(/[^+\d]/g,''))}">Call ${esc(r.phone)}</a></p>`).join('')||'<p class="mu sm">No store contact numbers are available yet.</p>'}</div></section>`});
function payPick(){const el=openSheet(`<form class="pd" style="padding-top:34px"><h2>Payment method</h2><label class="opt" style="margin-top:16px"><input type="radio" checked name="cash"><span>Cash on delivery or pickup</span></label><p class="mu sm" style="margin:12px 0">No online payment is processed by this app.</p><button class="btn p blk">Use cash payment</button></form>`,{label:'Payment method'});$('form',el).onsubmit=e=>{e.preventDefault();CK.pay='cod';CK.det={};closeSheet();render();};}
function deleteAcctSheet(){openSheet(`<div class="pd" style="padding-top:38px"><h2>Account deletion</h2><p class="mu" style="margin-top:12px">Account deletion needs Papalita’s authenticated server support. This app cannot delete an account directly. Your account has not been deleted.</p><button class="btn s blk" style="margin-top:18px" data-a="close">Close</button></div>`,{label:'Account deletion'});}
const contactBtns=r=>r.phone?`<div class="contact"><a class="cbtn" href="tel:${esc(r.phone.replace(/[^+\d]/g,''))}">${ic('phone',20)}Call store</a><a class="cbtn" href="sms:${esc(r.phone.replace(/[^+\d]/g,''))}">${ic('send',20)}Text store</a></div><p class="sm mu" style="margin-top:10px">${esc(r.phone)}</p>`:'<p class="mu sm">The store has not supplied a contact number.</p>';
const cateringCard=r=>`<article class="card"><div class="bd" style="padding:20px"><h2>${esc(r.name)}</h2><p class="mu" style="margin:10px 0">Ask this participating store about catering, availability and pricing. An inquiry is not a confirmed booking.</p><button class="btn p" data-a="cater" data-id="${esc(r.id)}">Request catering</button></div></article>`;
function locSheet(){const el=openSheet(`<div class="pd" style="padding-top:36px"><h2>Your barangay</h2><p class="mu sm" style="margin:10px 0">Choose your delivery area in Alegria.</p>${window.BRGYS.map(b=>`<label class="opt"><input type="radio" name="lc" value="${esc(b.n)}" ${S.loc.brgy===b.n?'checked':''}><span class="grow">${esc(b.n)}</span><small>${deliveryFees.has(b.n)?peso(deliveryFees.get(b.n)):'Delivery fee not configured'}</small></label>`).join('')}</div>`,{label:'Choose barangay'});el.addEventListener('change',e=>{if(e.target.name==='lc'){S.loc={...S.loc,brgy:e.target.value,label:e.target.value+', Alegria'};save();closeSheet();updateChrome();render();}});}
async function cancelRealOrder(id){
  const o=ORD(id);if(!o||!await confirmDlg('Request cancellation of this order?','Cancel order',true))return;
  try{const verified=await authDB().auth.getUser();if(verified.error)throw verified.error;const uid=verified.data?.user?.id;if(!uid||uid!==S.user.id)throw Error('Please sign in again.');
    const q=await authDB().from('orders').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('id',id).eq('customer_id',uid).in('status',['pending','confirmed']).select('id,status,updated_at').maybeSingle();
    if(q.error)throw q.error;if(q.data?.status!=='cancelled')throw Error('Cancellation was not permitted or the order status has changed.');o.status=q.data.status;o.upd=Date.parse(q.data.updated_at)||Date.now();save();toast('Order cancellation confirmed.');render();
  }catch(error){toast('Order not cancelled: '+error.message);}
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
  $$(`[data-a=fav][data-k=${k}][data-id="${id}"]`).forEach(b => { b.setAttribute('aria-pressed', on); $('svg', b).classList.toggle('on', on); }); toast(on ? 'Saved to favorites.' : 'Removed from favorites.'); if (/favorites/.test(location.hash)) render(); }
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
  receipt: b => { const o = ORD(b.dataset.id); openSheet(`<div class="pd" style="padding-top:34px">${receiptHTML(o, false)}<button class="btn p blk" style="margin-top:14px" data-a="printrcpt" data-id="${o.id}">Save / print receipt</button></div>`, { label: 'Receipt' }); }, printrcpt: b => printReceipt(b.dataset.id),
  cater: b => go('/catering/request?rid=' + b.dataset.id), newcater: () => go('/catering/request'),
  contact: b => { const r = R(b.dataset.id), k = b.dataset.k; if(!r.phone)return toast('The store has not supplied a contact number.');
    if (k === 'call') location.href = 'tel:' + r.phone; else if (k === 'sms') location.href = 'sms:' + r.phone; else if (k === 'msgr') r.messenger ? window.open(r.messenger, '_blank', 'noopener') : toast('Messenger link not set yet.'); else { try { navigator.clipboard.writeText(r.phone); toast('Number copied.'); } catch (e) { toast('Copy is not available here.'); } } },
  place: () => placeOrder(), addrpick: addrPick, paypick: payPick,
  pcat: b => { PD = b.dataset.id; fillPopular(); },
  hcat: b => { if (b.dataset.id === 'catering') return go('/catering'); HC = HC === b.dataset.id ? 'all' : b.dataset.id; fillCurated(); },
  share: b => { const r = R(b.dataset.id), u = location.href; if (navigator.share) navigator.share({ title: r.name + ' on Papalita', url: u }).catch(() => {}); else { try { navigator.clipboard.writeText(u); toast('Link copied.'); } catch (e) { toast('Sharing is not available here.'); } } },
  close: closeSheet, reload: () => render(), home: () => go('/'), browse, back: () => history.length > 1 ? history.back() : go('/'), go: (b) => { closeSheet(); go(b.dataset.id); },
  fav: b => toggleFav(b.dataset.k, b.dataset.id), item: b => openItem(b.dataset.id), rest: b => go('/restaurant/' + b.dataset.id), restmenu: b => go('/restaurant/' + b.dataset.id),
  quick: b => { const x = ITEM(b.dataset.id); if ((x.item.opts||[]).length) { openItem(x.item.id); return; } const host = b.closest('.card,.mi'), src = (host && $('.ph', host)) || b; addToCart(x.item, x.rest, defSel(x.item), 1, '', null, { rect: src.getBoundingClientRect(), img: x.item.img }); tickBtn(b); },
  loc: locSheet, askloc:locSheet,
  qa: b => { const id = b.dataset.id; if (id === 'rests') go('/discover?tab=rests&reset=1' + (HC !== 'all' ? '&cat=' + HC : '')); else if (id === 'order') go('/discover?tab=dishes&reset=1'); else if (id === 'track') { const o = myOrders().find(isCurrent); o ? go('/track/' + o.id) : (toast('No active orders to track.'), go('/orders')); } else if (id === 'promo') go('/promos'); else moreSheet(); },
  filters: () => go('/discover?f=1&tab=dishes'), catall: () => go('/categories'), cat: b => b.dataset.id === 'catering' ? go('/catering') : go('/discover?tab=dishes&reset=1&cat=' + b.dataset.id),
  sugg: b => { const t = b.dataset.t, id = b.dataset.id; if (t === 'cat') go('/discover?tab=dishes&reset=1&cat=' + id); else if (t === 'rest') go('/restaurant/' + id); else if (t === 'item') { $('#sg').innerHTML = ''; openItem(id); } else { S.recent = [id, ...(S.recent || []).filter(x => x !== id)].slice(0, 6); save(); go('/discover?tab=dishes&reset=1&q=' + encodeURIComponent(id)); } },
  clearq: () => { const q = $('#q'); q.value = ''; $('#sg').innerHTML = ''; $('[data-a=clearq]').hidden = true; q.focus(); },
  dclear: () => { F.q = ''; $('#dq').value = ''; $('[data-a=dclear]').hidden = true; fillResults(); $('#dq').focus(); },
  ftoggle: () => { F.open = !F.open; fillDiscover(); }, ftab: b => { F.tab = b.dataset.v; render(); },
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

  cancel:b=>void cancelRealOrder(b.dataset.id),
  addrform: b => addrForm(b.dataset.id), addrdef: b => { S.addrs.forEach(a => a.def = a.id === b.dataset.id); save(); render(); },
  addrdel: b => confirmDlg('Delete this address?', 'Delete', true).then(ok => { if (ok) { S.addrs = S.addrs.filter(a => a.id !== b.dataset.id); if (S.addrs.length && !S.addrs.some(a => a.def)) S.addrs[0].def = true; save(); toast('Address deleted.'); render(); } }),
  payform:payPick,
  ftb: b => { FT = b.dataset.v; render(); }, ntab: b => { NT = b.dataset.v; render(); }, readall: () => { myNotes().forEach(n => n.read = true); save(); updateChrome(); render(); },
  nopen: b => { const n = S.notes.find(x => x.id === b.dataset.id); n.read = true; save(); updateChrome(); const m = n.t.match(/FD-\d+/); if (n.type === 'order' && m && ORD(m[0])) go('/track/' + m[0]); else if (n.type === 'promo') go('/promos'); else render(); },
  logout: () => confirmDlg('Log out of Papalita?', 'Log out').then(async ok => { if(ok){await window.PAPALITA_NOTIFICATIONS?.disconnectPhone();const result=await authDB().auth.signOut();if(result.error)return toast('Could not sign out: '+result.error.message);S.user.in=false; clearSession(); save(); AU.view = 'login'; render(); } }),
  clrrecent: () => { S.recent = []; save(); const g = $('#sg'); g && (g.innerHTML = ''); },
  install: () => window.PapalitaInstall?.open(), noinstall: () => window.PapalitaInstall?.dismiss(),
  'retry-catalogue': () => location.reload(),
  'about-papalita': () => openSheet(`<div class="pd" style="padding-top:40px"><h2>Papalita</h2><p class="mu" style="margin-top:12px;line-height:1.8">Good Food, Good Mood. Discover participating local food businesses in Alegria, Surigao del Norte. Menu items and availability come from the stores on Papalita.</p></div>`, {label:'About Papalita'})
};

document.addEventListener('click', function (e) {
  const target = e.target;

  // Preserve favorites and quick-add actions.
  const button = target.closest('[data-a]');

  if (button && button.disabled) return;

  // Dishes and Restaurants tabs.
  const tab = target.closest('[data-a="ftab"]');

  if (tab) {
    e.preventDefault();

    const selected = tab.dataset.v;

    if (selected === 'dishes' || selected === 'rests') {
      F.tab = selected;
      nav('/discover?tab=' + selected);
    }

    return;
  }

  // Restaurant cards, including Curated for You.
  const restaurantCard = target.closest('[data-a="rest"]');

  if (restaurantCard) {
    e.preventDefault();

    const id = restaurantCard.dataset.id;
    const restaurant = RS.find(r => String(r.id) === String(id));

    if (restaurant) {
      nav('/restaurant/' + encodeURIComponent(restaurant.id));
    }

    return;
  }

  // Food cards.
  const foodCard = target.closest('[data-a="item"]');

  if (foodCard) {
    e.preventDefault();
    openItem(foodCard.dataset.id);
    return;
  }

  // All other existing app actions.
  if (!button) return;

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
  if(event==='SIGNED_OUT')setTimeout(()=>{S.user.in=false;AU.view='login';save();render();},0);
});
Object.assign(A, AUTH_A);
// Supabase Auth is the source of truth.
S.user.in = false;
clearSession();
try {
  const {data,error}=await authDB().auth.getUser();
  if(!error&&data?.user)useAuthUser(data.user);
} catch (err) { console.error('[Papalita] Auth restore failed:',err); }
chrome(); window.addEventListener('hashchange', render); render();
const bootstrapSkeleton = document.getElementById('papalita-bootstrap-skeleton');
if (bootstrapSkeleton) bootstrapSkeleton.remove();
const hideSplash = () => { const sp = $('#splash'); if (!sp) return; sp.classList.add('out'); setTimeout(() => sp.remove(), 600); }; setTimeout(hideSplash, Math.max(400, 1800 - (window.performance && performance.now ? performance.now() : 0)));
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
