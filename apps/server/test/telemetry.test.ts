import { describe, expect, it } from 'vitest';
import { normaliseGravity, parseBody, readTelemetry } from '../src/devices/telemetry';

const now = new Date('2026-11-23T12:00:00Z');

describe('reading telemetry', () => {
  it('RAPT API hydrometer telemetry', () => {
    expect(
      readTelemetry({ id: 'x', createdOn: '2026-11-23T11:45:00Z', macAddress: 'AA', rssi: -70, temperature: 18.75, gravity: 1048.3, gravityVelocity: -1.2, battery: 96, version: 1 }, now),
    ).toEqual({ at: '2026-11-23T11:45:00.000Z', gravity: 1.0483, tempC: 18.75, targetTempC: null, battery: 96, rssi: -70 });
  });

  it('RAPT Brew Data Stream ("Custom" stream, new RAPT platform): envelope with nested data', () => {
    const stream = {
      event: 'telemetry',
      deviceId: 'pill-1',
      deviceType: 'PillHydrometer',
      name: 'RAPT Pill',
      timestamp: '2026-11-23T11:45:00.000Z',
      data: { temperature: 20, gravity: 1.05, battery: 100, rssi: -60 },
    };
    expect(readTelemetry(stream, now)).toEqual({ at: '2026-11-23T11:45:00.000Z', gravity: 1.05, tempC: 20, targetTempC: null, battery: 100, rssi: -60 });
    // Gravity as points (SG × 1000) and °F.
    expect(readTelemetry({ ...stream, data: { ...stream.data, gravity: 1050, temperature: 68, temp_units: 'F' } }, now)).toMatchObject({ gravity: 1.05, tempC: 20 });
  });

  it('RAPT controller telemetry has a target', () => {
    expect(readTelemetry({ createdOn: '2026-11-23T11:50:00Z', temperature: 19.1, targetTemperature: 19 }, now)).toMatchObject({ tempC: 19.1, targetTempC: 19, gravity: null });
  });

  it('iSpindel posts (°Plato or SG, °C or °F)', () => {
    const spindel = { name: 'iSpindel000', ID: 1234, angle: 52.1, temperature: 64.4, temp_units: 'F', battery: 4.05, gravity: 12.1, interval: 900, RSSI: -60 };
    const t = readTelemetry(spindel, now)!;
    expect(t.tempC).toBeCloseTo(18, 5);
    expect(t.gravity).toBeCloseTo(1.0488, 3);
    expect(t).toMatchObject({ battery: 4.05, rssi: -60, at: now.toISOString() });
    expect(readTelemetry({ ...spindel, gravity: 1.041, temp_units: 'C', temperature: 19 }, now)).toMatchObject({ gravity: 1.041, tempC: 19 });
    expect(readTelemetry({ ...spindel, temp_units: 'K', temperature: 292.15 }, now)!.tempC).toBeCloseTo(19, 5);
    // Without a calibration formula the iSpindel sends gravity 0: only the temperature is kept.
    expect(readTelemetry({ ...spindel, gravity: 0, temp_units: 'C', temperature: 19 }, now)).toMatchObject({ gravity: null, tempC: 19 });
  });

  it('nested and string values, unknown names', () => {
    expect(readTelemetry({ device: 'pill', data: { SG: '1.012', Temp: '20,5' } }, now)).toMatchObject({ gravity: 1.012, tempC: 20.5 });
    expect(readTelemetry({ hello: 'world' }, now)).toBeNull();
    expect(readTelemetry('nope', now)).toBeNull();
  });

  it('rejects implausible values and future timestamps', () => {
    expect(normaliseGravity(5000)).toBeNull();
    expect(readTelemetry({ gravity: 1.05, temperature: 500, timestamp: '2030-01-01T00:00:00Z' }, now)).toMatchObject({ tempC: null, at: now.toISOString() });
    // Unix seconds.
    expect(readTelemetry({ gravity: 1.05, time: 1795000000 }, now)!.at).toBe(new Date(1795000000 * 1000).toISOString());
  });

  it('parses JSON, form and text bodies', () => {
    expect(parseBody('{"gravity":1.04}')).toEqual({ gravity: 1.04 });
    expect(parseBody('gravity=1.04&temperature=18')).toEqual({ gravity: '1.04', temperature: '18' });
    expect(parseBody({ temperature: 18 }, { gravity: '1.03' })).toEqual({ gravity: '1.03', temperature: 18 });
  });
});
