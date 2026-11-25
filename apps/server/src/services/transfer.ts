import { equipmentDataSchema, importCommitSchema, parseLibraryData, type ImportResult, type LibraryKind } from '@brew/shared';
import type { Db } from '../db';
import { badRequest, parse } from '../lib/errors';
import { createEquipment } from './equipment';
import { createLibraryItem, existingNames } from './library';
import { createRecipe } from './recipes';
import { linkStyle, loadStyles } from './style-match';

/** Save what the user picked from an import preview. */
export function commitImport(db: Db, raw: unknown): ImportResult {
  const input = parse(importCommitSchema, raw);
  // Validate everything before saving anything.
  const library = input.library.map((item, i) => {
    try {
      return { kind: item.kind, data: parseLibraryData(item.kind, item.data) };
    } catch {
      throw badRequest(`Library item ${i + 1} is invalid`);
    }
  });
  const equipment = input.equipment.map((e, i) => {
    const parsed = equipmentDataSchema.safeParse(e);
    if (!parsed.success) throw badRequest(`Equipment profile ${i + 1} is invalid`);
    return parsed.data;
  });

  return db.transaction((tx) => {
    const t = tx as unknown as Db;
    const result: ImportResult = { recipeIds: [], libraryAdded: 0, librarySkipped: 0, equipmentAdded: 0 };

    const byKind = new Map<LibraryKind, typeof library>();
    for (const item of library) byKind.set(item.kind, [...(byKind.get(item.kind) ?? []), item]);
    for (const [kind, items] of byKind) {
      const taken = input.skipExisting ? existingNames(t, kind, items.map((i) => i.data.name)) : new Set<string>();
      for (const item of items) {
        const key = item.data.name.toLowerCase();
        if (taken.has(key)) {
          result.librarySkipped++;
          continue;
        }
        createLibraryItem(t, kind, item.data, 'import');
        taken.add(key);
        result.libraryAdded++;
      }
    }
    // After the library, so styles imported with the recipes can be linked too.
    const styles = loadStyles(t);
    for (const doc of input.recipes) result.recipeIds.push(createRecipe(t, linkStyle(doc, styles)).id);
    for (const data of equipment) {
      createEquipment(t, data);
      result.equipmentAdded++;
    }
    return result;
  });
}
