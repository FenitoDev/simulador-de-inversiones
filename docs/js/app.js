// Parameter inputs
const initialAgeRange = document.getElementById('initialAgeRange');
const initialAgeNumber = document.getElementById('initialAgeNumber');
const maxAgeRange = document.getElementById('maxAgeRange');
const maxAgeNumber = document.getElementById('maxAgeNumber');
const retirementAgeRange = document.getElementById('retirementAgeRange');
const retirementAgeNumber = document.getElementById('retirementAgeNumber');
const annualRateRange = document.getElementById('annualRateRange');
const annualRateNumber = document.getElementById('annualRateNumber');
const initialBalanceInput = document.getElementById('initialBalance');
const monthlyDepositInput = document.getElementById('monthlyDeposit');
const pensionInput = document.getElementById('pension');
const logScaleCheckbox = document.getElementById('logScale');

// Formatting helpers
function formatNumber(value) {
  return new Intl.NumberFormat('de-DE').format(value);
}
function parseNumber(str) {
  return Number(str.replace(/\./g, ''));
}

// Sync range and number inputs
function syncInputs(rangeEl, numberEl) {
  rangeEl.addEventListener('input', () => {
    numberEl.value = parseNumber(rangeEl.value);
    updateChart();
  });
  numberEl.addEventListener('change', () => {
    rangeEl.value = formatNumber(numberEl.value);
    updateChart();
  });
}

syncInputs(initialAgeRange, initialAgeNumber);
syncInputs(maxAgeRange, maxAgeNumber);
syncInputs(retirementAgeRange, retirementAgeNumber);
syncInputs(annualRateRange, annualRateNumber);

// Update on numeric inputs and checkboxes
[initialBalanceInput, monthlyDepositInput, pensionInput].forEach(el =>
  el.addEventListener('change', updateChart)
);
[logScaleCheckbox].forEach(el =>
  el.addEventListener('change', updateChart)
);

// Format inputs on blur and live input (dots for thousands) with caret preservation
[initialBalanceInput, monthlyDepositInput, pensionInput].forEach(el => {
  el.addEventListener('input', () => {
    const raw = el.value;
    const { selectionStart, selectionEnd } = el;
    const numeric = parseNumber(raw);
    const formatted = formatNumber(numeric);
    const diff = formatted.length - raw.length;
    el.value = formatted;
    el.setSelectionRange(selectionStart + diff, selectionEnd + diff);
    updateChart();
  });
  el.addEventListener('blur', () => {
    el.value = formatNumber(parseNumber(el.value));
    updateChart();
  });
});

// Core calculation ported from Python
function investmentGrowth(annualRate, initialBalance, years, monthlyAmount) {
  let balance = initialBalance;
  const monthlyRate = Math.pow(1 + annualRate / 100, 1 / 12) - 1;
  const data = [{ Year: 0, Balance: balance }];

  for (let year = 1; year <= years; year++) {
    for (let m = 0; m < 12; m++) {
      balance += monthlyAmount;
      balance *= 1 + monthlyRate;
    }
    data.push({ Year: year, Balance: balance });
  }
  return data;
}

// Render chart based on current inputs
function updateChart() {
  const initialAge = +initialAgeNumber.value;
  const maxAge = +maxAgeNumber.value;
  const retirementAge = +retirementAgeNumber.value;
  const annualRate = parseNumber(annualRateNumber.value);
  const initialBalance = parseNumber(initialBalanceInput.value);
  const monthlyDeposit = parseNumber(monthlyDepositInput.value);
  const pension = parseNumber(pensionInput.value);
  const logScale = logScaleCheckbox.checked;

  const traces = [];

  // Investing phase
  const investYears = retirementAge - initialAge;
  const investDataRaw = investmentGrowth(annualRate, initialBalance, investYears, monthlyDeposit);
  const investData = investDataRaw.map(d => ({
    year: d.Year + initialAge,
    balance: d.Balance
  }));

  // Retirement phase
  const balanceAtRetire = investData[investData.length - 1].balance;
  const retireYears = maxAge - retirementAge;
  const retireDataRaw = investmentGrowth(annualRate, balanceAtRetire, retireYears, -pension);
  // skip year=0 to avoid duplicate
  const retireData = retireDataRaw.slice(1).map(d => ({
    year: d.Year + retirementAge,
    balance: d.Balance
  }));

  const lifeData = investData.concat(retireData);

  traces.push({
    x: lifeData.map(d => d.year),
    y: lifeData.map(d => d.balance),
    mode: 'lines',
    name: 'Balance',
    line: { color: 'blue' }
  });
}

// Zero baseline
const yearsRange = Array.from({ length: maxAge - initialAge + 1 }, (_, i) => initialAge + i);
traces.push({
  x: yearsRange,
  y: yearsRange.map(() => 0),
  mode: 'lines',
  hoverinfo: 'skip',
  line: { color: 'black' },
  showlegend: false
});

const layout = {
  title: 'Balance a través del tiempo',
  xaxis: { title: 'Year', tickmode: 'linear', dtick: 5 },
  yaxis: { title: 'Balance', type: logScale ? 'log' : 'linear' },
  template: 'plotly_white',
  height: 800
};

Plotly.react('chart', traces, layout, { responsive: true });


// Initial draw
updateChart();
// Format initial large-value inputs
[initialBalanceInput, monthlyDepositInput, pensionInput].forEach(element => {
  element.value = formatNumber(element.value);
});
