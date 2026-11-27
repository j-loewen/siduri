import { Button, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconFlame, IconPlayerPlay } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { LoadedBatch } from '../data';
import { useDateFormat } from './batch-ui';
import { BatchInventoryPanel } from './BatchInventoryPanel';
import { MeasuredFields } from './BatchFields';
import { Section } from './recipe-ui';

/** Brew day: the full-screen guide, what was measured, and taking the ingredients from stock. */
export function BatchBrewing({ batch }: { batch: LoadedBatch }) {
  const { t } = useTranslation();
  const dates = useDateFormat();
  const { startedAt, finishedAt } = batch.brewday;
  const state = finishedAt
    ? t('batches.brewing.finished', { date: dates.dateTime(finishedAt) })
    : startedAt
      ? t('batches.brewing.inProgress', { date: dates.dateTime(startedAt) })
      : t('batches.brewing.notStarted');

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
      <Stack gap="md">
        <Section title={t('batches.brewing.title')}>
          <Group justify="space-between" gap="sm">
            <Text size="sm" c="dimmed">
              {state}
            </Text>
            <Button
              leftSection={finishedAt ? <IconFlame size={18} /> : <IconPlayerPlay size={18} />}
              variant={finishedAt ? 'default' : 'filled'}
              renderRoot={(props) => <Link {...props} to="/batches/$batchId/brewday" params={{ batchId: batch.id }} />}
            >
              {finishedAt ? t('brewday.open') : startedAt ? t('brewday.continue') : t('brewday.start')}
            </Button>
          </Group>
        </Section>
        <Section title={t('batches.brewing.measured')} description={t('batches.brewing.measuredHint')}>
          <Stack gap="sm">
            <MeasuredFields batch={batch} fields={['mashPh', 'preBoilGravity', 'preBoilVolumeL', 'postBoilVolumeL', 'og', 'fermenterVolumeL']} efficiency />
          </Stack>
        </Section>
      </Stack>
      <Section title={t('batchInventory.title')}>
        <BatchInventoryPanel batchId={batch.id} compact />
      </Section>
    </SimpleGrid>
  );
}
