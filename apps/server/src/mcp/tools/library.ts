import { z } from 'zod';
import { cultureAttenuation, LIBRARY_KINDS, type LibraryDataMap, type LibraryItemDto } from '@brew/shared';
import { createLibraryItem, deleteLibraryItem, getLibraryItem, librarySubstitutes, listLibrary, updateLibraryItem } from '../../services/library';
import { changed, tool } from '../tool';

const kind = z.enum(LIBRARY_KINDS).describe('fermentable (malt, sugar, extract …), hop, culture (yeast, bacteria), misc (other ingredients incl. water salts), water (water profiles), style (beer styles)');
const data = z.record(z.string(), z.unknown());

/** The values that matter when choosing an item; the full item comes from get_library_item. */
function brief(item: LibraryItemDto) {
  const base = { id: item.id, name: item.name, source: item.source, builtIn: item.readOnly };
  switch (item.kind) {
    case 'fermentable': {
      const d = item.data as LibraryDataMap['fermentable'];
      return { ...base, producer: d.producer, origin: d.origin, type: d.type, colorEbc: d.colorEbc, potentialSg: d.potentialSg };
    }
    case 'hop': {
      const d = item.data as LibraryDataMap['hop'];
      return { ...base, producer: d.producer, origin: d.origin, form: d.form, purpose: d.purpose, alphaPct: d.alphaPct };
    }
    case 'culture': {
      const d = item.data as LibraryDataMap['culture'];
      return { ...base, producer: d.producer, productId: d.productId, type: d.type, form: d.form, attenuationPct: cultureAttenuation(d), tempMinC: d.tempMinC, tempMaxC: d.tempMaxC };
    }
    case 'misc': {
      const d = item.data as LibraryDataMap['misc'];
      return { ...base, producer: d.producer, type: d.type, amountKind: d.amountKind };
    }
    case 'water': {
      const { name: _n, notes: _x, ...ions } = item.data as LibraryDataMap['water'];
      return { ...base, ...ions };
    }
    case 'style': {
      const d = item.data as LibraryDataMap['style'];
      return { ...base, code: `${d.categoryNumber}${d.styleLetter}`, guide: d.guide, og: d.og, fg: d.fg, ibu: d.ibu, colorEbc: d.colorEbc, abvPct: d.abvPct };
    }
  }
}

export const libraryTools = [
  tool({
    name: 'search_library',
    level: 'read',
    title: 'Search the ingredient library',
    description:
      'Find ingredients, water profiles or beer styles in the library by name, other spelling (alias) or producer. Returns the key values of each; get_library_item has all of them. Without a query, lists the kind alphabetically.',
    input: { kind, query: z.string().max(100).optional(), limit: z.number().int().min(1).max(500).default(50) },
    run: ({ kind, query, limit }, { db }) => listLibrary(db, { kind, q: query?.trim() || undefined, limit }).map(brief),
  }),
  tool({
    name: 'get_library_item',
    level: 'read',
    title: 'Library item',
    description: 'All values of one library item (ingredient, water profile or style).',
    input: { id: z.string() },
    run: ({ id }, { db }) => getLibraryItem(db, id),
  }),
  tool({
    name: 'find_substitutes',
    level: 'read',
    title: 'Substitutes for a library item',
    description:
      'Built-in items that can replace a built-in malt or hop: the same kind of malt from other maltsters (and the generic one), or the substitutes listed for a hop variety. Empty for own items.',
    input: { id: z.string() },
    run: ({ id }, { db }) => librarySubstitutes(db, id).map(brief),
  }),
  tool({
    name: 'create_library_item',
    level: 'write',
    title: 'Add to the library',
    description:
      'Add an ingredient, water profile or style to the library. `data` has the fields of that kind as get_library_item shows them (missing fields get defaults); canonical units.',
    input: { kind, data },
    run: ({ kind, data }, ctx) => {
      const item = createLibraryItem(ctx.db, kind, data);
      changed(ctx, 'library', item.id);
      return item;
    },
  }),
  tool({
    name: 'update_library_item',
    level: 'write',
    title: 'Change a library item',
    description:
      'Change values of one of the brewery’s own library items; `data` holds only the fields to change. Built-in items (builtIn: true, from open-brewing-data) can’t be changed: create_library_item with their values makes an own copy. Recipes keep their own copies of library values and are not changed.',
    input: { id: z.string(), data },
    run: ({ id, data }, ctx) => {
      const existing = getLibraryItem(ctx.db, id);
      const item = updateLibraryItem(ctx.db, id, { ...existing.data, ...data });
      changed(ctx, 'library', item.id);
      return item;
    },
  }),
  tool({
    name: 'delete_library_item',
    level: 'full',
    title: 'Delete a library item',
    description: 'Delete one of the brewery’s own library items (built-in items can’t be deleted). Recipes that used it keep their copy of its values. It goes to the trash (restore_from_trash) until its time there is up (list_trash shows it).',
    input: { id: z.string() },
    run: ({ id }, ctx) => {
      deleteLibraryItem(ctx.db, id);
      changed(ctx, 'library');
      return { deleted: id };
    },
  }),
];
