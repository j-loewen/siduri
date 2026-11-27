import { useState } from 'react';
import { ActionIcon, Anchor, Button, Center, Group, Loader, NativeSelect, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import { Link } from '@tanstack/react-router';
import {
  IconArrowBackUp,
  IconBooks,
  IconBottle,
  IconDeviceAnalytics,
  IconFlask2,
  IconNotebook,
  IconPackage,
  IconTool,
  IconTrash,
  IconTrashX,
  type Icon,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { TRASH_KINDS, type TrashItemDto, type TrashKind } from '@brew/shared';
import { useDeleteFromTrash, useRestoreFromTrash, useTrash } from '../data';
import { useDateFormat } from '../components/batch-ui';
import { PageHeader } from '../components/recipe-ui';
import { notifyError, notifyOk } from '../lib/notify';

const ICONS: Record<TrashKind, Icon> = {
  recipe: IconNotebook,
  batch: IconFlask2,
  inventory: IconPackage,
  library: IconBooks,
  equipment: IconTool,
  vessel: IconBottle,
  device: IconDeviceAnalytics,
};

const DAY = 24 * 3600_000;

export function TrashPage() {
  const { t } = useTranslation();
  const trash = useTrash();
  const remove = useDeleteFromTrash();
  const [kind, setKind] = useState<TrashKind | ''>('');
  const items = trash.data?.items ?? [];
  const shown = kind ? items.filter((i) => i.kind === kind) : items;
  const days = trash.data?.days;

  const emptyAll = () =>
    modals.openConfirmModal({
      title: t('trash.empty.title'),
      children: <Text size="sm">{t('trash.empty.text', { count: items.length })}</Text>,
      labels: { confirm: t('trash.empty.confirm'), cancel: t('common.cancel') },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate('all', { onError: notifyError }),
    });

  return (
    <>
      <PageHeader
        title={t('trash.title')}
        subtitle={
          days == null ? undefined : (
            <>
              {days > 0 ? t('trash.subtitle', { count: days }) : t('trash.subtitleOff')}{' '}
              <Anchor component={Link} to="/settings" size="sm">
                {t('trash.change')}
              </Anchor>
            </>
          )
        }
        actions={
          items.length > 0 && (
            <Button variant="light" color="red" leftSection={<IconTrashX size={18} />} onClick={emptyAll}>
              {t('trash.empty.button')}
            </Button>
          )
        }
      />
      <Stack>
        {trash.isPending ? (
          <Center py="xl">
            <Loader />
          </Center>
        ) : items.length === 0 ? (
          <Stack align="center" py="xl" gap="xs">
            <IconTrash size={40} stroke={1.3} color="var(--mantine-color-dimmed)" />
            <Text c="dimmed" ta="center">
              {t('trash.nothing')}
            </Text>
          </Stack>
        ) : (
          <>
            <NativeSelect
              aria-label={t('trash.filter')}
              w={220}
              value={kind}
              onChange={(e) => setKind(e.currentTarget.value as TrashKind | '')}
              data={[
                { value: '', label: t('trash.all', { count: items.length }) },
                ...TRASH_KINDS.filter((k) => items.some((i) => i.kind === k)).map((k) => ({
                  value: k,
                  label: `${t(`trash.kinds.${k}`)} (${items.filter((i) => i.kind === k).length})`,
                })),
              ]}
            />
            <Paper withBorder radius="md">
              {shown.map((item, i) => (
                <TrashRow key={item.id} item={item} first={i === 0} />
              ))}
            </Paper>
          </>
        )}
      </Stack>
    </>
  );
}

function TrashRow({ item, first }: { item: TrashItemDto; first: boolean }) {
  const { t } = useTranslation();
  const fmt = useDateFormat();
  const restore = useRestoreFromTrash();
  const remove = useDeleteFromTrash();
  const KindIcon = ICONS[item.kind];
  const detail = useDetail(item);
  const left = Math.max(0, Math.ceil((Date.parse(item.purgeAt) - Date.now()) / DAY));

  const deleteForGood = () =>
    modals.openConfirmModal({
      title: t('trash.deleteForGood.title'),
      children: <Text size="sm">{t('trash.deleteForGood.text', { name: item.name })}</Text>,
      labels: { confirm: t('trash.deleteForGood.confirm'), cancel: t('common.cancel') },
      confirmProps: { color: 'red' },
      onConfirm: () => remove.mutate(item.id, { onError: notifyError }),
    });

  return (
    <Group
      wrap="nowrap"
      gap="sm"
      px={{ base: 'sm', sm: 'md' }}
      py="sm"
      style={first ? undefined : { borderTop: '1px solid var(--mantine-color-default-border)' }}
    >
      <KindIcon size={22} stroke={1.5} style={{ flexShrink: 0, color: 'var(--mantine-color-dimmed)' }} />
      <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
        <Text fw={500} truncate>
          {item.name}
        </Text>
        <Text size="xs" c="dimmed" truncate>
          {[t(`trash.kinds.${item.kind}`), detail].filter(Boolean).join(' · ')}
        </Text>
        <Text size="xs" c="dimmed">
          {t('trash.deletedAt', { date: fmt.dateTime(item.deletedAt) })} · {left > 0 ? t('trash.goneIn', { count: left }) : t('trash.goneSoon')}
        </Text>
      </Stack>
      <Group gap={4} wrap="nowrap">
        <Button
          variant="light"
          size="xs"
          leftSection={<IconArrowBackUp size={16} />}
          loading={restore.isPending}
          onClick={() => restore.mutate(item.id, { onSuccess: () => notifyOk(t('trash.restored', { name: item.name })), onError: notifyError })}
        >
          {t('trash.restore')}
        </Button>
        <Tooltip label={t('trash.deleteForGood.confirm')}>
          <ActionIcon variant="subtle" color="red" onClick={deleteForGood} aria-label={`${t('trash.deleteForGood.confirm')}: ${item.name}`}>
            <IconTrashX size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  );
}

/** The detail the server sends, as a label: a style, `#12`, or the kind of a library item, vessel or device. */
function useDetail(item: TrashItemDto): string {
  const { t } = useTranslation();
  if (!item.detail) return '';
  switch (item.kind) {
    case 'inventory':
    case 'library':
      return t(`library.kind.${item.detail}`);
    case 'vessel':
      return t(`vessels.kinds.${item.detail}`);
    case 'device':
      return t(`devices.types.${item.detail}`);
    default:
      return item.detail;
  }
}
