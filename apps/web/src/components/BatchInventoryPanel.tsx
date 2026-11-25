import { Alert, Badge, Button, CopyButton, Group, Loader, Stack, Table, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconArrowBackUp, IconCheck, IconClipboard, IconPackageExport, IconShoppingCart } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { BatchInventoryLine } from '@brew/shared';
import { useBatchInventory, useBatchInventoryAction } from '../data';
import { notifyError } from '../lib/notify';
import { useAmountFormat } from './amount';
import { useDateFormat } from './batch-ui';

/**
 * What a batch needs from the inventory: in stock or missing (the shopping list), and taking it
 * out of stock (with undo).
 */
export function BatchInventoryPanel({ batchId, compact }: { batchId: string; compact?: boolean }) {
  const { t } = useTranslation();
  const plan = useBatchInventory(batchId);
  const act = useBatchInventoryAction(batchId);
  const fmtAmount = useAmountFormat();
  const dates = useDateFormat();
  if (plan.isPending) return <Loader size="sm" />;
  if (!plan.data) return null;
  const { lines, deductedAt } = plan.data;
  const short = lines.filter((l) => l.short > 1e-9);
  const covered = lines.filter((l) => l.takes.length > 0);
  const amount = (l: BatchInventoryLine, v: number) => fmtAmount(v, l.kind, l.amountKind);
  /** Where it comes from, when that says more than the line itself: another name or a lot. */
  const takeText = (l: BatchInventoryLine) =>
    l.takes
      .map((tk) => [tk.name.trim().toLowerCase() !== l.name.trim().toLowerCase() ? tk.name : null, tk.lot ? t('inventory.lotShort', { lot: tk.lot }) : null].filter(Boolean).join(' · '))
      .filter(Boolean)
      .join(', ');
  const shoppingList = short.map((l) => `${l.name}: ${amount(l, l.short)}`).join('\n');

  const deduct = () =>
    modals.openConfirmModal({
      title: t('batchInventory.deductTitle'),
      children: <Text size="sm">{short.length ? t('batchInventory.deductShort', { count: short.length }) : t('batchInventory.deductText')}</Text>,
      labels: { confirm: t('batchInventory.deduct'), cancel: t('common.cancel') },
      onConfirm: () => act.mutate('deduct', { onError: notifyError }),
    });

  return (
    <Stack gap="sm">
      {deductedAt ? (
        <Alert color="green" icon={<IconCheck size={18} />} p="xs">
          <Group justify="space-between" gap="xs">
            <Text size="sm">{t('batchInventory.deducted', { date: dates.dateTime(deductedAt) })}</Text>
            <Button size="xs" variant="subtle" leftSection={<IconArrowBackUp size={14} />} loading={act.isPending} onClick={() => act.mutate('undo', { onError: notifyError })}>
              {t('batchInventory.undo')}
            </Button>
          </Group>
        </Alert>
      ) : (
        <Group justify="space-between" gap="xs">
          <Text size="sm" c="dimmed">
            {lines.length === 0
              ? t('batchInventory.nothing')
              : short.length === 0
                ? t('batchInventory.allInStock')
                : t('batchInventory.someShort', { count: short.length, total: lines.length })}
          </Text>
          <Button size={compact ? 'md' : 'xs'} variant="light" leftSection={<IconPackageExport size={16} />} disabled={!covered.length} loading={act.isPending} onClick={deduct}>
            {t('batchInventory.deduct')}
          </Button>
        </Group>
      )}

      {!compact && lines.length > 0 && (
        <Table.ScrollContainer minWidth={360}>
          <Table verticalSpacing={4} className="tabular">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('batchInventory.ingredient')}</Table.Th>
                <Table.Th ta="right">{t('batchInventory.needed')}</Table.Th>
                <Table.Th ta="right">{t('batchInventory.inStock')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {lines.map((l) => (
                <Table.Tr key={l.key}>
                  <Table.Td>
                    <Text size="sm">{l.name}</Text>
                    {takeText(l) && (
                      <Text size="xs" c="dimmed">
                        {takeText(l)}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td ta="right">
                    <Text size="sm">{amount(l, l.needed)}</Text>
                  </Table.Td>
                  <Table.Td ta="right">
                    {l.short > 1e-9 ? (
                      <Badge color="orange" variant="light">
                        {t('batchInventory.short', { amount: amount(l, l.short) })}
                      </Badge>
                    ) : (
                      <IconCheck size={16} color="var(--mantine-color-green-6)" />
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      {!deductedAt && short.length > 0 && (
        <Group gap="xs">
          <IconShoppingCart size={16} />
          <Text size="sm" fw={600}>
            {t('batchInventory.shoppingList')}
          </Text>
          <CopyButton value={shoppingList}>
            {({ copied, copy }) => (
              <Button size="xs" variant="subtle" leftSection={copied ? <IconCheck size={14} /> : <IconClipboard size={14} />} onClick={copy}>
                {copied ? t('batchInventory.copied') : t('batchInventory.copy')}
              </Button>
            )}
          </CopyButton>
          {compact && (
            <Text size="sm" c="dimmed" w="100%">
              {short.map((l) => `${l.name} ${amount(l, l.short)}`).join(' · ')}
            </Text>
          )}
        </Group>
      )}
    </Stack>
  );
}
