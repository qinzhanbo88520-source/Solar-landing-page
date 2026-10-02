(() => {
  const languageLinks = document.querySelectorAll('[data-lang-target]');
  const syncLanguageLinks = () => {
    const hash = window.location.hash || '';
    languageLinks.forEach((link) => {
      link.href = `${link.dataset.langTarget}${hash}`;
    });
  };

  syncLanguageLinks();
  window.addEventListener('hashchange', syncLanguageLinks);
  languageLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      const target = `${link.dataset.langTarget}${window.location.hash || ''}`;
      link.href = target;

      if (
        event.defaultPrevented
        || event.button !== 0
        || event.metaKey
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
      ) return;

      event.preventDefault();
      window.location.assign(target);
    });
  });

  document.querySelectorAll('[data-copy-wechat]').forEach((button) => {
    const status = document.getElementById(button.getAttribute('aria-describedby'));
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copyWechat);
        if (status) status.textContent = button.dataset.success;
      } catch {
        if (status) status.textContent = button.dataset.failure;
      }
    });
  });

  const header = document.querySelector('[data-header]');
  const topbar = document.querySelector('.topbar');
  const toggle = document.querySelector('.menu-toggle');
  const menu = document.getElementById('mobile-menu');
  const dock = document.querySelector('.whatsapp-dock');
  const hero = document.querySelector('.hero');
  const contact = document.getElementById('contact');
  if (dock && hero && contact && 'IntersectionObserver' in window) {
    let heroVisible = true;
    let contactVisible = false;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.target === hero) heroVisible = entry.isIntersecting;
        if (entry.target === contact) contactVisible = entry.isIntersecting;
      });
      dock.hidden = heroVisible || contactVisible;
    });
    observer.observe(hero);
    observer.observe(contact);
  }

  if (!header || !toggle || !menu) return;

  const syncHeaderHeight = () => {
    document.documentElement.style.setProperty('--mobile-header-height', `${header.offsetHeight}px`);
    document.documentElement.style.setProperty('--topbar-height', `${topbar?.offsetHeight || 0}px`);
  };
  syncHeaderHeight();
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(syncHeaderHeight);
    observer.observe(header);
    if (topbar) observer.observe(topbar);
  }

  const setMenu = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? toggle.dataset.closeLabel : toggle.dataset.openLabel);
    menu.hidden = !open;
    header.classList.toggle('menu-open', open);
  };

  toggle.addEventListener('click', () => {
    setMenu(toggle.getAttribute('aria-expanded') !== 'true');
  });
  document.addEventListener('click', (event) => {
    if (!header.contains(event.target) && toggle.getAttribute('aria-expanded') === 'true') setMenu(false);
  });

  menu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => setMenu(false));
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setMenu(false);
      toggle.focus();
    }
  });
  window.matchMedia('(min-width: 821px)').addEventListener('change', (event) => {
    if (event.matches) setMenu(false);
  });
})();
