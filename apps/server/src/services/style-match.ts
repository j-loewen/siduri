import { eq, sql } from 'drizzle-orm';
import { recipeDocSchema, styleDataSchema, type RecipeDoc, type RecipeStyle, type StyleData } from '@brew/shared';
import type { Db } from '../db';
import { batches, libraryItems, recipes } from '../db/schema';

const RANGES = ['og', 'fg', 'ibu', 'colorEbc', 'abvPct', 'carbVols'] as const;
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '');

type LibraryStyle = { id: string; data: StyleData };

/** Library styles, loaded once per import or startup run. */
export function loadStyles(db: Db): LibraryStyle[] {
  return db
    .select({ id: libraryItems.id, data: libraryItems.data })
    .from(libraryItems)
    .where(eq(libraryItems.kind, 'style'))
    .all()
    .map((r) => ({ id: r.id, data: styleDataSchema.parse(r.data) }));
}

/**
 * The library style an imported recipe style refers to: same name and guideline, else same
 * category code (e.g. 15B) in the same guideline, else same name in any guideline.
 */
function find(styles: LibraryStyle[], style: RecipeStyle): LibraryStyle | undefined {
  const name = norm(style.name);
  const guide = norm(style.guide);
  const code = `${style.categoryNumber}${style.styleLetter}`.toUpperCase();
  return (
    styles.find((s) => norm(s.data.name) === name && norm(s.data.guide) === guide) ??
    (code.length > 1 && guide ? styles.find((s) => `${s.data.categoryNumber}${s.data.styleLetter}`.toUpperCase() === code && norm(s.data.guide) === guide) : undefined) ??
    styles.find((s) => norm(s.data.name) === name)
  );
}

/**
 * Links a recipe's style to the library when it isn't linked yet. Ranges the recipe has keep
 * their values (a BeerXML file brings its own); missing ones come from the library (BeerJSON
 * recipes only name their style). Returns the document unchanged when nothing matches.
 */
export function linkStyle(doc: RecipeDoc, styles: LibraryStyle[]): RecipeDoc {
  const style = doc.style;
  if (!style || style.libraryRef) return doc;
  const match = find(styles, style);
  if (!match) return doc;
  const lib = match.data;
  const linked: RecipeStyle = {
    libraryRef: match.id,
    name: lib.name,
    guide: lib.guide,
    category: lib.category,
    categoryNumber: lib.categoryNumber,
    styleLetter: lib.styleLetter,
    og: lib.og,
    fg: lib.fg,
    ibu: lib.ibu,
    colorEbc: lib.colorEbc,
    abvPct: lib.abvPct,
    carbVols: lib.carbVols,
  };
  for (const key of RANGES) {
    if (style[key][0] != null || style[key][1] != null) linked[key] = style[key];
  }
  return { ...doc, style: linked };
}

/**
 * Links the styles of recipes and batches imported before styles were matched on import. Runs on
 * startup; cheap when everything is linked already. Returns how many documents changed.
 */
export function linkUnlinkedStyles(db: Db): number {
  let changed = 0;
  db.transaction((tx) => {
    const t = tx as unknown as Db;
    const styles = loadStyles(t);
    if (!styles.length) return;
    for (const row of t.select({ id: recipes.id, doc: recipes.doc }).from(recipes).all()) {
      const doc = recipeDocSchema.parse(row.doc);
      const linked = linkStyle(doc, styles);
      if (linked === doc) continue;
      t.update(recipes).set({ doc: linked, styleName: linked.style?.name ?? null, version: sql`${recipes.version} + 1` }).where(eq(recipes.id, row.id)).run();
      changed++;
    }
    for (const row of t.select({ id: batches.id, doc: batches.doc }).from(batches).all()) {
      const doc = recipeDocSchema.parse(row.doc);
      const linked = linkStyle(doc, styles);
      if (linked === doc) continue;
      t.update(batches).set({ doc: linked, version: sql`${batches.version} + 1` }).where(eq(batches.id, row.id)).run();
      changed++;
    }
  });
  return changed;
}
