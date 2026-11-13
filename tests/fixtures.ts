/** Small synthetic Vinted API responses, shaped like the real ones (see docs/vinted-api.md). */

export function searchItem(id: number, userId: number, title: string, price: number) {
  return {
    id,
    title,
    url: `/items/${id}-x`,
    photo: { url: `https://img/${id}.webp`, thumbnails: [] },
    price: { amount: price.toFixed(2), currency_code: 'EUR' },
    total_item_price: { amount: (price + 0.7).toFixed(2), currency_code: 'EUR' },
    user: { id: userId, login: `user${userId}`, business: false },
    item_box: { first_line: title.split(' ')[0], second_line: 'Taille unique · Très bon état' },
  };
}

export function wardrobeItem(id: number, userId: number, title: string, price: number, extra = {}) {
  return {
    id,
    title,
    url: `https://www.vinted.fr/items/${id}-x`,
    photos: [{ url: `https://img/${id}.webp` }],
    price: { amount: String(price), currency_code: 'EUR' },
    user: { id: userId, login: `user${userId}`, business: false },
    brand: 'Playmobil',
    size: 'Taille unique',
    status: 'Bon état',
    is_closed: false,
    is_reserved: false,
    ...extra,
  };
}

export type Route = (url: URL) => unknown | Response;

/** fetch() mock routing on pathname; returns JSON bodies. */
export function mockFetch(route: Route) {
  const calls: URL[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    calls.push(url);
    const body = route(url);
    if (body instanceof Response) return body;
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  return { fn, calls };
}

export const noSleep = async () => {};
