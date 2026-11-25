import { ActionIcon, Button, Group, Menu, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { IconPlus, IconUnlink } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { DeviceDto, UpdateDeviceInput } from '@brew/shared';
import { useDevices, useUpdateDevice, useVessels, type LoadedBatch } from '../data';
import { notifyError } from '../lib/notify';
import { useDateFormat } from './batch-ui';
import { useTelemetryText } from './device-ui';

/**
 * Devices measuring this batch, and linking them. A device is linked through the batch's fermenter
 * when it has one (so it carries over to the next batch in that fermenter), otherwise directly.
 */
export function BatchDevices({ batch }: { batch: LoadedBatch }) {
  const { t } = useTranslation();
  const devices = useDevices();
  const vessels = useVessels();
  const update = useUpdateDevice();
  const open = batch.status !== 'completed';
  const all = devices.data ?? [];
  // Measuring it now, or linked to it and measuring once it is brewing.
  const isMine = (d: DeviceDto) => d.currentBatch?.id === batch.id || (open && (d.batchId === batch.id || (batch.vesselId != null && d.vesselId === batch.vesselId && !d.batchId)));
  const mine = all.filter(isMine);
  const others = all.filter((d) => !isMine(d));
  const vesselName = vessels.data?.find((v) => v.id === batch.vesselId)?.name;

  const link = (d: DeviceDto) => {
    const patch: UpdateDeviceInput = batch.vesselId ? { vesselId: batch.vesselId, batchId: null } : { batchId: batch.id };
    update.mutate({ id: d.id, patch }, { onError: notifyError });
  };
  const unlink = (d: DeviceDto) => {
    const patch: UpdateDeviceInput = { batchId: null };
    if (d.vesselId && d.vesselId === batch.vesselId) patch.vesselId = null;
    update.mutate({ id: d.id, patch }, { onError: notifyError });
  };

  return (
    <Stack gap="sm">
      {mine.length > 0 ? (
        <Group gap="sm" align="stretch">
          {mine.map((d) => (
            <DeviceTile key={d.id} device={d} batch={batch} vesselName={vesselName} onUnlink={() => unlink(d)} />
          ))}
        </Group>
      ) : (
        <Text size="sm" c="dimmed">
          {t('devices.noneForBatch')}
        </Text>
      )}
      {open && (
        <Group gap="xs">
          <Menu position="bottom-start" withinPortal>
            <Menu.Target>
              <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} disabled={!others.length} loading={update.isPending}>
                {t('devices.addToBatch')}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {others.map((d) => (
                <Menu.Item key={d.id} onClick={() => link(d)}>
                  <Text size="sm">{d.name}</Text>
                  <Text size="xs" c="dimmed">
                    {t(`devices.types.${d.type}`)}
                    {d.currentBatch ? ` · ${t('devices.measuring', { number: d.currentBatch.number, name: d.currentBatch.name })}` : ''}
                  </Text>
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
          <Text size="xs" c="dimmed">
            {!all.length ? t('devices.noDevicesYet') : vesselName ? t('devices.linksVia', { vessel: vesselName }) : t('devices.linksDirect')}
          </Text>
        </Group>
      )}
    </Stack>
  );
}

function DeviceTile({ device, batch, vesselName, onUnlink }: { device: DeviceDto; batch: LoadedBatch; vesselName: string | undefined; onUnlink: () => void }) {
  const { t } = useTranslation();
  const dates = useDateFormat();
  const telemetryText = useTelemetryText();
  const via = device.batchId === batch.id ? t('devices.linkedDirect') : device.vesselId && device.vesselId === batch.vesselId && vesselName ? t('devices.linkedVia', { vessel: vesselName }) : null;

  return (
    <Paper withBorder p="sm" radius="md" style={{ flex: '1 1 260px' }}>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <Text fw={600} truncate>
          {device.name}
        </Text>
        <Group gap={4} wrap="nowrap">
          <Text size="xs" c="dimmed">
            {t(`devices.types.${device.type}`)}
          </Text>
          <Tooltip label={t('devices.removeFromBatch')}>
            <ActionIcon variant="subtle" color="gray" size="sm" onClick={onUnlink} aria-label={t('devices.removeFromBatch')}>
              <IconUnlink size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <Text fw={700} fz="lg" className="tabular">
        {telemetryText(device.lastTelemetry)}
      </Text>
      <Text size="xs" c="dimmed">
        {device.lastSeenAt ? t('devices.lastSeen', { date: dates.dateTime(device.lastSeenAt) }) : t('devices.neverSeen')}
        {via ? ` · ${via}` : ''}
      </Text>
      {device.currentBatch?.id !== batch.id && (
        <Text size="xs" c="orange" mt={4}>
          {t('devices.startsWhenBrewing')}
        </Text>
      )}
    </Paper>
  );
}
