import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newRecipeDoc, type BatchDto, type DeviceDto, type RaptStreamDto, type TiltStreamDto, type ReadingDto, type RecipeDto, type VesselDto } from '@brew/shared';
import { client, makeApp } from './helpers';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** A batch fermenting in a fermenter, with a Pill in that fermenter. */
async function setup() {
  ({ app } = await makeApp());
  const c = client(app);
  await c.register('brewer');
  const fv = (await c.post('/api/vessels', { name: 'FV1' })).json<VesselDto>();
  const recipe = (await c.post('/api/recipes', { doc: newRecipeDoc('Ale') })).json<RecipeDto>();
  const batch = (await c.post('/api/batches', { recipeId: recipe.id, vesselId: fv.id })).json<BatchDto>();
  await c.patch(`/api/batches/${batch.id}`, { status: 'fermenting' });
  const pill = (await c.post('/api/devices', { name: 'Pill', type: 'rapt_pill', vesselId: fv.id, externalId: 'pill-1' })).json<DeviceDto>();
  return { c, fv, batch, pill };
}

const readings = async (c: ReturnType<typeof client>, batchId: string) => (await c.get(`/api/batches/${batchId}/readings`)).json<ReadingDto[]>();

describe('devices', () => {
  it('know which batch they measure', async () => {
    const { c, batch, pill } = await setup();
    expect(pill.currentBatch).toMatchObject({ id: batch.id });
    expect(pill.token.length).toBeGreaterThan(20);
    const again = (await c.post(`/api/devices/${pill.id}/token`)).json<DeviceDto>();
    expect(again.token).not.toBe(pill.token);
    expect((await c.patch(`/api/devices/${pill.id}`, { vesselId: 'nope' })).statusCode).toBe(404);
  });
});

describe('push endpoint', () => {
  it('takes JSON, form data and GET, without login or CSRF header', async () => {
    const { c, batch, pill } = await setup();
    const url = `/api/integrations/telemetry/${pill.token}`;
    let res = await app!.inject({ method: 'POST', url, payload: { gravity: 1.048, temperature: 19.5, battery: 97, created_on: '2026-11-20T10:00:00Z' } });
    expect(res.json()).toEqual({ ok: true, understood: true });
    res = await app!.inject({ method: 'POST', url, payload: 'gravity=1046&temperature=19.4&created_on=2026-11-20T10:15:00Z', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    expect(res.statusCode).toBe(200);
    res = await app!.inject({ method: 'GET', url: `${url}?gravity=1.044&temperature=19.3&created_on=2026-11-20T10:30:00Z` });
    expect(res.statusCode).toBe(200);
    // Something it doesn't understand is kept for checking, but adds no reading.
    res = await app!.inject({ method: 'POST', url, payload: 'hello', headers: { 'content-type': 'text/plain' } });
    expect(res.json()).toEqual({ ok: true, understood: false });

    expect((await readings(c, batch.id)).map((r) => [r.gravity, r.tempC, r.source])).toEqual([
      [1.048, 19.5, 'device'],
      [1.046, 19.4, 'device'],
      [1.044, 19.3, 'device'],
    ]);
    const device = (await c.get(`/api/devices/${pill.id}`)).json<DeviceDto>();
    expect(device.lastTelemetry).toMatchObject({ gravity: 1.044, battery: null });
    expect(device.recent).toHaveLength(4);
    expect(device.recent[0]!.telemetry).toBeNull();
  });

  it('ignores old repeats and unknown tokens', async () => {
    const { c, batch, pill } = await setup();
    const url = `/api/integrations/telemetry/${pill.token}`;
    const body = { gravity: 1.05, temperature: 20, timestamp: '2026-11-20T10:00:00Z' };
    await app!.inject({ method: 'POST', url, payload: body });
    await app!.inject({ method: 'POST', url, payload: body });
    expect(await readings(c, batch.id)).toHaveLength(1);
    expect((await app!.inject({ method: 'POST', url: '/api/integrations/telemetry/wrong', payload: body })).statusCode).toBe(404);
  });

  it('controllers keep their state but add no gravity readings', async () => {
    const { c, batch, fv } = await setup();
    const ctl = (await c.post('/api/devices', { name: 'Chamber', type: 'rapt_chamber', vesselId: fv.id })).json<DeviceDto>();
    await app!.inject({ method: 'POST', url: `/api/integrations/telemetry/${ctl.token}`, payload: { temperature: 18.2, target_temperature: 18 } });
    expect(await readings(c, batch.id)).toHaveLength(0);
    expect((await c.get(`/api/devices/${ctl.id}`)).json<DeviceDto>().lastTelemetry).toMatchObject({ tempC: 18.2, targetTempC: 18 });
  });
});

describe('RAPT Brew Data Stream', () => {
  const message = (over: Record<string, unknown> = {}, data: Record<string, unknown> = {}) => ({
    event: 'telemetry',
    deviceId: 'pill-1',
    deviceType: 'PillHydrometer',
    name: 'RAPT Pill',
    timestamp: '2026-11-20T10:00:00.000Z',
    ...over,
    data: { temperature: 20, gravity: 1.05, battery: 100, rssi: -60, ...data },
  });

  it('has one URL and key for all devices; the key can be replaced', async () => {
    const { c } = await setup();
    const stream = (await c.get('/api/rapt/stream')).json<RaptStreamDto>();
    expect(stream).toMatchObject({ path: '/api/integrations/rapt', url: null });
    expect(stream.key.length).toBeGreaterThan(20);
    expect((await c.get('/api/rapt/stream')).json<RaptStreamDto>().key).toBe(stream.key);
    const fresh = (await c.post('/api/rapt/stream/key')).json<RaptStreamDto>();
    expect(fresh.key).not.toBe(stream.key);
    // Without login, nothing.
    expect((await app!.inject({ method: 'GET', url: '/api/rapt/stream' })).statusCode).toBe(401);
  });

  it('needs the key, and adds readings to the known device', async () => {
    const { c, batch, pill } = await setup();
    const { key } = (await c.get('/api/rapt/stream')).json<RaptStreamDto>();
    const post = (headers: Record<string, string>, payload: unknown, url = '/api/integrations/rapt') => app!.inject({ method: 'POST', url, headers, payload: payload as object });

    expect((await post({}, message())).statusCode).toBe(401);
    expect((await post({ authorization: 'Bearer wrong' }, message())).statusCode).toBe(401);

    const res = await post({ authorization: `Bearer ${key}` }, message());
    expect(res.json()).toEqual({ ok: true, deviceId: pill.id, added: false, understood: true });
    // The bare key, X-Api-Key and ?key= work as well.
    expect((await post({ authorization: key }, message({ timestamp: '2026-11-20T10:15:00Z' }, { gravity: 1049 }))).statusCode).toBe(200);
    expect((await post({ 'x-api-key': key }, message({ timestamp: '2026-11-20T10:30:00Z' }, { gravity: 1.048 }))).statusCode).toBe(200);
    expect((await post({}, message({ timestamp: '2026-11-20T10:45:00Z' }, { gravity: 1.047 }), `/api/integrations/rapt?key=${key}`)).statusCode).toBe(200);

    expect((await readings(c, batch.id)).map((r) => [r.gravity, r.tempC])).toEqual([
      [1.05, 20],
      [1.049, 20],
      [1.048, 20],
      [1.047, 20],
    ]);
    expect((await c.get(`/api/devices/${pill.id}`)).json<DeviceDto>().recent[0]!.raw).not.toContain(key);
  });

  it('adds a device it has not seen yet', async () => {
    const { c } = await setup();
    const { key } = (await c.get('/api/rapt/stream')).json<RaptStreamDto>();
    const headers = { authorization: `Bearer ${key}` };
    const res = await app!.inject({ method: 'POST', url: '/api/integrations/rapt', headers, payload: message({ deviceId: 'pill-2', name: 'Second Pill' }) });
    expect(res.json()).toMatchObject({ added: true, understood: true });
    const chamber = await app!.inject({
      method: 'POST',
      url: '/api/integrations/rapt',
      headers,
      payload: message({ deviceId: 'ch-9', deviceType: 'FermentationChamber', name: 'Fridge' }, { gravity: undefined, targetTemperature: 18 }),
    });
    expect(chamber.json()).toMatchObject({ added: true });
    const list = (await c.get('/api/devices')).json<DeviceDto[]>();
    expect(list.find((d) => d.externalId === 'pill-2')).toMatchObject({ name: 'Second Pill', type: 'rapt_pill', vesselId: null, lastTelemetry: { gravity: 1.05 } });
    expect(list.find((d) => d.externalId === 'ch-9')).toMatchObject({ type: 'rapt_chamber', lastTelemetry: { targetTempC: 18 } });
    // A second message goes to the same device.
    expect((await app!.inject({ method: 'POST', url: '/api/integrations/rapt', headers, payload: message({ deviceId: 'pill-2', timestamp: '2026-11-20T11:00:00Z' }) })).json()).toMatchObject({ added: false });
    expect((await c.get('/api/devices')).json<DeviceDto[]>()).toHaveLength(list.length);
    // A message that names no device is refused.
    expect((await app!.inject({ method: 'POST', url: '/api/integrations/rapt', headers, payload: { data: { gravity: 1.05 } } })).statusCode).toBe(400);
  });
});

describe('Tilt cloud logging', () => {
  const form = 'application/x-www-form-urlencoded; charset=utf-8';
  const post = (path: string, body: string) => app!.inject({ method: 'POST', url: path, headers: { 'content-type': form }, payload: body });

  it('has one URL with the key in it; the key can be replaced', async () => {
    const { c } = await setup();
    const stream = (await c.get('/api/tilt/stream')).json<TiltStreamDto>();
    expect(stream.url).toBeNull();
    expect(stream.path).toMatch(/^\/api\/integrations\/tilt\/[\w-]{20,}$/);
    const fresh = (await c.post('/api/tilt/stream/key')).json<TiltStreamDto>();
    expect(fresh.path).not.toBe(stream.path);
    expect((await post(stream.path, 'Color=RED&SG=1.05&Temp=68')).statusCode).toBe(401);
    expect((await app!.inject({ method: 'GET', url: '/api/tilt/stream' })).statusCode).toBe(401);
  });

  it('adds each colour as a device and reads °F and SG', async () => {
    const { c, batch, fv } = await setup();
    const { path } = (await c.get('/api/tilt/stream')).json<TiltStreamDto>();

    // As the Tilt app sends it: form data, Temp always °F, Timepoint in the phone's local time.
    let res = await post(path, 'Timepoint=46350.5&Temp=68.0&SG=1.0500&Beer=Pale%20Ale&Color=PINK&Comment=me%40example.com');
    expect(res.json()).toMatchObject({ result: 'success', added: true, understood: true });
    const pink = (await c.get('/api/devices')).json<DeviceDto[]>().find((d) => d.type === 'tilt')!;
    expect(pink).toMatchObject({ name: 'Tilt Pink', externalId: 'PINK', lastTelemetry: { gravity: 1.05, tempC: 20 } });
    // The e-mail the app puts in Comment on a new log isn't kept.
    expect(pink.recent[0]!.raw).not.toContain('example.com');

    // The same colour again: the same device. Linked to the batch's fermenter, readings go there.
    await c.patch(`/api/devices/${pink.id}`, { vesselId: fv.id });
    res = await post(path, 'Timepoint=46350.51&Temp=66.2&SG=1.0482&Beer=Pale%20Ale&Color=PINK&Comment=');
    expect(res.json()).toMatchObject({ added: false });
    expect((await readings(c, batch.id)).map((r) => [r.gravity, r.tempC])).toEqual([[1.0482, 19]]);

    // Its own push URL reads °F as well.
    await post(`/api/integrations/telemetry/${pink.token}`, 'Temp=64.4&SG=1.0470&Color=PINK');
    expect((await c.get(`/api/devices/${pink.id}`)).json<DeviceDto>().lastTelemetry).toMatchObject({ gravity: 1.047, tempC: 18 });

    // Identified by MAC address: its own device.
    res = await post(path, 'Temp=64.4&SG=1.012&Color=RED:aa:bb:cc:dd:ee:ff');
    expect(res.json()).toMatchObject({ added: true });
    expect((await c.get('/api/devices')).json<DeviceDto[]>().find((d) => d.externalId === 'RED:aa:bb:cc:dd:ee:ff')).toMatchObject({ name: 'Tilt Red (ee:ff)' });

    // No colour: refused, with a message the app shows.
    res = await post(path, 'Temp=64.4&SG=1.012');
    expect(res.statusCode).toBe(400);
    expect(res.json().result).toMatch(/colour/);
  });
});
