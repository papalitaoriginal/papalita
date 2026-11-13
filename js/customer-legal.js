/* Shared Terms and Privacy dialog. Policy text and its version live in index.html. */
(() => {
  'use strict';
  const modal = document.getElementById('papalitaLegal');
  const area = document.getElementById('legalScroll');
  const agree = document.getElementById('legalAgree');
  const status = document.getElementById('legalStatus');
  const version = modal.dataset.policyVersion;
  const storageKey = id => 'papalita.customer-terms.' + id;
  let accepted = false, reached = false, trigger = null, returnOverflow = '';

  function sync() {
    const box = document.getElementById('rt');
    if (!box) return;
    box.checked = accepted;
    const submit = box.closest('form')?.querySelector('[data-policy-submit]');
    if (submit) submit.disabled = !accepted || submit.hasAttribute('data-auth-pending');
  }

  function check() {
    if (!modal.open || !area.clientHeight || reached) return;
    if (area.scrollTop + area.clientHeight >= area.scrollHeight - 12) {
      reached = true;
      agree.disabled = false;
      status.textContent = 'You can now accept the Terms and acknowledge the Privacy Policy.';
    }
  }

  function openLegal(from = document.activeElement) {
    if (modal.open) return;
    trigger = from;
    returnOverflow = document.body.style.overflow;
    reached = false;
    agree.disabled = true;
    status.textContent = 'Scroll to the end of both policies to enable the agreement button.';
    modal.showModal();
    document.body.style.overflow = 'hidden';
    area.scrollTop = 0;
    area.focus();
    requestAnimationFrame(check);
  }

  modal.addEventListener('close', () => {
    document.body.style.overflow = returnOverflow;
    if (trigger?.isConnected) trigger.focus();
  });
  document.getElementById('legalClose').onclick = () => modal.close();
  agree.onclick = () => {
    if (!reached || !modal.open) return;
    accepted = true;
    sync();
    const error = document.getElementById('rt-error');
    if (error) error.textContent = '';
    modal.close();
  };
  area.addEventListener('scroll', check, { passive: true });
  document.addEventListener('click', event => {
    if (event.target.id === 'rt' && !accepted) {
      event.preventDefault();
      openLegal(event.target);
    } else if (event.target.closest('[data-papalita-legal]')) {
      event.preventDefault();
      openLegal();
    }
  });
  document.addEventListener('change', event => {
    if (event.target.id === 'rt' && !event.target.checked) {
      accepted = false;
      sync();
    }
  });

  window.papalitaOpenLegal = openLegal;
  window.termsSheet = openLegal;
  window.PapalitaLegal = {
    accepted: () => accepted,
    hasAccepted(id) {
      try { return Boolean(version && id && localStorage.getItem(storageKey(id)) === version); }
      catch { return false; }
    },
    record(id) {
      if (!version || !id || !accepted) return;
      try { localStorage.setItem(storageKey(id), version); } catch {}
    },
    forget(id) {
      if (!id) return;
      try { localStorage.removeItem(storageKey(id)); } catch {}
    },
    reset() {
      accepted = false;
      sync();
    },
    sync
  };
})();
