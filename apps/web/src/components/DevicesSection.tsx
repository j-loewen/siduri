import { useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Alert, Anchor, Badge, Button, Card, Code, CopyButton, Drawer, Group, Paper, ScrollArea, SimpleGrid, Stack, Text, TextInput, Title, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconAlertTriangle, IconBattery2, IconCheck, IconClipboard, IconPlus, IconTrash, IconUnlink } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { CONTROLLER_TYPES, RAPT_TYPES, type DeviceDto } from '@brew/shared';
import { useDeleteDevice, useDevices, useRegenerateDeviceToken, useUpdateDevice, useVessels } from '../data';
import { useNotifyDeleted, useTrashNote } from './trash-ui';
import { notifyError, notifyOk } from '../lib/notify';
import { useDateFormat } from './batch-ui';
import { AddDeviceModal, type IntegrationId } from './DeviceIntegrations';
import { pushUrl, useTelemetryText } from './device-ui';

/**
 * Smart devices on the Equipment page: the connected devices as cards, and "Add device", which
 * walks through setting up an integration (RAPT, iSpindel, other HTTP devices). Devices are linked
 * to a batch on the batch's Fermentation tab.
 */
export function DevicesSection() {
  const { t } = useTranslation();
  const devices = useDevices();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState<IntegrationId | 'choose' | null>(null);
  const telemetryText = useTelemetryText();
  const dates = useDateFormat();

  return (
    <Stack gap="sm" mt="xl">
      <Group justify="space-between">
        <Stack gap={0}>
          <Title order={3}>{t('devices.title')}</Title>
          <Text size="sm" c="dimmed">
            {t('devices.subtitle')}
          </Text>
        </Stack>
        <Button variant="light" leftSection={<IconPlus size={18} />} onClick={() => setAdding('choose')}>
          {t('devices.new')}
        </Button>
      </Group>
      {devices.data?.length ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
          {devices.data.map((d) => (
            <Card key={d.id} withBorder radius="md" className="clickable-row" onClick={() => setOpenId(d.id)}>
              <Group justify="space-between" wrap="nowrap">
                <Text fw={600} truncate>
                  {d.name}
                </Text>
                <Badge variant="light" color={d.lastSeenAt && Date.now() - Date.parse(d.lastSeenAt) < 2 * 3600_000 ? 'green' : 'gray'}>
                  {t(`devices.types.${d.type}`)}
                </Badge>
              </Group>
              <Text size="sm" fw={500} mt={4} className="tabular">
                {telemetryText(d.lastTelemetry)}
              </Text>
              <Text size="xs" c="dimmed">
                {d.lastSeenAt ? t('devices.lastSeen', { date: dates.dateTime(d.lastSeenAt) }) : t('devices.neverSeen')}
                {d.lastTelemetry?.battery != null && (
                  <>
                    {' · '}
                    <IconBattery2 size={12} style={{ verticalAlign: 'middle' }} /> {d.lastTelemetry.battery}
                    {d.lastTelemetry.battery > 5 ? '%' : ' V'}
                  </>
                )}
              </Text>
              <Text size="xs" mt={4}>
                {d.currentBatch ? t('devices.measuring', { number: d.currentBatch.number, name: d.currentBatch.name }) : <Text span c="dimmed" size="xs">{t('devices.noBatch')}</Text>}
              </Text>
            </Card>
          ))}
        </SimpleGrid>
      ) : (
        <Text size="sm" c="dimmed">
          {t('devices.empty')}
        </Text>
      )}
      <AddDeviceModal step={adding} onStep={setAdding} />
      <DeviceDrawer device={devices.data?.find((d) => d.id === openId) ?? null} onClose={() => setOpenId(null)} />
    </Stack>
  );
}

/** A label and a value, side by side. */
function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Group gap="xs" wrap="nowrap" align="baseline">
      <Text size="sm" fw={500} w={130} style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <Text size="sm" component="div" style={{ minWidth: 0 }}>
        {children}
      </Text>
    </Group>
  );
}

/**
 * One device: rename it, see what it is and what it measures, unlink or delete it, its push URL
 * and the last messages. Type and RAPT id come from the integration; links are made in the batch.
 */
function DeviceDrawer({ device, onClose }: { device: DeviceDto | null; onClose: () => void }) {
  const { t } = useTranslation();
  const trashNote = useTrashNote();
  const notifyDeleted = useNotifyDeleted();
  const update = useUpdateDevice();
  const remove = useDeleteDevice();
  const regenerate = useRegenerateDeviceToken();
  const vessels = useVessels();
  const dates = useDateFormat();
  const [name, setName] = useState('');
  const [shownFor, setShownFor] = useState<string | null>(null);
  if ((device?.id ?? null) !== shownFor) {
    setShownFor(device?.id ?? null);
    setName(device?.name ?? '');
  }

  const isRapt = device ? RAPT_TYPES.includes(device.type) : false;
  const vessel = device?.vesselId ? vessels.data?.find((v) => v.id === device.vesselId) : undefined;
  const linked = Boolean(device?.vesselId || device?.batchId);

  return (
    <Drawer opened={device != null} onClose={onClose} position="right" size="lg" title={device?.name}>
      {device && (
        <Stack>
          <Group align="flex-end" wrap="nowrap" gap="xs">
            <TextInput label={t('fields.name')} value={name} onChange={(e) => setName(e.currentTarget.value)} required style={{ flex: 1 }} />
            <Button
              onClick={() => update.mutate({ id: device.id, patch: { name: name.trim() } }, { onSuccess: () => notifyOk(t('devices.saved')), onError: notifyError })}
              loading={update.isPending && update.variables?.patch.name != null}
              disabled={!name.trim() || name.trim() === device.name}
            >
              {t('common.save')}
            </Button>
          </Group>

          <Stack gap={6}>
            <InfoRow label={t('fields.type')}>{t(`devices.types.${device.type}`)}</InfoRow>
            {(isRapt || device.type === 'tilt') && device.externalId && (
              <InfoRow label={t(device.type === 'tilt' ? 'devices.tiltColor' : 'devices.externalId')}>
                <Code>{device.externalId}</Code>
              </InfoRow>
            )}
            <InfoRow label={t('devices.measures')}>
              {device.currentBatch ? (
                <Anchor size="sm" renderRoot={(props) => <Link {...props} to="/batches/$batchId" params={{ batchId: device.currentBatch!.id }} />}>
                  #{device.currentBatch.number} {device.currentBatch.name}
                </Anchor>
              ) : (
                <Text span size="sm" c="dimmed">
                  {t('devices.noBatch')}
                </Text>
              )}
            </InfoRow>
            {vessel && <InfoRow label={t('devices.vessel')}>{vessel.name}</InfoRow>}
          </Stack>
          <Group justify="space-between" align="center" wrap="wrap" gap="xs">
            <Text size="xs" c="dimmed" style={{ flex: '1 1 220px' }}>
              {t('devices.linkHint')}
            </Text>
            {linked && (
              <Button
                size="xs"
                variant="light"
                color="gray"
                leftSection={<IconUnlink size={14} />}
                loading={update.isPending && update.variables?.patch.name == null}
                onClick={() => update.mutate({ id: device.id, patch: { vesselId: null, batchId: null } }, { onSuccess: () => notifyOk(t('devices.unlinked', { name: device.name })), onError: notifyError })}
              >
                {t('devices.unlink')}
              </Button>
            )}
          </Group>
          {CONTROLLER_TYPES.includes(device.type) && (
            <Text size="sm" c="dimmed">
              {t('devices.controllerHint')}
            </Text>
          )}

          <Title order={5} mt="md">
            {t('devices.push.title')}
          </Title>
          <Text size="sm" c="dimmed">
            {t(isRapt ? 'devices.push.rapt' : device.type === 'tilt' ? 'devices.push.tilt' : device.type === 'ispindel' ? 'devices.push.ispindel' : 'devices.push.other')}
          </Text>
          <Group gap="xs" wrap="nowrap">
            <Code style={{ flex: 1, overflowX: 'auto', whiteSpace: 'nowrap' }}>{pushUrl(device.token)}</Code>
            <CopyButton value={pushUrl(device.token)}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? t('batchInventory.copied') : t('batchInventory.copy')}>
                  <Button size="xs" variant="light" onClick={copy} leftSection={copied ? <IconCheck size={14} /> : <IconClipboard size={14} />}>
                    {t('batchInventory.copy')}
                  </Button>
                </Tooltip>
              )}
            </CopyButton>
          </Group>
          {isRapt && (
            <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} p="xs">
              <Text size="sm">{t('devices.push.publicHint')}</Text>
            </Alert>
          )}
          <Anchor size="sm" onClick={() => regenerate.mutate(device.id, { onSuccess: () => notifyOk(t('devices.push.newUrl')), onError: notifyError })}>
            {t('devices.push.regenerate')}
          </Anchor>

          <Title order={5} mt="md">
            {t('devices.recent')}
          </Title>
          {device.recent.length === 0 ? (
            <Text size="sm" c="dimmed">
              {t('devices.nothingYet')}
            </Text>
          ) : (
            <Stack gap="xs">
              {device.recent.map((p, i) => (
                <Paper key={i} withBorder p="xs" radius="sm">
                  <Group justify="space-between" mb={4}>
                    <Text size="xs" c="dimmed">
                      {dates.dateTime(p.at)}
                    </Text>
                    <Badge size="xs" color={p.telemetry ? 'green' : 'orange'} variant="light">
                      {p.telemetry ? t('devices.understood') : t('devices.notUnderstood')}
                    </Badge>
                  </Group>
                  <ScrollArea.Autosize mah={120}>
                    <Code block style={{ fontSize: 11 }}>
                      {p.raw}
                    </Code>
                  </ScrollArea.Autosize>
                </Paper>
              ))}
            </Stack>
          )}

          <Group mt="md">
            <Button
              variant="subtle"
              color="red"
              leftSection={<IconTrash size={16} />}
              onClick={() =>
                modals.openConfirmModal({
                  title: t('devices.deleteTitle'),
                  children: <Text size="sm">{t('devices.deleteText', { name: device.name })}{' '}{trashNote}</Text>,
                  labels: { confirm: t('common.delete'), cancel: t('common.cancel') },
                  confirmProps: { color: 'red' },
                  onConfirm: () =>
                    remove.mutate(device.id, {
                      onSuccess: () => {
                        notifyDeleted('device', device.id, device.name);
                        onClose();
                      },
                      onError: notifyError,
                    }),
                })
              }
            >
              {t('common.delete')}
            </Button>
          </Group>
        </Stack>
      )}
    </Drawer>
  );
}
