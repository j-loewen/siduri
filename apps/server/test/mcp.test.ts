import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newRecipeDoc, type ApiTokenDto, type CreatedTokenDto, type InventoryItemDto, type RecipeDto, type TokenLevel } from '@brew/shared';
import { client, makeApp } from './helpers';

let app: FastifyInstance;
beforeEach(async () => {
  ({ app } = await makeApp({ BASE_URL: 'https://brew.example' }));
});
afterEach(async () => {
  await app.close();
});

async function signedIn() {
  const c = client(app);
  await c.register('brewer');
  return c;
}

async function newToken(c: Awaited<ReturnType<typeof signedIn>>, level: TokenLevel, name = `Claude ${level}`) {
  const res = await c.post('/api/tokens', { name, level });
  expect(res.statusCode).toBe(201);
  return res.json<CreatedTokenDto>();
}

let nextId = 1;
/** One JSON-RPC call to the MCP endpoint, as an MCP client sends it. */
function rpc(token: string | null, method: string, params: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url: '/mcp',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token && { authorization: `Bearer ${token}` }),
      ...headers,
    },
    payload: { jsonrpc: '2.0', id: nextId++, method, params },
  });
}

async function toolNames(token: string) {
  const res = await rpc(token, 'tools/list');
  expect(res.statusCode).toBe(200);
  return (res.json().result.tools as { name: string }[]).map((t) => t.name);
}

/** Calls a tool; returns its parsed JSON result (or the error text). */
async function call(token: string, name: string, args: Record<string, unknown> = {}) {
  const res = await rpc(token, 'tools/call', { name, arguments: args });
  expect(res.statusCode).toBe(200);
  const result = res.json().result as { isError?: boolean; content: { text: string }[] };
  const text = result.content[0]!.text;
  return result.isError ? { error: text } : JSON.parse(text);
}

describe('MCP access tokens', () => {
  it('are shown once, listed without the secret, changed and revoked', async () => {
    const c = await signedIn();
    const created = await newToken(c, 'read', 'Claude Code');
    expect(created.token).toMatch(/^siduri_/);
    const list = (await c.get('/api/tokens')).json<ApiTokenDto[]>();
    expect(list).toEqual([expect.objectContaining({ id: created.id, name: 'Claude Code', level: 'read', lastUsedAt: null })]);
    expect(JSON.stringify(list)).not.toContain(created.token);

    // Using it notes when.
    await rpc(created.token, 'tools/list');
    expect((await c.get('/api/tokens')).json<ApiTokenDto[]>()[0]!.lastUsedAt).not.toBeNull();

    expect((await c.patch(`/api/tokens/${created.id}`, { level: 'full' })).json<ApiTokenDto>()).toMatchObject({ level: 'full', name: 'Claude Code' });
    expect(await toolNames(created.token)).toContain('delete_recipe');

    expect((await c.delete(`/api/tokens/${created.id}`)).statusCode).toBe(204);
    expect((await rpc(created.token, 'tools/list')).statusCode).toBe(401);
  });

  it("are personal: others can't see or change them", async () => {
    await app.close();
    ({ app } = await makeApp({ ALLOW_REGISTRATION: 'true' }));
    const owner = await signedIn();
    const created = await newToken(owner, 'write');
    const other = client(app);
    expect((await other.register('other')).statusCode).toBeLessThan(300);
    expect((await other.get('/api/tokens')).json<ApiTokenDto[]>()).toEqual([]);
    expect((await other.patch(`/api/tokens/${created.id}`, { level: 'full' })).statusCode).toBe(404);
    expect((await other.delete(`/api/tokens/${created.id}`)).statusCode).toBe(404);
    expect((await client(app).get('/api/tokens')).statusCode).toBe(401);
  });
});

describe('MCP endpoint', () => {
  it('needs a valid token and refuses foreign browser origins', async () => {
    const c = await signedIn();
    const { token } = await newToken(c, 'read');
    const none = await rpc(null, 'tools/list');
    expect(none.statusCode).toBe(401);
    expect(none.headers['www-authenticate']).toBe('Bearer');
    expect((await rpc('siduri_wrong', 'tools/list')).statusCode).toBe(401);
    // The session cookie is not enough.
    expect((await app.inject({ method: 'POST', url: '/mcp', headers: { cookie: c.cookie()!, 'content-type': 'application/json' }, payload: {} })).statusCode).toBe(401);
    expect((await rpc(token, 'tools/list', {}, { origin: 'https://evil.example' })).statusCode).toBe(403);
    expect((await rpc(token, 'tools/list', {}, { origin: 'https://brew.example' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/mcp' })).statusCode).toBe(405);
  });

  it('initializes like any MCP server', async () => {
    const c = await signedIn();
    const { token } = await newToken(c, 'read');
    const res = await rpc(token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    expect(res.statusCode).toBe(200);
    const result = res.json().result;
    expect(result.serverInfo.name).toBe('siduri');
    expect(result.instructions).toContain('get_overview');
    expect(result.capabilities.tools).toBeDefined();
  });

  it('offers tools by token level', async () => {
    const c = await signedIn();
    const read = await toolNames((await newToken(c, 'read')).token);
    const write = await toolNames((await newToken(c, 'write')).token);
    const full = await toolNames((await newToken(c, 'full')).token);
    expect(read).toContain('get_recipe');
    expect(read).not.toContain('update_recipe');
    expect(write).toContain('update_recipe');
    expect(write).not.toContain('delete_recipe');
    expect(write).not.toContain('brew_day_action');
    expect(full).toEqual(expect.arrayContaining(['delete_recipe', 'brew_day_action', 'deduct_batch_inventory']));
    // A read token can't call a write tool by name either.
    const res = await rpc((await newToken(c, 'read', 'ro')).token, 'tools/call', { name: 'create_recipe', arguments: { name: 'X' } });
    expect(JSON.stringify(res.json())).toMatch(/not found|error/i);
  });
});

describe('MCP tools', () => {
  async function setup() {
    const c = await signedIn();
    const { token } = await newToken(c, 'full');
    const doc = newRecipeDoc('Pale Ale');
    doc.fermentables.push({ id: 'f1', libraryRef: null, name: 'Pale Ale Malt', type: 'grain', grainGroup: 'base', producer: '', origin: '', colorEbc: 6, potentialSg: 1.037, fermentability: 1, amountKg: 5, use: 'mash' });
    doc.hops.push({ id: 'h1', libraryRef: null, name: 'Cascade', producer: '', origin: '', form: 'pellet', alphaPct: 6, betaPct: null, amountKg: 0.03, use: 'boil', timeMin: 60, tempC: null, day: null, durationDays: null });
    const recipe = (await c.post('/api/recipes', { doc })).json<RecipeDto>();
    return { c, token, recipe };
  }

  it('gives an overview and reads recipes with calculated values', async () => {
    const { token, recipe } = await setup();
    const overview = await call(token, 'get_overview');
    expect(overview.counts.recipes).toBe(1);
    expect(overview.displayUnits.massLarge).toBe('kg');

    const got = await call(token, 'get_recipe', { id: recipe.id });
    expect(got.version).toBe(recipe.version);
    expect(got.calculated.og).toBeGreaterThan(1.03);
    expect(got.calculated.ibu).toBeGreaterThan(10);
    expect(got.calculated.grist[0]).toMatchObject({ id: 'f1', pct: 100 });

    const found = await call(token, 'search_library', { kind: 'hop', query: 'cascade' });
    expect(found[0].name).toMatch(/cascade/i);
  });

  it('saves recipes with the version and refuses stale ones', async () => {
    const { c, token, recipe } = await setup();
    const doc = { ...recipe.doc, batchSizeL: 25 };
    const preview = await call(token, 'calculate_recipe', { doc });
    expect(preview.volumesL.fermenterL).toBe(25);

    const saved = await call(token, 'update_recipe', { id: recipe.id, version: recipe.version, doc });
    expect(saved.version).toBe(recipe.version + 1);
    expect((await c.get(`/api/recipes/${recipe.id}`)).json<RecipeDto>().doc.batchSizeL).toBe(25);

    const stale = await call(token, 'update_recipe', { id: recipe.id, version: recipe.version, doc });
    expect(stale.error).toMatch(/read it again/i);
    const invalid = await call(token, 'update_recipe', { id: recipe.id, version: saved.version, doc: { ...doc, batchSizeL: -1 } });
    expect(invalid.error).toBeDefined();
  });

  it('works with the inventory: plan, add stock, adjust', async () => {
    const { c, token, recipe } = await setup();
    const before = await call(token, 'plan_ingredients', { recipeId: recipe.id });
    expect(before.shoppingList.map((l: { name: string }) => l.name)).toEqual(['Pale Ale Malt', 'Cascade']);

    const item = await call(token, 'add_inventory_item', { kind: 'fermentable', name: 'Pale Ale Malt', amount: 3, producer: 'Crisp' });
    expect(item).toMatchObject({ amount: 3, amountKind: 'mass', producer: 'Crisp' });
    const adjusted = await call(token, 'adjust_inventory', { id: item.id, delta: 4, note: 'bought' });
    expect(adjusted.amount).toBe(7);
    expect((await c.get(`/api/inventory/${item.id}/transactions`)).json<unknown[]>()).toHaveLength(2);

    const after = await call(token, 'plan_ingredients', { recipeId: recipe.id });
    expect(after.shoppingList.map((l: { name: string }) => l.name)).toEqual(['Cascade']);
    expect((await c.get('/api/inventory')).json<InventoryItemDto[]>()).toHaveLength(1);
  });

  it('manages equipment profiles, vessels and devices', async () => {
    const { c, token } = await setup();
    const profile = await call(token, 'create_equipment_profile', { data: { name: 'BrewZilla 35', method: 'biab', batchVolumeL: 23 } });
    expect(profile).toMatchObject({ name: 'BrewZilla 35', isDefault: true, data: { method: 'biab', batchVolumeL: 23, boilTimeMin: 60 } });
    // Only the given fields change.
    const changedProfile = await call(token, 'update_equipment_profile', { id: profile.id, data: { boilOffLPerH: 2.5 } });
    expect(changedProfile.data).toMatchObject({ method: 'biab', batchVolumeL: 23, boilOffLPerH: 2.5 });
    expect((await call(token, 'update_equipment_profile', { id: profile.id, data: { batchVolumeL: -5 } })).error).toBeDefined();
    const second = await call(token, 'create_equipment_profile', { data: { name: 'Big kettle' } });
    expect(second.isDefault).toBe(false);
    expect((await call(token, 'set_default_equipment', { id: second.id })).isDefault).toBe(true);

    const fv = await call(token, 'create_vessel', { name: 'FV2', capacityL: 30 });
    expect(fv).toMatchObject({ name: 'FV2', kind: 'fermenter', capacityL: 30, notes: '' });
    expect(await call(token, 'update_vessel', { id: fv.id, notes: 'Speidel' })).toMatchObject({ capacityL: 30, notes: 'Speidel' });

    const pill = (await c.post('/api/devices', { name: 'Pill', type: 'rapt_pill' })).json<{ id: string; token: string }>();
    const moved = await call(token, 'update_device', { id: pill.id, vesselId: fv.id });
    expect(moved).toMatchObject({ name: 'Pill', vesselId: fv.id });
    expect((await call(token, 'update_device', { id: pill.id, vesselId: 'nope' })).error).toBeDefined();

    const all = await call(token, 'list_equipment');
    expect(all.profiles).toHaveLength(2);
    expect(all.vessels.map((v: { name: string }) => v.name)).toEqual(['FV2']);
    expect(all.devices[0]).toMatchObject({ id: pill.id, vesselId: fv.id });
    // The push token is a secret and stays out.
    expect(JSON.stringify(all)).not.toContain(pill.token);

    expect(await call(token, 'delete_vessel', { id: fv.id })).toEqual({ deleted: fv.id });
    expect(await call(token, 'delete_device', { id: pill.id })).toEqual({ deleted: pill.id });
    expect(await call(token, 'delete_equipment_profile', { id: profile.id })).toEqual({ deleted: profile.id });
    expect(await call(token, 'list_equipment')).toMatchObject({ profiles: [{ id: second.id }], vessels: [], devices: [] });
  });

  it('keeps equipment changes and deletes to write and full tokens', async () => {
    const c = await signedIn();
    const read = await toolNames((await newToken(c, 'read')).token);
    const write = await toolNames((await newToken(c, 'write')).token);
    expect(read).toContain('list_equipment');
    expect(read).not.toContain('update_equipment_profile');
    expect(write).toEqual(expect.arrayContaining(['create_equipment_profile', 'update_equipment_profile', 'set_default_equipment', 'create_vessel', 'update_vessel', 'update_device']));
    expect(write).not.toContain('delete_vessel');
    expect(write).not.toContain('delete_equipment_profile');
    expect(write).not.toContain('delete_device');
  });

  it('starts batches, logs changes made through MCP and runs brew-day actions', async () => {
    const { c, token, recipe } = await setup();
    const batch = await call(token, 'create_batch', { recipeId: recipe.id });
    const changed = await call(token, 'update_batch', { id: batch.id, measured: { og: 1.051 } });
    expect(changed.measured.og).toBe(1.051);
    const note = await call(token, 'add_batch_note', { id: batch.id, text: 'Smells great' });
    expect(note.text).toBe('Smells great');
    const started = await call(token, 'brew_day_action', { id: batch.id, action: { type: 'start' } });
    expect(started.status).toBe('brewing');

    const full = await call(token, 'get_batch', { id: batch.id });
    expect(full.brewDaySteps.length).toBeGreaterThan(3);
    const log = (await c.get(`/api/batches/${batch.id}/log`)).json<{ text: string }[]>().map((e) => e.text);
    expect(log).toEqual(expect.arrayContaining(['mcp:details:Claude full', 'mcp:brewday:Claude full', 'Smells great']));
  });
});
