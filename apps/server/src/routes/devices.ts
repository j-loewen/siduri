import type { FastifyInstance } from 'fastify';
import type { RaptStreamDto, TiltStreamDto } from '@brew/shared';
import type { AppConfig } from '../config';
import type { Db } from '../db';
import {
  findOrAddRaptDevice,
  findOrAddStreamDevice,
  keyOfRequest,
  RAPT_STREAM_PATH,
  raptTypeOf,
  regenerateStreamKey,
  sameKey,
  streamDeviceOf,
  streamKey,
  TILT_STREAM_PATH,
  tiltDeviceOf,
  tiltTelemetry,
} from '../devices/stream';
import { parseBody, readTelemetry } from '../devices/telemetry';
import { badRequest, notFound, unauthorized } from '../lib/errors';
import { publishChange } from '../live/hub';
import { requireUser } from '../plugins/auth';
import { createDevice, deleteDevice, findDeviceByToken, getDevice, listDevices, recordTelemetry, regenerateToken, updateDevice } from '../services/devices';

type IdParams = { Params: { id: string } };

/** Devices, the RAPT data stream settings, and the push endpoints devices post their telemetry to. */
export async function deviceRoutes(app: FastifyInstance, { db, config }: { db: Db; config: AppConfig }) {
  app.get('/api/devices', async (req) => {
    requireUser(req);
    return listDevices(db);
  });

  app.post('/api/devices', async (req, reply) => {
    requireUser(req);
    const device = createDevice(db, req.body);
    publishChange(req, 'devices');
    return reply.code(201).send(device);
  });

  app.get<IdParams>('/api/devices/:id', async (req) => {
    requireUser(req);
    return getDevice(db, req.params.id);
  });

  app.patch<IdParams>('/api/devices/:id', async (req) => {
    requireUser(req);
    const device = updateDevice(db, req.params.id, req.body);
    publishChange(req, 'devices');
    return device;
  });

  app.post<IdParams>('/api/devices/:id/token', async (req) => {
    requireUser(req);
    const device = regenerateToken(db, req.params.id);
    publishChange(req, 'devices');
    return device;
  });

  app.delete<IdParams>('/api/devices/:id', async (req, reply) => {
    requireUser(req);
    deleteDevice(db, req.params.id);
    publishChange(req, 'devices');
    return reply.code(204).send();
  });

  // ---- Streams (RAPT Brew Data Stream, Tilt cloud logging): their URL and key

  const fullUrl = (path: string) => (config.baseUrl ? `${config.baseUrl.replace(/\/+$/, '')}${path}` : null);
  const raptDto = (key: string): RaptStreamDto => ({ url: fullUrl(RAPT_STREAM_PATH), path: RAPT_STREAM_PATH, key });
  const tiltDto = (key: string): TiltStreamDto => {
    const path = `${TILT_STREAM_PATH}/${key}`;
    return { url: fullUrl(path), path };
  };

  app.get('/api/rapt/stream', async (req) => {
    requireUser(req);
    return raptDto(streamKey(db, 'rapt_stream'));
  });

  app.post('/api/rapt/stream/key', async (req) => {
    requireUser(req);
    const dto = raptDto(regenerateStreamKey(db, 'rapt_stream'));
    publishChange(req, 'devices');
    return dto;
  });

  app.get('/api/tilt/stream', async (req) => {
    requireUser(req);
    return tiltDto(streamKey(db, 'tilt_stream'));
  });

  app.post('/api/tilt/stream/key', async (req) => {
    requireUser(req);
    const dto = tiltDto(regenerateStreamKey(db, 'tilt_stream'));
    publishChange(req, 'devices');
    return dto;
  });
}

/**
 * Push endpoint: POST (or GET) /api/integrations/telemetry/<token> with JSON, form data or text.
 * No login and no CSRF header (devices and clouds post here); the token identifies the device.
 */
export async function ingestRoutes(app: FastifyInstance, { db }: { db: Db }) {
  // Accept whatever devices send, in this plugin only.
  app.addContentTypeParser(['text/plain', 'application/x-www-form-urlencoded'], { parseAs: 'string', bodyLimit: 64 * 1024 }, (_req, body, done) => done(null, body));

  const handler = async (req: { params: unknown; body: unknown; query: unknown }) => {
    const { token } = req.params as { token: string };
    const device = findDeviceByToken(db, token);
    if (!device) throw notFound('Unknown device');
    const payload = parseBody(req.body, (req.query ?? {}) as Record<string, unknown>);
    // A Tilt always sends °F without saying so.
    const telemetry = device.type === 'tilt' ? tiltTelemetry(payload) : readTelemetry(payload);
    const result = recordTelemetry(db, device.id, telemetry ? [telemetry] : [], JSON.stringify(payload));
    app.live.publish({ kind: 'changed', area: 'devices', id: device.id });
    if (result.batchId) app.live.publish({ kind: 'changed', area: 'batches', id: result.batchId });
    return { ok: true, understood: telemetry != null };
  };
  const limit = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } };
  app.post('/api/integrations/telemetry/:token', limit, handler);
  app.get('/api/integrations/telemetry/:token', limit, handler);

  /**
   * RAPT Brew Data Stream: one URL for all RAPT devices, authenticated by the stream key. Each
   * message names its device (RAPT id); a device seen for the first time is added.
   */
  app.post(RAPT_STREAM_PATH, limit, async (req) => {
    if (!sameKey(keyOfRequest(req.headers, (req.query ?? {}) as Record<string, unknown>), streamKey(db, 'rapt_stream'))) {
      throw unauthorized('Wrong or missing key: add the header "Authorization: Bearer <key>" shown in the app');
    }
    const messages = Array.isArray(req.body) ? req.body : [req.body];
    const results: { deviceId: string; added: boolean; understood: boolean }[] = [];
    for (const message of messages.slice(0, 50)) {
      const payload = parseBody(message, (req.query ?? {}) as Record<string, unknown>);
      delete payload.key;
      const who = streamDeviceOf(payload);
      if (!who) throw badRequest('The message names no device (deviceId or name)');
      const telemetry = readTelemetry(payload);
      const device = findOrAddRaptDevice(db, who, raptTypeOf(payload.deviceType ?? payload.device_type, telemetry?.gravity != null));
      const result = recordTelemetry(db, device.id, telemetry ? [telemetry] : [], JSON.stringify(payload));
      app.live.publish({ kind: 'changed', area: 'devices', id: device.id });
      if (result.batchId) app.live.publish({ kind: 'changed', area: 'batches', id: result.batchId });
      results.push({ deviceId: device.id, added: device.added, understood: telemetry != null });
    }
    return { ok: true, ...(results.length === 1 ? results[0] : { results }) };
  });

  /**
   * Tilt cloud logging (Tilt app, TiltPi): one URL for all Tilts, with the key in the path. Each post
   * names its Tilt by colour; a colour seen for the first time is added. The apps show the answer's
   * `result` to the user, so errors are said there too.
   */
  app.post<{ Params: { key: string } }>(`${TILT_STREAM_PATH}/:key`, limit, async (req, reply) => {
    if (!sameKey(req.params.key, streamKey(db, 'tilt_stream'))) {
      return reply.code(401).send({ result: 'Wrong address: copy the cloud URL again from the app (Add device → Tilt)' });
    }
    const payload = parseBody(req.body, (req.query ?? {}) as Record<string, unknown>);
    // On a new log the Tilt app may put the user's e-mail in Comment (for Google Sheets): don't keep it.
    if (String(payload.Comment ?? '').includes('@')) delete payload.Comment;
    const who = tiltDeviceOf(payload);
    if (!who) return reply.code(400).send({ result: 'No Tilt colour (Color) in the message' });
    const telemetry = tiltTelemetry(payload);
    const device = findOrAddStreamDevice(db, who, 'tilt', ['tilt']);
    const result = recordTelemetry(db, device.id, telemetry ? [telemetry] : [], JSON.stringify(payload));
    app.live.publish({ kind: 'changed', area: 'devices', id: device.id });
    if (result.batchId) app.live.publish({ kind: 'changed', area: 'batches', id: result.batchId });
    return { result: 'success', deviceId: device.id, added: device.added, understood: telemetry != null };
  });
}
