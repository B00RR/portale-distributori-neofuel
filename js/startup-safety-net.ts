// Startup safety net loaded as an external module so script-src can drop 'unsafe-inline'.

const boundary = document.getElementById('global-error-boundary');
const resetButton = document.getElementById('btn-force-reset') as HTMLButtonElement | null;
const codeDisplay = document.getElementById('error-code-display');

const showStartupError = (message?: string): void => {
  if (boundary) {
    boundary.style.display = 'block';
  }

  if (codeDisplay) {
    codeDisplay.textContent = message || 'Startup Failure';
  }

  // eslint-disable-next-line no-console -- runs before the logger module can load
  console.error('CRITICAL STARTUP ERROR:', message);
};

window.onerror = message => {
  if (typeof message === 'string' && message.includes('ResizeObserver')) {
    return;
  }

  showStartupError(String(message || 'Startup Failure'));
};

window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  const reason = event.reason;
  const message =
    reason instanceof Error ? reason.message : String(reason || 'Unhandled Promise Rejection');
  showStartupError(message);
});

resetButton?.addEventListener('click', () => {
  resetButton.textContent = 'Pulizia in corso...';
  resetButton.disabled = true;

  const serviceWorkerCleanup =
    'serviceWorker' in navigator
      ? navigator.serviceWorker
          .getRegistrations()
          .then(registrations =>
            Promise.all(registrations.map(registration => registration.unregister()))
          )
      : Promise.resolve([]);

  localStorage.clear();
  sessionStorage.clear();

  const cacheCleanup =
    'caches' in window
      ? caches.keys().then(names => Promise.all(names.map(name => caches.delete(name))))
      : Promise.resolve([]);

  void Promise.allSettled([serviceWorkerCleanup, cacheCleanup]).finally(() => {
    window.setTimeout(() => {
      window.location.reload();
    }, 1000);
  });
});
