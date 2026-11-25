import { z } from 'zod';
import { AMOUNT_KINDS, INVENTORY_KINDS } from '@brew/shared';
import { badRequest } from '../../lib/errors';
import { getBatch } from '../../services/batches';
import {
  adjustItem,
  batchInventory,
  createItem,
  deductBatch,
  deleteItem,
  getItem,
  listInventory,
  listTransactions,
  planBatch,
  undoBatchDeduction,
  updateItem,
} from '../../services/inventory';
import { getRecipe } from '../../services/recipes';
import { changed, tool } from '../tool';

const amountHelp = 'Canonical: kg for mass, L for volume, pieces for count (see amountKind).';
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD');

export const inventoryTools = [
  tool({
    name: 'list_inventory',
    level: 'read',
    title: 'List the inventory',
    description: `Ingredients in stock (one entry per lot): amount, producer, lot, best-before date, location, price per kg / L / piece and the low-stock limit. ${amountHelp}`,
    input: { kind: z.enum(INVENTORY_KINDS).optional(), query: z.string().max(100).optional().describe('Matches name or producer') },
    run: ({ kind, query }, { db }) => listInventory(db, kind, query?.trim() || undefined),
  }),
  tool({
    name: 'get_inventory_item',
    level: 'read',
    title: 'Inventory item and history',
    description: 'One stock item with its history (purchases, adjustments, brew-day use).',
    input: { id: z.string() },
    run: ({ id }, { db }) => ({ ...getItem(db, id), history: listTransactions(db, id).slice(0, 50) }),
  }),
  tool({
    name: 'plan_ingredients',
    level: 'read',
    title: 'Ingredients vs. stock',
    description:
      'For a recipe or a batch: each ingredient needed, how much is in stock, which stock items it would come from (oldest best-before first) and what is short — the shopping list. Give recipeId or batchId.',
    input: { recipeId: z.string().optional(), batchId: z.string().optional() },
    run: ({ recipeId, batchId }, { db }) => {
      if (batchId) {
        const plan = batchInventory(db, batchId);
        return { batch: getBatch(db, batchId).name, ...plan, shoppingList: plan.lines.filter((l) => l.short > 1e-9).map((l) => ({ name: l.name, kind: l.kind, short: l.short, amountKind: l.amountKind })) };
      }
      if (!recipeId) throw badRequest('Give recipeId or batchId');
      const recipe = getRecipe(db, recipeId);
      const lines = planBatch(db, recipe.doc);
      return { recipe: recipe.doc.name, lines, shoppingList: lines.filter((l) => l.short > 1e-9).map((l) => ({ name: l.name, kind: l.kind, short: l.short, amountKind: l.amountKind })) };
    },
  }),
  tool({
    name: 'add_inventory_item',
    level: 'write',
    title: 'Add stock',
    description: `Add an ingredient to the inventory (a purchase; recorded in its history). Link it to the library with libraryRef when there is a matching item (search_library). ${amountHelp}`,
    input: {
      kind: z.enum(INVENTORY_KINDS),
      name: z.string().trim().min(1).max(120),
      amount: z.number().min(0),
      amountKind: z.enum(AMOUNT_KINDS).optional().describe('mass (default; yeast: count), volume or count'),
      libraryRef: z.string().optional(),
      producer: z.string().max(120).optional(),
      lot: z.string().max(80).optional(),
      bestBefore: isoDate.optional(),
      location: z.string().max(80).optional(),
      unitCost: z.number().min(0).optional().describe('Price per kg, L or piece'),
      minAmount: z.number().min(0).optional().describe('Warn when the amount falls to this or below'),
      notes: z.string().max(2000).optional(),
    },
    run: (args, ctx) => {
      const item = createItem(ctx.db, { ...args, amountKind: args.amountKind ?? (args.kind === 'culture' ? 'count' : 'mass') });
      changed(ctx, 'inventory');
      return item;
    },
  }),
  tool({
    name: 'update_inventory_item',
    level: 'write',
    title: 'Change stock details',
    description: 'Change the details of a stock item (name, producer, lot, best-before, location, price, low-stock limit, notes). The amount changes only with adjust_inventory.',
    input: {
      id: z.string(),
      name: z.string().trim().min(1).max(120).optional(),
      producer: z.string().max(120).optional(),
      libraryRef: z.string().nullable().optional(),
      lot: z.string().max(80).optional(),
      bestBefore: isoDate.nullable().optional(),
      location: z.string().max(80).optional(),
      unitCost: z.number().min(0).nullable().optional(),
      minAmount: z.number().min(0).nullable().optional(),
      notes: z.string().max(2000).optional(),
    },
    run: ({ id, ...patch }, ctx) => {
      const item = updateItem(ctx.db, id, patch);
      changed(ctx, 'inventory');
      return item;
    },
  }),
  tool({
    name: 'adjust_inventory',
    level: 'write',
    title: 'Change a stock amount',
    description: `Change how much of a stock item there is: a positive delta for a purchase, negative for use or loss. Recorded in its history. ${amountHelp}`,
    input: { id: z.string(), delta: z.number(), reason: z.enum(['purchase', 'adjust']).optional(), note: z.string().max(500).optional() },
    run: ({ id, delta, reason, note }, ctx) => {
      const item = adjustItem(ctx.db, id, { delta, reason: reason ?? (delta > 0 ? 'purchase' : 'adjust'), note: note ?? '' });
      changed(ctx, 'inventory');
      return item;
    },
  }),
  tool({
    name: 'delete_inventory_item',
    level: 'full',
    title: 'Delete a stock item',
    description: 'Delete a stock item with its history.',
    input: { id: z.string() },
    run: ({ id }, ctx) => {
      deleteItem(ctx.db, id);
      changed(ctx, 'inventory');
      return { deleted: id };
    },
  }),
  tool({
    name: 'deduct_batch_inventory',
    level: 'full',
    title: "Take a batch's ingredients from stock",
    description: "Take a batch's ingredients from the inventory (as on brew day). Can be undone with undo_batch_deduction.",
    input: { batchId: z.string() },
    run: ({ batchId }, ctx) => {
      const plan = deductBatch(ctx.db, batchId);
      changed(ctx, 'inventory');
      changed(ctx, 'batches', batchId);
      return plan;
    },
  }),
  tool({
    name: 'undo_batch_deduction',
    level: 'full',
    title: "Put a batch's ingredients back",
    description: 'Undo deduct_batch_inventory: put the ingredients taken for a batch back into the inventory.',
    input: { batchId: z.string() },
    run: ({ batchId }, ctx) => {
      const plan = undoBatchDeduction(ctx.db, batchId);
      changed(ctx, 'inventory');
      changed(ctx, 'batches', batchId);
      return plan;
    },
  }),
];
