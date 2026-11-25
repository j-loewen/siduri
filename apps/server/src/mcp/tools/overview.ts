import { count } from 'drizzle-orm';
import { OCCUPYING_STATUSES, resolvePrefs } from '@brew/shared';
import { inventoryItems, libraryItems, recipes } from '../../db/schema';
import { listBatches } from '../../services/batches';
import { listEquipment } from '../../services/equipment';
import { lowStock } from '../../services/inventory';
import { getSettings } from '../../services/settings';
import { listVessels } from '../../services/vessels';
import { tool } from '../tool';

export const overviewTools = [
  tool({
    name: 'get_overview',
    level: 'read',
    title: 'Brewery overview',
    description:
      "Start here. The brewery's name, the user's preferred display units, active and planned batches, ingredients running low, equipment profiles, fermenters and how many recipes, stock items and library items there are.",
    input: {},
    run: (_args, { db, user }) => {
      const settings = getSettings(db);
      const n = (table: typeof recipes | typeof inventoryItems | typeof libraryItems) => db.select({ n: count() }).from(table).get()?.n ?? 0;
      const equipment = listEquipment(db);
      return {
        brewery: settings.breweryName || null,
        user: user.displayName,
        displayUnits: resolvePrefs(user.prefs).units,
        counts: { recipes: n(recipes), inventoryItems: n(inventoryItems), libraryItems: n(libraryItems) },
        activeBatches: listBatches(db, ['planned', ...OCCUPYING_STATUSES]).map((b) => ({
          id: b.id,
          number: b.number,
          name: b.name,
          status: b.status,
          style: b.styleName,
          brewDate: b.brewDate,
          vesselId: b.vesselId,
          latestReading: b.latestReading,
        })),
        lowStock: lowStock(db).map((i) => ({ id: i.id, kind: i.kind, name: i.name, producer: i.producer, amount: i.amount, amountKind: i.amountKind, minAmount: i.minAmount })),
        equipment: equipment.map((e) => ({ id: e.id, name: e.name, isDefault: e.isDefault, method: e.data.method, batchVolumeL: e.data.batchVolumeL })),
        vessels: listVessels(db).map((v) => ({ id: v.id, name: v.name, kind: v.kind, capacityL: v.capacityL, currentBatch: v.currentBatch })),
      };
    },
  }),
];
