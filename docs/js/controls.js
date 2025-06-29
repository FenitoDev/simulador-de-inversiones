// DOM elements and control bindings
import { formatNumber, parseNumber, formatRate, parseRate } from './utils.js';

export const initialAgeRange = document.getElementById('initialAgeRange');
export const initialAgeNumber = document.getElementById('initialAgeNumber');
export const maxAgeRange = document.getElementById('maxAgeRange');
export const maxAgeNumber = document.getElementById('maxAgeNumber');
export const retirementAgeRange = document.getElementById('retirementAgeRange');
export const retirementAgeNumber = document.getElementById('retirementAgeNumber');
export const annualRateRange = document.getElementById('annualRateRange');
export const annualRateNumber = document.getElementById('annualRateNumber');
export const initialBalanceInput = document.getElementById('initialBalance');
export const monthlyDepositInput = document.getElementById('monthlyDeposit');
export const pensionInput = document.getElementById('pension');
export const logScaleCheckbox = document.getElementById('logScale');

// Helper to sync a range and number input
function syncInputs(rangeEl, numberEl, updateChart) {
  rangeEl.addEventListener('input', () => {
    numberEl.value = rangeEl.value;
    updateChart();
  });
  numberEl.addEventListener('change', () => {
    rangeEl.value = numberEl.value;
    updateChart();
  });
}

// Initialize all controls with the provided update callback
export function initControls(updateChart) {
  // Sync sliders and number fields for ages
  syncInputs(initialAgeRange, initialAgeNumber, updateChart);
  syncInputs(maxAgeRange, maxAgeNumber, updateChart);
  syncInputs(retirementAgeRange, retirementAgeNumber, updateChart);

  // Formatting and sync for annual rate (comma decimal)
  annualRateRange.addEventListener('input', () => {
    const v = Number(annualRateRange.value);
    annualRateNumber.value = formatRate(v);
    updateChart();
  });
  annualRateNumber.addEventListener('input', () => {
    const raw = annualRateNumber.value;
    const { selectionStart, selectionEnd } = annualRateNumber;
    const numeric = parseRate(raw);
    const formatted = formatRate(numeric);
    const diff = formatted.length - raw.length;
    annualRateNumber.value = formatted;
    annualRateNumber.setSelectionRange(selectionStart + diff, selectionEnd + diff);
    updateChart();
  });
  annualRateNumber.addEventListener('blur', () => {
    annualRateNumber.value = formatRate(parseRate(annualRateNumber.value));
    updateChart();
  });

  // Standard change listeners for large-value inputs
  [initialBalanceInput, monthlyDepositInput, pensionInput, annualRateNumber].forEach(el =>
    el.addEventListener('change', updateChart)
  );
  [logScaleCheckbox].forEach(el =>
    el.addEventListener('change', updateChart)
  );

  // Live formatting with caret preservation for big-number fields
  [initialBalanceInput, monthlyDepositInput, pensionInput, annualRateNumber].forEach(el => {
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
}
