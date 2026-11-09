(() => {
  'use strict';

  const displayMode = matchMedia('(display-mode: standalone)');
  let offer, installing = false, installed = false;
  const isStandalone = () => installed || displayMode.matches || navigator.standalone === true;
  const update = () => document.documentElement.classList.toggle('pr-rider-installed', isStandalone());
  update();
  displayMode.addEventListener?.('change', update);

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    offer = event;
  });
  window.addEventListener('appinstalled', () => {
    offer = null;
    installed = true;
    update();
  });

  function instructions() {
    const ua = navigator.userAgent;
    const appleMobile = /iPhone|iPad|iPod/i.test(ua) || /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    if (appleMobile) return 'Open this page in Safari. Tap Share, then Add to Home Screen. Turn on Open as Web App if shown, then tap Add.';
    if (/FBAN|FBAV|FB_IAB|Instagram|Messenger/i.test(ua)) return 'Open this page in Chrome, then use the browser menu to install it or add it to your home screen.';
    if (/Android/i.test(ua)) return 'In Chrome, tap the three-dot menu, then Add to Home screen. Choose Install if offered, or Create shortcut for one-tap access.';
    return 'Open the browser menu and look for Install page as app. If you already installed Papalita Rider, open it from your apps.';
  }

  async function open(showHelp) {
    if (isStandalone() || installing) return;
    if (!offer) {
      showHelp(instructions());
      return;
    }
    installing = true;
    const event = offer;
    offer = null;
    try {
      await event.prompt();
      await event.userChoice;
    } catch {
      showHelp(instructions());
    } finally {
      installing = false;
    }
  }

  window.PapalitaRiderInstall = { open };
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./rider-sw.js', { scope: './rider.html' })
      .catch(error => console.warn('Rider app worker could not register', error));
  }
})();
