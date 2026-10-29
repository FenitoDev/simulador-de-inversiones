// Sidebar editor: profile parameters and the list of investments with their flows
import { formatNumber, parseNumber, formatRate, parseRate, formatMonth, parseMonth } from './utils.js';
import { esc, monthFieldHTML, readMonthField, setMonthFieldDisabled, formatMoneyInput, tipHTML } from './dom.js';
import { COLOR_SLOTS, newFlow, newId, newInvestment, nextColor, retirementMonth, horizonMonth } from './model.js';

// `app` exposes { state, commit(structural), replaceState(state), resetState() }
export function createEditor(root, app) {
  const openCards = new Set();

  function render() {
    const { state } = app;
    if (openCards.size === 0 && state.investments.length) openCards.add(state.investments[0].id);
    root.innerHTML = profileHTML(state.profile) + investmentsHTML(state, openCards) + dataHTML();
    refreshHints();
  }

  function refreshHints() {
    const birth = parseMonth(app.state.profile.birth);
    root.querySelectorAll('[data-hint-for]').forEach(hint => {
      const field = root.querySelector(`#${hint.dataset.hintFor}`);
      const value = field && readMonthField(field);
      if (!value) { hint.textContent = ''; return; }
      const age = Math.floor((parseMonth(value) - birth) / 12);
      hint.textContent = field.querySelector('select').disabled ? '' : `${age} años`;
    });
  }

  function scopeOf(el) {
    const flowEl = el.closest('[data-flow]');
    const invEl = el.closest('[data-inv]');
    const inv = invEl && app.state.investments.find(i => i.id === invEl.dataset.inv);
    if (flowEl && inv) return { inv, target: inv.flows.find(f => f.id === flowEl.dataset.flow) };
    if (inv) return { inv, target: inv };
    return { inv: null, target: app.state.profile };
  }

  function readValue(el) {
    switch (el.dataset.type) {
      case 'money': return Math.abs(parseNumber(el.value));
      case 'rate': return parseRate(el.value);
      case 'int': return Math.round(Number(el.value)) || 0;
      case 'bool': return el.checked;
      default: return el.value;
    }
  }

  function updateCardSummary(inv) {
    const card = root.querySelector(`[data-inv="${inv.id}"]`);
    if (!card) return;
    card.querySelector('.inv-title').textContent = inv.name || 'Sin nombre';
    card.querySelector('.inv-meta').textContent = cardMeta(inv);
    root.querySelectorAll(`select[data-bind="onEnd"] option[value="${inv.id}"]`).forEach(opt => {
      opt.textContent = `Traspasar a «${inv.name || 'Sin nombre'}»`;
    });
  }

  function handleField(event) {
    const el = event.target;
    const monthField = el.closest('.month-field');
    if (monthField) {
      if (event.type !== 'change') return;
      const value = readMonthField(monthField);
      if (!value) return;
      const { inv, target } = scopeOf(monthField);
      target[monthField.dataset.bind] = value;
      afterValueChange(inv);
      return;
    }

    const bind = el.dataset.bind;
    if (!bind) return;
    const { type } = el.dataset;
    // Text-like inputs update on every keystroke; selects and checkboxes on change
    const live = el.tagName === 'INPUT' && el.type !== 'checkbox';
    if (live !== (event.type === 'input')) return;

    if (type === 'money') formatMoneyInput(el, formatNumber, parseNumber);

    const { inv, target } = scopeOf(el);
    if (bind === 'noEnd') {
      toggleOpenEnd(el, inv, target);
    } else {
      target[bind] = readValue(el);
    }
    if (bind === 'type') el.closest('.flow').className = `flow ${target.type}`;
    afterValueChange(inv);
  }

  // "Sin término" checkboxes: an open end is stored as null; unchecking takes
  // the date currently shown in the (disabled) month field.
  function toggleOpenEnd(checkbox, inv, target) {
    const isFlow = target !== inv;
    const field = root.querySelector(`#${checkbox.dataset.field}`);
    const key = isFlow ? 'to' : 'end';
    if (checkbox.checked) {
      target[key] = null;
    } else {
      target[key] = readMonthField(field);
    }
    setMonthFieldDisabled(field, checkbox.checked);
    if (!isFlow) {
      const onEnd = root.querySelector(`[data-inv="${inv.id}"] select[data-bind="onEnd"]`);
      if (onEnd) onEnd.disabled = checkbox.checked;
    }
  }

  function afterValueChange(inv) {
    if (inv) updateCardSummary(inv);
    refreshHints();
    app.commit(false);
  }

  function handleClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const { state } = app;
    const { inv } = scopeOf(button);
    const action = button.dataset.action;

    if (action === 'add-investment') {
      const created = newInvestment(state);
      state.investments.push(created);
      openCards.add(created.id);
      state.ui.tab = created.id;
    } else if (action === 'duplicate-investment') {
      const copy = structuredClone(inv);
      copy.id = newId();
      copy.name = `${inv.name} (copia)`;
      copy.color = nextColor(state.investments);
      copy.flows.forEach(f => { f.id = newId(); });
      state.investments.splice(state.investments.indexOf(inv) + 1, 0, copy);
      openCards.add(copy.id);
    } else if (action === 'delete-investment') {
      if (!window.confirm(`¿Eliminar «${inv.name}»?`)) return;
      state.investments = state.investments.filter(i => i !== inv);
      state.investments.forEach(i => { if (i.onEnd === inv.id) i.onEnd = 'withdraw'; });
      openCards.delete(inv.id);
      if (state.ui.tab === inv.id) state.ui.tab = 'summary';
    } else if (action === 'add-flow') {
      const type = button.dataset.flowType;
      const start = parseMonth(inv.start);
      const retirement = retirementMonth(state.profile);
      const from = type === 'deposit' ? start : Math.max(start, retirement);
      const to = type === 'deposit' && retirement > from ? retirement - 1 : null;
      inv.flows.push(newFlow(type, from, to));
    } else if (action === 'delete-flow') {
      const flowId = button.closest('[data-flow]').dataset.flow;
      inv.flows = inv.flows.filter(f => f.id !== flowId);
    } else if (action === 'color') {
      inv.color = Number(button.dataset.color);
    } else if (action === 'export') {
      exportState(state);
      return;
    } else if (action === 'import') {
      root.querySelector('#import-file').click();
      return;
    } else if (action === 'reset') {
      if (!window.confirm('¿Reemplazar todo por el ejemplo inicial? Se perderán tus cambios (puedes exportarlos antes).')) return;
      openCards.clear();
      app.resetState();
      return;
    } else {
      return;
    }
    app.commit(true);
  }

  function handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    file.text().then(text => {
      openCards.clear();
      app.replaceState(JSON.parse(text));
    }).catch(() => {
      window.alert('No se pudo leer el archivo. Debe ser un JSON exportado desde este simulador.');
    });
    event.target.value = '';
  }

  root.addEventListener('input', handleField);
  root.addEventListener('change', event => {
    if (event.target.id === 'import-file') handleImport(event);
    else handleField(event);
  });
  root.addEventListener('click', handleClick);
  root.addEventListener('focusout', event => {
    const el = event.target;
    if (el.dataset.type === 'rate') el.value = formatRate(parseRate(el.value));
  });
  root.addEventListener('toggle', event => {
    const card = event.target.closest('[data-inv]');
    if (!card || event.target !== card) return;
    if (card.open) openCards.add(card.dataset.inv);
    else openCards.delete(card.dataset.inv);
  }, true);

  return { render, refreshHints };
}

// Explanations shown by the «?» markers next to the less obvious concepts
const TIPS = {
  inflation: 'Cuánto suben los precios cada año, en promedio. Se usa para «Mostrar en pesos de hoy». La meta del Banco Central de Chile es 3%.',
  real: 'Convierte los montos futuros a su poder de compra actual, descontando la inflación. Ejemplo: con 3% anual, $1.000.000 dentro de 20 años compran lo mismo que unos $554.000 hoy.',
  retirement: 'Marca la línea «Jubilación» en los gráficos y la fecha del botón «Jubilación». No mueve las fechas de los flujos que ya creaste.',
  endAge: 'Edad hasta la que se simula. Las inversiones y flujos sin fecha de término se proyectan hasta esa edad.',
  log: 'Con escala logarítmica, cada salto igual en el eje Y multiplica el valor. Ayuda a ver los primeros años, cuando los saldos todavía son chicos.',
  rate: 'Rentabilidad anual esperada, compuesta mes a mes: 7% anual equivale a 0,565% mensual. Si usas una rentabilidad real (sobre la inflación), no actives «pesos de hoy» o descontarás la inflación dos veces.',
  initial: 'Monto con el que parte la inversión en su mes de inicio.',
  end: 'Mes en que se cierra la inversión. Al cerrar, el saldo se retira o se traspasa a otra inversión. «Sin término»: sigue hasta el final de la simulación.',
  onEnd: 'Qué pasa con el saldo al cerrar la inversión. «Retirar»: el dinero sale de la simulación. «Traspasar»: la otra inversión lo recibe el mes siguiente, y debe estar activa en ese mes.',
  included: 'Si la desmarcas, la inversión se sigue simulando y conserva su pestaña, pero no suma en el Resumen. Sirve para comparar escenarios.',
  flows: 'Aportes: dinero que ingresas cada mes. Retiros: dinero que sacas cada mes, por ejemplo tu pensión. Si el saldo no alcanza para un retiro, se paga solo lo disponible.',
  untilEnd: 'El flujo dura hasta que termine la inversión, o hasta el final de la simulación si no tiene término.',
  growth: 'Cuánto sube el monto del flujo cada 12 meses desde su inicio. Ejemplo: $100.000 con 3% pasa a $103.000 el segundo año y a $106.090 el tercero. Si lo igualas a la inflación, el flujo mantiene su poder de compra.',
};

function exportState(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'simulacion-inversiones.json';
  link.click();
  URL.revokeObjectURL(url);
}

function cardMeta(inv) {
  const flows = inv.flows.length;
  return `${formatRate(inv.rate)}% anual · ${flows} ${flows === 1 ? 'flujo' : 'flujos'}${inv.included ? '' : ' · fuera del total'}`;
}

function profileHTML(profile) {
  return `
    <section class="panel" data-scope="profile">
      <h2>Perfil</h2>
      <div class="field">
        <label>Fecha de nacimiento</label>
        ${monthFieldHTML('data-bind="birth"', profile.birth, { label: 'Fecha de nacimiento' })}
      </div>
      <div class="field-row">
        <div class="field">
          <label for="retirementAge">Edad de jubilación ${tipHTML(TIPS.retirement)}</label>
          <input type="number" id="retirementAge" data-bind="retirementAge" data-type="int" min="18" max="110" value="${profile.retirementAge}" />
        </div>
        <div class="field">
          <label for="endAge">Edad final ${tipHTML(TIPS.endAge)}</label>
          <input type="number" id="endAge" data-bind="endAge" data-type="int" min="20" max="120" value="${profile.endAge}" />
        </div>
      </div>
      <div class="field">
        <label for="inflation">Inflación anual (%) ${tipHTML(TIPS.inflation)}</label>
        <input type="text" inputmode="decimal" id="inflation" data-bind="inflation" data-type="rate" value="${formatRate(profile.inflation)}" />
      </div>
      <label class="check"><input type="checkbox" data-bind="realValues" data-type="bool"${profile.realValues ? ' checked' : ''} /> Mostrar en pesos de hoy ${tipHTML(TIPS.real)}</label>
      <div class="field-row">
        <div class="field">
          <label for="xAxis">Eje horizontal</label>
          <select id="xAxis" data-bind="xAxis">
            <option value="date"${profile.xAxis === 'date' ? ' selected' : ''}>Fecha</option>
            <option value="age"${profile.xAxis === 'age' ? ' selected' : ''}>Edad</option>
          </select>
        </div>
        <label class="check check-inline"><input type="checkbox" data-bind="logScale" data-type="bool"${profile.logScale ? ' checked' : ''} /> Escala logarítmica ${tipHTML(TIPS.log)}</label>
      </div>
    </section>`;
}

function investmentsHTML(state, openCards) {
  const cards = state.investments.map(inv => investmentHTML(inv, state, openCards.has(inv.id))).join('');
  return `
    <section class="panel">
      <h2>Inversiones</h2>
      ${cards || '<p class="empty">Aún no hay inversiones.</p>'}
      <button type="button" class="btn btn-primary btn-block" data-action="add-investment">+ Agregar inversión</button>
    </section>`;
}

function investmentHTML(inv, state, open) {
  const horizon = formatMonth(horizonMonth(state.profile));
  const id = inv.id;
  const others = state.investments.filter(i => i.id !== id);
  const onEndOptions = [`<option value="withdraw">Retirar el saldo</option>`]
    .concat(others.map(o => `<option value="${o.id}"${inv.onEnd === o.id ? ' selected' : ''}>Traspasar a «${esc(o.name || 'Sin nombre')}»</option>`))
    .join('');
  const swatches = Array.from({ length: COLOR_SLOTS }, (_, slot) =>
    `<button type="button" class="swatch-btn${slot === inv.color ? ' selected' : ''}" data-action="color" data-color="${slot}" style="--c: var(--series-${slot + 1})" aria-label="Color ${slot + 1}" aria-pressed="${slot === inv.color}"></button>`
  ).join('');

  return `
    <details class="inv-card" data-inv="${id}"${open ? ' open' : ''}>
      <summary>
        <span class="swatch" style="--c: var(--series-${inv.color + 1})"></span>
        <span class="inv-title">${esc(inv.name || 'Sin nombre')}</span>
        <span class="inv-meta">${esc(cardMeta(inv))}</span>
      </summary>
      <div class="inv-body">
        <div class="field">
          <label for="name-${id}">Nombre</label>
          <input type="text" id="name-${id}" data-bind="name" value="${esc(inv.name)}" />
        </div>
        <div class="field-row">
          <div class="field">
            <label for="rate-${id}">Rentabilidad (%) ${tipHTML(TIPS.rate)}</label>
            <input type="text" inputmode="decimal" id="rate-${id}" data-bind="rate" data-type="rate" value="${formatRate(inv.rate)}" />
          </div>
          <div class="field">
            <label for="initial-${id}">Saldo inicial ${tipHTML(TIPS.initial)}</label>
            <input type="text" inputmode="numeric" id="initial-${id}" data-bind="initial" data-type="money" value="${formatNumber(inv.initial)}" />
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Inicio <small class="hint" data-hint-for="start-${id}"></small></label>
            ${monthFieldHTML(`id="start-${id}" data-bind="start"`, inv.start, { label: 'Inicio' })}
          </div>
          <div class="field">
            <label>Término ${tipHTML(TIPS.end)} <small class="hint" data-hint-for="end-${id}"></small></label>
            ${monthFieldHTML(`id="end-${id}" data-bind="end"`, inv.end || horizon, { label: 'Término', disabled: !inv.end })}
            <label class="check check-small"><input type="checkbox" data-bind="noEnd" data-field="end-${id}"${inv.end ? '' : ' checked'} /> Sin término</label>
          </div>
        </div>
        <div class="field">
          <label for="onEnd-${id}">Al término ${tipHTML(TIPS.onEnd)}</label>
          <select id="onEnd-${id}" data-bind="onEnd"${inv.end ? '' : ' disabled'}>${onEndOptions}</select>
        </div>
        <div class="field">
          <label>Color</label>
          <div class="swatches">${swatches}</div>
        </div>
        <label class="check"><input type="checkbox" data-bind="included" data-type="bool"${inv.included ? ' checked' : ''} /> Incluir en la vista agregada ${tipHTML(TIPS.included)}</label>

        <h3>Flujos mensuales ${tipHTML(TIPS.flows)}</h3>
        ${inv.flows.map(f => flowHTML(f, horizon)).join('') || '<p class="empty">Sin aportes ni retiros.</p>'}
        <div class="btn-row">
          <button type="button" class="btn" data-action="add-flow" data-flow-type="deposit">+ Aporte</button>
          <button type="button" class="btn" data-action="add-flow" data-flow-type="withdrawal">+ Retiro</button>
        </div>
        <div class="btn-row card-footer">
          <button type="button" class="btn btn-ghost" data-action="duplicate-investment">Duplicar</button>
          <button type="button" class="btn btn-ghost btn-danger" data-action="delete-investment">Eliminar</button>
        </div>
      </div>
    </details>`;
}

function flowHTML(flow, horizon) {
  const id = flow.id;
  return `
    <div class="flow ${flow.type}" data-flow="${id}">
      <div class="flow-head">
        <select data-bind="type" aria-label="Tipo de flujo">
          <option value="deposit"${flow.type === 'deposit' ? ' selected' : ''}>Aporte</option>
          <option value="withdrawal"${flow.type === 'withdrawal' ? ' selected' : ''}>Retiro</option>
        </select>
        <input type="text" inputmode="numeric" data-bind="amount" data-type="money" value="${formatNumber(flow.amount)}" aria-label="Monto mensual" />
        <span class="unit">/mes</span>
        <button type="button" class="icon-btn" data-action="delete-flow" aria-label="Eliminar flujo" title="Eliminar flujo">×</button>
      </div>
      <div class="field-row flow-dates">
        <div class="field">
          <label>Desde <small class="hint" data-hint-for="from-${id}"></small></label>
          ${monthFieldHTML(`id="from-${id}" data-bind="from"`, flow.from, { label: 'Desde' })}
        </div>
        <div class="field">
          <label>Hasta <small class="hint" data-hint-for="to-${id}"></small></label>
          ${monthFieldHTML(`id="to-${id}" data-bind="to"`, flow.to || horizon, { label: 'Hasta', disabled: !flow.to })}
          <label class="check check-small"><input type="checkbox" data-bind="noEnd" data-field="to-${id}"${flow.to ? '' : ' checked'} /> Hasta el término ${tipHTML(TIPS.untilEnd)}</label>
        </div>
      </div>
      <div class="field field-inline">
        <label for="growth-${id}">Reajuste anual (%) ${tipHTML(TIPS.growth)}</label>
        <input type="text" inputmode="decimal" id="growth-${id}" data-bind="growth" data-type="rate" value="${formatRate(flow.growth)}" />
      </div>
    </div>`;
}

function dataHTML() {
  return `
    <section class="panel">
      <h2>Datos</h2>
      <p class="note">Los cambios se guardan automáticamente en este navegador.</p>
      <div class="btn-row">
        <button type="button" class="btn" data-action="export">Exportar</button>
        <button type="button" class="btn" data-action="import">Importar</button>
        <button type="button" class="btn btn-ghost btn-danger" data-action="reset">Restablecer ejemplo</button>
      </div>
      <input type="file" id="import-file" accept="application/json,.json" hidden />
    </section>`;
}
