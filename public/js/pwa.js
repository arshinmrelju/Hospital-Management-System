(function() {
  'use strict';

  var deferredPrompt = null;
  var installBanner = document.getElementById('pwaInstallBanner');
  var installBtn = document.getElementById('pwaInstallBtn');
  var dismissBtn = document.getElementById('pwaInstallDismiss');
  var offlineIndicator = document.getElementById('offlineIndicator');

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  }

  function showInstallBanner() {
    if (!installBanner || isStandalone()) return;
    if (localStorage.getItem('pwa_install_dismissed')) return;
    installBanner.classList.add('visible');
  }

  function hideInstallBanner() {
    if (installBanner) installBanner.classList.remove('visible');
  }

  if (installBtn && dismissBtn) {
    installBtn.addEventListener('click', function() {
      hideInstallBanner();
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function(choice) {
          if (choice.outcome === 'accepted') {
            localStorage.setItem('pwa_installed', 'true');
          }
          deferredPrompt = null;
        });
      }
    });

    dismissBtn.addEventListener('click', function() {
      hideInstallBanner();
      localStorage.setItem('pwa_install_dismissed', 'true');
    });
  }

  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
  });

  window.addEventListener('appinstalled', function() {
    deferredPrompt = null;
    hideInstallBanner();
    localStorage.setItem('pwa_installed', 'true');
  });

  function updateOnlineStatus() {
    if (!offlineIndicator) return;
    if (navigator.onLine) {
      offlineIndicator.classList.remove('visible');
    } else {
      offlineIndicator.classList.add('visible');
    }
  }

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('/service-worker.js').then(function(reg) {
        reg.addEventListener('updatefound', function() {
          var newWorker = reg.installing;
          newWorker.addEventListener('statechange', function() {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              var toast = document.createElement('div');
              toast.className = 'toast';
              toast.innerHTML = '<span class="material-icons-round">system_update</span> Update available. <a href="#" onclick="window.location.reload()" style="color:#0D9488;font-weight:700;text-decoration:underline;">Refresh</a>';
              document.getElementById('toastContainer').appendChild(toast);
              setTimeout(function() { toast.remove(); }, 15000);
            }
          });
        });
      }).catch(function() {});
    });
  }

})();
