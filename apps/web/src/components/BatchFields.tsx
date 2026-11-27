import { useMemo } from 'react';
import { NativeSelect, NumberInput, SimpleGrid, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { calculateRecipe, measuredEfficiency } from '@brew/brewcalc';
import type { BatchMeasured, VesselKind } from '@brew/shared';
import { usePatchBatch, useVessels, type LoadedBatch } from '../data';
import { notifyError } from '../lib/notify';
import { useMeasuredSaver } from '../lib/useMeasuredSaver';
import { UnitInput, useFormat } from '../units';

const isGravity = (k: keyof BatchMeasured) => k.endsWith('Gravity') || k === 'og' || k === 'fg';

/**
 * Inputs for some measured values of a batch, saved as they are typed; the planned value is shown
 * under each. With `efficiency`, the brewhouse efficiency from OG and volume into the fermenter.
 */
export function MeasuredFields({ batch, fields, efficiency }: { batch: LoadedBatch; fields: (keyof BatchMeasured)[]; efficiency?: boolean }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const saver = useMeasuredSaver(batch.id);
  const calc = useMemo(() => calculateRecipe(batch.doc), [batch.doc]);
  const value = (k: keyof BatchMeasured) => (k in saver.local ? (saver.local[k] ?? null) : batch.measured[k]);

  const planned: Partial<Record<keyof BatchMeasured, string>> = {
    preBoilGravity: fmt(calc.preBoilGravity, 'gravity'),
    preBoilVolumeL: fmt(calc.volumes.preBoilL, 'volume', 1),
    postBoilVolumeL: fmt(calc.volumes.postBoilL, 'volume', 1),
    og: fmt(calc.og, 'gravity'),
    fermenterVolumeL: fmt(calc.volumes.fermenterL, 'volume', 1),
    fg: fmt(calc.fg, 'gravity'),
    packagedVolumeL: fmt(calc.volumes.packagedL, 'volume', 1),
  };
  const og = value('og');
  const volumeL = value('fermenterVolumeL');
  const eff = efficiency && og != null && volumeL != null ? measuredEfficiency(batch.doc, calc, 'fermenter', { gravity: og, volumeL }) : null;

  return (
    <>
      <SimpleGrid cols={{ base: 1, xs: fields.length > 1 ? 2 : 1 }} spacing="sm">
        {fields.map((k) =>
          k === 'mashPh' ? (
            <NumberInput
              key={k}
              label={t('batches.measured.mashPh')}
              value={value(k) ?? ''}
              decimalScale={2}
              min={3}
              max={8}
              step={0.05}
              onChange={(v) => saver.set(k, v === '' ? null : Number(v))}
            />
          ) : (
            <UnitInput
              key={k}
              measure={isGravity(k) ? 'gravity' : 'volume'}
              label={t(`batches.measured.${k}`)}
              description={planned[k] ? t('batches.plannedValue', { value: planned[k] }) : undefined}
              value={value(k)}
              nullable
              onChange={(v) => saver.set(k, v)}
            />
          ),
        )}
      </SimpleGrid>
      {eff != null && (
        <Text size="sm">{t('brewday.efficiency', { actual: fmt.num(eff, 1), planned: fmt.num(batch.doc.efficiencyPct, 0) })}</Text>
      )}
    </>
  );
}

/**
 * Picks the vessel the batch is in, from vessels of some kinds (fermenters while fermenting,
 * kegs and bottles when conditioning). A batch is in one vessel: picking one moves it there.
 */
export function VesselSelect({ batch, kinds, label, description }: { batch: LoadedBatch; kinds: VesselKind[]; label: string; description?: string }) {
  const { t } = useTranslation();
  const vessels = useVessels();
  const patch = usePatchBatch();
  const options = (vessels.data ?? []).filter((v) => kinds.includes(v.kind));
  const current = options.some((v) => v.id === batch.vesselId) ? batch.vesselId! : '';
  return (
    <NativeSelect
      label={label}
      description={description}
      maw={320}
      value={current}
      data={[
        { value: '', label: '–' },
        ...options.map((v) => ({
          value: v.id,
          label: v.currentBatch && v.currentBatch.id !== batch.id ? t('vessels.optionBusy', { name: v.name, number: v.currentBatch.number }) : v.name,
        })),
      ]}
      onChange={(e) => {
        const vesselId = e.currentTarget.value || null;
        // "–" only takes the batch out of a vessel of these kinds, not out of another one.
        if (vesselId === null && !current) return;
        patch.mutate({ id: batch.id, patch: { vesselId } }, { onError: notifyError });
      }}
    />
  );
}
