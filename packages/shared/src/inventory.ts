import { z } from 'zod';
import { AMOUNT_KINDS, type AmountKind } from './library';

/**
 * Ingredients in stock. Amounts are canonical (kg, L or a count, by `amountKind`). Every change
 * is recorded as a transaction, so brew-day deductions can be undone and the history shown.
 */

export const INVENTORY_KINDS = ['fermentable', 'hop', 'culture', 'misc'] as const;
export type InventoryKind = (typeof INVENTORY_KINDS)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const itemFields = {
  kind: z.enum(INVENTORY_KINDS),
  /** The library item this stock is of (matching recipes to stock uses it first, then the name). */
  libraryRef: z.string().max(64).nullable(),
  name: z.string().trim().min(1).max(120),
  /** Maltster, hop merchant, yeast lab, … (copied from the library item when picked from it). */
  producer: z.string().trim().max(120),
  amountKind: z.enum(AMOUNT_KINDS),
  /** Warn when the amount falls to or below this. */
  minAmount: z.number().min(0).max(1e6).nullable(),
  lot: z.string().trim().max(80),
  bestBefore: isoDate.nullable(),
  location: z.string().trim().max(80),
  /** Price paid per kg, L or piece (in your currency). */
  unitCost: z.number().min(0).max(1e6).nullable(),
  notes: z.string().max(2000),
};

export const createInventoryItemSchema = z.object({
  kind: itemFields.kind,
  libraryRef: itemFields.libraryRef.default(null),
  name: itemFields.name,
  producer: itemFields.producer.default(''),
  amountKind: itemFields.amountKind.default('mass'),
  amount: z.number().min(0).max(1e6).default(0),
  minAmount: itemFields.minAmount.default(null),
  lot: itemFields.lot.default(''),
  bestBefore: itemFields.bestBefore.default(null),
  location: itemFields.location.default(''),
  unitCost: itemFields.unitCost.default(null),
  notes: itemFields.notes.default(''),
});
export type CreateInventoryItemInput = z.input<typeof createInventoryItemSchema>;

/** Editing an item's details (the amount changes only through adjustments). No defaults: see users.ts. */
export const updateInventoryItemSchema = z.object(itemFields).omit({ kind: true }).partial();
export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>;

export const adjustInventorySchema = z.object({
  /** Change in canonical units: positive for a purchase, negative for use or loss. */
  delta: z.number().min(-1e6).max(1e6).refine((d) => d !== 0, 'The change must not be zero'),
  reason: z.enum(['purchase', 'adjust']).default('adjust'),
  note: z.string().trim().max(500).default(''),
});
export type AdjustInventoryInput = z.input<typeof adjustInventorySchema>;

export interface InventoryItemDto {
  id: string;
  kind: InventoryKind;
  libraryRef: string | null;
  name: string;
  producer: string;
  amountKind: AmountKind;
  amount: number;
  minAmount: number | null;
  lot: string;
  bestBefore: string | null;
  location: string;
  unitCost: number | null;
  notes: string;
  updatedAt: string;
}

export const INVENTORY_REASONS = ['purchase', 'adjust', 'brewday', 'undo'] as const;

export interface InventoryTxDto {
  id: string;
  itemId: string;
  batchId: string | null;
  batchNumber: number | null;
  delta: number;
  reason: (typeof INVENTORY_REASONS)[number];
  note: string;
  at: string;
}

/** Stock of one ingredient, summed over its lots (for the ingredient picker). */
export interface StockDto {
  kind: InventoryKind;
  libraryRef: string | null;
  name: string;
  producer: string;
  amountKind: AmountKind;
  amount: number;
}

/** What a batch needs from the inventory, and where it comes from. */
export interface BatchInventoryLine {
  /** Brew-day checklist key of the line (gather:<lineId>). */
  key: string;
  kind: InventoryKind;
  name: string;
  amountKind: AmountKind;
  needed: number;
  /** In stock, over all matching items. */
  available: number;
  /** Taken from these items (oldest best-before first). */
  takes: { itemId: string; name: string; lot: string; amount: number }[];
  /** Missing amount (shopping list). */
  short: number;
}

export interface BatchInventoryDto {
  lines: BatchInventoryLine[];
  /** Set when the batch's ingredients were taken from stock (and not undone). */
  deductedAt: string | null;
}
