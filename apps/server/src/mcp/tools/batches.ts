import { z } from 'zod';
import { brewDaySteps, calculateRecipe } from '@brew/brewcalc';
import { BATCH_STATUSES, brewDayActionSchema, createLogSchema, patchBatchSchema, saveToRecipeSchema, updateBatchDocSchema } from '@brew/shared';
import { parse } from '../../lib/errors';
import {
  addLog,
  addNote,
  addReading,
  applyBrewDayAction,
  createBatch,
  deleteBatch,
  deleteNote,
  deleteReading,
  getBatch,
  listBatches,
  listLog,
  listReadings,
  patchBatch,
  saveBatchToRecipe,
  updateBatchDoc,
} from '../../services/batches';
import { recipeSummary } from '../summary';
import { changed, tool, type ToolContext } from '../tool';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD');

/** Batch log event for a change made through MCP: "mcp:<what>:<token name>" (translated in the app). */
const logChange = (ctx: ToolContext, batchId: string, what: 'recipe' | 'details' | 'brewday') => addLog(ctx.db, batchId, 'event', `mcp:${what}:${ctx.tokenName}`);

export const batchTools = [
  tool({
    name: 'list_batches',
    level: 'read',
    title: 'List batches',
    description: 'Batches (brews of a recipe), newest first, optionally only some statuses. Includes planned gravities and the latest reading.',
    input: { status: z.array(z.enum(BATCH_STATUSES)).optional() },
    run: ({ status }, { db }) => listBatches(db, status).map(({ image: _i, ...b }) => b),
  }),
  tool({
    name: 'get_batch',
    level: 'read',
    title: 'Read a batch',
    description:
      "A batch: status, dates, fermenter, measured values, its own copy of the recipe (with version, for update_batch_recipe) and the calculated values, the latest readings and log entries, and the brew-day steps with their ids, timers and checklist keys.",
    input: { id: z.string(), readings: z.number().int().min(0).max(500).default(30) },
    run: ({ id, readings }, { db }) => {
      const b = getBatch(db, id);
      const calc = calculateRecipe(b.doc);
      return {
        ...b,
        calculated: recipeSummary(b.doc),
        readings: listReadings(db, id).slice(-readings),
        log: listLog(db, id).slice(-50),
        brewDaySteps: brewDaySteps(b.doc, calc).map((s) => ({
          id: s.id,
          kind: s.kind,
          name: s.name,
          timerMin: s.timerMin,
          checklist: s.items.map((i) => ({ key: i.key, name: i.name, amount: i.amount, amountKind: i.amountKind, atMin: i.atMin })),
        })),
      };
    },
  }),
  tool({
    name: 'create_batch',
    level: 'write',
    title: 'Start a batch',
    description: 'Start a batch from a recipe (it gets its own copy). With an equipment profile, the copy is scaled to its batch size and efficiency. Optionally put it in a fermenter.',
    input: {
      recipeId: z.string(),
      equipmentId: z.string().optional(),
      vesselId: z.string().optional(),
      name: z.string().trim().max(120).optional(),
      brewDate: isoDate.optional(),
    },
    run: (args, ctx) => {
      const b = createBatch(ctx.db, { ...args, equipmentId: args.equipmentId ?? null, vesselId: args.vesselId ?? null, brewDate: args.brewDate ?? null });
      changed(ctx, 'batches', b.id);
      changed(ctx, 'equipment');
      return { id: b.id, number: b.number, name: b.name, status: b.status, version: b.version };
    },
  }),
  tool({
    name: 'update_batch',
    level: 'write',
    title: 'Change a batch',
    description:
      'Change a batch: name, status (planned → brewing → fermenting → conditioning → packaged → completed), brew date, fermenter (vesselId, null to take it out), notes, measured values (merged; null clears one), or how it gets carbonated (merged).',
    input: {
      id: z.string(),
      name: z.string().trim().min(1).max(120).optional(),
      status: z.enum(BATCH_STATUSES).optional(),
      brewDate: isoDate.nullable().optional(),
      vesselId: z.string().nullable().optional(),
      notes: z.string().max(20000).optional(),
      measured: z.record(z.string(), z.unknown()).optional().describe('e.g. { "og": 1.052, "preBoilGravity": 1.044, "fermenterVolumeL": 21 }'),
      carbonation: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('{ "method": "bottle" | "keg_sugar" | "keg_force", "vols": target CO2 volumes (null: the recipe value), "tempC": warmest beer temperature after fermentation for sugar, keg temperature for force (null: default) }'),
    },
    run: ({ id, ...patch }, ctx) => {
      const b = patchBatch(ctx.db, id, parse(patchBatchSchema, patch));
      logChange(ctx, id, 'details');
      changed(ctx, 'batches', id);
      if (patch.vesselId !== undefined || patch.status) changed(ctx, 'equipment');
      return { id: b.id, status: b.status, measured: b.measured, carbonation: b.carbonation, vesselId: b.vesselId };
    },
  }),
  tool({
    name: 'update_batch_recipe',
    level: 'write',
    title: "Change a batch's recipe",
    description: "Save the batch's own copy of the recipe (whole document + the version from get_batch). The original recipe is not changed.",
    input: { id: z.string(), version: z.number().int().min(1), doc: z.record(z.string(), z.unknown()) },
    run: ({ id, version, doc }, ctx) => {
      const input = parse(updateBatchDocSchema, { doc, version });
      const b = updateBatchDoc(ctx.db, id, input.doc, input.version);
      logChange(ctx, id, 'recipe');
      changed(ctx, 'batches', id);
      return { id: b.id, version: b.version, calculated: recipeSummary(b.doc) };
    },
  }),
  tool({
    name: 'add_batch_note',
    level: 'write',
    title: 'Add a note to a batch',
    description: "Add a note to a batch's log (tasting notes, observations …).",
    input: { id: z.string(), text: z.string().trim().min(1).max(4000), at: z.string().optional().describe('ISO date-time with offset; default now') },
    run: ({ id, text, at }, ctx) => {
      const input = parse(createLogSchema, { text, at });
      const entry = addNote(ctx.db, id, input.text, input.at);
      changed(ctx, 'batches', id);
      return entry;
    },
  }),
  tool({
    name: 'add_reading',
    level: 'write',
    title: 'Add a gravity / temperature reading',
    description: 'Add a manual reading to a batch: gravity (SG) and/or temperature (°C) and/or a note.',
    input: {
      id: z.string(),
      gravity: z.number().min(0.98).max(1.2).optional(),
      tempC: z.number().min(-10).max(110).optional(),
      note: z.string().max(500).optional(),
      takenAt: z.string().optional().describe('ISO date-time with offset; default now'),
    },
    run: ({ id, ...reading }, ctx) => {
      const r = addReading(ctx.db, id, reading);
      changed(ctx, 'batches', id);
      return r;
    },
  }),
  tool({
    name: 'save_batch_to_recipe',
    level: 'write',
    title: "Save a batch's changes as a recipe",
    description: "Take the batch's copy of the recipe back: overwrite the recipe it came from (mode update) or save it as a new recipe (mode new).",
    input: { id: z.string(), mode: z.enum(['update', 'new']), name: z.string().trim().min(1).max(120).optional() },
    run: ({ id, mode, name }, ctx) => {
      const input = parse(saveToRecipeSchema, { mode, name });
      const r = saveBatchToRecipe(ctx.db, id, input.mode, input.name);
      changed(ctx, 'recipes', r.id);
      changed(ctx, 'batches', id);
      return { recipeId: r.id, version: r.version };
    },
  }),
  tool({
    name: 'brew_day_action',
    level: 'full',
    title: 'Brew-day action',
    description:
      'Act on a batch\'s brew day with the server clock, as the brew-day screen does: {"type":"start"}, {"type":"goto","stepId"}, {"type":"check","key","checked"}, {"type":"timerStart"|"timerPause"|"timerReset","timerId"}, {"type":"timerSet","timerId","elapsedMs"}, {"type":"finish"}, {"type":"reopen"}. Step ids, timer ids (= step ids) and checklist keys come from get_batch.',
    input: { id: z.string(), action: z.record(z.string(), z.unknown()) },
    run: ({ id, action }, ctx) => {
      const b = applyBrewDayAction(ctx.db, id, parse(brewDayActionSchema, action));
      logChange(ctx, id, 'brewday');
      changed(ctx, 'batches', id);
      return { id: b.id, status: b.status, brewday: b.brewday, serverTime: b.serverTime };
    },
  }),
  tool({
    name: 'delete_batch',
    level: 'full',
    title: 'Delete a batch',
    description: 'Delete a batch with its readings and log. It goes to the trash (restore_from_trash) until its time there is up (list_trash shows it).',
    input: { id: z.string() },
    run: ({ id }, ctx) => {
      deleteBatch(ctx.db, id);
      changed(ctx, 'batches');
      changed(ctx, 'equipment');
      return { deleted: id };
    },
  }),
  tool({
    name: 'delete_reading',
    level: 'full',
    title: 'Delete a reading',
    description: 'Delete one reading of a batch.',
    input: { batchId: z.string(), readingId: z.string() },
    run: ({ batchId, readingId }, ctx) => {
      deleteReading(ctx.db, batchId, readingId);
      changed(ctx, 'batches', batchId);
      return { deleted: readingId };
    },
  }),
  tool({
    name: 'delete_note',
    level: 'full',
    title: 'Delete a log note',
    description: "Delete a note from a batch's log.",
    input: { batchId: z.string(), noteId: z.string() },
    run: ({ batchId, noteId }, ctx) => {
      deleteNote(ctx.db, batchId, noteId);
      changed(ctx, 'batches', batchId);
      return { deleted: noteId };
    },
  }),
];
