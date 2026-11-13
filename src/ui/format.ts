const money = new Map<string, Intl.NumberFormat>();

export function formatPrice(amount: number, currency = 'EUR'): string {
  let f = money.get(currency);
  if (!f) {
    f = new Intl.NumberFormat('fr-FR', { style: 'currency', currency });
    money.set(currency, f);
  }
  return f.format(amount);
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

/** Stable color per query index (badges, fill chips). */
const PALETTE = [
  '#007782',
  '#c2410c',
  '#7c3aed',
  '#15803d',
  '#be185d',
  '#1d4ed8',
  '#a16207',
  '#0f766e',
];
export function queryColor(index: number): string {
  return PALETTE[index % PALETTE.length]!;
}
