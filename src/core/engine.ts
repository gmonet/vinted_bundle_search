import { PER_PAGE, VintedError, type VintedClient } from './api';
import { localMatch, statusMatches, textMatches } from './matching';
import { buildLot, sortLots } from './scoring';
import {
  queryLabel,
  type Item,
  type Lot,
  type RunResult,
  type SearchDef,
  type Seller,
} from './types';

export interface Progress {
  phase: 'search' | 'deep' | 'profiles' | 'done';
  done: number;
  total: number;
  message: string;
}

export interface RunOptions {
  signal?: AbortSignal;
  onProgress?: (p: Progress) => void;
  /** Number of lots kept in the result (and in history). */
  keepLots?: number;
}

/**
 * Runs a multi-query search:
 *  1. one Vinted search per query (several pages) — items are merged by id;
 *  2. items are grouped by seller and each lot is scored (see scoring.ts);
 *  3. the best sellers' wardrobes are scanned to find more matching items (local matching);
 *  4. the best sellers' profiles are fetched (ratings, bundle discount).
 *
 * A fatal error (anti-bot challenge, expired session, cancel) stops the requests but still
 * returns the partial result, with a warning.
 */
export async function runSearch(
  def: SearchDef,
  client: VintedClient,
  opts: RunOptions = {},
): Promise<RunResult> {
  const { signal, onProgress } = opts;
  const keepLots = opts.keepLots ?? 60;
  const started = Date.now();
  const startRequests = client.requests;
  const { settings } = def;
  const queries = def.queries.filter((q) => q.text.trim() || q.catalogs.length || q.brands.length);
  const warnings: string[] = [];
  const items = new Map<string, Item>();
  const sellers = new Map<string, Seller>();
  const previouslySeen = def.seenItemIds?.length ? new Set(def.seenItemIds) : null;
  let stopped = false;

  const total =
    queries.length * settings.pagesPerQuery +
    settings.deepScanTop * Math.min(settings.wardrobePages, 2) +
    settings.deepScanTop;
  let done = 0;
  const progress = (phase: Progress['phase'], message: string) =>
    onProgress?.({ phase, done, total: Math.max(total, done), message });

  const handle = (e: unknown, context: string) => {
    if (e instanceof VintedError && e.fatal) {
      stopped = true;
      warnings.push(e.kind === 'aborted' ? 'Recherche interrompue.' : e.message);
    } else {
      warnings.push(`${context} : ${(e as Error).message}`);
    }
  };

  const addItem = (item: Item, matches: number[]) => {
    const existing = items.get(item.id);
    if (existing) {
      for (const m of matches) if (!existing.matches.includes(m)) existing.matches.push(m);
      return;
    }
    if (matches.length === 0) return;
    item.matches = [...matches];
    if (previouslySeen && !previouslySeen.has(item.id)) item.isNew = true;
    items.set(item.id, item);
  };

  const localMatches = (item: Item) => queries.flatMap((q, i) => (localMatch(item, q) ? [i] : []));

  // 1. Searches
  for (const [qi, q] of queries.entries()) {
    for (let page = 1; page <= settings.pagesPerQuery && !stopped; page++) {
      progress('search', `« ${queryLabel(q, qi)} » — page ${page}`);
      try {
        const res = await client.searchItems(q, page, settings.order, signal);
        done++;
        for (const s of res.sellers) if (!sellers.has(s.id)) sellers.set(s.id, s);
        for (const it of res.items) {
          if (q.strict && !textMatches(q.text, `${it.title} ${it.brand ?? ''}`)) continue;
          // Safety net: Vinted silently ignores a filter it does not understand.
          if (it.status && !statusMatches(it.status, q)) continue;
          addItem(it, [qi]);
        }
        if (res.items.length < PER_PAGE || page >= res.totalPages) {
          done += settings.pagesPerQuery - page;
          break;
        }
      } catch (e) {
        handle(e, `Requête « ${queryLabel(q, qi)} »`);
        break;
      }
    }
    if (stopped) break;
  }

  // An item found by query A may also match query B (e.g. "lego police" vs "lego").
  for (const it of items.values()) addItem(it, localMatches(it));

  const computeLots = (): Lot[] => {
    const bySeller = new Map<string, Item[]>();
    for (const it of items.values()) {
      const list = bySeller.get(it.sellerId);
      if (list) list.push(it);
      else bySeller.set(it.sellerId, [it]);
    }
    const lots: Lot[] = [];
    for (const [sid, list] of bySeller) {
      const seller = sellers.get(sid);
      if (!seller || (settings.excludeBusiness && seller.business)) continue;
      lots.push(buildLot(seller, list, queries));
    }
    return sortLots(lots);
  };

  // 2-3. Deep scan of the best sellers' wardrobes
  const deepScanned = new Set<string>();
  if (!stopped && settings.deepScanTop > 0) {
    const top = computeLots().slice(0, settings.deepScanTop);
    for (const [i, lot] of top.entries()) {
      if (stopped) break;
      const sid = lot.seller.id;
      for (let page = 1; page <= settings.wardrobePages && !stopped; page++) {
        progress('deep', `Dressing de ${lot.seller.login} (${i + 1}/${top.length})`);
        try {
          const res = await client.wardrobe(sid, page, signal);
          if (page <= 2) done++;
          for (const it of res.items) addItem(it, localMatches(it));
          if (res.items.length === 0 || page >= res.totalPages) break;
        } catch (e) {
          handle(e, `Dressing de ${lot.seller.login}`);
          break;
        }
      }
      deepScanned.add(sid);
    }
  }

  // 4. Profiles of the best sellers
  let lots = computeLots();
  if (!stopped && settings.deepScanTop > 0) {
    for (const lot of lots.slice(0, settings.deepScanTop)) {
      if (stopped) break;
      progress('profiles', `Profil de ${lot.seller.login}`);
      try {
        Object.assign(lot.seller, await client.user(lot.seller.id, signal));
        done++;
      } catch (e) {
        handle(e, `Profil de ${lot.seller.login}`);
      }
    }
    if (settings.excludeBusiness) lots = lots.filter((l) => !l.seller.business);
  }
  for (const lot of lots) lot.deepScanned = deepScanned.has(lot.seller.id);

  done = total;
  progress('done', 'Terminé');

  return {
    at: Date.now(),
    queries: queries.map((q, i) => ({ label: queryLabel(q, i), points: q.points, max: q.max })),
    lots: lots.slice(0, keepLots),
    stats: {
      requests: client.requests - startRequests,
      items: items.size,
      sellers: new Set([...items.values()].map((i) => i.sellerId)).size,
      durationMs: Date.now() - started,
    },
    warnings,
  };
}

/** Ids to remember for the "new" badge on the next run (bounded). */
export function collectSeenIds(prev: string[] | undefined, run: RunResult, limit = 5000): string[] {
  const ids = new Set(prev ?? []);
  for (const lot of run.lots) {
    for (const c of lot.counted) ids.add(c.item.id);
    for (const e of lot.extras) ids.add(e.id);
  }
  return [...ids].slice(-limit);
}
