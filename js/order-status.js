/* Presentation shared by customer tracking, the inbox and phone alerts. */
(root => {
  const base = {
    pending: ['Order received', 'Waiting for the store to accept your order.', 'clock'],
    confirmed: ['Order confirmed', 'The store has accepted your order.', 'check'],
    preparing: ['Preparing your order', 'The store is preparing your food.', 'fork'],
    ready: ['Order ready', 'The store has finished preparing your order.', 'store'],
    out_for_delivery: ['Out for delivery', 'Your order is on its way.', 'bike'],
    completed: ['Order completed', 'Your order has been completed.', 'check'],
    cancelled: ['Order cancelled', 'The store will no longer fulfill this order.', 'x'],
    refunded: ['Refunded', 'A refund was recorded for this order.', 'check']
  };
  const sequence = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed'];

  function mode(order) {
    const value = String(order?.fulfillment_type || order?.fulfillment || '').trim().toLowerCase();
    if (value === 'pickup' || value === 'delivery') return value;
    return /^pickup at store$/i.test(String(order?.delivery_address || order?.addr || '').trim()) ? 'pickup' : '';
  }

  function status(order) {
    if (order.status === 'out_for_delivery' && mode(order) === 'pickup') return 'ready';
    return order.status;
  }

  function copy(order) {
    const type = mode(order);
    const key = status(order);
    if (type === 'pickup' && key === 'ready') return ['Ready for pickup', 'You can collect your order at the store.', 'store'];
    if (type === 'pickup' && key === 'completed') return ['Picked up', 'The store has marked your pickup complete.', 'check'];
    if (type === 'delivery' && key === 'ready') return ['Ready for rider', 'Your order is ready for rider pickup.', 'store'];
    if (type === 'delivery' && key === 'completed') return ['Delivered', 'The store has marked your delivery complete.', 'check'];
    if (!type && key === 'out_for_delivery') return ['Order update', 'Open tracking for the latest status.', 'orders'];
    return Object.hasOwn(base, key) ? base[key] : ['Order update', 'Open tracking for the latest status.', 'orders'];
  }

  function timeline(order) {
    return sequence.filter(key => key !== 'out_for_delivery' || mode(order) === 'delivery')
      .map(key => [key, ...copy({ fulfillment: mode(order), status: key })]);
  }

  function message(title, body, order = {}) {
    const text = title + ' ' + body;
    if (/out.for.delivery|on (?:its|the) way|rider is on the way/i.test(text) && mode(order) !== 'delivery') {
      return mode(order) === 'pickup'
        ? copy({ fulfillment: 'pickup', status: order.status || 'ready' }).slice(0, 2)
        : ['Order update', 'Open tracking for the latest status.'];
    }
    if (mode(order) === 'pickup' && /(?:order is ready|order ready|ready for rider|ready for handoff)/i.test(title)) {
      return copy({ fulfillment: 'pickup', status: 'ready' }).slice(0, 2);
    }
    if (mode(order) === 'pickup' && /^(?:order completed|delivered)$/i.test(title.trim())) {
      return copy({ fulfillment: 'pickup', status: 'completed' }).slice(0, 2);
    }
    return [title, body];
  }

  root.PapalitaOrderStatus = { mode, status, copy, timeline, message };
})(typeof window !== 'undefined' ? window : self);
