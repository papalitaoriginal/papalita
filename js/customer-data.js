/* Customer reference data only. Stores, menus, promos and fees load from Supabase. */
window.RESTAURANTS=[];
window.CATEGORIES=[];
window.PROMOS=[];
window.BRGYS=['Alipao','Anahaw','Budlingin','Camp Eduard','Ferlda','Gamuton','Julio Ouano','Ombong','Poblacion','Pongtud','San Juan','San Pedro'].map(n=>({n}));
// Resolve the image keys already saved in the live catalogue.
const legacyPhotos = Object.freeze({
  bulalo: '1547592166-23ac45744acd',
  bulalo2: '1547592180-85f173990554',
  nilaga: '1604152135912-04a022e23696',
  sinigang: '1547592180-85f173990554',
  liempo: '1529193591184-b1d58069ecdd',
  inasal: '1598515214211-89d3c73ae83b',
  sisig: '1544025162-d76694265947',
  garlicrice: '1516684732162-798a0062be99',
  rice: '1536304993881-ff6e9eefa2a6',
  lechon: '1432139555190-58524dae6a55',
  pancit: '1585032226651-759b368d7246',
  tilapia: '1519708227418-c8fd9a32b7a2',
  icedtea: '1556679343-c7306c1976bc',
  softdrink: '1544145945-f90425340c7e',
  ramen: '1569718212165-3a8278d5f624',
  ramen2: '1557872943-16a5ac26437e',
  ramen3: '1591814468924-caf88d1232e1',
  gyoza: '1496116218417-1a781b1c416c',
  katsu: '1604908176997-125f25cc6f3d',
  crispypata: '1544025162-d76694265947',
  seafood: '1559847844-5315695dadae',
  shrimp: '1565680018434-b513d5e5fd47',
  buko: '1536935338788-846bb9981813',
  halo: '1563805042-7684c019e1cb',
  icedcoffee: '1461023058943-07fcbe16d735',
  tray: '1555244162-803834f70033',
  buffet: '1414235077428-338989a2e8c0',
  lake: '1540541338287-41700207dee6',
  resort: '1571896349842-33c89424de2d',
  drinks: '1544145945-f90425340c7e'
});
window.photoUrl = (value, width = 600) => {
  if (typeof value !== 'string') return '';
  const image = value.trim();
  if (Object.hasOwn(legacyPhotos, image)) {
    return `https://images.unsplash.com/photo-${legacyPhotos[image]}?auto=format&fit=crop&w=${width}&q=75`;
  }
  if (/^data:image\/(?:jpeg|png|webp|gif);base64,[a-z0-9+/=]+$/i.test(image)) return image;
  if (!/^(?:https?:\/\/|(?:\.\/)?images\/)/i.test(image)) return '';
  try {
    const url = new URL(image, location.href);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
};
