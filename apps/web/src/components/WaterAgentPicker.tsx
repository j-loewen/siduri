import { Badge, Group, Modal, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { AGENT_PPM } from '@brew/brewcalc';
import { WATER_AGENTS, WATER_IONS, type WaterAgent } from '@brew/shared';

/** What an agent does: "Adds Ca, SO₄" or, for acids, "Lowers alkalinity". */
export function useAgentEffect() {
  const { t } = useTranslation();
  return (agent: WaterAgent) => {
    const ppm = AGENT_PPM[agent];
    const adds = WATER_IONS.filter((ion) => (ppm[ion] ?? 0) > 0).map((ion) => t(`library.ions.${ion}`));
    return adds.length ? t('water.adds', { ions: adds.join(', ') }) : t('water.lowersAlkalinity');
  };
}

/** Pick a salt or acid, e.g. to swap the one of an addition. */
export function WaterAgentPicker({
  opened,
  onClose,
  onPick,
  current,
  inStock,
}: {
  opened: boolean;
  onClose: () => void;
  onPick: (agent: WaterAgent) => void;
  current?: WaterAgent;
  inStock: Set<WaterAgent>;
}) {
  const { t } = useTranslation();
  const effect = useAgentEffect();
  return (
    <Modal opened={opened} onClose={onClose} title={current ? t('picker.swapTitle', { name: t(`water.agents.${current}`) }) : t('water.agent')} size="md">
      <Stack gap={2}>
        {WATER_AGENTS.map((agent) => (
          <UnstyledButton
            key={agent}
            className="clickable-row"
            p={8}
            style={{ borderRadius: 8 }}
            onClick={() => {
              onPick(agent);
              onClose();
            }}
          >
            <Group gap="sm" wrap="nowrap">
              <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
                <Text size="sm" fw={500} truncate>
                  {t(`water.agents.${agent}`)}
                </Text>
                <Text size="xs" c="dimmed" truncate>
                  {effect(agent)}
                </Text>
              </Stack>
              {inStock.has(agent) && (
                <Badge size="sm" variant="light" color="green">
                  {t('water.inStock')}
                </Badge>
              )}
              {agent === current && <IconCheck size={16} color="var(--mantine-primary-color-filled)" />}
            </Group>
          </UnstyledButton>
        ))}
      </Stack>
    </Modal>
  );
}
