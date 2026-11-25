import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ebcToSrm, type RecipeDoc } from '@brew/shared';
import { brewDaySteps, calculateRecipe } from '@brew/brewcalc';
import { exportBeerJson, exportBeerXml, importBeerJson, importBeerXml, importFile, validateBeerJson } from '../src';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const read = (name: string) => fs.readFileSync(path.join(dir, name));

/** A recipe without line ids, rounded, for comparing two imports. */
function comparable(doc: RecipeDoc, opts: { beerJson?: boolean } = {}) {
  const strip = <T extends { id: string }>(items: T[]) => items.map(({ id: _id, ...rest }) => rest);
  const out = {
    ...doc,
    fermentables: strip(doc.fermentables),
    hops: strip(doc.hops),
    // BeerJSON culture additions carry no temperature range.
    cultures: strip(doc.cultures).map((c) => (opts.beerJson ? { ...c, tempMinC: null, tempMaxC: null } : c)),
    miscs: strip(doc.miscs),
    mash: { ...doc.mash, steps: strip(doc.mash.steps) },
    fermentation: strip(doc.fermentation),
    // A BeerJSON recipe names its style but has no ranges.
    style: doc.style && opts.beerJson ? { ...doc.style, og: [null, null], fg: [null, null], ibu: [null, null], colorEbc: [null, null], abvPct: [null, null], carbVols: [null, null], styleLetter: /^[A-Z ]+$/.test(doc.style.styleLetter) ? doc.style.styleLetter : '' } : doc.style,
  };
  return JSON.parse(JSON.stringify(out, (_k, v: unknown) => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v)));
}

describe('BeerXML import', () => {
  it('reads a BeerSmith export (Kölsch) and matches its estimates', () => {
    const preview = importFile(read('Kolsh.xml'));
    expect(preview.format).toBe('beerxml');
    const doc = preview.recipes[0]!;
    expect(doc.name).toBe("Lloyd's Krispy Kolsch");
    expect(doc.batchSizeL).toBeCloseTo(19.0029, 3);
    expect(doc.fermentables).toHaveLength(3);
    expect(doc.hops.map((h) => h.use)).toEqual(['boil', 'boil']);
    expect(doc.mash.steps.length).toBeGreaterThan(0);
    const calc = calculateRecipe(doc);
    // BeerSmith: OG 1.049, colour 3.7 SRM, 27 IBU (Tinseth).
    expect(calc.og).toBeCloseTo(1.049, 2);
    expect(ebcToSrm(calc.colorEbc)).toBeCloseTo(3.7, 0);
    expect(calc.ibu).toBeGreaterThan(24);
    expect(calc.ibu).toBeLessThan(30);
  });

  it('reads all sample files', () => {
    for (const file of ['GenericOneHF.xml', 'Londonpride.xml', 'RRSummerBitter.xml', 'punk-ipa-2010-current.xml']) {
      const preview = importFile(read(file));
      expect(preview.recipes.length, file).toBeGreaterThan(0);
      for (const doc of preview.recipes) expect(doc.fermentables.length, file).toBeGreaterThan(0);
    }
  });

  it('matches the published OG of other recipes', () => {
    const london = calculateRecipe(importFile(read('Londonpride.xml')).recipes[0]!);
    expect(london.og).toBeCloseTo(1.049, 2);
  });

  it('reads ingredient catalogs', () => {
    const preview = importBeerXml(
      '<?xml version="1.0"?><HOPS><HOP><NAME>Citra</NAME><VERSION>1</VERSION><ALPHA>12.5</ALPHA><AMOUNT>0</AMOUNT><USE>Boil</USE><TIME>0</TIME><FORM>Pellet</FORM></HOP></HOPS>',
    );
    expect(preview.library).toEqual([expect.objectContaining({ kind: 'hop', data: expect.objectContaining({ name: 'Citra', alphaPct: 12.5 }) })]);
  });

  it('rejects files that are not BeerXML', () => {
    expect(() => importFile(new TextEncoder().encode('hello'))).toThrow(/Unknown file type/);
    expect(() => importBeerXml('<NOTES>x</NOTES>')).toThrow(/No BeerXML/);
  });
});

describe('BeerJSON', () => {
  it('reads the converted sample and agrees with the BeerXML original', () => {
    const fromJson = importFile(read('Kolsh.json')).recipes[0]!;
    const fromXml = importFile(read('Kolsh.xml')).recipes[0]!;
    expect(fromJson.fermentables.map((f) => f.name)).toEqual(fromXml.fermentables.map((f) => f.name));
    expect(calculateRecipe(fromJson).og).toBeCloseTo(calculateRecipe(fromXml).og, 3);
  });

  it('reads first wort hops, sparge steps and sours', () => {
    for (const file of ['FirstWortHopAddition.json', 'KettleSour.json']) {
      expect(importFile(read(file)).recipes.length, file).toBeGreaterThan(0);
    }
  });

  it('exports valid BeerJSON 3.0 for every sample recipe', () => {
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.xml'))) {
      const docs = importFile(read(file)).recipes;
      expect(validateBeerJson(exportBeerJson(docs)), file).toEqual([]);
    }
  });

  it('round-trips through BeerJSON', () => {
    for (const file of ['Kolsh.xml', 'Londonpride.xml', 'RRSummerBitter.xml']) {
      const doc = importFile(read(file)).recipes[0]!;
      const again = importBeerJson(exportBeerJson([doc])).recipes[0]!;
      expect(comparable(again, { beerJson: true }), file).toEqual(comparable(doc, { beerJson: true }));
    }
  });
});

describe('BeerXML export', () => {
  it('round-trips through BeerXML', () => {
    for (const file of ['Kolsh.xml', 'Londonpride.xml', 'RRSummerBitter.xml']) {
      const doc = importFile(read(file)).recipes[0]!;
      const again = importBeerXml(exportBeerXml([doc])).recipes[0]!;
      expect(comparable(again), file).toEqual(comparable(doc));
    }
  });

  it('keeps dry hops, whirlpool and yeast packs', () => {
    const doc = importFile(read('Kolsh.xml')).recipes[0]!;
    doc.hops.push({ ...doc.hops[0]!, id: 'x', use: 'dry_hop', timeMin: 0, day: null, durationDays: 4 });
    doc.hops.push({ ...doc.hops[0]!, id: 'y', use: 'whirlpool', timeMin: 20 });
    doc.cultures = [{ ...doc.cultures[0]!, amountKind: 'count', amount: 2 }];
    const again = importBeerXml(exportBeerXml([doc])).recipes[0]!;
    expect(again.hops.at(-2)).toMatchObject({ use: 'dry_hop', durationDays: 4 });
    expect(again.hops.at(-1)).toMatchObject({ use: 'whirlpool', timeMin: 20 });
    expect(again.cultures[0]).toMatchObject({ amountKind: 'count', amount: 2 });
  });
});

describe('Brewfather BeerJSON exports', () => {
  // Brewfather writes the boil time of hops and other additions into timing.duration, not timing.time.
  const brewfather = {
    beerjson: {
      version: 2.06,
      recipes: [
        {
          name: 'Stout',
          type: 'all grain',
          author: '',
          batch_size: { unit: 'l', value: 25 },
          efficiency: { brewhouse: { unit: '%', value: 72 } },
          boil: { boil_time: { unit: 'min', value: 60 } },
          ingredients: {
            fermentable_additions: [
              { name: 'Pale', type: 'grain', amount: { unit: 'kg', value: 4.5 }, yield: { potential: { unit: 'sg', value: 1.038 } }, color: { unit: 'SRM', value: 3 } },
            ],
            hop_additions: [
              { name: 'EKG', alpha_acid: { unit: '%', value: 4.7 }, amount: { unit: 'g', value: 68 }, form: 'pellet', timing: { use: 'add_to_boil', duration: { unit: 'min', value: 60 } } },
              // A hop stand written by the spec: added at the end of the boil (time 0), steeped for 20 min.
              { name: 'Fuggle', alpha_acid: { unit: '%', value: 4.5 }, amount: { unit: 'g', value: 20 }, timing: { use: 'add_to_boil', time: { unit: 'min', value: 0 }, duration: { unit: 'min', value: 20 } } },
            ],
            miscellaneous_additions: [
              { name: 'Whirlfloc', type: 'fining', amount: { unit: 'each', value: 1 }, timing: { use: 'add_to_boil', duration: { unit: 'min', value: 15 } } },
              { name: 'CaCl2', type: 'water agent', amount: { unit: 'g', value: 4 }, timing: { use: 'add_to_mash' } },
            ],
          },
        },
      ],
    },
  };

  it('reads boil times from timing.duration', () => {
    const doc = importBeerJson(brewfather).recipes[0]!;
    expect(doc.hops.map((h) => [h.name, h.use, h.timeMin])).toEqual([
      ['EKG', 'boil', 60],
      ['Fuggle', 'whirlpool', 20],
    ]);
    expect(doc.miscs.map((m) => [m.name, m.use, m.timeMin, m.amountKind])).toEqual([
      ['Whirlfloc', 'boil', 15, 'count'],
      ['CaCl2', 'mash', null, 'mass'],
    ]);
  });

  it('gives one 60 minute boil with the additions at the right times', () => {
    const doc = importBeerJson(brewfather).recipes[0]!;
    const doc2 = { ...doc, hops: doc.hops.filter((h) => h.name === 'EKG') };
    const steps = brewDaySteps(doc2, calculateRecipe(doc2));
    expect(steps.filter((s) => s.timerMin != null && s.kind !== 'mashStep').map((s) => [s.id, s.timerMin])).toEqual([['boil', 60]]);
    expect(steps.find((s) => s.id === 'boil')!.items.map((i) => [i.name, i.atMin])).toEqual([
      ['EKG', 60],
      ['Whirlfloc', 15],
    ]);
  });
});
