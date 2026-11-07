/* Foodie web app (PWA). Vanilla ES modules-free build so it runs from any static host.
   Layers: utils -> store -> domain (cart/pricing/orders) -> services (gateway/api) -> UI screens -> router. */
// Papalita startup fix - 2026-10-26
(async () => {
'use strict';
const C = window.FOODIE_CONFIG, RS = window.RESTAURANTS, CATS = window.CATEGORIES;
let catalogueError = '';

// Load the online catalogue before rendering the customer menu.
try {
  if (typeof window.loadPapalitaProducts !== 'function') throw Error('Supabase catalogue is not configured.');
  {
    const serverStores = await window.loadPapalitaProducts();
    if (!Array.isArray(serverStores)) throw Error('The store catalogue could not be read.');

    const normalize = value =>
      String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

    const matchStore = (localStore, onlineStore) => {
      const a = normalize(localStore.name);
      const b = normalize(onlineStore.name);

      if (a === b) return true;

      // Match the existing Papalita stores even if punctuation differs.
      if (
        a.includes('conchita') &&
        b.includes('conchita')
      ) return true;

      if (
        a.includes('kent') && a.includes('kaye') &&
        b.includes('kent') && b.includes('kaye')
      ) return true;

      return false;
    };

    // Live store metadata comes from Supabase, not demo catalogue defaults.
    const businessLabels = {
      cafe: 'Café / Coffee Shop', coffee_shop: 'Café / Coffee Shop',
      restaurant: 'Restaurant', carinderia: 'Carinderia',
      milk_tea: 'Milk Tea / Beverage Shop', bakery: 'Bakery / Bakeshop',
      fast_food: 'Fast Food / Snack House', pizza: 'Pizza / Pasta House',
      grill: 'Grill / BBQ House', desserts: 'Desserts / Ice Cream',
      bulaloan: 'Bulaloan / Specialty Food'
    };
    const businessLabel = value => {
      const key = String(value || 'restaurant').trim().toLowerCase().replace(/[\s/-]+/g, '_');
      return businessLabels[key] || String(value || 'Restaurant').replace(/_/g, ' ');
    };
    const hour = (value, fallback) => {
      const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
      return match ? `${match[1].padStart(2, '0')}:${match[2]}` : fallback;
    };
    const cateringAllowed = value => /^(restaurant|carinderia|bulaloan|specialty[_\s-]*restaurant)$/i.test(String(value || '').trim());
    const canCater = online => cateringAllowed(online.business_type) && online.catering_enabled === true;
    const applyStoreDetails = (target, online) => {
      target.kind = businessLabel(online.business_type);
      target.catering = canCater(online);
      if (!target.catering) target.cateringInfo = null;
      target.hours = [hour(online.open_time, '08:00'), hour(online.close_time, '21:00')];
      target.closed = online.is_open === false;
      target.addr = online.address || 'Alegria, Surigao del Norte';
      target.phone = online.phone || '';
      target.description = online.description || '';
      target.cover = online.cover || online.logo_url || '';
      target.logo_url = online.logo_url || '';
      target.placeholder = false;
      target.rating = null; target.reviews = ''; target.reviewsList = []; target.promo = null; target.feature = null; target.stay = false;
      target.verifiedHours = !!(online.open_time && online.close_time);
    };

    // Include newly approved Supabase stores not present in the old local sample catalogue.
    if (Array.isArray(serverStores)) {
      for (const onlineStore of serverStores) {
        if (RS.some(localStore => matchStore(localStore, onlineStore))) continue;
        const items = (onlineStore.items || []).map(product => ({
          id: String(product.id), name: product.name, price: Number(product.price) || 0,
          cat: product.cat || 'other', img: product.img || '',
          desc: product.desc || product.name, sec: 'Menu',
          available: product.available === true, pop: 50, opts: product.opts || []
        }));
        RS.push({
          id: String(onlineStore.id), name: onlineStore.name,
          kind: businessLabel(onlineStore.business_type), cat: items[0]?.cat || 'rice',
          rating: null, reviews: '', eta: [25, 40], min: 0,
          hours: [hour(onlineStore.open_time, '08:00'), hour(onlineStore.close_time, '21:00')], dx: 0, dy: 0,
          cover: onlineStore.cover || onlineStore.logo_url || '', addr: onlineStore.address || 'Alegria, Surigao del Norte',
          phone: onlineStore.phone || '', messenger: '', placeholder: false, catering: canCater(onlineStore),
          closed: onlineStore.is_open === false, description: onlineStore.description || '',
          reviewsList: [], items
        });
      }
    }
    // Approved Supabase stores only; hide local/demo stores not in database.
    if (Array.isArray(serverStores)) {
      for (let i = RS.length - 1; i >= 0; i--) {
        if (!serverStores.some(online => matchStore(RS[i], online))) RS.splice(i, 1);
      }
    }
    let synced = 0;

    if (Array.isArray(serverStores)) {
      for (const restaurant of RS) {
        const onlineStore = serverStores.find(
          s => matchStore(restaurant, s)
        );

        // Keep the sample menu if no online products are available
        // for that restaurant yet.
        if (!onlineStore) {
  continue;
}

applyStoreDetails(restaurant, onlineStore);

// CRITICAL: use the real Supabase store UUID for checkout, including matched legacy stores.
restaurant.id = String(onlineStore.id);

// Keep the local menu if there are no online products.
if (!Array.isArray(onlineStore.items)) continue;
        const onlineItems = onlineStore.items.map(product => ({
          id: String(product.id),
          name: product.name,
          price: Number(product.price) || 0,
          cat: product.cat || 'other',
          img: product.img || '',
          desc: product.desc || product.name,
          sec: product.cat || 'Menu',
          available: product.available === true,
          pop: 50,
          opts: product.opts || []
        }));

        // Use live Supabase products only; no local/demo menu items.
        restaurant.items = onlineItems;

synced++;
      }
    }

    console.info(
      '[Papalita] Customer catalogue synced for stores:',
      synced
    );
  }
} catch (error) {
  RS.splice(0); catalogueError = 'Stores could not load. Check your connection and refresh to try again.';
  console.error(
    '[Papalita] Customer catalogue sync failed:',
    error
  );
}
// Only actual menu categories. Keep product-specific category names from Supabase.
const suppliedCategories = new Map(CATS.map(c => [String(c.id), c]));
const categoryIds = [...new Set(RS.flatMap(r => r.items || []).map(i => String(i.cat || 'other')))];
CATS.splice(0, CATS.length, ...categoryIds.map(id => ({id, name:suppliedCategories.get(id)?.name || id.replace(/[_-]/g,' ').replace(/\b\w/g,c=>c.toUpperCase()), img:suppliedCategories.get(id)?.img || ''})));
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
  return `<span class="ph ${o.cls || ''}" style="${o.ar ? '--ar:' + o.ar : ''}">${ic('fork', 48)}${u ? `<img src="${u}" srcset="${u} 1x, ${u2} 2x" alt="${esc(alt)}" loading="${o.eager ? 'eager' : 'lazy'}" decoding="async">` : ''}</span>`; };
document.addEventListener('error', e => { const t = e.target; if (t.tagName === 'IMG' && t.closest('.ph')) t.closest('.ph').classList.add('failed'); }, true);

/* ---------- store ---------- */
const KEY = 'foodie.alegria.v1';
const R = id => RS.find(r => String(r.id) === String(id));
const ITEM = id => { for (const r of RS) { const i = r.items.find(i => i.id === id); if (i) return { item: i, rest: r }; } return null; };
const ALL = () => RS.flatMap(r => r.items.map(i => ({ item: i, rest: r })));
const brg = () => window.BRGYS.find(b => b.n === (S.loc || {}).brgy) || window.BRGYS[0];
const feeOf = r => brg().fee, etaOf = r => [r.eta[0] + brg().eta + (r.busy || 0), r.eta[1] + brg().eta + (r.busy || 0)];
const iso = d => new Date(d).toISOString();
function seed() {
  return { v: 1, user: { id: 'demo', name: 'Tommy', email: 'tommy@example.com', phone: '09171234567', photo: '', in: false }, users: {}, recent: [],
    cart: { rid: null, lines: [] }, fav: { items: [], rests: [] }, promo: null,
    orders: [],
    cater: [],
    notes: [{ id: 'n1', type: 'promo', t: 'Catering for your next event', b: 'Request trays or a full buffet for 10–50 guests.', at: Date.now() - 36e5, read: false },
            { id: 'n2', type: 'account', t: 'Welcome to Papalita', b: 'Pick your barangay so we can show the right delivery fee.', at: Date.now() - 864e5, read: true }],
    addrs: [{ id: 'a1', label: 'Home', line: 'Purok 1', city: 'Poblacion, Alegria', landmark: '', def: true }],
    pay: [{ id: 'p1', type: 'gcash', detail: '0917 ••• 4567' }], loc: { label: C.location.label, brgy: 'Poblacion', perm: 'unknown' } };
}
let S; try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) {} if (!S || S.v !== 1) S = seed();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const unread = () => S.notes.filter(n => !n.read && (n.uid || 'demo') === S.user.id).length;
const cartCount = () => S.cart.lines.reduce((a, l) => a + l.qty, 0);
// Backward-compatible migration: old carts had one rid for all lines.
S.cart.lines.forEach(l => { if (!l.rid) l.rid = S.cart.rid || (ITEM(l.itemId) || {}).rest?.id; });
const cartGroups = (cart = S.cart) => { const groups = new Map(); for (const line of cart.lines) { const rid = String(line.rid || cart.rid || ''); if (!groups.has(rid)) groups.set(rid, []); groups.get(rid).push(line); } return [...groups].map(([rid, lines]) => ({ rid, rest: R(rid), lines, sub: lines.reduce((sum, l) => sum + l.unit * l.qty, 0) })); };

const notify = (type, t, b, who) => { S.notes.unshift({ id: uid('n'), type, t, b, at: Date.now(), read: false, uid: who || S.user.id }); save(); };

/* ---------- domain ---------- */
const nowMin = () => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date()); return +p[0].value % 24 * 60 + +p[2].value; };
const toMin = s => { const [h, m] = s.split(':'); return +h * 60 + +m; };
const fmtT = s => { let [h, m] = s.split(':').map(Number); h %= 24; return ((h + 11) % 12 + 1) + (m ? ':' + String(m).padStart(2, '0') : ':00') + (h < 12 ? ' AM' : ' PM'); };
const isOpen = r => { if (r.closed) return false; const o = toMin(r.hours[0]), c = toMin(r.hours[1]), n = nowMin(); return c > 1440 ? (n >= o || n < c - 1440) : n >= o && n < c; };
const hoursText = r => r.hours[0] === '00:00' && r.hours[1] === '24:00' ? 'Open 24 hours' : `${fmtT(r.hours[0])} – ${fmtT(r.hours[1])}`;
const dist = r => Math.hypot(r.dx, r.dy) + brg().km;
const defSel = item => { const s = {}; (item.opts||[]).forEach(g => { if (g.req && g.ch?.length) s[g.id] = [g.ch[0].n]; }); return s; };
const unitPrice = (item, sel) => Number(item.price) + (item.opts||[]).reduce((a, g) => a + (sel[g.id] || []).reduce((b, n) => b + Number((g.ch.find(c => c.n === n) || {}).p || 0), 0), 0);
const selText = l => Object.values(l.sel || {}).flat().join(', ');
const validPromo = (p, sub, rid) => { if (!p || p.active === false) return 'This code is no longer active.'; if (p.exp && new Date(p.exp + 'T23:59:59+08:00') < new Date()) return 'This code has expired.'; if (p.rid && p.rid !== rid) return `Only valid for ${R(p.rid)?.name || "another store"} orders.`; if (sub < p.min) return `Add ${peso(p.min - sub)} more to use ${p.code}.`; return ''; };
function calc(cart = S.cart, code = S.promo) {
  const groups = cartGroups(cart);
  const sub = groups.reduce((n, g) => n + g.sub, 0);
  const pickup = CK.fulfillment === 'pickup';
  const fee = pickup ? 0 : groups.reduce((n, g) => n + (g.rest ? feeOf(g.rest) : 0), 0);
  const p = code && window.PROMOS.find(x => x.code === code);
  // Store-specific codes apply only to the matching store, never another store.
  const eligible = p && p.rid ? groups.filter(g => String(g.rid) === String(p.rid)) : groups;
  const eligibleSub = eligible.reduce((n, g) => n + g.sub, 0);
  const eligibleFee = pickup ? 0 : eligible.reduce((n, g) => n + (g.rest ? feeOf(g.rest) : 0), 0);
  const perr = p ? (!eligible.length ? 'This voucher is not valid for the stores in your cart.' : validPromo(p, eligibleSub, p.rid || eligible[0].rid)) : '';
  let disc = 0;
  if (p && !perr) disc = p.type === 'flat' ? Math.min(p.value, eligibleSub) : p.type === 'percent' ? Math.min(Math.round(eligibleSub * p.value / 100), p.cap ?? Infinity) : eligibleFee;
  const total = Math.max(0, sub + fee - disc);
  return { r: groups[0]?.rest, groups, sub, fee, disc, perr, promo: p, total, vat: total * 12 / 112,
    minOk: pickup || groups.every(g => g.rest && g.sub >= (g.rest.min || 0)), pickup };
}

function addToCart(item, rest, sel, qty, note, replaceKey, fx) {
  if (!item.available) return toast('Sold out right now.');
  if (!isOpen(rest)) return toast(`${rest.name} is closed. Opens ${fmtT(rest.hours[0])}.`);
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

const T = [0, 15, 35, 50, 65, 95];       // demo timeline (seconds). Production: driven by backend status events
const STEPS = [['Order received', 'The restaurant has your order.', 'check'], ['Preparing your food', 'The kitchen is cooking.', 'fork'], ['Rider assigned', 'Marco is on the way to the restaurant.', 'user'], ['Picking up your order', 'Rider is at the restaurant.', 'store'], ['On the way', 'Your food is heading to you.', 'bike'], ['Delivered', 'Enjoy your meal!', 'home']];
const stageOf = o => {
  if (o.status === 'cancelled' || o.status === 'refunded') return -1;
  if (o.demo === false) return ({pending:0,confirmed:0,preparing:1,ready:3,out_for_delivery:4,completed:5})[o.status] ?? 0;
  const e = (Date.now() - o.createdAt) / 1000;
  let s = 0; T.forEach((t, i) => { if (e >= t) s = i; }); return s;
};
const isCurrent = o => { const s = stageOf(o); return s >= 0 && s < 5; };
const etaMin = o => { const r = R(o.rid); return Math.max(0, Math.round((etaOf(r)[1] * 60 - Math.min((Date.now() - o.createdAt) / 1000, etaOf(r)[1] * 60)) / 60)); };
const RIDER = { name: 'Marco Reyes', phone: '09181234567', vehicle: 'Motorcycle' };
const MODE = 'foodie.alegria.mode', isLive = () => { try { return localStorage.getItem(MODE) === 'live'; } catch (e) { return false; } };
function mergeStore() { let st; try { st = JSON.parse(localStorage.getItem(KEY)); } catch (e) { return false; } if (!st) return false; let ch = false;
  (st.orders || []).forEach(o => { const i = S.orders.findIndex(x => x.id === o.id); if (i < 0) { S.orders.push(o); ch = true; } else if ((o.upd || 0) > (S.orders[i].upd || 0)) { S.orders[i] = o; ch = true; } });
  S.cater = S.cater || []; (st.cater || []).forEach(q => { const i = S.cater.findIndex(x => x.id === q.id); if (i < 0) { S.cater.push(q); ch = true; } else if ((q.upd || 0) > (S.cater[i].upd || 0)) { S.cater[i] = q; ch = true; } });
  (st.notes || []).forEach(n => { if (!S.notes.find(x => x.id === n.id)) { S.notes.push(n); ch = true; } }); S.notes.sort((a, b) => b.at - a.at);
  if (ch) { save(); updateChrome(); if (/^\/(orders|order\/|notifications|catering)/.test(curPath()) && !sheetEl && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName)) render(); } return ch; }
window.addEventListener('storage', e => { if (e.key === KEY) mergeStore(); });
// Legacy timed order progression is disabled. Existing live tracking reads Supabase.

/* ---------- services ---------- */
const Gateway = { async pay(order, method) {            // payment adapter: demo now, server endpoint in production
  if (C.payments.provider === 'demo') { await delay(900); return { status: method === 'cod' ? 'pending' : 'demo_authorized', ref: 'DEMO-' + Math.random().toString(36).slice(2, 8).toUpperCase(), demo: true }; }
  throw new Error(`Payment provider "${C.payments.provider}" needs the server endpoint /api/payments (see README).`); } };
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
  const [path, qs] = (location.hash.slice(1) || '/').split('?'), params = new URLSearchParams(qs || '');
  const main = $('#view');
  if (!S.user.in) { document.body.classList.add('authing'); main.innerHTML = authLayout(); window.PapalitaMotion?.refresh(main); afterAuth(); window.scrollTo(0, 0); updateChrome(); return; }
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
  .sort((a,b) => Number(Boolean(b.item.best)) - Number(Boolean(a.item.best)) ||
     Number(b.item.pop || 0) - Number(a.item.pop || 0) ||
     Number(b.item.r || b.rest.rating || 0) - Number(a.item.r || a.rest.rating || 0))
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

const foodVisual = (auth=false) => {
  const choices = ALL().filter(x=>x.item.available && /^https?:/i.test(String(x.item.img || ''))).slice(0,3);
  if (!choices.length) return `<div class="pp-hero-logo"><img src="images/papalita_mark_color.png" alt="Papalita"></div>`;
  return `<div class="pp-food-slides" data-food-slideshow aria-label="Food from the Papalita menu">${choices.map(({item,rest},i)=>`<div class="pp-food-slide ${i===0?'pp-slide-active':''}" data-food-slide aria-hidden="${i!==0}" ${i?'inert':''}>${photo(item.img,`${item.name} from ${rest.name}`,{eager:i===0,w:780})}<div class="pp-food-caption"><b>${esc(item.name)}</b><small>${esc(rest.name)}</small></div></div>`).join('')}${choices.length>1?`<div class="pp-food-controls" aria-label="Food photos">${choices.map(({item},i)=>`<button type="button" data-slide-index="${i}" aria-label="Show ${esc(item.name)}" aria-pressed="${i===0}"></button>`).join('')}</div>`:''}</div>`;
};
const customerFooter = () => `<footer class="pp-customer-footer"><span>Papalita · Good Food, Good Mood.</span><nav aria-label="Footer"><button type="button" data-a="about-papalita">About</button><a href="#/support">Contact</a><button type="button" data-papalita-legal>Terms & Privacy</button><button type="button" data-motion-toggle aria-pressed="false">Pause animations</button></nav></footer>`;
V.home = () => {
  const act = myOrders().find(isCurrent);
  return {html:`<section class="view pp-customer-home">
    <header class="pp-home-header"><a href="#/" class="pp-mini-brand" aria-label="Papalita home"><img src="images/papalita_mark_color.png" alt="">Papalita</a><button class="loc" data-a="loc" aria-label="Change delivery location"><span class="lab">Deliver to</span><span class="locv">${esc(S.loc.label)}${ic('chevd',14)}</span></button><a class="pp-home-cart" href="#/cart" aria-label="View cart">${ic('cart',21)}<span class="badge" data-cc hidden></span></a></header>
    ${catalogueError?`<div class="pp-catalog-error" role="alert">${esc(catalogueError)} <button class="link gl" data-a="retry-catalogue">Refresh</button></div>`:''}
    <div class="pp-hero"><div class="pp-hero-copy"><span class="pp-kicker">Made for your everyday</span><h1>Your local favorites,<br><em>delivered.</em></h1><p>Find your next coffee, comfort meal, or something worth sharing in Alegria.</p><button class="btn p" data-a="qa" data-id="rests">Explore stores ${ic('arrow',17)}</button></div><div class="pp-hero-visual">${foodVisual()}<div class="pp-float-note">${ic('store',23)}<span><b>From around the neighborhood</b><small>Alegria, Surigao del Norte</small></span></div></div></div>
    <div class="search pp-home-search" id="hs"><div class="sbox">${ic('search',21)}<input id="q" type="search" placeholder="Search food or stores" aria-label="Search food or stores" aria-controls="sg" autocomplete="off"><button class="ib" data-a="clearq" aria-label="Clear search" hidden>${ic('x',18)}</button><button class="ib" data-a="filters" aria-label="Search filters">${ic('sliders',19)}</button></div><div id="sg"></div></div>
    ${CATS.length?`<div class="pp-categories" role="group" aria-label="Menu categories"><button class="chipc on" data-a="hcat" data-id="all" aria-pressed="true">${ic('grid',16)}All food</button>${CATS.map(c=>`<button class="chipc" data-a="hcat" data-id="${esc(c.id)}" aria-pressed="false">${esc(c.name)}</button>`).join('')}</div>`:''}
    ${act?`<a class="mint row" href="#/track/${esc(act.id)}" style="margin-top:18px">${ic('bike',24)}<span class="grow"><b>Your order</b><br><span class="sm mu">${esc(R(act.rid)?.name || 'Store')} · ${esc(STEPS[stageOf(act)]?.[0] || act.status)}</span></span>${ic('chev',18)}</a>`:''}
    <div class="sec"><div class="sec-h"><h2>Stores near you</h2><button class="link gl" data-a="qa" data-id="rests">See all ${ic('arrow',16)}</button></div><div class="store-swipe" id="cur" aria-label="Stores carousel"></div></div>
    <div class="sec"><div class="sec-h"><h2>On the menu</h2><button class="link gl" data-a="qa" data-id="order">See all ${ic('arrow',16)}</button></div><div class="chips popular-chips" role="group" aria-label="Filter menu"><button class="chip on" data-a="pcat" data-id="all" aria-pressed="true">All food</button>${CATS.map(c=>`<button class="chip" data-a="pcat" data-id="${esc(c.id)}" aria-pressed="false">${esc(c.name)}</button>`).join('')}</div><div class="popular-grid" id="popular-dishes"></div></div>
    ${RS.some(r=>r.catering)?`<a class="mint row home-promo-card" href="#/catering">${ic('box',24)}<span class="grow"><b>Bring everyone to the table.</b><br><span class="sm mu">Ask participating stores about catering.</span></span>${ic('arrow',19)}</a>`:''}
    ${!PAPALITA_INSTALLED && window.PapalitaInstall?.canOffer()?`<div class="mint row pp-install-card">${ic('send',22)}<span class="grow"><b>A little closer, every day.</b><br><span class="sm mu">Add Papalita to your home screen.</span></span><button class="btn p sm" data-a="install">Install</button><button class="ib" data-a="noinstall" aria-label="Dismiss install card">${ic('x',17)}</button></div>`:''}
    ${customerFooter()}</section>`,after:()=>{fillCurated();fillPopular();}};
};
function authLayout(){return `<div class="pp-auth-layout"><aside class="pp-auth-pitch" aria-label="About Papalita"><div class="pp-auth-brand"><img src="images/papalita_mark_color.png" alt=""><span><b>Papalita</b><small>GOOD FOOD, GOOD MOOD.</small></span></div><div><span class="pp-kicker">Alegria, Surigao del Norte</span><h2>A good mood<br>is <em>on the menu.</em></h2><p>Cafés, comfort food, and local favorites. Find your next delicious moment with Papalita.</p></div><div class="pp-auth-photo">${foodVisual(true)}</div><button type="button" data-motion-toggle aria-pressed="false" class="link gl">Pause animations</button></aside><div class="pp-auth-form">${authScreen()}</div></div>`;}

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
  const fits = r => (!F.eta || etaOf(r)[1] <= F.eta) && (!F.promo || r.promo);
  let html, n;
  if (F.tab === 'dishes') {
    let a = ALL().filter(({ item: i, rest: r }) => fits(r) && (F.cat === 'all' || i.cat === F.cat) && (!F.price || i.price <= F.price) && (i.r || r.rating) >= F.rating && terms.every(t => `${i.name} ${i.desc} ${r.name} ${r.kind} ${cn(i.cat)}`.toLowerCase().includes(t)));
    a.sort((x, y) => F.sort === 'rating' ? (y.item.r || y.rest.rating) - (x.item.r || x.rest.rating) : F.sort === 'price' ? x.item.price - y.item.price : F.sort === 'eta' ? etaOf(x.rest)[0] - etaOf(y.rest)[0] : y.item.pop - x.item.pop);
    n = a.length; html = a.map(dishCard).join('');
  } else {
    let a = RS.filter(r => fits(r) && (F.cat === 'all' || r.cat === F.cat || r.items.some(i => i.cat === F.cat)) && (!F.price || Math.min(...r.items.map(i => i.price)) <= F.price) && r.rating >= F.rating && terms.every(t => `${r.name} ${r.kind} ${r.items.map(i => i.name + ' ' + i.desc).join(' ')}`.toLowerCase().includes(t)));
    a.sort((x, y) => F.sort === 'rating' ? y.rating - x.rating : F.sort === 'price' ? Math.min(...x.items.map(i => i.price)) - Math.min(...y.items.map(i => i.price)) : F.sort === 'eta' ? etaOf(x)[0] - etaOf(y)[0] : parseFloat(y.reviews) - parseFloat(x.reviews));
    n = a.length; html = a.map(restCard).join('');
  }
  $('#results').innerHTML = n ? `<p class="mu sm" style="margin:12px 0">${n} ${F.tab === 'dishes' ? 'dish' : 'restaurant'}${n > 1 ? (F.tab === 'dishes' ? 'es' : 's') : ''} found</p><div class="grid ${F.tab === 'rests' ? 'restaurant-results-grid' : ''}">${html}</div>` : emptyState('search', 'No matches', 'Try a different word or remove a filter.', 'Clear filters', 'fclear');
}

/* ---------- restaurant ---------- */
V.restaurant = id => { const r = R(id); if (!r) return V.notFound(); const op = isOpen(r), secs = [...new Set(r.items.map(i => i.sec))];
  return { html: `<section class="view"><div class="cover">${photo(r.cover, r.name + ' cover photo', { w: 1200, eager: 1 })}<div class="cov-sh"></div><div class="cov-b"><button class="ib w" data-a="back" aria-label="Go back">${ic('back')}</button><span class="row">${hrt('rests', r.id)}<button class="ib w" data-a="share" data-id="${r.id}" aria-label="Share restaurant">${ic('share')}</button></span></div></div>
  <div class="fcard"><div class="row sp"><h1 style="font-size:28px">${esc(r.name)}</h1><span class="status ${op?'open':'closed'}">${op?'Open':'Closed'}</span></div><p class="mu" style="margin-top:6px">${esc(r.kind)} • ${esc(r.addr)}${op ? '' : ' • <b style="color:var(--er)">Closed, opens ' + fmtT(r.hours[0]) + '</b>'}</p>
  <div class="stats"><div>${ic('store',18,'gc')}Menu & availability</div><div>${ic('pin',18,'gc')}Alegria</div></div></div></div>
  <p class="sm mu" style="margin:12px 6px 0">${r.busy ? `<span class="status closed">Busy · +${r.busy} min</span> ` : ''}Min order ${peso(r.min)}${r.promo ? ` · <button class="link gl" style="padding:0" data-a="usepromo" data-id="${r.promo}">Code ${r.promo}</button>` : ''}</p>
  ${r.feature ? `<button class="mint row" data-a="jump" data-id="s-${esc(r.feature.sec)}" style="width:100%;text-align:left;margin-top:14px">${photo(r.feature.img, r.feature.title, { ar: '1', w: 200 }).replace('class="ph', 'style="width:64px;border-radius:16px;flex:none" class="ph')}<span class="grow"><b style="font-size:17px">${esc(r.feature.title)}</b><br><span class="sm mu">${esc(r.feature.sub)}</span></span>${ic('chev', 18, 'mu')}</button>` : ''}
  ${r.catering ? `<div class="mint row" style="margin-top:12px">${ic('box', 26, 'gc')}<span class="grow"><b>Catering for 10–50 guests</b><br><span class="sm mu">Trays, bulalo and lechon sets, full buffet</span></span><button class="btn p sm" data-a="cater" data-id="${r.id}">Request</button></div>` : ''}
  <div class="chips solid" style="margin-top:12px;position:sticky;top:var(--st);background:var(--bg);z-index:5;padding:10px 0">${secs.map((s, k) => `<button class="chip ${k ? '' : 'on'}" data-a="jump" data-id="s-${esc(s)}">${esc(s)}</button>`).join('')}${r.catering ? '<button class="chip" data-a="jump" data-id="s-catering">Catering</button>' : ''}${r.stay ? '<button class="chip" data-a="jump" data-id="s-stay">Stay &amp; Events</button>' : ''}</div>
  ${secs.map((s, k) => `<div id="s-${esc(s)}" style="margin-top:18px"><div class="sec-h" style="margin-bottom:4px"><h2>${esc(s)}</h2></div><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,420px),1fr));gap:0 28px">${r.items.filter(i => i.sec === s).map(i => `<div class="mi" tabindex="0" role="button" data-a="item" data-id="${i.id}" aria-label="${esc(i.name)} ${peso(i.price)}">${photo(i.img, i.name, { ar: '1', w: 300 })}<div class="bd"><div class="row sp" style="align-items:flex-start"><h3 style="font-size:18px">${esc(i.name)}</h3><span class="mu">${peso(i.price)}</span></div><p class="mu sm" style="margin:6px 0 10px">${esc(i.desc)}</p>${i.available ? `<button class="addp" data-a="quick" data-id="${i.id}" ${op ? '' : 'disabled'} aria-label="Quick add ${esc(i.name)}">${ic('plus', 16)}Add</button>` : '<span class="status closed">Sold out</span>'}</div></div>`).join('')}</div></div>`).join('')}
  ${r.catering ? cateringSection(r) : ''}${r.stay ? staySection(r) : ''}
  <div class="sec"><h2 style="margin-bottom:10px">Contact</h2><div class="panel">${contactBtns(r)}</div></div>
  <div class="sec"><h2 style="margin-bottom:10px">Opening hours</h2><div class="panel"><div class="row sp"><span>Store hours</span><b>${r.verifiedHours?hoursText(r):'Ask the store'}</b></div>${r.placeholder ? '<p class="sm mu" style="margin-top:8px"><span class="demo">PLACEHOLDER</span> Hours are samples until the store confirms them.</p>' : ''}</div></div>
  <div class="sec"><h2 style="margin-bottom:10px">Reviews</h2>${[...communityReviews(r.id), ...r.reviewsList].map(v => `<div class="panel"><div class="row sp"><b>${esc(v.who)}</b>${stars(v.r)}</div><p class="mu" style="margin-top:6px">${esc(v.t)}</p></div>`).join('')}</div></section>` }; };

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
const sumHTML = c => `<div class="sum"><div class="r"><span>Subtotal</span><span>${peso(c.sub)}</span></div><div class="r"><span>Delivery fee</span><span>${c.promo && !c.perr && c.promo.type === 'ship' ? `<s class="mu">${peso(c.fee)}</s> <b class="ok">Free</b>` : peso(c.fee)}</span></div>
  ${c.disc && c.promo.type !== 'ship' ? `<div class="r ok"><span>Promo ${esc(c.promo.code)}</span><span>−${peso(c.disc)}</span></div>` : ''}${c.tip ? `<div class="r"><span>Rider tip</span><span>${peso(c.tip)}</span></div>` : ''}<div class="r tot"><span>Total</span><span>${peso(c.total)}</span></div><p class="mu sm" style="margin-top:6px">Check tax details with the store.</p></div>`;
const promoBox = c => `<div class="panel"><h3 style="margin-bottom:10px">Promo code</h3>${S.promo ? `<div class="row sp"><span class="chip on">${ic('percent', 16)}${esc(S.promo)}</span><button class="btn s sm" data-a="rmpromo">Remove</button></div>${c.perr ? `<p class="err" style="margin-top:8px">${esc(c.perr)}</p>` : `<p class="ok sm" style="margin-top:8px">Saved ${peso(c.disc)} with this code.</p>`}` :
  `<div class="row"><input class="in" id="pc" placeholder="Enter code" autocapitalize="characters" aria-label="Promo code" maxlength="20"><button class="btn p sm" data-a="applypromo">Apply</button></div><p class="err" id="pcerr"></p><div class="chips" style="margin-top:8px">${window.PROMOS.filter(p => p.active !== false).slice(0, 3).map(p => `<button class="chip" data-a="usepromo" data-id="${p.code}">${p.code}</button>`).join('')}</div>`}</div>`;
V.cartView = () => { const c = calc();
  if (!S.cart.lines.length) return { html: `<section class="view">${pageHead('Your cart')}${emptyState('cart', 'Your cart is empty', 'Add something delicious and it will show up here.', 'Browse food', 'browse')}</section>` };
  const a = S.addrs.find(x => x.id === CK.addr) || defAddr(); if (a) CK.addr = a.id; const r = c.r, arr = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }).format(new Date(Date.now() + etaOf(r)[1] * 6e4));
  const pl = payLabel(), tip = CK.tip || 0; const fee = c.promo && !c.perr && c.promo.type === 'ship' ? `<s class="mu">${peso(c.fee)}</s> <b class="gl">Free</b>` : peso(c.fee);
  return { html: `<section class="view pp-cart-view" style="max-width:640px;margin:0 auto"><div class="rv-h"><button class="ib w" data-a="back" aria-label="Go back">${ic('back')}</button><h1>ORDER REVIEW</h1><span style="width:44px"></span></div>
  <div class="rv-lab"><span>Order type</span></div><div class="chips"><button class="chip ${CK.fulfillment === 'delivery' ? 'on' : ''}" data-a="fulfillment" data-v="delivery">Delivery</button><button class="chip ${CK.fulfillment === 'pickup' ? 'on' : ''}" data-a="fulfillment" data-v="pickup">Pickup at store</button></div><div class="rv-lab"><span>${CK.fulfillment === 'pickup' ? 'Pickup locations' : 'Delivery address'}</span>${CK.fulfillment === 'pickup' ? '' : '<button data-a="addrpick">EDIT</button>'}</div>
  ${CK.fulfillment === 'pickup' ? `<div class="panel">${c.groups.map(g => `<p><b>${esc(g.rest?.name || 'Store')}</b><br>${esc(g.rest?.addr || 'Contact the store for pickup location')}</p>`).join('')}</div>` : `<div class="row" style="gap:14px"><span class="pbtn" style="width:56px;height:56px;background:#fff;color:var(--ink);box-shadow:var(--sh)">${ic('pin', 22)}</span><div class="grow">${a ? `<b style="font-size:20px">${esc(a.label)}</b> ${a.def ? '<span class="status n" style="letter-spacing:.06em">PRIMARY</span>' : ''}<p class="mu">${esc(a.line)} • ${esc(a.city)}${a.landmark ? '<br>Landmark: ' + esc(a.landmark) : ''}</p>` : `<b>No address yet</b><p class="mu">Add where we should deliver.</p>`}</div></div>`}
  <div class="field" style="margin-top:14px"><label for="cp">Contact number</label><input class="in" id="cp" inputmode="tel" value="${esc(S.user.phone || '')}" placeholder="09XXXXXXXXX" autocomplete="tel"><p class="err" id="cpe"></p></div>
  <div class="mint row" style="margin-top:6px">${ic('clock',22)}<p class="sm">The store confirms preparation and delivery timing after accepting your order.</p></div>
  <div class="rv-lab"><span>Your selection · ${c.groups.length} store(s)</span><button data-a="browse">ADD ITEMS</button></div>
  ${c.groups.map(g => `<h3 style="margin:16px 0 6px;color:var(--gc,#087F32)">${esc(g.rest?.name || 'Store')} · ${peso(g.sub)}</h3>${g.lines.map(l => `<div class="row pp-cart-line" style="gap:16px;align-items:flex-start;padding:8px 0">${photo(l.img, l.name, { ar: '1', w: 240 }).replace('class="ph', 'style="width:100px;border-radius:18px;flex:none" class="ph')}<div class="grow"><div class="row sp" style="align-items:flex-start"><h3 style="font-size:19px">${esc(l.name)}</h3><b style="font-size:19px">${peso(l.unit * l.qty)}</b></div><p class="mu sm">${esc(selText(l)) || 'Standard'}${l.note ? ' · “' + esc(l.note) + '”' : ''}</p>
  <div class="row sp" style="margin-top:10px"><div class="qty mintq"><button data-a="qty" data-k="${l.key}" data-d="-1" aria-label="Decrease ${esc(l.name)}">${ic('minus', 16)}</button><b>${l.qty}</b><button data-a="qty" data-k="${l.key}" data-d="1" aria-label="Increase ${esc(l.name)}">${ic('plus', 16)}</button></div><span><button class="rm" data-a="editline" data-k="${l.key}" data-id="${l.itemId}" style="color:var(--mu)">EDIT</button> <button class="rm" data-a="rmline" data-k="${l.key}" aria-label="Remove ${esc(l.name)}">REMOVE</button></span></div></div></div>`).join('')}`).join('')}
  <div class="rv-lab"><span>Payment method</span><button data-a="paypick">CHANGE</button></div>
  <div class="mint row" style="gap:14px"><span class="paybadge">${ic('card', 22)}</span><div class="grow"><b style="font-size:18px">${esc(pl[0])}</b><div class="lab" style="font-size:12px">${esc(pl[1])}</div></div><span class="tick">${ic('check', 16)}</span></div>
  <div class="field" style="margin-top:14px"><label for="di">Instructions (optional)</label><textarea class="in" id="di" maxlength="200" placeholder="Gate color, landmarks, leave at lobby…"></textarea></div>
  ${CK.fulfillment === 'pickup' ? '' : `<div class="rv-lab" style="margin-top:24px"><span>Tip your rider</span><span class="sm mu" style="letter-spacing:0;text-transform:none;font-weight:600">Optional</span></div><div class="chips">${[0, 20, 30, 50, 100].map(v => `<button class="chip ${tip === v ? 'on' : ''}" data-a="tip" data-v="${v}" aria-pressed="${tip === v}">${v ? peso(v) : 'No tip'}</button>`).join('')}</div>`}
  <div style="margin-top:14px">${promoBox(c)}</div>
  <div class="sum" style="margin-top:18px;font-size:18px"><div class="r mu"><span>Order Subtotal</span><b style="color:var(--ink)">${peso(c.sub)}</b></div><div class="r mu"><span>${CK.fulfillment === 'pickup' ? 'Pickup Fee' : 'Delivery fee estimate'}</span><b style="color:var(--ink)">${fee}</b></div>${c.disc && c.promo.type !== 'ship' ? `<div class="r gl"><span>Promo ${esc(c.promo.code)}</span><b>−${peso(c.disc)}</b></div>` : ''}${tip ? `<div class="r mu"><span>Rider tip</span><b style="color:var(--ink)">${peso(tip)}</b></div>` : ''}<p class="sm mu">Check tax details with the store.</p></div>
  ${!c.minOk ? `<p class="err" style="margin:10px 0">Some stores have not reached their minimum order amount.</p>` : ''}
  <button class="pbar" id="place" data-a="place" ${c.minOk ? '' : 'disabled'}><span>Place Order</span><i></i><b>${peso(c.total + tip)}</b></button>
  <p class="mu sm" style="text-align:center;margin-top:12px;letter-spacing:.04em">TAPPING PLACE ORDER CONFIRMS YOUR ACCEPTANCE OF TERMS</p><p style="text-align:center;margin-top:8px"><span class="sm mu">Orders are submitted securely to Papalita. Cash payment only.</span></p></section>` }; };

/* ---------- checkout ---------- */
let CK = { addr: null, pay: 'cod', det: {}, fulfillment: 'delivery', tip: 0 };
const luhn = n => { let s = 0, d = false; for (let i = n.length - 1; i >= 0; i--) { let x = +n[i]; if (d) { x *= 2; if (x > 9) x -= 9; } s += x; d = !d; } return s % 10 === 0; };
const PH = /^(09|\+639)\d{9}$/;
const payLabel = () => { const p = CK.pay, d = CK.det || {}; if (p === 'card') return ['Credit / debit card', d.last4 ? 'DEBIT CARD •••• ' + d.last4 : 'ADD CARD DETAILS']; if (p === 'cod') return [CK.fulfillment === 'pickup' ? 'Cash on Pickup' : 'Cash on Delivery', CK.fulfillment === 'pickup' ? 'PAY AT THE STORE' : 'PAY THE RIDER ON ARRIVAL']; const n = (d.wallet || S.user.phone || '').replace(/\s/g, ''); return [PAYNAME[p], n ? 'MOBILE •••• ' + n.slice(-4) : 'ADD MOBILE NUMBER']; };
function addrPick() { const el = openSheet(`<div class="pd" style="padding-top:34px"><h2 style="margin-bottom:12px">Deliver to</h2>${S.addrs.map(a => `<label class="opt"><input type="radio" name="ap" value="${a.id}" ${(CK.addr || (defAddr() || {}).id) === a.id ? 'checked' : ''}><span class="grow"><b>${esc(a.label)}</b><br><span class="mu sm">${esc(a.line)}, ${esc(a.city)}</span></span></label>`).join('')}<button class="btn s blk" data-a="addrform" style="margin-top:6px">${ic('plus', 18)}Add new address</button><button class="btn o blk" data-a="loc" style="margin-top:8px">${ic('pin', 18)}Change barangay</button></div>`, { label: 'Delivery address' });
  el.addEventListener('change', e => { if (e.target.name === 'ap') { CK.addr = e.target.value; S.addrs.forEach(a => a.def = a.id === CK.addr); syncLoc(S.addrs.find(a => a.id === CK.addr)); save(); closeSheet(); updateChrome(); render(); } }); }
function payPick() { const el = openSheet(`<form class="pd" style="padding-top:34px" novalidate><h2 style="margin-bottom:6px">Payment method</h2><p class="note" style="margin-bottom:12px">Online payment is not connected yet. Choose cash payment.</p>${Object.entries(PAYNAME).filter(([k]) => k === 'cod').map(([k, l]) => `<label class="opt"><input type="radio" name="pmeth" value="${k}" ${CK.pay === k ? 'checked' : ''}><span class="grow">${l}</span></label>`).join('')}<div id="pmx" style="margin-top:8px"></div><button class="btn p blk">Use this method</button></form>`, { label: 'Payment method' });
  const cur = () => $('input[name=pmeth]:checked', el).value, fields = () => { const p = cur(); $('#pmx', el).innerHTML = p === 'card' ? `<div class="field"><label for="kn">Card number</label><input class="in" id="kn" inputmode="numeric" autocomplete="cc-number" placeholder="4242 4242 4242 4242" maxlength="23"><p class="err" data-e="kn"></p></div><div class="two"><div class="field"><label for="kx">Expiry (MM/YY)</label><input class="in" id="kx" inputmode="numeric" placeholder="MM/YY" maxlength="5"><p class="err" data-e="kx"></p></div><div class="field"><label for="kc">CVV</label><input class="in" id="kc" inputmode="numeric" maxlength="4"><p class="err" data-e="kc"></p></div></div>` : p === 'cod' ? '<p class="sm mu">Pay cash on delivery or at pickup.</p>' : `<div class="field"><label for="wn">${PAYNAME[p]} mobile number</label><input class="in" id="wn" inputmode="tel" value="${esc((CK.det || {}).wallet || S.user.phone || '')}" placeholder="09XXXXXXXXX"><p class="err" data-e="wn"></p></div>`; };
  el.addEventListener('change', e => { if (e.target.name === 'pmeth') fields(); }); fields();
  $('form', el).onsubmit = e => { e.preventDefault(); const p = cur(), v = id => ($('#' + id, el) || {}).value?.trim() || '', er = {}, det = {};
    if (p === 'card') { const n = v('kn').replace(/\s/g, ''), x = v('kx').match(/^(\d\d)\/(\d\d)$/); if (!/^\d{13,19}$/.test(n) || !luhn(n)) er.kn = 'Enter a valid card number.'; if (!x || +x[1] < 1 || +x[1] > 12 || new Date(2000 + +x[2], +x[1], 0, 23, 59) < new Date()) er.kx = 'Enter a valid, unexpired date.'; if (!/^\d{3,4}$/.test(v('kc'))) er.kc = 'Enter the 3 or 4 digit code.'; det.last4 = n.slice(-4); }
    else if (p !== 'cod') { if (!PH.test(v('wn').replace(/\s/g, ''))) er.wn = 'Enter your registered mobile number.'; det.wallet = v('wn'); }
    $$('[data-e]', el).forEach(x => x.textContent = ''); const k = Object.keys(er); if (k.length) { k.forEach(x => $(`[data-e=${x}]`, el).textContent = er[x]); return $('#' + k[0], el).focus(); }
    CK.pay = p; CK.det = det; closeSheet(); render(); }; }
async function placeOrder() {
  const c = calc(), a = S.addrs.find(x => x.id === CK.addr) || defAddr();
  if (!S.cart.lines.length) return;
  const phoneField = $('#cp'), phone = (phoneField.value || '').trim().replace(/\s/g, '');
  $('#cpe').textContent = ''; phoneField.classList.remove('bad');
  if (CK.fulfillment !== 'pickup' && !a) { toast('Add a delivery address first.'); return addrForm(); }
  if (!PH.test(phone)) { phoneField.classList.add('bad'); $('#cpe').textContent = 'Use a PH mobile number like 09171234567.'; return phoneField.focus(); }
  if (!c.minOk) return toast('One or more stores have not reached their minimum order.');
  if (CK.pay !== 'cod') return toast('Only cash payment is available.');
  const db = window.PAPALITA_DB;
  if (!db) return toast('Supabase is unavailable. Please try again.');
  const btn = $('#place'); btn.disabled = true; btn.firstElementChild.textContent = 'Placing orders…';
  try {
    const { data: auth, error: authError } = await db.auth.getUser();
    if (authError) throw authError;
    if (!auth?.user) throw new Error('Please sign in again before ordering.');
    const address = CK.fulfillment === 'pickup' ? 'Pickup at store' : `${a.label} — ${a.line}${a.landmark ? ' (' + a.landmark + ')' : ''}, ${a.city}`;
    const groups = c.groups.map((g, index) => {
      if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(g.rid))) throw new Error('Invalid store ID. Refresh the menu and retry.');
      const storeFee = CK.fulfillment === 'pickup' ? 0 : feeOf(g.rest);
      const eligible = !c.promo?.rid || String(c.promo.rid) === String(g.rid);
      const discountBase = c.promo?.rid ? c.groups.filter(x => String(x.rid) === String(c.promo.rid)).reduce((n,x)=>n+x.sub,0) : c.sub;
      const discount = eligible && !c.perr && discountBase ? Math.min(g.sub + storeFee, Math.round(c.disc * g.sub / discountBase)) : 0;
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
        total: Number(result.total_amount), tip: g.tip, promo: g.discount ? S.promo : null,
        createdAt, demo: false, status: 'pending', stage: 0, upd: createdAt, uid: auth.user.id,
        fulfillment: CK.fulfillment, addr: address, note: ($('#di').value || '').trim(),
        contact: { name: S.user.name, phone }, pay: { method: 'cod', status: 'unpaid', demo: false } };
    });
    S.user.phone = phone; CK.tip = 0; S.orders.unshift(...orders);
    S.cart = { rid: null, lines: [] }; S.promo = null;
    orders.forEach(o => notify('order', `Order submitted · ${o.id}`, `${R(o.rid)?.name || 'Store'} order saved to Supabase.`));
    save(); updateChrome(); nav('/confirmation/' + orders[0].id);
    if (orders.length > 1) toast(`${orders.length} store orders submitted successfully.`);
  } catch (error) {
    console.error('[Papalita] Checkout failed:', error);
    toast('Order not confirmed: ' + (error.message || 'Please try again.'));
    btn.disabled = false; btn.firstElementChild.textContent = 'Place Order';
  }
}

const ORD = id => S.orders.find(o => o.id === id);
const orderLines = o => o.items.map(l => `<div class="row sp sm" style="padding:5px 0"><span>${l.qty} × ${esc(l.name)}${selText(l) ? `<br><span class="mu">${esc(selText(l))}</span>` : ''}</span><span>${peso(l.unit * l.qty)}</span></div>`).join('');
const payTag = o => `${PAYNAME[o.pay.method]} ${o.pay.demo ? '<span class="demo">DEMO</span>' : ''}`;
/* ---------- receipt ---------- */
const hash32 = str => { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
function barcode(code) { let h = hash32(code), x = 0, bars = ''; for (let i = 0; i < 48; i++) { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; const w = 1 + (h % 3), g = 1 + ((h >>> 9) % 2); bars += `<rect x="${x}" y="0" width="${w}" height="40"/>`; x += w + g; } return `<svg class="barcode" viewBox="0 0 ${x} 40" preserveAspectRatio="none" role="img" aria-label="Order code ${esc(code)}">${bars}</svg>`; }
function receiptHTML(o, anim) { const r = R(o.rid), pr = o.promo && window.PROMOS.find(p => p.code === o.promo); let n = 0; const L = (a, b, cls = '') => `<div class="ln ${cls}" style="--i:${n++}"><span>${a}</span><i></i><span>${b}</span></div>`;
  const stamp = o.pay.method === 'cod' ? 'PAY ON ARRIVAL' : o.pay.demo ? 'PAID · DEMO' : 'PAID';
  return `<div class="rwrap ${anim ? 'print' : ''}"><div class="rcpt" id="rcpt-${o.id}"><div class="rhead"><b>PAPALITA</b><span>Good food, good mood</span><span class="rst">${esc(r.name)}</span><span>${new Date(o.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).toUpperCase()}</span></div><div class="dash"></div>
  <div class="rno"><span>ORDER NO.</span><b>${esc(o.id)}</b></div><div class="dash"></div>
  ${o.items.map(l => L(`${l.qty} x ${esc(l.name).toUpperCase()}`, peso(l.unit * l.qty)) + (selText(l) ? `<div class="sub" style="--i:${n++}">${esc(selText(l))}</div>` : '')).join('')}<div class="dash"></div>
  ${L('SUBTOTAL', peso(o.sub))}${L('DELIVERY FEE', o.disc && pr && pr.type === 'ship' ? 'FREE' : peso(o.fee))}${o.disc && pr && pr.type !== 'ship' ? L('PROMO ' + esc(pr.code), '-' + peso(o.disc), 'g') : ''}${o.tip ? L('RIDER TIP', peso(o.tip)) : ''}
  <div class="ln tot" style="--i:${n++}"><span>TOTAL</span><i></i><span>${peso(o.total)}</span></div><div class="sub" style="--i:${n++}">Order summary · ask the store for a tax invoice</div><div class="dash"></div>
  ${L('PAYMENT', esc(PAYNAME[o.pay.method]).toUpperCase())}<div class="ln" style="--i:${n++}"><span>DELIVER TO</span></div><div class="sub" style="--i:${n++};color:#222">${esc(o.addr)}</div>${o.note ? `<div class="sub" style="--i:${n++}">Note: ${esc(o.note)}</div>` : ''}<div class="dash"></div>
  <div class="rbar" style="--i:${n++}">${barcode(o.id)}<span>${esc(o.id)}</span></div><p class="thx" style="--i:${n++}">SALAMAT, ALEGRIA!<br><small>Thank you for ordering local.</small></p><div class="stamp">${stamp}</div></div></div>`; }
V.confirmation = id => { const o = ORD(id); if (!o) return V.notFound(); const r = R(o.rid);
  return { html: `<section class="view" style="max-width:520px;margin:0 auto;text-align:center"><div class="okh"><span class="okc">${ic('check', 40)}</span><h1>Order placed!</h1><p class="mu">The store will review your order.</p></div><div class="slot" aria-hidden="true"></div>${receiptHTML(o, true)}
  <div class="row" style="margin-top:22px"><button class="btn s grow" data-a="printrcpt" data-id="${o.id}">${ic('copy', 16)}Save receipt</button><button class="btn p grow" data-a="gotrack" data-id="${o.id}">${ic('bike', 18)}Track order</button></div><button class="btn o blk" style="margin-top:10px" data-a="home">Back home</button></section>` }; };
/* ---------- ratings ---------- */
const rateCard = o => o.review ? `<div class="panel"><h3>Your review</h3><div class="row g" style="margin:6px 0">${[1, 2, 3, 4, 5].map(n => ic('star', 20, n <= o.review.store ? 'star' : 'mu')).join('')}</div>${o.review.comment ? `<p class="mu sm">“${esc(o.review.comment)}”</p>` : ''}</div>` : `<div class="panel" style="background:var(--or-s);border:0"><b style="font-size:17px">How was your order?</b><p class="sm mu" style="margin:4px 0 10px">Rate ${esc(R(o.rid).name)}${o.rider ? ' and your rider' : ''}.</p><button class="btn p blk" data-a="rate" data-id="${o.id}">Rate order</button></div>`;
const communityReviews = rid => S.orders.filter(o => o.rid === rid && o.review).map(o => ({ who: o.contact.name, r: o.review.store, t: o.review.comment || (o.review.tags || []).join(', ') || 'Rated ' + o.review.store + ' stars' }));
function rateSheet(oid) { const o = ORD(oid), r = R(o.rid), st = { store: 0, rider: 0, tags: [] }, TAGS = ['Tasty', 'Fresh', 'On time', 'Good packaging', 'Good value', 'Friendly rider'];
  const row = (k, label) => `<div class="field"><label id="l-${k}">${label}</label><div class="stars" role="radiogroup" aria-labelledby="l-${k}">${[1, 2, 3, 4, 5].map(n => `<button type="button" class="sbtn" role="radio" aria-checked="false" data-sr="${k}" data-n="${n}" aria-label="${n} star${n > 1 ? 's' : ''}">${ic('star', 36)}</button>`).join('')}</div></div>`;
  const el = openSheet(`<form class="pd" style="padding-top:34px" novalidate><h2>How was your order?</h2><p class="mu sm" style="margin:4px 0 14px">${esc(o.id)} · ${esc(r.name)}</p>${row('store', 'Rate ' + esc(r.name))}${o.rider ? row('rider', 'Rate your rider ' + esc(o.rider.name.split(' ')[0])) : ''}
  <div class="field"><label>What went well?</label><div class="chips" style="flex-wrap:wrap">${TAGS.map(t => `<button type="button" class="chip" data-tg="${t}" aria-pressed="false">${t}</button>`).join('')}</div></div><div class="field"><label for="rc">Comment (optional)</label><textarea class="in" id="rc" maxlength="300" placeholder="Tell others about it"></textarea></div><p class="err" id="re"></p><button class="btn p blk">Submit review</button></form>`, { label: 'Rate order' });
  el.addEventListener('click', e => { const b = e.target.closest('.sbtn'), t = e.target.closest('[data-tg]'); if (b) { const k = b.dataset.sr, n = +b.dataset.n; st[k] = n; $$(`[data-sr=${k}]`, el).forEach(x => { const on = +x.dataset.n <= n; x.classList.toggle('on', on); x.setAttribute('aria-checked', +x.dataset.n === n); }); $('#re', el).textContent = ''; } if (t) { const i = st.tags.indexOf(t.dataset.tg); i >= 0 ? st.tags.splice(i, 1) : st.tags.push(t.dataset.tg); t.classList.toggle('on', i < 0); t.setAttribute('aria-pressed', i < 0); } });
  $('form', el).onsubmit = e => { e.preventDefault(); if (!st.store) return ($('#re', el).textContent = 'Please rate the restaurant (1 to 5 stars).'); o.review = { store: st.store, rider: o.rider ? st.rider : 0, tags: st.tags, comment: $('#rc', el).value.trim(), at: Date.now() }; o.upd = Date.now(); save(); closeSheet(); toast('Thanks for your review!'); render(); }; }
/* ---------- motion: fly to cart ---------- */
const calmMotion = () => window.PapalitaMotion?.stopped() || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function cartTarget() { for (const el of [$('.pp-home-cart'), $('.pp-cart-anchor'), $('.topbar a[href="#/cart"]')]) { if (el) { const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) return { r, el }; } } return null; }
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
const PATH = 'M60 210 L60 130 L210 130 L210 70 L340 70';
V.track = id => { let o = ORD(id); if (!o) return V.notFound(); const r = R(o.rid);
  if (o.demo === false) {
    const statuses = [
      ['pending','Order received','Waiting for the store to accept your order.'],
      ['confirmed','Order accepted','The store has confirmed your order.'],
      ['preparing','Preparing your food','Your order is being prepared.'],
      ['ready','Ready','Your order is ready for pickup or rider handoff.'],
      ['out_for_delivery','Out for delivery','Your order is on its way.'],
      ['completed','Completed','Your order has been completed.']
    ];
    const make = () => {
      const idx = statuses.findIndex(x => x[0] === o.status);
      const cancelled = o.status === 'cancelled';
      return `${pageHead('Track order', true, `<span class="chip">${esc(o.id)}</span>`)}
        <div class="panel"><h2>${cancelled ? 'Order cancelled' : (statuses[Math.max(idx,0)]?.[1] || 'Order update')}</h2>
        <p class="mu sm">From ${esc(r?.name || 'Store')} · Status from Supabase</p></div>
        <div class="panel"><ol class="tl">${cancelled
          ? `<li class="cur"><b>Cancelled</b><div class="sm">This order was cancelled.</div></li>`
          : statuses.map(([key,title,detail],i)=>`<li class="${i<=idx?'done':''} ${i===idx?'cur':''}">
              <span class="b">${ic(i<=idx?'check':'clock',16)}</span><div><b>${title}</b><div class="sm">${detail}</div></div></li>`).join('')}
        </ol></div>
        <div class="panel"><b>Delivering to</b><p>${esc(o.addr || 'Address on order')}</p>
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
          const {data,error}=await db.from('orders').select('id,status,updated_at').eq('id',id).single();
          if(error) throw error;
          if(data && data.status!==o.status){
            o.status=data.status; o.upd=Date.parse(data.updated_at)||Date.now();
            save(); const el=$('#trk'); if(el) el.innerHTML=make();
            updateChrome();
          }
        }catch(e){console.warn('[Papalita] Tracking refresh:',e.message)}
        finally{busy=false}
      };
      sync(); timers.push(setInterval(sync,5000));
    }};
  }
  const html = () => { const s = stageOf(o), done = s === 5, can = s < 0;
    return `${pageHead('Track order', true, `<span class="chip">${o.id}</span>`)}<div class="two-col"><div><div class="mapbox" aria-label="Delivery route preview"><svg viewBox="0 0 400 260" role="img" aria-label="Map preview of the delivery route"><rect width="400" height="260" fill="#EAF2E8"/><g stroke="#fff" stroke-width="14" fill="none"><path d="M0 130H400M210 0V260M60 0V260M0 210H400M340 0V260M0 70H400"/></g><path d="${PATH}" stroke="#087F32" stroke-width="5" fill="none" stroke-dasharray="2 9" stroke-linecap="round"/><g transform="translate(60 210)"><circle r="14" fill="#fff"/><path d="M-6-3h12v9h-12zM-8-3l2-6h12l2 6" fill="#087F32"/></g><g transform="translate(340 70)"><circle r="14" fill="#101318"/><path d="M-6 1l6-6 6 6v6h-12z" fill="#fff"/></g><g id="rider" transform="translate(60 210)"><circle r="12" fill="#087F32" stroke="#fff" stroke-width="3"/><circle r="4" fill="#fff"/></g></svg></div>
  <p class="sm mu" style="margin:8px 4px">Schematic route preview. ${C.maps.provider === 'none' ? 'Add a Mapbox or Google Maps token in <code>js/config.js</code> for a live map.' : 'Live map provider configured.'}</p>
  <div class="panel"><div class="row sp"><div><h2>${can ? 'Order cancelled' : done ? 'Delivered' : `Arriving in ~${etaMin(o)} min`}</h2><p class="mu sm">From ${esc(r.name)}${o.demo !== false ? ' · simulated updates (demo)' : o.rider ? ' · rider ' + esc(o.rider.name) : ' · live updates'}</p></div>${o.demo !== false ? '<span class="demo">DEMO</span>' : '<span class="status open">LIVE</span>'}</div></div>
  <div class="panel"><ol class="tl">${can ? `<li class="cur"><span class="b">${ic('x', 16)}</span><div><b>${o.status === 'refunded' ? 'Refunded' : 'Cancelled'}</b>${o.cancelReason ? `<div class="sm">${esc(o.cancelReason)}</div>` : ''}</div></li>` : STEPS.map(([t, d, i], k) => `<li class="${k <= s ? 'done' : ''} ${k === s && !done ? 'cur' : ''}"><span class="b">${ic(i, 16)}</span><div><b>${t}</b><div class="sm">${d.replace('Marco', (o.rider || RIDER).name.split(' ')[0])}</div></div></li>`).join('')}</ol></div></div>
  <aside>${s >= 2 && !done && !can ? `<div class="panel row"><span class="avatar" style="width:52px;height:52px;font-size:18px">${esc((o.rider || RIDER).name.split(' ').map(x => x[0]).join(''))}</span><div class="grow"><b>${(o.rider || RIDER).name}</b><p class="mu sm">${(o.rider || RIDER).vehicle || 'Motorcycle'}</p></div><a class="ib" style="background:var(--or);color:#fff" href="tel:${(o.rider || RIDER).phone}" aria-label="Call rider">${ic('phone')}</a></div>` : ''}
  <div class="panel"><div class="sm mu">Delivering to</div><p style="font-weight:600">${esc(o.addr)}</p>${o.note ? `<p class="sm mu" style="margin-top:6px">Note: ${esc(o.note)}</p>` : ''}</div><div class="panel"><h3 style="margin-bottom:6px">Order details</h3>${orderLines(o)}<div class="row sp" style="margin-top:8px;border-top:1px dashed var(--ln);padding-top:10px"><b>Total</b><b>${peso(o.total)}</b></div><p class="sm mu" style="margin-top:6px">${payTag(o)}</p></div>
  ${s >= 0 && s <= 1 ? `<button class="btn d blk" data-a="cancel" data-id="${o.id}">Cancel order</button>` : ''}${done ? rateCard(o) + `<button class="btn p blk" data-a="reorder" data-id="${o.id}">Reorder</button>` : ''}</aside></div>`; };
  return { html: `<section class="view" id="trk">${html()}</section>`, after: () => { let last = stageOf(o); const place = () => { const p = $('#trk path[stroke-dasharray]'), rd = $('#rider'); if (!p || !rd || !p.getTotalLength) return; const s = stageOf(o), pr = s >= 5 ? 1 : s === 4 ? Math.min(.96, (Date.now() - o.createdAt) / 1000 > T[4] ? ((Date.now() - o.createdAt) / 1000 - T[4]) / (T[5] - T[4]) : 0) : 0, L = p.getTotalLength(), pt = p.getPointAtLength(L * pr); rd.setAttribute('transform', `translate(${pt.x} ${pt.y})`); };
    place(); if (last >= 0 && last < 5) timers.push(setInterval(() => { o = ORD(id) || o; const s = stageOf(o); if (s !== last) { last = s; const el = $('#trk'); if (el) el.innerHTML = html(); } place(); const h = $('#trk h2'); if (h && s >= 0 && s < 5) h.textContent = `Arriving in ~${etaMin(o)} min`; }, 1000)); } }; };

/* ---------- orders ---------- */
let OT = 'current';
function reorder(o) { const lines = []; o.items.forEach(l => { const x = ITEM(l.itemId); if (x && x.item.available) lines.push({ ...l, key: uid('l'), unit: unitPrice(x.item, l.sel) }); }); if (!lines.length) return toast('Those items are no longer available.'); if (!isOpen(R(o.rid))) return toast(`${R(o.rid).name} is closed right now.`);
  const go = () => { S.cart = { rid: o.rid, lines: lines.map(l => ({...l, rid: o.rid})) }; save(); updateChrome(true); nav('/cart'); }; S.cart.lines.length && S.cart.rid !== o.rid ? confirmDlg('Replace your current cart with this order?', 'Replace cart').then(ok => ok && go()) : go(); }
V.ordersView = (_, p) => { if (p && p.get('t')) OT = p.get('t'); const cur = myOrders().filter(isCurrent), hist = myOrders().filter(o => !isCurrent(o)), list = OT === 'current' ? cur : hist;
  const card = o => { const s = stageOf(o), r = R(o.rid), st = s < 0 ? (o.status === 'refunded' ? 'Refunded' : 'Cancelled') : s === 5 ? 'Delivered' : STEPS[s][0];
    return `<div class="panel" tabindex="0" role="link" style="cursor:pointer" data-a="odetail" data-id="${o.id}"><div class="row">${`<div style="width:64px">${photo(o.items[0].img, o.items[0].name, { ar: '1', w: 200 }).replace('class="ph', 'style="border-radius:14px" class="ph')}</div>`}<div class="grow"><div class="row sp"><h3>${esc(r.name)}</h3><span class="status ${s < 0 ? 'closed' : s === 5 ? 'open' : 'n'}">${st}</span></div><p class="mu sm">${o.id} · ${new Date(o.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })} · ${o.items.reduce((a, l) => a + l.qty, 0)} items</p><b>${peso(o.total)}</b></div></div>
    <div class="row" style="margin-top:12px">${isCurrent(o) ? `<button class="btn p sm grow" data-a="gotrack" data-id="${o.id}">${ic('bike', 16)}Track</button>` : `<button class="btn p sm grow" data-a="reorder" data-id="${o.id}">Reorder</button>`}<button class="btn s sm grow" data-a="odetail" data-id="${o.id}">Details</button></div></div>`; };
  return { html: `<section class="view">${pageHead('Orders', false)}<div class="chips" role="tablist" style="margin-bottom:14px">${[['current', `Current (${cur.length})`], ['history', 'History'], ['catering', `Catering (${myCater().length})`]].map(([k, l]) => `<button class="chip ${OT === k ? 'on' : ''}" role="tab" aria-selected="${OT === k}" data-a="otab" data-v="${k}">${l}</button>`).join('')}</div>
  ${OT === 'catering' ? cateringList() : list.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,360px),1fr))">${list.map(card).join('')}</div>` : emptyState('orders', OT === 'current' ? 'No active orders' : 'No past orders yet', 'Your orders will appear here.', 'Order food', 'browse')}</section>` }; };
V.orderDetail = id => { const o = ORD(id); if (!o) return V.notFound(); const s = stageOf(o), r = R(o.rid);
  return { html: `<section class="view" style="max-width:680px;margin:0 auto">${pageHead(o.id)}<div class="panel"><div class="row sp"><h3>${esc(r.name)}</h3><span class="status ${s < 0 ? 'closed' : s === 5 ? 'open' : 'n'}">${s < 0 ? (o.status === 'refunded' ? 'Refunded' : 'Cancelled') : s === 5 ? 'Delivered' : STEPS[s][0]}</span></div><p class="mu sm">${new Date(o.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</p>${o.cancelReason ? `<p class="sm" style="color:var(--er);margin-top:4px">${esc(o.cancelReason)}</p>` : ''}</div>
  <div class="panel">${orderLines(o)}<div style="margin-top:10px">${sumHTML({ ...o, promo: o.promo && window.PROMOS.find(p => p.code === o.promo), perr: '', vat: (o.total - (o.tip || 0)) * 12 / 112 })}</div></div><div class="panel sm"><div class="row sp"><span class="mu">Deliver to</span><span style="text-align:right">${esc(o.addr)}</span></div><div class="row sp" style="margin-top:8px"><span class="mu">Payment</span><span>${payTag(o)}</span></div></div>
  ${stageOf(o) === 5 ? rateCard(o) : ''}<button class="btn s blk" data-a="receipt" data-id="${o.id}" style="margin-bottom:10px">${ic('copy', 16)}View receipt</button><div class="row">${isCurrent(o) ? `<button class="btn p grow" data-a="gotrack" data-id="${o.id}">Track order</button>` : `<button class="btn p grow" data-a="reorder" data-id="${o.id}">Reorder</button>`}${s >= 0 && s <= 1 ? `<button class="btn d grow" data-a="cancel" data-id="${o.id}">Cancel order</button>` : ''}</div></section>` }; };

/* ---------- nearby ---------- */
let NB = 'list';
function askLocation() { if (!navigator.geolocation) { S.loc.perm = 'unsupported'; save(); toast('Location is not supported on this device.'); return render(); }
  navigator.geolocation.getCurrentPosition(() => { S.loc.perm = 'granted'; save(); toast('Location is on. Pick your barangay for delivery.'); render(); }, () => { S.loc.perm = 'denied'; save(); toast('Location permission was denied.'); render(); }, { timeout: 8000 }); }
V.nearby = () => { const a = [...RS].sort((x, y) => dist(x) - dist(y)), perm = S.loc.perm;
  const map = `<div class="mapbox"><svg viewBox="0 0 400 320" role="img" aria-label="Nearby restaurants map"><rect width="400" height="320" fill="#EAF2E8"/><g stroke="#fff" stroke-width="12"><path d="M0 160H400M200 0V320M90 0V320M310 0V320M0 70H400M0 250H400"/></g><circle cx="200" cy="160" r="9" fill="#1b6cff" stroke="#fff" stroke-width="3"/><text x="200" y="186" text-anchor="middle" font-size="11" font-weight="700" fill="#1b6cff">You</text>${a.map(r => { const x = Math.max(30, Math.min(370, 200 + r.dx * 50)), y = Math.max(30, Math.min(290, 160 + r.dy * 50)); return `<g data-a="rest" data-id="${r.id}" tabindex="0" role="link" aria-label="${esc(r.name)}" style="cursor:pointer" transform="translate(${x} ${y})"><path d="M0 0c-14-14-14-34 0-34s14 20 0 34z" transform="translate(0 0)" fill="#087F32" stroke="#fff" stroke-width="2"/><circle cy="-22" r="4" fill="#fff"/><text y="14" text-anchor="middle" font-size="10" font-weight="700" fill="#101318">${esc(r.name)}</text></g>`; }).join('')}</svg></div><p class="sm mu" style="margin:8px 4px">Schematic map: pins are placed relative to your delivery location. ${C.maps.provider === 'none' ? 'Add a map token in <code>js/config.js</code> for live maps.' : ''}</p>`;
  return { html: `<section class="view">${pageHead('Nearby', false, `<button class="btn s sm" data-a="loc">${ic('pin', 16)}Change</button>`)}<div class="panel row"><span class="ic" style="width:42px;height:42px;border-radius:14px;background:var(--or-s);color:var(--or);display:grid;place-items:center">${ic('nav')}</span><div class="grow"><b>${esc(S.loc.label)}</b><p class="mu sm">${perm === 'granted' ? 'Location access on' : perm === 'denied' ? 'Location blocked. Enable it in your browser settings, or pick an area manually.' : 'Share your location for accurate distances.'}</p></div>${perm !== 'granted' ? `<button class="btn p sm" data-a="askloc">Use my location</button>` : ''}</div>
  <div class="chips" style="margin:14px 0">${[['list', 'list', 'List'], ['map', 'map', 'Map']].map(([k, i, l]) => `<button class="chip ${NB === k ? 'on' : ''}" data-a="nbv" data-v="${k}">${ic(i, 16)}${l}</button>`).join('')}</div>
  ${NB === 'map' ? map : ''}<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,340px),1fr));${NB === 'map' ? 'margin-top:14px' : ''}">${a.map(r => `<div class="panel row" tabindex="0" role="link" style="cursor:pointer;margin:0" data-a="rest" data-id="${r.id}"><div style="width:84px">${photo(r.cover, r.name, { ar: '1', w: 240 }).replace('class="ph', 'style="border-radius:16px" class="ph')}</div><div class="grow"><div class="row sp"><h3>${esc(r.name)}</h3><span class="status ${isOpen(r) ? 'open' : 'closed'}">${isOpen(r) ? 'Open' : 'Closed'}</span></div><p class="mu sm">${esc(r.kind)} · ${dist(r).toFixed(1)} km</p><p class="sm row g">${stars(r.rating)} <span class="mu">· ${ic('clock', 14)} ${etaOf(r)[0] + Math.round(dist(r))}–${etaOf(r)[1] + Math.round(dist(r))} min</span></p></div></div>`).join('')}</div></section>` }; };

/* ---------- promos ---------- */
V.promos = () => ({ html: `<section class="view" style="max-width:760px;margin:0 auto">${pageHead('Promotions')}${window.PROMOS.filter(p => p.active !== false).map(p => { const exp = p.exp && new Date(p.exp + 'T23:59:59+08:00') < new Date(), on = S.promo === p.code;
  return `<div class="panel"><div class="row sp"><div><h3>${esc(p.title)}</h3><p class="mu sm" style="margin-top:2px">${esc(p.desc)}</p></div><span class="chip" style="border:1.5px dashed var(--or);color:var(--or-d)">${esc(p.code)}</span></div>
  <ul class="sm mu" style="margin:10px 0 12px 18px"><li>Minimum order ${peso(p.min)}</li><li>${p.rid ? 'Valid at ' + esc(R(p.rid).name) + ' only' : 'Valid at all restaurants'}</li><li>${exp ? 'Expired' : 'Expires ' + new Date(p.exp + 'T00:00:00+08:00').toLocaleDateString('en-PH', { dateStyle: 'long' })}</li></ul>
  <div class="row"><button class="btn ${on ? 's' : 'p'} sm grow" data-a="usepromo" data-id="${p.code}" ${exp ? 'disabled' : ''}>${on ? 'Applied ✓' : 'Apply promo'}</button><button class="btn o sm" data-a="copy" data-id="${p.code}" aria-label="Copy code ${esc(p.code)}">${ic('copy', 16)}Copy</button></div></div>`; }).join('')}</section>` });

/* ---------- profile & account ---------- */
const row = (i, t, s, a, extra = '') => `<button class="li" data-a="${a}"><span class="ic">${ic(i, 20)}</span><span class="grow"><b>${t}</b>${s ? `<br><span class="sm mu">${s}</span>` : ''}</span>${extra}${ic('chev', 18, 'mu')}</button>`;
V.profile = () => ({ html: `<section class="view" style="max-width:680px;margin:0 auto">${pageHead('Profile', false)}<div class="panel row">${avatar()}<div class="grow"><h2>${esc(S.user.name)}</h2><p class="mu sm">${esc(S.user.email)}${S.user.phone ? ' · ' + esc(S.user.phone) : ''}</p></div><button class="btn s sm" data-a="go" data-id="/profile/edit">Edit</button></div>
  <div class="panel" style="padding:4px 16px">${row('pin', 'Saved addresses', S.addrs.length + ' saved', 'go2', '').replace('data-a="go2"', 'data-a="go" data-id="/addresses"')}${[['orders', 'My orders', myOrders().filter(isCurrent).length + ' active', '/orders'], ['box', 'Catering requests', myCater().length + ' sent', '/orders?t=catering'], ['nav', 'Nearby restaurants', 'List and map', '/nearby'], ['card', 'Payment methods', S.pay.length + ' saved', '/payments'], ['heart', 'Favorites', S.fav.items.length + S.fav.rests.length + ' saved', '/favorites'], ['ticket', 'Promotions', 'Discounts and codes', '/promos'], ['bell', 'Notifications', unread() ? unread() + ' unread' : 'All caught up', '/notifications'], ['help', 'Support', 'FAQs and contact', '/support']].map(([i, t, s, p]) => row(i, t, s, 'go').replace('data-a="go"', `data-a="go" data-id="${p}"`)).join('')}</div>
  <div class="panel" style="padding:4px 16px"><div class="li"><span class="ic">${ic('bike',20)}</span><span class="grow"><b>Order updates</b><br><span class="sm mu">Open an order to check its recorded status.</span></span></div>${S.user.id !== 'demo' ? `<button class="li" data-a="pwchange"><span class="ic">${ic('shield', 20)}</span><span class="grow"><b>Change password</b></span>${ic('chev', 18, 'mu')}</button><button class="li" data-a="delacct" style="color:var(--er)"><span class="ic" style="background:#FEECEA;color:var(--er)">${ic('trash', 20)}</span><b>Delete account</b></button>` : '<p class="sm mu" style="padding:12px 4px">You are using the demo account.</p>'}<button class="li" data-a="logout" style="color:var(--er)"><span class="ic" style="background:#FEECEA;color:var(--er)">${ic('logout', 20)}</span><b>Log out</b></button></div></section>` });
V.editProfile = () => ({ html: `<section class="view" style="max-width:560px;margin:0 auto">${pageHead('Edit profile')}<form id="pf" class="panel" novalidate><div class="row" style="margin-bottom:16px">${avatar()}<label class="btn s sm" style="cursor:pointer">Change photo<input type="file" id="pimg" accept="image/*" class="sr"></label></div><div class="field"><label for="pn">Name</label><input class="in" id="pn" value="${esc(S.user.name)}"><p class="err" data-e="pn"></p></div><div class="field"><label for="pe">Email</label><input class="in" id="pe" type="email" value="${esc(S.user.email)}"><p class="err" data-e="pe"></p></div><div class="field"><label for="pp">Mobile number</label><input class="in" id="pp" value="${esc(S.user.phone || '')}"><p class="err" data-e="pp"></p></div><button class="btn p blk">Save changes</button></form></section>` });
V.addresses = () => ({ html: `<section class="view" style="max-width:680px;margin:0 auto">${pageHead('Saved addresses', true, `<button class="btn p sm" data-a="addrform">${ic('plus', 16)}Add</button>`)}${S.addrs.length ? S.addrs.map(a => `<div class="panel"><div class="row sp"><div><h3>${esc(a.label)} ${a.def ? '<span class="status open">Default</span>' : ''}</h3><p class="mu sm">${esc(a.line)}, ${esc(a.city)}</p></div></div><div class="row" style="margin-top:10px"><button class="btn s sm" data-a="addrform" data-id="${a.id}">Edit</button>${a.def ? '' : `<button class="btn s sm" data-a="addrdef" data-id="${a.id}">Make default</button>`}<button class="btn d sm" data-a="addrdel" data-id="${a.id}">Delete</button></div></div>`).join('') : emptyState('pin', 'No saved addresses', 'Add one for faster checkout.', 'Add address', 'addrform')}</section>` });
function addrForm(id) { const a = S.addrs.find(x => x.id === id) || { label: '', line: '', city: '' };
  const el = openSheet(`<form class="pd" style="padding-top:34px" novalidate><h2 style="margin-bottom:14px">${id ? 'Edit' : 'Add'} address</h2><div class="field"><label for="fl">Label</label><input class="in" id="fl" value="${esc(a.label)}" maxlength="20" placeholder="Home, Work…"><p class="err" data-e="fl"></p></div><div class="field"><label for="fs">Purok, street or building</label><input class="in" id="fs" value="${esc(a.line)}"><p class="err" data-e="fs"></p></div><div class="field"><label for="fc">Barangay</label><select class="in" id="fc">${window.BRGYS.map(b => `<option value="${b.n}, Alegria" ${a.city === b.n + ', Alegria' || (!a.city && b.n === S.loc.brgy) ? 'selected' : ''}>${b.n}</option>`).join('')}</select><p class="err" data-e="fc"></p></div><div class="field"><label for="fk">Landmark (optional)</label><input class="in" id="fk" value="${esc(a.landmark || '')}" maxlength="80" placeholder="Near the chapel, blue gate…"></div><button class="btn p blk">Save address</button></form>`, { label: 'Address' });
  $('form', el).onsubmit = e => { e.preventDefault(); const v = k => $('#' + k, el).value.trim(), er = {}; if (!v('fl')) er.fl = 'Give it a name.'; if (v('fs').length < 5) er.fs = 'Enter a street or building.'; if (!v('fc')) er.fc = 'Choose your barangay.';
    $$('[data-e]', el).forEach(x => x.textContent = ''); const k = Object.keys(er); if (k.length) { k.forEach(x => $(`[data-e=${x}]`, el).textContent = er[x]); return $('#' + k[0], el).focus(); }
    if (id) { Object.assign(a, { label: v('fl'), line: v('fs'), city: v('fc'), landmark: v('fk') }); if (a.def) syncLoc(a); } else { const n = { id: uid('a'), label: v('fl'), line: v('fs'), city: v('fc'), landmark: v('fk'), def: true }; S.addrs.forEach(x => x.def = false); S.addrs.push(n); CK.addr = n.id; syncLoc(n); } save(); closeSheet(); toast('Address saved.'); updateChrome(); render(); };
}
V.payments = () => ({ html: `<section class="view" style="max-width:680px;margin:0 auto">${pageHead('Payment methods', true, `<button class="btn p sm" data-a="payform">${ic('plus', 16)}Add</button>`)}<p class="note" style="margin-bottom:14px"><span class="demo">DEMO</span> Only a label and last digits are saved on this device. In production, GCash, Maya and cards are tokenized by your payment provider.</p>${S.pay.length ? S.pay.map(p => `<div class="panel row"><span class="ic" style="width:42px;height:42px;border-radius:14px;background:var(--or-s);color:var(--or);display:grid;place-items:center">${ic('card')}</span><div class="grow"><b>${PAYNAME[p.type]}</b><p class="mu sm">${esc(p.detail)}</p></div><button class="btn d sm" data-a="paydel" data-id="${p.id}">Remove</button></div>`).join('') : emptyState('card', 'No saved methods', 'Cash on Delivery is always available at checkout.', 'Add method', 'payform')}</section>` });
function payForm() { const el = openSheet(`<form class="pd" style="padding-top:34px" novalidate><h2 style="margin-bottom:14px">Add payment method</h2><div class="field"><label for="pt">Type</label><select class="in" id="pt"><option value="gcash">GCash</option><option value="maya">Maya</option><option value="card">Credit / debit card</option></select></div><div class="field"><label for="pv" id="pvl">Mobile number</label><input class="in" id="pv" inputmode="numeric" placeholder="09XXXXXXXXX"><p class="err" data-e="pv"></p></div><button class="btn p blk">Save method</button></form>`, { label: 'Add payment' });
  $('#pt', el).onchange = e => { const c = e.target.value === 'card'; $('#pvl', el).textContent = c ? 'Card number' : 'Mobile number'; $('#pv', el).placeholder = c ? '4242 4242 4242 4242' : '09XXXXXXXXX'; };
  $('form', el).onsubmit = e => { e.preventDefault(); const t = $('#pt', el).value, v = $('#pv', el).value.replace(/\s/g, ''); let d, er = '';
    if (t === 'card') { if (!/^\d{13,19}$/.test(v) || !luhn(v)) er = 'Enter a valid card number.'; d = (v[0] === '4' ? 'Visa' : v[0] === '5' ? 'Mastercard' : 'Card') + ' •••• ' + v.slice(-4); } else { if (!PH.test(v)) er = 'Use a PH mobile number like 09171234567.'; d = v.slice(0, 4) + ' ••• ' + v.slice(-4); }
    $('[data-e=pv]', el).textContent = er; if (er) return $('#pv', el).focus(); S.pay.push({ id: uid('p'), type: t, detail: d }); save(); closeSheet(); toast('Payment method added.'); render(); };
}
let FT = 'items';
V.favorites = () => { const its = S.fav.items.map(ITEM).filter(Boolean), rs = S.fav.rests.map(R).filter(Boolean);
  return { html: `<section class="view">${pageHead('Favorites')}<div class="chips" style="margin-bottom:14px">${[['items', 'Dishes'], ['rests', 'Restaurants']].map(([k, l]) => `<button class="chip ${FT === k ? 'on' : ''}" data-a="ftb" data-v="${k}">${l}</button>`).join('')}</div>${(FT === 'items' ? its : rs).length ? `<div class="grid">${FT === 'items' ? its.map(dishCard).join('') : rs.map(restCard).join('')}</div>` : emptyState('heart', 'No favorites yet', 'Tap the heart on any dish or restaurant to save it.', 'Explore food', 'browse')}</section>` }; };
let NT = 'all';
V.notifications = () => { const l = myNotes().filter(n => NT === 'all' || n.type === NT), tm = t => { const m = Math.round((Date.now() - t) / 6e4); return m < 1 ? 'Just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
  return { html: `<section class="view" style="max-width:680px;margin:0 auto">${pageHead('Notifications', true, `<button class="btn s sm" data-a="readall" ${unread() ? '' : 'disabled'}>Mark all read</button>`)}<div class="chips" style="margin-bottom:14px">${[['all', 'All'], ['order', 'Orders'], ['promo', 'Promotions'], ['account', 'Account']].map(([k, t]) => `<button class="chip ${NT === k ? 'on' : ''}" data-a="ntab" data-v="${k}">${t}</button>`).join('')}</div>
  ${l.length ? l.map(n => `<button class="panel row" style="width:100%;text-align:left;${n.read ? '' : 'background:var(--or-s);border-color:#FFD2A8'}" data-a="nopen" data-id="${n.id}"><span class="ic" style="width:42px;height:42px;border-radius:14px;background:#fff;color:var(--or);display:grid;place-items:center;flex:none">${ic(n.type === 'order' ? 'bike' : n.type === 'promo' ? 'ticket' : 'user', 20)}</span><span class="grow"><b>${esc(n.t)}</b><br><span class="sm mu">${esc(n.b)}</span><br><span class="sm mu">${tm(n.at)}</span></span>${n.read ? '' : '<i style="width:10px;height:10px;border-radius:50%;background:var(--or)" aria-label="Unread"></i>'}</button>`).join('') : emptyState('bell', 'Nothing here', 'We will let you know when something changes.')}</section>` }; };
const FAQ = [['How long does delivery take?', 'Most orders arrive in 20–50 minutes depending on the restaurant and distance. You can follow your rider live from Track order.'], ['Can I cancel my order?', 'Yes, until the restaurant starts preparing it. Open the order and tap Cancel order.'], ['Which payment methods are supported?', 'GCash, Maya, cards and Cash on Delivery. Online payments run in demo mode until a provider is connected.'], ['An item was missing or wrong.', 'Send us a message below with your order number and we will refund or replace it.']];
V.support = () => ({ html: `<section class="view" style="max-width:680px;margin:0 auto">${pageHead('Support')}<div class="panel">${FAQ.map(([q, a]) => `<details style="padding:12px 0;border-bottom:1px solid var(--ln)"><summary style="font-weight:700;cursor:pointer;min-height:28px">${q}</summary><p class="mu" style="margin-top:8px">${a}</p></details>`).join('')}</div>
  <form id="sf" class="panel" novalidate><h3 style="margin-bottom:12px">Contact us</h3><div class="field"><label for="ss">Topic</label><select class="in" id="ss"><option>Order issue</option><option>Payment</option><option>Account</option><option>Other</option></select></div><div class="field"><label for="sm">Message</label><textarea class="in" id="sm" maxlength="500" placeholder="Include your order number if you have one"></textarea><p class="err" data-e="sm"></p></div><button class="btn p blk">Send message</button><p class="sm mu" style="margin-top:8px">Demo: messages are not transmitted until the support backend is connected.</p></form></section>` });
V.categories = () => ({ html: `<section class="view">${pageHead('All categories')}<div class="grid">${CATS.map(c => `<button class="card" data-a="cat" data-id="${c.id}" style="text-align:left">${photo(c.img, c.name, { w: 500 })}<div class="bd"><div class="nm"><span>${c.name}</span>${ic('chev', 18, 'mu')}</div><div class="meta">${ALL().filter(x => x.item.cat === c.id).length} dishes</div></div></button>`).join('')}</div></section>` });
/* ---------- accounts, sign-in and registration ----------
   DEMO: accounts live in this browser only and the confirmation code is shown on screen (no SMS is sent).
   Production: Supabase Auth (phone OTP via an SMS provider) replaces everything in this section. */
const ACC = 'foodie.alegria.accounts', SES = 'foodie.alegria.session';
const DEMO = { id: 'demo', name: 'Tommy', email: 'tommy@example.com', phone: '09171234567', brgy: 'Poblacion' };
const accounts = () => { try { return JSON.parse(localStorage.getItem(ACC)) || []; } catch (e) { return []; } };
const saveAcc = a => localStorage.setItem(ACC, JSON.stringify(a));
const getSession = () => { try { return JSON.parse(sessionStorage.getItem(SES) || localStorage.getItem(SES) || 'null'); } catch (e) { return null; } };
const setSession = (id, remember) => { try { sessionStorage.removeItem(SES); localStorage.removeItem(SES); (remember ? localStorage : sessionStorage).setItem(SES, JSON.stringify({ id, at: Date.now() })); } catch (e) {} };
const clearSession = () => { try { sessionStorage.removeItem(SES); localStorage.removeItem(SES); } catch (e) {} };
const normPhone = p => { p = String(p || '').replace(/[\s-]/g, ''); return p.startsWith('+63') ? '0' + p.slice(3) : p; };
const maskPhone = p => p.slice(0, 4) + ' ••• ' + p.slice(-4);
const pwOk = p => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);
const pwScore = p => { let n = 0; if (p.length >= 8) n++; if (/[a-z]/.test(p) && /[A-Z]/.test(p)) n++; if (/\d/.test(p)) n++; if (/[^A-Za-z0-9]/.test(p) || p.length >= 12) n++; return n; };
async function hashPw(pw, salt) { try { if (window.crypto && crypto.subtle) { const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']); const b = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 60000, hash: 'SHA-256' }, k, 256); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); } } catch (e) {} let h = hash32(salt + pw), out = ''; for (let i = 0; i < 8; i++) { h = hash32(h + ':' + salt + ':' + pw + ':' + i); out += h.toString(16).padStart(8, '0'); } return 'f' + out; /* weak fallback for insecure contexts; real browsers use PBKDF2 above */ }
const BUCKET = ['fav', 'addrs', 'pay', 'cart', 'promo', 'loc', 'recent'];
const freshBucket = brgy => ({ fav: { items: [], rests: [] }, addrs: [], pay: [], cart: { rid: null, lines: [] }, promo: null, recent: [], loc: { label: (brgy || 'Poblacion') + ', Alegria', brgy: brgy || 'Poblacion', perm: 'unknown' } });
function stashUser() { if (!S.user || !S.user.id) return; (S.users = S.users || {})[S.user.id] = Object.assign(Object.fromEntries(BUCKET.map(k => [k, S[k]])), { prof: { name: S.user.name, email: S.user.email, phone: S.user.phone, photo: S.user.photo || '' } }); }
function adoptUser(acc) { S.users = S.users || {}; const b = S.users[acc.id] || {}, f = freshBucket(acc.brgy); BUCKET.forEach(k => S[k] = b[k] !== undefined ? b[k] : f[k]); const p = b.prof || {}; S.user = { id: acc.id, name: p.name || acc.name, email: p.email ?? acc.email ?? '', phone: p.phone || acc.phone, photo: p.photo || '', in: false }; }
function enterApp(acc, remember, isNew) { if (S.user.id !== acc.id) { stashUser(); adoptUser(acc); } S.user.in = true; setSession(acc.id, remember); if (isNew) notify('account', 'Welcome to Papalita', 'Add your address at checkout and order from local stores.'); save(); AU.view = 'login'; AU.fails = 0; location.hash = '#/'; render(); }
function restoreSession() { S.user.id = S.user.id || 'demo'; S.users = S.users || {}; S.recent = S.recent || []; S.user.in = false; const ses = getSession(); if (!ses) return; const acc = ses.id === 'demo' ? DEMO : accounts().find(a => a.id === ses.id); if (!acc) return clearSession(); if (S.user.id !== acc.id) { stashUser(); adoptUser(acc); } S.user.in = true; }
const own = x => (x.uid || 'demo') === S.user.id;
const myOrders = () => S.orders.filter(o=>own(o) && o.demo === false), myNotes = () => S.notes.filter(own), myCater = () => (S.cater || []).filter(own);

let AU = { view: 'login', fails: 0, lock: 0, otp: null, reg: null, pending: null, slide: 0, prefill: '', busy: false };
const SLIDES = [{ img: 'bulalo', t: 'Local favorites, delivered', d: 'Order from Kent and Kaye Bulaloan, Dona Conchita Lakeview Resort and more across Alegria.' }, { img: 'ramen', t: 'Track your rider', d: 'Follow your order from the kitchen to your door, barangay by barangay.' }, { img: 'tray', t: 'Catering for every event', d: 'Birthdays, fiestas and weddings: request trays or a full buffet in minutes.' }];
const authHead = () => `<div class="auth-top"><span class="auth-logo papalita-logo-motion"><img src="images/papalita_mark_color.png" alt="Papalita official logo"></span><div><b>PAPALITA</b><span>Good Food, Good Mood.</span></div></div>`;
const pwField = (id, label, auto, extra = '') => `<div class="field"><label for="${id}">${label}</label><div class="pw"><input class="in" id="${id}" type="password" autocomplete="${auto}">${`<button type="button" class="pwt" data-a="pwtoggle" data-id="${id}" aria-label="Show password">${ic('eye', 20)}</button>`}</div>${extra}<p class="err" data-e="${id}"></p></div>`;
const meterHTML = id => `<div class="meter" data-m="${id}" aria-hidden="true"><i></i><i></i><i></i><i></i></div><p class="sm mu" data-mt="${id}">Use 8+ characters with letters and numbers.</p>`;
function authScreen() {
  const tabs = t => `<div class="seg" role="tablist"><button role="tab" aria-selected="${t === 'login'}" class="${t === 'login' ? 'on' : ''}" data-a="authtab" data-v="login">Log in</button><button role="tab" aria-selected="${t === 'register'}" class="${t === 'register' ? 'on' : ''}" data-a="authtab" data-v="register">Register</button></div>`;
  if (AU.view === 'welcome') { const s = SLIDES[AU.slide], last = AU.slide === SLIDES.length - 1;
    return `<section class="view welcome"><div class="wphoto">${photo(s.img, s.t, { ar: '4/5', w: 900, eager: 1 })}</div><div class="wbody"><div class="dots" aria-hidden="true">${SLIDES.map((_, i) => `<i class="${i === AU.slide ? 'on' : ''}"></i>`).join('')}</div>${AU.slide === 0 ? `<p class="gl" style="font-weight:800">Welcome, ${esc(AU.pending.name.split(' ')[0])}!</p>` : ''}<h1>${esc(s.t)}</h1><p class="mu">${esc(s.d)}</p><div class="row" style="margin-top:18px"><button class="btn s grow" data-a="wskip">Skip</button><button class="btn p grow" data-a="wnext">${last ? 'Get started' : 'Next'}</button></div></div></section>`; }
  if (AU.view === 'otp') { const o = AU.otp;
    return `<section class="view auth">${authHead()}<button class="ib" data-a="otpback" aria-label="Back" style="margin-top:18px">${ic('back')}</button><h1 style="margin-top:12px">${o.purpose === 'register' ? 'Confirm your number' : 'Reset your password'}</h1><p class="mu">We sent a 6-digit code to <b style="color:var(--ink)">${maskPhone(o.phone)}</b>.</p>
    ${C.auth && C.auth.otp !== 'demo' ? '' : `<div class="note" style="margin:14px 0"><span class="demo">DEMO</span> SMS is not connected yet, so your code is shown here: <b class="codebig" id="democode">${o.code}</b></div>`}
    <form id="vf" novalidate><div class="otp" role="group" aria-label="6-digit confirmation code">${[0, 1, 2, 3, 4, 5].map(i => `<input class="otpbox" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="${i ? 'off' : 'one-time-code'}" data-i="${i}" aria-label="Digit ${i + 1}">`).join('')}</div><p class="err" id="oe" role="alert" style="text-align:center;min-height:20px"></p><p class="sm mu" style="text-align:center">Code expires in <b id="otpt">5:00</b></p><button class="btn p blk" style="margin-top:12px">Verify</button></form>
    <div style="text-align:center;margin-top:10px"><button class="link" data-a="otpresend" id="rsb" disabled>Resend code</button></div></section>`; }
  if (AU.view === 'forgot') return `<section class="view auth">${authHead()}<button class="ib" data-a="authtab" data-v="login" aria-label="Back" style="margin-top:18px">${ic('back')}</button><h1 style="margin-top:12px">Forgot password?</h1><p class="mu">Enter your mobile number and we will send a confirmation code.</p><form id="ff" novalidate style="margin-top:16px"><div class="field"><label for="fm">Mobile number</label><input class="in" id="fm" inputmode="tel" placeholder="09XXXXXXXXX" autocomplete="tel"><p class="err" data-e="fm"></p></div><button class="btn p blk">Send code</button></form></section>`;
  if (AU.view === 'reset') return `<section class="view auth">${authHead()}<h1 style="margin-top:22px">Create a new password</h1><form id="rp" novalidate style="margin-top:16px">${pwField('np1', 'New password', 'new-password', meterHTML('np1'))}${pwField('np2', 'Confirm new password', 'new-password')}<button class="btn p blk">Save password</button></form></section>`;
  if (AU.view === 'register') return `<section class="view auth">${authHead()}<h1 style="margin-top:22px">Create your account</h1><p class="mu" style="margin-bottom:14px">Order from local stores in Alegria. Verify your email after registration to activate your account.</p>${tabs('register')}
    <form id="rf" novalidate><div class="field"><label for="rn">Full name</label><input class="in" id="rn" autocomplete="name" maxlength="60"><p class="err" data-e="rn"></p></div><div class="field"><label for="rm">Mobile number</label><input class="in" id="rm" inputmode="tel" placeholder="09XXXXXXXXX" autocomplete="tel"><p class="err" data-e="rm"></p></div>
    <div class="field"><label for="re">Email address (required)</label><input class="in" id="re" type="email" autocomplete="email"><p class="err" data-e="re"></p></div><div class="field"><label for="rb">Barangay</label><select class="in" id="rb"><option value="">Choose your barangay</option>${window.BRGYS.map(b => `<option>${b.n}</option>`).join('')}</select><p class="err" data-e="rb"></p></div>
    ${pwField('rpw', 'Password', 'new-password', meterHTML('rpw'))}${pwField('rpc', 'Confirm password', 'new-password')}
    <label class="row sm" style="align-items:flex-start;margin:4px 0 4px"><input type="checkbox" id="rt" style="accent-color:var(--or);width:20px;height:20px;margin-top:2px"><span>I agree to the <button type="button" class="link gl" style="padding:0" data-a="terms">Terms and Privacy Policy</button></span></label><p class="err" data-e="rt"></p><button class="btn p blk" style="margin-top:10px">Create account</button></form></section>`;
  return `<section class="view auth">${authHead()}<h1 style="margin-top:22px">Welcome back</h1><p class="mu" style="margin-bottom:14px">Log in to order, track your rider and manage catering requests.</p>${tabs('login')}
    <form id="lf" novalidate><div class="field"><label for="li">Email address</label><input class="in" id="li" autocomplete="username" value="${esc(AU.prefill)}"><p class="err" data-e="li"></p></div>${pwField('lp', 'Password', 'current-password')}
    <div class="row sp" style="margin-bottom:12px"><label class="row sm"><input type="checkbox" id="lr" style="accent-color:var(--or);width:20px;height:20px"> Keep me signed in</label><button type="button" class="link gl" data-a="forgot">Forgot password?</button></div><button class="btn p blk">Log in</button></form>
    <p class="note" style="margin-top:16px">Secure login powered by Supabase Auth.</p></section>`;
}
const clearErrs = f => { $$('.in', f).forEach(i => i.classList.remove('bad')); $$('[data-e]', f).forEach(x => x.textContent = ''); };
const showErrs = (f, er) => { clearErrs(f); const k = Object.keys(er); k.forEach(x => { const i = $('#' + x, f); i && i.classList.add('bad'); const e = $(`[data-e=${x}]`, f); e && (e.textContent = er[x]); }); if (k.length) { const i = $('#' + k[0], f); i && i.focus(); } return k.length; };
const newCode = () => String(Math.floor(100000 + Math.random() * 900000));
function sendOtp(purpose, phone, payload) { const keep = AU.otp && AU.otp.phone === phone ? AU.otp.resends : 0; AU.otp = { purpose, phone, payload, code: newCode(), exp: Date.now() + 300000, sentAt: Date.now(), tries: 0, resends: keep }; AU.view = 'otp'; render(); }
function afterAuth() { if (AU.view !== 'otp') return; const first = $('.otpbox'); first && first.focus(); const tick = () => { const o = AU.otp; if (!o || !$('#otpt')) return; const left = Math.max(0, Math.ceil((o.exp - Date.now()) / 1000)); $('#otpt').textContent = left ? Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') : 'expired'; const w = Math.max(0, 30 - Math.floor((Date.now() - o.sentAt) / 1000)), b = $('#rsb'); if (b) { b.disabled = w > 0 || o.resends >= 3; b.textContent = o.resends >= 3 ? 'Resend limit reached' : w > 0 ? `Resend code in ${w}s` : 'Resend code'; } }; tick(); timers.push(setInterval(tick, 1000)); }
async function verifyOtp() { const o = AU.otp; if (!o || AU.busy) return; const boxes = $$('.otpbox'), code = boxes.map(b => b.value).join(''), er = $('#oe');
  if (code.length < 6) return (er.textContent = 'Enter all 6 digits.');
  if (Date.now() > o.exp) return (er.textContent = 'This code has expired. Request a new one.');
  if (o.tries >= 5) return (er.textContent = 'Too many wrong attempts. Request a new code.');
  if (code !== o.code) { o.tries++; const left = 5 - o.tries; er.textContent = `Wrong code. ${left} attempt${left === 1 ? '' : 's'} left.`; boxes.forEach(b => { b.value = ''; b.classList.add('bad'); }); setTimeout(() => boxes.forEach(b => b.classList.remove('bad')), 600); boxes[0].focus(); return; }
  AU.busy = true; try { if (o.purpose === 'register') { const r = AU.reg, salt = uid('s'), acc = { id: uid('u'), name: r.name, phone: r.phone, email: r.email, brgy: r.brgy, salt, pw: await hashPw(r.pw, salt), createdAt: Date.now(), verified: true }; const a = accounts(); a.push(acc); saveAcc(a); AU.pending = acc; AU.reg = null; AU.otp = null; AU.slide = 0; AU.view = 'welcome'; }
    else { AU.view = 'reset'; } } finally { AU.busy = false; } render(); }
const authDB = () => {
  if (!window.PAPALITA_DB) throw new Error('Supabase client not available. Check js/config.js and script loading.');
  return window.PAPALITA_DB;
};
function useAuthUser(user) {
  const meta = user.user_metadata || {};
  const acc = { id:user.id, name:meta.full_name || user.email?.split('@')[0] || 'Customer',
    phone:meta.phone || '', email:user.email || '', brgy:meta.barangay || 'Poblacion' };
  if (S.user.id !== acc.id) { stashUser(); adoptUser(acc); }
  S.user.in = true;
  S.user.email = acc.email;
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
async function doReset(f) { const p1 = $('#np1', f).value, er = {}; if (!pwOk(p1)) er.np1 = 'Use at least 8 characters with a letter and a number.'; else if ($('#np2', f).value !== p1) er.np2 = 'Passwords do not match.'; if (showErrs(f, er)) return;
  const a = accounts(), acc = a.find(x => x.id === AU.otp.payload.id); acc.salt = uid('s'); acc.pw = await hashPw(p1, acc.salt); saveAcc(a); AU.prefill = acc.phone; AU.otp = null; AU.view = 'login'; AU.fails = 0; AU.lock = 0; toast('Password updated. Please log in.'); render(); }
function meter(input) { const id = input.id, n = pwScore(input.value), bars = $$(`[data-m=${id}] i`), t = $(`[data-mt=${id}]`); bars.forEach((b, i) => { b.className = i < n ? 's' + n : ''; }); if (t) t.textContent = !input.value ? 'Use 8+ characters with letters and numbers.' : ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'][n] + (pwOk(input.value) ? '' : ' · needs 8+ characters, a letter and a number'); }
function termsSheet() { window.papalitaOpenLegal?.(); }
function pwChangeSheet() { const el = openSheet(`<form class="pd" style="padding-top:34px" novalidate><h2 style="margin-bottom:12px">Change password</h2>${pwField('cp0', 'Current password', 'current-password')}${pwField('np1', 'New password', 'new-password', meterHTML('np1'))}${pwField('np2', 'Confirm new password', 'new-password')}<button class="btn p blk">Update password</button></form>`, { label: 'Change password' });
  $('form', el).onsubmit = async e => { e.preventDefault(); const f = e.target, er = {}, a = accounts(), acc = a.find(x => x.id === S.user.id); if (!acc || (await hashPw($('#cp0', f).value, acc.salt)) !== acc.pw) er.cp0 = 'Current password is incorrect.'; const p1 = $('#np1', f).value; if (!pwOk(p1)) er.np1 = 'Use at least 8 characters with a letter and a number.'; else if ($('#np2', f).value !== p1) er.np2 = 'Passwords do not match.'; if (showErrs(f, er)) return; acc.salt = uid('s'); acc.pw = await hashPw(p1, acc.salt); saveAcc(a); closeSheet(); toast('Password updated.'); }; }
function deleteAcctSheet() { const el = openSheet(`<form class="pd" style="padding-top:34px" novalidate><h2 style="margin-bottom:6px">Delete your account?</h2><p class="mu sm" style="margin-bottom:14px">Your saved addresses, favorites and payment methods on this device will be removed. Past orders stay with the stores. This cannot be undone.</p>${pwField('dp', 'Enter your password to confirm', 'current-password')}<div class="row"><button type="button" class="btn o grow" data-a="close">Cancel</button><button class="btn d grow">Delete account</button></div></form>`, { label: 'Delete account' });
  $('form', el).onsubmit = async e => { e.preventDefault(); const f = e.target, a = accounts(), acc = a.find(x => x.id === S.user.id); if (!acc || (await hashPw($('#dp', f).value, acc.salt)) !== acc.pw) return showErrs(f, { dp: 'Password is incorrect.' }); saveAcc(a.filter(x => x.id !== acc.id)); if (S.users) delete S.users[acc.id]; S.user.id = '_gone'; adoptUser(DEMO); clearSession(); save(); closeSheet(); AU.view = 'login'; toast('Your account was deleted.'); render(); }; }
document.addEventListener('input', e => { const t = e.target; if (t.classList && t.classList.contains('otpbox')) { t.value = t.value.replace(/\D/g, '').slice(-1); if (t.value) { const n = t.nextElementSibling; n ? n.focus() : verifyOtp(); } } if (t.id === 'rpw' || t.id === 'np1') meter(t); });
document.addEventListener('keydown', e => { const t = e.target; if (t.classList && t.classList.contains('otpbox')) { if (e.key === 'Backspace' && !t.value && t.previousElementSibling) t.previousElementSibling.focus(); if (e.key === 'ArrowLeft' && t.previousElementSibling) t.previousElementSibling.focus(); if (e.key === 'ArrowRight' && t.nextElementSibling) t.nextElementSibling.focus(); } });
document.addEventListener('paste', e => { const t = e.target; if (t.classList && t.classList.contains('otpbox')) { const d = ((e.clipboardData || window.clipboardData).getData('text') || '').replace(/\D/g, '').slice(0, 6); if (!d) return; e.preventDefault(); const bs = $$('.otpbox'); bs.forEach((b, i) => b.value = d[i] || ''); d.length === 6 ? verifyOtp() : bs[d.length].focus(); } });
document.addEventListener('submit', e => { const f = e.target; if (!f.id) return; if (f.id === 'lf') { e.preventDefault(); doLogin(f); } else if (f.id === 'rf') { e.preventDefault(); doRegister(f); } else if (f.id === 'vf') { e.preventDefault(); verifyOtp(); } else if (f.id === 'rp') { e.preventDefault(); doReset(f); }
  else if (f.id === 'ff') { e.preventDefault(); const ph = normPhone($('#fm', f).value), acc = accounts().find(a => a.phone === ph); if (!PH.test(ph)) return showErrs(f, { fm: 'Use a PH mobile number like 09171234567.' }); if (!acc) return showErrs(f, { fm: 'No account found with that number.' }); sendOtp('reset', ph, { id: acc.id }); } });
const AUTH_A = {
  authtab: b => { AU.view = b.dataset.v; render(); }, forgot: async () => { const email = prompt('Enter your registered email address:'); if (!email) return; try { const {error} = await authDB().auth.resetPasswordForEmail(email.trim(), {redirectTo:location.origin+location.pathname}); if (error) throw error; toast('Password reset email sent.'); } catch(e) { toast(e.message); } }, terms: termsSheet, pwchange: () => toast('Password changes must use Supabase Auth.'), delacct: () => toast('Contact support to request account deletion.'),
  pwtoggle: b => { const i = document.getElementById(b.dataset.id), show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.innerHTML = ic(show ? 'eyeoff' : 'eye', 20); b.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); },
  otpback: () => { AU.view = AU.otp && AU.otp.purpose === 'register' ? 'register' : 'forgot'; render(); },
  otpresend: () => { const o = AU.otp; if (!o || o.resends >= 3 || Date.now() - o.sentAt < 30000) return; o.resends++; o.code = newCode(); o.exp = Date.now() + 300000; o.sentAt = Date.now(); o.tries = 0; const d = $('#democode'); d && (d.textContent = o.code); $$('.otpbox').forEach(b => b.value = ''); $('.otpbox').focus(); $('#oe').textContent = ''; toast('A new code was sent.'); },
  wnext: () => { if (AU.slide < SLIDES.length - 1) { AU.slide++; render(); } else A.wskip(); }, wskip: () => enterApp(AU.pending, false, true),
  demologin: () => enterApp(DEMO, false, false)
};

/* ---------- catering ---------- */
window.addEventListener('focus',()=>{ if(S.user.in)refreshCateringRequests().catch(console.error); });
const CATER_STORE_IDS = {
  kentkaye: '0923513b-a424-4af3-a950-ee9f7678228a',
  conchita: 'a0a8e4f5-299e-403c-99b4-a8a780a0f88a'
};
const CATER_LOCAL_IDS = Object.fromEntries(Object.entries(CATER_STORE_IDS).map(([k,v])=>[v,k]));
function fromCateringRow(x) {
  return { id:x.id,kind:'catering',rid:CATER_LOCAL_IDS[x.store_id]||'kentkaye',
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
  const remote=(data||[]).map(fromCateringRow);
  S.cater=remote;save();
  if(/^\/(orders|catering)/.test(curPath()))render();
}
const CSTAT = { sent: ['Sent', 'n'], confirmed: ['Confirmed', 'open'], quoted: ['Quoted', 'n'], completed: ['Completed', 'open'], cancelled: ['Cancelled', 'closed'] };
const EVENTS = ['Birthday', 'Wedding', 'Company event', 'Fiesta', 'Other'], PKGS = ['Tray meals', 'Lechon and bulalo set', 'Full buffet'];
const todayPH = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
const contactBtns = r => `<div class="contact">${[['call', 'phone', 'Call'], ['sms', 'send', 'Text'], ['msgr', 'chat', 'Messenger'], ['copy', 'copy', 'Copy number']].map(([k, i, l]) => `<button class="cbtn" data-a="contact" data-k="${k}" data-id="${r.id}">${ic(i, 20)}<span>${l}</span></button>`).join('')}</div>${r.placeholder ? '<p class="sm mu" style="margin-top:10px"><span class="demo">PLACEHOLDER</span> Phone number not set yet. Add the real number in <code>js/data.js</code>.</p>' : `<p class="sm mu" style="margin-top:10px">${esc(r.phone)}</p>`}`;
const cateringCard = r => `<div class="card" style="cursor:default">${photo(r.cateringInfo.cover, r.name + ' catering trays')}<div class="bd" style="padding:16px 20px 20px;gap:10px"><div class="row sp"><h3 style="font-size:21px">${esc(r.name)}</h3><span class="status open">Catering</span></div><p class="mu">Good for 10 / 20 / 50 guests · <b style="color:var(--ink)">${esc(r.cateringInfo.from)}</b> <span class="demo">SAMPLE</span></p><div class="chips">${r.cateringInfo.pkgs.map(x => `<span class="chip" style="min-height:34px">${x}</span>`).join('')}</div><button class="btn p blk" data-a="cater" data-id="${r.id}">Request catering</button></div></div>`;
const cateringSection = r => `<div class="sec" id="s-catering"><div class="sec-h" style="margin-bottom:10px"><h2>Catering</h2><span class="gl lab2">Events</span></div>${cateringCard(r)}</div>`;
const staySection = r => `<div class="sec" id="s-stay"><div class="sec-h" style="margin-bottom:10px"><h2>Stay and Events</h2></div><div class="panel">${r.stay.map(t => `<div class="row sp" style="padding:12px 0;border-bottom:1px solid var(--ln)"><div><b>${t}</b><p class="sm mu">${t === 'Rooms' ? 'Overnight stay by the lake' : t === 'Day Pass' ? 'Enjoy the resort for the day' : 'Weddings, reunions and meetings'}</p></div><button class="btn p sm" data-a="inquire" data-id="${r.id}" data-t="${t}">Book</button></div>`).join('')}<p class="sm mu" style="margin:10px 0 8px">Questions? Contact the resort:</p>${contactBtns(r)}</div></div>`;
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
  <button class="btn p blk">Send request</button><p class="sm mu" style="margin-top:8px"><span class="demo">DEMO</span> Requests are securely submitted to Papalita via Supabase.</p></form></section>` }; };
V.cateringSent = id => { const q = (S.cater || []).find(x => x.id === id); if (!q) return V.notFound();
  return { html: `<section class="view" style="max-width:600px;margin:0 auto;text-align:center"><div class="empty" style="padding-bottom:10px"><div class="big" style="background:var(--or);color:#fff;width:96px;height:96px">${ic('check', 48)}</div><h1 style="font-size:30px">Request sent</h1><p style="margin-top:8px">Reference <b style="color:var(--ink)">${q.id}</b></p><p>${esc(R(q.rid).name)} will confirm by phone or message.</p></div>
  <div class="panel sm" style="text-align:left">${[['Event', q.type], ['Date', q.date + (q.time ? ' · ' + q.time : '')], ['Guests', q.guests], ['Package', q.pkg], ['Venue', (q.venue ? q.venue + ', ' : '') + q.brgy + ', Alegria']].filter(x => x[1]).map(([a, b]) => `<div class="row sp" style="padding:5px 0"><span class="mu">${a}</span><b style="text-align:right">${esc(b)}</b></div>`).join('')}</div>
  <div class="row" style="margin-top:16px"><button class="btn s grow" data-a="home">Back home</button><button class="btn p grow" data-a="go" data-id="/orders?t=catering">My requests</button></div></section>` }; };
function cateringList() { const l = myCater(); if (!l.length) return emptyState('box', 'No catering requests', 'Plan a gathering and send your first request.', 'Request catering', 'newcater');
  return `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,360px),1fr))">${l.map(q => { const [lb, cl] = CSTAT[q.status] || CSTAT.sent;
    return `<div class="panel" style="margin:0"><div class="row sp"><h3>${esc(R(q.rid).name)}</h3><span class="status ${cl}">${lb}</span></div><p class="mu sm">${q.id} · ${q.kind === 'inquiry' ? 'Resort inquiry · ' : ''}${esc(q.type)}${q.date ? ' · ' + q.date : ''}${q.guests ? ' · ' + q.guests + ' guests' : ''}</p>${q.pkg ? `<p class="sm" style="margin-top:4px">${esc(q.pkg)}</p>` : ''}
    <div class="row" style="margin-top:12px"><button class="btn s sm grow" data-a="contact" data-k="call" data-id="${q.rid}">${ic('phone', 16)}Call store</button></div></div>`; }).join('')}</div>`; }
function inquireSheet(rid, type) { const r = R(rid);
  const el = openSheet(`<form class="pd" style="padding-top:34px" novalidate><h2 style="margin-bottom:4px">${esc(r.name)}</h2><p class="mu sm" style="margin-bottom:14px">Send an inquiry. The resort will reply by phone or message.</p><div class="field"><label for="qt">I am asking about</label><select class="in" id="qt">${r.stay.map(t => `<option ${t === type ? 'selected' : ''}>${t}</option>`).join('')}</select></div><div class="two"><div class="field"><label for="qn">Name</label><input class="in" id="qn" value="${esc(S.user.name)}"><p class="err" data-e="qn"></p></div><div class="field"><label for="qp">Mobile number</label><input class="in" id="qp" inputmode="tel" value="${esc(S.user.phone || '')}"><p class="err" data-e="qp"></p></div></div><div class="two"><div class="field"><label for="qd">Date</label><input class="in" id="qd" type="date" min="${todayPH()}"><p class="err" data-e="qd"></p></div><div class="field"><label for="qg">Guests</label><input class="in" id="qg" type="number" min="1" max="500"><p class="err" data-e="qg"></p></div></div><div class="field"><label for="qx">Notes</label><textarea class="in" id="qx" maxlength="300"></textarea></div><button class="btn p blk">Send inquiry</button></form>`, { label: 'Resort inquiry' });
  $('form', el).onsubmit = e => { e.preventDefault(); const v = i => $('#' + i, el).value.trim(), er = {}; if (v('qn').length < 2) er.qn = 'Enter your name.'; if (!PH.test(v('qp').replace(/\s/g, ''))) er.qp = 'Use a PH mobile number like 09171234567.'; if (!v('qd')) er.qd = 'Choose a date.'; const g = +v('qg'); if (!(g >= 1 && g <= 500)) er.qg = 'Enter 1 – 500 guests.';
    $$('[data-e]', el).forEach(x => x.textContent = ''); const k = Object.keys(er); if (k.length) { k.forEach(x => $(`[data-e=${x}]`, el).textContent = er[x]); return $('#' + k[0], el).focus(); }
    const q = { id: 'CT-' + Math.floor(100000 + Math.random() * 900000), kind: 'inquiry', rid, type: v('qt'), name: v('qn'), phone: v('qp'), date: v('qd'), guests: g, notes: v('qx'), status: 'sent', createdAt: Date.now(), uid: S.user.id }; (S.cater = S.cater || []).unshift(q);
    notify('order', `Inquiry sent · ${q.id}`, `${r.name} will reply about ${q.type}.`); save(); closeSheet(); toast('Inquiry sent.'); OT = 'catering'; go('/orders?t=catering'); }; }

/* ---------- actions ---------- */
const go = p => nav(p), browse = () => nav('/discover?tab=dishes&reset=1');
function toggleFav(k, id) { const a = S.fav[k], i = a.indexOf(id); i >= 0 ? a.splice(i, 1) : a.push(id); save(); const on = i < 0;
  $$(`[data-a=fav][data-k=${k}][data-id="${id}"]`).forEach(b => { b.setAttribute('aria-pressed', on); $('svg', b).classList.toggle('on', on); }); toast(on ? 'Saved to favorites.' : 'Removed from favorites.'); if (/favorites/.test(location.hash)) render(); }
function setPromo(code) { const p = window.PROMOS.find(x => x.code === code); if (!p) return toast('That code is not valid.'); S.promo = code; save();
  const c = calc(); toast(!S.cart.lines.length ? `${code} saved. It applies when you check out.` : c.perr ? c.perr : `${code} applied. You save ${peso(c.disc)}.`); if (/cart|checkout|promos/.test(location.hash)) render(); }
const syncLoc = a => { const n = (a && a.city || '').split(',')[0].trim(), b = window.BRGYS.find(x => x.n === n); if (b) { S.loc.brgy = b.n; S.loc.label = b.n + ', Alegria'; save(); } };
function locSheet() { const el = openSheet(`<div class="pd" style="padding-top:34px"><h2 style="margin-bottom:4px">Your barangay</h2><p class="mu sm" style="margin-bottom:12px">Delivering within ${esc(C.municipality)}. Fees and times are sample values.</p>${window.BRGYS.map(b => `<label class="opt"><input type="radio" name="lc" value="${esc(b.n)}" ${S.loc.brgy === b.n ? 'checked' : ''}><span class="grow"><b>${esc(b.n)}</b></span><span class="mu sm">${peso(b.fee)} · +${b.eta} min</span></label>`).join('')}<p class="sm mu" style="margin-top:8px">Not in this list? We do not deliver there yet.</p></div>`, { label: 'Choose barangay' });
  el.addEventListener('change', e => { if (e.target.name === 'lc') { S.loc.brgy = e.target.value; S.loc.label = e.target.value + ', Alegria'; save(); closeSheet(); toast(`Delivering to ${e.target.value}.`); updateChrome(); render(); } }); }
function moreSheet() { openSheet(`<div class="pd" style="padding-top:34px"><h2 style="margin-bottom:6px">More</h2>${[['grid', 'All categories', '/categories'], ['heart', 'Favorites', '/favorites'], ['bell', 'Notifications', '/notifications'], ['pin', 'Saved addresses', '/addresses'], ['help', 'Support', '/support'], ['user', 'Profile', '/profile']].map(([i, t, p]) => `<button class="li" data-a="go" data-id="${p}"><span class="ic">${ic(i)}</span><b class="grow">${t}</b>${ic('chev', 18, 'mu')}</button>`).join('')}</div>`, { label: 'More' }); }
const A = {
  tip: b => { CK.tip = +b.dataset.v; render(); }, rate: b => rateSheet(b.dataset.id),
  receipt: b => { const o = ORD(b.dataset.id); openSheet(`<div class="pd" style="padding-top:34px">${receiptHTML(o, false)}<button class="btn p blk" style="margin-top:14px" data-a="printrcpt" data-id="${o.id}">Save / print receipt</button></div>`, { label: 'Receipt' }); }, printrcpt: b => printReceipt(b.dataset.id),
  mode: () => { try { localStorage.setItem(MODE, isLive() ? 'demo' : 'live'); } catch (e) {} toast(isLive() ? 'Live mode: the store and rider update your next orders.' : 'Demo mode: orders update automatically.'); render(); },
  cater: b => go('/catering/request?rid=' + b.dataset.id), newcater: () => go('/catering/request'), inquire: b => inquireSheet(b.dataset.id, b.dataset.t),
  cxcater: b => confirmDlg('Cancel this catering request?', 'Cancel request', true).then(ok => { if (ok) { const q = S.cater.find(x => x.id === b.dataset.id); q.status = 'cancelled'; q.upd = Date.now(); save(); toast('Request cancelled.'); render(); } }),
  contact: b => { const r = R(b.dataset.id), k = b.dataset.k; if (r.placeholder) return toast('This is a placeholder number. Add the real one in js/data.js.');
    if (k === 'call') location.href = 'tel:' + r.phone; else if (k === 'sms') location.href = 'sms:' + r.phone; else if (k === 'msgr') r.messenger ? window.open(r.messenger, '_blank', 'noopener') : toast('Messenger link not set yet.'); else { try { navigator.clipboard.writeText(r.phone); toast('Number copied.'); } catch (e) { toast('Copy is not available here.'); } } },
  place: () => placeOrder(), addrpick: addrPick, paypick: payPick,
  pcat: b => { PD = b.dataset.id; fillPopular(); },
  hcat: b => { if (b.dataset.id === 'catering') return go('/catering'); HC = HC === b.dataset.id ? 'all' : b.dataset.id; fillCurated(); },
  share: b => { const r = R(b.dataset.id), u = location.href; if (navigator.share) navigator.share({ title: r.name + ' on Papalita', url: u }).catch(() => {}); else { try { navigator.clipboard.writeText(u); toast('Link copied.'); } catch (e) { toast('Sharing is not available here.'); } } },
  close: closeSheet, reload: () => render(), home: () => go('/'), browse, back: () => history.length > 1 ? history.back() : go('/'), go: (b) => { closeSheet(); go(b.dataset.id); },
  fav: b => toggleFav(b.dataset.k, b.dataset.id), item: b => openItem(b.dataset.id), rest: b => go('/restaurant/' + b.dataset.id), restmenu: b => go('/restaurant/' + b.dataset.id),
  quick: b => { const x = ITEM(b.dataset.id); if ((x.item.opts||[]).length) { openItem(x.item.id); return; } const host = b.closest('.card,.mi'), src = (host && $('.ph', host)) || b; addToCart(x.item, x.rest, defSel(x.item), 1, '', null, { rect: src.getBoundingClientRect(), img: x.item.img }); tickBtn(b); },
  loc: locSheet, askloc: () => { closeSheet(); askLocation(); },
  qa: b => { const id = b.dataset.id; if (id === 'rests') go('/discover?tab=rests&reset=1' + (HC !== 'all' ? '&cat=' + HC : '')); else if (id === 'order') go('/discover?tab=dishes&reset=1'); else if (id === 'track') { const o = myOrders().find(isCurrent); o ? go('/track/' + o.id) : (toast('No active orders to track.'), go('/orders')); } else if (id === 'promo') go('/promos'); else moreSheet(); },
  filters: () => go('/discover?f=1&tab=dishes'), catall: () => go('/categories'), cat: b => b.dataset.id === 'catering' ? go('/catering') : go('/discover?tab=dishes&reset=1&cat=' + b.dataset.id),
  sugg: b => { const t = b.dataset.t, id = b.dataset.id; if (t === 'cat') go('/discover?tab=dishes&reset=1&cat=' + id); else if (t === 'rest') go('/restaurant/' + id); else if (t === 'item') { $('#sg').innerHTML = ''; openItem(id); } else { S.recent = [id, ...(S.recent || []).filter(x => x !== id)].slice(0, 6); save(); go('/discover?tab=dishes&reset=1&q=' + encodeURIComponent(id)); } },
  clearq: () => { const q = $('#q'); q.value = ''; $('#sg').innerHTML = ''; $('[data-a=clearq]').hidden = true; q.focus(); },
  dclear: () => { F.q = ''; $('#dq').value = ''; $('[data-a=dclear]').hidden = true; fillResults(); $('#dq').focus(); },
  ftoggle: () => { F.open = !F.open; fillDiscover(); }, ftab: b => { F.tab = b.dataset.v; render(); },
  flt: b => { const k = b.dataset.k, v = b.dataset.v; if (k === 'cat' && v === 'catering') return go('/catering'); F[k] = k === 'cat' ? v : +v; fillDiscover(); }, fpromo: () => { F.promo = !F.promo; fillDiscover(); },
  fclear: () => { F = { ...F, q: '', cat: 'all', price: 0, rating: 0, eta: 0, promo: false }; render(); },
  jump: b => { $$('.chips.solid .chip').forEach(x => x.classList.toggle('on', x === b)); const e = document.getElementById(b.dataset.id); e && e.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  usepromo: b => setPromo(b.dataset.id), rmpromo: () => { S.promo = null; save(); render(); },
  applypromo: () => { const v = $('#pc').value.trim().toUpperCase(); if (!v) return ($('#pcerr').textContent = 'Enter a promo code.'); if (!window.PROMOS.find(p => p.code === v && p.active !== false)) return ($('#pcerr').textContent = 'That code is not valid.'); setPromo(v); },
  copy: b => { try { navigator.clipboard.writeText(b.dataset.id); toast(`Copied ${b.dataset.id}.`); } catch (e) { toast('Copy is not available here.'); } },
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

  cancel: b => confirmDlg('Cancel this order? This cannot be undone.', 'Cancel order', true).then(ok => { if (!ok) return; const o = ORD(b.dataset.id); o.status = 'cancelled'; o.demo = false; o.stage = Math.max(0, stageOf({ ...o, status: 'active' })); o.upd = Date.now(); if (o.pay.status === 'demo_authorized') o.pay.status = 'refund_pending'; notify('order', `Order cancelled · ${o.id}`, o.pay.method === 'cod' ? 'No payment was taken.' : 'Your demo payment will be refunded.'); save(); toast('Order cancelled.'); render(); }),
  nbv: b => { NB = b.dataset.v; render(); },
  addrform: b => addrForm(b.dataset.id), addrdef: b => { S.addrs.forEach(a => a.def = a.id === b.dataset.id); save(); render(); },
  addrdel: b => confirmDlg('Delete this address?', 'Delete', true).then(ok => { if (ok) { S.addrs = S.addrs.filter(a => a.id !== b.dataset.id); if (S.addrs.length && !S.addrs.some(a => a.def)) S.addrs[0].def = true; save(); toast('Address deleted.'); render(); } }),
  payform: payForm, paydel: b => confirmDlg('Remove this payment method?', 'Remove', true).then(ok => { if (ok) { S.pay = S.pay.filter(p => p.id !== b.dataset.id); save(); render(); } }),
  ftb: b => { FT = b.dataset.v; render(); }, ntab: b => { NT = b.dataset.v; render(); }, readall: () => { myNotes().forEach(n => n.read = true); save(); updateChrome(); render(); },
  nopen: b => { const n = S.notes.find(x => x.id === b.dataset.id); n.read = true; save(); updateChrome(); const m = n.t.match(/FD-\d+/); if (n.type === 'order' && m && ORD(m[0])) go('/track/' + m[0]); else if (n.type === 'promo') go('/promos'); else render(); },
  logout: () => confirmDlg('Log out of Papalita?', 'Log out').then(async ok => { if (ok) { await authDB().auth.signOut(); S.user.in = false; clearSession(); save(); AU.view = 'login'; render(); } }),
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
    im.onload = () => { const c = document.createElement('canvas'), s = Math.min(1, 256 / Math.max(im.width, im.height)); c.width = im.width * s; c.height = im.height * s; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); S.user.photo = c.toDataURL('image/jpeg', .85); save(); URL.revokeObjectURL(u); render(); toast('Photo updated.'); }; im.src = u; } });
document.addEventListener('click', e => { if (!e.target.closest('#hs') && $('#sg')) $('#sg').innerHTML = ''; });
document.addEventListener('submit', async e => { e.preventDefault(); const f = e.target, v = id => ($('#' + id, f) || {}).value?.trim() || '', er = {}, show = () => { $$('.in', f).forEach(i => i.classList.remove('bad')); $$('[data-e]', f).forEach(x => x.textContent = ''); const k = Object.keys(er); k.forEach(x => { $('#' + x, f).classList.add('bad'); $(`[data-e=${x}]`, f).textContent = er[x]; }); if (k.length) $('#' + k[0], f).focus(); return k.length; };
  if (f.id === 'pf') { if (v('pn').length < 2) er.pn = 'Enter your name.'; if (!/^\S+@\S+\.\S+$/.test(v('pe'))) er.pe = 'Enter a valid email address.'; if (v('pp') && !PH.test(v('pp').replace(/\s/g, ''))) er.pp = 'Use a PH mobile number like 09171234567.'; if (show()) return; Object.assign(S.user, { name: v('pn'), email: v('pe'), phone: v('pp') }); if (S.user.id !== 'demo') { const ac = accounts(), x = ac.find(z => z.id === S.user.id); if (x) { Object.assign(x, { name: v('pn'), email: v('pe'), phone: normPhone(v('pp')) || x.phone }); saveAcc(ac); } } save(); toast('Profile saved.'); go('/profile'); }
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
  if (f.id === 'sf') { if (v('sm').length < 10) er.sm = 'Tell us a bit more (at least 10 characters).'; if (show()) return; f.reset(); toast('Message recorded (demo). We will reply once support is connected.'); } });

/* ---------- boot ---------- */
document.body.insertAdjacentHTML('afterbegin', '<div id="chrome"></div><div id="app"><main id="view" tabindex="-1"></main></div><div id="toasts" role="status" aria-live="polite"></div>');
let PAPALITA_INSTALLED = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
window.addEventListener('appinstalled', () => { PAPALITA_INSTALLED = true; window.PAPALITA_INSTALL_PROMPT = null; if (S.user.in && curPath() === '/') render(); });
window.addEventListener('papalita-install-ready', () => { if (S.user.in && curPath() === '/') render(); });
const recentHTML = () => (S.recent || []).length ? `<div class="sugg"><div class="row sp" style="padding:8px 10px"><b class="sm">Recent searches</b><button class="link gl" data-a="clrrecent" style="padding:4px">Clear</button></div>${S.recent.map(q => `<button data-a="sugg" data-t="q" data-id="${esc(q)}">${ic('clock', 18)}<span>${esc(q)}</span></button>`).join('')}</div>` : '';
document.addEventListener('focusin', e => { if (e.target.id === 'q' && !e.target.value && $('#sg')) $('#sg').innerHTML = recentHTML(); });
document.body.insertAdjacentHTML('beforeend', '<div id="offline" role="status" hidden>You are offline. Some features may not work.</div>');
const netUi = () => { const o = $('#offline'); if (o) o.hidden = navigator.onLine !== false; }; window.addEventListener('online', netUi); window.addEventListener('offline', () => { const o = $('#offline'); o && (o.hidden = false); });
Object.assign(A, AUTH_A);
// Supabase Auth is the source of truth; do not restore old local demo sessions.
S.user.in = false;
clearSession();
try {
  const {data} = await authDB().auth.getSession();
  if (data?.session?.user) useAuthUser(data.session.user);
} catch (err) { console.error('[Papalita] Auth restore failed:',err); }
chrome(); window.addEventListener('hashchange', render); render();
const bootstrapSkeleton = document.getElementById('papalita-bootstrap-skeleton');
if (bootstrapSkeleton) bootstrapSkeleton.remove();
const hideSplash = () => { const sp = $('#splash'); if (!sp) return; sp.classList.add('out'); setTimeout(() => sp.remove(), 600); }; setTimeout(hideSplash, Math.max(400, 1800 - (window.performance && performance.now ? performance.now() : 0)));
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
