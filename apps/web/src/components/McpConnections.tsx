import { useState } from 'react';
import { ActionIcon, Alert, Button, Code, CopyButton, Group, List, Modal, SegmentedControl, Stack, Tabs, Text, TextInput, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconAlertTriangle, IconCheck, IconCopy, IconPlus, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { APP_ID, MCP_PATH, TOKEN_LEVELS, type CreatedTokenDto, type TokenLevel } from '@brew/shared';
import { useCreateToken, useDeleteToken, useTokens, useUpdateToken } from '../data';
import { notifyError } from '../lib/notify';
import { useDateFormat } from './batch-ui';

/** The MCP endpoint as this browser reaches the app (the same address works for Claude on this network). */
const mcpUrl = () => `${window.location.origin}${MCP_PATH}`;

function LevelControl({ value, onChange }: { value: TokenLevel; onChange: (level: TokenLevel) => void }) {
  const { t } = useTranslation();
  return (
    <SegmentedControl
      size="xs"
      value={value}
      onChange={(v) => onChange(v as TokenLevel)}
      data={TOKEN_LEVELS.map((l) => ({ value: l, label: t(`settings.mcp.levels.${l}`) }))}
    />
  );
}

/**
 * Settings → Claude & AI assistants: access tokens for the MCP server, each with its own level
 * (read / read & write / everything), and how to connect Claude Code or Claude Desktop.
 */
export function McpConnections() {
  const { t } = useTranslation();
  const tokens = useTokens();
  const update = useUpdateToken();
  const remove = useDeleteToken();
  const dates = useDateFormat();
  const [creating, setCreating] = useState(false);

  const revoke = (id: string, name: string) =>
    modals.openConfirmModal({
      title: t('settings.mcp.revoke.title'),
      children: <Text size="sm">{t('settings.mcp.revoke.text', { name })}</Text>,
      labels: { confirm: t('settings.mcp.revoke.confirm'), cancel: t('common.cancel') },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(id, { onError: notifyError }),
    });

  return (
    <Stack gap="sm">
      <List size="sm" c="dimmed" spacing={2}>
        {TOKEN_LEVELS.map((l) => (
          <List.Item key={l}>
            <Text span size="sm" fw={600} c="var(--mantine-color-text)">
              {t(`settings.mcp.levels.${l}`)}
            </Text>
            {': '}
            {t(`settings.mcp.levelHints.${l}`)}
          </List.Item>
        ))}
      </List>

      {(tokens.data ?? []).map((tok) => (
        <Group key={tok.id} justify="space-between" gap="sm" wrap="wrap" className="token-row">
          <Stack gap={0} style={{ minWidth: 0, flex: '1 1 200px' }}>
            <Text fw={600} size="sm" truncate>
              {tok.name}
            </Text>
            <Text size="xs" c="dimmed">
              {[t('settings.mcp.created', { date: dates.date(tok.createdAt) }), tok.lastUsedAt ? t('settings.mcp.lastUsed', { date: dates.dateTime(tok.lastUsedAt) }) : t('settings.mcp.neverUsed')].join(' · ')}
            </Text>
          </Stack>
          <Group gap="xs" wrap="nowrap">
            <LevelControl value={tok.level} onChange={(level) => update.mutate({ id: tok.id, patch: { level } }, { onError: notifyError })} />
            <Tooltip label={t('settings.mcp.revoke.confirm')}>
              <ActionIcon variant="subtle" color="red" onClick={() => revoke(tok.id, tok.name)} aria-label={`${t('settings.mcp.revoke.confirm')}: ${tok.name}`}>
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      ))}
      {tokens.data?.length === 0 && (
        <Text size="sm" c="dimmed">
          {t('settings.mcp.none')}
        </Text>
      )}
      <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => setCreating(true)} w="fit-content">
        {t('settings.mcp.new')}
      </Button>
      <NewConnectionModal opened={creating} onClose={() => setCreating(false)} />
    </Stack>
  );
}

function CopyBlock({ value }: { value: string }) {
  const { t } = useTranslation();
  return (
    <Group gap={6} wrap="nowrap" align="flex-start">
      <Code block style={{ flex: 1, minWidth: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {value}
      </Code>
      <CopyButton value={value}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? t('settings.mcp.copied') : t('settings.mcp.copy')}>
            <ActionIcon variant="light" color={copied ? 'green' : undefined} onClick={copy} aria-label={t('settings.mcp.copy')}>
              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Group>
  );
}

/** Create a token, then show it once together with ready-to-paste setups for Claude Code and Claude Desktop. */
function NewConnectionModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const create = useCreateToken();
  const [name, setName] = useState('Claude Code');
  const [level, setLevel] = useState<TokenLevel>('write');
  const [created, setCreated] = useState<CreatedTokenDto | null>(null);

  const close = () => {
    setCreated(null);
    setName('Claude Code');
    setLevel('write');
    onClose();
  };

  const url = mcpUrl();
  const code = created ? `claude mcp add --transport http ${APP_ID} ${url} --header "Authorization: Bearer ${created.token}"` : '';
  // mcp-remote bridges Claude Desktop (stdio) to the HTTP endpoint; plain http on the network needs --allow-http.
  const desktop = created
    ? JSON.stringify(
        {
          mcpServers: {
            [APP_ID]: {
              command: 'npx',
              args: ['-y', 'mcp-remote', url, ...(url.startsWith('http://') ? ['--allow-http'] : []), '--header', 'Authorization:${SIDURI_AUTH}'],
              env: { SIDURI_AUTH: `Bearer ${created.token}` },
            },
          },
        },
        null,
        2,
      )
    : '';

  return (
    <Modal opened={opened} onClose={close} title={t('settings.mcp.new')} size="lg">
      {!created ? (
        <Stack>
          <TextInput label={t('settings.mcp.name')} description={t('settings.mcp.nameHint')} value={name} onChange={(e) => setName(e.currentTarget.value)} data-autofocus />
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              {t('settings.mcp.level')}
            </Text>
            <LevelControl value={level} onChange={setLevel} />
            <Text size="xs" c="dimmed">
              {t(`settings.mcp.levelHints.${level}`)}
            </Text>
          </Stack>
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button loading={create.isPending} disabled={!name.trim()} onClick={() => create.mutate({ name: name.trim(), level }, { onSuccess: setCreated, onError: notifyError })}>
              {t('settings.mcp.create')}
            </Button>
          </Group>
        </Stack>
      ) : (
        <Stack>
          <Alert color="orange" icon={<IconAlertTriangle size={18} />} p="xs">
            <Text size="sm">{t('settings.mcp.copyNow')}</Text>
          </Alert>
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              {t('settings.mcp.token')}
            </Text>
            <CopyBlock value={created.token} />
          </Stack>
          <Tabs defaultValue="code">
            <Tabs.List>
              <Tabs.Tab value="code">Claude Code</Tabs.Tab>
              <Tabs.Tab value="desktop">Claude Desktop</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="code" pt="sm">
              <Stack gap="xs">
                <Text size="sm">{t('settings.mcp.codeHint')}</Text>
                <CopyBlock value={code} />
              </Stack>
            </Tabs.Panel>
            <Tabs.Panel value="desktop" pt="sm">
              <Stack gap="xs">
                <Text size="sm">{t('settings.mcp.desktopHint')}</Text>
                <CopyBlock value={desktop} />
              </Stack>
            </Tabs.Panel>
          </Tabs>
          <Text size="xs" c="dimmed">
            {t('settings.mcp.urlHint', { url })}
          </Text>
          <Group justify="flex-end">
            <Button onClick={close}>{t('recipe.line.done')}</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
