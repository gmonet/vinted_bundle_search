import { assignItems, buildLot, sortLots } from '../src/core/scoring';
import { newQuery, type Item, type Seller } from '../src/core/types';

const mk = (matches: number[], price = 1) => ({ matches, price });

describe('assignItems', () => {
  it('example 1: one query, every item counts', () => {
    const r = assignItems([mk([0]), mk([0]), mk([0])], [{ points: 1, max: null }]);
    expect(r.score).toBe(3);
    expect(r.fill).toEqual([3]);
  });

  it('example 2: playmobil police capped at 2 × 4, lego police unlimited × 2', () => {
    const items = [mk([0]), mk([0]), mk([0]), mk([1]), mk([1])];
    const r = assignItems(items, [
      { points: 4, max: 2 },
      { points: 2, max: null },
    ]);
    expect(r.fill).toEqual([2, 2]);
    expect(r.score).toBe(2 * 4 + 2 * 2);
  });

  it('an item counts for only one query', () => {
    const r = assignItems(
      [mk([0, 1])],
      [
        { points: 4, max: null },
        { points: 2, max: null },
      ],
    );
    expect(r.score).toBe(4);
  });

  it('is optimal where a naive greedy is not', () => {
    // A matches both queries, B only the first (cap 1). Optimal: B->q0, A->q1 = 6.
    const r = assignItems(
      [mk([0, 1]), mk([0])],
      [
        { points: 4, max: 1 },
        { points: 2, max: null },
      ],
    );
    expect(r.score).toBe(6);
    expect(r.assigned.get(1)).toBe(0);
    expect(r.assigned.get(0)).toBe(1);
  });

  it('prefers the cheapest items for a capped query', () => {
    const r = assignItems([mk([0], 9), mk([0], 2), mk([0], 5)], [{ points: 1, max: 2 }]);
    expect([...r.assigned.keys()].sort()).toEqual([1, 2]);
  });

  it('ignores queries with zero points', () => {
    expect(assignItems([mk([0])], [{ points: 0, max: null }]).score).toBe(0);
  });
});

describe('buildLot / sortLots', () => {
  const seller = (id: string): Seller => ({
    id,
    login: id,
    url: '',
    photo: null,
    business: false,
  });
  const item = (id: string, matches: number[], price: number): Item => ({
    id,
    title: id,
    url: '',
    photo: null,
    price,
    totalPrice: price + 1,
    currency: 'EUR',
    brand: null,
    size: null,
    status: null,
    sellerId: 's',
    matches,
    source: 'search',
  });
  const queries = [newQuery({ points: 4, max: 1 }), newQuery({ points: 1 })];

  it('splits counted items and extras, sums prices of counted items', () => {
    const lot = buildLot(seller('a'), [item('x', [0], 3), item('y', [0], 5)], queries);
    expect(lot.score).toBe(4);
    expect(lot.counted.map((c) => c.item.id)).toEqual(['x']);
    expect(lot.extras.map((e) => e.id)).toEqual(['y']);
    expect(lot.price).toBe(3);
    expect(lot.totalPrice).toBe(4);
  });

  it('sorts by score then cheapest', () => {
    const a = buildLot(seller('a'), [item('1', [1], 10)], queries);
    const b = buildLot(seller('b'), [item('2', [1], 2)], queries);
    const c = buildLot(seller('c'), [item('3', [0], 50)], queries);
    expect(sortLots([a, b, c]).map((l) => l.seller.id)).toEqual(['c', 'b', 'a']);
    expect(sortLots([a, b, c], 'price').map((l) => l.seller.id)).toEqual(['b', 'a', 'c']);
  });
});
