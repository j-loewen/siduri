import { z } from 'zod';
import { createVesselSchema, equipmentDataSchema, updateDeviceSchema, updateVesselSchema, type DeviceDto } from '@brew/shared';
import { parse } from '../../lib/errors';
import { deleteDevice, listDevices, updateDevice } from '../../services/devices';
import { createEquipment, deleteEquipment, getEquipment, listEquipment, updateEquipment } from '../../services/equipment';
import { updateSettings } from '../../services/settings';
import { createVessel, deleteVessel, listVessels, updateVessel } from '../../services/vessels';
import { changed, tool } from '../tool';

const profileFields =
  'Fields (canonical units): name, method (mash_sparge | biab | no_sparge | extract), batchVolumeL (into the fermenter), boilTimeMin, mashTunVolumeL, mashTunRecoverableL ("mash tun dead space": water below the false bottom / malt pipe, added to the mash water but not the total), mashTunDeadspaceL ("mash tun loss": wort that never reaches the kettle, added to the total water), kettleVolumeL, boilOffLPerH, kettleLossL, fermenterVolumeL, fermenterLossL, topUpWaterL, grainAbsorptionLPerKg, mashThicknessLPerKg, coolingShrinkagePct, mashEfficiencyPct, brewhouseEfficiencyPct, hopUtilizationPct (100 = no change), grainTempC, notes.';
const profileData = z.record(z.string(), z.unknown());

/** A device without its push token (a secret) and the raw messages it received. */
const deviceInfo = ({ token: _t, recent: _r, ...d }: DeviceDto) => d;

export const equipmentTools = [
  tool({
    name: 'list_equipment',
    level: 'read',
    title: 'Equipment, fermenters and devices',
    description:
      'Brewhouse equipment profiles (volumes, losses, efficiency; canonical L, kg, %; isDefault: the one new recipes start with), the vessels (fermenters, kegs …) with their capacity and current batch, and the smart devices (RAPT Pill, iSpindel, controllers) with their last reading and the fermenter or batch they measure.',
    input: {},
    run: (_args, { db }) => ({ profiles: listEquipment(db), vessels: listVessels(db), devices: listDevices(db).map(deviceInfo) }),
  }),

  // ---- Equipment profiles

  tool({
    name: 'create_equipment_profile',
    level: 'write',
    title: 'Add an equipment profile',
    description: `Add a brewhouse equipment profile. Missing fields get defaults. ${profileFields}`,
    input: { data: profileData.describe('The profile; at least "name".') },
    run: ({ data }, ctx) => {
      const profile = createEquipment(ctx.db, parse(equipmentDataSchema, data));
      changed(ctx, 'equipment', profile.id);
      return profile;
    },
  }),
  tool({
    name: 'update_equipment_profile',
    level: 'write',
    title: 'Change an equipment profile',
    description: `Change values of an equipment profile; \`data\` holds only the fields to change. Recipes keep their own copy of the equipment values and are not changed. ${profileFields}`,
    input: { id: z.string(), data: profileData.describe('Only the fields to change.') },
    run: ({ id, data }, ctx) => {
      const existing = getEquipment(ctx.db, id);
      const profile = updateEquipment(ctx.db, id, parse(equipmentDataSchema, { ...existing.data, ...data }));
      changed(ctx, 'equipment', profile.id);
      return profile;
    },
  }),
  tool({
    name: 'set_default_equipment',
    level: 'write',
    title: 'Set the default equipment profile',
    description: 'Make this equipment profile the one new recipes start with.',
    input: { id: z.string() },
    run: ({ id }, ctx) => {
      getEquipment(ctx.db, id);
      updateSettings(ctx.db, { defaultEquipmentId: id });
      changed(ctx, 'equipment');
      changed(ctx, 'settings');
      return getEquipment(ctx.db, id);
    },
  }),
  tool({
    name: 'delete_equipment_profile',
    level: 'full',
    title: 'Delete an equipment profile',
    description: 'Delete an equipment profile. Recipes that used it keep their copy of its values. It goes to the trash (restore_from_trash) until its time there is up (list_trash shows it).',
    input: { id: z.string() },
    run: ({ id }, ctx) => {
      deleteEquipment(ctx.db, id);
      changed(ctx, 'equipment');
      return { deleted: id };
    },
  }),

  // ---- Vessels (fermenters, kegs …)

  tool({
    name: 'create_vessel',
    level: 'write',
    title: 'Add a fermenter or keg',
    description: 'Add a vessel a batch can be in: a fermenter, keg, bottles or other. capacityL in litres.',
    input: createVesselSchema.shape,
    run: (args, ctx) => {
      const vessel = createVessel(ctx.db, args);
      changed(ctx, 'equipment');
      return vessel;
    },
  }),
  tool({
    name: 'update_vessel',
    level: 'write',
    title: 'Change a fermenter or keg',
    description: 'Change the name, kind, capacity (L) or notes of a vessel; give only the fields to change. To move a batch to another vessel, use update_batch.',
    input: { id: z.string(), ...updateVesselSchema.shape },
    run: ({ id, ...patch }, ctx) => {
      const vessel = updateVessel(ctx.db, id, patch);
      changed(ctx, 'equipment');
      return vessel;
    },
  }),
  tool({
    name: 'delete_vessel',
    level: 'full',
    title: 'Delete a fermenter or keg',
    description: 'Delete a vessel. Batches that were in it keep their history; their vessel is cleared (and set again if it is restored). It goes to the trash (restore_from_trash) until its time there is up (list_trash shows it).',
    input: { id: z.string() },
    run: ({ id }, ctx) => {
      deleteVessel(ctx.db, id);
      changed(ctx, 'equipment');
      changed(ctx, 'batches');
      return { deleted: id };
    },
  }),

  // ---- Smart devices (added in the app; here only where they measure)

  tool({
    name: 'update_device',
    level: 'write',
    title: 'Move or rename a smart device',
    description:
      'Rename a smart device or change what it measures: vesselId puts it in a fermenter (its readings go to the batch in that fermenter), batchId links it straight to one batch (wins over the fermenter). null clears either. Give only the fields to change.',
    input: { id: z.string(), ...updateDeviceSchema.pick({ name: true, vesselId: true, batchId: true }).shape },
    run: ({ id, ...patch }, ctx) => {
      const device = updateDevice(ctx.db, id, patch);
      changed(ctx, 'devices', id);
      return deviceInfo(device);
    },
  }),
  tool({
    name: 'delete_device',
    level: 'full',
    title: 'Delete a smart device',
    description: 'Delete a smart device; its push URL stops working. Readings it already added to batches stay. It goes to the trash (restore_from_trash) until its time there is up (list_trash shows it).',
    input: { id: z.string() },
    run: ({ id }, ctx) => {
      deleteDevice(ctx.db, id);
      changed(ctx, 'devices');
      return { deleted: id };
    },
  }),
];
