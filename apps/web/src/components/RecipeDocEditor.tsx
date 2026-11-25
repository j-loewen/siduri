import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Grid, Group, Loader, Modal, NumberInput, Stack, Text, Textarea, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconCloudUpload } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { scaleRecipe, type RecipeCalc } from '@brew/brewcalc';
import type { RecipeDoc } from '@brew/shared';
import { ApiError } from '../api';
import { notifyError } from '../lib/notify';
import { UnitInput } from '../units';
import { CulturesSection, FermentablesSection, FermentationSection, HopsSection, MashSection, MiscsSection, SetupSection, VolumesSection, type Update } from './RecipeSections';
import { Section, StatsBar } from './recipe-ui';
import { WaterSection } from './WaterSection';

const SAVE_DELAY_MS = 800;
export type SaveState = 'saved' | 'pending' | 'saving' | 'conflict' | 'error';

/**
 * Edits a local copy of a recipe document and saves it shortly after each change: one save at a
 * time, with the version for conflict detection. Used for recipes and for batches.
 */
export function useDocAutosave(initial: { doc: RecipeDoc; version: number }, save: (doc: RecipeDoc, version: number) => Promise<{ version: number }>) {
  const [doc, setDoc] = useState<RecipeDoc>(initial.doc);
  const [state, setState] = useState<SaveState>('saved');
  const version = useRef(initial.version);
  const latest = useRef(doc);
  const dirty = useRef(false);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saveRef = useRef(save);
  saveRef.current = save;

  const flush = useCallback(async (): Promise<void> => {
    clearTimeout(timer.current);
    if (!dirty.current || inFlight.current) return;
    dirty.current = false;
    inFlight.current = true;
    setState('saving');
    try {
      const saved = await saveRef.current(latest.current, version.current);
      version.current = saved.version;
      setState(dirty.current ? 'pending' : 'saved');
    } catch (err) {
      dirty.current = true;
      setState(err instanceof ApiError && err.status === 409 ? 'conflict' : 'error');
      if (!(err instanceof ApiError && err.status === 409)) notifyError(err);
      inFlight.current = false;
      return;
    }
    inFlight.current = false;
    if (dirty.current) await flush();
  }, []);

  const update: Update = useCallback(
    (fn) => {
      setDoc((prev) => {
        const next = fn(prev);
        latest.current = next;
        return next;
      });
      dirty.current = true;
      setState((s) => (s === 'conflict' ? s : 'pending'));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );

  // Save what is left when leaving the page or closing the tab.
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        void flush();
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      void flush();
    };
  }, [flush]);

  return { doc, update, state, flush };
}

/** The editor body: key numbers, ingredients, process, setup and volumes. */
export function RecipeBody({ doc, calc, update }: { doc: RecipeDoc; calc: RecipeCalc; update: Update }) {
  const { t } = useTranslation();
  return (
    <>
      <StatsBar calc={calc} style={doc.style} />
      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Stack gap="md">
            <FermentablesSection doc={doc} calc={calc} update={update} />
            <HopsSection doc={doc} calc={calc} update={update} />
            <CulturesSection doc={doc} calc={calc} update={update} />
            <MiscsSection doc={doc} update={update} />
            <MashSection doc={doc} calc={calc} update={update} />
            <FermentationSection doc={doc} update={update} />
            <WaterSection doc={doc} calc={calc} update={update} />
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Stack gap="md">
            <SetupSection doc={doc} update={update} />
            <VolumesSection doc={doc} calc={calc} />
            <Section title={t('recipe.notes')}>
              <Textarea autosize minRows={4} value={doc.notes} onChange={(e) => update((d) => ({ ...d, notes: e.currentTarget.value }))} aria-label={t('recipe.notes')} />
            </Section>
          </Stack>
        </Grid.Col>
      </Grid>
    </>
  );
}

export function ConflictAlert({ state }: { state: SaveState }) {
  const { t } = useTranslation();
  if (state !== 'conflict') return null;
  return (
    <Alert color="orange" icon={<IconAlertTriangle size={18} />} title={t('recipe.conflict.title')}>
      <Group justify="space-between" gap="xs">
        <Text size="sm">{t('recipe.conflict.text')}</Text>
        <Button size="xs" variant="light" onClick={() => window.location.reload()}>
          {t('recipe.conflict.reload')}
        </Button>
      </Group>
    </Alert>
  );
}

export function SaveIndicator({ state }: { state: SaveState }) {
  const { t } = useTranslation();
  const saved = state === 'saved';
  return (
    <Tooltip label={t(`recipe.save.${state}`)}>
      <Group gap={4} c={state === 'error' || state === 'conflict' ? 'red' : 'dimmed'} wrap="nowrap" visibleFrom="xs">
        {saved ? <IconCheck size={16} /> : state === 'saving' || state === 'pending' ? <Loader size={14} /> : <IconCloudUpload size={16} />}
        <Text size="xs">{t(`recipe.save.${state}`)}</Text>
      </Group>
    </Tooltip>
  );
}

export function ScaleModal({ opened, onClose, doc, onScale }: { opened: boolean; onClose: () => void; doc: RecipeDoc; onScale: (d: RecipeDoc) => void }) {
  const { t } = useTranslation();
  const [size, setSize] = useState<number | null>(doc.batchSizeL);
  const [eff, setEff] = useState<number | string>(doc.efficiencyPct);
  useEffect(() => {
    if (opened) {
      setSize(doc.batchSizeL);
      setEff(doc.efficiencyPct);
    }
  }, [opened, doc.batchSizeL, doc.efficiencyPct]);
  return (
    <Modal opened={opened} onClose={onClose} title={t('recipe.scale.title')}>
      <Stack>
        <Text size="sm" c="dimmed">
          {t('recipe.scale.text')}
        </Text>
        <UnitInput measure="volume" label={t('recipe.setup.batchSize')} value={size} onChange={setSize} min={0.1} />
        <NumberInput label={t('recipe.setup.efficiency')} value={eff} onChange={setEff} suffix="%" min={10} max={100} />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!size}
            onClick={() => {
              onScale(scaleRecipe(doc, size!, Math.min(100, Math.max(10, Number(eff) || doc.efficiencyPct))));
              onClose();
            }}
          >
            {t('recipe.scale.apply')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
