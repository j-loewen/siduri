import { createContext, useContext, useMemo } from 'react';
import { Alert, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { equipmentFit, MIN_HEADSPACE_PCT, type RecipeCalc } from '@brew/brewcalc';
import type { RecipeDoc } from '@brew/shared';
import { useFormat } from '../units';

/** The fermenter a batch is assigned to: its size counts instead of the equipment's fermenter. */
export interface AssignedFermenter {
  name: string;
  capacityL: number | null;
}

const FermenterContext = createContext<AssignedFermenter | null>(null);
/** Provided by a batch's recipe editor. */
export const FermenterProvider = FermenterContext.Provider;

/** Warnings for vessels that are too small: mash tun, kettle and fermenter. */
export function useFitWarnings(doc: RecipeDoc, calc: RecipeCalc) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const assigned = useContext(FermenterContext);
  return useMemo(
    () =>
      equipmentFit(doc.equipment, calc.volumes, assigned?.capacityL).map((issue) => {
        const free = issue.capacityL - issue.needL;
        const values = {
          need: fmt(issue.needL, 'volume', 1),
          capacity: fmt(issue.capacityL, 'volume', 1),
          name: assigned?.name ?? '',
          free: fmt(Math.max(0, free), 'volume', 1),
          pct: Math.max(0, Math.round((free / issue.capacityL) * 100)),
          min: MIN_HEADSPACE_PCT,
        };
        const own = assigned?.capacityL != null;
        if (issue.problem === 'littleHeadspace') {
          return { vessel: issue.vessel, level: 'note' as const, text: t(own ? 'recipe.fit.headspaceVessel' : 'recipe.fit.headspace', values) };
        }
        const key =
          issue.vessel === 'kettle'
            ? 'recipe.fit.kettle'
            : issue.vessel === 'fermenter'
              ? own
                ? 'recipe.fit.vessel'
                : 'recipe.fit.fermenter'
              : doc.equipment?.mashTunVolumeL == null
                ? 'recipe.fit.mashInKettle'
                : 'recipe.fit.mashTun';
        return { vessel: issue.vessel, level: 'warn' as const, text: t(key, values) };
      }),
    [doc.equipment, calc.volumes, assigned, t, fmt],
  );
}

/** warn: doesn't fit (orange) · note: fits, but tight (yellow). */
export type FitWarning = { vessel: string; level: 'warn' | 'note'; text: string };

export function FitWarnings({ warnings }: { warnings: FitWarning[] }) {
  if (!warnings.length) return null;
  return (
    <Stack gap={6}>
      {warnings.map((w) => (
        <Alert key={w.text} color={w.level === 'warn' ? 'orange' : 'yellow'} icon={w.level === 'warn' ? <IconAlertTriangle size={16} /> : <IconInfoCircle size={16} />} p="xs">
          <Text size="sm">{w.text}</Text>
        </Alert>
      ))}
    </Stack>
  );
}
