import { useEffect, useState } from 'preact/hooks';
import type { VintedClient } from '../core/api';
import {
  newQuery,
  STATUSES,
  type FacetCode,
  type Option,
  type Query,
  type SearchDef,
  type SearchSettings,
} from '../core/types';
import { queryColor } from './format';
import { CategoryPicker, FacetPicker } from './Pickers';

interface Props {
  def: SearchDef;
  onChange: (d: SearchDef) => void;
  onRun: () => void;
  onNew: () => void;
  running: boolean;
  client: VintedClient;
  setOverlay: (close: (() => void) | null) => void;
}

type PickerState =
  | { kind: 'category'; queryIndex: number }
  | { kind: 'facet'; code: FacetCode; queryIndex: number }
  | null;

const FACETS: {
  code: FacetCode;
  key: 'brands' | 'sizes' | 'colors' | 'materials';
  label: string;
}[] = [
  { code: 'brand', key: 'brands', label: 'Marque' },
  { code: 'size', key: 'sizes', label: 'Taille' },
  { code: 'color', key: 'colors', label: 'Couleur' },
  { code: 'material', key: 'materials', label: 'Matière' },
];

export function Editor({ def, onChange, onRun, onNew, running, client, setOverlay }: Props) {
  const [picker, setPicker] = useState<PickerState>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => setOverlay(picker ? () => setPicker(null) : null), [picker]);

  const setQuery = (i: number, q: Query) =>
    onChange({ ...def, queries: def.queries.map((x, j) => (j === i ? q : x)) });
  const setSettings = (s: Partial<SearchSettings>) =>
    onChange({ ...def, settings: { ...def.settings, ...s } });

  const canRun = def.queries.some((q) => q.text.trim() || q.catalogs.length || q.brands.length);
  const pq = picker ? def.queries[picker.queryIndex] : undefined;

  return (
    <div class="editor">
      <div class="row">
        <input
          class="grow name"
          value={def.name}
          placeholder="Nom de la recherche (optionnel)"
          onInput={(e) => onChange({ ...def, name: e.currentTarget.value })}
        />
        <button class="btn ghost" onClick={onNew} title="Repartir d'une recherche vide">
          Nouvelle
        </button>
      </div>

      <p class="hint">
        Chaque <b>requête</b> est une recherche Vinted. Les articles trouvés sont regroupés par
        vendeur : le score d'un <b>lot</b> est la somme des points de ses articles, dans la limite
        du max de chaque requête.
      </p>

      {def.queries.map((q, i) => (
        <QueryCard
          key={q.id}
          q={q}
          index={i}
          onChange={(nq) => setQuery(i, nq)}
          onRemove={
            def.queries.length > 1
              ? () => onChange({ ...def, queries: def.queries.filter((_, j) => j !== i) })
              : undefined
          }
          onDuplicate={() => {
            const qs = [...def.queries];
            qs.splice(i + 1, 0, { ...q, id: newQuery().id });
            onChange({ ...def, queries: qs });
          }}
          onPickCategory={() => setPicker({ kind: 'category', queryIndex: i })}
          onPickFacet={(code) => setPicker({ kind: 'facet', code, queryIndex: i })}
        />
      ))}

      <button
        class="btn ghost wide"
        onClick={() => onChange({ ...def, queries: [...def.queries, newQuery()] })}
      >
        + Ajouter une requête
      </button>

      <details
        class="settings"
        open={showSettings}
        onToggle={(e) => setShowSettings(e.currentTarget.open)}
      >
        <summary>Réglages avancés</summary>
        <label class="field">
          <span>Pages de résultats par requête (96 articles/page)</span>
          <NumberInput
            value={def.settings.pagesPerQuery}
            min={1}
            max={20}
            onChange={(v) => setSettings({ pagesPerQuery: v ?? 1 })}
          />
        </label>
        <label class="field">
          <span>Dressings complets analysés (meilleurs vendeurs)</span>
          <NumberInput
            value={def.settings.deepScanTop}
            min={0}
            max={50}
            onChange={(v) => setSettings({ deepScanTop: v ?? 0 })}
          />
        </label>
        <label class="field">
          <span>Pages de dressing max par vendeur</span>
          <NumberInput
            value={def.settings.wardrobePages}
            min={1}
            max={20}
            onChange={(v) => setSettings({ wardrobePages: v ?? 1 })}
          />
        </label>
        <label class="field">
          <span>Tri des résultats Vinted</span>
          <select
            value={def.settings.order}
            onChange={(e) =>
              setSettings({ order: e.currentTarget.value as SearchSettings['order'] })
            }
          >
            <option value="relevance">Pertinence</option>
            <option value="newest_first">Plus récents</option>
            <option value="price_low_to_high">Prix croissant</option>
          </select>
        </label>
        <label class="field check">
          <input
            type="checkbox"
            checked={def.settings.excludeBusiness}
            onChange={(e) => setSettings({ excludeBusiness: e.currentTarget.checked })}
          />
          <span>Exclure les vendeurs professionnels</span>
        </label>
      </details>

      <div class="sticky-actions">
        <button class="btn primary wide" disabled={!canRun || running} onClick={onRun}>
          {running ? 'Recherche en cours…' : 'Lancer la recherche'}
        </button>
      </div>

      {picker?.kind === 'category' && pq && (
        <CategoryPicker
          client={client}
          query={pq}
          selected={pq.catalogs}
          onClose={() => setPicker(null)}
          onDone={(catalogs) => {
            setQuery(picker.queryIndex, { ...pq, catalogs });
            setPicker(null);
          }}
        />
      )}
      {picker?.kind === 'facet' && pq && (
        <FacetPicker
          client={client}
          code={picker.code}
          title={FACETS.find((f) => f.code === picker.code)!.label}
          query={pq}
          selected={pq[FACETS.find((f) => f.code === picker.code)!.key]}
          onClose={() => setPicker(null)}
          onDone={(opts) => {
            const key = FACETS.find((f) => f.code === picker.code)!.key;
            setQuery(picker.queryIndex, { ...pq, [key]: opts });
            setPicker(null);
          }}
        />
      )}
    </div>
  );
}

function QueryCard(props: {
  q: Query;
  index: number;
  onChange: (q: Query) => void;
  onRemove?: () => void;
  onDuplicate: () => void;
  onPickCategory: () => void;
  onPickFacet: (code: FacetCode) => void;
}) {
  const { q, index, onChange } = props;
  const set = (p: Partial<Query>) => onChange({ ...q, ...p });
  const toggleStatus = (id: string) =>
    set({
      statuses: q.statuses.includes(id) ? q.statuses.filter((s) => s !== id) : [...q.statuses, id],
    });

  return (
    <section class="query" style={{ '--qc': queryColor(index) }}>
      <div class="row">
        <span class="qnum">{index + 1}</span>
        <input
          class="grow"
          value={q.text}
          placeholder="Mots-clés, ex. playmobil police"
          onInput={(e) => set({ text: e.currentTarget.value })}
        />
        <button class="icon-btn" title="Dupliquer la requête" onClick={props.onDuplicate}>
          ⧉
        </button>
        {props.onRemove && (
          <button class="icon-btn" title="Supprimer la requête" onClick={props.onRemove}>
            🗑
          </button>
        )}
      </div>

      <div class="row wrap">
        <label class="mini">
          <span>Points</span>
          <Stepper value={q.points} min={1} onChange={(points) => set({ points })} />
        </label>
        <label class="mini">
          <span title="Nombre max d'articles comptés pour cette requête (vide = illimité)">
            Max
          </span>
          <NumberInput value={q.max} min={1} placeholder="∞" onChange={(max) => set({ max })} />
        </label>
        <label class="mini">
          <span>Prix €</span>
          <span class="range">
            <NumberInput
              value={q.priceFrom}
              min={0}
              placeholder="min"
              step="0.5"
              onChange={(priceFrom) => set({ priceFrom })}
            />
            –
            <NumberInput
              value={q.priceTo}
              min={0}
              placeholder="max"
              step="0.5"
              onChange={(priceTo) => set({ priceTo })}
            />
          </span>
        </label>
        <label
          class="mini"
          title="La recherche Vinted est approximative (« lego police » renvoie aussi des Playmobil). Coché : seuls les articles dont le titre ou la marque contient tous les mots comptent."
        >
          <input
            type="checkbox"
            checked={q.strict}
            onChange={(e) => set({ strict: e.currentTarget.checked })}
          />
          <span>Tous les mots dans le titre</span>
        </label>
      </div>

      <div class="chips" role="group" aria-label="État">
        {STATUSES.map((s) => (
          <button
            key={s.id}
            class={'chip toggle' + (q.statuses.includes(s.id) ? ' on' : '')}
            onClick={() => toggleStatus(s.id)}
          >
            {s.title}
          </button>
        ))}
      </div>

      <div class="chips">
        <SelectedChips
          label="Catégorie"
          values={q.catalogs}
          onRemove={(id) => set({ catalogs: q.catalogs.filter((c) => c.id !== id) })}
        />
        {FACETS.map((f) => (
          <SelectedChips
            key={f.code}
            label={f.label}
            values={q[f.key]}
            onRemove={(id) => set({ [f.key]: q[f.key].filter((o) => o.id !== id) })}
          />
        ))}
      </div>
      <div class="chips">
        <button class="chip add" onClick={props.onPickCategory}>
          + Catégorie
        </button>
        {FACETS.map((f) => (
          <button key={f.code} class="chip add" onClick={() => props.onPickFacet(f.code)}>
            + {f.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function SelectedChips(props: { label: string; values: Option[]; onRemove: (id: string) => void }) {
  return (
    <>
      {props.values.map((v) => (
        <span key={v.id} class="chip sel" title={props.label}>
          {v.title}
          <button onClick={() => props.onRemove(v.id)} aria-label={`Retirer ${v.title}`}>
            ×
          </button>
        </span>
      ))}
    </>
  );
}

function Stepper(props: { value: number; min: number; onChange: (v: number) => void }) {
  return (
    <span class="stepper">
      <button onClick={() => props.onChange(Math.max(props.min, props.value - 1))}>−</button>
      <NumberInput
        value={props.value}
        min={props.min}
        onChange={(v) => props.onChange(Math.max(props.min, v ?? props.min))}
      />
      <button onClick={() => props.onChange(props.value + 1)}>+</button>
    </span>
  );
}

function NumberInput(props: {
  value: number | null;
  min?: number;
  max?: number;
  step?: string;
  placeholder?: string;
  onChange: (v: number | null) => void;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      class="num"
      value={props.value ?? ''}
      min={props.min}
      max={props.max}
      step={props.step ?? '1'}
      placeholder={props.placeholder}
      onInput={(e) => {
        const raw = e.currentTarget.value.replace(',', '.');
        if (raw === '') return props.onChange(null);
        const n = Number(raw);
        if (!Number.isFinite(n)) return;
        const clamped = Math.min(props.max ?? Infinity, Math.max(props.min ?? -Infinity, n));
        props.onChange(props.step ? clamped : Math.round(clamped));
      }}
    />
  );
}
