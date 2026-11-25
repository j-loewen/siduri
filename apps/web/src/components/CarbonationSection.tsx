import { useMemo } from 'react';
import { Paper, SegmentedControl, SimpleGrid, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { calculateRecipe, carbonationPlan, defaultCarbonationTemp, recipeCarbonation } from '@brew/brewcalc';
import { CARBONATION_METHODS, type BatchCarbonation, type CarbonationMethod } from '@brew/shared';
import type { LoadedBatch } from '../data';
import { useBatchFieldSaver } from '../lib/useMeasuredSaver';
import { UnitInput, useFormat } from '../units';
import { Section } from './recipe-ui';

const usesSugar = (m: CarbonationMethod) => m !== 'keg_force';

/**
 * How to carbonate the batch: priming sugar for bottles or a keg, or the CO2 pressure for force
 * carbonating a keg. Worked out for the packaged volume (measured, else planned).
 */
export function CarbonationSection({ batch }: { batch: LoadedBatch }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const saver = useBatchFieldSaver(batch.id, 'carbonation');
  const settings: BatchCarbonation = { ...batch.carbonation, ...saver.local };
  const planned = useMemo(() => calculateRecipe(batch.doc).volumes.packagedL, [batch.doc]);
  const measuredL = batch.measured.packagedVolumeL;
  const volumeL = measuredL ?? planned;
  const plan = carbonationPlan(settings, batch.doc, volumeL);
  const sugar = usesSugar(settings.method);

  const setMethod = (method: CarbonationMethod) =>
    // The temperature means something else for sugar (warmest beer) and force (keg): start over.
    saver.set(usesSugar(method) === sugar ? { method } : { method, tempC: null });

  return (
    <Section
      title={t('batches.carbonation.title')}
      description={sugar ? t(measuredL != null ? 'batches.carbonation.forMeasured' : 'batches.carbonation.forPlanned', { volume: fmt(volumeL, 'volume', 1) }) : undefined}
    >
      <Stack gap="sm">
        <SegmentedControl
          fullWidth
          value={settings.method}
          onChange={(v) => setMethod(v as CarbonationMethod)}
          data={CARBONATION_METHODS.map((m) => ({ value: m, label: t(`enums.carbonationMethod.${m}`) }))}
        />
        <SimpleGrid cols={2} spacing="sm">
          <UnitInput
            measure="carbonation"
            label={t('batches.carbonation.target')}
            value={settings.vols}
            nullable
            placeholder={fmt.value(recipeCarbonation(batch.doc), 'carbonation')}
            onChange={(vols) => saver.set({ vols })}
          />
          <UnitInput
            measure="temperature"
            label={t(sugar ? 'batches.carbonation.beerTemp' : 'batches.carbonation.kegTemp')}
            value={settings.tempC}
            nullable
            placeholder={fmt.value(defaultCarbonationTemp(settings.method, batch.doc.fermentation), 'temperature')}
            onChange={(tempC) => saver.set({ tempC })}
          />
        </SimpleGrid>
        <Paper bg="var(--mantine-color-default-hover)" p="sm" radius="md">
          {plan.method === 'keg_force' ? (
            <Stack gap={2} align="center" ta="center">
              <Text size="lg">
                <Text span fw={700} size="xl" className="tabular">
                  {fmt(plan.pressureBar, 'pressure')}
                </Text>{' '}
                {t('batches.carbonation.atTemp', { temp: fmt(plan.tempC, 'temperature') })}
              </Text>
              <Text size="sm">{t('batches.carbonation.forDays', { from: plan.days[0], to: plan.days[1], vols: fmt(plan.targetVols, 'carbonation') })}</Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t('batches.carbonation.forceHint')}
              </Text>
            </Stack>
          ) : plan.sugarKg.sucrose <= 0 ? (
            <Text size="sm" ta="center">
              {t('batches.carbonation.noSugar', { residual: fmt(plan.residualVols, 'carbonation'), temp: fmt(plan.tempC, 'temperature') })}
            </Text>
          ) : (
            <Stack gap={2} align="center" ta="center">
              <Text size="lg">
                <Text span fw={700} size="xl" className="tabular">
                  {fmt(plan.sugarKg.sucrose, 'massSmall')}
                </Text>{' '}
                {t('batches.carbonation.tableSugar')}
              </Text>
              <Text size="sm">
                {t('batches.carbonation.alternatives', { corn: fmt(plan.sugarKg.dextrose, 'massSmall'), dme: fmt(plan.sugarKg.dme, 'massSmall') })}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {t(plan.method === 'keg_sugar' ? 'batches.carbonation.kegSugarHint' : 'batches.carbonation.residual', {
                  residual: fmt(plan.residualVols, 'carbonation'),
                  temp: fmt(plan.tempC, 'temperature'),
                  vols: fmt(plan.targetVols, 'carbonation'),
                })}
              </Text>
            </Stack>
          )}
        </Paper>
      </Stack>
    </Section>
  );
}
