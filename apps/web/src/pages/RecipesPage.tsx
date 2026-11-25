import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Badge, Button, Card, Center, Group, Loader, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconFileImport, IconPlus, IconSearch } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { newRecipeDoc, type RecipeSummaryDto } from '@brew/shared';
import { newId } from '../api';
import { useCreateRecipe, useEquipment, useLibrary, useRecipes, useSettings } from '../data';
import { ImportModal } from '../components/ImportModal';
import { PageHeader } from '../components/recipe-ui';
import { RecipeThumb } from '../components/RecipeImage';
import { notifyError } from '../lib/notify';
import { useFormat } from '../units';

export function RecipesPage() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [debounced] = useDebouncedValue(q.trim(), 250);
  const recipes = useRecipes(debounced);
  const [importing, setImporting] = useState(false);
  const newRecipe = useNewRecipe();

  return (
    <>
      <PageHeader
        title={t('recipes.title')}
        actions={
          <>
            <Button variant="default" leftSection={<IconFileImport size={18} />} onClick={() => setImporting(true)}>
              {t('import.button')}
            </Button>
            <Button leftSection={<IconPlus size={18} />} onClick={newRecipe.create} loading={newRecipe.pending}>
              {t('recipes.new')}
            </Button>
          </>
        }
      />
      <TextInput
        placeholder={t('recipes.search')}
        leftSection={<IconSearch size={16} />}
        value={q}
        onChange={(e) => setQ(e.currentTarget.value)}
        mb="md"
        maw={420}
        aria-label={t('recipes.search')}
      />
      {recipes.isPending ? (
        <Center py="xl">
          <Loader />
        </Center>
      ) : recipes.data?.length ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3, xl: 4 }} spacing="sm">
          {recipes.data.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </SimpleGrid>
      ) : (
        <Stack align="center" py="xl" gap="xs">
          <Text c="dimmed">{debounced ? t('recipes.noMatches') : t('recipes.empty')}</Text>
          {!debounced && (
            <Group>
              <Button variant="light" onClick={newRecipe.create}>
                {t('recipes.new')}
              </Button>
              <Button variant="default" onClick={() => setImporting(true)}>
                {t('import.button')}
              </Button>
            </Group>
          )}
        </Stack>
      )}
      <ImportModal opened={importing} onClose={() => setImporting(false)} />
    </>
  );
}

/** Creates an empty recipe set up for the default equipment, then opens it. */
export function useNewRecipe() {
  const { t } = useTranslation();
  const create = useCreateRecipe();
  const navigate = useNavigate();
  const equipment = useEquipment();
  const settings = useSettings();
  const library = useLibrary('water');
  return {
    pending: create.isPending,
    create: () => {
      const doc = newRecipeDoc(t('recipes.untitled'));
      const eq = equipment.data?.find((e) => e.id === settings.data?.defaultEquipmentId);
      if (eq) {
        doc.equipment = { ...eq.data, libraryRef: eq.id };
        doc.batchSizeL = eq.data.batchVolumeL;
        doc.boilTimeMin = eq.data.boilTimeMin;
        doc.efficiencyPct = eq.data.brewhouseEfficiencyPct;
        if (eq.data.method === 'extract') doc.type = 'extract';
      }
      const water = library.data?.find((w) => w.id === settings.data?.defaultSourceWaterId);
      if (water) {
        const { calcium, magnesium, sodium, sulfate, chloride, bicarbonate } = water.data;
        doc.water = { ...doc.water, source: { libraryRef: water.id, name: water.name, calcium, magnesium, sodium, sulfate, chloride, bicarbonate } };
      }
      doc.mash.steps = [{ id: newId(), name: t('recipe.mash.defaultStep'), type: 'infusion', tempC: 67, timeMin: 60, rampMin: null, infuseL: null }];
      doc.fermentation = [{ id: newId(), name: t('recipe.fermentation.primary'), tempC: 19, days: 14, rampDays: null }];
      create.mutate(doc, {
        onSuccess: (r) => void navigate({ to: '/recipes/$recipeId', params: { recipeId: r.id } }),
        onError: notifyError,
      });
    },
  };
}

function RecipeCard({ recipe }: { recipe: RecipeSummaryDto }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  return (
    <Card withBorder radius="md" padding="md" className="clickable-row link-reset" renderRoot={(props) => <Link {...props} to="/recipes/$recipeId" params={{ recipeId: recipe.id }} />}>
      <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Text fw={600} truncate>
            {recipe.name}
          </Text>
          <Text size="sm" c="dimmed" truncate>
            {recipe.styleName ?? t('recipes.noStyle')}
          </Text>
        </Stack>
        <RecipeThumb image={recipe.image} colorEbc={recipe.colorEbc} size={48} />
      </Group>
      <Group gap={6} mt="sm">
        <Badge variant="light" color="gray" className="tabular">
          {t('stats.og')} {fmt.value(recipe.og, 'gravity')}
        </Badge>
        <Badge variant="light" color="gray" className="tabular">
          {fmt.num(recipe.abvPct, 1)}% {t('stats.abv')}
        </Badge>
        <Badge variant="light" color="gray" className="tabular">
          {fmt.num(recipe.ibu, 0)} {t('stats.ibu')}
        </Badge>
        <Badge variant="light" color="gray" className="tabular">
          {fmt(recipe.batchSizeL, 'volume', 0)}
        </Badge>
      </Group>
    </Card>
  );
}
