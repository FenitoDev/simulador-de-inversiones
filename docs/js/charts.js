// Plotly charts. Colors come from the CSS custom properties so the charts follow
// the light/dark theme and the per-investment color slots.
import { monthToISODate, monthLabel, currentMonth } from './utils.js';
import { retirementMonth } from './model.js';

// Spanish month names for date axes and hover labels
Plotly.register({
  moduleType: 'locale',
  name: 'es',
  dictionary: {},
  format: {
    days: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
    shortDays: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
    months: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'],
    shortMonths: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
    date: '%d/%m/%Y'
  }
});

const CONFIG = {
  responsive: true,
  locale: 'es',
  displaylogo: false,
  modeBarButtonsToRemove: ['select2d', 'lasso2d', 'autoScale2d', 'zoomIn2d', 'zoomOut2d', 'pan2d']
};

function theme() {
  const css = getComputedStyle(document.documentElement);
  const v = name => css.getPropertyValue(name).trim();
  return {
    series: Array.from({ length: 8 }, (_, i) => v(`--series-${i + 1}`)),
    surface: v('--surface-1'),
    text: v('--text-primary'),
    textSecondary: v('--text-secondary'),
    muted: v('--text-muted'),
    grid: v('--grid'),
    axis: v('--axis'),
    neutral: v('--neutral-series'),
    accent: v('--accent')
  };
}

function alpha(hex, a) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function xMapper(ctx) {
  const { birth } = ctx.view.sim;
  if (ctx.state.profile.xAxis === 'age') return t => (t - birth) / 12;
  return t => monthToISODate(t);
}

function baseLayout(ctx, t) {
  const age = ctx.state.profile.xAxis === 'age';
  return {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: 'Inter, system-ui, sans-serif', size: 12, color: t.textSecondary },
    separators: ',.',
    margin: { l: 12, r: 12, t: 28, b: 36 },
    hovermode: 'x unified',
    hoverlabel: { bgcolor: t.surface, bordercolor: t.grid, font: { color: t.text, size: 12 } },
    legend: { orientation: 'h', x: 0, y: -0.14, yanchor: 'top', traceorder: 'normal', font: { color: t.textSecondary } },
    xaxis: {
      type: age ? 'linear' : 'date',
      title: age ? { text: 'Edad', font: { size: 12 } } : undefined,
      dtick: age ? 5 : undefined,
      hoverformat: age ? '.1f' : '%b %Y',
      gridcolor: t.grid,
      linecolor: t.axis,
      zeroline: false,
      showspikes: true,
      spikemode: 'across',
      spikethickness: 1,
      spikecolor: t.muted,
      spikedash: 'solid'
    },
    yaxis: {
      automargin: true,
      tickformat: '$,.0f',
      gridcolor: t.grid,
      zerolinecolor: t.axis,
      linecolor: t.axis,
      rangemode: 'tozero'
    }
  };
}

// Vertical reference lines: today, retirement and the date of the figures
function markers(ctx, t, x) {
  const { sim } = ctx.view;
  const inRange = m => m >= sim.first && m <= sim.horizon;
  const shapes = [];
  const annotations = [];
  const add = (month, text, color, width, anchor) => {
    if (!inRange(month)) return;
    shapes.push({ type: 'line', xref: 'x', yref: 'paper', x0: x(month), x1: x(month), y0: 0, y1: 1, line: { color, width } });
    annotations.push({ x: x(month), y: 1, xref: 'x', yref: 'paper', yanchor: 'bottom', xanchor: anchor, showarrow: false, text, font: { size: 11, color: t.textSecondary } });
  };
  add(currentMonth(), 'Hoy ', t.muted, 1, 'right');
  add(retirementMonth(ctx.state.profile), `Jubilación ${ctx.state.profile.retirementAge} `, t.muted, 1, 'right');
  add(ctx.cutoff, ' Cifras', t.accent, 1.5, 'left');
  return { shapes, annotations };
}

export function renderBalanceChart(el, ctx) {
  const t = theme();
  const x = xMapper(ctx);
  const { sim, series: all } = ctx.view;
  const xs = sim.months.map(x);
  const labels = sim.months.map(m => `${monthLabel(m)} · ${Math.floor((m - sim.birth) / 12)} años`);
  const traces = [];

  if (ctx.isSummary) {
    all.filter(s => s.included).forEach(s => {
      const color = t.series[s.color];
      traces.push({
        x: xs, y: s.balance, name: s.name, type: 'scatter', mode: 'lines',
        line: { color, width: 2 },
        hovertemplate: '%{fullData.name}: %{y:$,.0f}<extra></extra>'
      });
    });
    traces.push({
      x: xs, y: ctx.series.balance, name: 'Total', type: 'scatter', mode: 'lines',
      line: { color: t.text, width: 2, dash: 'dot' }, customdata: labels,
      hovertemplate: '<b>%{fullData.name}: %{y:$,.0f}</b>  ·  %{customdata}<extra></extra>'
    });
  } else {
    const s = ctx.series;
    const color = t.series[s.color];
    let net = 0;
    const netCapital = s.balance.map((v, k) => {
      net += s.initial[k] + s.deposit[k] + s.bonus[k] + s.transferIn[k] - s.withdrawal[k] - s.payout[k] - s.transferOut[k];
      return v === null ? null : net;
    });
    traces.push({
      x: xs, y: netCapital, name: 'Capital neto aportado', type: 'scatter', mode: 'lines',
      line: { color: t.neutral, width: 1.5 }, hovertemplate: '%{fullData.name}: %{y:$,.0f}<extra></extra>'
    });
    traces.push({
      x: xs, y: s.balance, name: 'Saldo', type: 'scatter', mode: 'lines',
      line: { color, width: 2 }, fill: 'tozeroy', fillcolor: alpha(color, 0.14), customdata: labels,
      hovertemplate: '<b>%{fullData.name}: %{y:$,.0f}</b>  ·  %{customdata}<extra></extra>'
    });
  }

  const layout = baseLayout(ctx, t);
  if (ctx.state.profile.logScale) {
    layout.yaxis.type = 'log';
    delete layout.yaxis.rangemode;
  }
  Object.assign(layout, markers(ctx, t, x));
  Plotly.react(el, traces, layout, CONFIG);
  setPickHandler(el, ctx.onPick, point => sim.months[point.pointIndex]);
}

export function renderFlowsChart(el, ctx) {
  const t = theme();
  const { sim, series: all } = ctx.view;
  const age = ctx.state.profile.xAxis === 'age';
  const yearX = row => (age ? row.age : row.year);
  const yearOf = (s, row, pick) => row.k.reduce((acc, k) => acc + pick(s, k), 0);
  const nz = v => (Math.abs(v) < 0.5 ? null : v);
  const traces = [];

  const bar = (s, name, showlegend, color, pick, sign, pattern) => {
    const ys = ctx.rows.map(row => nz(sign * yearOf(s, row, pick)));
    if (ys.every(v => v === null)) return;
    traces.push({
      x: ctx.rows.map(yearX), y: ys, name, type: 'bar',
      marker: {
        color: pattern ? alpha(color, 0.25) : color,
        line: { width: 0 },
        pattern: pattern ? { shape: pattern === true ? '/' : pattern, fgcolor: color, size: 6, solidity: 0.35 } : undefined
      },
      legendgroup: s.id, showlegend,
      hovertemplate: '%{fullData.name}: %{y:$,.0f}<extra></extra>'
    });
  };

  if (ctx.isSummary) {
    all.filter(s => s.included).forEach(s => {
      const color = t.series[s.color];
      bar(s, s.name, true, color, (x, k) => x.initial[k] + x.deposit[k], 1, false);
      bar(s, `${s.name} · bonificación`, false, color, (x, k) => x.bonus[k], 1, '.');
      bar(s, `${s.name} · retiros`, false, color, (x, k) => x.withdrawal[k], -1, false);
      bar(s, `${s.name} · salida al término`, false, color, (x, k) => x.payout[k], -1, true);
    });
  } else {
    const s = ctx.series;
    const color = t.series[s.color];
    bar(s, 'Aportes', true, color, (x, k) => x.initial[k] + x.deposit[k], 1, false);
    bar(s, 'Bonificación estatal', true, color, (x, k) => x.bonus[k], 1, '.');
    bar(s, 'Traspasos recibidos', true, color, (x, k) => x.transferIn[k], 1, true);
    bar(s, 'Retiros', true, color, (x, k) => x.withdrawal[k], -1, false);
    bar(s, 'Salida al término', true, color, (x, k) => x.payout[k] + x.transferOut[k], -1, true);
  }
  const s = ctx.series;
  const interest = ctx.rows.map(row => nz(yearOf(s, row, (x, k) => x.interest[k])));
  traces.push({
    x: ctx.rows.map(yearX), y: interest, name: 'Intereses', type: 'bar',
    marker: { color: t.neutral, line: { width: 0 } }, hovertemplate: '%{fullData.name}: %{y:$,.0f}<extra></extra>'
  });

  const layout = baseLayout(ctx, t);
  layout.barmode = 'relative';
  layout.bargap = 0.2;
  layout.barcornerradius = 3;
  layout.xaxis = { ...layout.xaxis, type: 'linear', dtick: 5, hoverformat: 'd', title: age ? { text: 'Edad', font: { size: 12 } } : undefined };
  layout.yaxis.rangemode = 'normal';
  layout.yaxis.zerolinecolor = t.textSecondary;
  Plotly.react(el, traces, layout, CONFIG);
  setPickHandler(el, ctx.onPick, point => {
    const row = ctx.rows[point.pointIndex];
    return sim.months[row.k[row.k.length - 1]];
  });
}

// Plotly keeps event listeners across Plotly.react calls, so they are bound once
// and read the latest handler from the element.
function setPickHandler(el, onPick, toMonth) {
  el._pick = { onPick, toMonth };
  if (el._pickBound) return;
  el._pickBound = true;
  el.on('plotly_click', data => {
    const point = data.points && data.points[0];
    if (!point || !el._pick) return;
    const month = el._pick.toMonth(point);
    if (month !== undefined) el._pick.onPick(month);
  });
}
