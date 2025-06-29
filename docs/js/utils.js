// Number formatting utilities
export function formatNumber(value) {
  return new Intl.NumberFormat('de-DE').format(value);
}

export function parseNumber(str) {
  // remove German thousands separators (.) and replace comma decimal with dot if present
  const normalized = str.replace(/\./g, '').replace(',', '.');
  return Number(normalized);
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
  const normalized = str.replace(/\./g, '').replace(',', '.');
  return Number(normalized);
}
