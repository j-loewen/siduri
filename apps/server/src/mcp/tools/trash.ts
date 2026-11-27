import { z } from 'zod';
import { listTrash, restoreFromTrash, trashAreas } from '../../services/trash';
import { changed, tool } from '../tool';

export const trashTools = [
  tool({
    name: 'list_trash',
    level: 'read',
    title: 'The trash',
    description:
      'Deleted recipes, batches, stock items, library items, equipment profiles, vessels and devices, newest first, with when each was deleted and when it is deleted for good (purgeAt). `days` is how long things stay in the trash (0: the trash is off). `id` is the trash entry for restore_from_trash; `itemId` is the id the record had and gets back.',
    input: {},
    run: (_args, { db }) => listTrash(db),
  }),
  tool({
    name: 'restore_from_trash',
    level: 'write',
    title: 'Restore from the trash',
    description:
      'Put a deleted record back as it was, with its id (and a batch with its readings and log, a stock item with its history). Links that still make sense are restored too, e.g. batches to their recipe or vessel. Takes the trash entry id from list_trash.',
    input: { id: z.string() },
    run: ({ id }, ctx) => {
      const restored = restoreFromTrash(ctx.db, id);
      for (const area of trashAreas(restored.kind)) changed(ctx, area);
      changed(ctx, 'trash');
      return restored;
    },
  }),
];
