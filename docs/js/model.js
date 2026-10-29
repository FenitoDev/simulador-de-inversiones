// Application state: defaults, validation and persistence
import { currentMonth, formatMonth, parseMonth } from './utils.js';

const STORAGE_KEY = 'simula-tu-pension:v1';
export const COLOR_SLOTS = 8;

let idCounter = 0;
export function newId() {
  idCounter += 1;
  return `${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function retirementMonth(profile) {
  return parseMonth(profile.birth) + Math.round(profile.retirementAge * 12);
}

export function horizonMonth(profile) {
  return parseMonth(profile.birth) + Math.round(profile.endAge * 12);
}

export function newFlow(type, from, to = null) {
  return {
    id: newId(),
    type,
    amount: type === 'deposit' ? 50000 : 300000,
    from: formatMonth(from),
    to: to === null ? null : formatMonth(to),
    growth: 0
  };
}

// APV state bonus: 15% of the year's deposits, capped at 6 UTM per year
// (about $420.000 in 2026). The cap is in today's money.
export function newBonus(enabled = false) {
  return { enabled, rate: 15, cap: 420000 };
}

export function nextColor(investments) {
  const used = new Set(investments.map(inv => inv.color));
  for (let slot = 0; slot < COLOR_SLOTS; slot++) {
    if (!used.has(slot)) return slot;
  }
  return investments.length % COLOR_SLOTS;
}

export function newInvestment(state) {
  const today = currentMonth();
  const retirement = retirementMonth(state.profile);
  return {
    id: newId(),
    name: `Inversión ${state.investments.length + 1}`,
    color: nextColor(state.investments),
    rate: 5,
    initial: 0,
    start: formatMonth(today),
    end: null,
    onEnd: 'withdraw',
    included: true,
    bonus: newBonus(),
    flows: [newFlow('deposit', today, retirement - 1)]
  };
}

// Example portfolio, built relative to the current month so that it always
// starts "today". The first investment keeps the values of the original
// single-fund simulator.
export function defaultState() {
  const today = currentMonth();
  const birthYear = Math.floor(today / 12) - 25;
  const profile = {
    birth: `${birthYear}-01`,
    retirementAge: 65,
    endAge: 100,
    inflation: 3,
    realValues: false,
    xAxis: 'date',
    logScale: false
  };
  const retirement = retirementMonth(profile);
  const pension = {
    id: newId(),
    name: 'Fondo de pensión',
    color: 0,
    rate: 7,
    initial: 0,
    start: formatMonth(today),
    end: null,
    onEnd: 'withdraw',
    included: true,
    bonus: newBonus(),
    flows: [
      { id: newId(), type: 'deposit', amount: 39000, from: formatMonth(today), to: formatMonth(retirement - 1), growth: 0 },
      { id: newId(), type: 'withdrawal', amount: 600000, from: formatMonth(retirement), to: null, growth: 0 }
    ]
  };
  const apv = {
    id: newId(),
    name: 'APV',
    color: 1,
    rate: 5,
    initial: 1000000,
    start: formatMonth(today + 2),
    end: null,
    onEnd: 'withdraw',
    included: true,
    bonus: newBonus(true),
    flows: [
      { id: newId(), type: 'deposit', amount: 50000, from: formatMonth(today + 2), to: formatMonth(retirement - 1), growth: 3 },
      { id: newId(), type: 'withdrawal', amount: 750000, from: formatMonth(retirement), to: null, growth: 0 }
    ]
  };
  const deposit = {
    id: newId(),
    name: 'Depósito a plazo',
    color: 2,
    rate: 4.5,
    initial: 3000000,
    start: formatMonth(today),
    end: formatMonth(today + 3 * 12),
    onEnd: apv.id,
    included: true,
    bonus: newBonus(),
    flows: []
  };
  return {
    version: 1,
    profile,
    investments: [pension, apv, deposit],
    ui: { tab: 'summary', cutoff: formatMonth(retirement) }
  };
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function month(value, fallback) {
  return typeof value === 'string' && MONTH_RE.test(value) ? value : fallback;
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeBonus(raw) {
  const base = newBonus();
  if (!raw || typeof raw !== 'object') return base;
  return {
    enabled: Boolean(raw.enabled),
    rate: Math.max(0, num(raw.rate, base.rate)),
    cap: Math.abs(num(raw.cap, base.cap))
  };
}

// Accepts anything (localStorage, imported file) and returns a complete,
// well-formed state, falling back to defaults field by field.
export function normalizeState(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;

  const p = raw.profile || {};
  const profile = {
    birth: month(p.birth, base.profile.birth),
    retirementAge: num(p.retirementAge, base.profile.retirementAge),
    endAge: Math.max(1, num(p.endAge, base.profile.endAge)),
    inflation: num(p.inflation, base.profile.inflation),
    realValues: Boolean(p.realValues),
    xAxis: p.xAxis === 'age' ? 'age' : 'date',
    logScale: Boolean(p.logScale)
  };

  const today = formatMonth(currentMonth());
  const list = Array.isArray(raw.investments) ? raw.investments : [];
  const investments = list.filter(inv => inv && typeof inv === 'object').map((inv, i) => {
    const start = month(inv.start, today);
    return {
      id: typeof inv.id === 'string' && inv.id ? inv.id : newId(),
      name: typeof inv.name === 'string' ? inv.name : `Inversión ${i + 1}`,
      color: Number.isInteger(inv.color) ? ((inv.color % COLOR_SLOTS) + COLOR_SLOTS) % COLOR_SLOTS : i % COLOR_SLOTS,
      rate: num(inv.rate, 0),
      initial: num(inv.initial, 0),
      start,
      end: inv.end ? month(inv.end, null) : null,
      onEnd: typeof inv.onEnd === 'string' ? inv.onEnd : 'withdraw',
      included: inv.included !== false,
      bonus: normalizeBonus(inv.bonus),
      flows: (Array.isArray(inv.flows) ? inv.flows : []).filter(f => f && typeof f === 'object').map(f => ({
        id: typeof f.id === 'string' && f.id ? f.id : newId(),
        type: f.type === 'withdrawal' ? 'withdrawal' : 'deposit',
        amount: Math.abs(num(f.amount, 0)),
        from: month(f.from, start),
        to: f.to ? month(f.to, null) : null,
        growth: num(f.growth, 0)
      }))
    };
  });

  const u = raw.ui || {};
  const ui = {
    tab: typeof u.tab === 'string' ? u.tab : 'summary',
    cutoff: month(u.cutoff, formatMonth(retirementMonth(profile)))
  };
  return { version: 1, profile, investments, ui };
}

export function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return normalizeState(JSON.parse(stored));
  } catch {
    // Storage unavailable or corrupted: start from the example
  }
  return defaultState();
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable (private mode, blocked): the app keeps working in memory
  }
}
