import { History, memoryStore } from '../src/core/storage';
import { newSearch } from '../src/core/types';

describe('History', () => {
  it('saves, orders by update date and removes', () => {
    const h = new History(memoryStore());
    const a = newSearch({ name: 'a', updatedAt: 1 });
    const b = newSearch({ name: 'b', updatedAt: 2 });
    h.save(a);
    h.save(b);
    expect(h.list().map((s) => s.name)).toEqual(['b', 'a']);
    h.save({ ...a, updatedAt: 3 });
    expect(h.list().map((s) => s.name)).toEqual(['a', 'b']);
    h.remove(a.id);
    expect(h.list().map((s) => s.name)).toEqual(['b']);
  });

  it('round-trips export/import and keeps the newest version', () => {
    const src = new History(memoryStore());
    const s = newSearch({ name: 'x', updatedAt: 5 });
    src.save(s);
    const dst = new History(memoryStore());
    dst.save({ ...s, name: 'old', updatedAt: 1 });
    expect(dst.import(src.export())).toBe(1);
    expect(dst.list()).toHaveLength(1);
    expect(dst.get(s.id)?.name).toBe('x');
  });

  it('fills settings missing from old entries', () => {
    const kv = memoryStore();
    kv.set(
      'history.v1',
      JSON.stringify([{ id: '1', queries: [{ text: 'a' }], settings: {}, updatedAt: 1 }]),
    );
    const s = new History(kv).list()[0]!;
    expect(s.settings.pagesPerQuery).toBeGreaterThan(0);
    expect(s.queries[0]!.points).toBe(1);
  });

  it('survives corrupted data', () => {
    const kv = memoryStore();
    kv.set('history.v1', '{oops');
    expect(new History(kv).list()).toEqual([]);
  });
});
