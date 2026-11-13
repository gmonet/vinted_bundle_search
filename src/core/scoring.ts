import type { Item, Lot, Query, Seller } from './types';

export interface ScoreInput {
  points: number;
  max: number | null;
}

export interface Assignment {
  score: number;
  /** item index -> query index */
  assigned: Map<number, number>;
  fill: number[];
}

/**
 * Optimal assignment of items to queries for one seller.
 *
 * Each item counts for at most one query; query q yields `points` per item, up to `max` items.
 * Weights depend only on the query, so the set of fillable "slots" forms a transversal matroid:
 * greedily adding slots by decreasing points, each time searching an augmenting path
 * (Kuhn's algorithm), gives the maximum total score. Cheaper items are tried first so that,
 * among optimal solutions, the counted items tend to be the cheapest.
 */
export function assignItems(
  items: readonly { matches: readonly number[]; price: number }[],
  queries: readonly ScoreInput[],
): Assignment {
  const candidates: number[][] = queries.map(() => []);
  items.forEach((it, i) => {
    for (const q of it.matches) candidates[q]?.push(i);
  });
  for (const list of candidates) list.sort((a, b) => items[a]!.price - items[b]!.price);

  const ownerOf = new Map<number, number>(); // item -> query
  const fill = queries.map(() => 0);

  const tryAugment = (q: number, visited: Set<number>): boolean => {
    for (const i of candidates[q]!) {
      if (visited.has(i)) continue;
      visited.add(i);
      const owner = ownerOf.get(i);
      if (owner === undefined || tryAugment(owner, visited)) {
        ownerOf.set(i, q);
        return true;
      }
    }
    return false;
  };

  const order = queries
    .map((_, q) => q)
    .filter((q) => queries[q]!.points > 0)
    .sort((a, b) => queries[b]!.points - queries[a]!.points);

  let score = 0;
  for (const q of order) {
    const { points, max } = queries[q]!;
    const cap = max ?? Infinity;
    while (fill[q]! < cap && tryAugment(q, new Set())) {
      fill[q]!++;
      score += points;
    }
  }
  return { score, assigned: ownerOf, fill };
}

export function buildLot(seller: Seller, items: Item[], queries: readonly Query[]): Lot {
  const { score, assigned, fill } = assignItems(items, queries);
  const counted: Lot['counted'] = [];
  const extras: Item[] = [];
  items.forEach((item, i) => {
    const q = assigned.get(i);
    if (q === undefined) extras.push(item);
    else counted.push({ item, query: q });
  });
  counted.sort((a, b) => a.query - b.query || a.item.price - b.item.price);
  extras.sort((a, b) => a.price - b.price);
  const price = round2(counted.reduce((s, c) => s + c.item.price, 0));
  const totalPrice = round2(counted.reduce((s, c) => s + (c.item.totalPrice ?? c.item.price), 0));
  return { seller, score, counted, extras, fill, price, totalPrice, deepScanned: false };
}

export type LotSort = 'score' | 'price' | 'ratio' | 'count';

export function sortLots(lots: Lot[], by: LotSort = 'score'): Lot[] {
  const byScore = (a: Lot, b: Lot) => b.score - a.score || a.price - b.price;
  const cmp: Record<LotSort, (a: Lot, b: Lot) => number> = {
    score: byScore,
    price: (a, b) => a.price - b.price || byScore(a, b),
    ratio: (a, b) => b.score / (b.price || 1) - a.score / (a.price || 1) || byScore(a, b),
    count: (a, b) => b.counted.length - a.counted.length || byScore(a, b),
  };
  return [...lots].sort(cmp[by]);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
