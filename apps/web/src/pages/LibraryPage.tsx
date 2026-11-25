import { useState, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Badge, Button, Center, Drawer, Group, Loader, ScrollArea, Stack, Table, Tabs, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { IconCopy, IconFileImport, IconPlus, IconRestore, IconSearch, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import {
  cultureAttenuation,
  LIBRARY_KINDS,
  LIBRARY_SCHEMAS,
  type LibraryDataMap,
  type LibraryItemDto,
  type LibraryKind,
} from '@brew/shared';
import { useDeleteLibraryItem, useLibrary, useResetLibraryItem, useSaveLibraryItem } from '../data';
import { ImportModal } from '../components/ImportModal';
import { LibraryForm } from '../components/LibraryForm';
import { ColorSwatch, PageHeader } from '../components/recipe-ui';
import { libraryRoute } from '../router';
import { notifyError, notifyOk } from '../lib/notify';
import { useFormat, useFormatRange } from '../units';

export type LibraryEditing = { kind: LibraryKind; id?: string; seedKey?: string | null; data: LibraryDataMap[LibraryKind] };
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
      <TextInput placeholder={t('library.search')} leftSection={<IconSearch size={16} />} value={q} onChange={(e) => setQ(e.currentTarget.value)} mb="sm" maw={420} aria-label={t('library.search')} />
      {items.isPending ? (
        <Center py="xl">
          <Loader />
        </Center>
      ) : (
        <ItemTable kind={kind} items={items.data ?? []} onOpen={(item) => setEditing({ kind: item.kind, id: item.id, seedKey: item.seedKey, data: item.data })} />
      )}
      <EditDrawer editing={editing} onClose={() => setEditing(null)} />
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
      { label: t('fields.producer'), cell: (i) => [d(i, 'culture').producer, d(i, 'culture').productId].filter(Boolean).join(' ') },
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
      { label: t('stats.ibu'), cell: (i) => `${d(i, 'style').ibu[0] ?? '–'}–${d(i, 'style').ibu[1] ?? '–'}`, wide: true },
      {
        label: t('stats.color'),
        cell: (i) => (
          <Group gap={4} wrap="nowrap">
            <ColorSwatch ebc={d(i, 'style').colorEbc[0] ?? 0} size={12} />
            <ColorSwatch ebc={d(i, 'style').colorEbc[1] ?? 0} size={12} />
          </Group>
        ),
      },
    ],
  };

  /** Producer and origin, under the name (yeast shows its lab in a column). */
  const madeBy = (item: LibraryItemDto) => {
    if (item.kind !== 'fermentable' && item.kind !== 'hop' && item.kind !== 'misc') return '';
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

export function EditDrawer({ editing, onClose }: { editing: Editing | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Editing | null>(null);
  const save = useSaveLibraryItem();
  const reset = useResetLibraryItem();
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
      children: <Text size="sm">{t('library.delete.text', { name: current.data.name })}</Text>,
      labels: { confirm: t('common.delete'), cancel: t('common.cancel') },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(current.id!, { onSuccess: onClose, onError: notifyError }),
    });

  return (
    <Drawer opened={Boolean(editing)} onClose={onClose} position="right" size="lg" title={current ? (current.id ? current.data.name : t('library.new', { kind: t(`library.kind.${current.kind}`) })) : ''}>
      {current && (
        <Stack>
          <LibraryForm kind={current.kind} value={current.data} onChange={(data) => setDraft({ ...current, data })} />
          <Group justify="space-between" mt="md">
            <Group gap="xs">
              {current.id && (
                <Button variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={confirmDelete}>
                  {t('common.delete')}
                </Button>
              )}
              {current.seedKey && (
                <Button
                  variant="subtle"
                  leftSection={<IconRestore size={16} />}
                  loading={reset.isPending}
                  onClick={() => reset.mutate(current.id!, { onSuccess: (item) => setDraft({ ...current, data: item.data }), onError: notifyError })}
                >
                  {t('library.reset')}
                </Button>
              )}
            </Group>
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
          </Group>
        </Stack>
      )}
    </Drawer>
  );
}
