import { STATUSES, type Item, type Query } from './types';

/**
 * Local (client-side) matching of an item against a query.
 *
 * Used for wardrobe items (deep scan), which are not returned by the Vinted search engine.
 * It is an approximation: Vinted also searches descriptions and has synonyms; here we only
 * check the title + brand, with a little tolerance on word endings (plurals, typos like
 * "playmobile"). Category, color and material cannot be verified from wardrobe data and are
 * ignored.
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function tokenize(s: string): string[] {
  const n = normalize(s);
  return n ? n.split(' ') : [];
}

function wordMatches(token: string, word: string): boolean {
  if (word === token) return true;
  if (token.length < 3) return false;
  if (word.startsWith(token)) return true; // "lego" ~ "legos"
  // "playmobile" ~ "playmobil": token slightly longer than word
  return word.length >= 4 && token.startsWith(word) && token.length - word.length <= 2;
}

export function textMatches(queryText: string, haystack: string): boolean {
  const tokens = tokenize(queryText);
  if (tokens.length === 0) return true;
  const words = tokenize(haystack);
  return tokens.every((t) => words.some((w) => wordMatches(t, w)));
}

const statusTitles = new Map(STATUSES.map((s) => [s.id, normalize(s.title)]));

export function localMatch(item: Item, q: Query): boolean {
  if (!textMatches(q.text, `${item.title} ${item.brand ?? ''}`)) return false;
  if (q.priceFrom != null && item.price < q.priceFrom) return false;
  if (q.priceTo != null && item.price > q.priceTo) return false;
  if (q.statuses.length > 0) {
    const st = normalize(item.status ?? '');
    if (!q.statuses.some((id) => statusTitles.get(id) === st)) return false;
  }
  if (q.brands.length > 0) {
    const b = normalize(item.brand ?? '');
    if (!q.brands.some((o) => normalize(o.title) === b)) return false;
  }
  if (q.sizes.length > 0 && item.size) {
    const sz = normalize(item.size);
    if (!q.sizes.some((o) => normalize(o.title) === sz)) return false;
  }
  return true;
}
