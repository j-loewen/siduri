import { z } from 'zod';
import type { EquipmentData } from './equipment';
import { LIBRARY_KINDS, type LibraryDataMap, type LibraryKind } from './library';
import { recipeDocSchema, type RecipeDoc } from './recipe';

/** Import and export of BeerXML 1.0 and BeerJSON 3.0 files. */
export const FILE_FORMATS = ['beerxml', 'beerjson'] as const;
export type FileFormat = (typeof FILE_FORMATS)[number];

export type ImportedLibraryItem = { [K in LibraryKind]: { kind: K; data: LibraryDataMap[K] } }[LibraryKind];

/** What was found in an uploaded file, before anything is saved. */
export interface ImportPreview {
  format: FileFormat;
  recipes: RecipeDoc[];
  library: ImportedLibraryItem[];
  equipment: EquipmentData[];
  /** Things that could not be read or were adjusted (shown to the user). */
  warnings: string[];
}

/** Save (part of) an import preview. */
export const importCommitSchema = z.object({
  recipes: z.array(recipeDocSchema).max(500).default([]),
  library: z
    .array(z.object({ kind: z.enum(LIBRARY_KINDS), data: z.unknown() }))
    .max(5000)
    .default([]),
  equipment: z.array(z.unknown()).max(100).default([]),
  /** Library items whose name (and kind) already exists are skipped instead of duplicated. */
  skipExisting: z.boolean().default(true),
});
export type ImportCommitInput = z.input<typeof importCommitSchema>;

export interface ImportResult {
  recipeIds: string[];
  libraryAdded: number;
  librarySkipped: number;
  equipmentAdded: number;
}
