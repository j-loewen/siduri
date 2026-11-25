import type { ReactNode } from 'react';
import { Group, Paper, SimpleGrid, Stack, Text, Title, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { beerColorHex, type RecipeCalc } from '@brew/brewcalc';
import type { Measure, Range, RecipeStyle } from '@brew/shared';
import { useFormat, useFormatRange } from '../units';

export function ColorSwatch({ ebc, size = 16 }: { ebc: number; size?: number }) {
  return <span className="color-swatch" style={{ width: size, height: size, background: beerColorHex(ebc) }} aria-hidden="true" />;
}

/** Where a value sits in a style range: a green band for the range, a marker for the value. */
export function RangeBar({ value, range }: { value: number; range: Range }) {
  const [lo, hi] = range;
  if (lo == null || hi == null || hi <= lo) return <div className="range-bar" style={{ opacity: 0.4 }} />;
  // Show the range in the middle half of the bar, with room either side for values outside it.
  const span = hi - lo;
  const min = lo - span / 2;
  const max = hi + span / 2;
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100))}%`;
  const out = value < lo || value > hi;
  return (
    <div className="range-bar">
      <div className="range-bar-band" style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` }} />
      <div className="range-bar-marker" data-out={out || undefined} style={{ left: pos(value) }} />
    </div>
  );
}

/**
 * The recipe's key numbers. Range bars compare against the style; values are converted to the
 * user's units for display, while ranges compare canonical values.
 */
export function StatsBar({ calc, style }: { calc: RecipeCalc; style: RecipeStyle | null }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const tile = (label: string, canonical: number, measure: Measure | null, range: Range | undefined, decimals?: number, extra?: ReactNode) => {
    const shown = measure ? fmt.value(canonical, measure, decimals) : fmt.num(canonical, decimals ?? 1);
    return (
      <Stack gap={0} className="stat-tile">
        <Text size="xs" c="dimmed" fw={600} tt="uppercase" style={{ letterSpacing: '0.04em' }}>
          {label}
        </Text>
        <Group gap={6} wrap="nowrap">
          {extra}
          <Text fw={700} fz="lg" className="tabular" truncate>
            {shown}
            {measure && (
              <Text span size="xs" c="dimmed" fw={500}>
                {' '}
                {fmt.unit(measure).symbol}
              </Text>
            )}
          </Text>
        </Group>
        {style && range && <RangeTip canonical={canonical} range={range} measure={measure} />}
      </Stack>
    );
  };
  return (
    <div className="stats-bar">
      <SimpleGrid cols={{ base: 3, sm: 6 }} spacing="sm" verticalSpacing={6}>
        {tile(t('stats.og'), calc.og, 'gravity', style?.og)}
        {tile(t('stats.fg'), calc.fg, 'gravity', style?.fg)}
        {tile(t('stats.abv'), calc.abvPct, null, style?.abvPct, 1)}
        {tile(t('stats.ibu'), calc.ibu, null, style?.ibu, 0)}
        {tile(t('stats.color'), calc.colorEbc, 'color', style?.colorEbc, 0, <ColorSwatch ebc={calc.colorEbc} size={18} />)}
        {tile(t('stats.buGu'), calc.buGu, null, undefined, 2)}
      </SimpleGrid>
    </div>
  );
}

function RangeTip({ canonical, range, measure }: { canonical: number; range: Range; measure: Measure | null }) {
  const formatRange = useFormatRange();
  const fmt = useFormat();
  const label = measure ? formatRange(range, measure) : `${fmt.num(range[0] ?? 0, 1)}–${fmt.num(range[1] ?? 0, 1)}`;
  return (
    <Tooltip label={label} disabled={range[0] == null && range[1] == null}>
      <div>
        <RangeBar value={canonical} range={range} />
      </div>
    </Tooltip>
  );
}

/** Page title with actions on the right; wraps on phones. */
export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <Group justify="space-between" align="flex-start" mb="md" gap="sm">
      <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
        <Title order={2}>{title}</Title>
        {subtitle && (
          <Text c="dimmed" size="sm">
            {subtitle}
          </Text>
        )}
      </Stack>
      {actions && <Group gap="xs">{actions}</Group>}
    </Group>
  );
}

/** A titled section of a page. */
export function Section({ title, actions, children, description }: { title: ReactNode; actions?: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <Paper withBorder p={{ base: 'sm', sm: 'md' }} radius="md">
      <Group justify="space-between" mb="sm" gap="xs">
        <Stack gap={0}>
          <Title order={4}>{title}</Title>
          {description && (
            <Text size="xs" c="dimmed">
              {description}
            </Text>
          )}
        </Stack>
        {actions && <Group gap="xs">{actions}</Group>}
      </Group>
      {children}
    </Paper>
  );
}
