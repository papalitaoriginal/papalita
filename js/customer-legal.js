/* Accessible shared Terms/Privacy panel; policy text stays in index.html. */
(() => {
  'use strict';
  const modal = document.getElementById('papalitaLegal'), area = document.getElementById('legalScroll');
  const agree = document.getElementById('legalAgree'), status = document.getElementById('legalStatus');
  let accepted = false, reached = false, trigger = null, returnOverflow = '';
  window.papalitaLegalAccepted = false;
  function sync() { const c = document.getElementById('rt'); if (c) { c.checked = accepted; c.disabled = !accepted; } }
  function check() {
    if (!modal.open) return;
    if (area.scrollTop + area.clientHeight >= area.scrollHeight - 12) { reached = true; agree.disabled = false; status.textContent = 'You may now accept both policies.'; }
  }
  function openLegal() {
    if (modal.open) return;
    trigger = document.activeElement; returnOverflow = document.body.style.overflow;
    reached = false; agree.disabled = true; status.textContent = 'Read to the end to enable the agreement button.';
    modal.showModal(); document.body.style.overflow = 'hidden'; area.scrollTop = 0; area.focus(); requestAnimationFrame(check);
  }
  modal.addEventListener('close', () => { document.body.style.overflow = returnOverflow; if (trigger?.isConnected) trigger.focus(); });
  document.getElementById('legalClose').onclick = () => modal.close();
  agree.onclick = () => { if (!reached) return; accepted = true; window.papalitaLegalAccepted = true; sync(); document.getElementById('rt')?.dispatchEvent(new Event('change', {bubbles:true})); modal.close(); };
  area.addEventListener('scroll', check, {passive:true});
  window.papalitaOpenLegal = openLegal; window.termsSheet = openLegal;
  document.addEventListener('click', e => { if (e.target.closest('[data-papalita-legal]')) { e.preventDefault(); openLegal(); } });
  new MutationObserver(sync).observe(document.getElementById('view') || document.body, {childList:true,subtree:true});
  sync();
})();
