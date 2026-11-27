import { useMemo } from 'react';
import { Button, Group, List, Loader, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { modals } from '@mantine/modals';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { diffRecipes, type RecipeChange } from '@brew/shared';
import { usePatchBatch, useRecipe, useSaveBatchToRecipe, type LoadedBatch } from '../data';
import { notifyError, notifyOk } from '../lib/notify';
import { useFormat } from '../units';
import { BatchInventoryPanel } from './BatchInventoryPanel';
import { Section } from './recipe-ui';

/** Before brew day: when, what is in stock, and how the batch differs from its recipe. */
export function BatchPlanning({ batch }: { batch: LoadedBatch }) {
  const { t } = useTranslation();
  const patch = usePatchBatch();
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
      <Stack gap="md">
        <Section title={t('batches.planning.when')}>
          <TextInput
            label={t('batches.fields.brewDate')}
            type="date"
            value={batch.brewDate ?? ''}
            onChange={(e) => patch.mutate({ id: batch.id, patch: { brewDate: e.currentTarget.value || null } }, { onError: notifyError })}
            maw={220}
          />
        </Section>
        <DiffSection batch={batch} />
      </Stack>
      <Section title={t('batchInventory.title')}>
        <BatchInventoryPanel batchId={batch.id} />
      </Section>
    </SimpleGrid>
  );
}

function changeText(c: RecipeChange, t: TFunction, fmt: ReturnType<typeof useFormat>) {
  const value = (v: RecipeChange['from']) => {
    if (v == null) return '–';
    if (typeof v === 'string') return v;
    switch (c.field) {
      case 'amountKg':
        return c.section === 'hops' ? fmt(v, 'massSmall', 1) : fmt(v, 'massLarge');
      case 'batchSizeL':
        return fmt(v, 'volume', 1);
      case 'tempC':
        return fmt(v, 'temperature', 1);
      case 'colorEbc':
        return fmt(v, 'color', 1);
      default:
        return fmt.num(v, 3);
    }
  };
  if (c.kind === 'added') return t('batches.diff.added', { name: c.name });
  if (c.kind === 'removed') return t('batches.diff.removed', { name: c.name });
  if (c.section === 'notes') return t('batches.diff.notes');
  const field = t(`batches.diff.fields.${c.field}`, { defaultValue: c.field });
  return c.section === 'setup' ? t('batches.diff.setting', { field, from: value(c.from), to: value(c.to) }) : t('batches.diff.changed', { name: c.name, field, from: value(c.from), to: value(c.to) });
}

/** How the batch differs from its recipe, and saving the changes back. */
function DiffSection({ batch }: { batch: LoadedBatch }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const recipe = useRecipe(batch.recipeId ?? '');
  const save = useSaveBatchToRecipe(batch.id);
  const changes = useMemo(() => (recipe.data ? diffRecipes(recipe.data.doc, batch.doc) : []), [recipe.data, batch.doc]);

  const run = (mode: 'update' | 'new') =>
    save.mutate({ mode }, { onSuccess: () => notifyOk(mode === 'update' ? t('batches.diff.savedToRecipe') : t('batches.diff.savedAsNew')), onError: notifyError });

  return (
    <Section title={t('batches.diff.title')}>
      {!batch.recipeId ? (
        <Stack gap="xs">
          <Text size="sm" c="dimmed">
            {t('batches.diff.noRecipe')}
          </Text>
          <Button variant="light" onClick={() => run('new')} loading={save.isPending}>
            {t('batches.diff.saveAsNew')}
          </Button>
        </Stack>
      ) : recipe.isPending ? (
        <Loader size="sm" />
      ) : changes.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t('batches.diff.none')}
        </Text>
      ) : (
        <Stack gap="sm">
          <List size="sm" spacing={4}>
            {changes.slice(0, 30).map((c, i) => (
              <List.Item key={i}>{changeText(c, t, fmt)}</List.Item>
            ))}
          </List>
          <Group gap="xs">
            <Button
              variant="light"
              loading={save.isPending}
              onClick={() =>
                modals.openConfirmModal({
                  title: t('batches.diff.saveToRecipe'),
                  children: <Text size="sm">{t('batches.diff.confirmUpdate', { name: recipe.data?.doc.name })}</Text>,
                  labels: { confirm: t('common.save'), cancel: t('common.cancel') },
                  onConfirm: () => run('update'),
                })
              }
            >
              {t('batches.diff.saveToRecipe')}
            </Button>
            <Button variant="default" loading={save.isPending} onClick={() => run('new')}>
              {t('batches.diff.saveAsNew')}
            </Button>
          </Group>
        </Stack>
      )}
    </Section>
  );
}
