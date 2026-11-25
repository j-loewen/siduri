import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { NativeSelect, TextInput, type MantineSize } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import {
  findUnit,
  MEASURES,
  METRIC_UNITS,
  parseQuantity,
  preferredUnit,
  readableQuantity,
  readableUnitId,
  UNITS,
  type Measure,
  type UnitDef,
  type UnitPrefs,
} from '@brew/shared';
import { useMe } from './auth';

/** The signed-in user's preferred units (metric until loaded). */
export function useUnitPrefs(): UnitPrefs {
  const { data: me } = useMe();
  return me?.prefs.units ?? METRIC_UNITS;
}

/** Number formatting in the UI language. */
export function useNumberFormat() {
  const { i18n } = useTranslation();
  return useMemo(() => {
    const cache = new Map<string, Intl.NumberFormat>();
    return (value: number, decimals: number, minDecimals = decimals) => {
      const key = `${decimals}:${minDecimals}`;
      let f = cache.get(key);
      if (!f) {
        f = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: decimals, minimumFractionDigits: minDecimals });
        cache.set(key, f);
      }
      return f.format(value);
    };
  }, [i18n.language]);
}

/**
 * Formats canonical values in the user's preferred unit: `fmt(4.5, 'massLarge')` → "4.5 kg".
 * `fmt.value` gives just the number, `fmt.unit` the unit for a measure.
 */
export function useFormat() {
  const prefs = useUnitPrefs();
  const num = useNumberFormat();
  return useMemo(() => {
    const unit = (measure: Measure) => preferredUnit(prefs, measure);
    const value = (v: number | null | undefined, measure: Measure, decimals?: number) => {
      if (v == null || !Number.isFinite(v)) return '–';
      const u = unit(measure);
      const d = decimals ?? u.decimals;
      return num(u.fromCanonical(v), d, measure === 'gravity' && u.id === 'sg' ? d : 0);
    };
    const fmt = (v: number | null | undefined, measure: Measure, decimals?: number) => {
      if (v == null || !Number.isFinite(v)) return '–';
      // Weights and volumes read best in the fitting unit: "600 g", "3 oz", "11 lb 6 oz", "250 ml", "2 qt".
      const u = unit(measure);
      const parts = readableQuantity(MEASURES[measure], v, u.id);
      if (parts && (parts.length > 1 || parts[0]!.unit.id !== u.id)) return parts.map((p) => `${num(p.value, p.decimals, 0)} ${p.unit.symbol}`).join(' ');
      return `${value(v, measure, decimals)} ${u.symbol}`;
    };
    return Object.assign(fmt, { value, unit, num });
  }, [prefs, num]);
}

/** Range in the preferred unit: "1.044–1.050 SG". */
export function useFormatRange() {
  const fmt = useFormat();
  return (range: [number | null, number | null], measure: Measure, decimals?: number) => {
    const [lo, hi] = range;
    if (lo == null && hi == null) return '–';
    return `${fmt.value(lo, measure, decimals)}–${fmt.value(hi, measure, decimals)} ${fmt.unit(measure).symbol}`;
  };
}

export interface UnitInputProps {
  /** Kind of value: decides the dimension and the default unit (from the user's settings). */
  measure: Measure;
  /** Canonical value (kg, L, °C, SG, EBC, …). */
  value: number | null;
  onChange: (value: number | null) => void;
  label?: ReactNode;
  description?: ReactNode;
  placeholder?: string;
  /** Canonical bounds. */
  min?: number;
  max?: number;
  /** Allow clearing the field (value null); otherwise an empty field keeps the last value. */
  nullable?: boolean;
  size?: MantineSize;
  w?: CSSProperties['width'];
  disabled?: boolean;
  /** Extra decimals beyond the unit's default (e.g. hop weights in g). */
  decimals?: number;
  'aria-label'?: string;
  /** Show the unit as plain text instead of a dropdown (e.g. in narrow tables). */
  fixedUnit?: boolean;
  /** Told the unit the field shows (on start and whenever it changes). */
  onUnitChange?: (unitId: string) => void;
  /** Show this unit (e.g. the one another field was filled in); can still be switched by hand. */
  unitId?: string;
}

/** The unit a field opens in: the preferred one, or for small weights and volumes the smaller one. */
function openingUnit(prefs: UnitPrefs, measure: Measure, value: number | null): UnitDef {
  const preferred = preferredUnit(prefs, measure);
  const dimension = MEASURES[measure];
  return findUnit(dimension, readableUnitId(dimension, value, preferred.id)) ?? preferred;
}

/** Decimals shown while editing: at least two, more where the unit needs them (kg, SG). */
const inputDecimals = (unit: UnitDef) => (unit.id === 'sg' ? 3 : Math.max(unit.decimals, 2));

function toText(value: number | null, unit: UnitDef, decimals: number) {
  if (value == null || !Number.isFinite(value)) return '';
  const f = 10 ** decimals;
  return String(Math.round(unit.fromCanonical(value) * f) / f);
}

/**
 * A number field with its own unit picker. Shows the value in the user's preferred unit; the
 * unit can be switched right in the field, or by typing it ("5 lb", "12 °P", "68 F").
 */
export function UnitInput({
  measure,
  value,
  onChange,
  label,
  description,
  placeholder,
  min,
  max,
  nullable,
  size = 'sm',
  w,
  disabled,
  decimals,
  fixedUnit,
  onUnitChange,
  unitId,
  ...rest
}: UnitInputProps) {
  const prefs = useUnitPrefs();
  const dimension = MEASURES[measure];
  // Small weights open in the smaller unit (3 oz rather than 0.19 lb); the unit can still be switched.
  const [unit, setUnit] = useState<UnitDef>(() => openingUnit(prefs, measure, value));
  const digits = decimals ?? inputDecimals(unit);
  const [text, setText] = useState(() => toText(value, unit, digits));
  const [error, setError] = useState(false);
  // The value this field last reported: when the prop differs, it was changed from outside.
  const emitted = useRef(value);

  // Preferred unit changed in the settings (not on mount: the field may have opened in a smaller unit).
  const prefId = prefs[measure];
  const shownPref = useRef(prefId);
  useEffect(() => {
    if (shownPref.current === prefId) return;
    shownPref.current = prefId;
    const next = preferredUnit(prefs, measure);
    setUnit(next);
    setText(toText(emitted.current, next, decimals ?? inputDecimals(next)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefId]);

  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setText(toText(value, unit, digits));
      setError(false);
    }
  }, [value, unit, digits]);

  const emit = (canonical: number | null) => {
    emitted.current = canonical;
    onChange(canonical);
  };

  const handleText = (next: string) => {
    setText(next);
    if (next.trim() === '') {
      setError(false);
      if (nullable) emit(null);
      return;
    }
    const parsed = parseQuantity(dimension, next);
    if (!parsed) {
      setError(true);
      return;
    }
    const u = parsed.unit ?? unit;
    let canonical = u.toCanonical(parsed.value);
    if (min !== undefined) canonical = Math.max(min, canonical);
    if (max !== undefined) canonical = Math.min(max, canonical);
    setError(false);
    emit(canonical);
  };

  const finish = () => {
    // A typed unit ("5 lb") switches the field to that unit; then show the number cleanly.
    const parsed = text.trim() ? parseQuantity(dimension, text) : null;
    const u = parsed?.unit ?? unit;
    if (u.id !== unit.id) setUnit(u);
    setText(toText(emitted.current, u, decimals ?? inputDecimals(u)));
    setError(false);
  };

  // Follow a unit chosen elsewhere.
  useEffect(() => {
    const next = unitId ? findUnit(dimension, unitId) : undefined;
    if (!next) return;
    setUnit(next);
    setText(toText(emitted.current, next, decimals ?? inputDecimals(next)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId, dimension]);

  const unitChanged = useRef(onUnitChange);
  unitChanged.current = onUnitChange;
  useEffect(() => unitChanged.current?.(unit.id), [unit.id]);

  const switchUnit = (id: string) => {
    const next = findUnit(dimension, id);
    if (!next) return;
    setUnit(next);
    setText(toText(emitted.current, next, decimals ?? inputDecimals(next)));
  };

  const options = UNITS[dimension];
  const unitPicker = fixedUnit ? (
    <span style={{ fontSize: 'var(--mantine-font-size-xs)', color: 'var(--mantine-color-dimmed)', paddingRight: 6 }}>{unit.symbol}</span>
  ) : (
    <NativeSelect
      aria-label={typeof label === 'string' ? `${label} unit` : 'Unit'}
      data={options.map((u) => ({ value: u.id, label: u.symbol }))}
      value={unit.id}
      onChange={(e) => switchUnit(e.currentTarget.value)}
      variant="unstyled"
      size={size === 'lg' || size === 'xl' ? 'md' : 'xs'}
      disabled={disabled}
      tabIndex={-1}
      // No chevron: the unit itself is the button (dotted underline shows it can be changed).
      rightSection={<></>}
      rightSectionWidth={0}
      className="unit-picker"
      styles={{ input: { paddingLeft: 4, paddingRight: 8, fontWeight: 500, textAlign: 'right', cursor: 'pointer' } }}
    />
  );

  return (
    <TextInput
      label={label}
      description={description}
      placeholder={placeholder}
      value={text}
      onChange={(e) => handleText(e.currentTarget.value)}
      onBlur={finish}
      onKeyDown={(e) => e.key === 'Enter' && finish()}
      inputMode="decimal"
      autoComplete="off"
      error={error}
      size={size}
      w={w}
      disabled={disabled}
      rightSection={unitPicker}
      rightSectionWidth={fixedUnit ? 44 : unit.symbol.length > 4 ? 76 : 54}
      rightSectionPointerEvents="all"
      aria-label={rest['aria-label']}
      styles={{ input: { fontVariantNumeric: 'tabular-nums' } }}
    />
  );
}
