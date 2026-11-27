import { useEffect, useMemo, useState } from 'react';
import { ActionIcon, Badge, Button, Center, Divider, Drawer, Group, Loader, Modal, NativeSelect, NumberInput, SegmentedControl, SimpleGrid, Stack, Table, Text, Textarea, TextInput, Timeline, Tooltip } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { IconAlertTriangle, IconBooks, IconMinus, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { INVENTORY_KINDS, type AmountKind, type InventoryItemDto, type InventoryKind, type LibraryItemDto } from '@brew/shared';
import {
  useAdjustInventoryItem,
  useCreateInventoryItem,
  useDeleteInventoryItem,
  useInventory,
  useInventoryHistory,
  useUpdateInventoryItem,
} from '../data';
import { AmountField, PriceField, useAmountFormat } from '../components/amount';
import { useNotifyDeleted, useTrashNote } from '../components/trash-ui';
import { useDateFormat } from '../components/batch-ui';
import { IngredientPicker } from '../components/IngredientPicker';
import { PageHeader } from '../components/recipe-ui';
import { ProducerInput } from '../components/SuggestInput';
import { notifyError, notifyOk } from '../lib/notify';

type Filter = InventoryKind | 'all';
const today = () => new Date().toISOString().slice(0, 10);
/** Best-before dates within this many days count as "soon". */
const SOON_DAYS = 60;

function expiry(bestBefore: string | null): 'expired' | 'soon' | null {
  if (!bestBefore) return null;
  if (bestBefore < today()) return 'expired';
  const soon = new Date(Date.now() + SOON_DAYS * 86400_000).toISOString().slice(0, 10);
  return bestBefore <= soon ? 'soon' : null;
}

const isLow = (i: InventoryItemDto) => i.minAmount != null && i.amount <= i.minAmount;

export function InventoryPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [debounced] = useDebouncedValue(q.trim().toLowerCase(), 150);
  const items = useInventory(filter === 'all' ? undefined : filter);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const fmtAmount = useAmountFormat();
  const dates = useDateFormat();

  const shown = useMemo(
    () => (items.data ?? []).filter((i) => !debounced || i.name.toLowerCase().includes(debounced) || i.producer.toLowerCase().includes(debounced) || i.lot.toLowerCase().includes(debounced) || i.location.toLowerCase().includes(debounced)),
    [items.data, debounced],
  );
  const low = (items.data ?? []).filter(isLow).length;
  const expired = (items.data ?? []).filter((i) => expiry(i.bestBefore) === 'expired' && i.amount > 0).length;

  return (
    <>
      <PageHeader
        title={t('inventory.title')}
        subtitle={t('inventory.subtitle')}
        actions={
          <Button leftSection={<IconPlus size={18} />} onClick={() => setAdding(true)}>
            {t('inventory.add')}
          </Button>
        }
      />
      <Group justify="space-between" mb="sm" gap="sm">
        <SegmentedControl
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          data={[{ value: 'all', label: t('inventory.all') }, ...INVENTORY_KINDS.map((k) => ({ value: k, label: t(`library.kinds.${k}`) }))]}
        />
        <Group gap="xs">
          {low > 0 && <Badge color="orange" variant="light" leftSection={<IconAlertTriangle size={12} />}>{t('inventory.lowCount', { count: low })}</Badge>}
          {expired > 0 && <Badge color="red" variant="light">{t('inventory.expiredCount', { count: expired })}</Badge>}
        </Group>
      </Group>
      <TextInput placeholder={t('inventory.search')} leftSection={<IconSearch size={16} />} value={q} onChange={(e) => setQ(e.currentTarget.value)} mb="sm" maw={420} aria-label={t('inventory.search')} />

      {items.isPending ? (
        <Center py="xl">
          <Loader />
        </Center>
      ) : shown.length === 0 ? (
        <Stack align="center" py="xl" gap="xs">
          <Text c="dimmed">{items.data?.length ? t('picker.nothing') : t('inventory.empty')}</Text>
          {!items.data?.length && (
            <Button variant="light" onClick={() => setAdding(true)}>
              {t('inventory.add')}
            </Button>
          )}
        </Stack>
      ) : (
        <Table.ScrollContainer minWidth={360}>
          <Table highlightOnHover verticalSpacing={8}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('fields.name')}</Table.Th>
                <Table.Th ta="right">{t('inventory.amount')}</Table.Th>
                <Table.Th visibleFrom="sm">{t('inventory.bestBefore')}</Table.Th>
                <Table.Th visibleFrom="md">{t('inventory.location')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {shown.map((i) => {
                const exp = expiry(i.bestBefore);
                return (
                  <Table.Tr key={i.id} className="clickable-row" onClick={() => setOpen(i.id)}>
                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {i.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {[t(`library.kind.${i.kind}`), i.producer, i.lot && t('inventory.lotShort', { lot: i.lot })].filter(Boolean).join(' · ')}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right" className="tabular">
                      <Group gap={6} justify="flex-end" wrap="nowrap">
                        {isLow(i) && (
                          <Tooltip label={t('inventory.lowHint', { min: fmtAmount(i.minAmount!, i.kind, i.amountKind) })}>
                            <IconAlertTriangle size={16} color="var(--mantine-color-orange-6)" />
                          </Tooltip>
                        )}
                        <Text size="sm" fw={600} c={i.amount <= 0 ? 'dimmed' : undefined}>
                          {fmtAmount(i.amount, i.kind, i.amountKind)}
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td visibleFrom="sm">
                      {i.bestBefore && (
                        <Text size="sm" c={exp === 'expired' ? 'red' : exp === 'soon' ? 'orange' : 'dimmed'}>
                          {dates.date(i.bestBefore)}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td visibleFrom="md">
                      <Text size="sm" c="dimmed">
                        {i.location}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <AddItemModal opened={adding} onClose={() => setAdding(false)} defaultKind={filter === 'all' ? 'fermentable' : filter} />
      <ItemDrawer item={(items.data ?? []).find((i) => i.id === open) ?? null} onClose={() => setOpen(null)} />
    </>
  );
}

const defaultAmountKind = (kind: InventoryKind): AmountKind => (kind === 'culture' ? 'count' : 'mass');

function AddItemModal({ opened, onClose, defaultKind }: { opened: boolean; onClose: () => void; defaultKind: InventoryKind }) {
  const { t } = useTranslation();
  const create = useCreateInventoryItem();
  const [kind, setKind] = useState<InventoryKind>(defaultKind);
  const [libraryRef, setLibraryRef] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [producer, setProducer] = useState('');
  const [amountKind, setAmountKind] = useState<AmountKind>(defaultAmountKind(defaultKind));
  const [amount, setAmount] = useState<number | null>(null);
  const [minAmount, setMinAmount] = useState<number | null>(null);
  const [lot, setLot] = useState('');
  const [bestBefore, setBestBefore] = useState('');
  const [location, setLocation] = useState('');
  const [unitCost, setUnitCost] = useState<number | null>(null);
  /** Unit the amount is typed in: the price is asked per that unit. */
  const [amountUnit, setAmountUnit] = useState<string | undefined>(undefined);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setKind(defaultKind);
    setLibraryRef(null);
    setName('');
    setProducer('');
    setAmountKind(defaultAmountKind(defaultKind));
    setAmount(null);
    setMinAmount(null);
    setLot('');
    setBestBefore('');
    setLocation('');
    setUnitCost(null);
  }, [opened, defaultKind]);

  const pick = (item: LibraryItemDto) => {
    setLibraryRef(item.id);
    setName(item.name);
    setProducer('producer' in item.data ? item.data.producer : '');
    if (item.kind === 'misc') setAmountKind((item.data as LibraryItemDto<'misc'>['data']).amountKind);
  };

  const submit = () =>
    create.mutate(
      {
        kind,
        libraryRef,
        name: name.trim(),
        producer,
        amountKind,
        amount: amount ?? 0,
        minAmount,
        lot,
        bestBefore: bestBefore || null,
        location,
        unitCost,
      },
      {
        onSuccess: () => {
          notifyOk(t('inventory.added', { name: name.trim() }));
          onClose();
        },
        onError: notifyError,
      },
    );

  return (
    <Modal opened={opened} onClose={onClose} title={t('inventory.add')} size="lg">
      <Stack>
        <SegmentedControl
          value={kind}
          onChange={(v) => {
            setKind(v as InventoryKind);
            setAmountKind(defaultAmountKind(v as InventoryKind));
            setLibraryRef(null);
          }}
          data={INVENTORY_KINDS.map((k) => ({ value: k, label: t(`library.kinds.${k}`) }))}
        />
        <Group align="flex-end" gap="xs">
          <TextInput
            label={t('fields.name')}
            value={name}
            onChange={(e) => {
              setName(e.currentTarget.value);
              setLibraryRef(null);
            }}
            style={{ flex: 1 }}
            required
            data-autofocus
          />
          <Button variant="light" leftSection={<IconBooks size={16} />} onClick={() => setPicking(true)}>
            {t('inventory.fromLibrary')}
          </Button>
        </Group>
        {libraryRef && (
          <Text size="xs" c="dimmed">
            {t('inventory.linked')}
          </Text>
        )}
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
          <ProducerInput
            kind={kind}
            value={producer}
            onChange={(v) => {
              setProducer(v);
              // Another producer is another ingredient than the library item picked.
              if (v.trim().toLowerCase() !== producer.trim().toLowerCase()) setLibraryRef(null);
            }}
            style={{ gridColumn: '1 / -1' }}
          />
          {(kind === 'misc' || kind === 'culture') && (
            <NativeSelect
              label={t('recipe.amountKind')}
              value={amountKind}
              data={(['mass', 'volume', 'count'] as const).map((k) => ({ value: k, label: t(`enums.amountKind.${k}`) }))}
              onChange={(e) => setAmountKind(e.currentTarget.value as AmountKind)}
            />
          )}
          <AmountField kind={kind} amountKind={amountKind} label={t('inventory.amount')} value={amount} onChange={setAmount} onUnitChange={setAmountUnit} nullable />
          <AmountField kind={kind} amountKind={amountKind} label={t('inventory.minAmount')} value={minAmount} onChange={setMinAmount} unitId={amountUnit} nullable />
          <TextInput label={t('inventory.lot')} value={lot} onChange={(e) => setLot(e.currentTarget.value)} />
          <TextInput label={t('inventory.bestBefore')} type="date" value={bestBefore} onChange={(e) => setBestBefore(e.currentTarget.value)} />
          <TextInput label={t('inventory.location')} value={location} onChange={(e) => setLocation(e.currentTarget.value)} />
          <PriceField kind={kind} amountKind={amountKind} label={t('inventory.price')} value={unitCost} onChange={setUnitCost} unitId={amountUnit} />
        </SimpleGrid>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={create.isPending} disabled={!name.trim()}>
            {t('inventory.addButton')}
          </Button>
        </Group>
      </Stack>
      <IngredientPicker kind={kind} opened={picking} onClose={() => setPicking(false)} onPick={pick} onCustom={(n) => setName(n)} />
    </Modal>
  );
}

function ItemDrawer({ item, onClose }: { item: InventoryItemDto | null; onClose: () => void }) {
  const { t } = useTranslation();
  const trashNote = useTrashNote();
  const notifyDeleted = useNotifyDeleted();
  const update = useUpdateInventoryItem();
  const adjust = useAdjustInventoryItem();
  const remove = useDeleteInventoryItem();
  const history = useInventoryHistory(item?.id ?? null);
  const fmtAmount = useAmountFormat();
  const dates = useDateFormat();
  const [draft, setDraft] = useState<InventoryItemDto | null>(item);
  const [delta, setDelta] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [deltaUnit, setDeltaUnit] = useState<string | undefined>(undefined);
  const [shownFor, setShownFor] = useState<string | null>(null);
  if ((item?.id ?? null) !== shownFor) {
    setShownFor(item?.id ?? null);
    setDraft(item);
    setDelta(null);
    setNote('');
  }
  const d = draft;

  const save = () =>
    d &&
    update.mutate(
      {
        id: d.id,
        patch: { name: d.name, producer: d.producer, lot: d.lot, bestBefore: d.bestBefore || null, location: d.location, minAmount: d.minAmount, unitCost: d.unitCost, notes: d.notes },
      },
      { onSuccess: () => notifyOk(t('inventory.saved')), onError: notifyError },
    );
  const change = (sign: 1 | -1) =>
    item &&
    delta &&
    adjust.mutate(
      { id: item.id, delta: sign * Math.abs(delta), reason: sign > 0 ? 'purchase' : 'adjust', note },
      {
        onSuccess: () => {
          setDelta(null);
          setNote('');
        },
        onError: notifyError,
      },
    );

  return (
    <Drawer opened={Boolean(item)} onClose={onClose} position="right" size="lg" title={item?.name}>
      {item && d && (
        <Stack>
          <Group justify="space-between" align="flex-end">
            <Stack gap={0}>
              <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                {t('inventory.inStock')}
              </Text>
              <Text fz={32} fw={800} className="tabular">
                {fmtAmount(item.amount, item.kind, item.amountKind)}
              </Text>
            </Stack>
            {isLow(item) && (
              <Badge color="orange" variant="light">
                {t('inventory.low')}
              </Badge>
            )}
          </Group>
          <Group align="flex-end" gap="xs">
            <AmountField kind={item.kind} amountKind={item.amountKind} label={t('inventory.change')} value={delta} onChange={setDelta} onUnitChange={setDeltaUnit} nullable w={150} />
            <TextInput label={t('inventory.note')} value={note} onChange={(e) => setNote(e.currentTarget.value)} style={{ flex: 1, minWidth: 120 }} />
            <Tooltip label={t('inventory.addStock')}>
              <ActionIcon size={36} variant="light" color="green" onClick={() => change(1)} disabled={!delta} loading={adjust.isPending} aria-label={t('inventory.addStock')}>
                <IconPlus size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t('inventory.removeStock')}>
              <ActionIcon size={36} variant="light" color="red" onClick={() => change(-1)} disabled={!delta} loading={adjust.isPending} aria-label={t('inventory.removeStock')}>
                <IconMinus size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>

          <Divider label={t('inventory.details')} labelPosition="left" />
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
            <TextInput label={t('fields.name')} value={d.name} onChange={(e) => setDraft({ ...d, name: e.currentTarget.value })} />
            <ProducerInput kind={d.kind} value={d.producer} onChange={(v) => setDraft({ ...d, producer: v })} />
            <TextInput label={t('inventory.lot')} value={d.lot} onChange={(e) => setDraft({ ...d, lot: e.currentTarget.value })} />
            <TextInput label={t('inventory.bestBefore')} type="date" value={d.bestBefore ?? ''} onChange={(e) => setDraft({ ...d, bestBefore: e.currentTarget.value || null })} />
            <TextInput label={t('inventory.location')} value={d.location} onChange={(e) => setDraft({ ...d, location: e.currentTarget.value })} />
            <AmountField kind={d.kind} amountKind={d.amountKind} label={t('inventory.minAmount')} value={d.minAmount} onChange={(v) => setDraft({ ...d, minAmount: v })} unitId={deltaUnit} nullable />
            <PriceField kind={d.kind} amountKind={d.amountKind} label={t('inventory.price')} value={d.unitCost} onChange={(v) => setDraft({ ...d, unitCost: v })} unitId={deltaUnit} />
          </SimpleGrid>
          <Textarea label={t('fields.notes')} autosize minRows={2} value={d.notes} onChange={(e) => setDraft({ ...d, notes: e.currentTarget.value })} />
          <Group justify="space-between">
            <Button
              variant="subtle"
              color="red"
              leftSection={<IconTrash size={16} />}
              onClick={() =>
                modals.openConfirmModal({
                  title: t('inventory.delete.title'),
                  children: <Text size="sm">{t('inventory.delete.text', { name: item.name })}{' '}{trashNote}</Text>,
                  labels: { confirm: t('common.delete'), cancel: t('common.cancel') },
                  confirmProps: { color: 'red' },
                  onConfirm: () =>
                    remove.mutate(item.id, {
                      onSuccess: () => {
                        notifyDeleted('inventory', item.id, item.name);
                        onClose();
                      },
                      onError: notifyError,
                    }),
                })
              }
            >
              {t('common.delete')}
            </Button>
            <Button onClick={save} loading={update.isPending} disabled={!d.name.trim()}>
              {t('common.save')}
            </Button>
          </Group>

          <Divider label={t('inventory.history')} labelPosition="left" />
          <Timeline bulletSize={10} lineWidth={2}>
            {(history.data ?? []).map((tx) => (
              <Timeline.Item key={tx.id} color={tx.delta > 0 ? 'green' : 'red'}>
                <Group justify="space-between" wrap="nowrap" gap="xs">
                  <Text size="sm">
                    {t(`inventory.reasons.${tx.reason}`, { number: tx.batchNumber ?? '?' })}
                    {tx.note && tx.reason !== 'brewday' && tx.reason !== 'undo' ? ` · ${tx.note}` : ''}
                  </Text>
                  <Text size="sm" fw={600} className="tabular" c={tx.delta > 0 ? 'green' : 'red'}>
                    {tx.delta > 0 ? '+' : '−'}
                    {fmtAmount(Math.abs(tx.delta), item.kind, item.amountKind)}
                  </Text>
                </Group>
                <Text size="xs" c="dimmed">
                  {dates.dateTime(tx.at)}
                </Text>
              </Timeline.Item>
            ))}
          </Timeline>
        </Stack>
      )}
    </Drawer>
  );
}
