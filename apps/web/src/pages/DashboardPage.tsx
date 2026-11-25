import { Link } from '@tanstack/react-router';
import { Anchor, Button, Card, Group, Paper, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconFlask2, IconNotebook, IconPackage, IconPlus, IconTool } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { BatchStatus, BatchSummaryDto } from '@brew/shared';
import { useMe } from '../auth';
import { useBatches, useEquipment, useLowStock, useRecipes, useSettings } from '../data';
import { RecipeThumb } from '../components/RecipeImage';
import { BreweryLogo } from '../components/Logo';
import { useNewRecipe } from './RecipesPage';
import { useAmountFormat } from '../components/amount';
import { fermentationDay, StatusBadge, upcomingEvents, useDateFormat, useEventLabel } from '../components/batch-ui';
import { useFormat } from '../units';

export function DashboardPage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const settings = useSettings();
  const recipes = useRecipes();
  const equipment = useEquipment();
  const newRecipe = useNewRecipe();
  const recent = recipes.data?.slice(0, 5) ?? [];
  const noEquipment = equipment.data && equipment.data.length === 0;

  return (
    <Stack gap="lg">
      <Stack gap={2}>
        <Group gap="sm" wrap="nowrap">
          {settings.data?.breweryLogo && <BreweryLogo id={settings.data.breweryLogo} size={48} />}
          <Title order={2}>{settings.data?.breweryName || t('dashboard.title')}</Title>
        </Group>
        <Text c="dimmed">{t('dashboard.greeting', { name: me?.displayName ?? '' })}</Text>
      </Stack>

      {noEquipment && (
        <Paper withBorder p="md" radius="md" bg="var(--mantine-primary-color-light)">
          <Group justify="space-between" gap="sm">
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon variant="light" size="lg" radius="xl">
                <IconTool size={20} />
              </ThemeIcon>
              <Stack gap={0}>
                <Text fw={600}>{t('dashboard.setupEquipment')}</Text>
                <Text size="sm" c="dimmed">
                  {t('dashboard.setupEquipmentText')}
                </Text>
              </Stack>
            </Group>
            <Button component={Link} to="/equipment" variant="filled">
              {t('dashboard.setupEquipmentButton')}
            </Button>
          </Group>
        </Paper>
      )}

      <CurrentBatches />

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <Card withBorder radius="md" padding="md">
          <Group justify="space-between" mb="sm">
            <Group gap="xs">
              <IconNotebook size={20} />
              <Title order={4}>{t('dashboard.recentRecipes')}</Title>
            </Group>
            <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={newRecipe.create} loading={newRecipe.pending}>
              {t('recipes.new')}
            </Button>
          </Group>
          {recent.length ? (
            <Stack gap={4}>
              {recent.map((r) => (
                <Anchor key={r.id} c="var(--mantine-color-text)" underline="never" renderRoot={(props) => <Link {...props} to="/recipes/$recipeId" params={{ recipeId: r.id }} />}>
                  <Group gap="sm" wrap="nowrap" py={6} className="clickable-row" px={6} style={{ borderRadius: 8 }}>
                    <RecipeThumb image={r.image} colorEbc={r.colorEbc} size={28} radius={6} />
                    <Text fw={500} truncate style={{ flex: 1 }}>
                      {r.name}
                    </Text>
                    <Text size="sm" c="dimmed" truncate visibleFrom="xs">
                      {r.styleName ?? ''}
                    </Text>
                  </Group>
                </Anchor>
              ))}
              <Anchor component={Link} to="/recipes" size="sm" mt={4}>
                {t('dashboard.allRecipes')}
              </Anchor>
            </Stack>
          ) : (
            <Text c="dimmed" size="sm">
              {t('recipes.empty')}
            </Text>
          )}
        </Card>

        <Inventory />
      </SimpleGrid>
    </Stack>
  );
}

/** The batches that matter now, in this order: brewing, fermenting, conditioning, planned. */
const SHOWN_STATUSES: BatchStatus[] = ['brewing', 'fermenting', 'conditioning', 'planned'];

/**
 * Planned and running batches, the dashboard's main part. Running ones show the fermentation day,
 * latest reading and what's next; planned ones their brew date (soonest first).
 */
function CurrentBatches() {
  const { t } = useTranslation();
  const batches = useBatches(SHOWN_STATUSES);
  const sorted = [...(batches.data ?? [])].sort((a, b) => {
    const byStatus = SHOWN_STATUSES.indexOf(a.status) - SHOWN_STATUSES.indexOf(b.status);
    if (byStatus || a.status !== 'planned') return byStatus;
    // Planned: soonest brew date first, those without a date last.
    return (a.brewDate ?? '9999').localeCompare(b.brewDate ?? '9999') || a.number - b.number;
  });

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Group gap="xs">
          <IconFlask2 size={22} />
          <Title order={3}>{t('dashboard.currentBatches')}</Title>
        </Group>
        <Anchor component={Link} to="/batches" size="sm">
          {t('dashboard.allBatches')}
        </Anchor>
      </Group>
      {sorted.length ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {sorted.map((b) => (
            <BatchCard key={b.id} batch={b} />
          ))}
        </SimpleGrid>
      ) : (
        <Paper withBorder radius="md" p="md">
          <Text c="dimmed" size="sm">
            {batches.isPending ? '…' : t('dashboard.noActive')}
          </Text>
        </Paper>
      )}
    </Stack>
  );
}

function BatchCard({ batch: b }: { batch: BatchSummaryDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const dates = useDateFormat();
  const label = useEventLabel();
  const day = fermentationDay(b.fermentationStart);
  const next = upcomingEvents(b.schedule, day, 2);
  const reading = b.latestReading;

  let details: string;
  if (b.status === 'planned') details = b.brewDate ? t('dashboard.brewOn', { date: dates.date(b.brewDate) }) : t('dashboard.noBrewDate');
  else if (b.status === 'brewing') details = t('dashboard.brewingNow');
  else
    details =
      [day != null ? t('batches.day', { day }) : null, reading?.gravity != null ? fmt(reading.gravity, 'gravity') : null, reading?.tempC != null ? fmt(reading.tempC, 'temperature', 1) : null]
        .filter(Boolean)
        .join(' · ') || t('batches.noReadings');

  return (
    <Paper
      withBorder
      p="md"
      radius="md"
      className="clickable-row link-reset"
      renderRoot={(props) => <Link {...props} to={b.status === 'brewing' ? '/batches/$batchId/brewday' : '/batches/$batchId'} params={{ batchId: b.id }} />}
    >
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Group gap={10} wrap="nowrap" style={{ minWidth: 0 }}>
          <RecipeThumb image={b.image} colorEbc={b.colorEbc} size={36} radius={8} />
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Text fw={600} truncate>
              #{b.number} {b.name}
            </Text>
            {b.styleName && (
              <Text size="xs" c="dimmed" truncate>
                {b.styleName}
              </Text>
            )}
          </Stack>
        </Group>
        <StatusBadge status={b.status} />
      </Group>
      <Text size="sm" c={b.status === 'brewing' ? undefined : 'dimmed'} fw={b.status === 'brewing' ? 600 : undefined} mt="xs">
        {details}
      </Text>
      {b.status !== 'planned' &&
        next.map((e, i) => (
          <Text key={i} size="sm" mt={2}>
            {e.day > (day ?? -1) ? t('dashboard.inDays', { count: e.day - (day ?? 0) }) : t('dashboard.now')} · {label(e)}
          </Text>
        ))}
    </Paper>
  );
}

/** Inventory: the items at or below their minimum, or that nothing is running low. */
function Inventory() {
  const { t } = useTranslation();
  const low = useLowStock();
  const fmtAmount = useAmountFormat();
  const items = low.data ?? [];
  return (
    <Card withBorder radius="md" padding="md">
      <Group justify="space-between" mb="sm">
        <Group gap="xs">
          <IconPackage size={20} />
          <Title order={4}>{items.length ? t('dashboard.lowStock') : t('nav.inventory')}</Title>
        </Group>
        <Anchor component={Link} to="/inventory" size="sm">
          {t('dashboard.toInventory')}
        </Anchor>
      </Group>
      {items.length ? (
        <Stack gap={4}>
          {items.slice(0, 8).map((i) => (
            <Group key={i.id} justify="space-between" wrap="nowrap">
              <Text size="sm" truncate>
                {i.name}
              </Text>
              <Text size="sm" fw={600} c="orange" className="tabular">
                {fmtAmount(i.amount, i.kind, i.amountKind)}
              </Text>
            </Group>
          ))}
        </Stack>
      ) : (
        <Text size="sm" c="dimmed">
          {low.isPending ? '…' : t('dashboard.stockOk')}
        </Text>
      )}
    </Card>
  );
}
