import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Badge, Button, Card, Center, Group, Loader, SegmentedControl, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { ACTIVE_STATUSES, type BatchStatus, type BatchSummaryDto } from '@brew/shared';
import { apparentAttenuation } from '@brew/brewcalc';
import { useBatches } from '../data';
import { fermentationDay, StatusBadge, useDateFormat } from '../components/batch-ui';
import { NewBatchModal } from '../components/NewBatchModal';
import { PageHeader } from '../components/recipe-ui';
import { RecipeThumb } from '../components/RecipeImage';
import { useFormat } from '../units';

type Filter = 'active' | 'planned' | 'done' | 'all';
const FILTERS: Record<Filter, BatchStatus[] | undefined> = {
  active: ACTIVE_STATUSES,
  planned: ['planned'],
  done: ['packaged', 'completed'],
  all: undefined,
};

export function BatchesPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('active');
  const batches = useBatches(FILTERS[filter]);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title={t('batches.title')}
        subtitle={t('batches.subtitle')}
        actions={
          <Button leftSection={<IconPlus size={18} />} onClick={() => setCreating(true)}>
            {t('batches.new')}
          </Button>
        }
      />
      <SegmentedControl
        value={filter}
        onChange={(v) => setFilter(v as Filter)}
        data={(['active', 'planned', 'done', 'all'] as const).map((f) => ({ value: f, label: t(`batches.filters.${f}`) }))}
        mb="md"
      />
      {batches.isPending ? (
        <Center py="xl">
          <Loader />
        </Center>
      ) : batches.data?.length ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
          {batches.data.map((b) => (
            <BatchCard key={b.id} batch={b} />
          ))}
        </SimpleGrid>
      ) : (
        <Stack align="center" py="xl" gap="xs">
          <Text c="dimmed" ta="center">
            {filter === 'active' ? t('batches.emptyActive') : t('batches.empty')}
          </Text>
          <Button variant="light" onClick={() => setCreating(true)}>
            {t('batches.new')}
          </Button>
        </Stack>
      )}
      <NewBatchModal opened={creating} onClose={() => setCreating(false)} />
    </>
  );
}

export function BatchCard({ batch }: { batch: BatchSummaryDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const dates = useDateFormat();
  const day = fermentationDay(batch.fermentationStart);
  const og = batch.measured.og ?? batch.plannedOg;
  const gravity = batch.measured.fg ?? batch.latestReading?.gravity ?? null;
  return (
    <Card withBorder radius="md" className="clickable-row link-reset" renderRoot={(props) => <Link {...props} to="/batches/$batchId" params={{ batchId: batch.id }} />}>
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Group gap={6} wrap="nowrap">
            <Text c="dimmed" fw={600} className="tabular">
              #{batch.number}
            </Text>
            <Title order={5} lineClamp={1}>
              {batch.name}
            </Title>
          </Group>
          <Text size="sm" c="dimmed" truncate>
            {[batch.styleName, batch.brewDate ? dates.date(batch.brewDate) : null].filter(Boolean).join(' · ') || t('batches.noDate')}
          </Text>
        </Stack>
        <RecipeThumb image={batch.image} colorEbc={batch.colorEbc} size={48} />
      </Group>
      <Group gap={6} mt="sm">
        <StatusBadge status={batch.status} />
        {day != null && batch.status !== 'completed' && (
          <Badge variant="outline" color="gray">
            {t('batches.day', { day })}
          </Badge>
        )}
        <Badge variant="light" color="gray" className="tabular">
          {t('stats.og')} {fmt.value(og, 'gravity')}
        </Badge>
        {gravity != null && (
          <Badge variant="light" color="gray" className="tabular">
            {fmt.value(gravity, 'gravity')} · {fmt.num(apparentAttenuation(og, gravity), 0)}%
          </Badge>
        )}
        {batch.latestReading?.tempC != null && (
          <Badge variant="light" color="gray" className="tabular">
            {fmt(batch.latestReading.tempC, 'temperature', 1)}
          </Badge>
        )}
      </Group>
    </Card>
  );
}
