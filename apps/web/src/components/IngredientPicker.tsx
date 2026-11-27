import { useState } from 'react';
import { Badge, Button, Center, Group, Loader, Modal, ScrollArea, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { cultureAttenuation, sameProducer, type AmountKind, type LibraryItemDto, type LibraryKind } from '@brew/shared';
import { useLibrary, useStock, useSubstitutes } from '../data';
import { useAmountFormat } from './amount';
import { useFormat } from '../units';
import { ColorSwatch } from './recipe-ui';

type PickableKind = Exclude<LibraryKind, 'water' | 'style'>;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const producerOf = (item: LibraryItemDto) => ('producer' in item.data ? item.data.producer : '');

/**
 * Search the ingredient library and pick an item, or add an ingredient by name only (its values
 * can be filled in on the recipe line). With `replacing` it picks the ingredient that takes the
 * place of an existing one (same kind); with `replacingRef` (its library item) it lists that
 * item's substitutes first, e.g. the same malt from other maltsters.
 */
export function IngredientPicker<K extends PickableKind>({
  kind,
  opened,
  onClose,
  onPick,
  onCustom,
  replacing,
  replacingRef,
}: {
  kind: K;
  opened: boolean;
  onClose: () => void;
  onPick: (item: LibraryItemDto<K>) => void;
  onCustom: (name: string) => void;
  /** Name of the ingredient being swapped. */
  replacing?: string;
  /** Library item of the ingredient being swapped. */
  replacingRef?: string | null;
}) {
  const { t } = useTranslation();
  const k: PickableKind = kind;
  const [q, setQ] = useState('');
  const [debounced] = useDebouncedValue(q.trim(), 200);
  const items = useLibrary(kind, debounced, opened);
  const stock = useStock(opened);
  const substitutes = useSubstitutes<K>(replacingRef, opened);
  const suggested = debounced ? [] : (substitutes.data ?? []);
  const fmtAmount = useAmountFormat();
  /** Stock of a library item: linked by library id, else by name (when the producers don't differ). */
  const inStock = (item: LibraryItemDto) =>
    (stock.data ?? [])
      .filter((s) => s.kind === kind && (s.libraryRef === item.id || (same(s.name, item.name) && sameProducer(s.producer, producerOf(item)))))
      .reduce<{ amount: number; amountKind: AmountKind } | null>((acc, s) => ({ amount: (acc?.amount ?? 0) + s.amount, amountKind: s.amountKind }), null);

  const close = () => {
    setQ('');
    onClose();
  };

  const row = (item: LibraryItemDto<K>) => {
    const s = inStock(item);
    return (
      <UnstyledButton
        key={item.id}
        className="clickable-row"
        p={8}
        style={{ borderRadius: 8 }}
        onClick={() => {
          onPick(item);
          close();
        }}
      >
        <ItemLine item={item} stock={s && s.amount > 0 ? fmtAmount(s.amount, kind, s.amountKind) : null} />
      </UnstyledButton>
    );
  };
  const heading = (text: string) => (
    <Text size="xs" fw={600} c="dimmed" tt="uppercase" px={8} pt={6}>
      {text}
    </Text>
  );

  return (
    <Modal opened={opened} onClose={close} title={replacing ? t('picker.swapTitle', { name: replacing }) : t('picker.title', { kind: t(`library.kinds.${k}`) })} size="lg">
      <Stack gap="sm">
        <TextInput
          placeholder={t('picker.search')}
          leftSection={<IconSearch size={16} />}
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          data-autofocus
          size="md"
        />
        <ScrollArea h="min(55dvh, 460px)" type="auto">
          {items.isPending ? (
            <Center py="lg">
              <Loader size="sm" />
            </Center>
          ) : (
            <Stack gap={2}>
              {suggested.length > 0 && (
                <>
                  {heading(t('picker.substitutes'))}
                  {suggested.map(row)}
                  {heading(t('picker.allItems'))}
                </>
              )}
              {(items.data ?? []).map(row)}
              {items.data?.length === 0 && (
                <Text c="dimmed" size="sm" ta="center" py="md">
                  {t('picker.nothing')}
                </Text>
              )}
            </Stack>
          )}
        </ScrollArea>
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {t('picker.hint')}
          </Text>
          {(!replacing || q.trim()) && (
            <Button
              variant="default"
              leftSection={<IconPlus size={16} />}
              onClick={() => {
                onCustom(q.trim() || t(`picker.newName.${k}`));
                close();
              }}
            >
              {replacing ? t('picker.useNamed', { name: q.trim() }) : q.trim() ? t('picker.addNamed', { name: q.trim() }) : t('picker.addCustom')}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}

function ItemLine({ item, stock }: { item: LibraryItemDto; stock: string | null }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  let detail = '';
  let swatch = null;
  if (item.kind === 'fermentable') {
    const d = item.data as LibraryItemDto<'fermentable'>['data'];
    swatch = <ColorSwatch ebc={d.colorEbc} size={18} />;
    detail = [d.producer, d.origin, fmt(d.colorEbc, 'color', 0), t('picker.ppg', { ppg: fmt.num((d.potentialSg - 1) * 1000, 0) })].filter(Boolean).join(' · ');
  } else if (item.kind === 'hop') {
    const d = item.data as LibraryItemDto<'hop'>['data'];
    detail = [d.producer, d.origin, `${fmt.num(d.alphaPct, 1)}% α`, d.purpose ? t(`enums.hopPurpose.${d.purpose}`) : ''].filter(Boolean).join(' · ');
  } else if (item.kind === 'culture') {
    const d = item.data as LibraryItemDto<'culture'>['data'];
    const att = cultureAttenuation(d);
    detail = [d.producer, d.productId, att != null ? `${fmt.num(att, 0)}%` : ''].filter(Boolean).join(' · ');
  } else if (item.kind === 'misc') {
    const d = item.data as LibraryItemDto<'misc'>['data'];
    detail = [d.producer, t(`enums.miscType.${d.type}`)].filter(Boolean).join(' · ');
  }
  return (
    <Group gap="sm" wrap="nowrap">
      {swatch}
      <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
        <Text size="sm" fw={500} truncate>
          {item.name}
        </Text>
        <Text size="xs" c="dimmed" truncate>
          {detail}
        </Text>
      </Stack>
      {stock && (
        <Badge size="sm" variant="light" color="green">
          {t('picker.inStock', { amount: stock })}
        </Badge>
      )}
      {item.source !== 'seed' && (
        <Badge size="xs" variant="light" color="gray">
          {t(`library.source.${item.source}`)}
        </Badge>
      )}
    </Group>
  );
}
