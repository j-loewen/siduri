import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate } from '@tanstack/react-router';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Checkbox,
  Drawer,
  Group,
  Loader,
  NavLink,
  NumberInput,
  Paper,
  Progress,
  RingProgress,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconArrowLeft,
  IconBell,
  IconBellOff,
  IconBulb,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconFlag,
  IconListNumbers,
  IconMinus,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconRotate,
  IconSun,
} from '@tabler/icons-react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  brewDaySteps,
  calculateRecipe,
  gravityCorrection,
  measuredEfficiency,
  type BrewDayItem,
  type BrewDayMeasure,
  type BrewDayStep,
  type RecipeCalc,
} from '@brew/brewcalc';
import { DEFAULT_EQUIPMENT, timerElapsed, type BrewDayAction } from '@brew/shared';
import { useMe } from '../auth';
import { useBatch, useBrewDayAction, type LoadedBatch } from '../data';
import { useLiveUpdates } from '../live';
import { audioReady, beep, requestNotifications, systemNotify, unlockAudio, useNow, useWakeLock, vibrate } from '../lib/alerts';
import { notifyError } from '../lib/notify';
import { useMeasuredSaver, type MeasuredSaver } from '../lib/useMeasuredSaver';
import { brewdayRoute } from '../router';
import { UnitInput, useFormat } from '../units';
import { ThemeToggle } from '../components/ThemeControls';
import { BatchInventoryPanel } from '../components/BatchInventoryPanel';

/** Full-screen brew day for one batch: big controls, timers on the server clock, alerts. */
export function BrewDayPage() {
  const { batchId } = brewdayRoute.useParams();
  const { t } = useTranslation();
  const me = useMe();
  // This page is outside the app layout, so it keeps its own live connection (other devices).
  useLiveUpdates(Boolean(me.data));
  const batch = useBatch(batchId);
  if (me.isPending || batch.isPending) {
    return (
      <Center mih="100dvh">
        <Loader />
      </Center>
    );
  }
  if (!me.data) return <Navigate to="/login" />;
  if (!batch.data) {
    return (
      <Center mih="100dvh">
        <Text>{t('batches.notFound')}</Text>
      </Center>
    );
  }
  return <BrewDay batch={batch.data} />;
}

function BrewDay({ batch }: { batch: LoadedBatch }) {
  const { t } = useTranslation();
  const calc = useMemo(() => calculateRecipe(batch.doc), [batch.doc]);
  const steps = useMemo(() => brewDaySteps(batch.doc, calc), [batch.doc, calc]);
  const act = useBrewDayAction(batch.id);
  // Lives here, not in the step: values typed just before tapping Next must still be saved.
  const measured = useMeasuredSaver(batch.id);
  const now = useNow(500) + batch.clockOffset;
  const state = batch.brewday;
  const started = Boolean(state.startedAt);
  const finished = Boolean(state.finishedAt);
  const wake = useWakeLock(started && !finished);
  const [sound, setSound] = useState(audioReady());
  const desktop = useMediaQuery('(min-width: 62em)') ?? true;
  const [stepsOpen, setStepsOpen] = useState(false);
  const dispatch = (a: BrewDayAction) => act.mutate(a, { onError: notifyError });

  const index = Math.max(0, steps.findIndex((s) => s.id === state.stepId));
  const step = steps[index]!;
  useStepAlerts(batch, steps, now, sound);

  const enableAlerts = () => {
    unlockAudio();
    void requestNotifications();
    setSound(true);
  };
  const goto = (i: number) => {
    const target = steps[Math.min(steps.length - 1, Math.max(0, i))]!;
    dispatch({ type: 'goto', stepId: target.id });
    setStepsOpen(false);
  };

  const stepList = (
    <Stack gap={2}>
      {steps.map((s, i) => {
        const tm = state.timers[s.id];
        return (
          <NavLink
            key={s.id}
            active={i === index}
            onClick={() => goto(i)}
            label={stepTitle(t, s)}
            leftSection={
              <ThemeIcon size={24} radius="xl" variant={i < index ? 'filled' : 'light'} color={i < index ? 'green' : undefined}>
                {i < index ? <IconCheck size={14} /> : <Text size="xs" fw={700}>{i + 1}</Text>}
              </ThemeIcon>
            }
            rightSection={tm?.startedAt != null ? <IconClock size={16} color="var(--mantine-primary-color-filled)" /> : undefined}
            py={8}
          />
        );
      })}
    </Stack>
  );

  return (
    <Box className="brewday">
      <header className="brewday-header">
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
          <ActionIcon variant="subtle" size="xl" aria-label={t('brewday.back')} renderRoot={(props) => <Link {...props} to="/batches/$batchId" params={{ batchId: batch.id }} />}>
            <IconArrowLeft size={24} />
          </ActionIcon>
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Text fw={700} truncate>
              #{batch.number} {batch.name}
            </Text>
            {started && (
              <Text size="xs" c="dimmed">
                {t('brewday.stepOf', { n: index + 1, total: steps.length })}
              </Text>
            )}
          </Stack>
        </Group>
        <Group gap={6} wrap="nowrap">
          {started && !finished && (
            <Tooltip label={wake ? t('brewday.screenOn') : t('brewday.screenOff')}>
              <ThemeIcon variant="light" color={wake ? 'yellow' : 'gray'} size="lg">
                <IconSun size={18} />
              </ThemeIcon>
            </Tooltip>
          )}
          <Tooltip label={sound ? t('brewday.alertsOn') : t('brewday.alertsOff')}>
            <ActionIcon variant={sound ? 'light' : 'default'} size="lg" onClick={enableAlerts} aria-label={t('brewday.enableAlerts')}>
              {sound ? <IconBell size={18} /> : <IconBellOff size={18} />}
            </ActionIcon>
          </Tooltip>
          <ThemeToggle />
          {started && !desktop && (
            <ActionIcon variant="default" size="lg" onClick={() => setStepsOpen(true)} aria-label={t('brewday.allSteps')}>
              <IconListNumbers size={18} />
            </ActionIcon>
          )}
        </Group>
      </header>

      {!started ? (
        <Intro batch={batch} calc={calc} onStart={() => {
          enableAlerts();
          dispatch({ type: 'start' });
          dispatch({ type: 'goto', stepId: steps[0]!.id });
        }} pending={act.isPending} />
      ) : finished ? (
        <Finished batch={batch} onReopen={() => dispatch({ type: 'reopen' })} />
      ) : (
        <>
          <Progress value={((index + 1) / steps.length) * 100} size="sm" radius={0} />
          <div className="brewday-body">
            {desktop && (
              <ScrollArea className="brewday-steps" type="auto">
                {stepList}
              </ScrollArea>
            )}
            <ScrollArea className="brewday-main" type="auto">
              <StepView key={step.id} batch={batch} calc={calc} step={step} now={now} dispatch={dispatch} measured={measured} />
            </ScrollArea>
          </div>
          <footer className="brewday-footer">
            <Button size="xl" variant="default" leftSection={<IconChevronLeft />} disabled={index === 0} onClick={() => goto(index - 1)} className="brewday-nav">
              {t('brewday.prev')}
            </Button>
            {index < steps.length - 1 ? (
              <Button size="xl" rightSection={<IconChevronRight />} onClick={() => goto(index + 1)} className="brewday-nav">
                {t('brewday.next')}
              </Button>
            ) : (
              <Button size="xl" color="green" rightSection={<IconFlag />} onClick={async () => {
                  // The OG typed in the last steps must be saved before the brew day closes.
                  await measured.flush();
                  dispatch({ type: 'finish' });
                }} loading={act.isPending} className="brewday-nav">
                {t('brewday.finish')}
              </Button>
            )}
          </footer>
          <Drawer opened={stepsOpen} onClose={() => setStepsOpen(false)} title={t('brewday.allSteps')} position="bottom" size="75%">
            {stepList}
          </Drawer>
        </>
      )}
    </Box>
  );
}

// ---- Steps -------------------------------------------------------------------------------------------------

type T = TFunction;

function stepTitle(t: T, s: BrewDayStep) {
  return s.kind === 'mashStep' && s.name ? s.name : t(`brewday.steps.${s.kind}.title`);
}

function StepView({ batch, calc, step, now, dispatch, measured }: { batch: LoadedBatch; calc: RecipeCalc; step: BrewDayStep; now: number; dispatch: (a: BrewDayAction) => void; measured: MeasuredSaver }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const checked = new Set(batch.brewday.checked);
  const timer = batch.brewday.timers[step.id];
  const remainingMs = step.timerMin != null ? step.timerMin * 60_000 - timerElapsed(timer, now) : null;
  const text = t(`brewday.steps.${step.kind}.text`, {
    volume: step.volumeL != null ? fmt(step.volumeL, 'volume', 1) : '',
    temp: step.tempC != null ? fmt(step.tempC, 'temperature', 1) : '',
    time: step.timerMin ?? '',
    defaultValue: '',
  });

  return (
    <Stack gap="lg" p={{ base: 'md', sm: 'xl' }} maw={900} mx="auto">
      <Stack gap={4}>
        <Title order={1} fz={{ base: 28, sm: 36 }}>
          {stepTitle(t, step)}
        </Title>
        {text && (
          <Text size="lg" c="dimmed">
            {text}
          </Text>
        )}
      </Stack>

      {(step.tempC != null || step.volumeL != null) && (
        <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
          {step.volumeL != null && step.volumeL > 0 && <BigFigure label={t('brewday.water')} value={fmt(step.volumeL, 'volume', 1)} />}
          {step.tempC != null && <BigFigure label={t('fields.temperature')} value={fmt(step.tempC, 'temperature', 1)} />}
        </SimpleGrid>
      )}

      {step.timerMin != null && remainingMs != null && (
        <TimerCard step={step} remainingMs={remainingMs} running={timer?.startedAt != null} elapsedMs={timerElapsed(timer, now)} dispatch={dispatch} />
      )}

      {step.items.length > 0 && (
        <Stack gap="xs">
          {step.items.map((item) => (
            <ItemRow
              key={item.key}
              item={item}
              checked={checked.has(item.key)}
              remainingMs={remainingMs}
              timerStarted={timer != null}
              onChange={(c) => dispatch({ type: 'check', key: item.key, checked: c })}
            />
          ))}
        </Stack>
      )}

      {step.kind === 'gather' && (
        <Paper withBorder radius="lg" p={{ base: 'md', sm: 'lg' }}>
          <Text fw={700} fz="lg" mb="xs">
            {t('batchInventory.title')}
          </Text>
          <BatchInventoryPanel batchId={batch.id} compact />
        </Paper>
      )}

      {step.measure && <Measurements batch={batch} calc={calc} step={step} saver={measured} />}

      {step.kind === 'pitch' && (
        <Alert icon={<IconBulb size={18} />} color="yellow" variant="light">
          {t('brewday.finishHint')}
        </Alert>
      )}
    </Stack>
  );
}

function BigFigure({ label, value }: { label: string; value: string }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Text size="xs" c="dimmed" fw={600} tt="uppercase">
        {label}
      </Text>
      <Text fw={800} fz={{ base: 30, sm: 38 }} className="tabular" lh={1.1}>
        {value}
      </Text>
    </Paper>
  );
}

const clock = (ms: number) => {
  const total = Math.round(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${ms < 0 ? '+' : ''}${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
};

function TimerCard({ step, remainingMs, elapsedMs, running, dispatch }: { step: BrewDayStep; remainingMs: number; elapsedMs: number; running: boolean; dispatch: (a: BrewDayAction) => void }) {
  const { t } = useTranslation();
  const total = (step.timerMin ?? 0) * 60_000;
  const over = remainingMs < 0;
  const pct = total > 0 ? Math.min(100, (elapsedMs / total) * 100) : 100;
  const adjust = (deltaMs: number) => dispatch({ type: 'timerSet', timerId: step.id, elapsedMs: Math.max(0, elapsedMs + deltaMs) });
  return (
    <Paper withBorder radius="lg" p={{ base: 'md', sm: 'lg' }} className={over ? 'timer-over' : undefined}>
      <Group justify="space-between" wrap="wrap" gap="md">
        <Group gap="md" wrap="nowrap">
          <RingProgress size={92} thickness={9} roundCaps sections={[{ value: pct, color: over ? 'red' : 'brew.7' }]} label={<Center><IconClock size={26} /></Center>} />
          <Stack gap={0}>
            <Text fw={800} fz={{ base: 52, sm: 68 }} lh={1} className="tabular" c={over ? 'red' : undefined}>
              {clock(remainingMs)}
            </Text>
            <Text size="sm" c="dimmed">
              {over ? t('brewday.timer.done') : running ? t('brewday.timer.running', { min: step.timerMin }) : t('brewday.timer.paused', { min: step.timerMin })}
            </Text>
          </Stack>
        </Group>
        <Group gap="xs">
          <ActionIcon variant="default" size={48} onClick={() => adjust(60_000)} aria-label={t('brewday.timer.minus')}>
            <IconMinus />
          </ActionIcon>
          <ActionIcon variant="default" size={48} onClick={() => adjust(-60_000)} aria-label={t('brewday.timer.plus')}>
            <IconPlus />
          </ActionIcon>
          <ActionIcon variant="default" size={48} onClick={() => dispatch({ type: 'timerReset', timerId: step.id })} aria-label={t('brewday.timer.reset')}>
            <IconRotate />
          </ActionIcon>
          {running ? (
            <Button size="lg" h={48} variant="light" leftSection={<IconPlayerPause />} onClick={() => dispatch({ type: 'timerPause', timerId: step.id })}>
              {t('brewday.timer.pause')}
            </Button>
          ) : (
            <Button size="lg" h={48} leftSection={<IconPlayerPlay />} onClick={() => dispatch({ type: 'timerStart', timerId: step.id })}>
              {elapsedMs > 0 ? t('brewday.timer.resume') : t('brewday.timer.start')}
            </Button>
          )}
        </Group>
      </Group>
    </Paper>
  );
}

function useAmountText() {
  const { t } = useTranslation();
  const fmt = useFormat();
  return (item: BrewDayItem) => {
    if (item.amountKind === 'count') return t('brewday.count', { n: fmt.num(item.amount, 1, 0) });
    if (item.amountKind === 'volume') return fmt(item.amount, item.kind === 'water' ? 'volume' : 'volumeSmall', item.kind === 'water' ? 1 : 0);
    return item.kind === 'fermentable' ? fmt(item.amount, 'massLarge') : fmt(item.amount, 'massSmall', 1);
  };
}

function ItemRow({ item, checked, remainingMs, timerStarted, onChange }: { item: BrewDayItem; checked: boolean; remainingMs: number | null; timerStarted: boolean; onChange: (c: boolean) => void }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const amount = useAmountText();
  const timed = item.atMin != null && remainingMs != null;
  const untilMs = timed ? remainingMs - item.atMin! * 60_000 : null;
  const due = timed && timerStarted && untilMs! <= 0 && !checked;
  const name = item.agent ? t(`water.agents.${item.agent}`) : item.kind === 'water' ? t('brewday.waterItem') : item.name;
  return (
    <UnstyledButton onClick={() => onChange(!checked)} className="brewday-item" data-checked={checked || undefined} data-due={due || undefined}>
      <Group wrap="nowrap" gap="md">
        <Checkbox checked={checked} onChange={() => undefined} size="xl" tabIndex={-1} aria-label={name} styles={{ input: { cursor: 'pointer' } }} />
        <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
          <Text fw={600} fz="lg" td={checked ? 'line-through' : undefined} truncate>
            {name}
          </Text>
          <Text size="sm" c="dimmed">
            {[t(`brewday.kinds.${item.kind}`), item.alphaPct != null ? `${fmt.num(item.alphaPct, 1)}% α` : null].filter(Boolean).join(' · ')}
          </Text>
        </Stack>
        <Stack gap={0} align="flex-end">
          <Text fw={800} fz="xl" className="tabular">
            {amount(item)}
          </Text>
          {timed && (
            <Badge color={due ? 'red' : checked ? 'green' : 'gray'} variant={due ? 'filled' : 'light'} size="lg">
              {checked ? t('brewday.added') : due ? t('brewday.addNow') : timerStarted ? t('brewday.inTime', { time: clock(untilMs!) }) : t('brewday.atMin', { min: item.atMin })}
            </Badge>
          )}
        </Stack>
      </Group>
    </UnstyledButton>
  );
}

// ---- Measurements and corrections ---------------------------------------------------------------------------

function Measurements({ batch, calc, step, saver }: { batch: LoadedBatch; calc: RecipeCalc; step: BrewDayStep; saver: MeasuredSaver }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const value = (k: BrewDayMeasure) => (k in saver.local ? saver.local[k]! : batch.measured[k]) ?? null;
  const set = (k: BrewDayMeasure, v: number | null) => saver.set(k, v);
  const eq = batch.doc.equipment ?? DEFAULT_EQUIPMENT;

  let advice: ReactNode = null;
  let efficiency: number | null = null;
  if (step.kind === 'preBoil') {
    const g = value('preBoilGravity');
    const v = value('preBoilVolumeL');
    if (g != null && v != null) {
      efficiency = measuredEfficiency(batch.doc, calc, 'preBoil', { gravity: g, volumeL: v });
      advice = <CorrectionText correction={gravityCorrection(g, v * (1 - eq.coolingShrinkagePct / 100), calc.preBoilGravity, eq.boilOffLPerH)} where="preBoil" />;
    }
  } else if (step.kind === 'measureOg') {
    const g = value('og');
    const v = value('fermenterVolumeL');
    if (g != null && v != null) {
      efficiency = measuredEfficiency(batch.doc, calc, 'fermenter', { gravity: g, volumeL: v });
      advice = <CorrectionText correction={gravityCorrection(g, v, calc.og)} where="fermenter" />;
    }
  }

  return (
    <Paper withBorder radius="lg" p={{ base: 'md', sm: 'lg' }}>
      <Stack gap="md">
        <Text fw={700} fz="lg">
          {t('brewday.measure')}
        </Text>
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="md">
          {step.measure!.map((k) =>
            k === 'mashPh' ? (
              <NumberInput key={k} size="lg" label={t('batches.measured.mashPh')} value={value(k) ?? ''} decimalScale={2} min={3} max={8} step={0.05} onChange={(v) => set(k, v === '' ? null : Number(v))} />
            ) : (
              <UnitInput
                key={k}
                size="lg"
                measure={k.endsWith('Gravity') || k === 'og' ? 'gravity' : 'volume'}
                label={t(`batches.measured.${k}`)}
                description={targetText(t, fmt, step, k)}
                value={value(k)}
                nullable
                onChange={(v) => set(k, v)}
              />
            ),
          )}
        </SimpleGrid>
        {efficiency != null && (
          <Text>
            {t('brewday.efficiency', { actual: fmt.num(efficiency, 1), planned: fmt.num(batch.doc.efficiencyPct, 0) })}
          </Text>
        )}
        {advice}
      </Stack>
    </Paper>
  );
}

function targetText(t: T, fmt: ReturnType<typeof useFormat>, step: BrewDayStep, k: BrewDayMeasure) {
  const isGravity = k.endsWith('Gravity') || k === 'og';
  const target = isGravity ? step.target?.gravity : step.target?.volumeL;
  if (target == null) return undefined;
  return t('brewday.target', { value: isGravity ? fmt(target, 'gravity') : fmt(target, 'volume', 1) });
}

function CorrectionText({ correction, where }: { correction: ReturnType<typeof gravityCorrection>; where: 'preBoil' | 'fermenter' }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  if (correction.kind === 'ok') {
    return (
      <Alert color="green" icon={<IconCheck size={18} />}>
        {t('brewday.correction.ok')}
      </Alert>
    );
  }
  if (correction.kind === 'dilute') {
    return (
      <Alert color="blue" icon={<IconBulb size={18} />} title={t('brewday.correction.highTitle')}>
        {t(`brewday.correction.dilute.${where}`, { water: fmt(correction.waterL, 'volume', 1) })}
      </Alert>
    );
  }
  return (
    <Alert color="orange" icon={<IconBulb size={18} />} title={t('brewday.correction.lowTitle')}>
      <Stack gap={4}>
        {where === 'preBoil' && correction.extraBoilMin != null && <Text size="sm">{t('brewday.correction.boilLonger', { min: Math.round(correction.extraBoilMin) })}</Text>}
        <Text size="sm">{t(`brewday.correction.extract.${where}`, { amount: fmt(correction.extractKg, 'massSmall', 0) })}</Text>
        {where === 'fermenter' && <Text size="sm" c="dimmed">{t('brewday.correction.acceptLow')}</Text>}
      </Stack>
    </Alert>
  );
}

// ---- Start and end ------------------------------------------------------------------------------------------------

function Intro({ batch, calc, onStart, pending }: { batch: LoadedBatch; calc: RecipeCalc; onStart: () => void; pending: boolean }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const v = calc.volumes;
  return (
    <ScrollArea className="brewday-main" type="auto">
      <Stack gap="lg" p={{ base: 'md', sm: 'xl' }} maw={760} mx="auto">
        <Title order={1}>{t('brewday.introTitle')}</Title>
        <Text c="dimmed" size="lg">
          {t('brewday.introText')}
        </Text>
        <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
          <BigFigure label={t('stats.og')} value={fmt(calc.og, 'gravity')} />
          <BigFigure label={t('recipe.volumes.totalWater')} value={fmt(v.totalWaterL, 'volume', 1)} />
          {v.strikeL > 0 && <BigFigure label={t('recipe.volumes.strike')} value={fmt(v.strikeL, 'volume', 1)} />}
          {calc.strikeTempC != null && <BigFigure label={t('brewday.strikeTemp')} value={fmt(calc.strikeTempC, 'temperature', 1)} />}
          <BigFigure label={t('recipe.volumes.preBoil')} value={fmt(v.preBoilL, 'volume', 1)} />
          <BigFigure label={t('recipe.setup.boilTime')} value={`${batch.doc.boilTimeMin} min`} />
        </SimpleGrid>
        <Alert icon={<IconBell size={18} />} variant="light">
          {t('brewday.alertsHint')}
        </Alert>
        <Button size="xl" leftSection={<IconPlayerPlay />} onClick={onStart} loading={pending}>
          {t('brewday.start')}
        </Button>
      </Stack>
    </ScrollArea>
  );
}

function Finished({ batch, onReopen }: { batch: LoadedBatch; onReopen: () => void }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const m = batch.measured;
  return (
    <ScrollArea className="brewday-main" type="auto">
      <Stack gap="lg" p={{ base: 'md', sm: 'xl' }} maw={640} mx="auto" align="stretch">
        <ThemeIcon size={64} radius="xl" color="green">
          <IconCheck size={36} />
        </ThemeIcon>
        <Title order={1}>{t('brewday.doneTitle')}</Title>
        <Text c="dimmed" size="lg">
          {t('brewday.doneText')}
        </Text>
        <SimpleGrid cols={2} spacing="sm">
          <BigFigure label={t('stats.og')} value={m.og != null ? fmt(m.og, 'gravity') : '–'} />
          <BigFigure label={t('batches.intoFermenter')} value={m.fermenterVolumeL != null ? fmt(m.fermenterVolumeL, 'volume', 1) : '–'} />
        </SimpleGrid>
        <Group>
          <Button size="lg" renderRoot={(props) => <Link {...props} to="/batches/$batchId" params={{ batchId: batch.id }} />}>
            {t('brewday.toBatch')}
          </Button>
          <Button size="lg" variant="default" onClick={onReopen}>
            {t('brewday.reopen')}
          </Button>
        </Group>
      </Stack>
    </ScrollArea>
  );
}

// ---- Alerts ---------------------------------------------------------------------------------------------------------

/**
 * Sounds an alert when an addition falls due or a timer runs out, for every running timer (not
 * only the step on screen). What was already due when the page opened is shown, not sounded.
 */
function useStepAlerts(batch: LoadedBatch, steps: BrewDayStep[], now: number, sound: boolean) {
  const { t } = useTranslation();
  const fired = useRef<Set<string> | null>(null);
  const amountText = useAmountText();
  useEffect(() => {
    const checked = new Set(batch.brewday.checked);
    const due: { key: string; title: string; body: string }[] = [];
    for (const step of steps) {
      const timer = batch.brewday.timers[step.id];
      if (step.timerMin == null || !timer) continue;
      const remaining = step.timerMin * 60_000 - timerElapsed(timer, now);
      for (const item of step.items) {
        if (item.atMin == null || checked.has(item.key)) continue;
        if (remaining <= item.atMin * 60_000) due.push({ key: `${step.id}:${item.key}`, title: t('brewday.alert.add', { name: item.name }), body: `${amountText(item)} · ${stepTitle(t, step)}` });
      }
      if (remaining <= 0) due.push({ key: `${step.id}:end`, title: t('brewday.alert.timerDone', { step: stepTitle(t, step) }), body: batch.name });
    }
    if (!fired.current) {
      fired.current = new Set(due.map((d) => d.key));
      return;
    }
    for (const d of due) {
      if (fired.current.has(d.key)) continue;
      fired.current.add(d.key);
      if (sound) beep();
      vibrate();
      notifications.show({ title: d.title, message: d.body, color: 'orange', autoClose: 15_000 });
      systemNotify(d.title, d.body, d.key);
    }
  }, [now, batch.brewday, batch.name, steps, sound, t, amountText]);
}
