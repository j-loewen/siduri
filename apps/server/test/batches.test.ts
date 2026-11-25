import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newRecipeDoc, type BatchDto, type BatchSummaryDto, type LogEntryDto, type ReadingDto, type RecipeDto } from '@brew/shared';
import { client, makeApp } from './helpers';

let app: FastifyInstance;
beforeEach(async () => {
  ({ app } = await makeApp());
});
afterEach(async () => {
  vi.useRealTimers();
  await app.close();
});

async function setup() {
  const c = client(app);
  await c.register('brewer');
  const doc = newRecipeDoc('Pale Ale');
  doc.batchSizeL = 20;
  doc.fermentables.push({ id: 'f1', libraryRef: null, name: 'Pale', type: 'grain', grainGroup: 'base', producer: '', origin: '', colorEbc: 6, potentialSg: 1.037, fermentability: 1, amountKg: 5, use: 'mash' });
  doc.hops.push({ id: 'h1', libraryRef: null, name: 'Cascade', producer: '', origin: '', form: 'pellet', alphaPct: 6, betaPct: null, amountKg: 0.03, use: 'boil', timeMin: 60, tempC: null, day: null, durationDays: null });
  const recipe = (await c.post('/api/recipes', { doc })).json<RecipeDto>();
  return { c, recipe };
}

describe('batches', () => {
  it('copies the recipe; changes to the batch leave the recipe alone', async () => {
    const { c, recipe } = await setup();
    const res = await c.post('/api/batches', { recipeId: recipe.id });
    expect(res.statusCode).toBe(201);
    const batch = res.json<BatchDto>();
    expect(batch).toMatchObject({ number: 1, name: 'Pale Ale', status: 'planned', recipeId: recipe.id });

    const changed = { ...batch.doc, hops: batch.doc.hops.map((h) => ({ ...h, amountKg: 0.05 })) };
    const saved = (await c.put(`/api/batches/${batch.id}`, { doc: changed, version: batch.version })).json<BatchDto>();
    expect(saved.version).toBe(2);
    expect((await c.put(`/api/batches/${batch.id}`, { doc: changed, version: 1 })).statusCode).toBe(409);
    expect((await c.get(`/api/recipes/${recipe.id}`)).json<RecipeDto>().doc.hops[0]!.amountKg).toBe(0.03);

    const second = (await c.post('/api/batches', { recipeId: recipe.id, name: 'Second' })).json<BatchDto>();
    expect(second.number).toBe(2);
    expect((await c.get('/api/batches')).json<BatchSummaryDto[]>().map((b) => b.number)).toEqual([2, 1]);
  });

  it('scales to the chosen equipment', async () => {
    const { c, recipe } = await setup();
    const eq = (await c.post('/api/equipment', { data: { name: 'Big', batchVolumeL: 40, brewhouseEfficiencyPct: 72 } })).json();
    const batch = (await c.post('/api/batches', { recipeId: recipe.id, equipmentId: eq.id })).json<BatchDto>();
    expect(batch.doc.batchSizeL).toBe(40);
    expect(batch.doc.equipment?.name).toBe('Big');
    expect(batch.doc.fermentables[0]!.amountKg).toBeCloseTo(10, 6);
  });

  it('saves the batch back to the recipe or as a new one', async () => {
    const { c, recipe } = await setup();
    const batch = (await c.post('/api/batches', { recipeId: recipe.id })).json<BatchDto>();
    await c.put(`/api/batches/${batch.id}`, { doc: { ...batch.doc, name: 'Renamed batch', boilTimeMin: 90 }, version: 1 });

    const updated = (await c.post(`/api/batches/${batch.id}/save-to-recipe`, { mode: 'update' })).json<RecipeDto>();
    expect(updated).toMatchObject({ id: recipe.id, doc: { name: 'Pale Ale', boilTimeMin: 90 } });

    const created = (await c.post(`/api/batches/${batch.id}/save-to-recipe`, { mode: 'new', name: 'Pale Ale v2' })).json<RecipeDto>();
    expect(created.id).not.toBe(recipe.id);
    expect((await c.get(`/api/batches/${batch.id}`)).json<BatchDto>().recipeId).toBe(created.id);
  });

  it('keeps the batch when its recipe is deleted', async () => {
    const { c, recipe } = await setup();
    const batch = (await c.post('/api/batches', { recipeId: recipe.id })).json<BatchDto>();
    await c.delete(`/api/recipes/${recipe.id}`);
    const again = (await c.get(`/api/batches/${batch.id}`)).json<BatchDto>();
    expect(again.recipeId).toBeNull();
    expect((await c.post(`/api/batches/${batch.id}/save-to-recipe`, { mode: 'update' })).statusCode).toBe(400);
  });
});

describe('brew day', () => {
  it('runs timers on the server clock and finishes into fermentation', async () => {
    const { c, recipe } = await setup();
    const batch = (await c.post('/api/batches', { recipeId: recipe.id })).json<BatchDto>();
    const act = (body: object) => c.post(`/api/batches/${batch.id}/brewday`, body).then((r) => r.json<BatchDto>());

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-28T09:00:00Z'));
    let b = await act({ type: 'start' });
    expect(b).toMatchObject({ status: 'brewing', brewDate: '2026-11-28' });
    expect(b.brewday.startedAt).toBe('2026-11-28T09:00:00.000Z');

    b = await act({ type: 'timerStart', timerId: 'boil' });
    expect(b.brewday.timers.boil).toEqual({ startedAt: Date.parse('2026-11-28T09:00:00Z'), elapsedMs: 0 });
    vi.setSystemTime(new Date('2026-11-28T09:10:00Z'));
    b = await act({ type: 'timerPause', timerId: 'boil' });
    expect(b.brewday.timers.boil).toEqual({ startedAt: null, elapsedMs: 600_000 });
    b = await act({ type: 'timerSet', timerId: 'boil', elapsedMs: 900_000 });
    expect(b.brewday.timers.boil!.elapsedMs).toBe(900_000);

    b = await act({ type: 'check', key: 'gather:f1', checked: true });
    b = await act({ type: 'check', key: 'gather:h1', checked: true });
    b = await act({ type: 'check', key: 'gather:f1', checked: false });
    expect(b.brewday.checked).toEqual(['gather:h1']);
    b = await act({ type: 'goto', stepId: 'boil' });
    expect(b.brewday.stepId).toBe('boil');

    await c.patch(`/api/batches/${batch.id}`, { measured: { og: 1.052, fermenterVolumeL: 19.5 } });
    vi.setSystemTime(new Date('2026-11-28T15:00:00Z'));
    b = await act({ type: 'finish' });
    expect(b).toMatchObject({ status: 'fermenting', fermentationStart: '2026-11-28T15:00:00.000Z', measured: { og: 1.052, fermenterVolumeL: 19.5 } });

    // The OG becomes the first fermentation reading; the log has the events.
    const readings = (await c.get(`/api/batches/${batch.id}/readings`)).json<ReadingDto[]>();
    expect(readings).toEqual([expect.objectContaining({ gravity: 1.052, note: 'OG' })]);
    const log = (await c.get(`/api/batches/${batch.id}/log`)).json<LogEntryDto[]>();
    expect(log.map((l) => l.text)).toEqual(['brewdayFinished', 'brewdayStarted', 'created']);
  });

  it('rejects unknown actions and finishing before starting', async () => {
    const { c, recipe } = await setup();
    const batch = (await c.post('/api/batches', { recipeId: recipe.id })).json<BatchDto>();
    expect((await c.post(`/api/batches/${batch.id}/brewday`, { type: 'explode' })).statusCode).toBe(400);
    expect((await c.post(`/api/batches/${batch.id}/brewday`, { type: 'finish' })).statusCode).toBe(400);
  });
});

describe('readings and notes', () => {
  it('adds, lists and deletes', async () => {
    const { c, recipe } = await setup();
    const batch = (await c.post('/api/batches', { recipeId: recipe.id })).json<BatchDto>();
    const r = await c.post(`/api/batches/${batch.id}/readings`, { gravity: 1.02, tempC: 18.5, takenAt: '2026-12-01T10:00:00Z' });
    expect(r.statusCode).toBe(201);
    expect((await c.post(`/api/batches/${batch.id}/readings`, {})).statusCode).toBe(400);
    const list = (await c.get('/api/batches')).json<BatchSummaryDto[]>();
    expect(list[0]!.latestReading).toMatchObject({ gravity: 1.02, tempC: 18.5 });
    expect((await c.delete(`/api/batches/${batch.id}/readings/${r.json<ReadingDto>().id}`)).statusCode).toBe(204);

    const note = (await c.post(`/api/batches/${batch.id}/log`, { text: 'Krausen dropped' })).json<LogEntryDto>();
    expect(note.kind).toBe('note');
    expect((await c.delete(`/api/batches/${batch.id}/log/${note.id}`)).statusCode).toBe(204);
    // Events can't be deleted.
    const created = (await c.get(`/api/batches/${batch.id}/log`)).json<LogEntryDto[]>()[0]!;
    expect((await c.delete(`/api/batches/${batch.id}/log/${created.id}`)).statusCode).toBe(404);
  });

  it('saving some measured values keeps the others', async () => {
    const { c, recipe } = await setup();
    const batch = (await c.post('/api/batches', { recipeId: recipe.id })).json<BatchDto>();
    const url = `/api/batches/${batch.id}`;
    await c.patch(url, { measured: { preBoilGravity: 1.041, preBoilVolumeL: 46 } });
    await c.patch(url, { measured: { og: 1.049 } });
    // null clears a value on purpose.
    const again = (await c.patch(url, { measured: { fermenterVolumeL: 20.5, preBoilVolumeL: null } })).json<BatchDto>();
    expect(again.measured).toMatchObject({ preBoilGravity: 1.041, preBoilVolumeL: null, og: 1.049, fermenterVolumeL: 20.5 });
  });

  it('carbonation settings start as bottles and are merged when changed', async () => {
    const { c, recipe } = await setup();
    const batch = (await c.post('/api/batches', { recipeId: recipe.id })).json<BatchDto>();
    expect(batch.carbonation).toEqual({ method: 'bottle', vols: null, tempC: null });
    const url = `/api/batches/${batch.id}`;
    await c.patch(url, { carbonation: { vols: 2.6 } });
    const keg = (await c.patch(url, { carbonation: { method: 'keg_force', tempC: 3 } })).json<BatchDto>();
    expect(keg.carbonation).toEqual({ method: 'keg_force', vols: 2.6, tempC: 3 });
    expect((await c.patch(url, { carbonation: { method: 'can' } })).statusCode).toBe(400);
  });

  it('status changes are logged', async () => {
    const { c, recipe } = await setup();
    const batch = (await c.post('/api/batches', { recipeId: recipe.id })).json<BatchDto>();
    await c.patch(`/api/batches/${batch.id}`, { status: 'conditioning' });
    const log = (await c.get(`/api/batches/${batch.id}/log`)).json<LogEntryDto[]>();
    expect(log[0]!.text).toBe('status:conditioning');
  });
});
