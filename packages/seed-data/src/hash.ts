import { createHash } from 'node:crypto';

/** JSON with object keys sorted, so equal data gives equal text whatever the key order. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Short hash of library data. With `fields`, only those keys count, so fields added to a schema
 * later (with defaults) don't change the hash of data stored before.
 */
export function seedDataHash(data: Record<string, unknown>, fields?: readonly string[]): string {
  const picked = fields ? Object.fromEntries(fields.map((f) => [f, data[f]])) : data;
  return createHash('sha1').update(stableStringify(picked)).digest('hex').slice(0, 16);
}
