import { Ajv2020 } from 'ajv/dist/2020.js';
import {
  equipmentDataSchema,
  parseLibraryData,
  recipeDocSchema,
  type CultureData,
  type CultureLine,
  type EquipmentData,
  type FermentableData,
  type FermentableLine,
  type HopData,
  type HopLine,
  type ImportedLibraryItem,
  type ImportPreview,
  type MiscData,
  type MiscLine,
  type RecipeDoc,
  type StyleData,
  type WaterData,
} from '@brew/shared';
import { calculateRecipe } from '@brew/brewcalc';
import beerSchema from '../beerjson-schema/beer.json';
import boilSchema from '../beerjson-schema/boil.json';
import boilStepSchema from '../beerjson-schema/boil_step.json';
import cultureSchema from '../beerjson-schema/culture.json';
import equipmentSchema from '../beerjson-schema/equipment.json';
import fermentableSchema from '../beerjson-schema/fermentable.json';
import fermentationSchema from '../beerjson-schema/fermentation.json';
import fermentationStepSchema from '../beerjson-schema/fermentation_step.json';
import hopSchema from '../beerjson-schema/hop.json';
import mashSchema from '../beerjson-schema/mash.json';
import mashStepSchema from '../beerjson-schema/mash_step.json';
import unitsSchema from '../beerjson-schema/measureable_units.json';
import miscSchema from '../beerjson-schema/misc.json';
import packagingSchema from '../beerjson-schema/packaging.json';
import packagingGraphicSchema from '../beerjson-schema/packaging_graphic.json';
import packagingVesselSchema from '../beerjson-schema/packaging_vessel.json';
import recipeSchema from '../beerjson-schema/recipe.json';
import styleSchema from '../beerjson-schema/style.json';
import timingSchema from '../beerjson-schema/timing.json';
import waterSchema from '../beerjson-schema/water.json';
import { arr, bj, bjRange, clamp, isObj, newId, num, q, quantity, str, type J } from './util';

// ---- Validation (BeerJSON 3.0 schemas, JSON Schema 2020-12) ---------------------------------------

let validator: ReturnType<Ajv2020['compile']> | undefined;

/** Validate a BeerJSON document; returns readable problems (empty when valid). */
export function validateBeerJson(doc: unknown): string[] {
  if (!validator) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    for (const s of [unitsSchema, timingSchema, fermentableSchema, hopSchema, cultureSchema, miscSchema, waterSchema, styleSchema, equipmentSchema, mashStepSchema, mashSchema, fermentationStepSchema, fermentationSchema, boilStepSchema, boilSchema, packagingGraphicSchema, packagingVesselSchema, packagingSchema, recipeSchema]) {
      ajv.addSchema(s as object);
    }
    validator = ajv.compile(beerSchema as object);
  }
  if (validator(doc)) return [];
  return (validator.errors ?? []).slice(0, 20).map((e) => `${e.instancePath || '/'} ${e.message ?? 'is invalid'}`);
}

// ---- Enum mapping --------------------------------------------------------------------------------

const FERMENTABLE_TYPE_IN: Record<string, FermentableData['type']> = {
  grain: 'grain',
  sugar: 'sugar',
  extract: 'extract',
  'dry extract': 'dry_extract',
  fruit: 'fruit',
  juice: 'juice',
  honey: 'honey',
  other: 'other',
};
const FERMENTABLE_TYPE_OUT: Record<FermentableData['type'], string> = {
  grain: 'grain',
  sugar: 'sugar',
  extract: 'extract',
  dry_extract: 'dry extract',
  adjunct: 'other',
  fruit: 'fruit',
  juice: 'juice',
  honey: 'honey',
  other: 'other',
};
const GRAIN_GROUP_IN: Record<string, FermentableData['grainGroup']> = {
  base: 'base',
  caramel: 'caramel',
  flaked: 'adjunct',
  roasted: 'roasted',
  specialty: 'specialty',
  smoked: 'smoked',
  adjunct: 'adjunct',
};
const CULTURE_TYPE_IN: Record<string, CultureData['type']> = {
  ale: 'ale',
  lager: 'lager',
  wheat: 'wheat',
  wine: 'wine',
  champagne: 'champagne',
  kveik: 'kveik',
  brett: 'brett',
  lacto: 'lacto',
  pedio: 'pedio',
  'mixed-culture': 'mixed',
  bacteria: 'other',
  malolactic: 'other',
  spontaneous: 'mixed',
  other: 'other',
};
const CULTURE_TYPE_OUT: Record<CultureData['type'], string> = {
  ale: 'ale',
  lager: 'lager',
  wheat: 'wheat',
  wine: 'wine',
  champagne: 'champagne',
  kveik: 'kveik',
  brett: 'brett',
  lacto: 'lacto',
  pedio: 'pedio',
  mixed: 'mixed-culture',
  other: 'other',
};
const MISC_TYPE_IN: Record<string, MiscData['type']> = {
  spice: 'spice',
  fining: 'fining',
  'water agent': 'water_agent',
  herb: 'herb',
  flavor: 'flavor',
  wood: 'wood',
  other: 'other',
};
const MISC_TYPE_OUT: Record<MiscData['type'], string> = {
  spice: 'spice',
  fining: 'fining',
  water_agent: 'water agent',
  herb: 'herb',
  flavor: 'flavor',
  wood: 'wood',
  nutrient: 'other',
  enzyme: 'other',
  other: 'other',
};
const FLOC_IN: Record<string, CultureData['flocculation']> = {
  'very low': 'very_low',
  low: 'low',
  'medium low': 'low',
  medium: 'medium',
  'medium high': 'high',
  high: 'high',
  'very high': 'very_high',
};
const HOP_FORM_IN: Record<string, HopData['form']> = {
  extract: 'extract',
  leaf: 'leaf',
  'leaf (wet)': 'leaf',
  pellet: 'pellet',
  powder: 'cryo',
  plug: 'plug',
};
const HOP_FORM_OUT: Record<HopData['form'], string> = { pellet: 'pellet', leaf: 'leaf', plug: 'plug', cryo: 'powder', extract: 'extract' };

const pick = <T>(map: Record<string, T>, v: unknown, fallback: T): T => map[str(v).toLowerCase()] ?? fallback;

// ---- Ingredients: BeerJSON → app ---------------------------------------------------------------------

function fermentableData(f: J): FermentableData {
  const type = pick(FERMENTABLE_TYPE_IN, f.type, 'other');
  const potential =
    bj(f.yield?.potential, 'gravity') ??
    (num(f.yield?.fine_grind?.value) !== null ? 1 + (num(f.yield.fine_grind.value)! / 100) * 0.04621 : null);
  return parseLibraryData('fermentable', {
    name: str(f.name, 120) || 'Fermentable',
    type,
    grainGroup: GRAIN_GROUP_IN[str(f.grain_group)] ?? null,
    producer: str(f.producer, 120),
    origin: str(f.origin, 120),
    productId: str(f.product_id, 120),
    colorEbc: clamp(bj(f.color, 'color') ?? 0, 0, 10000),
    potentialSg: clamp(potential ?? 1.037, 1, 1.05),
    fermentability: num(f.fermentability?.value) !== null ? clamp(num(f.fermentability.value)! / 100, 0, 1.2) : 1,
    moisturePct: bj(f.moisture, 'percent'),
    proteinPct: bj(f.protein, 'percent'),
    diastaticPower: bj(f.diastatic_power, 'diastaticPower'),
    maxInBatchPct: bj(f.max_in_batch, 'percent'),
    recommendMash: f.recommend_mash ?? type === 'grain',
    notes: str(f.notes),
  });
}

function hopData(h: J): HopData {
  const purpose = str(h.type).toLowerCase();
  return parseLibraryData('hop', {
    name: str(h.name, 120) || 'Hop',
    producer: str(h.producer, 120),
    origin: str(h.origin, 120),
    form: pick(HOP_FORM_IN, h.form, 'pellet'),
    purpose: purpose.includes('bittering') && purpose.includes('aroma') ? 'dual' : purpose.includes('bittering') ? 'bittering' : purpose.includes('aroma') ? 'aroma' : null,
    alphaPct: clamp(bj(h.alpha_acid, 'percent') ?? 5, 0, 100),
    betaPct: bj(h.beta_acid, 'percent'),
    cohumulonePct: bj(h.oil_content?.cohumulone, 'percent'),
    totalOil: num(h.oil_content?.total_oil_ml_per_100g),
    substitutes: str(h.substitutes, 500),
    notes: str(h.notes),
  });
}

function cultureData(c: J): CultureData {
  const att = bjRange(c.attenuation_range, 'percent');
  const temp = bjRange(c.temperature_range, 'temperature');
  return parseLibraryData('culture', {
    name: str(c.name, 120) || 'Yeast',
    producer: str(c.producer, 120),
    productId: str(c.product_id, 120),
    type: pick(CULTURE_TYPE_IN, c.type, 'ale'),
    form: ['dry', 'liquid', 'slant', 'culture', 'dregs'].includes(str(c.form)) ? str(c.form) : 'dry',
    attenuationMinPct: att[0],
    attenuationMaxPct: att[1],
    tempMinC: temp[0],
    tempMaxC: temp[1],
    flocculation: FLOC_IN[str(c.flocculation)] ?? null,
    alcoholTolerancePct: bj(c.alcohol_tolerance, 'percent'),
    bestFor: str(c.best_for, 500),
    notes: str(c.notes),
  });
}

function miscData(m: J): MiscData {
  return parseLibraryData('misc', {
    name: str(m.name, 120) || 'Ingredient',
    type: pick(MISC_TYPE_IN, m.type, 'other'),
    producer: str(m.producer, 120),
    productId: str(m.product_id, 120),
    useFor: str(m.use_for, 500),
    notes: str(m.notes),
  });
}

function waterData(w: J): WaterData {
  const ppm = (v: J) => Math.max(0, bj(v, 'concentration') ?? 0);
  return parseLibraryData('water', {
    name: str(w.name, 120) || 'Water',
    role: 'source',
    calcium: ppm(w.calcium),
    magnesium: ppm(w.magnesium),
    sodium: ppm(w.sodium),
    sulfate: ppm(w.sulfate),
    chloride: ppm(w.chloride),
    bicarbonate: ppm(w.bicarbonate),
    ph: num(w.pH?.value ?? w.pH),
    notes: str(w.notes),
  });
}

function styleData(s: J): StyleData {
  const type = str(s.type).toLowerCase();
  return parseLibraryData('style', {
    name: str(s.name, 120) || 'Style',
    guide: str(s.style_guide, 60),
    category: str(s.category, 120),
    categoryNumber: str(s.category_number, 10),
    styleLetter: str(s.style_letter, 10),
    type: ['beer', 'cider', 'mead', 'wine'].includes(type) ? type : 'other',
    og: bjRange(s.original_gravity, 'gravity'),
    fg: bjRange(s.final_gravity, 'gravity'),
    ibu: bjRange(s.international_bitterness_units, 'bitterness'),
    colorEbc: bjRange(s.color, 'color'),
    abvPct: bjRange(s.alcohol_by_volume, 'percent'),
    carbVols: bjRange(s.carbonation, 'carbonation'),
    notes: str(s.notes),
    profile: [s.aroma, s.appearance, s.flavor, s.mouthfeel, s.overall_impression].map((x) => str(x)).filter(Boolean).join('\n\n').slice(0, 8000),
    ingredients: str(s.ingredients),
    examples: str(s.examples, 2000),
  });
}

function equipmentData(e: J): EquipmentData {
  const items = arr(e.equipment_items);
  const byForm = (form: string) => items.find((i) => str(i.form) === form);
  const tun = byForm('Mash Tun') ?? byForm('Lauter Tun');
  const kettle = byForm('Brew Kettle');
  const fermenter = byForm('Fermenter');
  return equipmentDataSchema.parse({
    name: str(e.name, 120) || 'Equipment',
    mashTunVolumeL: bj(tun?.maximum_volume, 'volume'),
    mashTunDeadspaceL: bj(tun?.loss, 'volume') ?? 0,
    grainAbsorptionLPerKg: clamp(bj(tun?.grain_absorption_rate, 'specificVolume') ?? 0.96, 0, 5),
    kettleVolumeL: bj(kettle?.maximum_volume, 'volume'),
    kettleLossL: bj(kettle?.loss, 'volume') ?? 1,
    boilOffLPerH: bj(kettle?.boil_rate_per_hour, 'volume') ?? 3,
    fermenterVolumeL: bj(fermenter?.maximum_volume, 'volume'),
    fermenterLossL: bj(fermenter?.loss, 'volume') ?? 0.5,
    notes: [tun, kettle, fermenter].map((i) => str(i?.notes)).filter(Boolean).join('\n'),
  });
}

// ---- Recipes: BeerJSON → app -----------------------------------------------------------------------

function recipeFromBeerJson(r: J, warnings: string[]): RecipeDoc {
  const name = str(r.name, 120) || 'Imported recipe';
  const warn = (msg: string) => warnings.push(`${name}: ${msg}`);
  const boilTime = bj(r.boil?.boil_time, 'time') ?? 60;
  const type = str(r.type);
  const ing = r.ingredients ?? {};

  const fermentables: FermentableLine[] = arr(ing.fermentable_additions).map((f) => {
    const data = fermentableData(f);
    const amount = quantity(f.amount);
    let amountKg = 0;
    if (amount?.kind === 'mass') amountKg = amount.kg;
    else if (amount?.kind === 'volume') {
      // Liquids (syrups, extract, juice): ~1.4 kg/L for extract and honey, ~1 kg/L otherwise.
      amountKg = amount.l * (data.type === 'extract' || data.type === 'honey' ? 1.4 : 1.05);
      warn(`${data.name} was given by volume; converted to weight`);
    }
    const use = str(f.timing?.use);
    return {
      id: newId(),
      libraryRef: null,
      name: data.name,
      type: data.type,
      grainGroup: data.grainGroup,
      producer: data.producer,
      origin: data.origin,
      colorEbc: data.colorEbc,
      potentialSg: data.potentialSg,
      fermentability: data.fermentability,
      amountKg,
      use:
        use === 'add_to_boil'
          ? 'boil'
          : use === 'add_to_fermentation' || use === 'add_to_package'
            ? 'fermentation'
            : use === 'add_to_mash' || data.type === 'grain'
              ? type === 'extract'
                ? 'steep'
                : 'mash'
              : 'boil',
    };
  });

  const hops: HopLine[] = arr(ing.hop_additions).map((h) => {
    const data = hopData(h);
    const amount = quantity(h.amount);
    const use = str(h.timing?.use);
    const time = bj(h.timing?.time, 'time');
    const duration = bj(h.timing?.duration, 'time');
    let line: Pick<HopLine, 'use' | 'timeMin' | 'tempC' | 'day' | 'durationDays'>;
    if (use === 'add_to_mash') line = { use: 'mash', timeMin: boilTime, tempC: null, day: null, durationDays: null };
    else if (use === 'add_to_fermentation' || use === 'add_to_package')
      line = { use: 'dry_hop', timeMin: 0, tempC: null, day: time === null ? null : time / 1440, durationDays: duration === null ? null : duration / 1440 };
    // Hop stand: added at the end of the boil (time 0) and left in for `duration`.
    else if (time === 0 && (duration ?? 0) > 0) line = { use: 'whirlpool', timeMin: duration!, tempC: null, day: null, durationDays: null };
    // Boil: the spec puts the boil time in `time`; Brewfather puts it in `duration` instead.
    else line = { use: 'boil', timeMin: Math.min(time ?? duration ?? boilTime, 1000), tempC: null, day: null, durationDays: null };
    if (amount && amount.kind !== 'mass') warn(`${data.name} amount is not a weight and was set to 0`);
    return {
      id: newId(),
      libraryRef: null,
      name: data.name,
      producer: data.producer,
      origin: data.origin,
      form: data.form,
      alphaPct: data.alphaPct,
      betaPct: data.betaPct,
      amountKg: amount?.kind === 'mass' ? amount.kg : 0,
      ...line,
    };
  });

  const cultures: CultureLine[] = arr(ing.culture_additions).map((c) => {
    const data = cultureData(c);
    const amount = quantity(c.amount);
    return {
      id: newId(),
      libraryRef: null,
      name: data.name,
      producer: data.producer,
      productId: data.productId,
      type: data.type,
      form: data.form,
      attenuationPct: bj(c.attenuation, 'percent') ?? data.attenuationMaxPct ?? data.attenuationMinPct,
      tempMinC: data.tempMinC,
      tempMaxC: data.tempMaxC,
      amountKind: amount?.kind ?? 'count',
      amount: amount ? (amount.kind === 'mass' ? amount.kg : amount.kind === 'volume' ? amount.l : amount.n) : 1,
    };
  });

  const miscs: MiscLine[] = arr(ing.miscellaneous_additions).map((m) => {
    const data = miscData(m);
    const amount = quantity(m.amount);
    const use = str(m.timing?.use);
    // Boil time in `time` (spec) or in `duration` (Brewfather).
    const time = bj(m.timing?.time, 'time') ?? bj(m.timing?.duration, 'time');
    return {
      id: newId(),
      libraryRef: null,
      name: data.name,
      type: data.type,
      producer: data.producer,
      amountKind: amount?.kind ?? 'mass',
      amount: amount ? (amount.kind === 'mass' ? amount.kg : amount.kind === 'volume' ? amount.l : amount.n) : 0,
      use: use === 'add_to_mash' ? 'mash' : use === 'add_to_fermentation' ? 'fermentation' : use === 'add_to_package' ? 'packaging' : 'boil',
      timeMin: time,
      notes: '',
    };
  });

  let spargeTempC: number | null = null;
  const steps = arr(r.mash?.mash_steps).flatMap((s) => {
    const stepType = str(s.type);
    if (stepType === 'sparge' || stepType === 'drain mash tun') {
      if (stepType === 'sparge') spargeTempC = bj(s.step_temperature, 'temperature');
      return [];
    }
    return [
      {
        id: newId(),
        name: str(s.name, 80) || 'Step',
        type: stepType === 'infusion' ? 'infusion' : stepType === 'decoction' ? 'decoction' : 'temperature',
        tempC: clamp(bj(s.step_temperature, 'temperature') ?? 67, 0, 105),
        timeMin: clamp(bj(s.step_time, 'time') ?? 60, 0, 1440),
        rampMin: bj(s.ramp_time, 'time'),
        infuseL: bj(s.amount, 'volume'),
      } as const,
    ];
  });

  const fermentation = arr(r.fermentation?.fermentation_steps).map((s) => ({
    id: newId(),
    name: str(s.name, 80) || 'Fermentation',
    tempC: clamp(bj(s.end_temperature, 'temperature') ?? bj(s.start_temperature, 'temperature') ?? 19, -5, 50),
    days: clamp((bj(s.step_time, 'time') ?? 10080) / 1440, 0, 1000),
    rampDays: null,
  }));

  const style = isObj(r.style)
    ? {
        libraryRef: null,
        name: str(r.style.name, 120) || 'Style',
        guide: str(r.style.style_guide, 60),
        category: str(r.style.category, 120),
        categoryNumber: str(r.style.category_number, 10),
        styleLetter: str(r.style.style_letter, 10),
        og: bjRange(r.style.original_gravity, 'gravity'),
        fg: bjRange(r.style.final_gravity, 'gravity'),
        ibu: bjRange(r.style.international_bitterness_units, 'bitterness'),
        colorEbc: bjRange(r.style.color, 'color'),
        abvPct: bjRange(r.style.alcohol_by_volume, 'percent'),
        carbVols: bjRange(r.style.carbonation, 'carbonation'),
      }
    : null;

  return recipeDocSchema.parse({
    name,
    type: type === 'all grain' ? 'all_grain' : type === 'partial mash' ? 'partial_mash' : type === 'extract' ? 'extract' : 'other',
    author: str(r.author, 120),
    batchSizeL: clamp(bj(r.batch_size, 'volume') ?? 20, 0.1, 100000),
    boilTimeMin: clamp(boilTime, 0, 600),
    efficiencyPct: clamp(bj(r.efficiency?.brewhouse, 'percent') ?? 72, 10, 100),
    style,
    fermentables,
    hops,
    cultures,
    miscs,
    mash: { name: str(r.mash?.name, 120), spargeTempC, steps },
    fermentation,
    carbonationVols: num(r.carbonation),
    notes: str(r.notes, 20000),
  });
}

/** Read a BeerJSON document: recipes plus any library sections (fermentables, hops, …). */
export function importBeerJson(input: unknown): ImportPreview {
  const warnings: string[] = [];
  const root = isObj(input) && isObj(input.beerjson) ? (input.beerjson as J) : null;
  if (!root) throw new Error('Not a BeerJSON file (no "beerjson" object)');
  const problems = validateBeerJson(input);
  if (problems.length) warnings.push(`The file does not fully follow BeerJSON 3.0; read what could be understood (${problems[0]})`);

  const safe = <T>(what: string, fn: () => T): T[] => {
    try {
      return [fn()];
    } catch (err) {
      warnings.push(`Skipped ${what}: ${(err as Error).message}`);
      return [];
    }
  };
  const library: ImportedLibraryItem[] = [
    ...arr(root.fermentables).flatMap((x) => safe('a fermentable', () => ({ kind: 'fermentable' as const, data: fermentableData(x) }))),
    ...arr(root.hop_varieties).flatMap((x) => safe('a hop', () => ({ kind: 'hop' as const, data: hopData(x) }))),
    ...arr(root.cultures).flatMap((x) => safe('a culture', () => ({ kind: 'culture' as const, data: cultureData(x) }))),
    ...arr(root.miscellaneous_ingredients).flatMap((x) => safe('an ingredient', () => ({ kind: 'misc' as const, data: miscData(x) }))),
    ...arr(root.profiles).flatMap((x) => safe('a water profile', () => ({ kind: 'water' as const, data: waterData(x) }))),
    ...arr(root.styles).flatMap((x) => safe('a style', () => ({ kind: 'style' as const, data: styleData(x) }))),
  ];
  return {
    format: 'beerjson',
    recipes: arr(root.recipes).flatMap((r) => safe(`recipe "${str(r?.name)}"`, () => recipeFromBeerJson(r, warnings))),
    library,
    equipment: arr(root.equipments).flatMap((e) => safe('an equipment profile', () => equipmentData(e))),
    warnings,
  };
}

// ---- Export: app → BeerJSON ------------------------------------------------------------------------------

function timing(use: string, time?: number | null, duration?: number | null, timeUnit = 'min') {
  const t: J = { use };
  if (time != null) t.time = q(time, timeUnit);
  if (duration != null) t.duration = q(duration, timeUnit);
  return t;
}

const amountOut = (kind: 'mass' | 'volume' | 'count', value: number) =>
  kind === 'mass' ? q(value, 'kg') : kind === 'volume' ? q(value, 'l') : q(value, 'each');

export function recipeToBeerJson(doc: RecipeDoc): J {
  const calc = calculateRecipe(doc);
  const recipe: J = {
    name: doc.name,
    type: doc.type === 'all_grain' ? 'all grain' : doc.type === 'partial_mash' ? 'partial mash' : doc.type === 'extract' ? 'extract' : 'other',
    author: doc.author,
    batch_size: q(doc.batchSizeL, 'l'),
    efficiency: { brewhouse: q(doc.efficiencyPct, '%') },
    ingredients: {
      fermentable_additions: doc.fermentables.map((f) => ({
        name: f.name,
        type: FERMENTABLE_TYPE_OUT[f.type],
        ...(f.grainGroup && f.grainGroup !== 'other' && { grain_group: f.grainGroup }),
        ...(f.producer && { producer: f.producer }),
        ...(f.origin && { origin: f.origin }),
        yield: { potential: q(f.potentialSg, 'sg') },
        color: q(f.colorEbc, 'EBC'),
        amount: q(f.amountKg, 'kg'),
        timing: timing(f.use === 'mash' || f.use === 'steep' ? 'add_to_mash' : f.use === 'boil' ? 'add_to_boil' : 'add_to_fermentation'),
      })),
      ...(doc.hops.length && {
        hop_additions: doc.hops.map((h) => ({
          name: h.name,
          ...(h.producer && { producer: h.producer }),
          ...(h.origin && { origin: h.origin }),
          form: HOP_FORM_OUT[h.form],
          alpha_acid: q(h.alphaPct, '%'),
          ...(h.betaPct != null && { beta_acid: q(h.betaPct, '%') }),
          amount: q(h.amountKg, 'kg'),
          timing:
            h.use === 'dry_hop'
              ? timing('add_to_fermentation', h.day, h.durationDays, 'day')
              : h.use === 'mash'
                ? timing('add_to_mash', doc.boilTimeMin)
                : h.use === 'whirlpool'
                  ? timing('add_to_boil', 0, h.timeMin)
                  : timing('add_to_boil', h.use === 'first_wort' ? doc.boilTimeMin : h.timeMin),
        })),
      }),
      ...(doc.cultures.length && {
        culture_additions: doc.cultures.map((c) => ({
          name: c.name,
          type: CULTURE_TYPE_OUT[c.type],
          form: c.form,
          ...(c.producer && { producer: c.producer }),
          ...(c.productId && { product_id: c.productId }),
          ...(c.attenuationPct != null && { attenuation: q(c.attenuationPct, '%') }),
          amount: amountOut(c.amountKind, c.amount),
        })),
      }),
      ...(doc.miscs.length && {
        miscellaneous_additions: doc.miscs.map((m) => ({
          name: m.name,
          type: MISC_TYPE_OUT[m.type],
          ...(m.producer && { producer: m.producer }),
          amount: amountOut(m.amountKind, m.amount),
          timing: timing(
            m.use === 'mash' || m.use === 'sparge' ? 'add_to_mash' : m.use === 'fermentation' ? 'add_to_fermentation' : m.use === 'packaging' ? 'add_to_package' : 'add_to_boil',
            m.use === 'boil' ? m.timeMin : null,
          ),
        })),
      }),
    },
    boil: { pre_boil_size: q(calc.volumes.preBoilL, 'l'), boil_time: q(doc.boilTimeMin, 'min') },
    original_gravity: q(calc.og, 'sg'),
    final_gravity: q(calc.fg, 'sg'),
    alcohol_by_volume: q(calc.abvPct, '%'),
    ibu_estimate: { method: 'Tinseth' },
    color_estimate: q(calc.colorEbc, 'EBC'),
  };
  if (doc.notes) recipe.notes = doc.notes;
  if (doc.carbonationVols != null) recipe.carbonation = doc.carbonationVols;
  if (doc.style) {
    recipe.style = {
      name: doc.style.name,
      category: doc.style.category || doc.style.name,
      style_guide: doc.style.guide || 'unknown',
      type: 'beer',
      ...(doc.style.categoryNumber && { category_number: Number(doc.style.categoryNumber) || undefined }),
      ...(/^[A-Z ]+$/.test(doc.style.styleLetter) && { style_letter: doc.style.styleLetter }),
    };
    if (recipe.style.category_number === undefined) delete recipe.style.category_number;
  }
  if (doc.mash.steps.length || doc.mash.spargeTempC != null) {
    recipe.mash = {
      name: doc.mash.name || 'Mash',
      grain_temperature: q((doc.equipment ?? { grainTempC: 20 }).grainTempC, 'C'),
      mash_steps: [
        ...doc.mash.steps.map((s) => ({
          name: s.name,
          type: s.type,
          step_temperature: q(s.tempC, 'C'),
          step_time: q(s.timeMin, 'min'),
          ...(s.rampMin != null && { ramp_time: q(s.rampMin, 'min') }),
          ...(s.infuseL != null && { amount: q(s.infuseL, 'l') }),
        })),
        ...(doc.mash.spargeTempC != null
          ? [{ name: 'Sparge', type: 'sparge', step_temperature: q(doc.mash.spargeTempC, 'C'), step_time: q(0, 'min'), amount: q(calc.volumes.spargeL, 'l') }]
          : []),
      ],
    };
  }
  if (doc.fermentation.length) {
    recipe.fermentation = {
      name: 'Fermentation',
      fermentation_steps: doc.fermentation.map((s) => ({
        name: s.name,
        end_temperature: q(s.tempC, 'C'),
        step_time: q(s.days, 'day'),
      })),
    };
  }
  return recipe;
}

export function exportBeerJson(docs: RecipeDoc[]): J {
  return { beerjson: { version: 3, recipes: docs.map(recipeToBeerJson) } };
}
