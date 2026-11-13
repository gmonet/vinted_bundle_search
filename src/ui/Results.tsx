import { useMemo, useState } from 'preact/hooks';
import { sortLots, type LotSort } from '../core/scoring';
import type { Item, Lot, RunResult, SearchDef } from '../core/types';
import type { Platform } from '../platform';
import type { RunState } from './App';
import { formatDate, formatDuration, formatPrice, queryColor } from './format';

const PAGE = 20;

export function Results(props: {
  def: SearchDef;
  run: RunState | null;
  platform: Platform;
  onEdit: () => void;
  onRerun: () => void;
}) {
  const { def, run, platform } = props;
  const result = def.lastRun;
  const [sort, setSort] = useState<LotSort>('score');
  const [shown, setShown] = useState(PAGE);
  const lots = useMemo(() => (result ? sortLots(result.lots, sort) : []), [result, sort]);

  if (run) {
    const p = run.progress;
    const pct = p ? Math.round((100 * p.done) / Math.max(1, p.total)) : 0;
    return (
      <div class="running">
        <p>
          <b>Recherche en cours…</b>
        </p>
        <div class="progress">
          <div style={{ width: `${pct}%` }} />
        </div>
        <p class="hint">{p?.message ?? 'Démarrage'}</p>
        <button class="btn ghost" onClick={() => run.abort.abort()}>
          Arrêter (garder les résultats partiels)
        </button>
      </div>
    );
  }

  if (!result) {
    return (
      <div class="empty">
        <p>Pas encore de résultats pour cette recherche.</p>
        <button class="btn primary" onClick={props.onEdit}>
          Configurer la recherche
        </button>
      </div>
    );
  }

  return (
    <div class="results">
      <div class="results-head">
        <div>
          <b>{def.name || 'Recherche'}</b>
          <div class="hint">
            {formatDate(result.at)} · {result.lots.length} lots · {result.stats.items} articles ·{' '}
            {result.stats.sellers} vendeurs · {result.stats.requests} requêtes ·{' '}
            {formatDuration(result.stats.durationMs)}
          </div>
        </div>
        <div class="row">
          <select
            value={sort}
            onChange={(e) => setSort(e.currentTarget.value as LotSort)}
            aria-label="Trier les lots"
          >
            <option value="score">Meilleur score</option>
            <option value="ratio">Score / prix</option>
            <option value="count">Nb d'articles</option>
            <option value="price">Moins cher</option>
          </select>
          <button class="btn ghost" onClick={props.onRerun} title="Relancer la même recherche">
            ↻ Actualiser
          </button>
        </div>
      </div>

      {result.warnings.length > 0 && (
        <div class="warn">
          {result.warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}

      {lots.length === 0 && <p class="empty">Aucun article trouvé. Élargis les critères.</p>}

      {lots.slice(0, shown).map((lot, i) => (
        <LotCard key={lot.seller.id} lot={lot} rank={i + 1} result={result} platform={platform} />
      ))}
      {lots.length > shown && (
        <button class="btn ghost wide" onClick={() => setShown(shown + PAGE)}>
          Afficher plus de lots ({lots.length - shown} restants)
        </button>
      )}
    </div>
  );
}

function LotCard({
  lot,
  rank,
  result,
  platform,
}: {
  lot: Lot;
  rank: number;
  result: RunResult;
  platform: Platform;
}) {
  const [showExtras, setShowExtras] = useState(false);
  const s = lot.seller;
  const currency = lot.counted[0]?.item.currency ?? 'EUR';
  const newCount = lot.counted.filter((c) => c.item.isNew).length;
  const open = (url: string) => (e: Event) => {
    e.preventDefault();
    platform.open(url);
  };

  return (
    <article class="lot">
      <header class="lot-head">
        <span class="rank">#{rank}</span>
        <div class="grow seller">
          <a href={s.url} onClick={open(s.url)} class="login">
            {s.login}
          </a>
          <div class="badges">
            {s.feedbackReputation != null && (
              <span class="badge" title={`${s.feedbackCount ?? 0} évaluations`}>
                ★ {(s.feedbackReputation * 5).toFixed(1)} ({s.feedbackCount ?? 0})
              </span>
            )}
            {s.itemCount != null && <span class="badge">{s.itemCount} articles en vente</span>}
            {s.business && <span class="badge pro">Pro</span>}
            {s.bundleDiscount && <span class="badge good">Lot : {s.bundleDiscount}</span>}
            {s.onHoliday && <span class="badge bad">En vacances</span>}
            {lot.deepScanned && (
              <span class="badge" title="Tout le dressing a été analysé">
                Dressing analysé
              </span>
            )}
            {newCount > 0 && <span class="badge new">{newCount} nouveau(x)</span>}
          </div>
        </div>
        <div class="score">
          <b>{lot.score}</b>
          <small>pts</small>
        </div>
      </header>

      <div class="lot-meta">
        <span>
          {lot.counted.length} article{lot.counted.length > 1 ? 's' : ''} ·{' '}
          <b>{formatPrice(lot.price, currency)}</b>
          <span class="hint"> ({formatPrice(lot.totalPrice, currency)} avec protection)</span>
        </span>
      </div>

      <div class="chips">
        {result.queries.map((q, qi) =>
          (lot.fill[qi] ?? 0) > 0 || q.max ? (
            <span
              key={qi}
              class={'chip fill' + (q.max && (lot.fill[qi] ?? 0) >= q.max ? ' full' : '')}
              style={{ '--qc': queryColor(qi) }}
              title={`${q.points} pt(s) par article`}
            >
              {q.label} : {lot.fill[qi] ?? 0}
              {q.max ? `/${q.max}` : ''}
            </span>
          ) : null,
        )}
      </div>

      <div class="strip">
        {lot.counted.map(({ item, query }) => (
          <ItemCard key={item.id} item={item} query={query} result={result} open={open} />
        ))}
      </div>

      {lot.extras.length > 0 && (
        <>
          <button class="link" onClick={() => setShowExtras(!showExtras)}>
            {showExtras ? '▾' : '▸'} {lot.extras.length} autre(s) article(s) correspondant(s) non
            compté(s) (max atteint)
          </button>
          {showExtras && (
            <div class="strip extras">
              {lot.extras.map((item) => (
                <ItemCard key={item.id} item={item} result={result} open={open} />
              ))}
            </div>
          )}
        </>
      )}
    </article>
  );
}

function ItemCard(props: {
  item: Item;
  query?: number;
  result: RunResult;
  open: (url: string) => (e: Event) => void;
}) {
  const { item, query, result } = props;
  const qi = query ?? item.matches[0] ?? 0;
  return (
    <a class="item" href={item.url} onClick={props.open(item.url)} title={item.title}>
      <div class="thumb">
        {item.photo ? <img src={item.photo} loading="lazy" alt="" /> : <div class="noimg" />}
        {item.isNew && <span class="tag new">Nouveau</span>}
        {item.source === 'wardrobe' && (
          <span class="tag" title="Trouvé en analysant le dressing (correspondance approximative)">
            Dressing
          </span>
        )}
      </div>
      <div class="price">{formatPrice(item.price, item.currency)}</div>
      <div class="title">{item.title}</div>
      <div class="sub">{[item.brand, item.status].filter(Boolean).join(' · ')}</div>
      <span class="qtag" style={{ '--qc': queryColor(qi) }}>
        {result.queries[qi]?.label ?? ''}
      </span>
    </a>
  );
}
