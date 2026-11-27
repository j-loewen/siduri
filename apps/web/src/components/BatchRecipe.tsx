import { useMemo } from 'react';
import { Group, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { calculateRecipe } from '@brew/brewcalc';
import { useSaveBatchDoc, useVessels, type LoadedBatch } from '../data';
import { FermenterProvider } from './FitWarnings';
import { ConflictAlert, RecipeBody, SaveIndicator, useDocAutosave } from './RecipeDocEditor';
import { RecipeMetaRow } from './RecipeMeta';

/** The batch's own copy of the recipe, saved as it is edited. */
export function BatchRecipe({ batch }: { batch: LoadedBatch }) {
  const { t } = useTranslation();
  const save = useSaveBatchDoc();
  const { doc, update, state } = useDocAutosave(batch, (d, version) => save.mutateAsync({ id: batch.id, doc: d, version }));
  const calc = useMemo(() => calculateRecipe(doc), [doc]);
  // The batch's own fermenter: its size is checked instead of the equipment's.
  const vessels = useVessels();
  const vessel = vessels.data?.find((v) => v.id === batch.vesselId);
  const fermenter = useMemo(() => (vessel ? { name: vessel.name, capacityL: vessel.capacityL } : null), [vessel]);
  return (
    <FermenterProvider value={fermenter}>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={6} style={{ minWidth: 0 }}>
            <RecipeMetaRow doc={doc} calc={calc} update={update} />
            <Text size="sm" c="dimmed">
              {t('batches.recipeHint')}
            </Text>
          </Stack>
          <SaveIndicator state={state} />
        </Group>
        <ConflictAlert state={state} />
        <RecipeBody doc={doc} calc={calc} update={update} />
      </Stack>
    </FermenterProvider>
  );
}
