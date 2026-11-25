import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import {
  ebcToSrm,
  equipmentDataSchema,
  lovibondToSrm,
  parseLibraryData,
  recipeDocSchema,
  srmToEbc,
  srmToLovibond,
  type CultureData,
  type EquipmentData,
  type FermentableData,
  type HopData,
  type ImportedLibraryItem,
  type ImportPreview,
  type MiscData,
  type RecipeDoc,
  type StyleData,
  type WaterData,
} from '@brew/shared';
import { calculateRecipe } from '@brew/brewcalc';
import { arr, clamp, newId, num, round, str, type J } from './util';

/**
 * BeerXML 1.0 (http://www.beerxml.com). Units are fixed by the standard: kg, L, °C, minutes,
 * percentages; fermentable colour in °Lovibond (SRM for non-grains), style colour in SRM.
 */

const LIST_TAGS = ['RECIPE', 'HOP', 'FERMENTABLE', 'YEAST', 'MISC', 'WATER', 'STYLE', 'EQUIPMENT', 'MASH', 'MASH_STEP'];

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  isArray: (tag) => LIST_TAGS.includes(tag),
});

const bool = (v: unknown) => str(v).toUpperCase() === 'TRUE';
const n = (v: unknown, fallback = 0) => num(v) ?? fallback;
const lc = (v: unknown) => str(v).toLowerCase();

// ---- Ingredients ----------------------------------------------------------------------------------------

const FERMENTABLE_TYPE: Record<string, FermentableData['type']> = {
  grain: 'grain',
  sugar: 'sugar',
  extract: 'extract',
  'dry extract': 'dry_extract',
  adjunct: 'adjunct',
};

/** BeerXML YIELD (% dry basis, fine grind) → potential SG (sucrose = 1.04621). */
const yieldToPotential = (yieldPct: number) => 1 + (yieldPct / 100) * 0.04621;
const potentialToYield = (sg: number) => ((sg - 1) / 0.04621) * 100;

function fermentableData(f: J): FermentableData {
  const type = FERMENTABLE_TYPE[lc(f.TYPE)] ?? 'other';
  const color = n(f.COLOR);
  // Grain colour is in °Lovibond, everything else in SRM.
  const colorEbc = type === 'grain' || type === 'adjunct' ? srmToEbc(Math.max(0, lovibondToSrm(color))) : srmToEbc(color);
  const potential = num(f.POTENTIAL) ?? (num(f.YIELD) !== null ? yieldToPotential(num(f.YIELD)!) : 1.037);
  const name = str(f.NAME, 120) || 'Fermentable';
  return parseLibraryData('fermentable', {
    name,
    type,
    producer: str(f.SUPPLIER, 120),
    origin: str(f.ORIGIN, 120),
    colorEbc: clamp(round(colorEbc, 2), 0, 5000),
    potentialSg: clamp(potential, 1, 1.05),
    fermentability: /lactose|maltodextrin/i.test(name) ? 0 : 1,
    moisturePct: num(f.MOISTURE),
    proteinPct: num(f.PROTEIN),
    diastaticPower: num(f.DIASTATIC_POWER),
    maxInBatchPct: num(f.MAX_IN_BATCH),
    recommendMash: f.RECOMMEND_MASH === undefined ? type === 'grain' : bool(f.RECOMMEND_MASH),
    notes: str(f.NOTES),
  });
}

const HOP_FORM: Record<string, HopData['form']> = { pellet: 'pellet', plug: 'plug', leaf: 'leaf' };
const HOP_PURPOSE: Record<string, HopData['purpose']> = { bittering: 'bittering', aroma: 'aroma', both: 'dual' };

function hopData(h: J): HopData {
  return parseLibraryData('hop', {
    name: str(h.NAME, 120) || 'Hop',
    origin: str(h.ORIGIN, 120),
    form: HOP_FORM[lc(h.FORM)] ?? 'pellet',
    purpose: HOP_PURPOSE[lc(h.TYPE)] ?? null,
    alphaPct: clamp(n(h.ALPHA, 5), 0, 100),
    betaPct: num(h.BETA),
    cohumulonePct: num(h.COHUMULONE),
    // BeerXML HSI is the % of alpha lost after 6 months.
    hsi: num(h.HSI) === null ? null : clamp(num(h.HSI)! / 100, 0, 1),
    substitutes: str(h.SUBSTITUTES, 500),
    notes: str(h.NOTES),
  });
}

const CULTURE_TYPE: Record<string, CultureData['type']> = { ale: 'ale', lager: 'lager', wheat: 'wheat', wine: 'wine', champagne: 'champagne' };
const CULTURE_FORM: Record<string, CultureData['form']> = { liquid: 'liquid', dry: 'dry', slant: 'slant', culture: 'culture' };
const FLOC: Record<string, CultureData['flocculation']> = { low: 'low', medium: 'medium', high: 'high', 'very high': 'very_high' };

function cultureData(y: J): CultureData {
  const att = num(y.ATTENUATION);
  return parseLibraryData('culture', {
    name: str(y.NAME, 120) || 'Yeast',
    producer: str(y.LABORATORY, 120),
    productId: str(y.PRODUCT_ID, 120),
    type: CULTURE_TYPE[lc(y.TYPE)] ?? 'ale',
    form: CULTURE_FORM[lc(y.FORM)] ?? 'liquid',
    attenuationMinPct: att,
    attenuationMaxPct: att,
    tempMinC: num(y.MIN_TEMPERATURE),
    tempMaxC: num(y.MAX_TEMPERATURE),
    flocculation: FLOC[lc(y.FLOCCULATION)] ?? null,
    bestFor: str(y.BEST_FOR, 500),
    notes: str(y.NOTES),
  });
}

const MISC_TYPE: Record<string, MiscData['type']> = {
  spice: 'spice',
  fining: 'fining',
  'water agent': 'water_agent',
  herb: 'herb',
  flavor: 'flavor',
  other: 'other',
};

function miscData(m: J): MiscData {
  return parseLibraryData('misc', {
    name: str(m.NAME, 120) || 'Ingredient',
    type: MISC_TYPE[lc(m.TYPE)] ?? 'other',
    amountKind: bool(m.AMOUNT_IS_WEIGHT) ? 'mass' : 'volume',
    useFor: str(m.USE_FOR, 500),
    notes: str(m.NOTES),
  });
}

function waterData(w: J): WaterData {
  return parseLibraryData('water', {
    name: str(w.NAME, 120) || 'Water',
    role: 'source',
    calcium: Math.max(0, n(w.CALCIUM)),
    magnesium: Math.max(0, n(w.MAGNESIUM)),
    sodium: Math.max(0, n(w.SODIUM)),
    sulfate: Math.max(0, n(w.SULFATE)),
    chloride: Math.max(0, n(w.CHLORIDE)),
    bicarbonate: Math.max(0, n(w.BICARBONATE)),
    ph: num(w.PH),
    notes: str(w.NOTES),
  });
}

function styleData(s: J): StyleData {
  const type = lc(s.TYPE);
  const pair = (lo: unknown, hi: unknown, f: (x: number) => number = (x) => x): [number | null, number | null] => [
    num(lo) === null ? null : f(num(lo)!),
    num(hi) === null ? null : f(num(hi)!),
  ];
  return parseLibraryData('style', {
    name: str(s.NAME, 120) || 'Style',
    guide: str(s.STYLE_GUIDE, 60),
    category: str(s.CATEGORY, 120),
    categoryNumber: str(s.CATEGORY_NUMBER, 10),
    styleLetter: str(s.STYLE_LETTER, 10),
    type: ['lager', 'ale', 'mead', 'wheat', 'mixed', 'cider'].includes(type) ? (type === 'wheat' ? 'ale' : type) : 'beer',
    og: pair(s.OG_MIN, s.OG_MAX),
    fg: pair(s.FG_MIN, s.FG_MAX),
    ibu: pair(s.IBU_MIN, s.IBU_MAX),
    colorEbc: pair(s.COLOR_MIN, s.COLOR_MAX, (srm) => round(srmToEbc(srm), 1)),
    abvPct: pair(s.ABV_MIN, s.ABV_MAX),
    carbVols: pair(s.CARB_MIN, s.CARB_MAX),
    notes: str(s.NOTES),
    profile: str(s.PROFILE, 8000),
    ingredients: str(s.INGREDIENTS),
    examples: str(s.EXAMPLES, 2000),
  });
}

function equipmentData(e: J): EquipmentData {
  const boilSize = num(e.BOIL_SIZE);
  const evapPct = num(e.EVAP_RATE);
  return equipmentDataSchema.parse({
    name: str(e.NAME, 120) || 'Equipment',
    batchVolumeL: clamp(n(e.BATCH_SIZE, 20), 0.1, 100000),
    boilTimeMin: clamp(n(e.BOIL_TIME, 60), 0, 600),
    mashTunVolumeL: num(e.TUN_VOLUME),
    mashTunDeadspaceL: Math.max(0, n(e.LAUTER_DEADSPACE)),
    // BeerXML evaporation is % of the boil size per hour.
    boilOffLPerH: boilSize !== null && evapPct !== null ? (boilSize * evapPct) / 100 : 3,
    kettleLossL: Math.max(0, n(e.TRUB_CHILLER_LOSS, 1)),
    topUpWaterL: Math.max(0, n(e.TOP_UP_WATER)),
    hopUtilizationPct: clamp(n(e.HOP_UTILIZATION, 100), 10, 200),
    notes: str(e.NOTES),
  });
}

// ---- Recipes -----------------------------------------------------------------------------------------------

function recipeFromBeerXml(r: J, warnings: string[]): RecipeDoc {
  const name = str(r.NAME, 120) || 'Imported recipe';
  const type = lc(r.TYPE);
  const boilTime = n(r.BOIL_TIME, 60);

  const fermentables = arr(r.FERMENTABLES?.FERMENTABLE).map((f) => {
    const d = fermentableData(f);
    const afterBoil = bool(f.ADD_AFTER_BOIL);
    const mashed = d.type === 'grain' || (d.type === 'adjunct' && d.recommendMash);
    return {
      id: newId(),
      libraryRef: null,
      name: d.name,
      type: d.type,
      grainGroup: d.grainGroup,
      producer: d.producer,
      origin: d.origin,
      colorEbc: d.colorEbc,
      potentialSg: d.potentialSg,
      fermentability: d.fermentability,
      amountKg: Math.max(0, n(f.AMOUNT)),
      use: afterBoil ? 'fermentation' : mashed ? (type === 'extract' ? 'steep' : 'mash') : 'boil',
    } as const;
  });

  const hops = arr(r.HOPS?.HOP).map((h) => {
    const d = hopData(h);
    const use = lc(h.USE);
    const time = n(h.TIME);
    const base = { id: newId(), libraryRef: null, name: d.name, origin: d.origin, form: d.form, alphaPct: d.alphaPct, betaPct: d.betaPct, amountKg: Math.max(0, n(h.AMOUNT)), tempC: null, day: null, durationDays: null };
    if (use === 'dry hop') return { ...base, use: 'dry_hop', timeMin: 0, durationDays: time > 0 ? time / 1440 : null } as const;
    if (use === 'mash') return { ...base, use: 'mash', timeMin: boilTime } as const;
    if (use === 'first wort') return { ...base, use: 'first_wort', timeMin: boilTime } as const;
    // "Aroma" is BeerXML's steep / whirlpool after the boil.
    if (use === 'aroma') return { ...base, use: 'whirlpool', timeMin: time } as const;
    return { ...base, use: 'boil', timeMin: Math.min(time, 1000) } as const;
  });

  const cultures = arr(r.YEASTS?.YEAST).map((y) => {
    const d = cultureData(y);
    const amount = num(y.AMOUNT);
    const isWeight = bool(y.AMOUNT_IS_WEIGHT);
    const packs = /^\s*(\d+(?:[.,]\d+)?)\s*(pkg|pack|packs|packet|packets|vial|vials|sachet|sachets)\b/i.exec(str(y.DISPLAY_AMOUNT));
    if (packs) {
      return {
        id: newId(),
        libraryRef: null,
        name: d.name,
        producer: d.producer,
        productId: d.productId,
        type: d.type,
        form: d.form,
        attenuationPct: d.attenuationMaxPct,
        tempMinC: d.tempMinC,
        tempMaxC: d.tempMaxC,
        amountKind: 'count',
        amount: Number(packs[1]!.replace(',', '.')),
      } as const;
    }
    return {
      id: newId(),
      libraryRef: null,
      name: d.name,
      producer: d.producer,
      productId: d.productId,
      type: d.type,
      form: d.form,
      attenuationPct: d.attenuationMaxPct,
      tempMinC: d.tempMinC,
      tempMaxC: d.tempMaxC,
      // BeerXML stores yeast as L or kg; most recipes mean "one pack".
      amountKind: amount === null ? 'count' : isWeight ? 'mass' : 'volume',
      amount: amount ?? 1,
    } as const;
  });

  const miscs = arr(r.MISCS?.MISC).map((m) => {
    const d = miscData(m);
    const use = lc(m.USE);
    return {
      id: newId(),
      libraryRef: null,
      name: d.name,
      type: d.type,
      amountKind: d.amountKind,
      amount: Math.max(0, n(m.AMOUNT)),
      use: use === 'mash' ? 'mash' : use === 'primary' || use === 'secondary' ? 'fermentation' : use === 'bottling' ? 'packaging' : 'boil',
      timeMin: num(m.TIME),
      notes: '',
    } as const;
  });

  const mash = arr(r.MASH)[0];
  const steps = arr(mash?.MASH_STEPS?.MASH_STEP).map((s) => ({
    id: newId(),
    name: str(s.NAME, 80) || 'Step',
    type: lc(s.TYPE) === 'infusion' ? 'infusion' : lc(s.TYPE) === 'decoction' ? 'decoction' : 'temperature',
    tempC: clamp(n(s.STEP_TEMP, 67), 0, 105),
    timeMin: clamp(n(s.STEP_TIME, 60), 0, 1440),
    rampMin: num(s.RAMP_TIME),
    infuseL: num(s.INFUSE_AMOUNT),
  }));

  const fermentation: { id: string; name: string; tempC: number; days: number; rampDays: null }[] = [];
  const stages: [string, unknown, unknown][] = [
    ['Primary', r.PRIMARY_AGE, r.PRIMARY_TEMP],
    ['Secondary', r.SECONDARY_AGE, r.SECONDARY_TEMP],
    ['Tertiary', r.TERTIARY_AGE, r.TERTIARY_TEMP],
    ['Conditioning', r.AGE, r.AGE_TEMP],
  ];
  const stageCount = num(r.FERMENTATION_STAGES);
  stages.forEach(([label, age, temp], i) => {
    const days = num(age);
    if (days === null || days <= 0) return;
    if (stageCount !== null && i < 3 && i >= stageCount) return;
    fermentation.push({ id: newId(), name: label, tempC: clamp(n(temp, 19), -5, 50), days: clamp(days, 0, 1000), rampDays: null });
  });

  const style = arr(r.STYLE)[0];
  const styleSnap = style
    ? (() => {
        const d = styleData(style);
        return { libraryRef: null, name: d.name, guide: d.guide, category: d.category, categoryNumber: d.categoryNumber, styleLetter: d.styleLetter, og: d.og, fg: d.fg, ibu: d.ibu, colorEbc: d.colorEbc, abvPct: d.abvPct, carbVols: d.carbVols };
      })()
    : null;

  const equipment = arr(r.EQUIPMENT)[0];
  if (equipment) warnings.push(`${name}: the equipment "${str(equipment.NAME)}" is imported as its own profile; pick it for the recipe if you want its volumes`);

  return recipeDocSchema.parse({
    name,
    type: type === 'all grain' ? 'all_grain' : type === 'partial mash' ? 'partial_mash' : type === 'extract' ? 'extract' : 'other',
    author: str(r.BREWER, 120),
    batchSizeL: clamp(n(r.BATCH_SIZE, 20), 0.1, 100000),
    boilTimeMin: clamp(boilTime, 0, 600),
    efficiencyPct: clamp(n(r.EFFICIENCY, 72), 10, 100),
    style: styleSnap,
    fermentables,
    hops,
    cultures,
    miscs,
    mash: { name: str(mash?.NAME, 120), spargeTempC: num(mash?.SPARGE_TEMP), steps },
    fermentation,
    carbonationVols: num(r.CARBONATION),
    notes: [str(r.NOTES, 10000), str(r.TASTE_NOTES, 5000)].filter(Boolean).join('\n\n'),
  });
}

/** Decode a BeerXML file (often ISO-8859-1) into text. */
export function decodeXml(bytes: Uint8Array): string {
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 200));
  const encoding = /encoding=["']([\w-]+)["']/i.exec(head)?.[1]?.toLowerCase();
  const latin = encoding && ['iso-8859-1', 'latin1', 'windows-1252', 'cp1252'].includes(encoding);
  return new TextDecoder(latin ? 'windows-1252' : 'utf-8').decode(bytes);
}

export function importBeerXml(xml: string): ImportPreview {
  const warnings: string[] = [];
  let root: J;
  try {
    root = parser.parse(xml);
  } catch (err) {
    throw new Error(`Not a readable XML file: ${(err as Error).message}`);
  }
  const safe = <T>(what: string, fn: () => T): T[] => {
    try {
      return [fn()];
    } catch (err) {
      warnings.push(`Skipped ${what}: ${(err as Error).message}`);
      return [];
    }
  };
  const recipes = arr(root.RECIPES?.RECIPE).flatMap((r) => safe(`recipe "${str(r?.NAME)}"`, () => recipeFromBeerXml(r, warnings)));
  const library: ImportedLibraryItem[] = [
    ...arr(root.FERMENTABLES?.FERMENTABLE).flatMap((x) => safe('a fermentable', () => ({ kind: 'fermentable' as const, data: fermentableData(x) }))),
    ...arr(root.HOPS?.HOP).flatMap((x) => safe('a hop', () => ({ kind: 'hop' as const, data: hopData(x) }))),
    ...arr(root.YEASTS?.YEAST).flatMap((x) => safe('a yeast', () => ({ kind: 'culture' as const, data: cultureData(x) }))),
    ...arr(root.MISCS?.MISC).flatMap((x) => safe('an ingredient', () => ({ kind: 'misc' as const, data: miscData(x) }))),
    ...arr(root.WATERS?.WATER).flatMap((x) => safe('a water profile', () => ({ kind: 'water' as const, data: waterData(x) }))),
    ...arr(root.STYLES?.STYLE).flatMap((x) => safe('a style', () => ({ kind: 'style' as const, data: styleData(x) }))),
  ];
  const equipment = [
    ...arr(root.EQUIPMENTS?.EQUIPMENT),
    ...arr(root.RECIPES?.RECIPE).flatMap((r) => arr(r?.EQUIPMENT)),
  ].flatMap((e) => safe('an equipment profile', () => equipmentData(e)));
  if (!recipes.length && !library.length && !equipment.length) throw new Error('No BeerXML recipes or ingredients found in the file');
  return { format: 'beerxml', recipes, library, equipment, warnings };
}

// ---- Export --------------------------------------------------------------------------------------------------

const builder = new XMLBuilder({ format: true, indentBy: ' ', suppressEmptyNode: false, processEntities: true });
const r6 = (v: number) => round(v, 6);

const HOP_USE_OUT = { boil: 'Boil', first_wort: 'First Wort', mash: 'Mash', whirlpool: 'Aroma', dry_hop: 'Dry Hop' } as const;
const FERMENTABLE_TYPE_OUT: Record<FermentableData['type'], string> = {
  grain: 'Grain',
  sugar: 'Sugar',
  extract: 'Extract',
  dry_extract: 'Dry Extract',
  adjunct: 'Adjunct',
  fruit: 'Adjunct',
  juice: 'Adjunct',
  honey: 'Sugar',
  other: 'Adjunct',
};
const MISC_TYPE_OUT: Record<MiscData['type'], string> = {
  spice: 'Spice',
  fining: 'Fining',
  water_agent: 'Water Agent',
  herb: 'Herb',
  flavor: 'Flavor',
  wood: 'Other',
  nutrient: 'Other',
  enzyme: 'Other',
  other: 'Other',
};
const MISC_USE_OUT = { mash: 'Mash', sparge: 'Mash', boil: 'Boil', whirlpool: 'Boil', fermentation: 'Primary', packaging: 'Bottling' } as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function recipeToBeerXml(doc: RecipeDoc): J {
  const calc = calculateRecipe(doc);
  // BeerXML has up to three fermentation stages plus aging; a last step named like conditioning
  // or lagering goes into the aging slot.
  const last = doc.fermentation.at(-1);
  const aging = last && (doc.fermentation.length > 3 || /condition|aging|lager|reif/i.test(last.name)) ? last : undefined;
  const stages = doc.fermentation.filter((s) => s !== aging).slice(0, 3);
  const stage = (i: number) => stages[i];
  return {
    NAME: doc.name,
    VERSION: 1,
    TYPE: doc.type === 'all_grain' ? 'All Grain' : doc.type === 'partial_mash' ? 'Partial Mash' : 'Extract',
    BREWER: doc.author || '-',
    BATCH_SIZE: r6(doc.batchSizeL),
    BOIL_SIZE: r6(calc.volumes.preBoilL),
    BOIL_TIME: doc.boilTimeMin,
    EFFICIENCY: doc.efficiencyPct,
    ...(doc.style && {
      STYLE: {
        NAME: doc.style.name,
        VERSION: 1,
        CATEGORY: doc.style.category || doc.style.name,
        CATEGORY_NUMBER: doc.style.categoryNumber || '0',
        STYLE_LETTER: doc.style.styleLetter || '-',
        STYLE_GUIDE: doc.style.guide || '-',
        TYPE: 'Ale',
        OG_MIN: doc.style.og[0] ?? 1,
        OG_MAX: doc.style.og[1] ?? 1.2,
        FG_MIN: doc.style.fg[0] ?? 1,
        FG_MAX: doc.style.fg[1] ?? 1.2,
        IBU_MIN: doc.style.ibu[0] ?? 0,
        IBU_MAX: doc.style.ibu[1] ?? 150,
        COLOR_MIN: r6(ebcToSrm(doc.style.colorEbc[0] ?? 0)),
        COLOR_MAX: r6(ebcToSrm(doc.style.colorEbc[1] ?? 100)),
        ...(doc.style.abvPct[0] != null && { ABV_MIN: doc.style.abvPct[0] }),
        ...(doc.style.abvPct[1] != null && { ABV_MAX: doc.style.abvPct[1] }),
        ...(doc.style.carbVols[0] != null && { CARB_MIN: doc.style.carbVols[0] }),
        ...(doc.style.carbVols[1] != null && { CARB_MAX: doc.style.carbVols[1] }),
      },
    }),
    HOPS: {
      HOP: doc.hops.map((h) => ({
        NAME: h.name,
        VERSION: 1,
        ALPHA: h.alphaPct,
        AMOUNT: r6(h.amountKg),
        USE: HOP_USE_OUT[h.use],
        TIME: h.use === 'dry_hop' ? r6((h.durationDays ?? 0) * 1440) : h.use === 'first_wort' || h.use === 'mash' ? doc.boilTimeMin : h.timeMin,
        FORM: h.form === 'leaf' ? 'Leaf' : h.form === 'plug' ? 'Plug' : 'Pellet',
        ...(h.betaPct != null && { BETA: h.betaPct }),
        ...(h.origin && { ORIGIN: h.origin }),
      })),
    },
    FERMENTABLES: {
      FERMENTABLE: doc.fermentables.map((f) => {
        const grain = f.type === 'grain' || f.type === 'adjunct';
        const srm = ebcToSrm(f.colorEbc);
        return {
          NAME: f.name,
          VERSION: 1,
          TYPE: FERMENTABLE_TYPE_OUT[f.type],
          AMOUNT: r6(f.amountKg),
          YIELD: r6(potentialToYield(f.potentialSg)),
          COLOR: r6(grain ? srmToLovibond(srm) : srm),
          ADD_AFTER_BOIL: f.use === 'fermentation' ? 'TRUE' : 'FALSE',
          ...(f.origin && { ORIGIN: f.origin }),
          ...(f.producer && { SUPPLIER: f.producer }),
          POTENTIAL: r6(f.potentialSg),
        };
      }),
    },
    MISCS: {
      MISC: doc.miscs.map((m) => ({
        NAME: m.name,
        VERSION: 1,
        TYPE: MISC_TYPE_OUT[m.type],
        USE: MISC_USE_OUT[m.use],
        TIME: m.timeMin ?? 0,
        AMOUNT: r6(m.amount),
        AMOUNT_IS_WEIGHT: m.amountKind === 'mass' ? 'TRUE' : 'FALSE',
      })),
    },
    YEASTS: {
      YEAST: doc.cultures.map((c) => ({
        NAME: c.name,
        VERSION: 1,
        TYPE: ['ale', 'lager', 'wheat', 'wine', 'champagne'].includes(c.type) ? cap(c.type) : 'Ale',
        FORM: ['liquid', 'dry', 'slant', 'culture'].includes(c.form) ? cap(c.form) : 'Liquid',
        // Packs have no BeerXML unit: written as volume, with the count kept in DISPLAY_AMOUNT.
        AMOUNT: r6(c.amountKind === 'count' ? 0 : c.amount),
        AMOUNT_IS_WEIGHT: c.amountKind === 'mass' ? 'TRUE' : 'FALSE',
        ...(c.amountKind === 'count' && { DISPLAY_AMOUNT: `${c.amount} pkg` }),
        ...(c.producer && { LABORATORY: c.producer }),
        ...(c.productId && { PRODUCT_ID: c.productId }),
        ...(c.attenuationPct != null && { ATTENUATION: c.attenuationPct }),
        ...(c.tempMinC != null && { MIN_TEMPERATURE: c.tempMinC }),
        ...(c.tempMaxC != null && { MAX_TEMPERATURE: c.tempMaxC }),
      })),
    },
    WATERS: '',
    MASH: {
      NAME: doc.mash.name || 'Mash',
      VERSION: 1,
      GRAIN_TEMP: (doc.equipment ?? { grainTempC: 20 }).grainTempC,
      ...(doc.mash.spargeTempC != null && { SPARGE_TEMP: doc.mash.spargeTempC }),
      MASH_STEPS: {
        MASH_STEP: doc.mash.steps.map((s) => ({
          NAME: s.name,
          VERSION: 1,
          TYPE: cap(s.type),
          ...(s.infuseL != null && { INFUSE_AMOUNT: r6(s.infuseL) }),
          STEP_TEMP: s.tempC,
          STEP_TIME: s.timeMin,
          ...(s.rampMin != null && { RAMP_TIME: s.rampMin }),
        })),
      },
    },
    ...(doc.notes && { NOTES: doc.notes }),
    OG: r6(calc.og),
    FG: r6(calc.fg),
    FERMENTATION_STAGES: stages.length,
    ...(stage(0) && { PRIMARY_AGE: stage(0)!.days, PRIMARY_TEMP: stage(0)!.tempC }),
    ...(stage(1) && { SECONDARY_AGE: stage(1)!.days, SECONDARY_TEMP: stage(1)!.tempC }),
    ...(stage(2) && { TERTIARY_AGE: stage(2)!.days, TERTIARY_TEMP: stage(2)!.tempC }),
    ...(aging && { AGE: aging.days, AGE_TEMP: aging.tempC }),
    ...(doc.carbonationVols != null && { CARBONATION: doc.carbonationVols }),
  };
}

export function exportBeerXml(docs: RecipeDoc[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${builder.build({ RECIPES: { RECIPE: docs.map(recipeToBeerXml) } })}`;
}
