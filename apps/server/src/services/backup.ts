import { eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import {
  BACKUP_FORMAT,
  BACKUP_SECTIONS,
  BACKUP_VERSION,
  backupFileSchema,
  MAX_IMAGE_BYTES,
  parseLibraryData,
  recipeDocSchema,
  updateAppSettingsSchema,
  updatePrefsSchema,
  type BackupFile,
  type BackupImportResult,
  type BackupSection,
  type LibraryKind,
  type RecipeDoc,
} from '@brew/shared';
import type { z } from 'zod';
import type { Db } from '../db';
import {
  batches,
  batchLog,
  batchReadings,
  equipmentProfiles,
  images,
  inventoryItems,
  inventoryTx,
  libraryItems,
  recipes,
  vessels,
  type LibraryRow,
  type UserRow,
} from '../db/schema';
import { HttpError } from '../lib/errors';
import { detectImageType } from './images';
import { recipeColumns } from './recipes';
import { getSettings, updateSettings } from './settings';
import { updatePrefs } from './users';

type ParsedBackup = z.output<typeof backupFileSchema>;
type LibraryEntry = NonNullable<ParsedBackup['library']>[number];

const iso = (d: Date) => d.toISOString();
const invalid = (message: string, details?: unknown) => new HttpError(400, 'backup_invalid', message, details);

function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}

/** Library items a recipe document refers to (ingredient lines, style, water profiles). */
function docLibraryRefs(doc: RecipeDoc): (string | null)[] {
  return [
    ...[...doc.fermentables, ...doc.hops, ...doc.cultures, ...doc.miscs].map((l) => l.libraryRef),
    doc.style?.libraryRef ?? null,
    doc.water.sourceRef,
    doc.water.targetRef,
    doc.water.source?.libraryRef ?? null,
    doc.water.target?.libraryRef ?? null,
  ];
}

/** Points a document's references at the ids they have on this server. */
function remapDoc(doc: RecipeDoc, lib: Map<string, string>, equipment: Map<string, string>): RecipeDoc {
  const r = (ref: string | null) => (ref ? (lib.get(ref) ?? ref) : ref);
  const line = <T extends { libraryRef: string | null }>(l: T): T => ({ ...l, libraryRef: r(l.libraryRef) });
  return {
    ...doc,
    fermentables: doc.fermentables.map(line),
    hops: doc.hops.map(line),
    cultures: doc.cultures.map(line),
    miscs: doc.miscs.map(line),
    style: doc.style && line(doc.style),
    equipment: doc.equipment && { ...doc.equipment, libraryRef: doc.equipment.libraryRef ? (equipment.get(doc.equipment.libraryRef) ?? doc.equipment.libraryRef) : null },
    water: {
      ...doc.water,
      sourceRef: r(doc.water.sourceRef),
      targetRef: r(doc.water.targetRef),
      source: doc.water.source && line(doc.water.source),
      target: doc.water.target && line(doc.water.target),
    },
  };
}

const libraryEntry = (row: LibraryRow): LibraryEntry => ({
  id: row.id,
  kind: row.kind,
  source: row.source,
  data: row.data,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

/** The brewery's data as a backup file, with only the sections asked for. */
export function exportBackup(db: Db, user: UserRow, sections: BackupSection[]): BackupFile {
  const has = (s: BackupSection) => sections.includes(s);
  const imageIds = new Set<string>();
  const libRefs = new Set<string>();
  const useDoc = (doc: RecipeDoc) => {
    if (doc.image) imageIds.add(doc.image);
    for (const ref of docLibraryRefs(doc)) if (ref) libRefs.add(ref);
    return doc;
  };
  const file: BackupFile = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: iso(new Date()), sections };

  if (has('recipes')) {
    file.recipes = db
      .select()
      .from(recipes)
      .all()
      .map((row) => ({ id: row.id, doc: useDoc(recipeDocSchema.parse(row.doc)), createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) }));
  }

  if (has('batches')) {
    const readings = groupBy(db.select().from(batchReadings).all(), (r) => r.batchId);
    const log = groupBy(db.select().from(batchLog).all(), (l) => l.batchId);
    file.batches = db
      .select()
      .from(batches)
      .all()
      .map((row) => ({
        id: row.id,
        number: row.number,
        name: row.name,
        status: row.status,
        recipeId: row.recipeId,
        vesselId: row.vesselId,
        inventoryDeductedAt: row.inventoryDeductedAt && iso(row.inventoryDeductedAt),
        doc: useDoc(recipeDocSchema.parse(row.doc)),
        brewDate: row.brewDate,
        measured: row.measured,
        carbonation: row.carbonation,
        brewday: row.brewday,
        notes: row.notes,
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
        readings: (readings.get(row.id) ?? []).map((r) => ({ id: r.id, takenAt: iso(r.takenAt), gravity: r.gravity, tempC: r.tempC, note: r.note, source: r.source })),
        log: (log.get(row.id) ?? []).map((l) => ({ id: l.id, at: iso(l.at), kind: l.kind, text: l.text })),
      }));
  }

  if (has('inventory')) {
    const txs = groupBy(db.select().from(inventoryTx).all(), (t) => t.itemId);
    file.inventory = db
      .select()
      .from(inventoryItems)
      .all()
      .map((row) => {
        if (row.libraryRef) libRefs.add(row.libraryRef);
        return {
          id: row.id,
          kind: row.kind,
          libraryRef: row.libraryRef,
          name: row.name,
          producer: row.producer,
          amountKind: row.amountKind,
          amount: row.amount,
          minAmount: row.minAmount,
          lot: row.lot,
          bestBefore: row.bestBefore,
          location: row.location,
          unitCost: row.unitCost,
          notes: row.notes,
          createdAt: iso(row.createdAt),
          updatedAt: iso(row.updatedAt),
          transactions: (txs.get(row.id) ?? []).map((t) => ({
            id: t.id,
            batchId: t.batchId,
            delta: t.delta,
            reason: t.reason,
            note: t.note,
            at: iso(t.at),
            undoneAt: t.undoneAt && iso(t.undoneAt),
          })),
        };
      });
  }

  if (has('equipment')) {
    file.equipment = {
      profiles: db
        .select()
        .from(equipmentProfiles)
        .all()
        .map((row) => ({ id: row.id, data: row.data, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) })),
      vessels: db
        .select()
        .from(vessels)
        .all()
        .map((row) => ({ id: row.id, name: row.name, kind: row.kind, capacityL: row.capacityL, notes: row.notes, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) })),
    };
  }

  // Only the user's own items: the built-in ones are on every server already.
  if (has('water') || has('library')) {
    const own = db.select().from(libraryItems).where(isNull(libraryItems.seedKey)).all();
    if (has('water')) file.water = own.filter((r) => r.kind === 'water').map(libraryEntry);
    if (has('library')) file.library = own.filter((r) => r.kind !== 'water').map(libraryEntry);
  }

  if (has('settings')) {
    const brewery = getSettings(db);
    if (brewery.breweryLogo) imageIds.add(brewery.breweryLogo);
    if (brewery.defaultSourceWaterId) libRefs.add(brewery.defaultSourceWaterId);
    file.settings = { brewery, prefs: user.prefs as Record<string, unknown> };
  }

  const seedRefs: Record<string, string> = {};
  for (const row of db.select({ id: libraryItems.id, seedKey: libraryItems.seedKey }).from(libraryItems).where(isNotNull(libraryItems.seedKey)).all()) {
    if (row.seedKey && libRefs.has(row.id)) seedRefs[row.id] = row.seedKey;
  }
  file.seedRefs = seedRefs;

  file.images = imageIds.size
    ? db
        .select({ id: images.id, data: images.data })
        .from(images)
        .where(inArray(images.id, [...imageIds]))
        .all()
        .map((img) => ({ id: img.id, data: img.data.toString('base64') }))
    : [];
  return file;
}

/** Reads and checks a backup file (nothing is saved). */
export function parseBackup(raw: unknown): ParsedBackup {
  const head = raw && typeof raw === 'object' ? (raw as { format?: unknown; version?: unknown }) : {};
  if (head.format !== BACKUP_FORMAT) throw invalid('Not a Siduri backup file');
  if (typeof head.version === 'number' && head.version > BACKUP_VERSION) {
    throw new HttpError(400, 'backup_too_new', 'The backup was made by a newer version of the app');
  }
  const parsed = backupFileSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw invalid(`The backup file is damaged${issue ? ` (${issue.path.join('.')}: ${issue.message})` : ''}`);
  }
  return parsed.data;
}

const zero = () => Object.fromEntries(BACKUP_SECTIONS.map((s) => [s, 0])) as Record<BackupSection, number>;
const libKey = (kind: string, data: Record<string, unknown>) =>
  `${kind}|${String(data.name ?? '').trim().toLowerCase()}|${String(data.producer ?? '').trim().toLowerCase()}`;

/**
 * Adds the chosen sections of a backup. Records keep their ids; what is already here (same id,
 * or for library items, water profiles, equipment and vessels the same name) is skipped, so
 * importing a file twice changes nothing. Settings replace the current ones.
 */
export function importBackup(db: Db, user: UserRow, raw: unknown, sections: BackupSection[]): BackupImportResult {
  const file = parseBackup(raw);
  const has = (s: BackupSection) => sections.includes(s);

  // Check everything before saving anything.
  const libraryEntries = [...(has('water') ? (file.water ?? []) : []), ...(has('library') ? (file.library ?? []) : [])].map((e, i) => {
    try {
      return { ...e, data: parseLibraryData(e.kind, e.data) as unknown as Record<string, unknown>, section: (e.kind === 'water' ? 'water' : 'library') as BackupSection };
    } catch {
      throw invalid(`Library item ${i + 1} (${String(e.data.name ?? '')}) is invalid`);
    }
  });
  const brewery = has('settings') && file.settings ? updateAppSettingsSchema.safeParse(file.settings.brewery) : null;
  const prefs = has('settings') && file.settings ? updatePrefsSchema.safeParse(file.settings.prefs) : null;
  if (brewery?.success === false || prefs?.success === false) throw invalid('The settings in the backup are invalid');

  const wantedImages = new Set<string>();
  if (has('recipes')) for (const r of file.recipes ?? []) if (r.doc.image) wantedImages.add(r.doc.image);
  if (has('batches')) for (const b of file.batches ?? []) if (b.doc.image) wantedImages.add(b.doc.image);
  if (brewery?.data?.breweryLogo) wantedImages.add(brewery.data.breweryLogo);
  const pictures = file.images
    .filter((img) => wantedImages.has(img.id))
    .map((img) => {
      const data = Buffer.from(img.data, 'base64');
      const type = data.length <= MAX_IMAGE_BYTES ? detectImageType(data) : null;
      if (!type) throw invalid('A picture in the backup is invalid');
      return { id: img.id, type, data, bytes: data.length };
    });

  return db.transaction((tx) => {
    const t = tx as unknown as Db;
    const added = zero();
    const skipped = zero();

    for (const img of pictures) t.insert(images).values(img).onConflictDoNothing().run();
    const localImages = new Set(t.select({ id: images.id }).from(images).all().map((r) => r.id));

    // Library: file id → id on this server (built-in items by seed key, own items by name if already here).
    const libMap = new Map<string, string>();
    const library = t.select({ id: libraryItems.id, kind: libraryItems.kind, seedKey: libraryItems.seedKey, data: libraryItems.data }).from(libraryItems).all();
    const libIds = new Set(library.map((r) => r.id));
    const bySeed = new Map(library.filter((r) => r.seedKey).map((r) => [r.seedKey!, r.id]));
    const byName = new Map(library.map((r) => [libKey(r.kind, r.data), r.id]));
    for (const [fileId, key] of Object.entries(file.seedRefs)) {
      const local = bySeed.get(key);
      if (local && local !== fileId) libMap.set(fileId, local);
    }
    for (const e of libraryEntries) {
      if (libIds.has(e.id)) {
        skipped[e.section]++;
        continue;
      }
      const key = libKey(e.kind, e.data);
      const same = byName.get(key);
      if (same) {
        libMap.set(e.id, same);
        skipped[e.section]++;
        continue;
      }
      t.insert(libraryItems)
        .values({
          id: e.id,
          kind: e.kind as LibraryKind,
          name: String(e.data.name),
          source: e.source === 'seed' ? 'user' : e.source,
          seedKey: null,
          data: e.data,
          createdAt: new Date(e.createdAt),
          updatedAt: new Date(e.updatedAt),
        })
        .run();
      libIds.add(e.id);
      byName.set(key, e.id);
      added[e.section]++;
    }

    // Equipment profiles and vessels.
    const equipmentMap = new Map<string, string>();
    const vesselMap = new Map<string, string>();
    if (has('equipment') && file.equipment) {
      const profiles = t.select({ id: equipmentProfiles.id, name: equipmentProfiles.name }).from(equipmentProfiles).all();
      const profileIds = new Set(profiles.map((p) => p.id));
      const profileNames = new Map(profiles.map((p) => [p.name.trim().toLowerCase(), p.id]));
      for (const p of file.equipment.profiles) {
        const same = profileIds.has(p.id) ? p.id : profileNames.get(p.data.name.trim().toLowerCase());
        if (same) {
          equipmentMap.set(p.id, same);
          skipped.equipment++;
          continue;
        }
        t.insert(equipmentProfiles).values({ id: p.id, name: p.data.name, data: p.data, createdAt: new Date(p.createdAt), updatedAt: new Date(p.updatedAt) }).run();
        profileNames.set(p.data.name.trim().toLowerCase(), p.id);
        added.equipment++;
      }
      const existing = t.select({ id: vessels.id, name: vessels.name }).from(vessels).all();
      const vesselIds = new Set(existing.map((v) => v.id));
      const vesselNames = new Map(existing.map((v) => [v.name.trim().toLowerCase(), v.id]));
      for (const v of file.equipment.vessels) {
        const same = vesselIds.has(v.id) ? v.id : vesselNames.get(v.name.trim().toLowerCase());
        if (same) {
          vesselMap.set(v.id, same);
          skipped.equipment++;
          continue;
        }
        t.insert(vessels)
          .values({ id: v.id, name: v.name, kind: v.kind, capacityL: v.capacityL, notes: v.notes, createdAt: new Date(v.createdAt), updatedAt: new Date(v.updatedAt) })
          .run();
        vesselNames.set(v.name.trim().toLowerCase(), v.id);
        added.equipment++;
      }
    }
    const docOf = (doc: RecipeDoc) => {
      const mapped = remapDoc(doc, libMap, equipmentMap);
      return mapped.image && !localImages.has(mapped.image) ? { ...mapped, image: null } : mapped;
    };

    if (has('recipes')) {
      const ids = new Set(t.select({ id: recipes.id }).from(recipes).all().map((r) => r.id));
      for (const r of file.recipes ?? []) {
        if (ids.has(r.id)) {
          skipped.recipes++;
          continue;
        }
        const doc = docOf(r.doc);
        t.insert(recipes)
          .values({ id: r.id, doc, ...recipeColumns(doc), createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt) })
          .run();
        added.recipes++;
      }
    }

    if (has('batches')) {
      const rows = t.select({ id: batches.id, number: batches.number }).from(batches).all();
      const ids = new Set(rows.map((b) => b.id));
      const numbers = new Set(rows.map((b) => b.number));
      let next = Math.max(0, ...rows.map((b) => b.number), ...(file.batches ?? []).map((b) => b.number)) + 1;
      const recipeIds = new Set(t.select({ id: recipes.id }).from(recipes).all().map((r) => r.id));
      const vesselIds = new Set(t.select({ id: vessels.id }).from(vessels).all().map((v) => v.id));
      for (const b of file.batches ?? []) {
        if (ids.has(b.id)) {
          skipped.batches++;
          continue;
        }
        // Keep the batch number unless another batch here has it.
        const number = numbers.has(b.number) ? next++ : b.number;
        numbers.add(number);
        const vesselId = b.vesselId ? (vesselMap.get(b.vesselId) ?? b.vesselId) : null;
        t.insert(batches)
          .values({
            id: b.id,
            number,
            name: b.name,
            status: b.status,
            recipeId: b.recipeId && recipeIds.has(b.recipeId) ? b.recipeId : null,
            vesselId: vesselId && vesselIds.has(vesselId) ? vesselId : null,
            inventoryDeductedAt: b.inventoryDeductedAt ? new Date(b.inventoryDeductedAt) : null,
            doc: docOf(b.doc),
            brewDate: b.brewDate,
            measured: b.measured,
            carbonation: b.carbonation,
            brewday: b.brewday,
            notes: b.notes,
            createdAt: new Date(b.createdAt),
            updatedAt: new Date(b.updatedAt),
          })
          .run();
        for (const r of b.readings) {
          t.insert(batchReadings)
            .values({ id: r.id, batchId: b.id, takenAt: new Date(r.takenAt), gravity: r.gravity, tempC: r.tempC, note: r.note, source: r.source, deviceId: null })
            .onConflictDoNothing()
            .run();
        }
        for (const l of b.log) t.insert(batchLog).values({ id: l.id, batchId: b.id, at: new Date(l.at), kind: l.kind, text: l.text }).onConflictDoNothing().run();
        added.batches++;
      }
    }

    if (has('inventory')) {
      const ids = new Set(t.select({ id: inventoryItems.id }).from(inventoryItems).all().map((i) => i.id));
      const batchIds = new Set(t.select({ id: batches.id }).from(batches).all().map((b) => b.id));
      for (const item of file.inventory ?? []) {
        if (ids.has(item.id)) {
          skipped.inventory++;
          continue;
        }
        const { transactions, createdAt, updatedAt, libraryRef, ...fields } = item;
        t.insert(inventoryItems)
          .values({ ...fields, libraryRef: libraryRef ? (libMap.get(libraryRef) ?? libraryRef) : null, createdAt: new Date(createdAt), updatedAt: new Date(updatedAt) })
          .run();
        for (const tr of transactions) {
          t.insert(inventoryTx)
            .values({
              id: tr.id,
              itemId: item.id,
              batchId: tr.batchId && batchIds.has(tr.batchId) ? tr.batchId : null,
              delta: tr.delta,
              reason: tr.reason,
              note: tr.note,
              at: new Date(tr.at),
              undoneAt: tr.undoneAt ? new Date(tr.undoneAt) : null,
            })
            .onConflictDoNothing()
            .run();
        }
        added.inventory++;
      }
    }

    if (brewery?.data && prefs?.data) {
      const patch = { ...brewery.data };
      // References to things that aren't here keep the current setting.
      if (patch.breweryLogo && !localImages.has(patch.breweryLogo)) delete patch.breweryLogo;
      if (patch.defaultEquipmentId) {
        const local = equipmentMap.get(patch.defaultEquipmentId) ?? patch.defaultEquipmentId;
        const exists = t.select({ id: equipmentProfiles.id }).from(equipmentProfiles).where(eq(equipmentProfiles.id, local)).get();
        if (exists) patch.defaultEquipmentId = local;
        else delete patch.defaultEquipmentId;
      }
      if (patch.defaultSourceWaterId) {
        const local = libMap.get(patch.defaultSourceWaterId) ?? patch.defaultSourceWaterId;
        if (libIds.has(local)) patch.defaultSourceWaterId = local;
        else delete patch.defaultSourceWaterId;
      }
      updateSettings(t, patch);
      updatePrefs(t, user, prefs.data);
      added.settings++;
    }

    return { added, skipped };
  });
}
