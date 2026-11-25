import { desc, eq, getTableColumns, sql } from 'drizzle-orm';
import { recipeDocSchema, type RecipeDoc, type RecipeDto, type RecipeSummaryDto } from '@brew/shared';
import { recipeStats } from '@brew/brewcalc';
import type { Db } from '../db';
import { recipes, type RecipeRow } from '../db/schema';
import { conflict, notFound } from '../lib/errors';

export function toRecipeDto(row: RecipeRow): RecipeDto {
  return {
    id: row.id,
    // Fill defaults added to the document schema since the recipe was saved.
    doc: recipeDocSchema.parse(row.doc),
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toRecipeSummary(row: Omit<RecipeRow, 'doc'>): RecipeSummaryDto {
  return {
    id: row.id,
    name: row.name,
    image: row.imageId,
    styleName: row.styleName,
    type: row.type,
    batchSizeL: row.batchSizeL,
    og: row.og,
    fg: row.fg,
    abvPct: row.abvPct,
    ibu: row.ibu,
    colorEbc: row.colorEbc,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Columns stored next to the document for lists. */
export function recipeColumns(doc: RecipeDoc) {
  const stats = recipeStats(doc);
  return {
    name: doc.name,
    styleName: doc.style?.name ?? null,
    imageId: doc.image,
    type: doc.type,
    batchSizeL: doc.batchSizeL,
    og: stats.og,
    fg: stats.fg,
    abvPct: stats.abvPct,
    ibu: stats.ibu,
    colorEbc: stats.colorEbc,
  };
}

const likeTerm = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function listRecipes(db: Db, q?: string): RecipeSummaryDto[] {
  const { doc: _doc, ...columns } = getTableColumns(recipes);
  const query = db.select(columns).from(recipes);
  const rows = q
    ? query
        .where(sql`(${recipes.name} like ${likeTerm(q)} escape '\\' or ${recipes.styleName} like ${likeTerm(q)} escape '\\')`)
        .orderBy(desc(recipes.updatedAt))
        .all()
    : query.orderBy(desc(recipes.updatedAt)).all();
  return rows.map(toRecipeSummary);
}

export function getRecipe(db: Db, id: string): RecipeDto {
  const row = db.select().from(recipes).where(eq(recipes.id, id)).get();
  if (!row) throw notFound('Recipe not found');
  return toRecipeDto(row);
}

export function createRecipe(db: Db, doc: RecipeDoc): RecipeDto {
  const row = db
    .insert(recipes)
    .values({ id: crypto.randomUUID(), doc, ...recipeColumns(doc) })
    .returning()
    .get();
  return toRecipeDto(row);
}

/** Save a new version; refused when someone else saved in between (`version` is stale). */
export function updateRecipe(db: Db, id: string, doc: RecipeDoc, version: number): RecipeDto {
  const row = db
    .update(recipes)
    .set({ doc, ...recipeColumns(doc), version: sql`${recipes.version} + 1`, updatedAt: new Date() })
    .where(sql`${recipes.id} = ${id} and ${recipes.version} = ${version}`)
    .returning()
    .get();
  if (!row) {
    getRecipe(db, id); // 404 when it is gone
    throw conflict('The recipe was changed elsewhere. Reload to see the latest version.');
  }
  return toRecipeDto(row);
}

export function deleteRecipe(db: Db, id: string) {
  const res = db.delete(recipes).where(eq(recipes.id, id)).run();
  if (res.changes === 0) throw notFound('Recipe not found');
}

export function duplicateRecipe(db: Db, id: string, name?: string): RecipeDto {
  const { doc } = getRecipe(db, id);
  return createRecipe(db, { ...doc, name: (name ?? `${doc.name} (copy)`).slice(0, 120) });
}

/**
 * Recalculates the stored list values (OG, IBU, colour, …) of every recipe. Run on startup, so
 * changes to the calculations reach recipes that haven't been saved since. Returns how many changed.
 */
export function refreshRecipeStats(db: Db): number {
  let changed = 0;
  db.transaction((tx) => {
    for (const row of tx.select().from(recipes).all()) {
      const next = recipeColumns(recipeDocSchema.parse(row.doc));
      const same = (['og', 'fg', 'abvPct', 'ibu', 'colorEbc'] as const).every((k) => Math.abs(next[k] - row[k]) < 1e-9);
      if (same) continue;
      tx.update(recipes).set({ og: next.og, fg: next.fg, abvPct: next.abvPct, ibu: next.ibu, colorEbc: next.colorEbc }).where(eq(recipes.id, row.id)).run();
      changed++;
    }
  });
  return changed;
}
