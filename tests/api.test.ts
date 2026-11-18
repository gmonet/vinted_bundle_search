import { apiOriginFor, parseSecondLine, VintedClient, VintedError } from '../src/core/api';
import { newQuery } from '../src/core/types';
import { mockFetch, noSleep, searchItem } from './fixtures';

const client = (fn: typeof fetch) =>
  new VintedClient({ origin: 'https://www.vinted.fr', fetchFn: fn, minDelayMs: 0, sleep: noSleep });

describe('VintedClient', () => {
  it('derives the API origin', () => {
    expect(apiOriginFor('https://www.vinted.fr')).toBe('https://api.vinted.fr');
    expect(apiOriginFor('https://www.vinted.co.uk/')).toBe('https://api.vinted.co.uk');
  });

  it('builds search params and parses items', async () => {
    const { fn, calls } = mockFetch(() => ({
      items: [searchItem(10, 7, 'Playmobil moto police', 4)],
      pagination: { total_pages: 3 },
    }));
    const q = newQuery({
      text: ' playmobil ',
      priceTo: 5,
      statuses: ['2', '3'],
      catalogs: [{ id: '1499', title: 'Jeux' }],
      brands: [
        { id: '1', title: 'Playmobil' },
        { id: '2', title: 'LEGO' },
      ],
    });
    const res = await client(fn).searchItems(q, 2, 'relevance');
    const url = calls[0]!;
    expect(url.origin + url.pathname).toBe('https://api.vinted.fr/svc-catalogue/items');
    expect(url.searchParams.get('search_text')).toBe('playmobil');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('price_to')).toBe('5');
    // One comma-separated param per filter: Vinted ignores a repeated param.
    expect(url.searchParams.getAll('attribute_ids[status]')).toEqual(['2,3']);
    expect(url.searchParams.getAll('attribute_ids[brand]')).toEqual(['1,2']);
    expect(url.searchParams.getAll('attribute_ids[catalog]')).toEqual(['1499']);
    expect(url.searchParams.has('attribute_ids[size]')).toBe(false);
    expect(res.totalPages).toBe(3);
    expect(res.items[0]).toMatchObject({
      id: '10',
      url: 'https://www.vinted.fr/items/10-x',
      price: 4,
      totalPrice: 4.7,
      brand: 'Playmobil',
      size: 'Taille unique',
      status: 'Très bon état',
      sellerId: '7',
    });
    expect(res.sellers[0]).toMatchObject({
      id: '7',
      login: 'user7',
      url: 'https://www.vinted.fr/member/7',
    });
  });

  it('detects the anti-bot page', async () => {
    const { fn } = mockFetch(
      () => new Response('<!doctype html><p>Please wait</p>', { status: 403 }),
    );
    const err = await client(fn)
      .searchItems(newQuery({ text: 'x' }), 1, 'relevance')
      .catch((e) => e);
    expect(err).toBeInstanceOf(VintedError);
    expect(err.kind).toBe('challenge');
    expect(err.fatal).toBe(true);
  });

  it('retries on 429', async () => {
    let n = 0;
    const { fn } = mockFetch(() =>
      ++n < 3 ? new Response('{}', { status: 429 }) : { items: [], pagination: { total_pages: 1 } },
    );
    const c = client(fn);
    await c.searchItems(newQuery({ text: 'x' }), 1, 'relevance');
    expect(c.requests).toBe(3);
  });

  it('flattens grouped facets', async () => {
    const { fn } = mockFetch(() => ({
      options: [
        { title: 'Femmes', options: [{ id: 1, title: 'S', items_count: 3 }] },
        { id: '9', title: 'Unique' },
      ],
    }));
    const opts = await client(fn).facets('size', newQuery({ text: 'robe' }));
    expect(opts).toEqual([
      { id: '1', title: 'S', count: 3, group: 'Femmes' },
      { id: '9', title: 'Unique', count: undefined, group: undefined },
    ]);
  });
});

describe('parseSecondLine', () => {
  it('splits size and status', () => {
    expect(parseSecondLine('3-6 mois / 62 cm · Très bon état')).toEqual({
      size: '3-6 mois / 62 cm',
      status: 'Très bon état',
    });
    expect(parseSecondLine('Neuf avec étiquette')).toEqual({
      size: null,
      status: 'Neuf avec étiquette',
    });
    expect(parseSecondLine(undefined)).toEqual({ size: null, status: null });
  });
});
