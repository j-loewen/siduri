import { Divider, NativeSelect, NumberInput, SimpleGrid, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { BREW_METHODS, type EquipmentData } from '@brew/shared';
import { UnitInput } from '../units';

const num = (v: string | number, fallback: number) => (v === '' ? fallback : Number(v));

/**
 * The brew method and the mash, boil and fermenter values of an equipment profile. Used on the
 * Equipment page and for a recipe's own copy of its equipment.
 */
export function EquipmentFields({ value: d, onChange }: { value: EquipmentData; onChange: (patch: Partial<EquipmentData>) => void }) {
  const { t } = useTranslation();
  const set = onChange;
  return (
    <Stack>
      <NativeSelect
        label={t('equipment.method')}
        value={d.method}
        data={BREW_METHODS.map((m) => ({ value: m, label: t(`enums.brewMethod.${m}`) }))}
        onChange={(e) => set({ method: e.currentTarget.value as EquipmentData['method'] })}
      />
      <Divider label={t('equipment.sections.mash')} labelPosition="left" />
      <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm" style={{ alignItems: 'end' }}>
        <UnitInput measure="volume" label={t('equipment.fields.mashTunVolume')} value={d.mashTunVolumeL} nullable onChange={(v) => set({ mashTunVolumeL: v })} />
        <UnitInput
          measure="volume"
          label={t('equipment.fields.mashTunDeadspace')}
          description={t('equipment.fields.mashTunDeadspaceHint')}
          value={d.mashTunRecoverableL}
          min={0}
          onChange={(v) => set({ mashTunRecoverableL: v ?? 0 })}
        />
        <UnitInput
          measure="volume"
          label={t('equipment.fields.mashTunLoss')}
          description={t('equipment.fields.mashTunLossHint')}
          value={d.mashTunDeadspaceL}
          min={0}
          onChange={(v) => set({ mashTunDeadspaceL: v ?? 0 })}
        />
        <UnitInput
          measure="specificVolume"
          label={t('equipment.fields.mashThickness')}
          description={t('equipment.fields.mashThicknessHint')}
          value={d.mashThicknessLPerKg}
          min={1}
          onChange={(v) => v && set({ mashThicknessLPerKg: v })}
        />
        <UnitInput measure="specificVolume" label={t('equipment.fields.grainAbsorption')} value={d.grainAbsorptionLPerKg} min={0} onChange={(v) => set({ grainAbsorptionLPerKg: v ?? 0 })} />
        <UnitInput measure="temperature" label={t('equipment.fields.grainTemp')} value={d.grainTempC} onChange={(v) => v != null && set({ grainTempC: v })} />
      </SimpleGrid>
      <Divider label={t('equipment.sections.boil')} labelPosition="left" />
      <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm" style={{ alignItems: 'end' }}>
        <UnitInput measure="volume" label={t('equipment.fields.kettleVolume')} value={d.kettleVolumeL} nullable onChange={(v) => set({ kettleVolumeL: v })} />
        <UnitInput measure="rate" label={t('equipment.fields.boilOff')} value={d.boilOffLPerH} min={0} onChange={(v) => set({ boilOffLPerH: v ?? 0 })} />
        <UnitInput measure="volume" label={t('equipment.fields.kettleLoss')} value={d.kettleLossL} min={0} onChange={(v) => set({ kettleLossL: v ?? 0 })} />
        <NumberInput label={t('equipment.fields.shrinkage')} value={d.coolingShrinkagePct} suffix="%" min={0} max={10} decimalScale={1} onChange={(v) => set({ coolingShrinkagePct: num(v, 4) })} />
        <NumberInput
          label={t('equipment.fields.hopUtilization')}
          description={t('equipment.fields.hopUtilizationHint')}
          value={d.hopUtilizationPct}
          suffix="%"
          min={10}
          max={200}
          onChange={(v) => set({ hopUtilizationPct: num(v, 100) })}
        />
      </SimpleGrid>
      <Divider label={t('equipment.sections.fermenter')} labelPosition="left" />
      <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm" style={{ alignItems: 'end' }}>
        <UnitInput measure="volume" label={t('equipment.fields.fermenterVolume')} value={d.fermenterVolumeL} nullable onChange={(v) => set({ fermenterVolumeL: v })} />
        <UnitInput measure="volume" label={t('equipment.fields.topUp')} value={d.topUpWaterL} min={0} onChange={(v) => set({ topUpWaterL: v ?? 0 })} />
        <UnitInput measure="volume" label={t('equipment.fields.fermenterLoss')} value={d.fermenterLossL} min={0} onChange={(v) => set({ fermenterLossL: v ?? 0 })} />
      </SimpleGrid>
    </Stack>
  );
}
