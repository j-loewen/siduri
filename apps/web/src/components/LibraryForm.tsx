import { Badge, Group, NativeSelect, NumberInput, SimpleGrid, Stack, Switch, TagsInput, Text, Textarea, TextInput } from '@mantine/core';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AMOUNT_KINDS,
  CULTURE_FORMS,
  CULTURE_TYPES,
  FERMENTABLE_TYPES,
  FLOCCULATION,
  GRAIN_GROUPS,
  HOP_FORMS,
  HOP_PURPOSES,
  MISC_TYPES,
  type LibraryDataMap,
  type LibraryKind,
  type Measure,
  type Range,
} from '@brew/shared';
import { UnitInput, useFormat, useFormatRange } from '../units';
import { OriginInput, ProducerInput } from './SuggestInput';

/** One field of a library item form. */
type Field =
  | { key: string; type: 'text'; wide?: boolean }
  | { key: string; type: 'tags' }
  | { key: string; type: 'producer' | 'origin' }
  | { key: string; type: 'textarea' }
  | { key: string; type: 'select'; options: readonly string[]; enumKey: string; nullable?: boolean }
  | { key: string; type: 'unit'; measure: Measure; nullable?: boolean }
  | { key: string; type: 'number'; suffix?: string; decimals?: number; min?: number; max?: number; nullable?: boolean; fraction?: boolean }
  | { key: string; type: 'range'; measure?: Measure; suffix?: string; decimals?: number }
  | { key: string; type: 'bool' };

const ppm = (key: string): Field => ({ key, type: 'number', suffix: ' ppm', min: 0, max: 3000, decimals: 1 });

export const LIBRARY_FIELDS: Record<LibraryKind, Field[]> = {
  fermentable: [
    { key: 'name', type: 'text', wide: true },
    { key: 'aliases', type: 'tags' },
    { key: 'type', type: 'select', options: FERMENTABLE_TYPES, enumKey: 'fermentableType' },
    { key: 'grainGroup', type: 'select', options: GRAIN_GROUPS, enumKey: 'grainGroup', nullable: true },
    { key: 'producer', type: 'producer' },
    { key: 'origin', type: 'origin' },
    { key: 'productId', type: 'text' },
    { key: 'colorEbc', type: 'unit', measure: 'color' },
    { key: 'potentialSg', type: 'number', decimals: 4, min: 1, max: 1.05 },
    { key: 'fermentability', type: 'number', suffix: '%', min: 0, max: 120, fraction: true },
    { key: 'moisturePct', type: 'number', suffix: '%', min: 0, max: 100, nullable: true, decimals: 1 },
    { key: 'proteinPct', type: 'number', suffix: '%', min: 0, max: 100, nullable: true, decimals: 1 },
    { key: 'diastaticPower', type: 'unit', measure: 'diastaticPower', nullable: true },
    { key: 'maxInBatchPct', type: 'number', suffix: '%', min: 0, max: 100, nullable: true },
    { key: 'recommendMash', type: 'bool' },
    { key: 'notes', type: 'textarea' },
  ],
  hop: [
    { key: 'name', type: 'text', wide: true },
    { key: 'aliases', type: 'tags' },
    { key: 'producer', type: 'producer' },
    { key: 'origin', type: 'origin' },
    { key: 'form', type: 'select', options: HOP_FORMS, enumKey: 'hopForm' },
    { key: 'purpose', type: 'select', options: HOP_PURPOSES, enumKey: 'hopPurpose', nullable: true },
    { key: 'alphaPct', type: 'number', suffix: '%', min: 0, max: 100, decimals: 2 },
    { key: 'betaPct', type: 'number', suffix: '%', min: 0, max: 100, decimals: 2, nullable: true },
    { key: 'cohumulonePct', type: 'number', suffix: '%', min: 0, max: 100, decimals: 1, nullable: true },
    { key: 'totalOil', type: 'number', suffix: ' ml/100 g', min: 0, max: 20, decimals: 2, nullable: true },
    { key: 'hsi', type: 'number', suffix: '%', min: 0, max: 100, nullable: true, fraction: true },
    { key: 'substitutes', type: 'text', wide: true },
    { key: 'notes', type: 'textarea' },
  ],
  culture: [
    { key: 'name', type: 'text', wide: true },
    { key: 'aliases', type: 'tags' },
    { key: 'producer', type: 'producer' },
    { key: 'productId', type: 'text' },
    { key: 'type', type: 'select', options: CULTURE_TYPES, enumKey: 'cultureType' },
    { key: 'form', type: 'select', options: CULTURE_FORMS, enumKey: 'cultureForm' },
    { key: 'attenuationMinPct', type: 'number', suffix: '%', min: 0, max: 100, nullable: true },
    { key: 'attenuationMaxPct', type: 'number', suffix: '%', min: 0, max: 100, nullable: true },
    { key: 'tempMinC', type: 'unit', measure: 'temperature', nullable: true },
    { key: 'tempMaxC', type: 'unit', measure: 'temperature', nullable: true },
    { key: 'flocculation', type: 'select', options: FLOCCULATION, enumKey: 'flocculation', nullable: true },
    { key: 'alcoholTolerancePct', type: 'number', suffix: '%', min: 0, max: 100, nullable: true },
    { key: 'bestFor', type: 'text', wide: true },
    { key: 'notes', type: 'textarea' },
  ],
  misc: [
    { key: 'name', type: 'text', wide: true },
    { key: 'aliases', type: 'tags' },
    { key: 'type', type: 'select', options: MISC_TYPES, enumKey: 'miscType' },
    { key: 'amountKind', type: 'select', options: AMOUNT_KINDS, enumKey: 'amountKind' },
    { key: 'producer', type: 'producer' },
    { key: 'productId', type: 'text' },
    { key: 'useFor', type: 'text', wide: true },
    { key: 'notes', type: 'textarea' },
  ],
  water: [
    { key: 'name', type: 'text', wide: true },
    { key: 'aliases', type: 'tags' },
    { key: 'role', type: 'select', options: ['source', 'target'], enumKey: 'waterRole' },
    ppm('calcium'),
    ppm('magnesium'),
    ppm('sodium'),
    ppm('sulfate'),
    ppm('chloride'),
    ppm('bicarbonate'),
    { key: 'ph', type: 'number', min: 0, max: 14, decimals: 2, nullable: true },
    { key: 'notes', type: 'textarea' },
  ],
  style: [
    { key: 'name', type: 'text', wide: true },
    { key: 'aliases', type: 'tags' },
    { key: 'guide', type: 'text' },
    { key: 'category', type: 'text' },
    { key: 'categoryNumber', type: 'text' },
    { key: 'styleLetter', type: 'text' },
    { key: 'og', type: 'range', measure: 'gravity' },
    { key: 'fg', type: 'range', measure: 'gravity' },
    { key: 'ibu', type: 'range', decimals: 0 },
    { key: 'colorEbc', type: 'range', measure: 'color' },
    { key: 'abvPct', type: 'range', suffix: '%', decimals: 1 },
    { key: 'carbVols', type: 'range', measure: 'carbonation' },
    { key: 'notes', type: 'textarea' },
    { key: 'profile', type: 'textarea' },
    { key: 'ingredients', type: 'textarea' },
    { key: 'examples', type: 'textarea' },
  ],
};

type AnyData = Record<string, unknown>;

/** Nothing to show: an empty text, list or range, or an unknown number. */
const isEmpty = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.every((x) => x == null));

/** The values of a library item that are set, as text (built-in items, which can't be edited). */
export function LibraryDetails<K extends LibraryKind>({ kind, value }: { kind: K; value: LibraryDataMap[K] }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const range = useFormatRange();
  const data = value as unknown as AnyData;

  const shown = (f: Field): ReactNode => {
    const v = data[f.key];
    switch (f.type) {
      case 'tags':
        return (
          <Group gap={6}>
            {(v as string[]).map((a) => (
              <Badge key={a} variant="light" color="gray" style={{ textTransform: 'none' }}>
                {a}
              </Badge>
            ))}
          </Group>
        );
      case 'select':
        return t(`enums.${f.enumKey}.${String(v)}`);
      case 'unit':
        return fmt(v as number, f.measure);
      case 'number': {
        const n = (v as number) * (f.fraction ? 100 : 1);
        return `${fmt.num(n, f.decimals ?? 1, 0)}${f.suffix ?? ''}`;
      }
      case 'range': {
        const r = v as Range;
        if (f.measure) return range(r, f.measure, f.decimals);
        const part = (x: number | null) => (x == null ? '–' : fmt.num(x, f.decimals ?? 1, 0));
        return `${part(r[0])}–${part(r[1])}${f.suffix ?? ''}`;
      }
      case 'bool':
        return t(v ? 'common.yes' : 'common.no');
      default:
        return String(v);
    }
  };

  // The name is the drawer's title.
  const fields = LIBRARY_FIELDS[kind].filter((f) => f.key !== 'name' && !isEmpty(data[f.key]));
  return (
    <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="md" verticalSpacing="sm">
      {fields.map((f) => {
        const wide = f.type === 'textarea' || f.type === 'tags' || (f.type === 'text' && f.wide);
        return (
          <Stack key={f.key} gap={2} style={wide ? { gridColumn: '1 / -1' } : undefined}>
            <Text size="xs" c="dimmed">
              {t(`fields.${f.key}`)}
            </Text>
            <Text size="sm" component="div" style={f.type === 'textarea' ? { whiteSpace: 'pre-wrap' } : undefined}>
              {shown(f)}
            </Text>
          </Stack>
        );
      })}
    </SimpleGrid>
  );
}

/**
 * Form for a library item of any kind, driven by LIBRARY_FIELDS. With `readOnly` (built-in
 * items) it shows the values as text instead.
 */
export function LibraryForm<K extends LibraryKind>({
  kind,
  value,
  onChange,
  readOnly = false,
}: {
  kind: K;
  value: LibraryDataMap[K];
  onChange: (v: LibraryDataMap[K]) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  if (readOnly) return <LibraryDetails kind={kind} value={value} />;
  const data = value as unknown as AnyData;
  const set = (key: string, v: unknown) => onChange({ ...data, [key]: v } as unknown as LibraryDataMap[K]);
  const label = (key: string) => t(`fields.${key}`);

  const render = (f: Field) => {
    const v = data[f.key];
    switch (f.type) {
      case 'text':
        return <TextInput key={f.key} label={label(f.key)} value={(v as string) ?? ''} onChange={(e) => set(f.key, e.currentTarget.value)} required={f.key === 'name'} style={f.wide ? { gridColumn: '1 / -1' } : undefined} />;
      case 'tags':
        return (
          <TagsInput
            key={f.key}
            label={label(f.key)}
            description={t('library.aliasesHint')}
            value={(v as string[] | undefined) ?? []}
            onChange={(x) => set(f.key, x)}
            maxTags={20}
            clearable
            style={{ gridColumn: '1 / -1' }}
          />
        );
      case 'producer':
        return <ProducerInput key={f.key} kind={kind} value={(v as string) ?? ''} onChange={(x) => set(f.key, x)} />;
      case 'origin':
        return <OriginInput key={f.key} kind={kind} value={(v as string) ?? ''} onChange={(x) => set(f.key, x)} />;
      case 'textarea':
        return <Textarea key={f.key} label={label(f.key)} value={(v as string) ?? ''} autosize minRows={2} maxRows={10} onChange={(e) => set(f.key, e.currentTarget.value)} style={{ gridColumn: '1 / -1' }} />;
      case 'select':
        return (
          <NativeSelect
            key={f.key}
            label={label(f.key)}
            value={(v as string | null) ?? ''}
            data={[...(f.nullable ? [{ value: '', label: '–' }] : []), ...f.options.map((o) => ({ value: o, label: t(`enums.${f.enumKey}.${o}`) }))]}
            onChange={(e) => set(f.key, e.currentTarget.value === '' ? null : e.currentTarget.value)}
          />
        );
      case 'unit':
        return <UnitInput key={f.key} label={label(f.key)} measure={f.measure} value={(v as number | null) ?? null} nullable={f.nullable} onChange={(x) => set(f.key, x ?? (f.nullable ? null : 0))} />;
      case 'number': {
        const scale = f.fraction ? 100 : 1;
        const shown = v == null ? '' : Math.round((v as number) * scale * 10000) / 10000;
        return (
          <NumberInput
            key={f.key}
            label={label(f.key)}
            value={shown}
            suffix={f.suffix}
            min={f.min}
            max={f.max}
            decimalScale={f.decimals ?? 1}
            allowDecimal
            onChange={(x) => set(f.key, x === '' ? (f.nullable ? null : 0) : Number(x) / scale)}
          />
        );
      }
      case 'range': {
        const r = (v as Range | undefined) ?? [null, null];
        const part = (i: 0 | 1) =>
          f.measure ? (
            <UnitInput
              measure={f.measure}
              value={r[i]}
              nullable
              aria-label={`${label(f.key)} ${i === 0 ? t('common.min') : t('common.max')}`}
              onChange={(x) => set(f.key, i === 0 ? [x, r[1]] : [r[0], x])}
            />
          ) : (
            <NumberInput
              value={r[i] ?? ''}
              suffix={f.suffix}
              decimalScale={f.decimals ?? 1}
              aria-label={`${label(f.key)} ${i === 0 ? t('common.min') : t('common.max')}`}
              onChange={(x) => set(f.key, i === 0 ? [x === '' ? null : Number(x), r[1]] : [r[0], x === '' ? null : Number(x)])}
            />
          );
        return (
          <Stack key={f.key} gap={4}>
            <Text size="sm" fw={500}>
              {label(f.key)}
            </Text>
            <Group gap={6} wrap="nowrap" grow>
              {part(0)}
              {part(1)}
            </Group>
          </Stack>
        );
      }
      case 'bool':
        return <Switch key={f.key} label={label(f.key)} checked={Boolean(v)} onChange={(e) => set(f.key, e.currentTarget.checked)} mt={28} />;
    }
  };

  return (
    <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm" verticalSpacing="sm">
      {LIBRARY_FIELDS[kind].map(render)}
    </SimpleGrid>
  );
}
