import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Checkbox, Group, Menu, NumberInput, Select, SegmentedControl, SimpleGrid, Stack, Table, Text, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconDroplet, IconPlus, IconSparkles, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { calculateWater, suggestSalts, suggestTargetProfile, DEFAULT_SALTS, type Ions, type RecipeCalc } from '@brew/brewcalc';
import {
  waterAgentOf,
  WATER_AGENT_INFO,
  WATER_AGENTS,
  WATER_IONS,
  type LibraryItemDto,
  type RecipeDoc,
  type WaterAgent,
  type WaterIon,
  type WaterSnapshot,
} from '@brew/shared';
import { newId } from '../api';
import { useLibrary, useSettings, useStock } from '../data';
import { useFormat } from '../units';
import { AmountField, useAmountFormat } from './amount';
import { Section } from './recipe-ui';
import { IngredientField, LineModal, LineRow, type Update } from './RecipeSections';
import { useAgentEffect, WaterAgentPicker } from './WaterAgentPicker';

const snapshot = (item: LibraryItemDto<'water'>): WaterSnapshot => ({
  libraryRef: item.id,
  name: item.data.name,
  calcium: item.data.calcium,
  magnesium: item.data.magnesium,
  sodium: item.data.sodium,
  sulfate: item.data.sulfate,
  chloride: item.data.chloride,
  bicarbonate: item.data.bicarbonate,
});

/** A result counts as on target within 10 % or 10 ppm. */
const near = (value: number, target: number) => Math.abs(value - target) <= Math.max(10, target * 0.1);

/** Water: source and target profiles, salt and acid additions, the resulting profile and mash pH. */
export function WaterSection({ doc, calc, update }: { doc: RecipeDoc; calc: RecipeCalc; update: Update }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const fmtAmount = useAmountFormat();
  const profiles = useLibrary('water');
  const settings = useSettings();
  const stock = useStock();
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);
  const effect = useAgentEffect();
  const water = useMemo(() => calculateWater(doc, calc), [doc, calc]);
  const w = doc.water;
  const setWater = (patch: Partial<RecipeDoc['water']>) => update((d) => ({ ...d, water: { ...d.water, ...patch } }));
  const setAddition = (id: string, patch: Partial<RecipeDoc['water']['additions'][number]>) =>
    update((d) => ({ ...d, water: { ...d.water, additions: d.water.additions.map((x) => (x.id === id ? { ...x, ...patch } : x)) } }));
  const editingAddition = w.additions.find((a) => a.id === editing);

  const all = profiles.data ?? [];
  const sources = all.filter((p) => p.data.role === 'source');
  const targets = all.filter((p) => p.data.role === 'target');
  const defaultSource = all.find((p) => p.id === settings.data?.defaultSourceWaterId);
  const option = (p: LibraryItemDto<'water'>) => ({ value: p.id, label: p.name });

  /** Agents with stock (matched by name, like brew-day deductions). */
  const agentsInStock = useMemo(
    () => new Set((stock.data ?? []).filter((s) => s.kind === 'misc' && s.amount > 0).map((s) => waterAgentOf(s.name)).filter((a): a is WaterAgent => a != null)),
    [stock.data],
  );

  const suggest = () => {
    if (!water.target) return;
    const agents = onlyInStock ? DEFAULT_SALTS.filter((a) => agentsInStock.has(a)) : DEFAULT_SALTS;
    const salts = suggestSalts(water.source, water.target, { mashL: water.mashL, spargeL: water.spargeL }, agents);
    // Keep the acids; replace the salts.
    const acids = w.additions.filter((a) => WATER_AGENT_INFO[a.agent].amountKind === 'volume');
    setWater({ additions: [...salts.map((s) => ({ id: newId(), ...s })), ...acids] });
  };

  const suggestedTarget = all.find((p) => p.seedKey === suggestTargetProfile(calc.colorEbc, calc.buGu));
  const rows: [string, Ions | null, boolean][] = [
    [t('water.rows.source'), water.source, false],
    [t('water.rows.target'), water.target, false],
    [t('water.rows.mash'), water.mash, true],
    [t('water.rows.result'), water.overall, true],
  ];

  return (
    <Section
      title={
        <Group gap={6}>
          <IconDroplet size={20} />
          {t('water.title')}
        </Group>
      }
      description={t('water.description')}
    >
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <Select
            label={t('water.source')}
            placeholder={t('water.pickSource')}
            data={[
              ...(sources.length ? [{ group: t('water.mine'), items: sources.map(option) }] : []),
              ...(targets.length ? [{ group: t('water.profiles'), items: targets.map(option) }] : []),
            ]}
            value={w.source?.libraryRef ?? null}
            onChange={(id) => {
              const p = all.find((x) => x.id === id);
              setWater({ source: p ? snapshot(p) : null });
            }}
            clearable
            searchable
          />
          <NumberInput label={t('water.dilution')} description={t('water.dilutionHint')} value={w.dilutionPct} onChange={(v) => setWater({ dilutionPct: Math.min(100, Math.max(0, Number(v) || 0)) })} suffix="%" min={0} max={100} />
          <Select
            label={t('water.target')}
            placeholder={t('water.pickTarget')}
            data={targets.map(option)}
            value={w.target?.libraryRef ?? null}
            onChange={(id) => {
              const p = all.find((x) => x.id === id);
              setWater({ target: p ? snapshot(p) : null });
            }}
            clearable
            searchable
            description={
              suggestedTarget && suggestedTarget.id !== w.target?.libraryRef ? (
                <Text size="xs" span>
                  {t('water.suggestedTarget')}{' '}
                  <Text span size="xs" c="var(--mantine-primary-color-filled)" style={{ cursor: 'pointer' }} onClick={() => setWater({ target: snapshot(suggestedTarget) })}>
                    {suggestedTarget.name}
                  </Text>
                </Text>
              ) : undefined
            }
          />
          <NumberInput label={t('water.phTarget')} value={w.mashPhTarget} onChange={(v) => setWater({ mashPhTarget: Number(v) || 5.4 })} decimalScale={2} step={0.05} min={4.5} max={6.5} />
        </SimpleGrid>
        {!w.source && defaultSource && (
          <Button variant="light" size="xs" w="fit-content" onClick={() => setWater({ source: snapshot(defaultSource) })}>
            {t('water.useMine', { name: defaultSource.name })}
          </Button>
        )}

        <Table.ScrollContainer minWidth={480}>
          <Table verticalSpacing={4} withRowBorders={false} className="tabular">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('water.ppm')}</Table.Th>
                {WATER_IONS.map((ion) => (
                  <Table.Th key={ion} ta="right">
                    {t(`library.ions.${ion}`)}
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map(([label, ions, compare]) => (
                <Table.Tr key={label}>
                  <Table.Td>
                    <Text size="sm" c={compare ? undefined : 'dimmed'} fw={compare ? 600 : 400}>
                      {label}
                    </Text>
                  </Table.Td>
                  {WATER_IONS.map((ion: WaterIon) => (
                    <Table.Td key={ion} ta="right">
                      {ions ? (
                        <Text size="sm" fw={compare ? 600 : 400} c={compare && water.target ? (near(ions[ion], water.target[ion]) ? 'green' : 'orange') : undefined}>
                          {fmt.num(ions[ion], 0)}
                        </Text>
                      ) : (
                        '–'
                      )}
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>

        <Group gap="lg">
          <Stat label={t('water.so4cl')} value={water.so4ClRatio != null ? fmt.num(water.so4ClRatio, 2) : '–'} hint={water.so4ClRatio != null ? t(`water.balance.${water.so4ClRatio > 1.5 ? 'bitter' : water.so4ClRatio < 0.7 ? 'malty' : 'balanced'}`) : undefined} />
          <Stat label={t('water.ra')} value={`${fmt.num(water.residualAlkalinity, 0)} ppm`} />
          {water.mashPh != null && (
            <Stat
              label={t('water.mashPh')}
              value={fmt.num(water.mashPh, 2)}
              hint={t('water.phEstimate')}
              color={Math.abs(water.mashPh - w.mashPhTarget) <= 0.1 ? 'green' : 'orange'}
            />
          )}
        </Group>

        {water.lacticForTarget > 0.0000049 && (
          <Alert color="blue" icon={<IconSparkles size={18} />} p="xs">
            <Group justify="space-between" gap="xs">
              <Text size="sm">{t('water.acidTip', { amount: fmt(water.lacticForTarget, 'volumeSmall', 1), ph: fmt.num(w.mashPhTarget, 2) })}</Text>
              <Button
                size="xs"
                variant="light"
                onClick={() => {
                  const rest = w.additions.filter((a) => !(a.agent === 'lactic_acid' && a.where === 'mash'));
                  const existing = w.additions.find((a) => a.agent === 'lactic_acid' && a.where === 'mash')?.amount ?? 0;
                  setWater({ additions: [...rest, { id: newId(), agent: 'lactic_acid', amount: Math.round((existing + water.lacticForTarget) * 1e5) / 1e5, where: 'mash' }] });
                }}
              >
                {t('water.addAcid')}
              </Button>
            </Group>
          </Alert>
        )}

        <Stack gap={6}>
          <Group justify="space-between">
            <Text fw={600}>{t('water.additions')}</Text>
            <Group gap="xs">
              <Tooltip label={t('water.onlyInStockHint')}>
                <Checkbox size="xs" label={t('water.onlyInStock')} checked={onlyInStock} onChange={(e) => setOnlyInStock(e.currentTarget.checked)} />
              </Tooltip>
              <Button size="xs" variant="light" leftSection={<IconSparkles size={14} />} disabled={!water.target} onClick={suggest}>
                {t('water.suggest')}
              </Button>
              <Menu position="bottom-end">
                <Menu.Target>
                  <Button size="xs" variant="default" leftSection={<IconPlus size={14} />}>
                    {t('common.add')}
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {WATER_AGENTS.map((agent) => (
                    <Menu.Item key={agent} onClick={() => {
                        const id = newId();
                        setWater({ additions: [...w.additions, { id, agent, amount: 0, where: 'mash' }] });
                        setEditing(id);
                      }}>
                      {t(`water.agents.${agent}`)}
                      {agentsInStock.has(agent) && (
                        <Badge ml={6} size="xs" color="green" variant="light">
                          {t('water.inStock')}
                        </Badge>
                      )}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            </Group>
          </Group>
          {w.additions.map((a) => (
            <LineRow
              key={a.id}
              name={t(`water.agents.${a.agent}`)}
              sub={`${t(`water.${a.where}`)} · ${effect(a.agent)}`}
              value={fmtAmount(a.amount, 'misc', WATER_AGENT_INFO[a.agent].amountKind)}
              onOpen={() => setEditing(a.id)}
            />
          ))}
          {water.additions
            .filter((a) => a.fromIngredients)
            .map((a, i) => (
              <Text key={i} size="sm" c="dimmed">
                {t('water.fromIngredients', { agent: t(`water.agents.${a.agent}`), amount: fmtAmount(a.amount, 'misc', WATER_AGENT_INFO[a.agent].amountKind), where: t(`water.${a.where}`) })}
              </Text>
            ))}
          {!w.additions.length && !water.additions.length && (
            <Text size="sm" c="dimmed">
              {water.target ? t('water.noAdditionsTarget') : t('water.noAdditions')}
            </Text>
          )}
        </Stack>

        <LineModal
          opened={Boolean(editingAddition)}
          onClose={() => setEditing(null)}
          title={editingAddition ? t(`water.agents.${editingAddition.agent}`) : ''}
          onDelete={() => editingAddition && setWater({ additions: w.additions.filter((x) => x.id !== editingAddition.id) })}
          focusFirst={editingAddition?.amount === 0}
          main={
            editingAddition && (
              <Stack>
                <IngredientField
                  name={t(`water.agents.${editingAddition.agent}`)}
                  sub={[effect(editingAddition.agent), agentsInStock.has(editingAddition.agent) ? t('water.inStock') : ''].filter(Boolean).join(' · ')}
                  onSwap={() => setSwapping(true)}
                />
                <SimpleGrid cols={{ base: 1, xs: 2 }}>
                  <AmountField
                    kind="misc"
                    amountKind={WATER_AGENT_INFO[editingAddition.agent].amountKind}
                    label={t('recipe.amount')}
                    value={editingAddition.amount}
                    onChange={(v) => setAddition(editingAddition.id, { amount: v ?? 0 })}
                    size="md"
                  />
                  <Stack gap={4}>
                    <Text size="md" fw={500}>
                      {t('water.where')}
                    </Text>
                    <SegmentedControl
                      value={editingAddition.where}
                      data={[
                        { value: 'mash', label: t('water.mash') },
                        { value: 'sparge', label: t('water.sparge') },
                      ]}
                      onChange={(v) => setAddition(editingAddition.id, { where: v as 'mash' | 'sparge' })}
                    />
                  </Stack>
                </SimpleGrid>
              </Stack>
            )
          }
        />
        <WaterAgentPicker
          opened={swapping && Boolean(editingAddition)}
          onClose={() => setSwapping(false)}
          current={editingAddition?.agent}
          inStock={agentsInStock}
          onPick={(agent) => {
            if (!editingAddition || agent === editingAddition.agent) return;
            // A salt is weighed, an acid measured: the amount only carries over between the same kind.
            const sameKind = WATER_AGENT_INFO[agent].amountKind === WATER_AGENT_INFO[editingAddition.agent].amountKind;
            setAddition(editingAddition.id, { agent, ...(!sameKind && { amount: 0 }) });
          }}
        />

        {water.warnings.filter((x) => x !== 'noSource').map((x) => (
          <Alert key={x} color="orange" icon={<IconAlertTriangle size={16} />} p="xs">
            <Text size="sm">{t(`water.warnings.${x}`)}</Text>
          </Alert>
        ))}
        {water.warnings.includes('noSource') && (
          <Text size="xs" c="dimmed">
            {t('water.warnings.noSource')}
          </Text>
        )}
      </Stack>
    </Section>
  );
}

function Stat({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed" fw={600} tt="uppercase">
        {label}
      </Text>
      <Text fw={700} fz="lg" c={color} className="tabular">
        {value}
      </Text>
      {hint && (
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
      )}
    </Stack>
  );
}
