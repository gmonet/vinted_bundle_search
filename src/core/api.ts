import type { FacetCode, Item, Option, Query, Seller, VintedOrder } from './types';

/**
 * Minimal Vinted web API client. Must run inside a www.vinted.* page (userscript or Android
 * WebView): requests reuse the page cookies and the anti-bot context. See docs/vinted-api.md.
 */

export type VintedErrorKind = 'challenge' | 'auth' | 'rate' | 'http' | 'network' | 'aborted';

export class VintedError extends Error {
  constructor(
    public kind: VintedErrorKind,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'VintedError';
  }
  /** Errors after which further requests are pointless. */
  get fatal(): boolean {
    return this.kind === 'challenge' || this.kind === 'auth' || this.kind === 'aborted';
  }
}

export interface ClientOptions {
  /** e.g. https://www.vinted.fr */
  origin: string;
  /** e.g. https://api.vinted.fr */
  apiOrigin?: string;
  fetchFn?: typeof fetch;
  /** Minimum delay between two requests, in ms. */
  minDelayMs?: number;
  maxRetries?: number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface FacetOption extends Option {
  count?: number;
  group?: string;
}

export interface CategoryOption extends Option {
  count?: number;
}

export interface Page<T> {
  items: T[];
  sellers: Seller[];
  totalPages: number;
}

export const PER_PAGE = 96;

type Params = [string, string][];

export function apiOriginFor(origin: string): string {
  const u = new URL(origin);
  return `${u.protocol}//${u.hostname.replace(/^www\./, 'api.')}`;
}

export function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new VintedError('aborted', 'Annulé'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new VintedError('aborted', 'Annulé'));
      },
      { once: true },
    );
  });
}

export class VintedClient {
  readonly origin: string;
  readonly apiOrigin: string;
  requests = 0;
  private lastRequestAt = 0;
  private readonly fetchFn: typeof fetch;
  private readonly minDelayMs: number;
  private readonly maxRetries: number;
  private readonly sleep: NonNullable<ClientOptions['sleep']>;

  constructor(opts: ClientOptions) {
    this.origin = opts.origin.replace(/\/$/, '');
    this.apiOrigin = opts.apiOrigin ?? apiOriginFor(this.origin);
    // Resolve fetch lazily: the page's anti-bot script wraps window.fetch after load.
    this.fetchFn = opts.fetchFn ?? ((...args) => globalThis.fetch(...args));
    this.minDelayMs = opts.minDelayMs ?? 350;
    this.maxRetries = opts.maxRetries ?? 3;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  async getJson<T = unknown>(base: string, params: Params, signal?: AbortSignal): Promise<T> {
    const url = new URL(base);
    for (const [k, v] of params) url.searchParams.append(k, v);
    for (let attempt = 0; ; attempt++) {
      const wait = this.lastRequestAt + this.minDelayMs - Date.now();
      if (wait > 0) await this.sleep(wait, signal);
      this.lastRequestAt = Date.now();
      this.requests++;
      let res: Response;
      try {
        res = await this.fetchFn(url.toString(), {
          credentials: 'include',
          headers: { accept: 'application/json' },
          signal,
        });
      } catch (e) {
        if (signal?.aborted) throw new VintedError('aborted', 'Annulé');
        if (attempt < this.maxRetries) {
          await this.sleep(1000 * 2 ** attempt, signal);
          continue;
        }
        throw new VintedError('network', `Erreur réseau : ${(e as Error).message}`);
      }
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < this.maxRetries) {
        await this.sleep(2000 * 2 ** attempt, signal);
        continue;
      }
      const text = await res.text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        if (res.status === 403 || /<html|<!doctype/i.test(text.slice(0, 200))) {
          throw new VintedError(
            'challenge',
            'Vinted demande une vérification anti-robot. Ferme le panneau, navigue un peu sur Vinted (ou résous la vérification) puis relance.',
            res.status,
          );
        }
        throw new VintedError('http', `Réponse inattendue (HTTP ${res.status})`, res.status);
      }
      if (res.status === 401) {
        throw new VintedError('auth', 'Session Vinted expirée : recharge la page.', 401);
      }
      if (res.status === 429)
        throw new VintedError('rate', 'Trop de requêtes, réessaie plus tard.', 429);
      if (!res.ok) throw new VintedError('http', `Erreur Vinted (HTTP ${res.status})`, res.status);
      return body as T;
    }
  }

  async searchItems(
    q: Query,
    page: number,
    order: VintedOrder,
    signal?: AbortSignal,
  ): Promise<Page<Item>> {
    const params: Params = [
      ['page', String(page)],
      ['per_page', String(PER_PAGE)],
      ['search_text', q.text.trim()],
      ['order', order],
    ];
    if (q.priceFrom != null) params.push(['price_from', String(q.priceFrom)]);
    if (q.priceTo != null) params.push(['price_to', String(q.priceTo)]);
    if (q.priceFrom != null || q.priceTo != null) params.push(['currency', 'EUR']);
    pushAttributes(params, q);
    const data = await this.getJson<RawSearch>(
      `${this.apiOrigin}/svc-catalogue/items`,
      params,
      signal,
    );
    const items: Item[] = [];
    const sellers: Seller[] = [];
    for (const raw of data.items ?? []) {
      if (!raw?.user?.id) continue;
      items.push(this.parseSearchItem(raw));
      sellers.push(this.parseSeller(raw.user));
    }
    return { items, sellers, totalPages: data.pagination?.total_pages ?? 1 };
  }

  async wardrobe(sellerId: string, page: number, signal?: AbortSignal): Promise<Page<Item>> {
    const data = await this.getJson<RawWardrobe>(
      `${this.origin}/api/v2/wardrobe/${encodeURIComponent(sellerId)}/items`,
      [
        ['page', String(page)],
        ['per_page', String(PER_PAGE)],
        ['order', 'relevance'],
      ],
      signal,
    );
    const items: Item[] = [];
    const sellers: Seller[] = [];
    for (const raw of data.items ?? []) {
      if (raw.is_closed || raw.is_reserved || raw.is_hidden || raw.is_draft) continue;
      items.push(this.parseWardrobeItem(raw, sellerId));
      if (raw.user?.id) sellers.push(this.parseSeller(raw.user));
    }
    return { items, sellers, totalPages: data.pagination?.total_pages ?? 1 };
  }

  async user(sellerId: string, signal?: AbortSignal): Promise<Partial<Seller>> {
    const data = await this.getJson<{ user?: RawUser }>(
      `${this.origin}/api/v2/users/${encodeURIComponent(sellerId)}`,
      [],
      signal,
    );
    const u = data.user;
    if (!u) return {};
    return {
      itemCount: u.item_count,
      feedbackCount: u.feedback_count,
      feedbackReputation: u.feedback_reputation,
      bundleDiscount: describeBundleDiscount(u.bundle_discount),
      country: u.country_title ?? null,
      onHoliday: !!u.is_on_holiday,
      business: !!u.business,
    };
  }

  /** Values of a filter (brand, size, …), contextual to the query text and categories. */
  async facets(code: FacetCode, q: Query, signal?: AbortSignal): Promise<FacetOption[]> {
    const params: Params = [
      ['filter_code', code],
      ['search_text', q.text.trim()],
    ];
    for (const c of q.catalogs) params.push(['attribute_ids[catalog]', c.id]);
    const data = await this.getJson<{ options?: RawFacet[] }>(
      `${this.apiOrigin}/svc-filters/filters/facets`,
      params,
      signal,
    );
    const out: FacetOption[] = [];
    const walk = (opts: RawFacet[] | undefined, group?: string) => {
      for (const o of opts ?? []) {
        if (o.options?.length) walk(o.options, o.title);
        else if (o.id != null) {
          out.push({ id: String(o.id), title: o.title, count: o.items_count, group });
        }
      }
    };
    walk(data.options);
    return out;
  }

  /** Sub-categories of `parentId` (root categories when omitted). */
  async categories(
    text: string,
    parentId?: string,
    signal?: AbortSignal,
  ): Promise<CategoryOption[]> {
    const params: Params = [['search_text', text.trim()]];
    if (parentId) params.push(['attribute_ids[catalog]', parentId]);
    const data = await this.getJson<{ categories?: RawCategory[] }>(
      `${this.apiOrigin}/svc-filters/faceted_categories`,
      params,
      signal,
    );
    return (data.categories ?? [])
      .filter((c) => String(c.id) !== parentId)
      .map((c) => ({ id: String(c.id), title: c.title, count: c.item_count }));
  }

  private abs(url: string | undefined): string {
    return url ? new URL(url, this.origin).toString() : this.origin;
  }

  private parseSeller(u: RawUser): Seller {
    const id = String(u.id);
    return {
      id,
      login: u.login ?? id,
      url: u.profile_url ? this.abs(u.profile_url) : `${this.origin}/member/${id}`,
      photo: pickPhoto(u.photo),
      business: !!u.business,
    };
  }

  private parseSearchItem(raw: RawSearchItem): Item {
    const { size, status } = parseSecondLine(raw.item_box?.second_line);
    return {
      id: String(raw.id),
      title: raw.title ?? '',
      url: this.abs(raw.url),
      photo: pickPhoto(raw.photo ?? raw.photos?.[0]),
      price: toNumber(raw.price),
      totalPrice: raw.total_item_price ? toNumber(raw.total_item_price) : null,
      currency: raw.price?.currency_code ?? 'EUR',
      brand: raw.item_box?.first_line || null,
      size,
      status,
      sellerId: String(raw.user!.id),
      matches: [],
      source: 'search',
    };
  }

  private parseWardrobeItem(raw: RawWardrobeItem, sellerId: string): Item {
    return {
      id: String(raw.id),
      title: raw.title ?? '',
      url: this.abs(raw.url ?? raw.path),
      photo: pickPhoto(raw.photos?.[0]),
      price: toNumber(raw.price),
      totalPrice: raw.total_item_price ? toNumber(raw.total_item_price) : null,
      currency: raw.price?.currency_code ?? raw.currency ?? 'EUR',
      brand: (typeof raw.brand === 'string' ? raw.brand : raw.brand?.title) || null,
      size: (typeof raw.size === 'string' ? raw.size : raw.size?.title) || null,
      status: (typeof raw.status === 'string' ? raw.status : raw.status?.title) || null,
      sellerId: raw.user?.id ? String(raw.user.id) : sellerId,
      matches: [],
      source: 'wardrobe',
    };
  }
}

function pushAttributes(params: Params, q: Query) {
  for (const c of q.catalogs) params.push(['attribute_ids[catalog]', c.id]);
  for (const b of q.brands) params.push(['attribute_ids[brand]', b.id]);
  for (const s of q.statuses) params.push(['attribute_ids[status]', s]);
  for (const s of q.sizes) params.push(['attribute_ids[size]', s.id]);
  for (const c of q.colors) params.push(['attribute_ids[color]', c.id]);
  for (const m of q.materials) params.push(['attribute_ids[material]', m.id]);
}

const STATUS_WORDS = /neuf|état|etat|satisfaisant/i;

/** "3-6 mois / 62 cm · Très bon état" -> size + status */
export function parseSecondLine(line: string | undefined): {
  size: string | null;
  status: string | null;
} {
  if (!line) return { size: null, status: null };
  const parts = line
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean);
  const statusIdx = parts.findIndex((p) => STATUS_WORDS.test(p));
  const status = statusIdx >= 0 ? parts[statusIdx]! : null;
  const rest = parts.filter((_, i) => i !== statusIdx);
  return { size: rest[0] ?? null, status };
}

function toNumber(p: { amount?: string | number } | undefined): number {
  const n = Number(p?.amount);
  return Number.isFinite(n) ? n : 0;
}

function pickPhoto(photo: RawPhoto | null | undefined): string | null {
  if (!photo) return null;
  const thumbs = photo.thumbnails ?? [];
  const mid = thumbs.find((t) => /310x430|300x400|310/.test(t.type ?? ''));
  return mid?.url ?? photo.url ?? thumbs[thumbs.length - 1]?.url ?? null;
}

function describeBundleDiscount(d: RawUser['bundle_discount']): string | null {
  if (!d || d.enabled === false) return null;
  const tiers = d.discounts ?? [];
  if (tiers.length === 0) return 'Réduction lot';
  return tiers
    .filter((t) => Number(t.fraction) > 0)
    .map((t) => `${t.minimal_item_count}+ : -${Math.round(Number(t.fraction) * 100)} %`)
    .join(', ');
}

// ---- Raw API shapes (only the fields we use) ----

interface RawPhoto {
  url?: string;
  thumbnails?: { type?: string; url?: string }[];
}
interface RawUser {
  id: number | string;
  login?: string;
  profile_url?: string;
  photo?: RawPhoto | null;
  business?: boolean;
  item_count?: number;
  feedback_count?: number;
  feedback_reputation?: number;
  is_on_holiday?: boolean;
  country_title?: string;
  bundle_discount?: {
    enabled?: boolean;
    discounts?: { minimal_item_count: number; fraction: string | number }[];
  } | null;
}
interface RawPrice {
  amount?: string | number;
  currency_code?: string;
}
interface RawSearchItem {
  id: number | string;
  title?: string;
  url?: string;
  photo?: RawPhoto;
  photos?: RawPhoto[];
  price?: RawPrice;
  total_item_price?: RawPrice;
  user?: RawUser;
  item_box?: { first_line?: string; second_line?: string };
}
interface RawSearch {
  items?: RawSearchItem[];
  pagination?: { total_pages?: number };
}
type Titled = string | { title?: string } | null | undefined;
interface RawWardrobeItem {
  id: number | string;
  title?: string;
  url?: string;
  path?: string;
  photos?: RawPhoto[];
  price?: RawPrice;
  currency?: string;
  total_item_price?: RawPrice;
  user?: RawUser;
  brand?: Titled;
  size?: Titled;
  status?: Titled;
  is_closed?: boolean;
  is_reserved?: boolean;
  is_hidden?: boolean;
  is_draft?: boolean;
}
interface RawWardrobe {
  items?: RawWardrobeItem[];
  pagination?: { total_pages?: number };
}
interface RawFacet {
  id?: string | number;
  title: string;
  items_count?: number;
  options?: RawFacet[];
}
interface RawCategory {
  id: string | number;
  title: string;
  item_count?: number;
}
