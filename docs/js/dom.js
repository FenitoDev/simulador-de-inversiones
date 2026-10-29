// Small DOM/HTML helpers shared by the editor and the views
import { MONTH_NAMES, parseMonth, formatMonth } from './utils.js';

export function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Month picker made of a month <select> and a year <input>. <input type="month">
// is not available in every desktop browser, so we build our own.
export function monthFieldHTML(attrs, value, { disabled = false, label = '' } = {}) {
  const index = parseMonth(value);
  const month = index % 12;
  const year = Math.floor(index / 12);
  const options = MONTH_NAMES.map((name, i) =>
    `<option value="${i + 1}"${i === month ? ' selected' : ''}>${name}</option>`
  ).join('');
  const dis = disabled ? ' disabled' : '';
  return `<span class="month-field" ${attrs}>` +
    `<select data-part="month" aria-label="${esc(label)} (mes)"${dis}>${options}</select>` +
    `<input type="number" data-part="year" min="1900" max="2200" step="1" value="${year}" aria-label="${esc(label)} (año)"${dis} />` +
    `</span>`;
}

export function readMonthField(field) {
  const month = Number(field.querySelector('[data-part="month"]').value);
  const year = Number(field.querySelector('[data-part="year"]').value);
  if (!Number.isInteger(year) || year < 1900 || year > 2200) return null;
  return formatMonth(year * 12 + month - 1);
}

export function writeMonthField(field, value) {
  const index = parseMonth(value);
  field.querySelector('[data-part="month"]').value = String((index % 12) + 1);
  field.querySelector('[data-part="year"]').value = String(Math.floor(index / 12));
}

export function setMonthFieldDisabled(field, disabled) {
  field.querySelectorAll('select, input').forEach(el => { el.disabled = disabled; });
}

// Live thousands formatting for money inputs, preserving the caret position
export function formatMoneyInput(el, format, parse) {
  const raw = el.value;
  const { selectionStart } = el;
  const formatted = format(parse(raw));
  const diff = formatted.length - raw.length;
  el.value = formatted;
  const caret = Math.max(0, selectionStart + diff);
  el.setSelectionRange(caret, caret);
}

// Help marker for concepts that need an explanation. The text is shown by
// initTooltips() on hover, keyboard focus or tap.
export function tipHTML(text) {
  return `<button type="button" class="tip" data-tip="${esc(text)}" aria-label="Más información">?</button>`;
}

// A single floating bubble positioned in viewport coordinates, so it is never
// clipped by scrollable containers such as the sidebar.
export function initTooltips() {
  const bubble = document.createElement('div');
  bubble.id = 'tooltip';
  bubble.className = 'tooltip';
  bubble.setAttribute('role', 'tooltip');
  bubble.hidden = true;
  document.body.append(bubble);
  let anchor = null;

  function show(el) {
    if (anchor && anchor !== el) anchor.removeAttribute('aria-describedby');
    anchor = el;
    bubble.textContent = el.dataset.tip;
    bubble.hidden = false;
    el.setAttribute('aria-describedby', bubble.id);
    const r = el.getBoundingClientRect();
    const b = bubble.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left + r.width / 2 - b.width / 2, window.innerWidth - b.width - 8));
    const top = r.top - b.height - 8 >= 8 ? r.top - b.height - 8 : r.bottom + 8;
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
  }

  function hide() {
    if (!anchor) return;
    anchor.removeAttribute('aria-describedby');
    anchor = null;
    bubble.hidden = true;
  }

  document.addEventListener('mouseover', event => {
    const tip = event.target.closest('.tip');
    if (tip) show(tip);
  });
  document.addEventListener('mouseout', event => {
    const tip = event.target.closest('.tip');
    if (tip && tip === anchor && document.activeElement !== tip) hide();
  });
  document.addEventListener('focusin', event => {
    if (event.target.matches('.tip')) show(event.target);
  });
  document.addEventListener('focusout', event => {
    if (event.target === anchor) hide();
  });
  // Tapping a marker toggles it; it must not activate the label it sits in
  document.addEventListener('click', event => {
    const tip = event.target.closest('.tip');
    if (!tip) {
      if (anchor) hide();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    show(tip);
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') hide();
  });
  document.addEventListener('scroll', hide, true);
}
