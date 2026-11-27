import { useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Alert, Anchor, Badge, Button, Center, Drawer, Group, Loader, ScrollArea, SegmentedControl, Stack, Table, Tabs, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { IconCopy, IconFileImport, IconLock, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import {
  cultureAttenuation,
  LIBRARY_DATA_URL,
  LIBRARY_KINDS,
  LIBRARY_SCHEMAS,
  type LibraryDataMap,
  type LibraryItemDto,
  type LibraryKind,
} from '@brew/shared';
import { useDeleteLibraryItem, useLibrary, useSaveLibraryItem, useSubstitutes } from '../data';
import { useNotifyDeleted, useTrashNote } from '../components/trash-ui';
import { ImportModal } from '../components/ImportModal';
import { LibraryForm } from '../components/LibraryForm';
import { ColorSwatch, PageHeader } from '../components/recipe-ui';
import { libraryRoute } from '../router';
import { notifyError, notifyOk } from '../lib/notify';
import { useFormat, useFormatRange } from '../units';

export type LibraryEditing = { kind: LibraryKind; id?: string; seedKey?: string | null; readOnly?: boolean; data: LibraryDataMap[LibraryKind] };
/** Opens a library item in the edit drawer. */
export const editingOf = (item: LibraryItemDto): LibraryEditing => ({ kind: item.kind, id: item.id, seedKey: item.seedKey, readOnly: item.readOnly, data: item.data });

type Origin = 'all' | 'builtIn' | 'own';
type Editing = LibraryEditing;

export function LibraryPage() {
  const { t } = useTranslation();
  const { kind } = libraryRoute.useSearch();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [debounced] = useDebouncedValue(q.trim(), 200);
  const items = useLibrary(kind, debounced);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [importing, setImporting] = useState(false);
  const [origin, setOrigin] = useState<Origin>('all');
  const shown = (items.data ?? []).filter((i) => origin === 'all' || (origin === 'builtIn') === i.readOnly);

  const startNew = () => setEditing({ kind, data: LIBRARY_SCHEMAS[kind].parse({ name: t('library.newName') }) as LibraryDataMap[LibraryKind] });

  return (
    <>
      <PageHeader
        title={t('library.title')}
        subtitle={t('library.subtitle')}
        actions={
          <>
            <Button variant="default" leftSection={<IconFileImport size={18} />} onClick={() => setImporting(true)}>
              {t('import.button')}
            </Button>
            <Button leftSection={<IconPlus size={18} />} onClick={startNew}>
              {t('library.new', { kind: t(`library.kind.${kind}`) })}
            </Button>
          </>
        }
      />
      <Tabs value={kind} onChange={(k) => k && void navigate({ to: '/library', search: { kind: k as LibraryKind } })} mb="md">
        <ScrollArea type="never">
          <Tabs.List style={{ flexWrap: 'nowrap' }}>
            {LIBRARY_KINDS.map((k) => (
              <Tabs.Tab key={k} value={k}>
                {t(`library.kinds.${k}`)}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </ScrollArea>
      </Tabs>
      <Group mb="sm" gap="sm" align="center">
        <TextInput placeholder={t('library.search')} leftSection={<IconSearch size={16} />} value={q} onChange={(e) => setQ(e.currentTarget.value)} maw={420} style={{ flex: 1 }} aria-label={t('library.search')} />
        <SegmentedControl
          value={origin}
          onChange={(v) => setOrigin(v as Origin)}
          data={(['all', 'builtIn', 'own'] as const).map((o) => ({ value: o, label: t(`library.origin.${o}`) }))}
          aria-label={t('library.origin.label')}
        />
      </Group>
      {items.isPending ? (
        <Center py="xl">
          <Loader />
        </Center>
      ) : (
        <ItemTable kind={kind} items={shown} onOpen={(item) => setEditing(editingOf(item))} />
      )}
      <EditDrawer editing={editing} onClose={() => setEditing(null)} onOpen={setEditing} />
      <ImportModal opened={importing} onClose={() => setImporting(false)} />
    </>
  );
}

function ItemTable({ kind, items, onOpen }: { kind: LibraryKind; items: LibraryItemDto[]; onOpen: (item: LibraryItemDto) => void }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const range = useFormatRange();
  if (!items.length) {
    return (
      <Text c="dimmed" py="lg">
        {t('picker.nothing')}
      </Text>
    );
  }

  type Col = { label: string; cell: (item: LibraryItemDto) => ReactNode; wide?: boolean };
  const d = <K extends LibraryKind>(item: LibraryItemDto, _k: K) => item.data as LibraryDataMap[K];
  const empty = (r: [number | null, number | null]) => r[0] == null && r[1] == null;
  const cols: Record<LibraryKind, Col[]> = {
    fermentable: [
      { label: t('fields.type'), cell: (i) => t(`enums.fermentableType.${d(i, 'fermentable').type}`) },
      {
        label: t('fields.colorEbc'),
        cell: (i) => (
          <Group gap={6} wrap="nowrap">
            <ColorSwatch ebc={d(i, 'fermentable').colorEbc} />
            {fmt(d(i, 'fermentable').colorEbc, 'color', 1)}
          </Group>
        ),
      },
      { label: t('library.ppg'), cell: (i) => fmt.num((d(i, 'fermentable').potentialSg - 1) * 1000, 1), wide: true },
    ],
    hop: [
      { label: t('fields.alphaPct'), cell: (i) => `${fmt.num(d(i, 'hop').alphaPct, 1)}%` },
      { label: t('fields.purpose'), cell: (i) => (d(i, 'hop').purpose ? t(`enums.hopPurpose.${d(i, 'hop').purpose}`) : ''), wide: true },
    ],
    culture: [
      { label: t('fields.form'), cell: (i) => t(`enums.cultureForm.${d(i, 'culture').form}`) },
      { label: t('fields.attenuation'), cell: (i) => (cultureAttenuation(d(i, 'culture')) != null ? `${fmt.num(cultureAttenuation(d(i, 'culture'))!, 0)}%` : '–') },
      { label: t('fields.temperature'), cell: (i) => range([d(i, 'culture').tempMinC, d(i, 'culture').tempMaxC], 'temperature', 0), wide: true },
    ],
    misc: [{ label: t('fields.type'), cell: (i) => t(`enums.miscType.${d(i, 'misc').type}`) }],
    water: [
      { label: t('fields.role'), cell: (i) => t(`enums.waterRole.${d(i, 'water').role}`), wide: true },
      ...(['calcium', 'magnesium', 'sodium', 'sulfate', 'chloride', 'bicarbonate'] as const).map((ion) => ({
        label: t(`library.ions.${ion}`),
        cell: (i: LibraryItemDto) => fmt.num(d(i, 'water')[ion], 0),
      })),
    ],
    style: [
      { label: t('fields.code'), cell: (i) => `${d(i, 'style').categoryNumber}${d(i, 'style').styleLetter}` },
      { label: t('stats.og'), cell: (i) => range(d(i, 'style').og, 'gravity'), wide: true },
      // Some styles have no values (BJCP's specialty categories: they follow the base style).
      { label: t('stats.ibu'), cell: (i) => (empty(d(i, 'style').ibu) ? '–' : `${d(i, 'style').ibu[0] ?? '–'}–${d(i, 'style').ibu[1] ?? '–'}`), wide: true },
      {
        label: t('stats.color'),
        cell: (i) =>
          empty(d(i, 'style').colorEbc) ? (
            '–'
          ) : (
            <Group gap={4} wrap="nowrap">
              <ColorSwatch ebc={d(i, 'style').colorEbc[0] ?? 0} size={12} />
              <ColorSwatch ebc={d(i, 'style').colorEbc[1] ?? 0} size={12} />
            </Group>
          ),
      },
    ],
  };

  /** Producer and origin (styles: the guide), under the name. */
  const madeBy = (item: LibraryItemDto) => {
    // Styles: the guide (BJCP 2015 and 2021 share names and codes).
    if (item.kind === 'style') return (item.data as LibraryDataMap['style']).guide;
    if (item.kind === 'water') return '';
    const data = item.data as { producer?: string; origin?: string };
    return [data.producer, data.origin].filter(Boolean).join(' · ');
  };

  return (
    <Table.ScrollContainer minWidth={320}>
      <Table highlightOnHover verticalSpacing={8}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t('fields.name')}</Table.Th>
            {cols[kind].map((c) => (
              <Table.Th key={c.label} visibleFrom={c.wide ? 'sm' : undefined}>
                {c.label}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {items.map((item) => (
            <Table.Tr key={item.id} className="clickable-row" onClick={() => onOpen(item)}>
              <Table.Td>
                <Group gap={6} wrap="nowrap">
                  <Text size="sm" fw={500}>
                    {item.name}
                  </Text>
                  {item.source !== 'seed' && (
                    <Badge size="xs" variant="light" color="gray">
                      {t(`library.source.${item.source}`)}
                    </Badge>
                  )}
                </Group>
                {madeBy(item) && (
                  <Text size="xs" c="dimmed">
                    {madeBy(item)}
                  </Text>
                )}
              </Table.Td>
              {cols[kind].map((c) => (
                <Table.Td key={c.label} visibleFrom={c.wide ? 'sm' : undefined} className="tabular">
                  {c.cell(item)}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

/** Other producers' versions of a built-in malt, or a hop's substitutes; opens one on click. */
function Substitutes({ id, onOpen }: { id: string; onOpen?: (e: Editing) => void }) {
  const { t } = useTranslation();
  const subs = useSubstitutes(id);
  if (!subs.data?.length) return null;
  return (
    <Stack gap={4}>
      <Text size="sm" fw={500}>
        {t('library.substitutes')}
      </Text>
      <Group gap={6}>
        {subs.data.map((s) => {
          const producer = 'producer' in s.data ? s.data.producer : '';
          const label = producer ? `${s.name} (${producer})` : s.name;
          return onOpen ? (
            <Badge key={s.id} variant="light" style={{ cursor: 'pointer', textTransform: 'none' }} onClick={() => onOpen(editingOf(s))}>
              {label}
            </Badge>
          ) : (
            <Badge key={s.id} variant="light" style={{ textTransform: 'none' }}>
              {label}
            </Badge>
          );
        })}
      </Group>
    </Stack>
  );
}

export function EditDrawer({ editing, onClose, onOpen }: { editing: Editing | null; onClose: () => void; onOpen?: (e: Editing) => void }) {
  const { t } = useTranslation();
  const trashNote = useTrashNote();
  const notifyDeleted = useNotifyDeleted();
  const [draft, setDraft] = useState<Editing | null>(null);
  const save = useSaveLibraryItem();
  const remove = useDeleteLibraryItem();
  // Start a fresh draft whenever a different item is opened.
  const [openedFor, setOpenedFor] = useState<Editing | null>(null);
  if (editing !== openedFor) {
    setOpenedFor(editing);
    setDraft(editing);
  }
  const current = draft ?? editing;

  /** Saves the item, or with `asNew` a new item with these values (e.g. the same malt of another maltster). */
  const submit = (asNew = false) => {
    if (!current) return;
    save.mutate(
      { id: asNew ? undefined : current.id, kind: current.kind, data: current.data },
      {
        onSuccess: () => {
          notifyOk(t(asNew ? 'library.savedAsNew' : 'library.saved', { name: current.data.name }));
          onClose();
        },
        onError: notifyError,
      },
    );
  };

  const confirmDelete = () =>
    current?.id &&
    modals.openConfirmModal({
      title: t('library.delete.title'),
      children: <Text size="sm">{t('library.delete.text', { name: current.data.name })}{' '}{trashNote}</Text>,
      labels: { confirm: t('common.delete'), cancel: t('common.cancel') },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        remove.mutate(current.id!, {
          onSuccess: () => {
            notifyDeleted('library', current.id!, current.data.name);
            onClose();
          },
          onError: notifyError,
        }),
    });

  return (
    <Drawer opened={Boolean(editing)} onClose={onClose} position="right" size="lg" title={current ? (current.id ? current.data.name : t('library.new', { kind: t(`library.kind.${current.kind}`) })) : ''}>
      {current && (
        <Stack>
          {current.readOnly && (
            <Alert variant="light" color="gray" icon={<IconLock size={18} />}>
              <Text size="sm">
                {t('library.builtIn.text')}{' '}
                <Anchor href={LIBRARY_DATA_URL} target="_blank" rel="noopener noreferrer" size="sm">
                  open-brewing-data
                </Anchor>
              </Text>
            </Alert>
          )}
          <LibraryForm kind={current.kind} value={current.data} onChange={(data) => setDraft({ ...current, data })} readOnly={current.readOnly} />
          {current.id && current.seedKey && <Substitutes id={current.id} onOpen={onOpen} />}
          <Group justify="space-between" mt="md">
            <Group gap="xs">
              {current.id && !current.readOnly && (
                <Button variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={confirmDelete}>
                  {t('common.delete')}
                </Button>
              )}
            </Group>
            {current.readOnly ? (
              <Group gap="xs">
                <Button variant="default" onClick={onClose}>
                  {t('common.close')}
                </Button>
                {/* A new, unsaved item with these values: the brewer changes it and saves it as their own. */}
                <Button leftSection={<IconCopy size={16} />} onClick={() => setDraft({ kind: current.kind, readOnly: false, data: { ...current.data } })}>
                  {t('library.builtIn.copy')}
                </Button>
              </Group>
            ) : (
              <Group gap="xs">
                {current.id && (
                  <Button variant="default" leftSection={<IconCopy size={16} />} onClick={() => submit(true)} loading={save.isPending} disabled={!current.data.name.trim()}>
                    {t('library.saveAsNew')}
                  </Button>
                )}
                <Button variant="default" onClick={onClose}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={() => submit()} loading={save.isPending} disabled={!current.data.name.trim()}>
                  {t('common.save')}
                </Button>
              </Group>
            )}
          </Group>
        </Stack>
      )}
    </Drawer>
  );
}
