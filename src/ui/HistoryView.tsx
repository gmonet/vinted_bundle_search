import { useState } from 'preact/hooks';
import type { History } from '../core/storage';
import { queryLabel, uid, type SearchDef } from '../core/types';
import type { Platform } from '../platform';
import { formatDate, queryColor } from './format';

export function HistoryView(props: {
  history: History;
  platform: Platform;
  currentId: string;
  running: boolean;
  onOpen: (d: SearchDef) => void;
  onEdit: (d: SearchDef) => void;
  onRun: (d: SearchDef) => void;
}) {
  const { history, platform } = props;
  const [, refresh] = useState(0);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [panel, setPanel] = useState<'export' | 'import' | null>(null);
  const [importText, setImportText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const list = history.list();

  const exportText = panel === 'export' ? history.export() : '';

  return (
    <div class="history">
      <div class="row wrap">
        <button class="btn ghost" onClick={() => setPanel(panel === 'export' ? null : 'export')}>
          Exporter
        </button>
        <button class="btn ghost" onClick={() => setPanel(panel === 'import' ? null : 'import')}>
          Importer
        </button>
        <span class="hint grow">
          {list.length} recherche(s) · synchronise PC ↔ Android par export/import
        </span>
      </div>

      {panel === 'export' && (
        <div class="box">
          <textarea
            readOnly
            rows={4}
            value={exportText}
            onFocus={(e) => e.currentTarget.select()}
          />
          <div class="row">
            <button
              class="btn"
              onClick={() =>
                navigator.clipboard
                  .writeText(exportText)
                  .then(() => setMessage('Copié dans le presse-papiers.'))
                  .catch(() => setMessage('Copie impossible : sélectionne le texte manuellement.'))
              }
            >
              Copier
            </button>
            {platform.share && (
              <button class="btn" onClick={() => platform.share!(exportText)}>
                Partager
              </button>
            )}
          </div>
        </div>
      )}

      {panel === 'import' && (
        <div class="box">
          <textarea
            rows={4}
            placeholder="Colle ici un export…"
            value={importText}
            onInput={(e) => setImportText(e.currentTarget.value)}
          />
          <button
            class="btn"
            onClick={() => {
              try {
                const n = history.import(importText);
                setMessage(`${n} recherche(s) importée(s).`);
                setImportText('');
                setPanel(null);
                refresh((x) => x + 1);
              } catch (e) {
                setMessage(`Import impossible : ${(e as Error).message}`);
              }
            }}
          >
            Importer
          </button>
        </div>
      )}

      {message && <p class="hint">{message}</p>}
      {list.length === 0 && <p class="empty">Aucune recherche enregistrée pour l'instant.</p>}

      {list.map((s) => {
        const best = s.lastRun?.lots[0];
        return (
          <article key={s.id} class={'hist' + (s.id === props.currentId ? ' current' : '')}>
            <div class="row">
              <button class="link grow left" onClick={() => props.onOpen(s)}>
                <b>{s.name || 'Sans nom'}</b>
              </button>
              <span class="hint">{formatDate(s.updatedAt)}</span>
            </div>
            <div class="chips">
              {s.queries.map((q, i) => (
                <span key={q.id} class="chip fill" style={{ '--qc': queryColor(i) }}>
                  {queryLabel(q, i)} · {q.points} pt{q.max ? ` · max ${q.max}` : ''}
                </span>
              ))}
            </div>
            {s.lastRun && (
              <div class="hint">
                Dernier lancement {formatDate(s.lastRun.at)} : {s.lastRun.lots.length} lots
                {best ? ` · meilleur : ${best.seller.login} (${best.score} pts)` : ''}
              </div>
            )}
            <div class="row wrap actions">
              {s.lastRun && (
                <button class="btn small" onClick={() => props.onOpen(s)}>
                  Résultats
                </button>
              )}
              <button class="btn small" onClick={() => props.onEdit(s)}>
                Modifier
              </button>
              <button class="btn small" disabled={props.running} onClick={() => props.onRun(s)}>
                ↻ Relancer
              </button>
              <button
                class="btn small"
                onClick={() => {
                  const now = Date.now();
                  props.onEdit({
                    ...s,
                    id: uid(),
                    name: `${s.name} (copie)`,
                    createdAt: now,
                    updatedAt: now,
                    lastRun: undefined,
                    seenItemIds: undefined,
                  });
                }}
              >
                Dupliquer
              </button>
              {confirmId === s.id ? (
                <button
                  class="btn small danger"
                  onClick={() => {
                    history.remove(s.id);
                    setConfirmId(null);
                    refresh((x) => x + 1);
                  }}
                >
                  Confirmer la suppression
                </button>
              ) : (
                <button class="btn small" onClick={() => setConfirmId(s.id)}>
                  Supprimer
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
