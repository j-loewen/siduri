import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button, Group, Modal, Select, Stack, Text, TextInput } from '@mantine/core';
import { fermenterFit, MIN_HEADSPACE_PCT } from '@brew/brewcalc';
import { FitWarnings } from './FitWarnings';
import { useTranslation } from 'react-i18next';
import { useCreateBatch, useEquipment, useRecipe, useRecipes, useSettings, useVessels } from '../data';
import { notifyError } from '../lib/notify';
import { useFormat } from '../units';

const KEEP = '__recipe__';

/**
 * Start a batch from a recipe: pick the equipment to brew on (the recipe is scaled to it) and an
 * optional brew date.
 */
export function NewBatchModal({ opened, onClose, recipeId: fixedRecipe }: { opened: boolean; onClose: () => void; recipeId?: string }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const navigate = useNavigate();
  const recipes = useRecipes();
  const equipment = useEquipment();
  const settings = useSettings();
  const create = useCreateBatch();
  const [recipeId, setRecipeId] = useState<string | null>(fixedRecipe ?? null);
  const recipe = useRecipe(recipeId ?? '');
  const [equipmentId, setEquipmentId] = useState<string>(KEEP);
  const [name, setName] = useState('');
  const [brewDate, setBrewDate] = useState('');
  const vessels = useVessels();
  const [vesselId, setVesselId] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    setRecipeId(fixedRecipe ?? null);
    setName('');
    setVesselId(null);
    setBrewDate(new Date().toISOString().slice(0, 10));
  }, [opened, fixedRecipe]);

  // Default: the recipe's own equipment, else the brewery default.
  const recipeEq = recipe.data?.doc.equipment?.libraryRef ?? null;
  useEffect(() => {
    if (!opened) return;
    setEquipmentId(recipeEq ?? settings.data?.defaultEquipmentId ?? KEEP);
  }, [opened, recipeEq, settings.data?.defaultEquipmentId]);

  const chosenEq = equipment.data?.find((e) => e.id === equipmentId);
  const doc = recipe.data?.doc;
  /** What goes into the fermenter: the equipment's batch size when the recipe is scaled to it. */
  const batchL = chosenEq && chosenEq.id !== recipeEq ? chosenEq.data.batchVolumeL : doc?.batchSizeL;
  const tooSmall = (capacityL: number | null) => batchL != null && fermenterFit(batchL, capacityL) === 'tooSmall';
  const chosenVessel = vessels.data?.find((v) => v.id === vesselId);
  const chosenFit = chosenVessel && batchL != null ? fermenterFit(batchL, chosenVessel.capacityL) : null;

  const submit = () => {
    if (!recipeId) return;
    create.mutate(
      { recipeId, equipmentId: equipmentId === KEEP ? null : equipmentId, vesselId, name: name.trim() || undefined, brewDate: brewDate || null },
      {
        onSuccess: (batch) => {
          onClose();
          void navigate({ to: '/batches/$batchId', params: { batchId: batch.id } });
        },
        onError: notifyError,
      },
    );
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t('batches.new')}>
      <Stack>
        {!fixedRecipe && (
          <Select
            label={t('batches.fields.recipe')}
            searchable
            data={(recipes.data ?? []).map((r) => ({ value: r.id, label: r.name }))}
            value={recipeId}
            onChange={setRecipeId}
            nothingFoundMessage={t('picker.nothing')}
            data-autofocus
          />
        )}
        <Select
          label={t('batches.fields.equipment')}
          data={[{ value: KEEP, label: t('batches.keepRecipeSize') }, ...(equipment.data ?? []).map((e) => ({ value: e.id, label: e.name }))]}
          value={equipmentId}
          onChange={(v) => setEquipmentId(v ?? KEEP)}
          allowDeselect={false}
        />
        {doc && (
          <Text size="sm" c="dimmed">
            {chosenEq && chosenEq.id !== recipeEq
              ? t('batches.scaleHint', { from: fmt(doc.batchSizeL, 'volume', 1), to: fmt(chosenEq.data.batchVolumeL, 'volume', 1), eff: chosenEq.data.brewhouseEfficiencyPct })
              : t('batches.sizeHint', { size: fmt(doc.batchSizeL, 'volume', 1), eff: doc.efficiencyPct })}
          </Text>
        )}
        <TextInput label={t('batches.fields.name')} placeholder={doc?.name} value={name} onChange={(e) => setName(e.currentTarget.value)} />
        <TextInput label={t('batches.fields.brewDate')} type="date" value={brewDate} onChange={(e) => setBrewDate(e.currentTarget.value)} />
        {(vessels.data?.length ?? 0) > 0 && (
          <Select
            label={t('batches.fields.vessel')}
            placeholder="–"
            clearable
            data={(vessels.data ?? []).filter((v) => v.kind === 'fermenter' || v.kind === 'other').map((v) => ({
              value: v.id,
              label: [
                v.currentBatch ? t('vessels.optionBusy', { name: v.name, number: v.currentBatch.number }) : v.name,
                tooSmall(v.capacityL) ? t('vessels.optionTooSmall', { capacity: fmt(v.capacityL!, 'volume', 0) }) : '',
              ]
                .filter(Boolean)
                .join(' · '),
            }))}
            value={vesselId}
            onChange={setVesselId}
          />
        )}
        {chosenVessel && chosenFit && batchL != null && (
          <FitWarnings
            warnings={[
              {
                vessel: 'fermenter',
                level: chosenFit === 'tooSmall' ? 'warn' : 'note',
                text: t(chosenFit === 'tooSmall' ? 'recipe.fit.vessel' : 'recipe.fit.headspaceVessel', {
                  need: fmt(batchL, 'volume', 1),
                  name: chosenVessel.name,
                  capacity: fmt(chosenVessel.capacityL!, 'volume', 1),
                  free: fmt(Math.max(0, chosenVessel.capacityL! - batchL), 'volume', 1),
                  pct: Math.max(0, Math.round(((chosenVessel.capacityL! - batchL) / chosenVessel.capacityL!) * 100)),
                  min: MIN_HEADSPACE_PCT,
                }),
              },
            ]}
          />
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={create.isPending} disabled={!recipeId}>
            {t('batches.create')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
