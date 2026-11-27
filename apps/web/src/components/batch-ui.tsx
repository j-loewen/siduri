import { Badge, type MantineColor } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { BatchStatus, ScheduleEventDto } from '@brew/shared';
import { useFormat } from '../units';

export const STATUS_COLOR: Record<BatchStatus, MantineColor> = {
  planned: 'gray',
  brewing: 'orange',
  fermenting: 'yellow',
  conditioning: 'teal',
  packaged: 'blue',
  completed: 'dark',
};

export function StatusBadge({ status, size = 'sm' }: { status: BatchStatus; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  const { t } = useTranslation();
  return (
    <Badge color={STATUS_COLOR[status]} variant="light" size={size}>
      {t(`batches.status.${status}`)}
    </Badge>
  );
}

/** Tabs of the batch page: an overview, the batch's recipe, one per phase, and the log. */
export const BATCH_TABS = ['overview', 'recipe', 'planning', 'brewing', 'fermentation', 'conditioning', 'log'] as const;
export type BatchTab = (typeof BATCH_TABS)[number];

const PHASE_TAB: Record<BatchStatus, BatchTab> = {
  planned: 'planning',
  brewing: 'brewing',
  fermenting: 'fermentation',
  conditioning: 'conditioning',
  packaged: 'conditioning',
  completed: 'overview',
};

/** The tab a batch opens on: the one for what is going on with it now. */
export const phaseTab = (status: BatchStatus): BatchTab => PHASE_TAB[status];

const DAY = 24 * 3600 * 1000;

/** Day of fermentation (0 on brew day), or null before it started. */
export function fermentationDay(start: string | null, now = Date.now()): number | null {
  if (!start) return null;
  return Math.max(0, Math.floor((now - Date.parse(start)) / DAY));
}

/** Calendar date of a fermentation day. */
export const dayDate = (start: string, day: number) => new Date(Date.parse(start) + day * DAY);

/** Next planned events from today on (the current temperature step included). */
export function upcomingEvents(schedule: ScheduleEventDto[], day: number | null, limit = 3): ScheduleEventDto[] {
  if (day == null) return schedule.slice(0, limit);
  const current = [...schedule].filter((e) => e.kind === 'step' && e.day <= day).at(-1);
  const next = schedule.filter((e) => e.day > day || (e.day === day && e.kind !== 'step'));
  return [...(current ? [current] : []), ...next].slice(0, limit);
}

/** "Dry hop: Citra 50 g" etc. */
export function useEventLabel() {
  const { t } = useTranslation();
  const fmt = useFormat();
  return (e: ScheduleEventDto) => {
    const amount =
      e.amount == null ? '' : e.amountKind === 'count' ? ` ${fmt.num(e.amount, 1)}` : ` ${fmt(e.amount, e.amountKind === 'volume' ? 'volumeSmall' : 'massSmall', 0)}`;
    if (e.kind === 'step') return t('batches.events.step', { name: e.name, temp: e.tempC != null ? fmt(e.tempC, 'temperature', 0) : '' });
    return t(`batches.events.${e.kind}`, { name: e.name, amount });
  };
}

/** Formats an ISO date (or Date) as a short local date. */
export function useDateFormat() {
  const { i18n } = useTranslation();
  const date = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });
  const dateTime = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' });
  return {
    date: (d: string | Date) => date.format(typeof d === 'string' ? new Date(d.length === 10 ? `${d}T12:00:00` : d) : d),
    dateTime: (d: string | Date) => dateTime.format(typeof d === 'string' ? new Date(d) : d),
    weekday: (d: Date) => weekday.format(d),
  };
}
