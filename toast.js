// Lightweight toast notifications — replaces browser alert() popups everywhere.
// Usage: showToast('Message sent!', 'success')  |  'error'  |  'info' (default)

(function () {
  const container = document.createElement('div');
  container.id = 'toastContainer';
  container.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    display: flex; flex-direction: column-reverse; gap: 10px; z-index: 2000;
    align-items: center; pointer-events: none; width: 100%; max-width: 400px; padding: 0 16px;
  `;
  document.body.appendChild(container);

  window.showToast = function (message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = 'toast-item';
    toast.style.pointerEvents = 'auto';

    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
    toast.innerHTML = `
      <span class="toast-icon toast-icon-${type}">${icon}</span>
      <span class="toast-msg"></span>
      <button class="toast-close" aria-label="Dismiss">×</button>
    `;
    // Set message via textContent (not innerHTML) so it's never interpreted as HTML
    toast.querySelector('.toast-msg').textContent = message;

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));

    const remove = () => {
      toast.classList.remove('show');
      toast.classList.add('hide');
      setTimeout(() => toast.remove(), 250);
    };

    const timer = setTimeout(remove, duration);
    toast.querySelector('.toast-close').addEventListener('click', () => {
      clearTimeout(timer);
      remove();
    });
  };
})();
