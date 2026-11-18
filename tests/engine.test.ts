import { VintedClient } from '../src/core/api';
import { collectSeenIds, runSearch } from '../src/core/engine';
import { newQuery, newSearch } from '../src/core/types';
import { mockFetch, noSleep, searchItem, wardrobeItem } from './fixtures';

function setup(route: Parameters<typeof mockFetch>[0]) {
  const { fn, calls } = mockFetch(route);
  const client = new VintedClient({
    origin: 'https://www.vinted.fr',
    fetchFn: fn,
    minDelayMs: 0,
    sleep: noSleep,
  });
  return { client, calls };
}

const def = (deepScanTop = 0) =>
  newSearch({
    queries: [
      newQuery({ text: 'playmobil police', points: 4, max: 2 }),
      newQuery({ text: 'lego police', points: 2 }),
    ],
    settings: {
      pagesPerQuery: 2,
      deepScanTop,
      wardrobePages: 2,
      order: 'relevance',
      excludeBusiness: false,
    },
  });

describe('runSearch', () => {
  it('groups by seller and ranks lots (example 2)', async () => {
    const { client } = setup((url) => {
      if (url.pathname.endsWith('/svc-catalogue/items')) {
        const text = url.searchParams.get('search_text');
        const items =
          text === 'playmobil police'
            ? [
                searchItem(1, 100, 'Playmobil police moto', 3),
                searchItem(2, 100, 'Playmobil police voiture', 4),
                searchItem(3, 100, 'Playmobil police avion', 5),
                searchItem(4, 200, 'Playmobil police', 2),
              ]
            : [searchItem(5, 200, 'Lego police', 6), searchItem(6, 300, 'Lego police', 1)];
        return { items, pagination: { total_pages: 1 } };
      }
      throw new Error('unexpected ' + url);
    });
    const res = await runSearch(def(), client);
    expect(res.lots.map((l) => [l.seller.id, l.score])).toEqual([
      ['100', 8],
      ['200', 6],
      ['300', 2],
    ]);
    const top = res.lots[0]!;
    expect(top.counted.map((c) => c.item.id)).toEqual(['1', '2']);
    expect(top.extras.map((e) => e.id)).toEqual(['3']);
    expect(res.stats.requests).toBe(2); // one page each: fewer than 96 results
    expect(res.queries.map((q) => q.label)).toEqual(['playmobil police', 'lego police']);
  });

  it('completes the best lots from the wardrobe and fetches profiles', async () => {
    const { client, calls } = setup((url) => {
      if (url.pathname.endsWith('/svc-catalogue/items')) {
        const text = url.searchParams.get('search_text');
        return {
          items: text === 'playmobil police' ? [searchItem(1, 100, 'Playmobil police', 3)] : [],
          pagination: { total_pages: 1 },
        };
      }
      if (url.pathname === '/api/v2/wardrobe/100/items') {
        return {
          items: [
            wardrobeItem(1, 100, 'Playmobil police', 3),
            wardrobeItem(7, 100, 'Camion Lego Police', 8, { brand: 'LEGO' }),
            wardrobeItem(8, 100, 'Lego police vendu', 8, { is_closed: true }),
            wardrobeItem(9, 100, 'Robe', 8),
          ],
          pagination: { total_pages: 1 },
        };
      }
      if (url.pathname === '/api/v2/users/100') {
        return { user: { id: 100, feedback_reputation: 0.98, feedback_count: 12, item_count: 40 } };
      }
      throw new Error('unexpected ' + url);
    });
    const res = await runSearch(def(5), client);
    const lot = res.lots[0]!;
    expect(lot.score).toBe(4 + 2);
    expect(lot.deepScanned).toBe(true);
    expect(lot.counted.map((c) => [c.item.id, c.item.source])).toEqual([
      ['1', 'search'],
      ['7', 'wardrobe'],
    ]);
    expect(lot.seller.feedbackReputation).toBe(0.98);
    expect(calls.filter((c) => c.pathname.includes('wardrobe'))).toHaveLength(1);
  });

  it('stops on anti-bot challenge but keeps partial results', async () => {
    let n = 0;
    const { client } = setup(() =>
      n++ === 0
        ? { items: [searchItem(1, 100, 'Playmobil police', 3)], pagination: { total_pages: 1 } }
        : new Response('<html>Please wait</html>', { status: 403 }),
    );
    const res = await runSearch(def(3), client);
    expect(res.lots).toHaveLength(1);
    expect(res.warnings[0]).toMatch(/anti-robot/);
    expect(res.stats.requests).toBe(2);
  });

  it('strict queries drop fuzzy results that lack a keyword', async () => {
    const route = () => ({
      items: [
        searchItem(1, 100, 'Lego police moto', 3),
        searchItem(2, 200, 'Playmobil pompier', 3),
      ],
      pagination: { total_pages: 1 },
    });
    const strictDef = newSearch({ queries: [newQuery({ text: 'lego police' })] });
    strictDef.settings.deepScanTop = 0;
    const res = await runSearch(strictDef, setup(route).client);
    expect(res.lots.map((l) => l.seller.id)).toEqual(['100']);

    const loose = { ...strictDef, queries: [newQuery({ text: 'lego police', strict: false })] };
    const res2 = await runSearch(loose, setup(route).client);
    expect(res2.lots.map((l) => l.seller.id).sort()).toEqual(['100', '200']);
  });

  it('drops search results whose condition was not selected', async () => {
    // e.g. Vinted ignoring a malformed status filter and returning every condition.
    const { client, calls } = setup(() => ({
      items: [
        searchItem(1, 100, 'Playmobil police', 3, 'Neuf avec étiquette'),
        searchItem(2, 200, 'Playmobil police', 3, 'Bon état'),
        searchItem(3, 300, 'Playmobil police', 3, 'Satisfaisant'),
      ],
      pagination: { total_pages: 1 },
    }));
    const d = newSearch({
      queries: [newQuery({ text: 'playmobil police', statuses: ['6', '4'] })],
    });
    d.settings.deepScanTop = 0;
    const res = await runSearch(d, client);
    expect(calls[0]!.searchParams.get('attribute_ids[status]')).toBe('6,4');
    expect(res.lots.map((l) => l.seller.id).sort()).toEqual(['100', '300']);
  });

  it('flags new items relative to the previous run', async () => {
    const { client } = setup(() => ({
      items: [searchItem(1, 100, 'Playmobil police', 3), searchItem(2, 100, 'Playmobil police', 3)],
      pagination: { total_pages: 1 },
    }));
    const d = def();
    d.seenItemIds = ['1'];
    const res = await runSearch(d, client);
    const flags = Object.fromEntries(res.lots[0]!.counted.map((c) => [c.item.id, !!c.item.isNew]));
    expect(flags).toEqual({ '1': false, '2': true });
    expect(collectSeenIds(['0'], res).sort()).toEqual(['0', '1', '2']);
  });
});
