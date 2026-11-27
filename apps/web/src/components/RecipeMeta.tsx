import { useMemo, useState, type ReactNode } from 'react';
import { Button, Group, Modal, NumberInput, Select, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconAlertTriangle, IconAward, IconRefresh, IconTool } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { RecipeCalc } from '@brew/brewcalc';
import { DEFAULT_EQUIPMENT, type EquipmentData, type RecipeDoc } from '@brew/shared';
import { useEquipment, useLibrary } from '../data';
import { UnitInput, useFormat } from '../units';
import { EquipmentFields } from './EquipmentFields';
import { FitWarnings, useFitWarnings, type FitWarning } from './FitWarnings';
import { LineModal, type Update } from './RecipeSections';

const OWN_STYLE = '__recipe-style__';
const clampEff = (v: string | number) => Math.min(100, Math.max(10, Number(v) || 72));

/** Equipment values a recipe can adjust for itself (batch size, boil time and efficiency live on the recipe). */
const ADJUSTABLE: (keyof EquipmentData)[] = [
  'method',
  'mashTunVolumeL',
  'mashTunDeadspaceL',
  'mashTunRecoverableL',
  'mashThicknessLPerKg',
  'grainAbsorptionLPerKg',
  'grainTempC',
  'kettleVolumeL',
  'boilOffLPerH',
  'kettleLossL',
  'coolingShrinkagePct',
  'hopUtilizationPct',
  'topUpWaterL',
  'fermenterLossL',
];

function MetaChip({ icon, children, onClick, warn, muted, label }: { icon: ReactNode; children: ReactNode; onClick: () => void; warn?: boolean; muted?: boolean; label: string }) {
  return (
    <UnstyledButton className="meta-chip" data-warn={warn || undefined} data-muted={muted || undefined} onClick={onClick} aria-label={label}>
      {warn ? <IconAlertTriangle size={15} /> : icon}
      <span className="meta-chip-text">{children}</span>
    </UnstyledButton>
  );
}

/**
 * Style and equipment of a recipe in one quiet row (under its name). Each opens a popup to change it.
 */
export function RecipeMetaRow({ doc, calc, update }: { doc: RecipeDoc; calc: RecipeCalc; update: Update }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const [open, setOpen] = useState<'style' | 'equipment' | null>(null);
  const warnings = useFitWarnings(doc, calc);
  const style = doc.style;

  return (
    <>
      <Group gap={6} wrap="wrap">
        <MetaChip icon={<IconAward size={15} />} onClick={() => setOpen('style')} muted={!style} label={t('recipe.setup.style')}>
          {style ? `${style.categoryNumber}${style.styleLetter} ${style.name}`.trim() : t('recipe.setup.stylePlaceholder')}
        </MetaChip>
        <MetaChip icon={<IconTool size={15} />} onClick={() => setOpen('equipment')} warn={warnings.some((w) => w.level === 'warn')} label={t('recipe.setup.equipment')}>
          {[doc.equipment?.name ?? t('recipe.setup.noEquipment'), fmt(doc.batchSizeL, 'volume', 1), `${fmt.num(doc.efficiencyPct, 0)}%`, `${doc.boilTimeMin} min`].join(' · ')}
        </MetaChip>
      </Group>
      <StyleModal opened={open === 'style'} onClose={() => setOpen(null)} doc={doc} update={update} />
      <EquipmentModal opened={open === 'equipment'} onClose={() => setOpen(null)} doc={doc} update={update} warnings={warnings} />
    </>
  );
}

function StyleModal({ opened, onClose, doc, update }: { opened: boolean; onClose: () => void; doc: RecipeDoc; update: Update }) {
  const { t } = useTranslation();
  const styles = useLibrary('style', '', opened);
  // A style that is not linked to a library style (imported from a file, or deleted from the library).
  const ownStyle = Boolean(doc.style && styles.data && !styles.data.some((s) => s.id === doc.style!.libraryRef));
  return (
    <Modal opened={opened} onClose={onClose} title={t('recipe.setup.style')}>
      <Stack>
        <Select
          label={t('recipe.setup.style')}
          placeholder={t('recipe.setup.stylePlaceholder')}
          searchable
          clearable
          data-autofocus
          nothingFoundMessage={t('picker.nothing')}
          data={[
            ...(ownStyle ? [{ value: OWN_STYLE, label: t('recipe.setup.ownStyle', { name: doc.style!.name }) }] : []),
            ...(styles.data ?? []).map((s) => ({ value: s.id, label: [`${s.data.categoryNumber}${s.data.styleLetter} ${s.name}`.trim(), s.data.guide].filter(Boolean).join(' · ') })),
          ]}
          value={ownStyle ? OWN_STYLE : (doc.style?.libraryRef ?? null)}
          onChange={(id) => {
            if (id === OWN_STYLE) return;
            const s = styles.data?.find((x) => x.id === id);
            update((d) => ({
              ...d,
              style: s
                ? { libraryRef: s.id, name: s.data.name, guide: s.data.guide, category: s.data.category, categoryNumber: s.data.categoryNumber, styleLetter: s.data.styleLetter, og: s.data.og, fg: s.data.fg, ibu: s.data.ibu, colorEbc: s.data.colorEbc, abvPct: s.data.abvPct, carbVols: s.data.carbVols }
                : null,
            }));
          }}
          comboboxProps={{ withinPortal: true }}
        />
        {ownStyle && (
          <Text size="xs" c="dimmed">
            {t('recipe.setup.ownStyleHint')}
          </Text>
        )}
        <Group justify="flex-end">
          <Button onClick={onClose}>{t('recipe.line.done')}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function EquipmentModal({ opened, onClose, doc, update, warnings }: { opened: boolean; onClose: () => void; doc: RecipeDoc; update: Update; warnings: FitWarning[] }) {
  const { t } = useTranslation();
  const equipment = useEquipment();
  const profile = equipment.data?.find((e) => e.id === doc.equipment?.libraryRef);
  const values: EquipmentData = doc.equipment ?? DEFAULT_EQUIPMENT;
  const adjusted = Boolean(profile && doc.equipment && ADJUSTABLE.some((k) => doc.equipment![k] !== profile.data[k]));

  /** Changes to the recipe's own copy; without equipment, a custom one starts from the defaults. */
  const setValues = (patch: Partial<EquipmentData>) =>
    update((d) => ({ ...d, equipment: { ...(d.equipment ?? { ...DEFAULT_EQUIPMENT, name: t('recipe.setup.customEquipment'), libraryRef: null }), ...patch } }));

  return (
    <LineModal
      opened={opened}
      onClose={onClose}
      title={t('recipe.setup.equipment')}
      main={
        <Stack>
          <Select
            label={t('recipe.setup.equipmentProfile')}
            placeholder={t('recipe.setup.noEquipment')}
            clearable
            size="md"
            data={[
              ...(doc.equipment && !profile ? [{ value: '__own__', label: doc.equipment.name }] : []),
              ...(equipment.data ?? []).map((e) => ({ value: e.id, label: e.name })),
            ]}
            value={profile?.id ?? (doc.equipment ? '__own__' : null)}
            onChange={(id) => {
              if (id === '__own__') return;
              const e = equipment.data?.find((x) => x.id === id);
              update((d) =>
                e
                  ? { ...d, equipment: { ...e.data, libraryRef: e.id }, batchSizeL: e.data.batchVolumeL, boilTimeMin: e.data.boilTimeMin, efficiencyPct: e.data.brewhouseEfficiencyPct }
                  : { ...d, equipment: null },
              );
            }}
            description={doc.equipment ? t('recipe.setup.equipmentHint') : t('recipe.setup.noEquipmentHint')}
            comboboxProps={{ withinPortal: true }}
          />
          <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="sm">
            <UnitInput measure="volume" label={t('recipe.setup.batchSizeShort')} value={doc.batchSizeL} min={0.1} onChange={(v) => v && update((d) => ({ ...d, batchSizeL: v }))} size="md" />
            <NumberInput label={t('recipe.setup.efficiency')} value={doc.efficiencyPct} suffix="%" min={10} max={100} size="md" onChange={(v) => update((d) => ({ ...d, efficiencyPct: clampEff(v) }))} />
            <NumberInput label={t('recipe.setup.boilTime')} value={doc.boilTimeMin} suffix=" min" min={0} max={600} size="md" onChange={(v) => update((d) => ({ ...d, boilTimeMin: Math.max(0, Number(v) || 0) }))} />
          </SimpleGrid>
          <FitWarnings warnings={warnings} />
        </Stack>
      }
      details={
        <Stack>
          <Group justify="space-between" gap="xs" wrap="nowrap">
            <Text size="xs" c="dimmed">
              {adjusted ? t('recipe.setup.adjusted', { name: profile!.name }) : t('recipe.setup.adjustHint')}
            </Text>
            {adjusted && (
              <Button
                size="xs"
                variant="subtle"
                leftSection={<IconRefresh size={14} />}
                style={{ flex: 'none' }}
                onClick={() => update((d) => ({ ...d, equipment: d.equipment && { ...d.equipment, ...Object.fromEntries(ADJUSTABLE.map((k) => [k, profile!.data[k]])) } }))}
              >
                {t('recipe.setup.resetEquipment')}
              </Button>
            )}
          </Group>
          <EquipmentFields value={values} onChange={setValues} />
        </Stack>
      }
    />
  );
}
