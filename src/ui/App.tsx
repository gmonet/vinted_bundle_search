import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { VintedClient } from '../core/api';
import { collectSeenIds, runSearch, type Progress } from '../core/engine';
import { History, migrate } from '../core/storage';
import { newSearch, queryLabel, type SearchDef } from '../core/types';
import type { Platform } from '../platform';
import { Editor } from './Editor';
import { HistoryView } from './HistoryView';
import { Results } from './Results';

export interface AppHandle {
  open(): void;
  close(): void;
  toggle(): void;
  /** Android back button: returns true when the UI consumed the event. */
  handleBack(): boolean;
}

type Tab = 'editor' | 'results' | 'history';

const DRAFT_KEY = 'draft.v1';
const OPEN_KEY = 'vbs:open';

export interface RunState {
  progress: Progress | null;
  abort: AbortController;
}

export function App({ platform, handle }: { platform: Platform; handle: AppHandle }) {
  const history = useMemo(() => new History(platform.store), [platform]);
  const client = useMemo(() => new VintedClient({ origin: location.origin }), []);

  const [open, setOpen] = useState(() => {
    const saved = sessionStorage.getItem(OPEN_KEY);
    return saved ? saved === '1' : platform.kind === 'android';
  });
  const [tab, setTab] = useState<Tab>('editor');
  const [draft, setDraft] = useState<SearchDef>(() => loadDraft(platform) ?? newSearch());
  const [run, setRun] = useState<RunState | null>(null);
  // Closes the open modal, if any (Android back button). Stored wrapped: a bare function passed
  // to a state setter would be called as an updater.
  const [overlay, setOverlayState] = useState<(() => void) | null>(null);
  const setOverlay = (close: (() => void) | null) => setOverlayState(() => close);

  useEffect(() => sessionStorage.setItem(OPEN_KEY, open ? '1' : '0'), [open]);
  useEffect(() => {
    const t = setTimeout(() => platform.store.set(DRAFT_KEY, JSON.stringify(draft)), 300);
    return () => clearTimeout(t);
  }, [draft, platform]);

  // Imperative API used by main.tsx / the Android app.
  const state = useRef({ open, tab, overlay });
  state.current = { open, tab, overlay };
  Object.assign(handle, {
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen((o) => !o),
    handleBack: () => {
      const s = state.current;
      if (!s.open) return false;
      if (s.overlay) s.overlay();
      else if (s.tab !== 'editor') setTab('editor');
      else setOpen(false);
      return true;
    },
  } satisfies AppHandle);

  const launch = async (def: SearchDef) => {
    if (run) return;
    const abort = new AbortController();
    setRun({ progress: null, abort });
    setTab('results');
    const name = def.name.trim() || def.queries.map(queryLabel).filter(Boolean).join(' + ');
    const base: SearchDef = { ...def, name, updatedAt: Date.now() };
    setDraft(base);
    try {
      const result = await runSearch(base, client, {
        signal: abort.signal,
        onProgress: (progress) => setRun({ progress, abort }),
      });
      const saved: SearchDef = {
        ...base,
        lastRun: result,
        seenItemIds: collectSeenIds(base.seenItemIds, result),
        updatedAt: Date.now(),
      };
      history.save(saved);
      setDraft(saved);
    } catch (e) {
      console.error('[vbs] run failed', e);
      setDraft({
        ...base,
        lastRun: {
          at: Date.now(),
          queries: [],
          lots: [],
          stats: { requests: 0, items: 0, sellers: 0, durationMs: 0 },
          warnings: [`Erreur inattendue : ${(e as Error).message}`],
        },
      });
    } finally {
      setRun(null);
    }
  };

  if (!open) {
    return (
      <button class="fab" onClick={() => setOpen(true)} title="Recherche de lots">
        <span aria-hidden="true">▦</span> Lots
      </button>
    );
  }

  return (
    <div class="backdrop" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div class="panel" role="dialog" aria-label="Recherche de lots">
        <header class="topbar">
          <nav class="tabs">
            <TabButton id="editor" cur={tab} set={setTab}>
              Recherche
            </TabButton>
            <TabButton id="results" cur={tab} set={setTab}>
              Résultats{run ? ' …' : draft.lastRun ? ` (${draft.lastRun.lots.length})` : ''}
            </TabButton>
            <TabButton id="history" cur={tab} set={setTab}>
              Historique
            </TabButton>
          </nav>
          <button class="icon-btn" onClick={() => setOpen(false)} title="Fermer (revenir à Vinted)">
            ✕
          </button>
        </header>
        <main class="content">
          {tab === 'editor' && (
            <Editor
              def={draft}
              onChange={setDraft}
              onRun={() => launch(draft)}
              onNew={() => setDraft(newSearch())}
              running={!!run}
              client={client}
              setOverlay={setOverlay}
            />
          )}
          {tab === 'results' && (
            <Results
              def={draft}
              run={run}
              platform={platform}
              onEdit={() => setTab('editor')}
              onRerun={() => launch(draft)}
            />
          )}
          {tab === 'history' && (
            <HistoryView
              history={history}
              platform={platform}
              currentId={draft.id}
              running={!!run}
              onOpen={(d) => {
                setDraft(d);
                setTab(d.lastRun ? 'results' : 'editor');
              }}
              onEdit={(d) => {
                setDraft(d);
                setTab('editor');
              }}
              onRun={(d) => launch(d)}
            />
          )}
        </main>
        <footer class="footer">
          v{platform.version} · {platform.kind === 'android' ? 'Android' : 'navigateur'}
        </footer>
      </div>
    </div>
  );
}

function TabButton(props: {
  id: Tab;
  cur: Tab;
  set: (t: Tab) => void;
  children: ComponentChildren;
}) {
  return (
    <button
      class={'tab' + (props.cur === props.id ? ' active' : '')}
      onClick={() => props.set(props.id)}
    >
      {props.children}
    </button>
  );
}

function loadDraft(platform: Platform): SearchDef | null {
  try {
    const raw = platform.store.get(DRAFT_KEY);
    return raw ? migrate(JSON.parse(raw) as SearchDef) : null;
  } catch {
    return null;
  }
}
