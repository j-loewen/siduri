import type { FileFormat, ImportPreview, RecipeDoc } from '@brew/shared';
import { exportBeerJson, importBeerJson, validateBeerJson } from './beerjson';
import { decodeXml, exportBeerXml, importBeerXml } from './beerxml';

export { exportBeerJson, exportBeerXml, importBeerJson, importBeerXml, validateBeerJson };

/** Read an uploaded BeerXML or BeerJSON file (format detected from the content). */
export function importFile(bytes: Uint8Array): ImportPreview {
  // Skip a UTF-8 byte order mark and leading whitespace to find the first real character.
  let i = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3;
  while (i < bytes.length && [0x20, 0x09, 0x0a, 0x0d].includes(bytes[i]!)) i++;
  const first = String.fromCharCode(bytes[i] ?? 0);
  if (first === '{') {
    let json: unknown;
    try {
      json = JSON.parse(new TextDecoder('utf-8').decode(bytes.subarray(i)));
    } catch (err) {
      throw new Error(`Not a readable JSON file: ${(err as Error).message}`);
    }
    return importBeerJson(json);
  }
  if (first === '<') return importBeerXml(decodeXml(bytes));
  throw new Error('Unknown file type: expected BeerXML (.xml) or BeerJSON (.json)');
}

/** Export recipes as a file: contents, MIME type and file extension. */
export function exportFile(docs: RecipeDoc[], format: FileFormat): { body: string; contentType: string; ext: string } {
  if (format === 'beerjson') {
    return { body: JSON.stringify(exportBeerJson(docs), null, 2), contentType: 'application/json; charset=utf-8', ext: 'json' };
  }
  return { body: exportBeerXml(docs), contentType: 'application/xml; charset=utf-8', ext: 'xml' };
}
