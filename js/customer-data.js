/* Customer reference data only. Stores, menus, promos and fees load from Supabase. */
window.RESTAURANTS=[];
window.CATEGORIES=[];
window.PROMOS=[];
window.BRGYS=['Alipao','Anahaw','Budlingin','Camp Eduard','Ferlda','Gamuton','Julio Ouano','Ombong','Poblacion','Pongtud','San Juan','San Pedro'].map(n=>({n}));
window.photoUrl=(value)=>{
  if(typeof value!=='string'||!/^https?:\/\//i.test(value.trim()))return '';
  try{const u=new URL(value,location.href);return u.protocol==='https:'||u.protocol==='http:'?u.href:'';}catch{return '';}
};
