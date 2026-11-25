import type { MiscData } from '@brew/shared';

const m = (name: string, type: MiscData['type'], amountKind: MiscData['amountKind'], useFor: string, notes = ''): MiscData => ({
  name,
  type,
  producer: '',
  productId: '',
  amountKind,
  useFor,
  notes,
});

/**
 * Common other ingredients. The water agents' seed keys are referenced by WATER_AGENT_INFO in
 * @brew/shared — keep them stable.
 */
export const MISCS: { seedKey: string; data: MiscData }[] = [
  ['gypsum', m('Gypsum (calcium sulfate)', 'water_agent', 'mass', 'Adds calcium and sulfate: crisper, drier bitterness.', 'CaSO4·2H2O')],
  ['calcium-chloride', m('Calcium chloride', 'water_agent', 'mass', 'Adds calcium and chloride: fuller, rounder malt.', 'CaCl2·2H2O (dihydrate)')],
  ['epsom-salt', m('Epsom salt (magnesium sulfate)', 'water_agent', 'mass', 'Adds magnesium and sulfate. Use sparingly.', 'MgSO4·7H2O')],
  ['magnesium-chloride', m('Magnesium chloride', 'water_agent', 'mass', 'Adds magnesium and chloride.', 'MgCl2·6H2O')],
  ['table-salt', m('Table salt (sodium chloride)', 'water_agent', 'mass', 'Adds sodium and chloride. Non-iodised.', 'NaCl')],
  ['baking-soda', m('Baking soda (sodium bicarbonate)', 'water_agent', 'mass', 'Raises alkalinity (mash pH) for dark beers.', 'NaHCO3')],
  ['chalk', m('Chalk (calcium carbonate)', 'water_agent', 'mass', 'Raises alkalinity; dissolves poorly in water.', 'CaCO3')],
  ['lactic-acid-80', m('Lactic acid 80 %', 'water_agent', 'volume', 'Lowers mash and sparge pH.')],
  ['phosphoric-acid-10', m('Phosphoric acid 10 %', 'water_agent', 'volume', 'Lowers mash and sparge pH without flavour.')],
  ['whirlfloc', m('Whirlfloc tablet', 'fining', 'count', 'Kettle fining, last 10–15 min of the boil.')],
  ['irish-moss', m('Irish moss', 'fining', 'mass', 'Kettle fining, last 10–15 min of the boil.')],
  ['gelatin', m('Gelatin', 'fining', 'mass', 'Clears beer in the fermenter or keg, cold.')],
  ['yeast-nutrient', m('Yeast nutrient', 'nutrient', 'mass', 'Last 10–15 min of the boil.')],
  ['campden', m('Campden tablet (potassium metabisulfite)', 'water_agent', 'count', 'Removes chlorine and chloramine: one tablet per ~75 L.')],
].map(([key, data]) => ({ seedKey: `misc:${key as string}`, data: data as MiscData }));
