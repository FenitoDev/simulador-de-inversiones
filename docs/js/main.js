// Entry point: wire up controls and chart
import { formatNumber, parseNumber } from './utils.js';
import { updateChart } from './chart.js';
import {
    initControls,
    initialBalanceInput,
    monthlyDepositInput,
    pensionInput
} from './controls.js';

function initialize() {
    initControls(updateChart);

    [initialBalanceInput, monthlyDepositInput, pensionInput].forEach(element => {
        element.value = formatNumber(parseNumber(element.value));
    });

    updateChart();

    // Mobile menu toggle
    const toggle = document.getElementById('menu-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        document.body.classList.toggle('sidebar-open');
      });
    }
}

document.addEventListener('DOMContentLoaded', initialize);
