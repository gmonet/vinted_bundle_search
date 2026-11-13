import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { CategoryOption, FacetOption, VintedClient } from '../core/api';
import { normalize } from '../core/matching';
import type { FacetCode, Option, Query } from '../core/types';

function Modal(props: {
  title: string;
  onClose: () => void;
  footer: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal" role="dialog" aria-label={props.title}>
        <header class="modal-head">
          <b>{props.title}</b>
          <button class="icon-btn" onClick={props.onClose} aria-label="Fermer">
            ✕
          </button>
        </header>
        <div class="modal-body">{props.children}</div>
        <footer class="modal-foot">{props.footer}</footer>
      </div>
    </div>
  );
}

function useToggleSet(initial: Option[]) {
  const [sel, setSel] = useState<Map<string, Option>>(() => new Map(initial.map((o) => [o.id, o])));
  const toggle = (o: Option) =>
    setSel((m) => {
      const n = new Map(m);
      if (n.has(o.id)) n.delete(o.id);
      else n.set(o.id, { id: o.id, title: o.title });
      return n;
    });
  return [sel, toggle] as const;
}

export function FacetPicker(props: {
  client: VintedClient;
  code: FacetCode;
  title: string;
  query: Query;
  selected: Option[];
  onClose: () => void;
  onDone: (opts: Option[]) => void;
}) {
  const [options, setOptions] = useState<FacetOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [sel, toggle] = useToggleSet(props.selected);

  useEffect(() => {
    const ctl = new AbortController();
    props.client
      .facets(props.code, props.query, ctl.signal)
      .then(setOptions)
      .catch((e) => !ctl.signal.aborted && setError((e as Error).message));
    return () => ctl.abort();
  }, []);

  const visible = useMemo(() => {
    const f = normalize(filter);
    const all = options ?? [];
    // Keep already-selected values visible even if Vinted no longer suggests them.
    const extra = props.selected.filter((s) => !all.some((o) => o.id === s.id));
    return [...extra, ...all].filter((o) => !f || normalize(o.title).includes(f));
  }, [options, filter]);

  let lastGroup: string | undefined;
  return (
    <Modal
      title={props.title}
      onClose={props.onClose}
      footer={
        <button class="btn primary wide" onClick={() => props.onDone([...sel.values()])}>
          Valider ({sel.size})
        </button>
      }
    >
      <input
        class="wide-input"
        placeholder="Filtrer…"
        value={filter}
        onInput={(e) => setFilter(e.currentTarget.value)}
      />
      {props.code === 'brand' && (
        <p class="hint">
          Les marques proposées dépendent des mots-clés et catégories de la requête.
        </p>
      )}
      {error && <p class="warn">{error}</p>}
      {!options && !error && <p class="hint">Chargement…</p>}
      <ul class="opt-list">
        {visible.map((o) => {
          const g = (o as FacetOption).group;
          const header = g && g !== lastGroup ? <li class="opt-group">{g}</li> : null;
          lastGroup = g;
          return (
            <>
              {header}
              <li key={o.id}>
                <label class="opt">
                  <input type="checkbox" checked={sel.has(o.id)} onChange={() => toggle(o)} />
                  <span class="grow">{o.title}</span>
                  {(o as FacetOption).count != null && (
                    <span class="count">{(o as FacetOption).count}</span>
                  )}
                </label>
              </li>
            </>
          );
        })}
      </ul>
    </Modal>
  );
}

export function CategoryPicker(props: {
  client: VintedClient;
  query: Query;
  selected: Option[];
  onClose: () => void;
  onDone: (opts: Option[]) => void;
}) {
  const [path, setPath] = useState<Option[]>([]);
  const [children, setChildren] = useState<CategoryOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, toggle] = useToggleSet(props.selected);
  const parent = path[path.length - 1];

  useEffect(() => {
    const ctl = new AbortController();
    setChildren(null);
    setError(null);
    props.client
      .categories(props.query.text, parent?.id, ctl.signal)
      .then(setChildren)
      .catch((e) => !ctl.signal.aborted && setError((e as Error).message));
    return () => ctl.abort();
  }, [parent?.id]);

  return (
    <Modal
      title="Catégorie"
      onClose={props.onClose}
      footer={
        <button class="btn primary wide" onClick={() => props.onDone([...sel.values()])}>
          Valider ({sel.size})
        </button>
      }
    >
      <nav class="crumbs">
        <button class="link" onClick={() => setPath([])}>
          Toutes
        </button>
        {path.map((p, i) => (
          <>
            {' › '}
            <button class="link" onClick={() => setPath(path.slice(0, i + 1))}>
              {p.title}
            </button>
          </>
        ))}
      </nav>
      {parent && (
        <label class="opt current">
          <input type="checkbox" checked={sel.has(parent.id)} onChange={() => toggle(parent)} />
          <span class="grow">Tout « {parent.title} »</span>
        </label>
      )}
      {error && <p class="warn">{error}</p>}
      {!children && !error && <p class="hint">Chargement…</p>}
      {children?.length === 0 && <p class="hint">Pas de sous-catégorie.</p>}
      <ul class="opt-list">
        {children?.map((c) => (
          <li key={c.id} class="opt">
            <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c)} />
            <button class="link grow left" onClick={() => setPath([...path, c])}>
              {c.title}
            </button>
            {c.count != null && <span class="count">{c.count}</span>}
            <button class="icon-btn" onClick={() => setPath([...path, c])} aria-label="Ouvrir">
              ›
            </button>
          </li>
        ))}
      </ul>
      {sel.size > 0 && (
        <div class="chips">
          {[...sel.values()].map((o) => (
            <span key={o.id} class="chip sel">
              {o.title}
              <button onClick={() => toggle(o)}>×</button>
            </span>
          ))}
        </div>
      )}
    </Modal>
  );
}
