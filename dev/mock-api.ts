/**
 * Fake Vinted API for UI development (`npm run dev` → http://localhost:8642/).
 * Patches window.fetch before the app loads; data is deterministic pseudo-random.
 * Shapes mirror docs/vinted-api.md. Add `?challenge` to the page URL to simulate the anti-bot.
 */

let seed = 42;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const pick = <T>(a: readonly T[]): T => a[Math.floor(rand() * a.length)]!;

const WORDS = [
  'moto',
  'voiture',
  'camion',
  'lot',
  'figurine',
  'hélicoptère',
  'bateau',
  'maison',
  'station',
  'set',
];
const STATUSES = [
  'Neuf avec étiquette',
  'Neuf sans étiquette',
  'Très bon état',
  'Bon état',
  'Satisfaisant',
];
const SELLERS = Array.from({ length: 30 }, (_, i) => ({
  id: 1000 + i,
  login: `vendeur_${['alice', 'bob', 'chloe', 'dan', 'eva', 'fred'][i % 6]}${i}`,
}));

const TOYS = ['🚓', '🚔', '👮', '🚁', '🚒', '🏍️', '🚨', '🧸', '🏰', '🚂'];

function photo(id: number) {
  const hue = (id * 47) % 360;
  const toy = TOYS[id % TOYS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="310" height="430"><rect width="100%" height="100%" fill="hsl(${hue},40%,82%)"/><text x="50%" y="56%" font-size="150" text-anchor="middle">${toy}</text></svg>`;
  return { url: `data:image/svg+xml,${encodeURIComponent(svg)}`, thumbnails: [] };
}

const STATUS_IDS: Record<string, string> = {
  '6': 'Neuf avec étiquette',
  '1': 'Neuf sans étiquette',
  '2': 'Très bon état',
  '3': 'Bon état',
  '4': 'Satisfaisant',
};

/** Search filters honoured by the fake API (so screenshots stay consistent). */
interface Filters {
  statuses: string[];
  priceFrom: number;
  priceTo: number;
}
const NO_FILTERS: Filters = { statuses: STATUSES, priceFrom: 1, priceTo: 15 };

function item(id: number, text: string, sellerIdx: number, f: Filters = NO_FILTERS) {
  const s = SELLERS[sellerIdx]!;
  const words = text.trim() ? text.trim().split(/\s+/) : ['article'];
  const title = [...words.map((w) => w[0]!.toUpperCase() + w.slice(1)), pick(WORDS)].join(' ');
  const price = Math.round((f.priceFrom + rand() * (f.priceTo - f.priceFrom)) * 2) / 2;
  return {
    id,
    title,
    url: `/items/${id}-mock`,
    photo: photo(id),
    price: { amount: price.toFixed(2), currency_code: 'EUR' },
    total_item_price: { amount: (price * 1.05 + 0.7).toFixed(2), currency_code: 'EUR' },
    user: { id: s.id, login: s.login, business: sellerIdx % 11 === 0 },
    item_box: { first_line: words[0], second_line: `Taille unique · ${pick(f.statuses)}` },
  };
}

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

const routes: Record<string, (u: URL) => unknown> = {
  '/svc-catalogue/items': (u) => {
    const text = u.searchParams.get('search_text') ?? '';
    const page = Number(u.searchParams.get('page') ?? 1);
    seed = hash(text) + page;
    const n = page < 3 ? 96 : 40;
    const statusIds = u.searchParams.getAll('attribute_ids[status]');
    const f: Filters = {
      statuses: statusIds.length ? statusIds.map((id) => STATUS_IDS[id]!) : STATUSES,
      priceFrom: Number(u.searchParams.get('price_from') ?? 1),
      priceTo: Number(u.searchParams.get('price_to') ?? 15),
    };
    // A few sellers get most items so that bundles emerge.
    const items = Array.from({ length: n }, (_, i) =>
      item(
        (hash(text) % 100000) + page * 1000 + i,
        rand() < 0.15 ? 'playmobil pompier' : text,
        Math.floor(rand() ** 2.5 * SELLERS.length),
        f,
      ),
    );
    return { items, pagination: { current_page: page, total_pages: 3, per_page: 96 } };
  },
  '/svc-filters/filters/facets': (u) => {
    const code = u.searchParams.get('filter_code');
    if (code === 'size')
      return {
        options: [
          {
            title: 'Enfants',
            options: [
              { id: 1, title: '4 ans' },
              { id: 2, title: '6 ans' },
            ],
          },
          { id: 3, title: 'Taille unique', items_count: 1200 },
        ],
      };
    const names: Record<string, string[]> = {
      brand: ['Playmobil', 'LEGO', 'Playmobil 1.2.3', 'Duplo', 'Kinder', 'Mattel'],
      color: ['Noir', 'Blanc', 'Bleu', 'Rouge', 'Vert'],
      material: ['Plastique', 'Bois', 'Métal'],
    };
    return {
      options: (names[code ?? ''] ?? []).map((t, i) => ({
        id: String(100 + i),
        title: t,
        items_count: 1000 - i * 90,
      })),
    };
  },
  '/svc-filters/faceted_categories': (u) => {
    const parent = u.searchParams.get('attribute_ids[catalog]');
    const tree: Record<string, string[]> = {
      '': ['Enfants', 'Maison', 'Loisirs et collections'],
      Enfants: ['Jeux et jouets', 'Vêtements pour garçons'],
      'Jeux et jouets': ['Figurines', 'Jeux de construction'],
    };
    const titleOf = (id: string) =>
      Object.values(tree)
        .flat()
        .find((t) => String(hash(t)) === id) ?? '';
    const children = tree[parent ? titleOf(parent) : ''] ?? [];
    return {
      categories: children.map((t) => ({ id: String(hash(t)), title: t, item_count: 5000 })),
    };
  },
};

function wardrobe(u: URL) {
  const sid = Number(u.pathname.split('/')[4]);
  const idx = SELLERS.findIndex((s) => s.id === sid);
  seed = sid;
  const items = Array.from({ length: 30 }, (_, i) => {
    const it = item(sid * 100 + i, pick(['playmobil police', 'lego police', 'robe', 'livre']), idx);
    return {
      ...it,
      photos: [it.photo],
      brand: it.item_box.first_line,
      status: pick(STATUSES),
      size: 'Taille unique',
      is_reserved: i === 3,
    };
  });
  return { items, pagination: { total_pages: 1 } };
}

function user(u: URL) {
  const sid = Number(u.pathname.split('/')[4]);
  seed = sid;
  return {
    user: {
      id: sid,
      item_count: Math.floor(rand() * 300),
      feedback_count: Math.floor(rand() * 200),
      feedback_reputation: 0.8 + rand() * 0.2,
      country_title: 'France',
      is_on_holiday: sid % 13 === 0,
      bundle_discount:
        sid % 3 === 0
          ? {
              enabled: true,
              discounts: [
                { minimal_item_count: 2, fraction: '0.1' },
                { minimal_item_count: 5, fraction: '0.2' },
              ],
            }
          : null,
    },
  };
}

const realFetch = window.fetch.bind(window);
const challenge = new URLSearchParams(location.search).has('challenge');
window.fetch = async (input, init) => {
  const u = new URL(String(input instanceof Request ? input.url : input), location.href);
  const handler =
    routes[u.pathname] ??
    (u.pathname.startsWith('/api/v2/wardrobe/')
      ? wardrobe
      : u.pathname.startsWith('/api/v2/users/')
        ? user
        : null);
  if (!handler) return realFetch(input, init);
  await new Promise((r) => setTimeout(r, 120));
  if (challenge && u.pathname === '/svc-catalogue/items' && u.searchParams.get('page') === '2') {
    return new Response('<!doctype html><p>Please wait</p>', { status: 403 });
  }
  return new Response(JSON.stringify(handler(u)), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
console.log('[vbs-dev] mock Vinted API installed');
