import { Button, Group, NativeSelect, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconArrowBackUp } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MAX_TRASH_DAYS, type TrashKind, type TrashRestoreDto, type TrashUndoInput } from '@brew/shared';
import { api } from '../api';
import { useSettings, useUpdateSettings } from '../data';
import { notifyError, notifyOk } from '../lib/notify';

/**
 * The sentence delete confirmations end with: how long it can be restored from the trash, or
 * that it can't when the trash is off.
 */
export function useTrashNote(): string {
  const { t } = useTranslation();
  const days = useSettings().data?.trashDays;
  if (days == null) return '';
  return days > 0 ? t('trash.note', { count: days }) : t('trash.noteOff');
}

/** Choices for how long deleted things are kept (the current value is added if it is another one). */
const DAY_CHOICES = [0, 1, 7, 14, 30, 60, 90, 180, MAX_TRASH_DAYS];

/** How long deleted things stay in the trash (a brewery setting); saved when changed. */
export function TrashKeepFor() {
  const { t } = useTranslation();
  const settings = useSettings();
  const update = useUpdateSettings();
  const value = settings.data?.trashDays;
  if (value == null) return null;
  const choices = [...new Set([...DAY_CHOICES, value])].sort((a, b) => a - b);

  const change = (next: number) => {
    const save = () => update.mutate({ trashDays: next }, { onSuccess: () => notifyOk(t('trash.keepSaved')), onError: notifyError });
    // A shorter time deletes what is older right away.
    if (value > 0 && (next === 0 || next < value)) {
      modals.openConfirmModal({
        title: t('trash.shorter.title'),
        children: <Text size="sm">{next === 0 ? t('trash.shorter.off') : t('trash.shorter.text', { count: next })}</Text>,
        labels: { confirm: t('common.save'), cancel: t('common.cancel') },
        confirmProps: { color: 'red' },
        onConfirm: save,
      });
    } else save();
  };

  return (
    <NativeSelect
      label={t('trash.keepFor')}
      maw={320}
      value={String(value)}
      disabled={update.isPending}
      onChange={(e) => change(Number(e.currentTarget.value))}
      data={choices.map((d) => ({ value: String(d), label: d === 0 ? t('trash.off') : t('trash.days', { count: d }) }))}
    />
  );
}

/**
 * Tells that something went to the trash, with an Undo button. Call it when the delete
 * succeeded; `onUndone` runs once it is back (e.g. to open it again). Nothing is shown when the
 * trash is off, since there is nothing to undo.
 */
export function useNotifyDeleted() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const days = useSettings().data?.trashDays;

  return (kind: TrashKind, itemId: string, name: string, onUndone?: () => void) => {
    if (days === 0) return;
    const id = `trashed-${kind}-${itemId}`;
    const undo = () => {
      notifications.hide(id);
      const input: TrashUndoInput = { kind, itemId };
      api<TrashRestoreDto>('/api/trash/undo', 'POST', input)
        .then(() => {
          // A restore can touch several areas (a batch brings back links to devices, stock, its vessel).
          void qc.invalidateQueries();
          notifyOk(t('trash.restored', { name }));
          onUndone?.();
        })
        .catch(notifyError);
    };
    notifications.show({
      id,
      autoClose: 8000,
      message: (
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Text size="sm" style={{ minWidth: 0 }}>
            {t('trash.moved', { name })}
          </Text>
          <Button size="compact-sm" variant="light" leftSection={<IconArrowBackUp size={14} />} onClick={undo} style={{ flexShrink: 0 }}>
            {t('trash.undo')}
          </Button>
        </Group>
      ),
    });
  };
}
