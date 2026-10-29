// Entry point: state, persistence and render loop
import { loadState, saveState, normalizeState, defaultState } from './model.js';
import { simulate } from './simulation.js';
import { createEditor } from './editor.js';
import { buildView, createViews } from './views.js';
import { initTooltips } from './dom.js';

function initialize() {
  let frame = null;

  const app = {
    state: loadState(),
    // Called after every change. Structural changes (adding or removing
    // investments or flows) also rebuild the sidebar.
    commit(structural) {
      saveState(app.state);
      if (structural) editor.render();
      scheduleRender();
    },
    replaceState(raw) {
      app.state = normalizeState(raw);
      app.commit(true);
    },
    resetState() {
      app.state = defaultState();
      app.commit(true);
    }
  };

  const editor = createEditor(document.getElementById('sidebar-content'), app);
  const views = createViews(document.getElementById('main'), app);

  function renderViews() {
    frame = null;
    views.render(buildView(simulate(app.state), app.state));
  }

  function scheduleRender() {
    if (frame === null) frame = requestAnimationFrame(renderViews);
  }

  initTooltips();
  editor.render();
  renderViews();

  // Re-read chart colors when the OS theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', scheduleRender);

  // Mobile menu toggle
  const toggle = document.getElementById('menu-toggle');
  toggle.addEventListener('click', () => {
    const open = document.body.classList.toggle('sidebar-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
}

document.addEventListener('DOMContentLoaded', initialize);
