import { DEFAULT_SETTINGS, newQuery, type SearchDef } from './types';

/** Synchronous key/value store (localStorage, Android bridge, in-memory for tests). */
export interface KVStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function memoryStore(): KVStore {
  const m = new Map<string, string>();
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => void m.set(k, v),
    remove: (k) => void m.delete(k),
  };
}

export function localStorageStore(prefix = 'vbs:'): KVStore {
  return {
    get: (k) => {
      try {
        return localStorage.getItem(prefix + k);
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        localStorage.setItem(prefix + k, v);
      } catch (e) {
        console.warn('[vbs] localStorage write failed', e);
      }
    },
    remove: (k) => {
      try {
        localStorage.removeItem(prefix + k);
      } catch {
        /* ignore */
      }
    },
  };
}

const HISTORY_KEY = 'history.v1';
const MAX_SEARCHES = 50;

export interface ExportFile {
  app: 'vinted-bundle-search';
  version: 1;
  exportedAt: number;
  searches: SearchDef[];
}

/** Saved searches ("Historique"), most recently updated first. */
export class History {
  constructor(private readonly kv: KVStore) {}

  list(): SearchDef[] {
    const raw = this.kv.get(HISTORY_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as SearchDef[];
      return Array.isArray(parsed) ? parsed.map(migrate) : [];
    } catch {
      return [];
    }
  }

  get(id: string): SearchDef | undefined {
    return this.list().find((s) => s.id === id);
  }

  save(def: SearchDef): void {
    const others = this.list().filter((s) => s.id !== def.id);
    this.write([def, ...others]);
  }

  remove(id: string): void {
    this.write(this.list().filter((s) => s.id !== id));
  }

  export(): string {
    const file: ExportFile = {
      app: 'vinted-bundle-search',
      version: 1,
      exportedAt: Date.now(),
      searches: this.list(),
    };
    return JSON.stringify(file);
  }

  /** Merges an export into the history; returns the number of imported searches. */
  import(json: string): number {
    const data = JSON.parse(json) as Partial<ExportFile> | SearchDef[];
    const incoming = Array.isArray(data) ? data : data.searches;
    if (!Array.isArray(incoming)) throw new Error('Fichier invalide');
    const byId = new Map(this.list().map((s) => [s.id, s]));
    for (const s of incoming) {
      if (!s || typeof s.id !== 'string' || !Array.isArray(s.queries)) continue;
      const cur = byId.get(s.id);
      if (!cur || cur.updatedAt <= s.updatedAt) byId.set(s.id, migrate(s));
    }
    this.write([...byId.values()]);
    return incoming.length;
  }

  private write(list: SearchDef[]): void {
    const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SEARCHES);
    this.kv.set(HISTORY_KEY, JSON.stringify(sorted));
  }
}

/** Fills fields added after a search was saved, so old history entries keep working. */
export function migrate(s: SearchDef): SearchDef {
  return {
    ...s,
    name: s.name ?? '',
    settings: { ...DEFAULT_SETTINGS, ...s.settings },
    queries: s.queries.map((q) => newQuery(q)),
  };
}
