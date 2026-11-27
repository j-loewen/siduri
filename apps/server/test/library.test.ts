import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { LibraryItemDto } from '@brew/shared';
import { seedItem } from '@brew/seed-data';
import { libraryItems, seedKeys } from '../src/db/schema';
import { syncLibrary } from '../src/services/library';
import { client, makeApp } from './helpers';

async function signedIn() {
  const made = await makeApp();
  const c = client(made.app);
  expect((await c.register('brewer')).statusCode).toBe(201);
  return { ...made, c };
}

describe('built-in library', () => {
  it('holds open-brewing-data, read-only', async () => {
    const { c } = await signedIn();
    const malts = (await c.get('/api/library?kind=fermentable')).json<LibraryItemDto<'fermentable'>[]>();
    // More than the old default page of 500.
    expect(malts.length).toBeGreaterThan(500);
    const caramunich = malts.find((m) => m.seedKey === 'fermentables/weyermann/caramunich-type-3')!;
    expect(caramunich).toMatchObject({ readOnly: true, source: 'seed', data: { producer: 'Weyermann', colorEbc: 150 } });

    const put = await c.put(`/api/library/${caramunich.id}`, { data: { ...caramunich.data, colorEbc: 1 } });
    expect(put.statusCode).toBe(403);
    expect(put.json()).toMatchObject({ error: 'library_read_only' });

    // A copy is the brewery's own and can be changed.
    const own = (await c.post('/api/library', { kind: 'fermentable', data: { ...caramunich.data, name: 'My CARAMUNICH' } })).json<LibraryItemDto<'fermentable'>>();
    expect(own).toMatchObject({ readOnly: false, source: 'user', seedKey: null });
    const changed = (await c.put(`/api/library/${own.id}`, { data: { ...own.data, colorEbc: 140 } })).json<LibraryItemDto<'fermentable'>>();
    expect(changed.data.colorEbc).toBe(140);

    // Built-ins can't be deleted either; own items can.
    const del = await c.delete(`/api/library/${caramunich.id}`);
    expect(del.statusCode).toBe(403);
    expect(del.json()).toMatchObject({ error: 'library_read_only' });
    expect((await c.get(`/api/library/${caramunich.id}`)).statusCode).toBe(200);
    expect((await c.delete(`/api/library/${own.id}`)).statusCode).toBe(204);
  });

  it('finds items by their other spellings', async () => {
    const { c } = await signedIn();
    const found = (await c.get('/api/library?kind=fermentable&q=CARAMUNICH III')).json<LibraryItemDto[]>();
    expect(found.map((i) => i.seedKey)).toContain('fermentables/weyermann/caramunich-type-3');
  });

  it('offers substitutes for built-in malts', async () => {
    const { c } = await signedIn();
    const [item] = (await c.get('/api/library?kind=fermentable&q=CARAMUNICH Type 3')).json<LibraryItemDto[]>();
    const subs = (await c.get(`/api/library/${item!.id}/substitutes`)).json<LibraryItemDto[]>();
    expect(subs.map((s) => s.seedKey)).toContain('fermentables/generic/caramunich-malt');
    expect(subs.every((s) => s.id !== item!.id)).toBe(true);

    const own = (await c.post('/api/library', { kind: 'fermentable', data: { name: 'Home-made crystal' } })).json<LibraryItemDto>();
    expect((await c.get(`/api/library/${own.id}/substitutes`)).json()).toEqual([]);
  });
});

describe('library sync', () => {
  /** An install from before open-brewing-data: old keys, some items edited, one deleted. */
  async function oldInstall() {
    const { db } = await makeApp();
    db.delete(libraryItems).run();
    db.delete(seedKeys).run();
    const at = (ms: number) => new Date(Date.UTC(2026, 0, 1) + ms);
    const row = (seedKey: string, kind: 'hop' | 'culture' | 'fermentable' | 'misc', data: Record<string, unknown>, edited: boolean) => {
      db.insert(libraryItems)
        .values({ id: seedKey, kind, name: String(data.name), source: 'seed', seedKey, data, createdAt: at(0), updatedAt: at(edited ? 5000 : 0) })
        .run();
      db.insert(seedKeys).values({ seedKey }).run();
    };
    // Same values as the old library, although "updated" (the old "Reset to library value").
    row('hop:cascade', 'hop', { name: 'Cascade', producer: '', origin: '', form: 'pellet', purpose: 'aroma', alphaPct: 7, betaPct: 7, cohumulonePct: 35, totalOil: null, hsi: 0.5, substitutes: 'Centennial, Amarillo, Columbus', notes: 'Floral, with elements of citrus.' }, true);
    // Never touched.
    row('culture:us-05-safale-american', 'culture', { name: 'US-05 Safale American', producer: 'Fermentis' }, false);
    // Edited by the brewer.
    row('fermentable:acid-malt', 'fermentable', { name: 'Acid Malt', colorEbc: 99 }, true);
    row('misc:gypsum', 'misc', { name: 'Gypsum (my notes)', type: 'water_agent' }, true);
    // Deleted by the brewer.
    db.insert(seedKeys).values({ seedKey: 'style:american-ipa' }).run();
    // No longer in the bundled data.
    row('fermentable:gone', 'fermentable', { name: 'Gone' }, false);
    return db;
  }

  const byKey = (db: Awaited<ReturnType<typeof oldInstall>>, seedKey: string) =>
    db.select().from(libraryItems).where(eq(libraryItems.seedKey, seedKey)).get();
  const byId = (db: Awaited<ReturnType<typeof oldInstall>>, id: string) => db.select().from(libraryItems).where(eq(libraryItems.id, id)).get();

  it('moves an old install to open-brewing-data and keeps what the brewer edited', async () => {
    const db = await oldInstall();
    const result = syncLibrary(db);
    expect(result.renamed).toBe(2);
    expect(result.detached).toBe(3);

    // Unedited items keep their id (recipes link to it), get the new key and today's values.
    expect(byId(db, 'hop:cascade')).toMatchObject({ seedKey: 'hops/varieties/cascade', data: seedItem('hops/varieties/cascade')!.data });
    expect(byId(db, 'culture:us-05-safale-american')).toMatchObject({ seedKey: 'cultures/fermentis/safale-us-05', name: 'SafAle US-05' });

    // Edited items become the brewer's own, next to a fresh built-in.
    expect(byId(db, 'fermentable:acid-malt')).toMatchObject({ seedKey: null, source: 'user', data: { colorEbc: 99 } });
    expect(byKey(db, 'fermentables/generic/acid-malt')).toBeDefined();
    expect(byId(db, 'misc:gypsum')).toMatchObject({ seedKey: null, source: 'user', name: 'Gypsum (my notes)' });
    expect(byKey(db, 'misc:gypsum')).toMatchObject({ source: 'seed' });
    expect(byId(db, 'fermentable:gone')).toMatchObject({ seedKey: null, source: 'user' });

    // What the brewer deleted stays deleted.
    expect(byKey(db, 'styles/bjcp-2015/21a-american-ipa')).toBeUndefined();

    // Nothing more to do on the next start.
    expect(syncLibrary(db)).toEqual({ added: 0, updated: 0, renamed: 0, detached: 0 });
  });

  it('brings built-in items back to the bundled values', async () => {
    const { db } = await makeApp();
    const row = byKey(db, 'hops/varieties/cascade')!;
    db.update(libraryItems).set({ data: { ...row.data, alphaPct: 1 } }).where(eq(libraryItems.id, row.id)).run();
    expect(syncLibrary(db)).toMatchObject({ updated: 1, added: 0 });
    expect(byId(db, row.id)!.data).toEqual(seedItem('hops/varieties/cascade')!.data);
  });
});
