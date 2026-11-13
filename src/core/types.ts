/**
 * Domain model.
 *
 * Vocabulary (UI is in French):
 *  - SearchDef  = « Recherche » : a named set of queries + settings, saved in history.
 *  - Query      = « Requête »   : one Vinted search (keywords + filters) with points and a cap.
 *  - Lot        = « Lot »       : all matching items of a single seller, scored.
 */

/** A selectable filter value (category, brand, size, color, material). */
export interface Option {
  id: string;
  title: string;
}

/** Vinted condition ids (`attribute_ids[status]`). */
export const STATUSES: readonly Option[] = [
  { id: '6', title: 'Neuf avec étiquette' },
  { id: '1', title: 'Neuf sans étiquette' },
  { id: '2', title: 'Très bon état' },
  { id: '3', title: 'Bon état' },
  { id: '4', title: 'Satisfaisant' },
];

export type FacetCode = 'brand' | 'size' | 'color' | 'material';

export interface Query {
  id: string;
  text: string;
  /** Points earned per matching item (≥ 1). */
  points: number;
  /** Max number of items counted for this query; null = unlimited. */
  max: number | null;
  /**
   * Vinted's search is fuzzy ("lego police" also returns Playmobil firefighters). When strict,
   * an item only counts if every keyword appears in its title or brand (see matching.ts).
   */
  strict: boolean;
  priceFrom: number | null;
  priceTo: number | null;
  statuses: string[];
  catalogs: Option[];
  brands: Option[];
  sizes: Option[];
  colors: Option[];
  materials: Option[];
}

export type VintedOrder = 'relevance' | 'newest_first' | 'price_low_to_high';

export interface SearchSettings {
  /** Result pages (96 items each) fetched per query. */
  pagesPerQuery: number;
  /** Number of best sellers whose full wardrobe is scanned to complete their lot. */
  deepScanTop: number;
  /** Max wardrobe pages (96 items each) scanned per seller. */
  wardrobePages: number;
  order: VintedOrder;
  excludeBusiness: boolean;
}

export interface SearchDef {
  id: string;
  name: string;
  queries: Query[];
  settings: SearchSettings;
  createdAt: number;
  updatedAt: number;
  lastRun?: RunResult;
  /** Item ids seen in previous runs, used to flag new items. */
  seenItemIds?: string[];
}

export type ItemSource = 'search' | 'wardrobe';

export interface Item {
  id: string;
  title: string;
  url: string;
  photo: string | null;
  /** Item price (without buyer protection fee). */
  price: number;
  /** Price including buyer protection fee, when known. */
  totalPrice: number | null;
  currency: string;
  brand: string | null;
  size: string | null;
  status: string | null;
  sellerId: string;
  /** Indexes of the queries this item matches. */
  matches: number[];
  source: ItemSource;
  isNew?: boolean;
}

export interface Seller {
  id: string;
  login: string;
  url: string;
  photo: string | null;
  business: boolean;
  itemCount?: number;
  feedbackCount?: number;
  /** 0..1 */
  feedbackReputation?: number;
  bundleDiscount?: string | null;
  country?: string | null;
  onHoliday?: boolean;
}

export interface Lot {
  seller: Seller;
  score: number;
  /** Items counted in the score, with the query they are assigned to. */
  counted: { item: Item; query: number }[];
  /** Matching items not counted (query cap reached). */
  extras: Item[];
  /** Number of counted items per query index. */
  fill: number[];
  price: number;
  totalPrice: number;
  deepScanned: boolean;
}

export interface RunStats {
  requests: number;
  items: number;
  sellers: number;
  durationMs: number;
}

export interface RunResult {
  at: number;
  /** Snapshot of the queries at run time (lots refer to them by index). */
  queries: { label: string; points: number; max: number | null }[];
  lots: Lot[];
  stats: RunStats;
  warnings: string[];
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function newQuery(partial: Partial<Query> = {}): Query {
  return {
    id: uid(),
    text: '',
    points: 1,
    max: null,
    strict: true,
    priceFrom: null,
    priceTo: null,
    statuses: [],
    catalogs: [],
    brands: [],
    sizes: [],
    colors: [],
    materials: [],
    ...partial,
  };
}

export const DEFAULT_SETTINGS: SearchSettings = {
  pagesPerQuery: 3,
  deepScanTop: 10,
  wardrobePages: 5,
  order: 'relevance',
  excludeBusiness: false,
};

export function newSearch(partial: Partial<SearchDef> = {}): SearchDef {
  const now = Date.now();
  return {
    id: uid(),
    name: '',
    queries: [newQuery()],
    settings: { ...DEFAULT_SETTINGS },
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

/** Human label of a query, used in badges and history. */
export function queryLabel(q: Query, index: number): string {
  return q.text.trim() || q.catalogs[0]?.title || q.brands[0]?.title || `Requête ${index + 1}`;
}
