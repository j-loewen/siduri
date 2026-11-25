import { useState, type ReactNode } from 'react';
import { Alert, Anchor, Button, Code, CopyButton, Group, List, Modal, Stack, Text, TextInput, ThemeIcon, UnstyledButton } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconAlertTriangle, IconArrowLeft, IconBluetooth, IconBroadcast, IconCheck, IconChevronRight, IconClipboard, IconCode, IconTestPipe } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { APP_NAME, type DeviceDto } from '@brew/shared';
import { useRaptStream, useRegenerateRaptStreamKey, useRegenerateTiltStreamKey, useSaveDevice, useTiltStream } from '../data';
import { notifyError, notifyOk } from '../lib/notify';
import { pushUrl } from './device-ui';

/**
 * The ways a device can get its readings into the app. Each has a setup panel with everything to
 * enter on the device's side (URL, key …). New kinds of devices are added here.
 */
const INTEGRATIONS = [
  { id: 'rapt_stream', icon: IconBroadcast },
  { id: 'ispindel', icon: IconTestPipe },
  { id: 'tilt', icon: IconBluetooth },
  { id: 'http', icon: IconCode },
] as const;
export type IntegrationId = (typeof INTEGRATIONS)[number]['id'];

/**
 * "Add device": choose an integration, then follow its instructions. `step` is 'choose' for the
 * list, an integration id for its panel, or null when closed.
 */
export function AddDeviceModal({
  step,
  onStep,
}: {
  step: IntegrationId | 'choose' | null;
  onStep: (step: IntegrationId | 'choose' | null) => void;
}) {
  const { t } = useTranslation();
  const chosen = step && step !== 'choose' ? step : null;
  const close = () => onStep(null);

  return (
    <Modal
      opened={step != null}
      onClose={close}
      size="lg"
      title={
        chosen ? (
          <Group gap="xs" wrap="nowrap">
            <Anchor component="button" type="button" c="dimmed" onClick={() => onStep('choose')} aria-label={t('devices.add.back')}>
              <IconArrowLeft size={18} style={{ display: 'block' }} />
            </Anchor>
            <Text fw={600}>{t(`devices.add.integrations.${chosen}.title`)}</Text>
          </Group>
        ) : (
          <Text fw={600}>{t('devices.add.title')}</Text>
        )
      }
    >
      {!chosen && (
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            {t('devices.add.choose')}
          </Text>
          {INTEGRATIONS.map(({ id, icon: Icon }) => (
            <UnstyledButton key={id} className="integration-option" onClick={() => onStep(id)}>
              <Group wrap="nowrap" gap="sm">
                <ThemeIcon variant="light" size={38} radius="md">
                  <Icon size={20} />
                </ThemeIcon>
                <Stack gap={0} style={{ flex: 1 }}>
                  <Text fw={600} size="sm">
                    {t(`devices.add.integrations.${id}.title`)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {t(`devices.add.integrations.${id}.text`)}
                  </Text>
                </Stack>
                <IconChevronRight size={18} style={{ flexShrink: 0, opacity: 0.6 }} />
              </Group>
            </UnstyledButton>
          ))}
        </Stack>
      )}
      {chosen === 'rapt_stream' && <RaptStreamPanel onDone={close} />}
      {chosen === 'ispindel' && <PushDevicePanel kind="ispindel" onDone={close} />}
      {chosen === 'tilt' && <TiltPanel onDone={close} />}
      {chosen === 'http' && <PushDevicePanel kind="http" onDone={close} />}
    </Modal>
  );
}

/**
 * A value to copy into another app: label, the value, and a copy button. Without a value (not
 * known yet) it says that the value comes after step 1.
 */
export function CopyRow({ label, value }: { label: string; value: string | null }) {
  const { t } = useTranslation();
  if (value == null) {
    return (
      <Group gap="xs" wrap="nowrap">
        <Text size="sm" fw={500} w={120} style={{ flexShrink: 0 }}>
          {label}
        </Text>
        <Text size="sm" c="dimmed" fs="italic">
          {t('devices.add.afterStep1')}
        </Text>
      </Group>
    );
  }
  return (
    <Group gap="xs" wrap="nowrap">
      <Text size="sm" fw={500} w={120} style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <Code style={{ flex: 1, overflowX: 'auto', whiteSpace: 'nowrap' }}>{value}</Code>
      <CopyButton value={value}>
        {({ copied, copy }) => (
          <Button size="xs" variant="light" onClick={copy} leftSection={copied ? <IconCheck size={14} /> : <IconClipboard size={14} />} style={{ flexShrink: 0 }}>
            {copied ? t('batchInventory.copied') : t('batchInventory.copy')}
          </Button>
        )}
      </CopyButton>
    </Group>
  );
}

/** A label and a fixed value (nothing to copy). */
function FixedRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Group gap="xs" wrap="nowrap">
      <Text size="sm" fw={500} w={120} style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <Code>{children}</Code>
    </Group>
  );
}

function DoneButton({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  return (
    <Group justify="flex-end" mt="xs">
      <Button onClick={onDone}>{t('devices.add.done')}</Button>
    </Group>
  );
}

/** True when a cloud service cannot reach this address: not HTTPS, or a local / private host. */
function notReachableFromInternet(url: string): boolean {
  try {
    const u = new URL(url);
    const h = u.hostname;
    return u.protocol !== 'https:' || h === 'localhost' || h.endsWith('.local') || h === '[::1]' || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
  } catch {
    return true;
  }
}

/** What to enter in RAPT's "Custom" Brew Data Stream: the URL and the header with the key. */
function RaptStreamPanel({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const stream = useRaptStream();
  const regenerate = useRegenerateRaptStreamKey();
  const st = stream.data;
  if (!st) return null;
  const url = st.url ?? `${window.location.origin}${st.path}`;

  return (
    <Stack gap="xs">
      <Text size="sm" c="dimmed">
        {t('rapt.stream.intro')}
      </Text>
      <Text size="sm">{t('rapt.stream.where')}</Text>
      <Stack gap={6}>
        <CopyRow label={t('rapt.stream.name')} value={APP_NAME} />
        <CopyRow label={t('rapt.stream.url')} value={url} />
        <FixedRow label={t('rapt.stream.method')}>POST</FixedRow>
        <Text size="sm" mt={4}>
          {t('rapt.stream.addHeader')}
        </Text>
        <CopyRow label={t('rapt.stream.headerName')} value="Authorization" />
        <CopyRow label={t('rapt.stream.headerValue')} value={`Bearer ${st.key}`} />
      </Stack>
      <List size="sm" spacing={2} mt={4}>
        <List.Item>{t('rapt.stream.secret')}</List.Item>
        <List.Item>{t('rapt.stream.perDevice')}</List.Item>
        <List.Item>{t('rapt.stream.appears')}</List.Item>
      </List>
      {notReachableFromInternet(url) && (
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} p="xs">
          <Text size="sm">{t('rapt.stream.notPublic', { url })}</Text>
        </Alert>
      )}
      <Group justify="space-between" mt="xs">
        <Anchor
          size="sm"
          onClick={() =>
            modals.openConfirmModal({
              title: t('rapt.stream.newKeyTitle'),
              children: <Text size="sm">{t('rapt.stream.newKeyText')}</Text>,
              labels: { confirm: t('rapt.stream.newKey'), cancel: t('common.cancel') },
              confirmProps: { color: 'red' },
              onConfirm: () => regenerate.mutate(undefined, { onSuccess: () => notifyOk(t('rapt.stream.newKeyDone')), onError: notifyError }),
            })
          }
        >
          {t('rapt.stream.newKey')}
        </Anchor>
        <Button onClick={onDone}>{t('devices.add.done')}</Button>
      </Group>
    </Stack>
  );
}

/**
 * Tilt: the Tilt app or a TiltPi forwards the readings to one "cloud URL" (key included) for all
 * Tilts; each colour becomes a device with its first reading.
 */
function TiltPanel({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const stream = useTiltStream();
  const regenerate = useRegenerateTiltStreamKey();
  const st = stream.data;
  if (!st) return null;
  const url = st.url ?? `${window.location.origin}${st.path}`;

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        {t('devices.add.tilt.intro')}
      </Text>
      <SetupStep n={1} title={t('devices.add.tilt.urlTitle')}>
        <CopyRow label={t('devices.add.tilt.cloudUrl')} value={url} />
      </SetupStep>
      <SetupStep n={2} title={t('devices.add.tilt.appTitle')}>
        <Text size="sm">{t('devices.add.tilt.appText')}</Text>
      </SetupStep>
      <SetupStep n={3} title={t('devices.add.tilt.piTitle')}>
        <Text size="sm">{t('devices.add.tilt.piText')}</Text>
      </SetupStep>
      <SetupStep n={4} title={t('devices.add.checkTitle')}>
        <Text size="sm">{t('devices.add.tilt.checkText')}</Text>
      </SetupStep>
      {notReachableFromInternet(url) && (
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} p="xs">
          <Text size="sm">{t('devices.add.tilt.local', { url })}</Text>
        </Alert>
      )}
      <Group justify="space-between">
        <Anchor
          size="sm"
          onClick={() =>
            modals.openConfirmModal({
              title: t('devices.add.tilt.newKeyTitle'),
              children: <Text size="sm">{t('devices.add.tilt.newKeyText')}</Text>,
              labels: { confirm: t('devices.add.tilt.newKey'), cancel: t('common.cancel') },
              confirmProps: { color: 'red' },
              onConfirm: () => regenerate.mutate(undefined, { onSuccess: () => notifyOk(t('devices.add.tilt.newKeyDone')), onError: notifyError }),
            })
          }
        >
          {t('devices.add.tilt.newKey')}
        </Anchor>
        <Button onClick={onDone}>{t('devices.add.done')}</Button>
      </Group>
    </Stack>
  );
}

/** A numbered step of the setup instructions. */
function SetupStep({ n, title, children }: { n: number; title: string; children?: ReactNode }) {
  return (
    <Group align="flex-start" wrap="nowrap" gap="sm">
      <ThemeIcon variant="light" radius="xl" size={26} style={{ flexShrink: 0 }}>
        <Text size="sm" fw={700}>
          {n}
        </Text>
      </ThemeIcon>
      <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
        <Text fw={600} size="sm" mt={3}>
          {title}
        </Text>
        {children}
      </Stack>
    </Group>
  );
}

/**
 * Devices that post to their own push URL (iSpindel, scripts …). All steps are shown from the
 * start; the device's address fills in once step 1 has created the device.
 */
function PushDevicePanel({ kind, onDone }: { kind: 'ispindel' | 'http'; onDone: () => void }) {
  const { t } = useTranslation();
  const save = useSaveDevice();
  const [name, setName] = useState(kind === 'ispindel' ? 'iSpindel' : '');
  const [created, setCreated] = useState<DeviceDto | null>(null);
  const url = created ? pushUrl(created.token) : null;

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        {t(`devices.add.${kind}.intro`)}
      </Text>
      <SetupStep n={1} title={t('devices.add.nameStep')}>
        {created ? (
          <Alert color="green" variant="light" icon={<IconCheck size={16} />} p="xs">
            <Text size="sm">{t('devices.add.created', { name: created.name })}</Text>
          </Alert>
        ) : (
          <>
            <Group align="flex-end" wrap="nowrap" gap="xs">
              <TextInput label={t('fields.name')} value={name} onChange={(e) => setName(e.currentTarget.value)} required data-autofocus style={{ flex: 1 }} />
              <Button
                loading={save.isPending}
                disabled={!name.trim()}
                onClick={() => save.mutate({ data: { name: name.trim(), type: kind === 'ispindel' ? 'ispindel' : 'other' } }, { onSuccess: (device) => setCreated(device), onError: notifyError })}
              >
                {t('devices.add.create')}
              </Button>
            </Group>
          </>
        )}
      </SetupStep>
      {kind === 'ispindel' ? <IspindelSteps url={url} /> : <HttpSteps url={url} />}
      {created && <DoneButton onDone={onDone} />}
    </Stack>
  );
}

/**
 * What to enter on the iSpindel's configuration page (labels as the iSpindel firmware shows them).
 * Its "HTTPS Post" service joins Server Address and Path / URI and has no port; "HTTP" has a port.
 */
function IspindelSteps({ url }: { url: string | null }) {
  const { t } = useTranslation();
  const u = new URL(url ?? `${window.location.origin}/`);
  const https = u.protocol === 'https:';

  return (
    <>
      <SetupStep n={2} title={t('devices.add.ispindel.configTitle')}>
        <Text size="sm">{t('devices.add.ispindel.configText')}</Text>
      </SetupStep>
      <SetupStep n={3} title={t('devices.add.ispindel.enterTitle')}>
        <Stack gap={6}>
          <FixedRow label={t('devices.add.ispindel.serviceType')}>{https ? 'HTTPS Post' : 'HTTP'}</FixedRow>
          {/* The server's address is known now; the path holds the device's key, made in step 1. */}
          <CopyRow label={t('devices.add.ispindel.serverAddress')} value={https ? u.origin : u.hostname} />
          {!https && <CopyRow label={t('devices.add.ispindel.serverPort')} value={u.port || '80'} />}
          <CopyRow label={t('devices.add.ispindel.path')} value={url ? u.pathname : null} />
        </Stack>
        <List size="sm" spacing={2}>
          <List.Item>{t('devices.add.ispindel.token')}</List.Item>
          <List.Item>{t('devices.add.ispindel.polynomial')}</List.Item>
          <List.Item>{t('devices.add.ispindel.interval')}</List.Item>
        </List>
        {https && (
          <Text size="xs" c="dimmed">
            {t('devices.add.ispindel.httpsNote')}
          </Text>
        )}
      </SetupStep>
      <SetupStep n={4} title={t('devices.add.checkTitle')}>
        <Text size="sm">{t('devices.add.ispindel.checkText')}</Text>
      </SetupStep>
    </>
  );
}

/** What a script or other device should send. */
function HttpSteps({ url }: { url: string | null }) {
  const { t } = useTranslation();
  const example = '{ "gravity": 1.048, "temperature": 19.5, "battery": 95 }';
  const curl = url ? `curl -X POST "${url}" -H "Content-Type: application/json" -d '{"gravity": 1.048, "temperature": 19.5}'` : null;

  return (
    <>
      <SetupStep n={2} title={t('devices.add.http.sendTitle')}>
        <Stack gap={6}>
          <CopyRow label={t('devices.add.http.url')} value={url} />
          <FixedRow label={t('devices.add.http.method')}>POST</FixedRow>
          <FixedRow label={t('devices.add.http.contentType')}>application/json</FixedRow>
        </Stack>
        <Text size="sm">{t('devices.add.http.example')}</Text>
        <Code block>{example}</Code>
        <Text size="xs" c="dimmed">
          {t('devices.add.http.fields')}
        </Text>
      </SetupStep>
      <SetupStep n={3} title={t('devices.add.checkTitle')}>
        <Text size="sm">{t('devices.add.http.testText')}</Text>
        <CopyRow label="curl" value={curl} />
        <Text size="sm">{t('devices.add.http.checkText')}</Text>
      </SetupStep>
    </>
  );
}
