import { SimpleGrid, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { LoadedBatch } from '../data';
import { MeasuredFields, VesselSelect } from './BatchFields';
import { CarbonationSection } from './CarbonationSection';
import { Section } from './recipe-ui';

/** After fermentation: what it is packaged in, how much, and how it gets carbonated. */
export function BatchConditioning({ batch }: { batch: LoadedBatch }) {
  const { t } = useTranslation();
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
      <Section title={t('batches.conditioning.title')}>
        <Stack gap="sm">
          <VesselSelect batch={batch} kinds={['keg', 'bottles', 'other']} label={t('batches.conditioning.vessel')} description={t('batches.conditioning.vesselHint')} />
          <MeasuredFields batch={batch} fields={['packagedVolumeL']} />
        </Stack>
      </Section>
      <CarbonationSection batch={batch} />
    </SimpleGrid>
  );
}
