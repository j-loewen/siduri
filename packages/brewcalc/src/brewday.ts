import { DEFAULT_EQUIPMENT, WATER_AGENT_INFO, type AmountKind, type RecipeDoc, type WaterAgent } from '@brew/shared';
import { extractToTarget, dilutionToTarget, points } from './gravity';
import type { RecipeCalc } from './recipe';

/**
 * The brew day as a list of steps, generated from a batch's recipe document. Step and checklist
 * ids are stable (derived from line ids), so progress stored on the server stays valid while the
 * document is edited.
 */

export type BrewDayStepKind =
  | 'gather'
  | 'heatStrike'
  | 'mashIn'
  | 'mashStep'
  | 'sparge'
  | 'lauter'
  | 'steep'
  | 'preBoil'
  | 'boil'
  | 'whirlpool'
  | 'chill'
  | 'measureOg'
  | 'pitch';

export type BrewDayMeasure = 'mashPh' | 'preBoilGravity' | 'preBoilVolumeL' | 'postBoilVolumeL' | 'og' | 'fermenterVolumeL';

export interface BrewDayItem {
  /** Checklist key, unique within the brew day. */
  key: string;
  kind: 'fermentable' | 'hop' | 'culture' | 'misc' | 'water';
  name: string;
  amount: number;
  amountKind: AmountKind;
  /** Boil / whirlpool additions: minutes before the end of the step's timer. */
  atMin?: number;
  /** Extra detail, e.g. hop alpha acid or a water temperature (°C). */
  alphaPct?: number;
  tempC?: number | null;
  /** Water salts and acids: the UI shows the agent's translated name. */
  agent?: WaterAgent;
}

export interface BrewDayStep {
  id: string;
  kind: BrewDayStepKind;
  /** Recipe step name (mash and fermentation steps); other steps are titled by kind. */
  name?: string;
  tempC?: number | null;
  volumeL?: number;
  /** Countdown length; the step's timer id is the step id. */
  timerMin?: number;
  items: BrewDayItem[];
  measure?: BrewDayMeasure[];
  target?: { gravity?: number; volumeL?: number };
}

const DEFAULT_SPARGE_C = 76;
const DEFAULT_STEEP = { tempC: 68, timeMin: 30 };

export function brewDaySteps(doc: RecipeDoc, calc: RecipeCalc): BrewDayStep[] {
  const eq = doc.equipment ?? DEFAULT_EQUIPMENT;
  const v = calc.volumes;
  const mashed = doc.fermentables.filter((f) => f.use === 'mash');
  const steeped = doc.fermentables.filter((f) => f.use === 'steep');
  const steps: BrewDayStep[] = [];

  const fermentableItem = (f: RecipeDoc['fermentables'][number], prefix: string, atMin?: number): BrewDayItem => ({
    key: `${prefix}:${f.id}`,
    kind: 'fermentable',
    name: f.name,
    amount: f.amountKg,
    amountKind: 'mass',
    ...(atMin !== undefined && { atMin }),
  });
  const hopItem = (h: RecipeDoc['hops'][number], prefix: string, atMin?: number): BrewDayItem => ({
    key: `${prefix}:${h.id}`,
    kind: 'hop',
    name: h.name,
    amount: h.amountKg,
    amountKind: 'mass',
    alphaPct: h.alphaPct,
    ...(atMin !== undefined && { atMin }),
  });
  const miscItem = (m: RecipeDoc['miscs'][number], prefix: string, atMin?: number): BrewDayItem => ({
    key: `${prefix}:${m.id}`,
    kind: 'misc',
    name: m.name,
    amount: m.amount,
    amountKind: m.amountKind,
    ...(atMin !== undefined && { atMin }),
  });

  const waterItem = (a: RecipeDoc['water']['additions'][number], prefix: string): BrewDayItem => ({
    key: `${prefix}:${a.id}`,
    kind: 'misc',
    name: a.agent,
    agent: a.agent,
    amount: a.amount,
    amountKind: WATER_AGENT_INFO[a.agent].amountKind,
  });
  const mashWater = doc.water.additions.filter((a) => a.where === 'mash' && a.amount > 0);
  const spargeWater = doc.water.additions.filter((a) => a.where === 'sparge' && a.amount > 0);

  // 1. Weigh out everything.
  steps.push({
    id: 'gather',
    kind: 'gather',
    items: [
      ...doc.fermentables.map((f) => fermentableItem(f, 'gather')),
      ...doc.hops.map((h) => hopItem(h, 'gather')),
      ...doc.miscs.map((m) => miscItem(m, 'gather')),
      ...doc.cultures.map((c) => ({ key: `gather:${c.id}`, kind: 'culture' as const, name: c.name, amount: c.amount, amountKind: c.amountKind })),
      ...[...mashWater, ...spargeWater].map((a) => waterItem(a, 'gather')),
      ...(v.totalWaterL > 0 ? [{ key: 'gather:water', kind: 'water' as const, name: 'water', amount: v.totalWaterL, amountKind: 'volume' as const }] : []),
    ],
  });

  if (mashed.length) {
    const mashSteps = doc.mash.steps.length
      ? doc.mash.steps
      : [{ id: 'default', name: '', type: 'infusion' as const, tempC: 67, timeMin: 60, rampMin: null, infuseL: null }];
    // 2. Strike water.
    // Salts and acids for the mash go into the strike water; sparge ones into the sparge water.
    const spargeLater = v.spargeL > 0.01;
    steps.push({
      id: 'heatStrike',
      kind: 'heatStrike',
      volumeL: v.strikeL,
      tempC: calc.strikeTempC ?? mashSteps[0]!.tempC,
      items: [...mashWater, ...(spargeLater ? [] : spargeWater)].map((a) => waterItem(a, 'add')),
    });
    // 3. Dough in: grain, mash hops and mash additions.
    steps.push({
      id: 'mashIn',
      kind: 'mashIn',
      tempC: mashSteps[0]!.tempC,
      items: [
        ...mashed.map((f) => fermentableItem(f, 'add')),
        ...doc.hops.filter((h) => h.use === 'mash').map((h) => hopItem(h, 'add')),
        ...doc.miscs.filter((m) => m.use === 'mash').map((m) => miscItem(m, 'add')),
      ],
      measure: ['mashPh'],
    });
    // 4. Rests.
    for (const s of mashSteps) {
      steps.push({
        id: `mash:${s.id}`,
        kind: 'mashStep',
        name: s.name,
        tempC: s.tempC,
        timerMin: s.timeMin,
        ...(s.infuseL ? { volumeL: s.infuseL } : {}),
        items: [],
      });
    }
    // 5. Lautering: first-wort hops go into the kettle now.
    const firstWort = doc.hops.filter((h) => h.use === 'first_wort').map((h) => hopItem(h, 'add'));
    const spargeAdds = doc.miscs.filter((m) => m.use === 'sparge').map((m) => miscItem(m, 'add'));
    if (v.spargeL > 0.01) {
      steps.push({
        id: 'sparge',
        kind: 'sparge',
        volumeL: v.spargeL,
        tempC: doc.mash.spargeTempC ?? DEFAULT_SPARGE_C,
        items: [...spargeWater.map((a) => waterItem(a, 'add')), ...spargeAdds, ...firstWort],
      });
    } else {
      steps.push({ id: 'lauter', kind: 'lauter', items: [...spargeAdds, ...firstWort] });
    }
  } else if (steeped.length) {
    steps.push({
      id: 'steep',
      kind: 'steep',
      tempC: DEFAULT_STEEP.tempC,
      timerMin: DEFAULT_STEEP.timeMin,
      volumeL: v.preBoilL,
      items: [...[...mashWater, ...spargeWater].map((a) => waterItem(a, 'add')), ...steeped.map((f) => fermentableItem(f, 'add'))],
    });
  }

  // 6. Before the boil: measure, and get the correction in time.
  steps.push({
    id: 'preBoil',
    kind: 'preBoil',
    // Extract brews without steeping: the water additions go into the kettle.
    items: mashed.length || steeped.length ? [] : [...mashWater, ...spargeWater].map((a) => waterItem(a, 'add')),
    measure: ['preBoilGravity', 'preBoilVolumeL'],
    target: { gravity: calc.preBoilGravity, volumeL: v.preBoilL },
  });

  // 7. Boil with its additions, counted down to the end of the boil.
  const boilTime = doc.boilTimeMin;
  const boilItems: BrewDayItem[] = [
    ...doc.fermentables.filter((f) => f.use === 'boil').map((f) => fermentableItem(f, 'add', boilTime)),
    ...doc.hops.filter((h) => h.use === 'boil').map((h) => hopItem(h, 'add', Math.min(h.timeMin, boilTime))),
    ...doc.miscs.filter((m) => m.use === 'boil').map((m) => miscItem(m, 'add', Math.min(m.timeMin ?? 10, boilTime))),
  ].sort((a, b) => (b.atMin ?? 0) - (a.atMin ?? 0));
  if (boilTime > 0) {
    steps.push({ id: 'boil', kind: 'boil', timerMin: boilTime, items: boilItems, measure: ['postBoilVolumeL'], target: { volumeL: v.postBoilHotL } });
  }

  // 8. Whirlpool / hop stand.
  const wpHops = doc.hops.filter((h) => h.use === 'whirlpool');
  const wpMiscs = doc.miscs.filter((m) => m.use === 'whirlpool');
  if (wpHops.length || wpMiscs.length) {
    const length = Math.max(10, ...wpHops.map((h) => h.timeMin));
    steps.push({
      id: 'whirlpool',
      kind: 'whirlpool',
      timerMin: length,
      tempC: wpHops.find((h) => h.tempC != null)?.tempC ?? null,
      items: [...wpHops.map((h) => hopItem(h, 'add', Math.min(h.timeMin, length))), ...wpMiscs.map((m) => miscItem(m, 'add', length))].sort((a, b) => (b.atMin ?? 0) - (a.atMin ?? 0)),
    });
  }

  // 9.–11. Chill, measure, pitch.
  const pitchTemp = doc.fermentation[0]?.tempC ?? doc.cultures.find((c) => c.tempMinC != null)?.tempMinC ?? 19;
  steps.push({ id: 'chill', kind: 'chill', tempC: pitchTemp, items: [] });
  steps.push({
    id: 'measureOg',
    kind: 'measureOg',
    items: eq.topUpWaterL > 0 ? [{ key: 'add:topup', kind: 'water', name: 'water', amount: eq.topUpWaterL, amountKind: 'volume' }] : [],
    measure: ['og', 'fermenterVolumeL'],
    target: { gravity: calc.og, volumeL: doc.batchSizeL },
  });
  steps.push({
    id: 'pitch',
    kind: 'pitch',
    tempC: pitchTemp,
    items: doc.cultures.map((c) => ({ key: `add:${c.id}`, kind: 'culture', name: c.name, amount: c.amount, amountKind: c.amountKind })),
  });
  return steps;
}

// ---- Measurements ------------------------------------------------------------------------------------------

/**
 * Brewhouse efficiency (%) implied by a measurement. Compares the extract (gravity points × volume)
 * measured before the boil or in the fermenter with what the recipe expects there.
 */
export function measuredEfficiency(
  doc: RecipeDoc,
  calc: RecipeCalc,
  at: 'preBoil' | 'fermenter',
  m: { gravity: number; volumeL: number },
): number | null {
  const eq = doc.equipment ?? DEFAULT_EQUIPMENT;
  if (m.gravity <= 1 || m.volumeL <= 0) return null;
  let expected: number;
  let measured: number;
  if (at === 'preBoil') {
    // The kettle volume is read hot; gravity points refer to cooled wort.
    const coldPreBoil = calc.volumes.preBoilL * (1 - eq.coolingShrinkagePct / 100);
    expected = points(calc.preBoilGravity) * coldPreBoil;
    measured = points(m.gravity) * m.volumeL * (1 - eq.coolingShrinkagePct / 100);
  } else {
    // Only extract from the brewhouse (sugars added in the fermenter come later).
    const kettlePoints = calc.fermentables.reduce((sum, f, i) => sum + (doc.fermentables[i]?.use === 'fermentation' ? 0 : f.points), 0);
    expected = kettlePoints * doc.batchSizeL;
    measured = points(m.gravity) * m.volumeL;
  }
  return expected > 0 ? (doc.efficiencyPct * measured) / expected : null;
}

export type GravityCorrection =
  | { kind: 'ok' }
  /** Too strong: add this much water. */
  | { kind: 'dilute'; waterL: number }
  /** Too weak: add this much dry malt extract, or (before the boil) boil this much longer. */
  | { kind: 'strengthen'; extractKg: number; extraBoilMin: number | null };

/** Gravity within this many points of the target needs no correction. */
export const GRAVITY_TOLERANCE_POINTS = 2;

/** What to do about a gravity that misses its target (dry malt extract assumed at 1.044). */
export function gravityCorrection(current: number, volumeL: number, target: number, boilOffLPerH?: number): GravityCorrection {
  const diff = points(current) - points(target);
  if (Math.abs(diff) <= GRAVITY_TOLERANCE_POINTS || volumeL <= 0) return { kind: 'ok' };
  if (diff > 0) return { kind: 'dilute', waterL: dilutionToTarget(current, volumeL, target) };
  // Boiling off water concentrates the wort: volume that reaches the target gravity.
  const neededL = (volumeL * points(current)) / points(target);
  const extraBoilMin = boilOffLPerH && boilOffLPerH > 0 ? ((volumeL - neededL) / boilOffLPerH) * 60 : null;
  return { kind: 'strengthen', extractKg: extractToTarget(current, volumeL, target), extraBoilMin };
}

// ---- Fermentation schedule ---------------------------------------------------------------------------------

export interface FermentationEvent {
  /** Day of fermentation (0 = brew day). */
  day: number;
  kind: 'step' | 'dryHop' | 'dryHopOut' | 'addition';
  name: string;
  tempC?: number;
  amount?: number;
  amountKind?: AmountKind;
}

/** Temperature steps, dry hops and fermenter additions by day. */
export function fermentationSchedule(doc: RecipeDoc): FermentationEvent[] {
  const events: FermentationEvent[] = [];
  let day = 0;
  for (const s of doc.fermentation) {
    events.push({ day, kind: 'step', name: s.name, tempC: s.tempC });
    day += s.days;
  }
  for (const h of doc.hops.filter((x) => x.use === 'dry_hop')) {
    const start = h.day ?? 0;
    events.push({ day: start, kind: 'dryHop', name: h.name, amount: h.amountKg, amountKind: 'mass' });
    if (h.durationDays) events.push({ day: start + h.durationDays, kind: 'dryHopOut', name: h.name });
  }
  for (const m of doc.miscs.filter((x) => x.use === 'fermentation')) {
    events.push({ day: m.timeMin != null ? m.timeMin : 0, kind: 'addition', name: m.name, amount: m.amount, amountKind: m.amountKind });
  }
  return events.sort((a, b) => a.day - b.day);
}
