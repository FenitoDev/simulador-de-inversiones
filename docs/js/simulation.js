// Monthly simulation of several investments on a shared timeline.
// Pure module (no DOM access) so it can be run and tested from Node.
import { parseMonth, monthLabel } from './utils.js';

export function monthlyRate(annualRate) {
  return Math.pow(1 + annualRate / 100, 1 / 12) - 1;
}

// Amount of a flow in a given month, applying its yearly adjustment
// ("reajuste") every 12 months counted from the flow start.
export function flowAmount(flow, from, month) {
  const yearsElapsed = Math.floor((month - from) / 12);
  return flow.amount * Math.pow(1 + (flow.growth || 0) / 100, yearsElapsed);
}

const SERIES = ['initial', 'deposit', 'withdrawal', 'interest', 'transferIn', 'transferOut', 'payout', 'shortfall'];

// Each month, for every active investment and in this order:
//   1. the initial balance (first month) and transfers from matured investments come in,
//   2. deposits are added and withdrawals are paid (never below a zero balance),
//   3. the balance earns one month of interest,
//   4. if it is the investment's last month, the balance is cashed out or
//      transferred to another investment, arriving there the following month.
export function simulate(state) {
  const { profile, investments } = state;
  const birth = parseMonth(profile.birth);
  const horizon = birth + Math.round(profile.endAge * 12);

  const plans = investments.map(inv => {
    const start = parseMonth(inv.start);
    const explicitEnd = inv.end ? parseMonth(inv.end) : null;
    const end = Math.min(explicitEnd ?? horizon, horizon);
    const flows = inv.flows.map(flow => {
      const from = flow.from ? parseMonth(flow.from) : start;
      const to = flow.to ? parseMonth(flow.to) : end;
      return { flow, from, to };
    });
    return { inv, start, end, flows, rate: monthlyRate(inv.rate) };
  });

  const validStarts = plans.filter(p => p.start <= p.end).map(p => p.start);
  const first = validStarts.length ? Math.min(...validStarts) : Math.min(horizon, birth + 12 * 18);
  const months = [];
  for (let t = first; t <= horizon; t++) months.push(t);
  const n = months.length;

  const indexById = new Map(investments.map((inv, i) => [inv.id, i]));
  const results = plans.map(p => {
    const result = {
      id: p.inv.id,
      start: p.start,
      end: p.end,
      transferTo: null,
      depletedAt: null,
      warnings: [],
      balance: new Array(n).fill(null)
    };
    SERIES.forEach(key => { result[key] = new Array(n).fill(0); });
    return result;
  });

  plans.forEach((p, i) => {
    const warnings = results[i].warnings;
    if (p.start > horizon) {
      warnings.push('Comienza después del horizonte de simulación.');
    } else if (p.end < p.start) {
      warnings.push('La fecha de término es anterior a la de inicio.');
    }
    p.flows.forEach(({ flow, from, to }) => {
      if (Math.max(from, p.start) > Math.min(to, p.end)) {
        const kind = flow.type === 'deposit' ? 'aporte' : 'retiro';
        warnings.push(`Un ${kind} queda fuera del período de la inversión y no se aplica.`);
      }
    });
  });

  const balances = new Array(plans.length).fill(0);
  const pendingIn = plans.map(() => new Array(n + 1).fill(0));

  for (let k = 0; k < n; k++) {
    const t = months[k];
    plans.forEach((p, i) => {
      if (t < p.start || t > p.end) return;
      const r = results[i];

      let balance = balances[i];
      if (t === p.start) {
        balance = p.inv.initial;
        r.initial[k] = p.inv.initial;
      }
      balance += pendingIn[i][k];
      r.transferIn[k] += pendingIn[i][k];

      const active = p.flows.filter(f => t >= f.from && t <= f.to);
      active.filter(f => f.flow.type === 'deposit').forEach(f => {
        const amount = flowAmount(f.flow, f.from, t);
        balance += amount;
        r.deposit[k] += amount;
      });
      active.filter(f => f.flow.type === 'withdrawal').forEach(f => {
        const amount = flowAmount(f.flow, f.from, t);
        const paid = Math.min(amount, Math.max(balance, 0));
        balance -= paid;
        r.withdrawal[k] += paid;
        if (amount - paid > 0.005) {
          r.shortfall[k] += amount - paid;
          if (r.depletedAt === null) r.depletedAt = t;
        }
      });

      const interest = balance * p.rate;
      balance += interest;
      r.interest[k] = interest;
      r.balance[k] = balance;
      balances[i] = balance;

      if (t === p.end && p.end < horizon) {
        const wantsTransfer = p.inv.onEnd && p.inv.onEnd !== 'withdraw';
        const target = wantsTransfer ? indexById.get(p.inv.onEnd) : undefined;
        const targetPlan = plans[target];
        const canTransfer = target !== undefined && target !== i &&
          targetPlan.start <= t + 1 && t + 1 <= targetPlan.end;
        if (canTransfer) {
          pendingIn[target][k + 1] += balance;
          r.transferOut[k] = balance;
          r.transferTo = p.inv.onEnd;
        } else {
          r.payout[k] = balance;
          if (wantsTransfer) {
            const name = targetPlan ? `«${targetPlan.inv.name}»` : 'la inversión elegida';
            r.warnings.push(`No se puede traspasar a ${name}: no está activa en ${monthLabel(t + 1)}. El saldo se retira.`);
          }
        }
      }
    });
  }

  return { birth, horizon, first, months, results };
}
