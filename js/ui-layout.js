// Layout controls only; object state and laser settings stay in app.js.
let showPanel;
let previousSelectionCount = 0;

export function updateArrangeSelection(count) {
  document.querySelectorAll('[data-align]').forEach(button => { button.disabled = count === 0; });
  // Open once when entering multi-selection; respect a later manual collapse or tab change.
  if (count >= 2 && previousSelectionCount < 2) {
    document.getElementById('arrange-objects').open = true;
    revealInspectorControl('arrange-objects');
    document.getElementById('panel-object').scrollTop = 0;
  }
  previousSelectionCount = count;
}

export function revealInspectorControl(id) {
  const control = document.getElementById(id);
  if (!control) return;
  const page = control.closest('[role="tabpanel"]');
  if (page) document.getElementById(page.getAttribute('aria-labelledby')).click();
  for (let parent = control.parentElement; parent; parent = parent.parentElement) {
    if (parent.tagName === 'DETAILS') parent.open = true;
  }
  showPanel?.(true);
}

export function initLayout() {
  const panel = document.getElementById('inspector-panel');
  const toggle = document.getElementById('btn-toggle-panel');
  const narrow = matchMedia('(max-width: 900px)');
  showPanel = visible => {
    panel.hidden = !visible;
    document.querySelector('.app-body').classList.toggle('panel-hidden', !visible);
    toggle.setAttribute('aria-expanded', String(visible));
    toggle.title = visible ? 'Skjul panelet og få større tegneflate' : 'Vis egenskaper, lag og laserinnstillinger';
  };
  toggle.addEventListener('click', () => showPanel(panel.hidden));
  narrow.addEventListener('change', () => showPanel(!narrow.matches));
  showPanel(!narrow.matches);

  const tabs = [...document.querySelectorAll('.inspector-tab')];
  const activate = tab => {
    for (const item of tabs) {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
    }
  };
  for (const tab of tabs) {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', e => {
      const index = tabs.indexOf(tab);
      const next = e.key === 'ArrowRight' ? (index + 1) % tabs.length : e.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
      if (next === null) return;
      e.preventDefault(); e.stopPropagation();
      activate(tabs[next]); tabs[next].focus();
    });
  }

  const menus = [...document.querySelectorAll('.header-menu')];
  const closeMenus = () => menus.forEach(menu => { menu.open = false; });
  // The toggle event is queued: check current state before closing other menus.
  menus.forEach(menu => menu.addEventListener('toggle', () => {
    if (menu.open) menus.filter(other => other !== menu).forEach(other => { other.open = false; });
  }));
  document.addEventListener('pointerdown', e => {
    if (!e.target.closest('.header-menu')) closeMenus();
  });
  document.addEventListener('focusin', e => {
    if (!e.target.closest('.header-menu')) closeMenus();
  });
  document.getElementById('file-menu').addEventListener('click', e => {
    if (e.target.closest('button')) closeMenus();
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || document.querySelector('.modal-backdrop.open')) return;
    const openMenu = menus.find(menu => menu.open);
    if (openMenu) {
      closeMenus(); openMenu.querySelector('summary').focus();
      e.preventDefault(); e.stopImmediatePropagation();
    } else if (narrow.matches && !panel.hidden && panel.contains(e.target)) {
      showPanel(false); toggle.focus(); e.preventDefault(); e.stopImmediatePropagation();
    }
  }, true);
  new ResizeObserver(entries => {
    document.documentElement.style.setProperty('--header-height', `${entries[0].target.getBoundingClientRect().height}px`);
  }).observe(document.querySelector('.app-header'));
}
