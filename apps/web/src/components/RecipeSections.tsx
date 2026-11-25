import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Divider, Group, Input, Modal, NativeSelect, NumberInput, SimpleGrid, Stack, Text, Textarea, TextInput, UnstyledButton } from '@mantine/core';
import { IconArrowsExchange, IconPlus, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { RecipeCalc } from '@brew/brewcalc';
import {
  cultureAttenuation,
  CULTURE_FORMS,
  CULTURE_TYPES,
  FERMENTABLE_TYPES,
  FERMENTABLE_USES,
  HOP_FORMS,
  HOP_USES,
  MASH_STEP_TYPES,
  MISC_TYPES,
  MISC_USES,
  type CultureLine,
  type FermentableLine,
  type HopLine,
  type LibraryItemDto,
  type MiscLine,
  type RecipeDoc,
} from '@brew/shared';
import { newId } from '../api';
import { UnitInput, useFormat } from '../units';
import { AmountField, useAmountFormat } from './amount';
import { IngredientPicker } from './IngredientPicker';
import { FitWarnings, useFitWarnings } from './FitWarnings';
import { OriginInput, ProducerInput } from './SuggestInput';
import { ColorSwatch, Section } from './recipe-ui';

/** Editing key of the sparge line in the mash list. */
const SPARGE = '__sparge__';
/** Sparge water temperature used when the recipe sets none (as on brew day). */
const DEFAULT_SPARGE_C = 76;

export type Update = (fn: (doc: RecipeDoc) => RecipeDoc) => void;

type Line = { id: string };
const patchLine = <T extends Line>(list: T[], id: string, patch: Partial<T>) => list.map((l) => (l.id === id ? { ...l, ...patch } : l));
const removeLine = <T extends Line>(list: T[], id: string) => list.filter((l) => l.id !== id);
const num = (v: string | number, fallback = 0) => (typeof v === 'number' ? v : Number.parseFloat(v.replace(',', '.')) || fallback);

/**
 * One line of a list: read only, the whole row opens its editor. Left the name and details,
 * right the amount (or main value) and when / how it is used.
 */
export function LineRow({ lead, name, sub, value, extra, onOpen }: { lead?: ReactNode; name: string; sub?: string; value?: ReactNode; extra?: ReactNode; onOpen: () => void }) {
  return (
    <UnstyledButton className="ingredient-row line-row" onClick={onOpen}>
      <Group gap="sm" wrap="nowrap">
        {lead}
        <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
          <Text fw={600} size="sm" truncate>
            {name}
          </Text>
          {sub && (
            <Text size="xs" c="dimmed" truncate>
              {sub}
            </Text>
          )}
        </Stack>
        <Stack gap={0} align="flex-end" style={{ flex: 'none' }}>
          {value != null && (
            <Text fw={700} size="sm" className="tabular">
              {value}
            </Text>
          )}
          {extra != null && (
            <Text size="xs" c="dimmed" className="tabular">
              {extra}
            </Text>
          )}
        </Stack>
      </Group>
    </UnstyledButton>
  );
}

/**
 * Editor of one line: the values you change most (amount, use, timing) on top, the details below a
 * separator, then delete and done. Changes apply right away (the recipe saves itself).
 */
export function LineModal({
  opened,
  onClose,
  title,
  main,
  details,
  onDelete,
  focusFirst,
}: {
  opened: boolean;
  onClose: () => void;
  title: ReactNode;
  main: ReactNode;
  details?: ReactNode;
  /** Without it there is no remove button. */
  onDelete?: () => void;
  /** Put the cursor in the first field (e.g. the amount of a line just added). */
  focusFirst?: boolean;
}) {
  const { t } = useTranslation();
  const mainRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!opened || !focusFirst) return;
    // After the modal has set its own focus.
    const timer = setTimeout(() => mainRef.current?.querySelector<HTMLInputElement>('input')?.focus(), 80);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);
  return (
    <Modal opened={opened} onClose={onClose} title={title} size="lg">
      <Stack>
        <div ref={mainRef}>{main}</div>
        {details && (
          <>
            <Divider label={t('recipe.line.details')} labelPosition="left" mt="xs" />
            {details}
          </>
        )}
        <Group justify="space-between" mt="sm">
          {onDelete ? (
            <Button
              variant="subtle"
              color="red"
              leftSection={<IconTrash size={16} />}
              onClick={() => {
                onDelete();
                onClose();
              }}
            >
              {t('common.remove')}
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={onClose}>{t('recipe.line.done')}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** The ingredient of a line, at the top of its editor: click to swap it for another of the same kind. */
export function IngredientField({ name, sub, lead, onSwap }: { name: string; sub?: string; lead?: ReactNode; onSwap: () => void }) {
  const { t } = useTranslation();
  return (
    <Input.Wrapper label={t('recipe.line.ingredient')} size="md">
      <UnstyledButton className="swap-field" onClick={onSwap} aria-label={`${t('recipe.line.swap')}: ${name}`}>
        <Group gap="sm" wrap="nowrap">
          {lead}
          <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
            <Text fw={600} truncate>
              {name}
            </Text>
            {sub && (
              <Text size="xs" c="dimmed" truncate>
                {sub}
              </Text>
            )}
          </Stack>
          <Group gap={4} wrap="nowrap" c="var(--mantine-primary-color-filled)" style={{ flex: 'none' }}>
            <IconArrowsExchange size={16} />
            <Text size="sm" fw={500}>
              {t('recipe.line.swap')}
            </Text>
          </Group>
        </Group>
      </UnstyledButton>
    </Input.Wrapper>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="light" size="xs" leftSection={<IconPlus size={14} />} onClick={onClick}>
      {label}
    </Button>
  );
}

const SnapshotHint = () => {
  const { t } = useTranslation();
  return (
    <Text size="xs" c="dimmed">
      {t('recipe.snapshotHint')}
    </Text>
  );
};

// ---- Fermentables ------------------------------------------------------------------------------------

export function FermentablesSection({ doc, calc, update }: { doc: RecipeDoc; calc: RecipeCalc; update: Update }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  /** Adds a line and opens it, so the amount can be entered right away. */
  const add = (line: Omit<FermentableLine, 'id'>) => {
    const id = newId();
    update((d) => ({ ...d, fermentables: [...d.fermentables, { ...line, id }] }));
    setEditing(id);
  };
  const defaultUse = (type: FermentableLine['type'], mash: boolean): FermentableLine['use'] =>
    type === 'grain' || (type === 'adjunct' && mash) ? (doc.type === 'extract' ? 'steep' : 'mash') : 'boil';
  /** The values a line takes from a library item (not the amount and use). */
  const fromLibrary = ({ id, data: d }: LibraryItemDto<'fermentable'>) => ({
    libraryRef: id,
    name: d.name,
    type: d.type,
    grainGroup: d.grainGroup,
    producer: d.producer,
    origin: d.origin,
    colorEbc: d.colorEbc,
    potentialSg: d.potentialSg,
    fermentability: d.fermentability,
  });
  const pick = (item: LibraryItemDto<'fermentable'>) => add({ ...fromLibrary(item), amountKg: 0, use: defaultUse(item.data.type, item.data.recommendMash) });
  const set = (id: string, patch: Partial<FermentableLine>) => update((d) => ({ ...d, fermentables: patchLine(d.fermentables, id, patch) }));
  const line = doc.fermentables.find((f) => f.id === editing);
  // The grain bill decides whether the mash fits the mash tun.
  const mashWarnings = useFitWarnings(doc, calc).filter((w) => w.vessel === 'mashTun');
  const [swapping, setSwapping] = useState(false);
  /** Another ingredient in the line's place: amount and use stay. */
  const swap = (item: LibraryItemDto<'fermentable'>) => {
    if (!line) return;
    set(line.id, fromLibrary(item));
  };
  const close = () => setEditing(null);

  return (
    <Section
      title={t('recipe.fermentables.title')}
      description={t('recipe.fermentables.total', { amount: fmt(calc.totalFermentableKg, 'massLarge') })}
      actions={<AddButton label={t('common.add')} onClick={() => setPicking(true)} />}
    >
      <Stack gap={6}>
        {doc.fermentables.map((f, i) => (
          <LineRow
            key={f.id}
            lead={<ColorSwatch ebc={f.colorEbc} size={20} />}
            name={f.name}
            sub={[f.producer, t(`enums.fermentableUse.${f.use}`), fmt(f.colorEbc, 'color', 0), t('recipe.fermentables.points', { points: fmt.num(calc.fermentables[i]?.points ?? 0, 1) })].filter(Boolean).join(' · ')}
            value={fmt(f.amountKg, 'massLarge')}
            extra={`${fmt.num(calc.fermentables[i]?.pct ?? 0, 1)}%`}
            onOpen={() => setEditing(f.id)}
          />
        ))}
        {!doc.fermentables.length && <Empty text={t('recipe.fermentables.empty')} />}
        {mashWarnings.length > 0 && (
          <Stack mt={6}>
            <FitWarnings warnings={mashWarnings} />
          </Stack>
        )}
      </Stack>
      <IngredientPicker
        kind="fermentable"
        opened={picking}
        onClose={() => setPicking(false)}
        onPick={pick}
        onCustom={(name) =>
          add({ libraryRef: null, name, type: 'grain', grainGroup: null, producer: '', origin: '', colorEbc: 5, potentialSg: 1.037, fermentability: 1, amountKg: 0, use: defaultUse('grain', true) })
        }
      />
      <LineModal
        opened={Boolean(line)}
        onClose={close}
        title={line?.name}
        onDelete={() => {
          if (line) update((d) => ({ ...d, fermentables: removeLine(d.fermentables, line.id) }));
        }}
        focusFirst={line?.amountKg === 0}
        main={
          line && (
            <Stack>
              <IngredientField
                name={line.name}
                sub={[line.producer, line.origin, fmt(line.colorEbc, 'color', 0)].filter(Boolean).join(' · ')}
                lead={<ColorSwatch ebc={line.colorEbc} size={20} />}
                onSwap={() => setSwapping(true)}
              />
              <SimpleGrid cols={{ base: 1, xs: 2 }}>
                <UnitInput measure="massLarge" label={t('recipe.amount')} value={line.amountKg} onChange={(v) => set(line.id, { amountKg: v ?? 0 })} min={0} size="md" />
                <NativeSelect
                  label={t('recipe.use')}
                  size="md"
                  value={line.use}
                  data={FERMENTABLE_USES.map((u) => ({ value: u, label: t(`enums.fermentableUse.${u}`) }))}
                  onChange={(e) => set(line.id, { use: e.currentTarget.value as FermentableLine['use'] })}
                />
              </SimpleGrid>
            </Stack>
          )
        }
        details={
          line && (
            <Stack>
              <TextInput label={t('fields.name')} value={line.name} onChange={(e) => set(line.id, { name: e.currentTarget.value || line.name })} />
              <SimpleGrid cols={{ base: 1, xs: 2 }}>
                <NativeSelect
                  label={t('fields.type')}
                  value={line.type}
                  data={FERMENTABLE_TYPES.map((v) => ({ value: v, label: t(`enums.fermentableType.${v}`) }))}
                  onChange={(e) => set(line.id, { type: e.currentTarget.value as FermentableLine['type'] })}
                />
                <UnitInput measure="color" label={t('fields.color')} value={line.colorEbc} onChange={(v) => set(line.id, { colorEbc: v ?? 0 })} min={0} />
                <NumberInput
                  label={t('fields.potentialSg')}
                  description={t('fields.ppg', { ppg: fmt.num((line.potentialSg - 1) * 1000, 1) })}
                  value={line.potentialSg}
                  decimalScale={4}
                  step={0.001}
                  min={1}
                  max={1.05}
                  onChange={(v) => set(line.id, { potentialSg: Math.min(1.05, Math.max(1, num(v, 1.037))) })}
                />
                <NumberInput
                  label={t('fields.fermentability')}
                  description={t('fields.fermentabilityHint')}
                  value={Math.round(line.fermentability * 100)}
                  suffix="%"
                  min={0}
                  max={120}
                  onChange={(v) => set(line.id, { fermentability: num(v, 100) / 100 })}
                />
                <ProducerInput kind="fermentable" value={line.producer} onChange={(producer) => set(line.id, { producer })} />
                <OriginInput kind="fermentable" value={line.origin} onChange={(origin) => set(line.id, { origin })} />
              </SimpleGrid>
              <SnapshotHint />
            </Stack>
          )
        }
      />
      <IngredientPicker
        kind="fermentable"
        opened={swapping && Boolean(line)}
        onClose={() => setSwapping(false)}
        replacing={line?.name}
        onPick={swap}
        onCustom={(name) => line && set(line.id, { name, libraryRef: null })}
      />
    </Section>
  );
}

// ---- Hops ------------------------------------------------------------------------------------------------

export function HopsSection({ doc, calc, update }: { doc: RecipeDoc; calc: RecipeCalc; update: Update }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const add = (line: Omit<HopLine, 'id'>) => {
    const id = newId();
    update((d) => ({ ...d, hops: [...d.hops, { ...line, id }] }));
    setEditing(id);
  };
  const set = (id: string, patch: Partial<HopLine>) => update((d) => ({ ...d, hops: patchLine(d.hops, id, patch) }));
  const base = { amountKg: 0, use: 'boil' as const, timeMin: doc.boilTimeMin, tempC: null, day: null, durationDays: null };
  const line = doc.hops.find((h) => h.id === editing);
  const fromLibrary = ({ id, data: d }: LibraryItemDto<'hop'>) => ({ libraryRef: id, name: d.name, producer: d.producer, origin: d.origin, form: d.form, alphaPct: d.alphaPct, betaPct: d.betaPct });
  const [swapping, setSwapping] = useState(false);
  /** Another hop in the line's place: amount, use and timing stay. */
  const swap = (item: LibraryItemDto<'hop'>) => {
    if (!line) return;
    set(line.id, fromLibrary(item));
  };
  const close = () => setEditing(null);

  /** "60 min", "Whirlpool 20 min · 80 °C", "Dry hop day 4", … */
  const when = (h: HopLine) => {
    switch (h.use) {
      case 'boil':
        return t('recipe.hops.when.boil', { min: h.timeMin });
      case 'whirlpool':
        return t('recipe.hops.when.whirlpool', { min: h.timeMin, temp: h.tempC != null ? fmt(h.tempC, 'temperature', 0) : '' });
      case 'dry_hop':
        return h.day != null ? t('recipe.hops.when.dryHopDay', { day: h.day }) : t('enums.hopUse.dry_hop');
      default:
        return t(`enums.hopUse.${h.use}`);
    }
  };

  return (
    <Section
      title={t('recipe.hops.title')}
      description={t('recipe.hops.total', { amount: fmt(calc.totalHopKg, 'massSmall'), ibu: fmt.num(calc.ibu, 0) })}
      actions={<AddButton label={t('common.add')} onClick={() => setPicking(true)} />}
    >
      <Stack gap={6}>
        {doc.hops.map((h, i) => (
          <LineRow
            key={h.id}
            name={h.name}
            sub={[h.producer || h.origin, t(`enums.hopForm.${h.form}`), `${fmt.num(h.alphaPct, 1)}% α`, t('recipe.hops.ibu', { ibu: fmt.num(calc.hops[i]?.ibu ?? 0, 1) })].filter(Boolean).join(' · ')}
            value={fmt(h.amountKg, 'massSmall', 1)}
            extra={when(h)}
            onOpen={() => setEditing(h.id)}
          />
        ))}
        {!doc.hops.length && <Empty text={t('recipe.hops.empty')} />}
      </Stack>
      <IngredientPicker
        kind="hop"
        opened={picking}
        onClose={() => setPicking(false)}
        onPick={(item) => add({ ...base, ...fromLibrary(item) })}
        onCustom={(name) => add({ ...base, libraryRef: null, name, producer: '', origin: '', form: 'pellet', alphaPct: 5, betaPct: null })}
      />
      <LineModal
        opened={Boolean(line)}
        onClose={close}
        title={line?.name}
        onDelete={() => {
          if (line) update((d) => ({ ...d, hops: removeLine(d.hops, line.id) }));
        }}
        focusFirst={line?.amountKg === 0}
        main={
          line && (
            <Stack>
              <IngredientField
                name={line.name}
                sub={[line.producer, line.origin, t(`enums.hopForm.${line.form}`), `${fmt.num(line.alphaPct, 1)}% α`].filter(Boolean).join(' · ')}
                onSwap={() => setSwapping(true)}
              />
              <SimpleGrid cols={{ base: 1, xs: 2 }}>
                <UnitInput measure="massSmall" label={t('recipe.amount')} value={line.amountKg} onChange={(v) => set(line.id, { amountKg: v ?? 0 })} min={0} size="md" />
                <NativeSelect
                  label={t('recipe.use')}
                  size="md"
                  value={line.use}
                  data={HOP_USES.map((u) => ({ value: u, label: t(`enums.hopUse.${u}`) }))}
                  onChange={(e) => {
                    const use = e.currentTarget.value as HopLine['use'];
                    set(line.id, {
                      use,
                      ...(use === 'whirlpool' && { timeMin: 20, tempC: line.tempC ?? 80 }),
                      ...(use === 'dry_hop' && { day: line.day ?? 4, durationDays: line.durationDays ?? 4 }),
                      ...(use === 'boil' && { timeMin: Math.min(line.timeMin, doc.boilTimeMin) }),
                    });
                  }}
                />
                {line.use === 'boil' && (
                  <NumberInput label={t('recipe.hops.boilTime')} description={t('recipe.hops.boilTimeHint')} value={line.timeMin} suffix=" min" min={0} max={600} size="md" onChange={(v) => set(line.id, { timeMin: num(v) })} />
                )}
                {line.use === 'whirlpool' && (
                  <>
                    <NumberInput label={t('recipe.hops.standTime')} value={line.timeMin} suffix=" min" min={0} max={600} size="md" onChange={(v) => set(line.id, { timeMin: num(v) })} />
                    <UnitInput measure="temperature" label={t('fields.temperature')} value={line.tempC} onChange={(v) => set(line.id, { tempC: v })} nullable size="md" />
                  </>
                )}
                {line.use === 'dry_hop' && (
                  <>
                    <NumberInput label={t('recipe.hops.day')} description={t('recipe.hops.dayHint')} value={line.day ?? ''} min={0} max={365} size="md" onChange={(v) => set(line.id, { day: v === '' ? null : num(v) })} />
                    <NumberInput label={t('recipe.hops.duration')} value={line.durationDays ?? ''} suffix={` ${t('common.days')}`} min={0} max={365} size="md" onChange={(v) => set(line.id, { durationDays: v === '' ? null : num(v) })} />
                  </>
                )}
              </SimpleGrid>
            </Stack>
          )
        }
        details={
          line && (
            <Stack>
              <TextInput label={t('fields.name')} value={line.name} onChange={(e) => set(line.id, { name: e.currentTarget.value || line.name })} />
              <SimpleGrid cols={{ base: 1, xs: 2 }}>
                <NumberInput label={t('fields.alphaPct')} value={line.alphaPct} suffix="%" decimalScale={2} min={0} max={100} onChange={(v) => set(line.id, { alphaPct: num(v) })} />
                <NumberInput label={t('fields.betaPct')} value={line.betaPct ?? ''} suffix="%" decimalScale={2} min={0} max={100} onChange={(v) => set(line.id, { betaPct: v === '' ? null : num(v) })} />
                <NativeSelect
                  label={t('fields.form')}
                  value={line.form}
                  data={HOP_FORMS.map((v) => ({ value: v, label: t(`enums.hopForm.${v}`) }))}
                  onChange={(e) => set(line.id, { form: e.currentTarget.value as HopLine['form'] })}
                />
                <ProducerInput kind="hop" value={line.producer} onChange={(producer) => set(line.id, { producer })} />
                <OriginInput kind="hop" value={line.origin} onChange={(origin) => set(line.id, { origin })} />
              </SimpleGrid>
              <SnapshotHint />
            </Stack>
          )
        }
      />
      <IngredientPicker
        kind="hop"
        opened={swapping && Boolean(line)}
        onClose={() => setSwapping(false)}
        replacing={line?.name}
        onPick={swap}
        onCustom={(name) => line && set(line.id, { name, libraryRef: null })}
      />
    </Section>
  );
}

// ---- Yeast -------------------------------------------------------------------------------------------------

export function CulturesSection({ doc, calc, update }: { doc: RecipeDoc; calc: RecipeCalc; update: Update }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const fmtAmount = useAmountFormat();
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const add = (line: Omit<CultureLine, 'id'>) => {
    const id = newId();
    update((d) => ({ ...d, cultures: [...d.cultures, { ...line, id }] }));
    setEditing(id);
  };
  const set = (id: string, patch: Partial<CultureLine>) => update((d) => ({ ...d, cultures: patchLine(d.cultures, id, patch) }));
  const line = doc.cultures.find((c) => c.id === editing);
  const close = () => setEditing(null);
  const fromLibrary = ({ id, data: d }: LibraryItemDto<'culture'>) => ({
    libraryRef: id,
    name: d.name,
    producer: d.producer,
    productId: d.productId,
    type: d.type,
    form: d.form,
    attenuationPct: cultureAttenuation(d),
    tempMinC: d.tempMinC,
    tempMaxC: d.tempMaxC,
  });
  const [swapping, setSwapping] = useState(false);
  /** Another yeast in the line's place: the amount stays. */
  const swap = (item: LibraryItemDto<'culture'>) => {
    if (!line) return;
    set(line.id, fromLibrary(item));
  };

  return (
    <Section
      title={t('recipe.cultures.title')}
      description={t('recipe.cultures.attenuation', { pct: fmt.num(calc.attenuationPct, 0) })}
      actions={<AddButton label={t('common.add')} onClick={() => setPicking(true)} />}
    >
      <Stack gap={6}>
        {doc.cultures.map((c) => (
          <LineRow
            key={c.id}
            name={c.name}
            sub={[c.producer, c.productId, t(`enums.cultureForm.${c.form}`), c.tempMinC != null && c.tempMaxC != null ? `${fmt.value(c.tempMinC, 'temperature', 0)}–${fmt(c.tempMaxC, 'temperature', 0)}` : '']
              .filter(Boolean)
              .join(' · ')}
            value={fmtAmount(c.amount, 'culture', c.amountKind)}
            extra={c.attenuationPct != null ? t('recipe.cultures.att', { pct: fmt.num(c.attenuationPct, 0) }) : undefined}
            onOpen={() => setEditing(c.id)}
          />
        ))}
        {!doc.cultures.length && <Empty text={t('recipe.cultures.empty')} />}
      </Stack>
      <IngredientPicker
        kind="culture"
        opened={picking}
        onClose={() => setPicking(false)}
        onPick={(item) => add({ ...fromLibrary(item), amountKind: 'count', amount: 1 })}
        onCustom={(name) =>
          add({ libraryRef: null, name, producer: '', productId: '', type: 'ale', form: 'dry', attenuationPct: 75, tempMinC: null, tempMaxC: null, amountKind: 'count', amount: 1 })
        }
      />
      <LineModal
        opened={Boolean(line)}
        onClose={close}
        title={line?.name}
        onDelete={() => {
          if (line) update((d) => ({ ...d, cultures: removeLine(d.cultures, line.id) }));
        }}
        main={
          line && (
            <Stack>
              <IngredientField
                name={line.name}
                sub={[line.producer, line.productId, t(`enums.cultureForm.${line.form}`)].filter(Boolean).join(' · ')}
                onSwap={() => setSwapping(true)}
              />
              <SimpleGrid cols={{ base: 1, xs: 2 }}>
                <AmountField kind="culture" amountKind={line.amountKind} label={t('recipe.amount')} value={line.amount} onChange={(v) => set(line.id, { amount: v ?? 0 })} size="md" />
                <NativeSelect
                  label={t('recipe.amountKind')}
                  size="md"
                  value={line.amountKind}
                  data={(['count', 'mass', 'volume'] as const).map((k) => ({ value: k, label: t(`enums.amountKind.${k}`) }))}
                  onChange={(e) => set(line.id, { amountKind: e.currentTarget.value as CultureLine['amountKind'], amount: e.currentTarget.value === 'count' ? 1 : 0.0115 })}
                />
                <NumberInput
                  label={t('fields.attenuation')}
                  description={t('recipe.cultures.attHint')}
                  value={line.attenuationPct ?? ''}
                  placeholder="75"
                  suffix="%"
                  min={0}
                  max={100}
                  size="md"
                  onChange={(v) => set(line.id, { attenuationPct: v === '' ? null : num(v) })}
                />
              </SimpleGrid>
            </Stack>
          )
        }
        details={
          line && (
            <Stack>
              <TextInput label={t('fields.name')} value={line.name} onChange={(e) => set(line.id, { name: e.currentTarget.value || line.name })} />
              <SimpleGrid cols={{ base: 1, xs: 2 }}>
                <ProducerInput kind="culture" value={line.producer} onChange={(producer) => set(line.id, { producer })} />
                <TextInput label={t('fields.productId')} value={line.productId} onChange={(e) => set(line.id, { productId: e.currentTarget.value })} />
                <NativeSelect
                  label={t('fields.type')}
                  value={line.type}
                  data={CULTURE_TYPES.map((v) => ({ value: v, label: t(`enums.cultureType.${v}`) }))}
                  onChange={(e) => set(line.id, { type: e.currentTarget.value as CultureLine['type'] })}
                />
                <NativeSelect
                  label={t('fields.form')}
                  value={line.form}
                  data={CULTURE_FORMS.map((v) => ({ value: v, label: t(`enums.cultureForm.${v}`) }))}
                  onChange={(e) => set(line.id, { form: e.currentTarget.value as CultureLine['form'] })}
                />
                <UnitInput measure="temperature" label={t('fields.tempMinC')} value={line.tempMinC} nullable onChange={(v) => set(line.id, { tempMinC: v })} />
                <UnitInput measure="temperature" label={t('fields.tempMaxC')} value={line.tempMaxC} nullable onChange={(v) => set(line.id, { tempMaxC: v })} />
              </SimpleGrid>
              <SnapshotHint />
            </Stack>
          )
        }
      />
      <IngredientPicker
        kind="culture"
        opened={swapping && Boolean(line)}
        onClose={() => setSwapping(false)}
        replacing={line?.name}
        onPick={swap}
        onCustom={(name) => line && set(line.id, { name, libraryRef: null })}
      />
    </Section>
  );
}

// ---- Other ingredients ----------------------------------------------------------------------------------

export function MiscsSection({ doc, update }: { doc: RecipeDoc; update: Update }) {
  const { t } = useTranslation();
  const fmtAmount = useAmountFormat();
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const add = (line: Omit<MiscLine, 'id'>) => {
    const id = newId();
    update((d) => ({ ...d, miscs: [...d.miscs, { ...line, id }] }));
    setEditing(id);
  };
  const set = (id: string, patch: Partial<MiscLine>) => update((d) => ({ ...d, miscs: patchLine(d.miscs, id, patch) }));
  const line = doc.miscs.find((m) => m.id === editing);
  const close = () => setEditing(null);
  const fromLibrary = ({ id, data: d }: LibraryItemDto<'misc'>) => ({ libraryRef: id, name: d.name, type: d.type, producer: d.producer, amountKind: d.amountKind });
  const [swapping, setSwapping] = useState(false);
  /** Another ingredient in the line's place: amount, use and timing stay (the amount only if it is measured the same way). */
  const swap = (item: LibraryItemDto<'misc'>) => {
    if (!line) return;
    set(line.id, { ...fromLibrary(item), ...(item.data.amountKind !== line.amountKind && { amount: 0 }) });
  };
  const when = (m: MiscLine) =>
    m.use === 'boil' && m.timeMin != null
      ? t('recipe.hops.when.boil', { min: m.timeMin })
      : m.use === 'fermentation' && m.timeMin != null
        ? t('recipe.miscs.whenDay', { day: m.timeMin })
        : t(`enums.miscUse.${m.use}`);

  return (
    <Section title={t('recipe.miscs.title')} actions={<AddButton label={t('common.add')} onClick={() => setPicking(true)} />}>
      <Stack gap={6}>
        {doc.miscs.map((m) => (
          <LineRow
            key={m.id}
            name={m.name}
            sub={[m.producer, t(`enums.miscType.${m.type}`)].filter(Boolean).join(' · ')}
            value={fmtAmount(m.amount, 'misc', m.amountKind)}
            extra={when(m)}
            onOpen={() => setEditing(m.id)}
          />
        ))}
        {!doc.miscs.length && <Empty text={t('recipe.miscs.empty')} />}
      </Stack>
      <IngredientPicker
        kind="misc"
        opened={picking}
        onClose={() => setPicking(false)}
        onPick={(item) => add({ ...fromLibrary(item), amount: 0, use: 'boil', timeMin: 10, notes: '' })}
        onCustom={(name) => add({ libraryRef: null, name, type: 'other', producer: '', amountKind: 'mass', amount: 0, use: 'boil', timeMin: 10, notes: '' })}
      />
      <LineModal
        opened={Boolean(line)}
        onClose={close}
        title={line?.name}
        onDelete={() => {
          if (line) update((d) => ({ ...d, miscs: removeLine(d.miscs, line.id) }));
        }}
        focusFirst={line?.amount === 0}
        main={
          line && (
            <Stack>
              <IngredientField name={line.name} sub={[line.producer, t(`enums.miscType.${line.type}`)].filter(Boolean).join(' · ')} onSwap={() => setSwapping(true)} />
              <SimpleGrid cols={{ base: 1, xs: 2 }}>
                <AmountField kind="misc" amountKind={line.amountKind} label={t('recipe.amount')} value={line.amount} onChange={(v) => set(line.id, { amount: v ?? 0 })} size="md" />
                <NativeSelect
                  label={t('recipe.amountKind')}
                  size="md"
                  value={line.amountKind}
                  data={(['mass', 'volume', 'count'] as const).map((k) => ({ value: k, label: t(`enums.amountKind.${k}`) }))}
                  onChange={(e) => set(line.id, { amountKind: e.currentTarget.value as MiscLine['amountKind'] })}
                />
                <NativeSelect
                  label={t('recipe.use')}
                  size="md"
                  value={line.use}
                  data={MISC_USES.map((u) => ({ value: u, label: t(`enums.miscUse.${u}`) }))}
                  onChange={(e) => set(line.id, { use: e.currentTarget.value as MiscLine['use'] })}
                />
                {line.use === 'boil' && (
                  <NumberInput label={t('recipe.hops.boilTime')} description={t('recipe.hops.boilTimeHint')} value={line.timeMin ?? ''} suffix=" min" min={0} max={600} size="md" onChange={(v) => set(line.id, { timeMin: v === '' ? null : num(v) })} />
                )}
                {line.use === 'fermentation' && (
                  <NumberInput label={t('recipe.hops.day')} description={t('recipe.hops.dayHint')} value={line.timeMin ?? ''} min={0} max={365} size="md" onChange={(v) => set(line.id, { timeMin: v === '' ? null : num(v) })} />
                )}
              </SimpleGrid>
            </Stack>
          )
        }
        details={
          line && (
            <Stack>
              <SimpleGrid cols={{ base: 1, xs: 2 }}>
                <TextInput label={t('fields.name')} value={line.name} onChange={(e) => set(line.id, { name: e.currentTarget.value || line.name })} />
                <NativeSelect
                  label={t('fields.type')}
                  value={line.type}
                  data={MISC_TYPES.map((v) => ({ value: v, label: t(`enums.miscType.${v}`) }))}
                  onChange={(e) => set(line.id, { type: e.currentTarget.value as MiscLine['type'] })}
                />
                <ProducerInput kind="misc" value={line.producer} onChange={(producer) => set(line.id, { producer })} />
              </SimpleGrid>
              <Textarea label={t('fields.notes')} value={line.notes} autosize minRows={2} onChange={(e) => set(line.id, { notes: e.currentTarget.value })} />
              <SnapshotHint />
            </Stack>
          )
        }
      />
      <IngredientPicker
        kind="misc"
        opened={swapping && Boolean(line)}
        onClose={() => setSwapping(false)}
        replacing={line?.name}
        onPick={swap}
        onCustom={(name) => line && set(line.id, { name, libraryRef: null })}
      />
    </Section>
  );
}

// ---- Mash ------------------------------------------------------------------------------------------------

export function MashSection({ doc, calc, update }: { doc: RecipeDoc; calc: RecipeCalc; update: Update }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const [editing, setEditing] = useState<string | null>(null);
  const steps = doc.mash.steps;
  const setSteps = (fn: (s: RecipeDoc['mash']['steps']) => RecipeDoc['mash']['steps']) => update((d) => ({ ...d, mash: { ...d.mash, steps: fn(d.mash.steps) } }));
  const set = (id: string, patch: Partial<RecipeDoc['mash']['steps'][number]>) => setSteps((all) => patchLine(all, id, patch));
  const last = steps.at(-1);
  const strike = calc.strikeTempC;
  const step = steps.find((s) => s.id === editing);
  // Sparge is shown when the brew method sparges, or a temperature was set anyway.
  const showSparge = calc.volumes.spargeL > 0.01 || doc.mash.spargeTempC != null;

  return (
    <Section
      title={t('recipe.mash.title')}
      description={strike != null ? t('recipe.mash.strike', { volume: fmt(calc.volumes.strikeL, 'volume', 1), temp: fmt(strike, 'temperature') }) : undefined}
      actions={
        <AddButton
          label={t('recipe.mash.addStep')}
          onClick={() => {
            const id = newId();
            setSteps((s) => [...s, { id, name: last ? t('recipe.mash.mashOut') : t('recipe.mash.defaultStep'), type: 'temperature', tempC: last ? 76 : 67, timeMin: last ? 10 : 60, rampMin: null, infuseL: null }]);
            setEditing(id);
          }}
        />
      }
    >
      <Stack gap={6}>
        {steps.map((s) => (
          <LineRow key={s.id} name={s.name} sub={t(`enums.mashStepType.${s.type}`)} value={fmt(s.tempC, 'temperature', 1)} extra={`${s.timeMin} min`} onOpen={() => setEditing(s.id)} />
        ))}
        {!steps.length && <Empty text={t('recipe.mash.empty')} />}
        {showSparge && (
          <LineRow
            name={t('recipe.mash.sparge')}
            sub={calc.volumes.spargeL > 0.01 ? t('recipe.mash.spargeWater', { volume: fmt(calc.volumes.spargeL, 'volume', 1) }) : undefined}
            value={fmt(doc.mash.spargeTempC ?? DEFAULT_SPARGE_C, 'temperature', 1)}
            extra={doc.mash.spargeTempC == null ? t('recipe.mash.default') : undefined}
            onOpen={() => setEditing(SPARGE)}
          />
        )}
      </Stack>
      <LineModal
        opened={editing === SPARGE}
        onClose={() => setEditing(null)}
        title={t('recipe.mash.sparge')}
        main={
          <Stack gap="xs">
            <UnitInput
              measure="temperature"
              label={t('recipe.mash.spargeTemp')}
              value={doc.mash.spargeTempC}
              nullable
              placeholder={fmt.value(DEFAULT_SPARGE_C, 'temperature', 0)}
              onChange={(v) => update((d) => ({ ...d, mash: { ...d.mash, spargeTempC: v } }))}
              size="md"
              w={220}
            />
            <Text size="sm" c="dimmed">
              {calc.volumes.spargeL > 0.01 ? t('recipe.mash.spargeHint', { volume: fmt(calc.volumes.spargeL, 'volume', 1) }) : t('recipe.mash.noSpargeHint')}
            </Text>
          </Stack>
        }
      />
      <LineModal
        opened={Boolean(step)}
        onClose={() => setEditing(null)}
        title={step?.name}
        onDelete={() => step && setSteps((all) => removeLine(all, step.id))}
        main={
          step && (
            <SimpleGrid cols={{ base: 1, xs: 2 }}>
              <UnitInput measure="temperature" label={t('fields.temperature')} value={step.tempC} onChange={(v) => set(step.id, { tempC: v ?? 0 })} size="md" />
              <NumberInput label={t('fields.time')} value={step.timeMin} suffix=" min" min={0} max={1440} size="md" onChange={(v) => set(step.id, { timeMin: num(v) })} />
            </SimpleGrid>
          )
        }
        details={
          step && (
            <SimpleGrid cols={{ base: 1, xs: 2 }}>
              <TextInput label={t('fields.name')} value={step.name} onChange={(e) => set(step.id, { name: e.currentTarget.value || step.name })} />
              <NativeSelect
                label={t('fields.type')}
                value={step.type}
                data={MASH_STEP_TYPES.map((v) => ({ value: v, label: t(`enums.mashStepType.${v}`) }))}
                onChange={(e) => set(step.id, { type: e.currentTarget.value as typeof step.type })}
              />
              <NumberInput label={t('recipe.mash.ramp')} value={step.rampMin ?? ''} suffix=" min" min={0} max={1440} onChange={(v) => set(step.id, { rampMin: v === '' ? null : num(v) })} />
              {step.type === 'infusion' && (
                <UnitInput measure="volume" label={t('recipe.mash.infuse')} value={step.infuseL} nullable onChange={(v) => set(step.id, { infuseL: v })} />
              )}
            </SimpleGrid>
          )
        }
      />
    </Section>
  );
}

// ---- Fermentation -------------------------------------------------------------------------------------------

export function FermentationSection({ doc, update }: { doc: RecipeDoc; update: Update }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const [editing, setEditing] = useState<string | null>(null);
  const steps = doc.fermentation;
  const setSteps = (fn: (s: RecipeDoc['fermentation']) => RecipeDoc['fermentation']) => update((d) => ({ ...d, fermentation: fn(d.fermentation) }));
  const set = (id: string, patch: Partial<RecipeDoc['fermentation'][number]>) => setSteps((all) => patchLine(all, id, patch));
  const total = steps.reduce((sum, s) => sum + s.days, 0);
  const step = steps.find((s) => s.id === editing);

  return (
    <Section
      title={t('recipe.fermentation.title')}
      description={total ? t('recipe.fermentation.total', { days: total }) : undefined}
      actions={
        <AddButton
          label={t('recipe.mash.addStep')}
          onClick={() => {
            const id = newId();
            setSteps((s) => [...s, { id, name: s.length ? t('recipe.fermentation.coldCrash') : t('recipe.fermentation.primary'), tempC: s.length ? 2 : 19, days: s.length ? 2 : 14, rampDays: null }]);
            setEditing(id);
          }}
        />
      }
    >
      <Stack gap={6}>
        {steps.map((s) => (
          <LineRow key={s.id} name={s.name} value={fmt(s.tempC, 'temperature', 1)} extra={t('recipe.fermentation.days', { count: s.days })} onOpen={() => setEditing(s.id)} />
        ))}
        {!steps.length && <Empty text={t('recipe.fermentation.empty')} />}
      </Stack>
      <LineModal
        opened={Boolean(step)}
        onClose={() => setEditing(null)}
        title={step?.name}
        onDelete={() => step && setSteps((all) => removeLine(all, step.id))}
        main={
          step && (
            <SimpleGrid cols={{ base: 1, xs: 2 }}>
              <UnitInput measure="temperature" label={t('fields.temperature')} value={step.tempC} onChange={(v) => set(step.id, { tempC: v ?? 0 })} size="md" />
              <NumberInput label={t('fields.days')} value={step.days} suffix={` ${t('common.days')}`} min={0} max={1000} size="md" onChange={(v) => set(step.id, { days: num(v) })} />
            </SimpleGrid>
          )
        }
        details={
          step && (
            <SimpleGrid cols={{ base: 1, xs: 2 }}>
              <TextInput label={t('fields.name')} value={step.name} onChange={(e) => set(step.id, { name: e.currentTarget.value || step.name })} />
              <NumberInput label={t('recipe.fermentation.ramp')} value={step.rampDays ?? ''} suffix={` ${t('common.days')}`} min={0} max={30} decimalScale={1} onChange={(v) => set(step.id, { rampDays: v === '' ? null : num(v) })} />
            </SimpleGrid>
          )
        }
      />
    </Section>
  );
}

// ---- Setup: type, author, carbonation (style and equipment: RecipeMetaRow) -----------------------------------

export function SetupSection({ doc, update }: { doc: RecipeDoc; update: Update }) {
  const { t } = useTranslation();
  return (
    <Section title={t('recipe.setup.title')}>
      <SimpleGrid cols={2} spacing="sm">
        <NativeSelect
          label={t('recipe.setup.type')}
          value={doc.type}
          data={(['all_grain', 'partial_mash', 'extract', 'other'] as const).map((v) => ({ value: v, label: t(`enums.recipeType.${v}`) }))}
          onChange={(e) => update((d) => ({ ...d, type: e.currentTarget.value as RecipeDoc['type'] }))}
        />
        <UnitInput
          measure="carbonation"
          label={t('recipe.setup.carbonation')}
          value={doc.carbonationVols}
          nullable
          placeholder={doc.style?.carbVols[0] != null ? String(doc.style.carbVols[0]) : '2.4'}
          onChange={(v) => update((d) => ({ ...d, carbonationVols: v }))}
        />
        <TextInput label={t('recipe.setup.author')} value={doc.author} onChange={(e) => update((d) => ({ ...d, author: e.currentTarget.value }))} style={{ gridColumn: '1 / -1' }} />
      </SimpleGrid>
    </Section>
  );
}

// ---- Water and wort volumes ------------------------------------------------------------------------------------

export function VolumesSection({ doc, calc }: { doc: RecipeDoc; calc: RecipeCalc }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const v = calc.volumes;
  const eq = doc.equipment;
  const rows: [string, string][] = [
    ...(v.strikeL > 0 ? [[t('recipe.volumes.strike'), `${fmt(v.strikeL, 'volume', 1)}${calc.strikeTempC != null ? ` @ ${fmt(calc.strikeTempC, 'temperature')}` : ''}`] as [string, string]] : []),
    ...(v.spargeL > 0 ? [[t('recipe.volumes.sparge'), fmt(v.spargeL, 'volume', 1)] as [string, string]] : []),
    [t('recipe.volumes.totalWater'), fmt(v.totalWaterL, 'volume', 1)],
    [t('recipe.volumes.preBoil'), `${fmt(v.preBoilL, 'volume', 1)} · ${fmt(calc.preBoilGravity, 'gravity')}`],
    [t('recipe.volumes.postBoil'), fmt(v.postBoilHotL, 'volume', 1)],
    [t('recipe.volumes.fermenter'), fmt(v.fermenterL, 'volume', 1)],
    [t('recipe.volumes.packaged'), fmt(v.packagedL, 'volume', 1)],
  ];
  const warnings = useFitWarnings(doc, calc);

  return (
    <Section title={t('recipe.volumes.title')} description={eq ? eq.name : t('recipe.volumes.defaultLosses')}>
      <Stack gap={4}>
        {rows.map(([label, value]) => (
          <Group key={label} justify="space-between" gap="xs" wrap="nowrap">
            <Text size="sm" c="dimmed">
              {label}
            </Text>
            <Text size="sm" fw={500} className="tabular" ta="right">
              {value}
            </Text>
          </Group>
        ))}
        {warnings.length > 0 && (
          <Stack mt="xs">
            <FitWarnings warnings={warnings} />
          </Stack>
        )}
      </Stack>
    </Section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <Text size="sm" c="dimmed" py={6}>
      {text}
    </Text>
  );
}

