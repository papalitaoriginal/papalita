/* One install controller; no timed popup and no invented installation success. */
(() => {
  'use strict';
  let offer = null, busy = false, dismissed = false;
  const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
  const inApp = () => /FBAN|FBAV|FB_IAB|Instagram|Messenger/i.test(navigator.userAgent);
  const canOffer = () => !installed() && !dismissed && (!!offer || ios() && !inApp());
  const changed = () => window.dispatchEvent(new Event('papalita-install-ready'));
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); offer = e; changed(); });
  window.addEventListener('appinstalled', () => { offer = null; dismissed = true; changed(); });
  function help(message) {
    const d = document.createElement('dialog'); d.className = 'pp-install-dialog';
    const p = document.createElement('p'); p.textContent = message;
    const h = document.createElement('h2'); h.textContent = 'Install Papalita'; h.id = 'pp-install-title'; d.setAttribute('aria-labelledby', h.id);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn p blk'; b.textContent = 'Got it'; b.onclick = () => d.close();
    d.append(h, p, b); document.body.append(d); d.addEventListener('close', () => d.remove(), {once:true}); d.showModal();
  }
  async function open() {
    if (busy || installed()) return;
    if (!offer) { help(ios() ? 'Open Papalita in Safari, tap Share, then Add to Home Screen.' : 'Your browser has not offered installation yet. Check its menu for Install app or Add to Home screen.'); return; }
    busy = true; const event = offer; offer = null;
    try { await event.prompt(); await event.userChoice; }
    catch { help('Installation could not start. Try again using your browser’s Install app menu.'); }
    finally { busy = false; changed(); }
  }
  window.PapalitaInstall = {canOffer, open, dismiss() { dismissed = true; changed(); }};
})();
