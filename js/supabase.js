
/* Papalita! — Supabase connection, stores and product loader */
(() => {
  const cfg = window.FOODIE_CONFIG?.supabase;

  if (!cfg?.url || !cfg?.anonKey) {
    console.error("[Papalita] Missing Supabase configuration.");
    return;
  }

  if (!window.supabase?.createClient) {
    console.error("[Papalita] Supabase library not loaded.");
    return;
  }

  const client = window.supabase.createClient(
    cfg.url,
    cfg.anonKey
  );

  window.PAPALITA_DB = client;

  const availabilityColumns = [
    'closure_reason,orders_paused_until,orders_pause_reason',
    'closure_reason',
    ''
  ];
  let availabilityVariant = 0;

  async function approvedStores(columns) {
    while (true) {
      const variant = availabilityVariant;
      const extra = availabilityColumns[variant];
      const response = await client.from('stores').select(extra ? columns + ',' + extra : columns).eq('status','approved');
      if (!['42703','PGRST204'].includes(response.error?.code) || !extra) return response;
      availabilityVariant = Math.max(availabilityVariant, variant + 1);
    }
  }

  window.loadPapalitaStoreAvailability = () => approvedStores('id,is_open,open_time,close_time');

  window.loadPapalitaProducts = async function () {
    try {
      const {data:stores,error:storeError} = await approvedStores(
        'id,name,logo_url,cover_url,address,description,phone,business_type,open_time,close_time,is_open,catering_enabled,status'
      );

      if (storeError) throw storeError;

      const { data: products, error: productError } = await client
        .from("products")
        .select("*")
        .eq("status", "active");

      if (productError) throw productError;

      const storeList = stores || [];
      const productList = products || [];

      const result = storeList.map(store => ({
        id: store.id,
        name: store.name,
        address: store.address || "",
        description: store.description || "",
        phone: store.phone || "",
        business_type: store.business_type || "restaurant",
        open_time: store.open_time,
        close_time: store.close_time,
        is_open: store.is_open,
        closure_reason: store.closure_reason,
        orders_paused_until: store.orders_paused_until,
        orders_pause_reason: store.orders_pause_reason,
        catering_enabled: store.catering_enabled === true,

        // Store photo comes from Supabase stores.logo_url.
        logo_url: store.logo_url || "",
        cover: store.cover_url || store.logo_url || "",

        items: productList
          .filter(product =>
            String(product.store_id) === String(store.id)
          )
          .map(product => ({
            id: product.id,
            name: product.name,
            price: Number(product.price) || 0,
            desc: product.description || "",
            cat: product.category || "other",
            img: product.image_url || "",
            available: Number(product.stock) > 0,
            opts: Array.isArray(product.options) ? product.options : []
          }))
      }));

      window.PAPALITA_DB_STORES = result;

      console.log("[Papalita] Stores loaded:", result.length);
      console.log("[Papalita] Products loaded:", productList.length);

      return result;
    } catch (error) {
      console.error(
        "[Papalita] Product loading failed:",
        error.message
      );
      throw error;
    }
  };
})();
