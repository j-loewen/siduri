import { useMemo, useState } from 'react';
import { LineChart } from '@mantine/charts';
import { ActionIcon, Badge, Button, Group, Paper, SimpleGrid, Stack, Table, Text, TextInput } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { abvSimple, apparentAttenuation, calculateRecipe } from '@brew/brewcalc';
import { useAddReading, useDeleteReading, useReadings, type LoadedBatch } from '../data';
import { notifyError } from '../lib/notify';
import { UnitInput, useFormat } from '../units';
import { fermentationDay, useDateFormat } from './batch-ui';
import { BatchDevices } from './BatchDevices';
import { Section } from './recipe-ui';

/** Local "YYYY-MM-DDTHH:mm" for a datetime-local input. */
const localNow = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

/** Gravity and temperature over time, with manual readings (RAPT Pill readings join here later). */
export function FermentationPanel({ batch }: { batch: LoadedBatch }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const dates = useDateFormat();
  const readings = useReadings(batch.id);
  const add = useAddReading(batch.id);
  const remove = useDeleteReading(batch.id);
  const [gravity, setGravity] = useState<number | null>(null);
  const [tempC, setTempC] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [takenAt, setTakenAt] = useState(localNow);
  const calc = useMemo(() => calculateRecipe(batch.doc), [batch.doc]);

  const og = batch.measured.og ?? calc.og;
  const list = readings.data ?? [];
  const lastGravity = [...list].reverse().find((r) => r.gravity != null)?.gravity ?? null;
  const day = fermentationDay(batch.fermentationStart);

  const gravityUnit = fmt.unit('gravity');
  const tempUnit = fmt.unit('temperature');
  const data = list.map((r) => ({
    ts: Date.parse(r.takenAt),
    gravity: r.gravity == null ? null : Number(gravityUnit.fromCanonical(r.gravity).toFixed(gravityUnit.decimals + 1)),
    temp: r.tempC == null ? null : Number(tempUnit.fromCanonical(r.tempC).toFixed(1)),
  }));
  const ticks = dayTicks(data.map((d) => d.ts));

  const submit = () =>
    add.mutate(
      { gravity, tempC, note: note.trim(), takenAt: new Date(takenAt).toISOString() },
      {
        onSuccess: () => {
          setGravity(null);
          setTempC(null);
          setNote('');
          setTakenAt(localNow());
        },
        onError: notifyError,
      },
    );

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
        <Stat label={t('batches.dayLabel')} value={day != null ? String(day) : '–'} />
        <Stat label={t('batches.currentGravity')} value={lastGravity != null ? fmt(lastGravity, 'gravity') : '–'} />
        <Stat label={t('batches.attenuation')} value={lastGravity != null ? `${fmt.num(apparentAttenuation(og, lastGravity), 0)}%` : '–'} sub={t('batches.expected', { value: `${fmt.num(calc.attenuationPct, 0)}%` })} />
        <Stat label={t('stats.abv')} value={lastGravity != null ? `${fmt.num(abvSimple(og, lastGravity), 1)}%` : '–'} />
      </SimpleGrid>

      <Section title={t('devices.forBatch')}>
        <BatchDevices batch={batch} />
      </Section>

      <Section title={t('batches.chart')}>
        {data.length >= 2 ? (
          <LineChart
            h={280}
            data={data}
            dataKey="ts"
            series={[
              { name: 'gravity', label: `${t('batches.gravity')} (${gravityUnit.symbol})`, color: 'brew.7' },
              { name: 'temp', label: `${t('fields.temperature')} (${tempUnit.symbol})`, color: 'blue.6', yAxisId: 'right' },
            ]}
            withRightYAxis
            withLegend
            connectNulls
            curveType="monotone"
            withDots={data.length < 60}
            xAxisProps={{ type: 'number', domain: ['dataMin', 'dataMax'], scale: 'time', ticks, interval: 0, tickFormatter: (v: number) => dates.weekday(new Date(v)) }}
            yAxisProps={{ domain: ['auto', 'auto'] }}
            rightYAxisProps={{ domain: ['auto', 'auto'] }}
            tooltipProps={{ labelFormatter: (v: unknown) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? dates.dateTime(new Date(Number(v))) : '') }}
          />
        ) : (
          <Text size="sm" c="dimmed">
            {t('batches.chartEmpty')}
          </Text>
        )}
      </Section>

      <Paper withBorder p="sm" radius="md">
        <Text fw={600} mb="xs">
          {t('batches.addReading')}
        </Text>
        <Group align="flex-end" gap="sm">
          <UnitInput measure="gravity" label={t('batches.gravity')} value={gravity} nullable onChange={setGravity} w={140} />
          <UnitInput measure="temperature" label={t('fields.temperature')} value={tempC} nullable onChange={setTempC} w={130} />
          <TextInput label={t('batches.when')} type="datetime-local" value={takenAt} onChange={(e) => setTakenAt(e.currentTarget.value)} w={210} />
          <TextInput label={t('fields.notes')} value={note} onChange={(e) => setNote(e.currentTarget.value)} style={{ flex: 1, minWidth: 160 }} />
          <Button onClick={submit} loading={add.isPending} disabled={gravity == null && tempC == null && !note.trim()}>
            {t('common.add')}
          </Button>
        </Group>
      </Paper>

      {list.length > 0 && (
        <Table.ScrollContainer minWidth={420}>
          <Table verticalSpacing={6} striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('batches.when')}</Table.Th>
                <Table.Th>{t('batches.gravity')}</Table.Th>
                <Table.Th>{t('fields.temperature')}</Table.Th>
                <Table.Th>{t('fields.notes')}</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {[...list].reverse().map((r) => (
                <Table.Tr key={r.id}>
                  <Table.Td className="tabular">{dates.dateTime(r.takenAt)}</Table.Td>
                  <Table.Td className="tabular">{r.gravity != null ? fmt(r.gravity, 'gravity') : ''}</Table.Td>
                  <Table.Td className="tabular">{r.tempC != null ? fmt(r.tempC, 'temperature', 1) : ''}</Table.Td>
                  <Table.Td>
                    <Group gap={6}>
                      {r.source === 'device' && (
                        <Badge size="xs" variant="light">
                          {t('batches.device')}
                        </Badge>
                      )}
                      <Text size="sm">{r.note}</Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon size="sm" variant="subtle" color="gray" aria-label={t('common.delete')} onClick={() => remove.mutate(r.id, { onError: notifyError })}>
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Stack>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Paper withBorder p="sm" radius="md">
      <Text size="xs" c="dimmed" fw={600} tt="uppercase">
        {label}
      </Text>
      <Text fw={700} fz="xl" className="tabular">
        {value}
      </Text>
      {sub && (
        <Text size="xs" c="dimmed">
          {sub}
        </Text>
      )}
    </Paper>
  );
}

/**
 * One tick per day at local midnight (every few days for long fermentations), so each date
 * appears once on the time axis.
 */
function dayTicks(times: number[]): number[] {
  if (times.length < 2) return [];
  const first = Math.min(...times);
  const last = Math.max(...times);
  const start = new Date(first);
  start.setHours(24, 0, 0, 0);
  const days = Math.ceil((last - start.getTime()) / 86400_000) + 1;
  const step = Math.max(1, Math.ceil(days / 8));
  const ticks: number[] = [];
  for (const d = new Date(start); d.getTime() <= last; d.setDate(d.getDate() + step)) ticks.push(d.getTime());
  return ticks;
}
