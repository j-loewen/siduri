import { and, eq, lt, sql } from 'drizzle-orm';
import { MAX_IMAGE_BYTES, type ImageDto, type ImageType } from '@brew/shared';
import type { Db } from '../db';
import { appSettings, batches, images, recipes } from '../db/schema';
import { badRequest, notFound } from '../lib/errors';

/** The picture format, from the file's first bytes (never trust a file name or header). */
export function detectImageType(data: Uint8Array): ImageType | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...data.subarray(from, to));
  if (data.length > 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (ascii(0, 4) === 'GIF8') return 'image/gif';
  return null;
}

export function saveImage(db: Db, data: Buffer): ImageDto {
  if (data.length === 0) throw badRequest('Send the picture as the request body');
  if (data.length > MAX_IMAGE_BYTES) throw badRequest('The picture is too large');
  const type = detectImageType(data);
  if (!type) throw badRequest('Not a picture (WebP, JPEG, PNG or GIF)');
  const id = crypto.randomUUID();
  db.insert(images).values({ id, type, data, bytes: data.length }).run();
  return { id, type, bytes: data.length };
}

export function getImage(db: Db, id: string) {
  const row = db.select({ type: images.type, data: images.data }).from(images).where(eq(images.id, id)).get();
  if (!row) throw notFound('Picture not found');
  return row;
}

/**
 * Deletes pictures no recipe, batch or the brewery settings refer to, once they are older than `minAgeMs` (a picture
 * just uploaded may not be saved in its recipe yet).
 */
export function pruneImages(db: Db, minAgeMs: number): number {
  const used = sql`(
    select json_extract(${recipes.doc}, '$.image') from ${recipes} where json_extract(${recipes.doc}, '$.image') is not null
    union
    select json_extract(${batches.doc}, '$.image') from ${batches} where json_extract(${batches.doc}, '$.image') is not null
    union
    select json_extract(${appSettings.data}, '$.breweryLogo') from ${appSettings} where json_extract(${appSettings.data}, '$.breweryLogo') is not null
  )`;
  return db
    .delete(images)
    .where(and(lt(images.createdAt, new Date(Date.now() - minAgeMs)), sql`${images.id} not in ${used}`))
    .run().changes;
}
