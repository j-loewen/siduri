import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ActionIcon, Alert, Badge, Button, Center, Group, Loader, Menu, NativeSelect, Paper, ScrollArea, SimpleGrid, Stack, Table, Tabs, Text, Textarea, TextInput, Timeline } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconAlertTriangle, IconDots, IconFlame, IconNotebook, IconPlayerPlay, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { abvSimple, apparentAttenuation, calculateRecipe, fermentationSchedule, measuredEfficiency } from '@brew/brewcalc';
import { BATCH_STATUSES, type BatchMeasured, type BatchStatus } from '@brew/shared';
import { ApiError } from '../api';
import { useNotifyDeleted, useTrashNote } from '../components/trash-ui';
import { useAddNote, useBatch, useBatchInventory, useBatchLog, useDeleteBatch, useDeleteNote, usePatchBatch, useReadings, useVessels, type LoadedBatch } from '../data';
import { batchRoute } from '../router';
import { BATCH_TABS, dayDate, fermentationDay, phaseTab, StatusBadge, useDateFormat, useEventLabel, type BatchTab } from '../components/batch-ui';
import { BatchBrewing } from '../components/BatchBrewing';
import { BatchConditioning } from '../components/BatchConditioning';
import { BatchPlanning } from '../components/BatchPlanning';
import { BatchRecipe } from '../components/BatchRecipe';
import { FermentationPanel } from '../components/FermentationPanel';
import { Section } from '../components/recipe-ui';
import { RecipeThumb } from '../components/RecipeImage';
import { notifyError } from '../lib/notify';
import { useFormat } from '../units';

export function BatchPage() {
  const { batchId } = batchRoute.useParams();
  const search = batchRoute.useSearch();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const batch = useBatch(batchId);
  const tabsViewport = useRef<HTMLDivElement>(null);
  const tab = search.tab ?? (batch.data ? phaseTab(batch.data.status) : 'overview');
  // On a phone the tab list scrolls sideways: keep the open tab in view.
  useEffect(() => {
    tabsViewport.current?.querySelector<HTMLElement>('[role="tab"][data-active]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [tab, batch.isPending]);
  if (batch.isPending) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }
  if (batch.isError || !batch.data) {
    return (
      <Alert color="red" icon={<IconAlertTriangle size={18} />}>
        {batch.error instanceof ApiError && batch.error.status === 404 ? t('batches.notFound') : t('errors.unknown')}
      </Alert>
    );
  }
  const b = batch.data;
  // Opens on the tab for what is going on with the batch (above); a tab picked by hand is kept in the URL.
  const showTab = (next: BatchTab) => void navigate({ to: '/batches/$batchId', params: { batchId }, search: { tab: next }, replace: true });

  return (
    <Stack gap="md">
      <BatchHeader batch={b} onStatusChange={(status) => showTab(phaseTab(status))} />
      <Tabs value={tab} onChange={(v) => v && showTab(v as BatchTab)} keepMounted={false}>
        {/* The tabs don't fit a phone: the list scrolls sideways. */}
        <ScrollArea type="never" offsetScrollbars={false} viewportRef={tabsViewport}>
          <Tabs.List style={{ flexWrap: 'nowrap' }}>
            {BATCH_TABS.map((k) => (
              <Tabs.Tab key={k} value={k} style={{ whiteSpace: 'nowrap' }}>
                {t(`batches.tabs.${k}`)}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </ScrollArea>
        <Tabs.Panel value="overview" pt="md">
          <Overview batch={b} />
        </Tabs.Panel>
        <Tabs.Panel value="recipe" pt="md">
          <BatchRecipe key={b.id} batch={b} />
        </Tabs.Panel>
        <Tabs.Panel value="planning" pt="md">
          <BatchPlanning batch={b} />
        </Tabs.Panel>
        <Tabs.Panel value="brewing" pt="md">
          <BatchBrewing batch={b} />
        </Tabs.Panel>
        <Tabs.Panel value="fermentation" pt="md">
          <FermentationPanel batch={b} />
        </Tabs.Panel>
        <Tabs.Panel value="conditioning" pt="md">
          <BatchConditioning batch={b} />
        </Tabs.Panel>
        <Tabs.Panel value="log" pt="md">
          <LogPanel batch={b} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

function BatchHeader({ batch, onStatusChange }: { batch: LoadedBatch; onStatusChange: (status: BatchStatus) => void }) {
  const { t } = useTranslation();
  const trashNote = useTrashNote();
  const notifyDeleted = useNotifyDeleted();
  const navigate = useNavigate();
  const patch = usePatchBatch();
  const remove = useDeleteBatch();
  const [name, setName] = useState(batch.name);
  const started = Boolean(batch.brewday.startedAt);
  const finished = Boolean(batch.brewday.finishedAt);

  const set = (p: Parameters<typeof patch.mutate>[0]['patch']) => patch.mutate({ id: batch.id, patch: p }, { onError: notifyError });

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="xs">
        <Group gap={8} wrap="nowrap" style={{ flex: '1 1 260px', minWidth: 0 }}>
          <RecipeThumb image={batch.doc.image} colorEbc={calculateRecipe(batch.doc).colorEbc} size={44} />
          <Text fw={700} fz="clamp(1.3rem, 4vw, 1.8rem)" c="dimmed" className="tabular">
            #{batch.number}
          </Text>
          <TextInput
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            onBlur={() => name.trim() && name !== batch.name && set({ name: name.trim() })}
            variant="unstyled"
            size="xl"
            styles={{ input: { fontWeight: 700, fontSize: 'clamp(1.3rem, 4vw, 1.8rem)' } }}
            aria-label={t('batches.fields.name')}
            style={{ flex: 1, minWidth: 0 }}
          />
        </Group>
        <Group gap={6} wrap="nowrap" ml="auto" mt={8}>
          <Button
            leftSection={finished ? <IconFlame size={18} /> : <IconPlayerPlay size={18} />}
            variant={finished ? 'default' : 'filled'}
            renderRoot={(props) => <Link {...props} to="/batches/$batchId/brewday" params={{ batchId: batch.id }} />}
          >
            {finished ? t('brewday.open') : started ? t('brewday.continue') : t('brewday.start')}
          </Button>
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon variant="default" size="lg" aria-label={t('common.more')}>
                <IconDots size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {batch.recipeId && (
                <Menu.Item leftSection={<IconNotebook size={16} />} renderRoot={(props) => <Link {...props} to="/recipes/$recipeId" params={{ recipeId: batch.recipeId! }} />}>
                  {t('batches.openRecipe')}
                </Menu.Item>
              )}
              <Menu.Item
                color="red"
                leftSection={<IconTrash size={16} />}
                onClick={() =>
                  modals.openConfirmModal({
                    title: t('batches.delete.title'),
                    children: <Text size="sm">{t('batches.delete.text', { name: batch.name })}{' '}{trashNote}</Text>,
                    labels: { confirm: t('common.delete'), cancel: t('common.cancel') },
                    confirmProps: { color: 'red' },
                    onConfirm: () =>
                      remove.mutate(batch.id, {
                        onSuccess: () => {
                          notifyDeleted('batch', batch.id, batch.name, () => void navigate({ to: '/batches/$batchId', params: { batchId: batch.id } }));
                          void navigate({ to: '/batches' });
                        },
                        onError: notifyError,
                      }),
                  })
                }
              >
                {t('common.delete')}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
      <NativeSelect
        label={t('batches.fields.status')}
        value={batch.status}
        data={BATCH_STATUSES.map((s) => ({ value: s, label: t(`batches.status.${s}`) }))}
        onChange={(e) => {
          const status = e.currentTarget.value as BatchStatus;
          set({ status });
          onStatusChange(status);
        }}
        w={170}
      />
    </Stack>
  );
}

// ---- Overview (read only: values are entered in the tab of their phase) ----------------------------------

const MEASURED_ORDER: (keyof BatchMeasured)[] = ['mashPh', 'preBoilGravity', 'preBoilVolumeL', 'postBoilVolumeL', 'og', 'fermenterVolumeL', 'fg', 'packagedVolumeL'];

function Overview({ batch }: { batch: LoadedBatch }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const readings = useReadings(batch.id);
  const calc = useMemo(() => calculateRecipe(batch.doc), [batch.doc]);
  const m = batch.measured;
  const latestGravity = [...(readings.data ?? [])].reverse().find((r) => r.gravity != null && r.note !== 'OG')?.gravity ?? null;
  const og = m.og;
  const fg = m.fg ?? latestGravity;
  const eff = og != null && m.fermenterVolumeL != null ? measuredEfficiency(batch.doc, calc, 'fermenter', { gravity: og, volumeL: m.fermenterVolumeL }) : null;

  const rows: [string, ReactNode, ReactNode][] = [
    [t('stats.og'), fmt(calc.og, 'gravity'), og != null ? fmt(og, 'gravity') : '–'],
    [m.fg != null ? t('stats.fg') : t('batches.currentGravity'), fmt(calc.fg, 'gravity'), fg != null ? fmt(fg, 'gravity') : '–'],
    [t('stats.abv'), `${fmt.num(calc.abvPct, 1)}%`, og != null && fg != null ? `${fmt.num(abvSimple(og, fg), 1)}%` : '–'],
    [t('batches.attenuation'), `${fmt.num(calc.attenuationPct, 0)}%`, og != null && fg != null ? `${fmt.num(apparentAttenuation(og, fg), 0)}%` : '–'],
    [t('batches.intoFermenter'), fmt(batch.doc.batchSizeL, 'volume', 1), m.fermenterVolumeL != null ? fmt(m.fermenterVolumeL, 'volume', 1) : '–'],
    [t('batches.efficiency'), `${fmt.num(batch.doc.efficiencyPct, 0)}%`, eff != null ? `${fmt.num(eff, 1)}%` : '–'],
  ];

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
      <Stack gap="md">
        <Facts batch={batch} />
        <Section title={t('batches.plannedVsActual')}>
          <Table verticalSpacing={6}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th />
                <Table.Th ta="right">{t('batches.planned')}</Table.Th>
                <Table.Th ta="right">{t('batches.actual')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map(([label, plan, actual]) => (
                <Table.Tr key={label}>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {label}
                    </Text>
                  </Table.Td>
                  <Table.Td ta="right" className="tabular">
                    {plan}
                  </Table.Td>
                  <Table.Td ta="right" className="tabular" fw={600}>
                    {actual}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Section>
        <MeasuredSummary batch={batch} />
      </Stack>
      <Stack gap="md">
        <ScheduleSection batch={batch} />
        {batch.notes.trim() && (
          <Section title={t('batches.notes')}>
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {batch.notes}
            </Text>
          </Section>
        )}
      </Stack>
    </SimpleGrid>
  );
}

/** Label and value rows. */
function InfoTable({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <Table verticalSpacing={6}>
      <Table.Tbody>
        {rows.map(([label, value]) => (
          <Table.Tr key={label}>
            <Table.Td>
              <Text size="sm" c="dimmed">
                {label}
              </Text>
            </Table.Td>
            <Table.Td ta="right" className="tabular">
              {value}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

/** Status, dates, where it is and whether its ingredients were taken from stock. */
function Facts({ batch }: { batch: LoadedBatch }) {
  const { t } = useTranslation();
  const dates = useDateFormat();
  const vessels = useVessels();
  const stock = useBatchInventory(batch.id);
  const vessel = vessels.data?.find((v) => v.id === batch.vesselId);
  const day = fermentationDay(batch.fermentationStart);
  const deductedAt = stock.data?.deductedAt;
  return (
    <Section title={t('batches.overview.facts')}>
      <InfoTable
        rows={[
          [t('batches.fields.status'), <StatusBadge key="s" status={batch.status} />],
          [t('batches.fields.brewDate'), batch.brewDate ? dates.date(batch.brewDate) : '–'],
          [t('batches.fields.vessel'), vessel ? `${vessel.name} · ${t(`vessels.kinds.${vessel.kind}`)}` : '–'],
          [t('batches.dayLabel'), day != null ? String(day) : '–'],
          [t('batches.overview.stock'), stock.data ? (deductedAt ? t('batchInventory.deducted', { date: dates.dateTime(deductedAt) }) : t('batches.overview.stockNotTaken')) : '–'],
        ]}
      />
    </Section>
  );
}

function MeasuredSummary({ batch }: { batch: LoadedBatch }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const show = (k: keyof BatchMeasured) => {
    const v = batch.measured[k];
    if (v == null) return '–';
    if (k === 'mashPh') return fmt.num(v, 2);
    return k.endsWith('VolumeL') ? fmt(v, 'volume', 1) : fmt(v, 'gravity');
  };
  return (
    <Section title={t('batches.measuredTitle')}>
      <InfoTable rows={MEASURED_ORDER.map((k) => [t(`batches.measured.${k}`), show(k)])} />
    </Section>
  );
}

function ScheduleSection({ batch }: { batch: LoadedBatch }) {
  const { t } = useTranslation();
  const label = useEventLabel();
  const dates = useDateFormat();
  const schedule = fermentationSchedule(batch.doc);
  const day = fermentationDay(batch.fermentationStart);
  if (!schedule.length) return null;
  const active = day == null ? -1 : schedule.filter((e) => e.day <= day).length - 1;
  return (
    <Section title={t('batches.schedule')} description={day != null ? t('batches.dayOf', { day }) : t('batches.scheduleNotStarted')}>
      <Timeline active={active} bulletSize={14} lineWidth={2}>
        {schedule.map((e, i) => (
          <Timeline.Item key={i} title={<Text size="sm" fw={500}>{label(e)}</Text>}>
            <Text size="xs" c="dimmed">
              {t('batches.day', { day: e.day })}
              {batch.fermentationStart ? ` · ${dates.weekday(dayDate(batch.fermentationStart, e.day))}` : ''}
            </Text>
          </Timeline.Item>
        ))}
      </Timeline>
    </Section>
  );
}

// ---- Log -------------------------------------------------------------------------------------------------------

function NotesSection({ batch }: { batch: LoadedBatch }) {
  const { t } = useTranslation();
  const patch = usePatchBatch();
  const [notes, setNotes] = useState(batch.notes);
  return (
    <Section title={t('batches.notes')}>
      <Textarea
        autosize
        minRows={3}
        value={notes}
        onChange={(e) => setNotes(e.currentTarget.value)}
        onBlur={() => notes !== batch.notes && patch.mutate({ id: batch.id, patch: { notes } }, { onError: notifyError })}
        placeholder={t('batches.notesPlaceholder')}
        aria-label={t('batches.notes')}
      />
    </Section>
  );
}

function LogPanel({ batch }: { batch: LoadedBatch }) {
  const { t } = useTranslation();
  const dates = useDateFormat();
  const log = useBatchLog(batch.id);
  const add = useAddNote(batch.id);
  const remove = useDeleteNote(batch.id);
  const [text, setText] = useState('');

  const eventText = (code: string) => {
    if (code.startsWith('status:')) return t('batches.log.status', { status: t(`batches.status.${code.slice(7)}`) });
    // Changes made through MCP: "mcp:<what>:<connection name>".
    const mcp = /^mcp:(\w+):(.*)$/s.exec(code);
    if (mcp) return t(`batches.log.mcp.${mcp[1]}`, { name: mcp[2], defaultValue: code });
    return t(`batches.log.${code}`, { defaultValue: code });
  };

  return (
    <Stack gap="md" maw={720}>
      <NotesSection batch={batch} />
      <Paper withBorder p="sm" radius="md">
        <Stack gap="xs">
          <Textarea autosize minRows={2} placeholder={t('batches.log.placeholder')} value={text} onChange={(e) => setText(e.currentTarget.value)} aria-label={t('batches.log.placeholder')} />
          <Group justify="flex-end">
            <Button
              size="xs"
              disabled={!text.trim()}
              loading={add.isPending}
              onClick={() => add.mutate(text.trim(), { onSuccess: () => setText(''), onError: notifyError })}
            >
              {t('batches.log.add')}
            </Button>
          </Group>
        </Stack>
      </Paper>
      {log.isPending ? (
        <Loader size="sm" />
      ) : (
        <Timeline bulletSize={12} lineWidth={2}>
          {(log.data ?? []).map((e) => (
            <Timeline.Item
              key={e.id}
              color={e.kind === 'event' ? 'gray' : undefined}
              title={
                <Group justify="space-between" wrap="nowrap" gap="xs">
                  <Text size="xs" c="dimmed">
                    {dates.dateTime(e.at)}
                  </Text>
                  {e.kind === 'note' && (
                    <ActionIcon size="sm" variant="subtle" color="gray" aria-label={t('common.delete')} onClick={() => remove.mutate(e.id, { onError: notifyError })}>
                      <IconTrash size={14} />
                    </ActionIcon>
                  )}
                </Group>
              }
            >
              {e.kind === 'event' ? (
                <Badge variant="light" color="gray" size="sm">
                  {eventText(e.text)}
                </Badge>
              ) : (
                <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                  {e.text}
                </Text>
              )}
            </Timeline.Item>
          ))}
        </Timeline>
      )}
    </Stack>
  );
}
