// Chart logic and rendering
import {
    initialAgeNumber,
    maxAgeNumber,
    retirementAgeNumber,
    annualRateNumber,
    initialBalanceInput,
    monthlyDepositInput,
    pensionInput,
    logScaleCheckbox
} from './controls.js';
import { parseRate } from './utils.js';

// Core calculation ported from Python
export function investmentGrowth(annualRate, initialBalance, years, monthlyAmount) {
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
export function updateChart() {
    const initialAge = +initialAgeNumber.value;
    const maxAge = +maxAgeNumber.value;
    const retirementAge = +retirementAgeNumber.value;
    const annualRate = parseRate(annualRateNumber.value);
    const initialBalance = Number(initialBalanceInput.value.replace(/\./g, ''));
    const monthlyDeposit = Number(monthlyDepositInput.value.replace(/\./g, ''));
    const pension = Number(pensionInput.value.replace(/\./g, ''));
    const logScale = logScaleCheckbox.checked;

    const traces = [];


    const investYears = retirementAge - initialAge;
    const investDataRaw = investmentGrowth(
        annualRate,
        initialBalance,
        investYears,
        monthlyDeposit
    );
    const investData = investDataRaw.map(d => ({
        year: d.Year + initialAge,
        balance: d.Balance
    }));

    const balanceAtRetire = investData[investData.length - 1].balance;
    const retireYears = maxAge - retirementAge;
    const retireDataRaw = investmentGrowth(
        annualRate,
        balanceAtRetire,
        retireYears,
        -pension
    );
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
        line: { color: 'blue' },
        showlegend: false
    });


    // Zero baseline
    const yearsRange = Array.from(
        { length: maxAge - initialAge + 1 },
        (_, i) => initialAge + i
    );
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
        template: 'plotly_white'
    };

    Plotly.react('chart', traces, layout, { responsive: true, staticPlot: true });
}
