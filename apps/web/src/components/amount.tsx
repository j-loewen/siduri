import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NativeSelect, NumberInput, Text, TextInput, type MantineSize } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { findUnit, MEASURES, preferredUnit, UNITS, type AmountKind, type Measure, type UnitDef } from '@brew/shared';
import { UnitInput, useFormat, useUnitPrefs } from '../units';

export type AmountOf = 'fermentable' | 'hop' | 'culture' | 'misc' | 'water';

/** The unit preference an amount is shown in: grain in kg, hops in g, water in L, … */
export function amountMeasure(kind: AmountOf, amountKind: AmountKind): Measure | null {
  if (amountKind === 'count') return null;
  if (amountKind === 'volume') return kind === 'water' ? 'volume' : 'volumeSmall';
  return kind === 'fermentable' ? 'massLarge' : 'massSmall';
}

/** "4.5 kg", "30 g", "2 ×". */
export function useAmountFormat() {
  const { t } = useTranslation();
  const fmt = useFormat();
  return (amount: number, kind: AmountOf, amountKind: AmountKind) => {
    const measure = amountMeasure(kind, amountKind);
    if (!measure) return t('amount.count', { n: fmt.num(amount, 2, 0) });
    return fmt(amount, measure, measure === 'massSmall' || measure === 'volumeSmall' ? 1 : undefined);
  };
}

/** Amount input for any ingredient: a unit field, or a plain number for counts. */
export function AmountField({
  kind,
  amountKind,
  value,
  onChange,
  label,
  w,
  size,
  nullable,
  allowNegative,
  onUnitChange,
  unitId,
}: {
  kind: AmountOf;
  amountKind: AmountKind;
  value: number | null;
  onChange: (v: number | null) => void;
  label?: ReactNode;
  w?: number | string;
  size?: MantineSize;
  nullable?: boolean;
  allowNegative?: boolean;
  onUnitChange?: (unitId: string) => void;
  /** Show this unit (e.g. the amount field's). */
  unitId?: string;
}) {
  const { t } = useTranslation();
  const measure = amountMeasure(kind, amountKind);
  if (!measure) {
    return (
      <NumberInput
        label={label}
        value={value ?? ''}
        onChange={(v) => onChange(v === '' ? (nullable ? null : 0) : Number(v))}
        suffix={` ${t('amount.pcs')}`}
        min={allowNegative ? undefined : 0}
        decimalScale={2}
        w={w}
        size={size}
      />
    );
  }
  return <UnitInput key={measure} measure={measure} label={label} value={value} onChange={(v) => onChange(v ?? (nullable ? null : 0))} nullable={nullable} min={allowNegative ? undefined : 0} w={w} size={size} onUnitChange={onUnitChange} unitId={unitId} />;
}

/** "12,5" → 12.5; null when empty or not a number. */
const parseNumber = (text: string) => {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * Price per unit of an ingredient. Stored per kg, L or piece (canonical); shown and typed per the
 * unit picked here — which follows the amount field's unit when `unitId` is given.
 */
export function PriceField({
  kind,
  amountKind,
  value,
  onChange,
  unitId,
  label,
  w,
}: {
  kind: AmountOf;
  amountKind: AmountKind;
  /** Price per canonical unit (kg, L or piece). */
  value: number | null;
  onChange: (pricePerCanonical: number | null) => void;
  /** Unit to show the price per (e.g. the one the amount was entered in). */
  unitId?: string;
  label?: ReactNode;
  w?: number | string;
}) {
  const { t } = useTranslation();
  const prefs = useUnitPrefs();
  const measure = amountMeasure(kind, amountKind);
  const dimension = measure ? MEASURES[measure] : null;
  const [unit, setUnit] = useState<UnitDef | null>(() => (measure ? preferredUnit(prefs, measure) : null));
  // Follow the amount field's unit, and reset when the kind of amount changes.
  useEffect(() => {
    if (!dimension || !measure) return setUnit(null);
    setUnit(findUnit(dimension, unitId ?? '') ?? preferredUnit(prefs, measure));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId, dimension, measure]);

  /** Canonical units in one shown unit: 0.4536 kg per lb. */
  const per = unit ? unit.toCanonical(1) : 1;
  const show = (v: number | null) => (v == null ? '' : String(Math.round(v * per * 10000) / 10000));
  const [text, setText] = useState(() => show(value));
  const emitted = useRef(value);
  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setText(show(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  // Another unit: show the same price per the new unit.
  useEffect(() => {
    setText(show(emitted.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [per]);

  const change = (next: string) => {
    setText(next);
    const n = parseNumber(next);
    const canonical = n == null ? null : Math.max(0, n) / per;
    emitted.current = canonical;
    onChange(canonical);
  };

  const units = dimension ? UNITS[dimension] : [];
  return (
    <TextInput
      label={label}
      w={w}
      value={text}
      onChange={(e) => change(e.currentTarget.value)}
      inputMode="decimal"
      autoComplete="off"
      error={text.trim() !== '' && parseNumber(text) == null}
      rightSectionWidth={unit ? 86 : 70}
      rightSectionPointerEvents="all"
      rightSection={
        unit ? (
          <NativeSelect
            aria-label={t('amount.priceUnit')}
            data={units.map((u) => ({ value: u.id, label: t('amount.perUnit', { unit: u.symbol }) }))}
            value={unit.id}
            onChange={(e) => setUnit(findUnit(dimension!, e.currentTarget.value) ?? unit)}
            variant="unstyled"
            size="xs"
            tabIndex={-1}
            rightSection={<></>}
            rightSectionWidth={0}
            className="unit-picker"
            styles={{ input: { paddingLeft: 4, paddingRight: 8, fontWeight: 500, textAlign: 'right', cursor: 'pointer' } }}
          />
        ) : (
          <Text size="xs" c="dimmed" pr={8}>
            {t('amount.perPiece')}
          </Text>
        )
      }
    />
  );
}
