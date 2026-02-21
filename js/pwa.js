(function () {
  if (!('serviceWorker' in navigator)) return;
  let deferredPrompt = null;
  let installBtn = null;

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function injectInstallStyles() {
    if (document.getElementById('pwaInstallStyles')) return;
    const style = document.createElement('style');
    style.id = 'pwaInstallStyles';
    style.textContent = `
      .pwa-install-btn {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 11000;
        border: 0;
        border-radius: 999px;
        padding: 10px 14px;
        font: 600 13px/1.1 'Poppins', sans-serif;
        color: #ffffff;
        background: linear-gradient(135deg, #1d4ed8, #2563eb);
        box-shadow: 0 10px 24px rgba(29, 78, 216, 0.35);
        cursor: pointer;
        display: none;
      }
      .pwa-install-btn.show {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .pwa-install-btn:hover {
        filter: brightness(1.04);
      }
      .pwa-install-btn:active {
        transform: translateY(1px);
      }
      @media (max-width: 576px) {
        .pwa-install-btn {
          right: 12px;
          bottom: 12px;
          padding: 9px 12px;
          font-size: 12px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureInstallButton() {
    if (installBtn) return installBtn;
    injectInstallStyles();
    installBtn = document.createElement('button');
    installBtn.type = 'button';
    installBtn.className = 'pwa-install-btn';
    installBtn.setAttribute('aria-label', 'Install app');
    installBtn.textContent = 'Install App';
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      try {
        await deferredPrompt.userChoice;
      } finally {
        deferredPrompt = null;
        installBtn.classList.remove('show');
      }
    });
    document.body.appendChild(installBtn);
    return installBtn;
  }

  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('./sw.js');
    } catch (err) {
      console.error('PWA service worker registration failed:', err);
    }

    if (isStandalone()) return;
    ensureInstallButton();
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    if (isStandalone()) return;
    ensureInstallButton().classList.add('show');
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    if (installBtn) installBtn.classList.remove('show');
  });
})();
