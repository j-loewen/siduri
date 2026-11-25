import type { RecipeDoc } from './recipe';

/** One difference between two versions of a recipe document (e.g. a batch and its recipe). */
export interface RecipeChange {
  section: 'setup' | 'fermentables' | 'hops' | 'cultures' | 'miscs' | 'mash' | 'fermentation' | 'notes';
  kind: 'added' | 'removed' | 'changed';
  /** Name of the line (ingredient, step) or of the setting. */
  name: string;
  /** Changed field (only for kind "changed"). */
  field?: string;
  from?: number | string | null;
  to?: number | string | null;
}

const same = (a: unknown, b: unknown) => {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));
  return a === b;
};

type Line = { id: string; name: string };

function diffLines<T extends Line>(section: RecipeChange['section'], base: T[], changed: T[], fields: (keyof T & string)[]): RecipeChange[] {
  const out: RecipeChange[] = [];
  const byId = new Map(base.map((l) => [l.id, l]));
  const seen = new Set<string>();
  for (const line of changed) {
    const old = byId.get(line.id);
    if (!old) {
      out.push({ section, kind: 'added', name: line.name });
      continue;
    }
    seen.add(line.id);
    for (const field of fields) {
      const from = old[field] as unknown;
      const to = line[field] as unknown;
      if (!same(from, to)) out.push({ section, kind: 'changed', name: line.name, field, from: from as RecipeChange['from'], to: to as RecipeChange['to'] });
    }
  }
  for (const line of base) if (!seen.has(line.id)) out.push({ section, kind: 'removed', name: line.name });
  return out;
}

/** What changed from `base` to `changed`. Lines are matched by their id. */
export function diffRecipes(base: RecipeDoc, changed: RecipeDoc): RecipeChange[] {
  const setup: RecipeChange[] = [];
  const setting = (name: string, from: number | string | null, to: number | string | null) => {
    if (!same(from, to)) setup.push({ section: 'setup', kind: 'changed', name, field: name, from, to });
  };
  setting('batchSizeL', base.batchSizeL, changed.batchSizeL);
  setting('efficiencyPct', base.efficiencyPct, changed.efficiencyPct);
  setting('boilTimeMin', base.boilTimeMin, changed.boilTimeMin);
  setting('style', base.style?.name ?? null, changed.style?.name ?? null);
  setting('equipment', base.equipment?.name ?? null, changed.equipment?.name ?? null);
  setting('carbonationVols', base.carbonationVols, changed.carbonationVols);

  return [
    ...setup,
    ...diffLines('fermentables', base.fermentables, changed.fermentables, ['name', 'amountKg', 'use', 'colorEbc', 'potentialSg']),
    ...diffLines('hops', base.hops, changed.hops, ['name', 'amountKg', 'alphaPct', 'use', 'timeMin', 'day']),
    ...diffLines('cultures', base.cultures, changed.cultures, ['name', 'amount', 'attenuationPct']),
    ...diffLines('miscs', base.miscs, changed.miscs, ['name', 'amount', 'use', 'timeMin']),
    ...diffLines('mash', base.mash.steps, changed.mash.steps, ['name', 'tempC', 'timeMin']),
    ...diffLines('fermentation', base.fermentation, changed.fermentation, ['name', 'tempC', 'days']),
    ...(base.notes !== changed.notes ? [{ section: 'notes' as const, kind: 'changed' as const, name: 'notes' }] : []),
  ];
}
