(() => {
  'use strict';

  const currency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
  const calendar = new Intl.DateTimeFormat('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'Asia/Manila'
  });
  const displayDate = value => value ? calendar.format(new Date(value)) : '—';
  const paymentStatus = { pending: 'Pending review', confirmed: 'Confirmed', rejected: 'Needs correction' };

  function card(parent, title, detail) {
    const section = document.createElement('section');
    section.className = 'ps-card';
    const heading = document.createElement('h2');
    heading.textContent = title;
    section.append(heading);
    if (detail) line(section, detail);
    parent.append(section);
    return section;
  }

  function line(parent, value) {
    const paragraph = document.createElement('p');
    paragraph.textContent = value;
    parent.append(paragraph);
    return paragraph;
  }

  function button(parent, label, type = 'button') {
    const control = document.createElement('button');
    control.className = 'ps-button';
    control.type = type;
    control.textContent = label;
    parent.append(control);
    return control;
  }

  function field(parent, label, tag, attributes) {
    const wrapper = document.createElement('label');
    wrapper.className = 'ps-field';
    wrapper.append(label);
    const input = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) input.setAttribute(key, value);
    wrapper.append(input);
    parent.append(wrapper);
    return input;
  }

  function periodLabel(record, now) {
    if (Date.parse(record.trial_ends_at) > now) return 'Free trial';
    if (Date.parse(record.paid_through) > now) return 'Active subscription';
    return record.trial_ends_at || record.paid_through ? 'Expired' : 'Not subscribed';
  }

  async function rpc(db, name, args) {
    const { data, error } = await db.rpc(name, args);
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883') {
        throw new Error('Subscriptions are being set up. Please try again later.');
      }
      throw error;
    }
    return data;
  }

  function submit(control, feedback, run) {
    if (control.disabled) return;
    control.disabled = true;
    feedback.textContent = '';
    return run().catch(error => {
      feedback.textContent = error.message || 'Unable to save. Please try again.';
    }).finally(() => {
      control.disabled = false;
    });
  }

  // The merchant portal redraws on order refreshes. Keep this element and its
  // form state when the same store's subscription page is redrawn.
  function merchant(target, db, storeId, toast) {
    const connected = () => target.isConnected;
    async function load() {
      const data = await rpc(db, 'papalita_billing_store', { p_store: storeId });
      if (!connected()) return;
      target.replaceChildren();
      const toolbar = document.createElement('div');
      toolbar.className = 'ps-toolbar';
      target.append(toolbar);
      button(toolbar, 'Refresh status').onclick = refresh;
      const now = Date.parse(data.now);
      const current = card(target, periodLabel(data, now));
      if (data.trial_ends_at) line(current, 'Free trial ends ' + displayDate(data.trial_ends_at));
      if (data.paid_through) line(current, 'Paid through ' + displayDate(data.paid_through));
      if (!data.trial_ends_at && !data.paid_through) {
        line(current, 'Try the Papalita Merchant Portal free for 7 days.');
        const trial = button(current, 'Start 7-day free trial');
        const feedback = line(current, '');
        feedback.setAttribute('role', 'status');
        trial.onclick = () => submit(trial, feedback, async () => {
          await rpc(db, 'papalita_billing_start_trial', { p_store: storeId });
          if (connected()) { toast('Free trial started.'); await refresh(); }
        });
      }

      const plan = card(target, 'Monthly subscription');
      if (data.monthly_fee == null) {
        line(plan, 'Papalita will post your monthly rate and payment instructions here.');
      } else {
        const amount = line(plan, currency.format(data.monthly_fee) + ' / month');
        amount.className = 'ps-amount';
        if (data.payment_instructions) line(plan, data.payment_instructions);
      }
      const pending = data.payments.some(payment => payment.status === 'pending');
      if (pending) {
        line(plan, 'Your payment is waiting for Papalita to confirm it.');
      } else if (data.monthly_fee != null && data.payment_instructions) {
        const form = document.createElement('form');
        plan.append(form);
        line(form, 'After paying the amount above, enter the reference from your receipt.');
        const reference = field(form, 'Payment reference', 'input', {
          required: '', minlength: '3', maxlength: '80', autocomplete: 'off'
        });
        const save = button(form, data.paid_through ? 'Submit renewal payment' : 'Submit payment', 'submit');
        const feedback = line(form, '');
        feedback.setAttribute('role', 'status');
        form.onsubmit = event => {
          event.preventDefault();
          return submit(save, feedback, async () => {
            await rpc(db, 'papalita_billing_submit', {
              p_store: storeId, p_amount: data.monthly_fee, p_reference: reference.value.trim()
            });
            if (connected()) { toast('Payment submitted for review.'); await refresh(); }
          });
        };
      }

      if (data.payments.length) {
        const history = card(target, 'Recent payments');
        for (const payment of data.payments) {
          const row = document.createElement('div');
          row.className = 'ps-history-row';
          line(row, currency.format(payment.amount) + ' · ' + paymentStatus[payment.status]);
          line(row, payment.reference + ' · ' + displayDate(payment.submitted_at));
          if (payment.period_ends_at) line(row, 'Covered through ' + displayDate(payment.period_ends_at));
          if (payment.review_note) line(row, payment.review_note);
          history.append(row);
        }
      }
    }

    async function refresh() {
      target.textContent = 'Loading your subscription…';
      try {
        await load();
      } catch (error) {
        if (!connected()) return;
        target.replaceChildren();
        const issue = card(target, 'Unable to load your subscription', error.message);
        button(issue, 'Try again').onclick = refresh;
      }
    }
    void refresh();
  }

  function admin(target, db, toast) {
    const pageSize = 20;
    let offset = 0;

    async function load() {
      const stores = await rpc(db, 'papalita_billing_admin_stores', { p_offset: offset });
      if (!target.isConnected) return;
      if (!stores.length && offset > 0) {
        offset -= pageSize;
        return load();
      }
      target.replaceChildren();
      if (!stores.length) {
        card(target, 'No approved stores yet', 'Approved stores will appear here so you can set their monthly subscription rates.');
        return;
      }
      const navigation = document.createElement('div');
      navigation.className = 'ps-toolbar';
      target.append(navigation);
      button(navigation, 'Refresh').onclick = refresh;
      if (offset > 0) button(navigation, 'Previous').onclick = () => { offset -= pageSize; void refresh(); };
      if (stores.length > pageSize) button(navigation, 'Next').onclick = () => { offset += pageSize; void refresh(); };

      for (const store of stores.slice(0, pageSize)) {
        const section = card(target, store.store_name, periodLabel(store, Date.parse(store.checked_at)));
        if (store.trial_ends_at) line(section, 'Free trial ends ' + displayDate(store.trial_ends_at));
        if (store.paid_through) line(section, 'Paid through ' + displayDate(store.paid_through));

        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = store.monthly_fee == null ? 'Set monthly rate' : 'Edit monthly rate';
        details.append(summary);
        section.append(details);
        const form = document.createElement('form');
        details.append(form);
        const fee = field(form, 'Monthly rate (₱)', 'input', {
          type: 'number', min: '0.01', max: '99999999.99', step: '0.01', required: ''
        });
        fee.value = store.monthly_fee ?? '';
        const instructions = field(form, 'Payment instructions shown to the store', 'textarea', {
          maxlength: '600', rows: '3', required: ''
        });
        instructions.value = store.payment_instructions ?? '';
        const save = button(form, 'Save monthly rate', 'submit');
        const feedback = line(form, '');
        feedback.setAttribute('role', 'status');
        form.onsubmit = event => {
          event.preventDefault();
          return submit(save, feedback, async () => {
            await rpc(db, 'papalita_billing_admin_offer', {
              p_store: store.store_id, p_fee: fee.value, p_instructions: instructions.value.trim()
            });
            if (target.isConnected) { feedback.textContent = 'Monthly rate saved.'; toast('Monthly rate saved.'); }
          });
        };

        if (!store.payment_id) continue;
        const review = document.createElement('form');
        review.className = 'ps-history-row';
        section.append(review);
        line(review, 'Pending payment · ' + currency.format(store.payment_amount));
        line(review, 'Reference ' + store.payment_reference + ' · ' + displayDate(store.payment_submitted_at));
        const decision = field(review, 'Decision', 'select', { required: '' });
        for (const [value, label] of [
          ['', 'Choose a decision'], ['confirm', 'Confirm received payment'], ['reject', 'Request correction']
        ]) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = label;
          decision.append(option);
        }
        const note = field(review, 'Reason for correction', 'input', { maxlength: '240' });
        note.parentElement.hidden = true;
        decision.onchange = () => {
          const correction = decision.value === 'reject';
          note.parentElement.hidden = !correction;
          note.required = correction;
        };
        const apply = button(review, 'Save decision', 'submit');
        const result = line(review, '');
        result.setAttribute('role', 'status');
        review.onsubmit = event => {
          event.preventDefault();
          if (!['confirm', 'reject'].includes(decision.value)) return;
          const confirmPayment = decision.value === 'confirm';
          if (confirmPayment && !window.confirm('Have you verified that this payment was received?')) return;
          return submit(apply, result, async () => {
            await rpc(db, 'papalita_billing_admin_review', {
              p_payment: store.payment_id, p_confirm: confirmPayment, p_note: note.value.trim()
            });
            if (target.isConnected) { toast(confirmPayment ? 'Payment confirmed.' : 'Correction requested.'); await refresh(); }
          });
        };
      }
    }

    async function refresh() {
      target.textContent = 'Loading store subscriptions…';
      try {
        await load();
      } catch (error) {
        if (!target.isConnected) return;
        target.replaceChildren();
        const issue = card(target, 'Unable to load subscriptions', error.message);
        button(issue, 'Try again').onclick = refresh;
      }
    }
    return refresh();
  }

  function reminderInbox(db, storeId, badge) {
    let cached = null;
    let checkedAt = 0;
    let pending;
    let readExpiry;

    function showBadge() {
      const element = badge();
      if (element) element.hidden = !cached?.unread || cached.expires_at === readExpiry;
    }

    function load(force = false) {
      if (!pending && (force || Date.now() - checkedAt >= 5 * 60 * 1000)) {
        pending = rpc(db, 'papalita_billing_renewal_reminder', { p_store: storeId })
          .then(data => { cached = data; })
          .finally(() => {
            checkedAt = Date.now();
            pending = null;
            showBadge();
          });
      }
      return pending;
    }

    function updateBadge() {
      showBadge();
      load()?.catch(() => {});
    }

    async function open(target, onRenew) {
      target.textContent = 'Loading subscription reminder…';
      try {
        await load(true);
        if (!target.isConnected) return;
        target.replaceChildren();
        const reminder = cached;
        if (!reminder) {
          line(target, 'No subscription reminders.');
          return;
        }

        const expires = displayDate(reminder.expires_at);
        const remaining = Date.parse(reminder.expires_at) - Date.parse(reminder.checked_at);
        const days = Math.ceil(remaining / 86400000);
        const detail = remaining <= 0
          ? 'Your store subscription expired on ' + expires + '.'
          : 'Your store subscription expires ' +
            (days > 1 ? 'in ' + days + ' days, on ' : 'on ') + expires + '.';
        const alert = card(target, 'Subscription renewal reminder', detail);
        const actions = document.createElement('div');
        actions.className = 'ps-toolbar';
        alert.append(actions);
        button(actions, 'View subscription').onclick = onRenew;
        if (reminder.unread && readExpiry !== reminder.expires_at) {
          const mark = button(actions, 'Mark as read');
          const feedback = line(alert, '');
          feedback.setAttribute('role', 'status');
          mark.onclick = () => submit(mark, feedback, async () => {
            await rpc(db, 'papalita_billing_read_renewal_reminder', {
              p_store: storeId, p_expires_at: reminder.expires_at
            });
            readExpiry = reminder.expires_at;
            showBadge();
            mark.remove();
          });
        }
      } catch (error) {
        if (!target.isConnected) return;
        target.replaceChildren();
        line(target, error.message || 'Unable to load the reminder.');
        button(target, 'Try again').onclick = () => open(target, onRenew);
      }
    }

    return { updateBadge, open };
  }

  window.PapalitaStoreSubscriptions = { merchant, admin, reminderInbox };
})();
