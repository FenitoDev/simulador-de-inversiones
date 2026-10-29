// Number formatting utilities
export function formatNumber(value) {
  return new Intl.NumberFormat('de-DE').format(value);
}

export function parseNumber(str) {
  // remove German thousands separators (.) and replace comma decimal with dot if present
  const normalized = String(str).replace(/\./g, '').replace(',', '.');
  return Number(normalized) || 0;
}

// Rate-specific formatting utilities
export function formatRate(value) {
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2
  }).format(value);
}

export function parseRate(str) {
  // remove German thousands separators (.) and replace comma decimal with dot
  const normalized = String(str).replace(/\./g, '').replace(',', '.');
  return Number(normalized) || 0;
}

// Money amounts are shown rounded to whole pesos
export function formatMoney(value) {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '−' : '';
  return `${sign}$${formatNumber(Math.abs(rounded))}`;
}

// Month utilities. A month is stored as 'YYYY-MM' in the state and handled
// internally as an integer index (year * 12 + month - 1) so it can be compared
// and iterated directly.
export const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export function parseMonth(str) {
  const [year, month] = String(str).split('-').map(Number);
  return year * 12 + (month - 1);
}

export function formatMonth(index) {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function monthLabel(index) {
  return `${MONTH_NAMES[index % 12]} ${Math.floor(index / 12)}`;
}

export function monthToISODate(index) {
  return `${formatMonth(index)}-01`;
}

export function currentMonth() {
  const now = new Date();
  return now.getFullYear() * 12 + now.getMonth();
}
