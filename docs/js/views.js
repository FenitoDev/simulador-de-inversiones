// Main area: tabs, figures at the selected date, charts and tables
import { formatMoney, formatRate, formatMonth, parseMonth, monthLabel, currentMonth } from './utils.js';
import { esc, monthFieldHTML, readMonthField, writeMonthField, tipHTML } from './dom.js';
import { retirementMonth } from './model.js';
import { renderBalanceChart, renderFlowsChart } from './charts.js';

const sum = (arr, to = arr.length - 1) => {
  let total = 0;
  for (let k = 0; k <= to; k++) total += arr[k];
  return total;
};

// Converts the nominal simulation into the series displayed on screen:
// optionally deflated to today's money, plus the aggregate of the included investments.
export function buildView(sim, state) {
  const { profile } = state;
  const today = currentMonth();
  const n = sim.months.length;
  const factor = sim.months.map(t => profile.realValues ? Math.pow(1 + profile.inflation / 100, -(t - today) / 12) : 1);
  const scale = arr => arr.map((v, k) => (v === null ? null : v * factor[k]));
  const keys = ['balance', 'initial', 'deposit', 'withdrawal', 'interest', 'transferIn', 'transferOut', 'payout', 'shortfall', 'bonus'];

  const series = sim.results.map((r, i) => {
    const inv = state.investments[i];
    const s = {
      id: inv.id, name: inv.name || 'Sin nombre', color: inv.color, rate: inv.rate, included: inv.included,
      start: r.start, end: r.end, depletedAt: r.depletedAt, transferTo: r.transferTo, warnings: r.warnings
    };
    keys.forEach(key => { s[key] = scale(r[key]); });
    // In today's money, each peso is deflated at its own date, so nominal interest
    // no longer adds up. Interest becomes what is left after the flows: the real
    // gain, net of inflation (negative when the rate is below inflation).
    if (profile.realValues) {
      s.interest = s.balance.map((v, k) => {
        if (v === null) return 0;
        const previous = k > 0 ? (s.balance[k - 1] ?? 0) : 0;
        return v - previous - s.initial[k] - s.transferIn[k] - s.deposit[k] - s.bonus[k] + s.withdrawal[k];
      });
    }
    return s;
  });

  // Transfers between included investments cancel out in the aggregate; transfers
  // crossing the included/excluded boundary count as money going in or out.
  const included = series.filter(s => s.included);
  const includedIds = new Set(included.map(s => s.id));
  const aggregate = { id: 'summary', name: 'Total', depletedAt: null, start: sim.first, end: sim.horizon, balance: new Array(n).fill(null) };
  keys.slice(1).forEach(key => { aggregate[key] = new Array(n).fill(0); });
  included.forEach(s => {
    for (let k = 0; k < n; k++) {
      if (s.balance[k] !== null) aggregate.balance[k] = (aggregate.balance[k] ?? 0) + s.balance[k];
      ['initial', 'deposit', 'withdrawal', 'interest', 'payout', 'shortfall', 'bonus'].forEach(key => { aggregate[key][k] += s[key][k]; });
      if (s.transferTo && !includedIds.has(s.transferTo)) aggregate.payout[k] += s.transferOut[k];
    }
  });
  series.filter(s => !s.included && s.transferTo && includedIds.has(s.transferTo)).forEach(s => {
    for (let k = 0; k < n - 1; k++) {
      if (s.transferOut[k]) aggregate.initial[k + 1] += s.transferOut[k] / factor[k] * factor[k + 1];
    }
  });
  const firstShortfall = aggregate.shortfall.findIndex(v => v > 0.005);
  if (firstShortfall >= 0) aggregate.depletedAt = sim.months[firstShortfall];

  return { sim, factor, series, aggregate };
}

function ageAt(sim, t) {
  return Math.floor((t - sim.birth) / 12);
}

// Money in and out of a series, as seen from that series. In the aggregate,
// transfers are internal and do not appear.
function moneyIn(s, k) {
  return s.initial[k] + s.deposit[k] + s.bonus[k] + (s.transferIn ? s.transferIn[k] : 0);
}

function moneyOut(s, k) {
  return s.withdrawal[k] + s.payout[k] + (s.transferOut ? s.transferOut[k] : 0);
}

function kpis(view, s, cutoff, state) {
  const { sim } = view;
  const kc = Math.min(cutoff, sim.horizon) - sim.first;
  const has = kc >= 0;
  const isSummary = s.id === 'summary';
  const inRange = has && s.balance[kc] !== null;
  const balance = inRange ? s.balance[kc] : 0;

  let balanceNote = '';
  if (!isSummary && cutoff < s.start) balanceNote = `Comienza en ${monthLabel(s.start)}`;
  else if (!isSummary && cutoff > s.end) balanceNote = `Terminó en ${monthLabel(s.end)}`;

  let peak = 0;
  let peakAt = null;
  s.balance.forEach((v, k) => { if (v !== null && v > peak) { peak = v; peakAt = sim.months[k]; } });

  const contributed = has ? sum(s.initial, kc) + sum(s.deposit, kc) : 0;
  const received = has && !isSummary ? sum(s.transferIn, kc) : 0;
  const withdrawn = has ? sum(s.withdrawal, kc) : 0;
  const cashedOut = has ? sum(s.payout, kc) + (isSummary ? 0 : sum(s.transferOut, kc)) : 0;
  const interest = has ? sum(s.interest, kc) : 0;
  const bonus = has ? sum(s.bonus, kc) : 0;

  const monthlyIn = inRange ? s.deposit[kc] : 0;
  const monthlyOut = inRange ? s.withdrawal[kc] : 0;
  const monthlyMissing = inRange ? s.shortfall[kc] : 0;
  const totalWithdrawals = sum(s.withdrawal) + sum(s.shortfall);

  const tiles = [];
  tiles.push({
    label: 'Saldo a la fecha',
    tip: 'Lo acumulado al final del mes elegido. Debajo, el saldo más alto que se alcanza en toda la simulación.',
    value: formatMoney(balance),
    sub: balanceNote || (peakAt !== null ? `Máximo ${formatMoney(peak)} en ${monthLabel(peakAt)}` : ''),
    hero: true
  });
  if (monthlyOut > 0 || monthlyMissing > 0) {
    tiles.push({
      label: 'Retiro mensual a la fecha',
      tip: 'Suma de los retiros activos en el mes elegido. Si el saldo no alcanza para pagarlos completos, se indica cuánto falta.',
      value: formatMoney(monthlyOut),
      sub: monthlyMissing > 0 ? `Faltan ${formatMoney(monthlyMissing)} para cubrir lo programado` : (monthlyIn > 0 ? `Aporte mensual ${formatMoney(monthlyIn)}` : 'Lo que se retira este mes'),
      status: monthlyMissing > 0 ? 'serious' : null
    });
  } else {
    tiles.push({
      label: 'Aporte mensual a la fecha',
      tip: 'Suma de los aportes activos en el mes elegido, sin contar el saldo inicial.',
      value: formatMoney(monthlyIn),
      sub: monthlyIn > 0 ? 'Lo que se invierte este mes' : 'Sin aportes este mes'
    });
  }
  tiles.push({
    label: 'Capital aportado',
    tip: 'Saldo inicial más todos los aportes hasta la fecha elegida. Es tu dinero, sin contar intereses.',
    value: formatMoney(contributed + received),
    sub: received > 0 ? `Incluye ${formatMoney(received)} recibidos por traspaso` : 'Saldo inicial más aportes'
  });
  tiles.push({
    label: state.profile.realValues ? 'Ganancia real' : 'Intereses ganados',
    tip: state.profile.realValues
      ? 'Intereses menos lo que la inflación le quita al saldo, en pesos de hoy. Es negativa si la rentabilidad es menor que la inflación. El porcentaje la compara con el capital aportado.'
      : 'Ganancia acumulada por la rentabilidad hasta la fecha. El porcentaje compara esa ganancia con el capital aportado.',
    value: formatMoney(interest),
    sub: contributed + received > 0 ? `${formatRate(Math.round((interest / (contributed + received)) * 1000) / 10)}% sobre lo aportado` : ''
  });
  if (sum(s.bonus) > 0) {
    tiles.push({
      label: 'Bonificación estatal',
      tip: 'Bonificación fiscal del APV recibida hasta la fecha: un porcentaje de los aportes de cada año, con tope anual, abonado en enero del año siguiente. No se cuenta como capital aportado.',
      value: formatMoney(bonus),
      sub: `${formatMoney(sum(s.bonus))} en toda la simulación`
    });
  }
  tiles.push({
    label: 'Total retirado',
    tip: 'Retiros mensuales pagados hasta la fecha, más los saldos retirados o traspasados al cerrar una inversión.',
    value: formatMoney(withdrawn + cashedOut),
    sub: cashedOut > 0 ? `Incluye ${formatMoney(cashedOut)} ${isSummary ? 'liquidados' : 'liquidados o traspasados'} al término` : 'Retiros mensuales'
  });
  if (s.depletedAt !== null) {
    tiles.push({
      label: 'Retiros cubiertos hasta', tip: 'Último mes en que el saldo alcanza para pagar completos todos los retiros programados. Mira toda la simulación, no solo la fecha elegida.',
      value: monthLabel(s.depletedAt - 1),
      sub: `A los ${ageAt(sim, s.depletedAt)} años el saldo ya no alcanza (faltan ${formatMoney(sum(s.shortfall))} en total)`,
      status: 'serious'
    });
  } else if (totalWithdrawals > 0) {
    tiles.push({
      label: 'Retiros cubiertos hasta', tip: 'Último mes en que el saldo alcanza para pagar completos todos los retiros programados. Mira toda la simulación, no solo la fecha elegida.',
      value: 'El final',
      sub: `El saldo cubre todos los retiros hasta los ${state.profile.endAge} años`,
      status: 'good'
    });
  } else {
    tiles.push({ label: 'Retiros cubiertos hasta', tip: 'Último mes en que el saldo alcanza para pagar completos todos los retiros programados. Mira toda la simulación, no solo la fecha elegida.', value: '—', sub: 'No hay retiros programados' });
  }

  return tiles.map(tile => `
    <div class="kpi${tile.hero ? ' kpi-hero' : ''}${tile.status ? ` kpi-${tile.status}` : ''}">
      <div class="kpi-label">${tile.status ? `<span class="status-icon" aria-hidden="true">${tile.status === 'good' ? '✓' : '!'}</span>` : ''}${esc(tile.label)}${tile.tip ? tipHTML(tile.tip) : ''}</div>
      <div class="kpi-value">${esc(tile.value)}</div>
      <div class="kpi-sub">${esc(tile.sub)}</div>
    </div>`).join('');
}

function statusOf(view, s, cutoff, state) {
  if (cutoff < s.start) return 'Por comenzar';
  if (s.depletedAt !== null && cutoff >= s.depletedAt) return 'Agotada';
  if (cutoff > s.end) {
    const target = s.transferTo && state.investments.find(i => i.id === s.transferTo);
    return target ? `Traspasada a «${target.name}»` : 'Terminada';
  }
  return 'Activa';
}

function breakdownHTML(view, cutoff, state) {
  const { sim, series, aggregate } = view;
  const kc = Math.min(cutoff, sim.horizon) - sim.first;
  const at = (arr) => (kc >= 0 ? sum(arr, kc) : 0);
  const balanceOf = s => (kc >= 0 && s.balance[kc] !== null ? s.balance[kc] : 0);
  const total = balanceOf(aggregate);

  const rows = series.map(s => {
    const balance = balanceOf(s);
    const share = s.included && total > 0 ? `${formatRate(Math.round((balance / total) * 1000) / 10)}%` : '—';
    return `
      <tr class="${s.included ? '' : 'excluded'}">
        <th scope="row"><button type="button" class="link-btn" data-tab="${s.id}"><span class="swatch" style="--c: var(--series-${s.color + 1})"></span>${esc(s.name)}</button>${s.included ? '' : ' <small>(fuera del total)</small>'}</th>
        <td>${formatRate(s.rate)}%</td>
        <td>${formatMoney(balance)}</td>
        <td>${share}</td>
        <td>${formatMoney(at(s.initial) + at(s.deposit) + at(s.bonus) + at(s.transferIn))}</td>
        <td>${formatMoney(at(s.withdrawal) + at(s.payout) + at(s.transferOut))}</td>
        <td>${formatMoney(at(s.interest))}</td>
        <td>${esc(statusOf(view, s, cutoff, state))}</td>
      </tr>`;
  }).join('');

  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th scope="col">Inversión</th><th scope="col">Rentab.</th><th scope="col">Saldo</th><th scope="col">% del total</th><th scope="col">Entradas</th><th scope="col">Salidas</th><th scope="col">Intereses</th><th scope="col">Estado</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <th scope="row">Total</th><td></td>
          <td>${formatMoney(total)}</td><td>${total > 0 ? '100%' : '—'}</td>
          <td>${formatMoney(at(aggregate.initial) + at(aggregate.deposit) + at(aggregate.bonus))}</td>
          <td>${formatMoney(at(aggregate.withdrawal) + at(aggregate.payout))}</td>
          <td>${formatMoney(at(aggregate.interest))}</td><td></td>
        </tr></tfoot>
      </table>
    </div>
    <p class="note">Entradas: saldo inicial, aportes, bonificación estatal y traspasos recibidos. Salidas: retiros, liquidaciones y traspasos al término. En el total, los traspasos entre inversiones se compensan.</p>`;
}

// One row per calendar year, used by the yearly table, the CSV and the flows chart
export function yearlyRows(view, s) {
  const { sim } = view;
  const rows = new Map();
  sim.months.forEach((t, k) => {
    const year = Math.floor(t / 12);
    if (!rows.has(year)) rows.set(year, { year, age: 0, balance: null, moneyIn: 0, moneyOut: 0, interest: 0, k: [] });
    const row = rows.get(year);
    row.age = ageAt(sim, t);
    if (s.balance[k] !== null) row.balance = s.balance[k];
    else if (row.balance !== null) row.balance = 0;
    row.moneyIn += moneyIn(s, k);
    row.moneyOut += moneyOut(s, k);
    row.interest += s.interest[k];
    row.k.push(k);
  });
  return [...rows.values()];
}

function yearlyHTML(rows) {
  const body = rows.map(r => `
    <tr><td>${r.year}</td><td>${r.age}</td><td>${r.balance === null ? '—' : formatMoney(r.balance)}</td>
    <td>${formatMoney(r.moneyIn)}</td><td>${formatMoney(r.moneyOut)}</td><td>${formatMoney(r.interest)}</td></tr>`).join('');
  return `
    <div class="table-wrap table-scroll">
      <table class="data-table">
        <thead><tr><th scope="col">Año</th><th scope="col">Edad</th><th scope="col">Saldo a fin de año</th><th scope="col">Entradas</th><th scope="col">Salidas</th><th scope="col">Intereses</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function downloadCSV(rows, name) {
  const header = 'Año;Edad;Saldo a fin de año;Entradas;Salidas;Intereses';
  const lines = rows.map(r => [r.year, r.age, Math.round(r.balance ?? 0), Math.round(r.moneyIn), Math.round(r.moneyOut), Math.round(r.interest)].join(';'));
  const blob = new Blob([`﻿${header}\n${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}-anual.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// `app` exposes { state, commit(structural) }
export function createViews(root, app) {
  const el = id => root.querySelector(`#${id}`);
  let current = null;

  el('cutoff-field').innerHTML = monthFieldHTML('id="cutoff-month"', app.state.ui.cutoff, { label: 'Fecha de las cifras' });

  function setCutoff(month) {
    app.state.ui.cutoff = formatMonth(month);
    app.commit(false);
  }

  function setTab(tab) {
    app.state.ui.tab = tab;
    app.commit(false);
  }

  root.addEventListener('click', event => {
    const tabButton = event.target.closest('[data-tab]');
    if (tabButton) { setTab(tabButton.dataset.tab); return; }
    const jump = event.target.closest('[data-jump]');
    if (jump && current) {
      const { sim } = current.view;
      const target = { today: currentMonth(), retirement: retirementMonth(app.state.profile), end: sim.horizon }[jump.dataset.jump];
      setCutoff(Math.max(sim.first, Math.min(target, sim.horizon)));
      return;
    }
    if (event.target.closest('#download-csv') && current) {
      downloadCSV(current.rows, current.series.name);
    }
  });
  el('cutoff-field').addEventListener('change', () => {
    const value = readMonthField(el('cutoff-month'));
    if (value) setCutoff(parseMonth(value));
  });
  root.querySelector('.tabs').addEventListener('keydown', event => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const tabs = [...root.querySelectorAll('.tabs [role="tab"]')];
    const index = tabs.indexOf(document.activeElement);
    if (index < 0) return;
    const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    next.focus();
    setTab(next.dataset.tab);
  });

  function renderTabs(view, tab) {
    const tabs = [{ id: 'summary', name: 'Resumen', color: null }].concat(view.series);
    el('tabs').innerHTML = tabs.map(t => `
      <button type="button" role="tab" class="tab${t.id === tab ? ' active' : ''}${t.included === false ? ' excluded' : ''}" data-tab="${t.id}" aria-selected="${t.id === tab}" tabindex="${t.id === tab ? 0 : -1}">
        ${t.color === null ? '<span class="tab-icon" aria-hidden="true">Σ</span>' : `<span class="swatch" style="--c: var(--series-${t.color + 1})"></span>`}${esc(t.name)}
      </button>`).join('');
  }

  function render(view) {
    const { state } = app;
    const { sim } = view;
    let tab = state.ui.tab;
    if (tab !== 'summary' && !view.series.some(s => s.id === tab)) tab = state.ui.tab = 'summary';
    const isSummary = tab === 'summary';
    const s = isSummary ? view.aggregate : view.series.find(x => x.id === tab);
    const cutoff = Math.max(sim.first, Math.min(parseMonth(state.ui.cutoff), sim.horizon));

    renderTabs(view, tab);

    const cutoffField = el('cutoff-month');
    if (!cutoffField.contains(document.activeElement)) writeMonthField(cutoffField, formatMonth(cutoff));
    el('cutoff-age').textContent = `${ageAt(sim, cutoff)} años`;
    el('real-tag').hidden = !state.profile.realValues;

    const warnings = (isSummary ? view.series.flatMap(x => x.warnings.map(w => `${x.name}: ${w}`)) : s.warnings);
    el('warnings').innerHTML = warnings.length
      ? `<div class="alert" role="status"><strong>Revisa:</strong><ul>${warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>`
      : '';

    const empty = isSummary && !view.series.some(x => x.included);
    el('empty-state').hidden = !empty;
    el('content').hidden = empty;
    if (empty) { current = null; return; }

    el('kpis').innerHTML = kpis(view, s, cutoff, state);
    el('balance-title').innerHTML = isSummary
      ? `Saldo por inversión ${tipHTML('Cada línea de color es el saldo de una inversión por separado. La línea punteada «Total» es la suma de las inversiones incluidas.')}`
      : `Saldo de «${esc(s.name)}» ${tipHTML('«Capital neto aportado» es lo que has puesto menos lo que has sacado. La distancia entre esa línea y el saldo es lo que han aportado los intereses.')}`;
    el('breakdown-card').hidden = !isSummary;
    if (isSummary) el('breakdown').innerHTML = breakdownHTML(view, cutoff, state);

    const rows = yearlyRows(view, s);
    el('yearly').innerHTML = yearlyHTML(rows);
    current = { view, series: s, rows };

    const ctx = { view, series: s, isSummary, state, cutoff, rows, onPick: setCutoff };
    renderBalanceChart(el('chart-balance'), ctx);
    renderFlowsChart(el('chart-flows'), ctx);
  }

  return { render };
}
