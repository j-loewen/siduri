import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Center,
  Group,
  List,
  Loader,
  Menu,
  NativeSelect,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Timeline,
  Title,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconAlertTriangle, IconDots, IconFlame, IconNotebook, IconPlayerPlay, IconTrash } from '@tabler/icons-react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { abvSimple, apparentAttenuation, calculateRecipe, fermentationSchedule, measuredEfficiency } from '@brew/brewcalc';
import { BATCH_STATUSES, diffRecipes, type BatchMeasured, type BatchStatus, type RecipeChange } from '@brew/shared';
import { ApiError } from '../api';
import {
  useAddNote,
  useBatch,
  useBatchLog,
  useDeleteBatch,
  useDeleteNote,
  usePatchBatch,
  useReadings,
  useVessels,
  useRecipe,
  useSaveBatchDoc,
  useSaveBatchToRecipe,
  type LoadedBatch,
} from '../data';
import { batchRoute } from '../router';
import { dayDate, fermentationDay, StatusBadge, useDateFormat, useEventLabel } from '../components/batch-ui';
import { BatchInventoryPanel } from '../components/BatchInventoryPanel';
import { CarbonationSection } from '../components/CarbonationSection';
import { FermentationPanel } from '../components/FermentationPanel';
import { ConflictAlert, RecipeBody, SaveIndicator, useDocAutosave } from '../components/RecipeDocEditor';
import { FermenterProvider } from '../components/FitWarnings';
import { RecipeMetaRow } from '../components/RecipeMeta';
import { Section } from '../components/recipe-ui';
import { RecipeThumb } from '../components/RecipeImage';
import { notifyError, notifyOk } from '../lib/notify';
import { useMeasuredSaver } from '../lib/useMeasuredSaver';
import { UnitInput, useFormat } from '../units';

type Tab = 'overview' | 'recipe' | 'fermentation' | 'log';

export function BatchPage() {
  const { batchId } = batchRoute.useParams();
  const { t } = useTranslation();
  const batch = useBatch(batchId);
  const [tab, setTab] = useState<Tab>('overview');
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
  return (
    <Stack gap="md">
      <BatchHeader batch={b} />
      <Tabs value={tab} onChange={(v) => setTab((v as Tab) ?? 'overview')} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="overview">{t('batches.tabs.overview')}</Tabs.Tab>
          <Tabs.Tab value="recipe">{t('batches.tabs.recipe')}</Tabs.Tab>
          <Tabs.Tab value="fermentation">{t('batches.tabs.fermentation')}</Tabs.Tab>
          <Tabs.Tab value="log">{t('batches.tabs.log')}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="overview" pt="md">
          <Overview batch={b} />
        </Tabs.Panel>
        <Tabs.Panel value="recipe" pt="md">
          <BatchRecipe key={b.id} batch={b} />
        </Tabs.Panel>
        <Tabs.Panel value="fermentation" pt="md">
          <FermentationPanel batch={b} />
        </Tabs.Panel>
        <Tabs.Panel value="log" pt="md">
          <LogPanel batchId={b.id} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

function BatchHeader({ batch }: { batch: LoadedBatch }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const patch = usePatchBatch();
  const remove = useDeleteBatch();
  const vessels = useVessels();
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
                    children: <Text size="sm">{t('batches.delete.text', { name: batch.name })}</Text>,
                    labels: { confirm: t('common.delete'), cancel: t('common.cancel') },
                    confirmProps: { color: 'red' },
                    onConfirm: () => remove.mutate(batch.id, { onSuccess: () => void navigate({ to: '/batches' }), onError: notifyError }),
                  })
                }
              >
                {t('common.delete')}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
      <Group gap="sm" align="flex-end">
        <NativeSelect
          label={t('batches.fields.status')}
          value={batch.status}
          data={BATCH_STATUSES.map((s) => ({ value: s, label: t(`batches.status.${s}`) }))}
          onChange={(e) => set({ status: e.currentTarget.value as BatchStatus })}
          w={170}
        />
        <TextInput
          label={t('batches.fields.brewDate')}
          type="date"
          value={batch.brewDate ?? ''}
          onChange={(e) => set({ brewDate: e.currentTarget.value || null })}
          w={170}
        />
        <NativeSelect
          label={t('batches.fields.vessel')}
          value={batch.vesselId ?? ''}
          data={[
            { value: '', label: '–' },
            ...(vessels.data ?? []).map((v) => ({
              value: v.id,
              label: v.currentBatch && v.currentBatch.id !== batch.id ? t('vessels.optionBusy', { name: v.name, number: v.currentBatch.number }) : v.name,
            })),
          ]}
          onChange={(e) => set({ vesselId: e.currentTarget.value || null })}
          w={190}
        />
      </Group>
    </Stack>
  );
}

// ---- Overview ------------------------------------------------------------------------------------------

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
        <MeasuredSection batch={batch} />
        <CarbonationSection batch={batch} />
      </Stack>
      <Stack gap="md">
        <ScheduleSection batch={batch} />
        <Section title={t('batchInventory.title')}>
          <BatchInventoryPanel batchId={batch.id} />
        </Section>
        <DiffSection batch={batch} />
        <NotesSection batch={batch} />
      </Stack>
    </SimpleGrid>
  );
}

/** Measured values, editable any time (brew day fills most of them). */
export function MeasuredSection({ batch }: { batch: LoadedBatch }) {
  const { t } = useTranslation();
  const saver = useMeasuredSaver(batch.id);
  const field = (key: keyof BatchMeasured, measure: 'gravity' | 'volume') => (
    <UnitInput
      key={key}
      measure={measure}
      label={t(`batches.measured.${key}`)}
      value={key in saver.local ? (saver.local[key] ?? null) : batch.measured[key]}
      nullable
      onChange={(v) => saver.set(key, v)}
    />
  );
  return (
    <Section title={t('batches.measuredTitle')}>
      <SimpleGrid cols={2} spacing="sm">
        {field('preBoilGravity', 'gravity')}
        {field('preBoilVolumeL', 'volume')}
        {field('og', 'gravity')}
        {field('fermenterVolumeL', 'volume')}
        {field('fg', 'gravity')}
        {field('packagedVolumeL', 'volume')}
      </SimpleGrid>
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

function changeText(c: RecipeChange, t: TFunction, fmt: ReturnType<typeof useFormat>) {
  const value = (v: RecipeChange['from']) => {
    if (v == null) return '–';
    if (typeof v === 'string') return v;
    switch (c.field) {
      case 'amountKg':
        return c.section === 'hops' ? fmt(v, 'massSmall', 1) : fmt(v, 'massLarge');
      case 'batchSizeL':
        return fmt(v, 'volume', 1);
      case 'tempC':
        return fmt(v, 'temperature', 1);
      case 'colorEbc':
        return fmt(v, 'color', 1);
      default:
        return fmt.num(v, 3);
    }
  };
  if (c.kind === 'added') return t('batches.diff.added', { name: c.name });
  if (c.kind === 'removed') return t('batches.diff.removed', { name: c.name });
  if (c.section === 'notes') return t('batches.diff.notes');
  const field = t(`batches.diff.fields.${c.field}`, { defaultValue: c.field });
  return c.section === 'setup' ? t('batches.diff.setting', { field, from: value(c.from), to: value(c.to) }) : t('batches.diff.changed', { name: c.name, field, from: value(c.from), to: value(c.to) });
}

/** How the batch differs from its recipe, and saving the changes back. */
function DiffSection({ batch }: { batch: LoadedBatch }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const recipe = useRecipe(batch.recipeId ?? '');
  const save = useSaveBatchToRecipe(batch.id);
  const changes = useMemo(() => (recipe.data ? diffRecipes(recipe.data.doc, batch.doc) : []), [recipe.data, batch.doc]);

  const run = (mode: 'update' | 'new') =>
    save.mutate({ mode }, { onSuccess: () => notifyOk(mode === 'update' ? t('batches.diff.savedToRecipe') : t('batches.diff.savedAsNew')), onError: notifyError });

  return (
    <Section title={t('batches.diff.title')}>
      {!batch.recipeId ? (
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            {t('batches.diff.noRecipe')}
          </Text>
          <Button variant="light" onClick={() => run('new')} loading={save.isPending}>
            {t('batches.diff.saveAsNew')}
          </Button>
        </Stack>
      ) : recipe.isPending ? (
        <Loader size="sm" />
      ) : changes.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t('batches.diff.none')}
        </Text>
      ) : (
        <Stack gap="sm">
          <List size="sm" spacing={4}>
            {changes.slice(0, 30).map((c, i) => (
              <List.Item key={i}>{changeText(c, t, fmt)}</List.Item>
            ))}
          </List>
          <Group gap="xs">
            <Button
              variant="light"
              loading={save.isPending}
              onClick={() =>
                modals.openConfirmModal({
                  title: t('batches.diff.saveToRecipe'),
                  children: <Text size="sm">{t('batches.diff.confirmUpdate', { name: recipe.data?.doc.name })}</Text>,
                  labels: { confirm: t('common.save'), cancel: t('common.cancel') },
                  onConfirm: () => run('update'),
                })
              }
            >
              {t('batches.diff.saveToRecipe')}
            </Button>
            <Button variant="default" loading={save.isPending} onClick={() => run('new')}>
              {t('batches.diff.saveAsNew')}
            </Button>
          </Group>
        </Stack>
      )}
    </Section>
  );
}

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

// ---- Recipe tab --------------------------------------------------------------------------------------------

function BatchRecipe({ batch }: { batch: LoadedBatch }) {
  const { t } = useTranslation();
  const save = useSaveBatchDoc();
  const { doc, update, state } = useDocAutosave(batch, (d, version) => save.mutateAsync({ id: batch.id, doc: d, version }));
  const calc = useMemo(() => calculateRecipe(doc), [doc]);
  // The batch's own fermenter: its size is checked instead of the equipment's.
  const vessels = useVessels();
  const vessel = vessels.data?.find((v) => v.id === batch.vesselId);
  const fermenter = useMemo(() => (vessel ? { name: vessel.name, capacityL: vessel.capacityL } : null), [vessel]);
  return (
    <FermenterProvider value={fermenter}>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={6} style={{ minWidth: 0 }}>
            <RecipeMetaRow doc={doc} calc={calc} update={update} />
            <Text size="sm" c="dimmed">
              {t('batches.recipeHint')}
            </Text>
          </Stack>
          <SaveIndicator state={state} />
        </Group>
        <ConflictAlert state={state} />
        <RecipeBody doc={doc} calc={calc} update={update} />
      </Stack>
    </FermenterProvider>
  );
}

// ---- Log -------------------------------------------------------------------------------------------------------

function LogPanel({ batchId }: { batchId: string }) {
  const { t } = useTranslation();
  const dates = useDateFormat();
  const log = useBatchLog(batchId);
  const add = useAddNote(batchId);
  const remove = useDeleteNote(batchId);
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

