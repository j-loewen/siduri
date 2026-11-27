import { z } from 'zod';

/**
 * The trash: deleted recipes, batches and other records are kept for a while (the brewery setting
 * `trashDays`) and can be restored until they are deleted for good.
 */
export const TRASH_KINDS = ['recipe', 'batch', 'inventory', 'library', 'equipment', 'vessel', 'device'] as const;
export type TrashKind = (typeof TRASH_KINDS)[number];

/** How long deleted things stay in the trash unless set otherwise; 0 turns the trash off. */
export const DEFAULT_TRASH_DAYS = 30;
export const MAX_TRASH_DAYS = 365;

export interface TrashItemDto {
  /** Id of the trash entry (not of the deleted record). */
  id: string;
  kind: TrashKind;
  /** Id of the deleted record; it gets the same id back when restored. */
  itemId: string;
  name: string;
  /**
   * A little more about it for the list: the style of a recipe, `#12` for a batch, the library or
   * inventory kind, the vessel or device type.
   */
  detail: string;
  deletedAt: string;
  /** When it is deleted for good. */
  purgeAt: string;
}

export interface TrashListDto {
  days: number;
  items: TrashItemDto[];
}

/**
 * `POST /api/trash/undo`: restore what was just deleted, by the kind and id the client already
 * knows (the delete itself answers 204 with no body).
 */
export const trashUndoSchema = z.object({ kind: z.enum(TRASH_KINDS), itemId: z.string().min(1).max(64) });
export type TrashUndoInput = z.infer<typeof trashUndoSchema>;

export interface TrashRestoreDto {
  kind: TrashKind;
  /** Id of the restored record. */
  id: string;
}
