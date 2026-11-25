import { useMemo, useState } from 'react';
import { Badge, Button, Card, Center, Drawer, Group, Loader, Modal, NativeSelect, NumberInput, SimpleGrid, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconPlus, IconStar, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { brewVolumes } from '@brew/brewcalc';
import { DEFAULT_EQUIPMENT, VESSEL_KINDS, type CreateVesselInput, type EquipmentData, type EquipmentDto, type VesselKind } from '@brew/shared';
import { useDeleteEquipment, useDeleteVessel, useEquipment, useSaveEquipment, useSaveVessel, useSetDefaultEquipment, useVessels } from '../data';
import { DevicesSection } from '../components/DevicesSection';
import { EquipmentFields } from '../components/EquipmentFields';
import { PageHeader } from '../components/recipe-ui';
import { notifyError, notifyOk } from '../lib/notify';
import { UnitInput, useFormat } from '../units';

type Editing = { id?: string; data: EquipmentData };

export function EquipmentPage() {
  const { t } = useTranslation();
  const equipment = useEquipment();
  const [editing, setEditing] = useState<Editing | null>(null);

  return (
    <>
      <PageHeader
        title={t('equipment.title')}
        subtitle={t('equipment.subtitle')}
        actions={
          <Button leftSection={<IconPlus size={18} />} onClick={() => setEditing({ data: { ...DEFAULT_EQUIPMENT, name: t('equipment.newName') } })}>
            {t('equipment.new')}
          </Button>
        }
      />
      {equipment.isPending ? (
        <Center py="xl">
          <Loader />
        </Center>
      ) : equipment.data?.length ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
          {equipment.data.map((e) => (
            <ProfileCard key={e.id} profile={e} onOpen={() => setEditing({ id: e.id, data: e.data })} />
          ))}
        </SimpleGrid>
      ) : (
        <Stack align="center" py="xl" gap="xs">
          <Text c="dimmed" ta="center" maw={420}>
            {t('equipment.empty')}
          </Text>
        </Stack>
      )}
      <VesselsSection />
      <DevicesSection />
      <EquipmentDrawer editing={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function ProfileCard({ profile, onOpen }: { profile: EquipmentDto; onOpen: () => void }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const d = profile.data;
  return (
    <Card withBorder radius="md" className="clickable-row" onClick={onOpen}>
      <Group justify="space-between" wrap="nowrap">
        <Text fw={600} truncate>
          {profile.name}
        </Text>
        {profile.isDefault && (
          <Badge variant="light" leftSection={<IconStar size={12} />}>
            {t('equipment.default')}
          </Badge>
        )}
      </Group>
      <Text size="sm" c="dimmed" mb="xs">
        {t(`enums.brewMethod.${d.method}`)}
      </Text>
      <Group gap={6}>
        <Badge variant="light" color="gray">
          {fmt(d.batchVolumeL, 'volume', 0)}
        </Badge>
        <Badge variant="light" color="gray">
          {t('equipment.efficiencyBadge', { pct: d.brewhouseEfficiencyPct })}
        </Badge>
        <Badge variant="light" color="gray">
          {t('equipment.boilOffBadge', { rate: fmt(d.boilOffLPerH, 'rate', 1) })}
        </Badge>
      </Group>
    </Card>
  );
}

function EquipmentDrawer({ editing, onClose }: { editing: Editing | null; onClose: () => void }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const save = useSaveEquipment();
  const remove = useDeleteEquipment();
  const makeDefault = useSetDefaultEquipment();
  const [draft, setDraft] = useState<Editing | null>(null);
  const [openedFor, setOpenedFor] = useState<Editing | null>(null);
  if (editing !== openedFor) {
    setOpenedFor(editing);
    setDraft(editing);
  }
  const current = draft;
  const d = current?.data;
  const set = (patch: Partial<EquipmentData>) => current && setDraft({ ...current, data: { ...current.data, ...patch } });
  const num = (v: string | number, fallback: number) => (v === '' ? fallback : Number(v));

  // Example brew: about 250 g of grain per litre, to show what the settings mean.
  const preview = useMemo(
    () => (d ? brewVolumes(d, { batchSizeL: d.batchVolumeL, boilTimeMin: d.boilTimeMin, mashGrainKg: d.method === 'extract' ? 0 : d.batchVolumeL * 0.25 }) : null),
    [d],
  );

  const submit = () => {
    if (!current) return;
    save.mutate(current, {
      onSuccess: () => {
        notifyOk(t('equipment.saved'));
        onClose();
      },
      onError: notifyError,
    });
  };

  return (
    <Drawer opened={Boolean(editing)} onClose={onClose} position="right" size="lg" title={d?.name ?? ''}>
      {current && d && (
        <Stack>
          <TextInput label={t('fields.name')} value={d.name} onChange={(e) => set({ name: e.currentTarget.value })} required />
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
            <UnitInput measure="volume" label={t('equipment.fields.batchVolume')} value={d.batchVolumeL} min={0.1} onChange={(v) => v && set({ batchVolumeL: v })} />
            <NumberInput label={t('equipment.fields.boilTime')} value={d.boilTimeMin} suffix=" min" min={0} max={600} onChange={(v) => set({ boilTimeMin: num(v, 60) })} />
            <NumberInput label={t('equipment.fields.brewhouseEfficiency')} description={t('equipment.fields.brewhouseEfficiencyHint')} value={d.brewhouseEfficiencyPct} suffix="%" min={10} max={100} onChange={(v) => set({ brewhouseEfficiencyPct: num(v, 72) })} />
            <NumberInput label={t('equipment.fields.mashEfficiency')} value={d.mashEfficiencyPct} suffix="%" min={10} max={100} onChange={(v) => set({ mashEfficiencyPct: num(v, 80) })} />
          </SimpleGrid>
          <EquipmentFields value={d} onChange={set} />
          <Textarea label={t('fields.notes')} value={d.notes} autosize minRows={2} onChange={(e) => set({ notes: e.currentTarget.value })} />

          {preview && (
            <Card withBorder radius="md" bg="var(--mantine-color-default-hover)">
              <Title order={5} mb={4}>
                {t('equipment.preview.title')}
              </Title>
              <Text size="xs" c="dimmed" mb="xs">
                {t('equipment.preview.text', { grain: fmt(preview.mashGrainKg, 'massLarge', 1), batch: fmt(d.batchVolumeL, 'volume', 1) })}
              </Text>
              <SimpleGrid cols={2} spacing={4}>
                {(
                  [
                    ['strike', preview.strikeL],
                    ['sparge', preview.spargeL],
                    ['preBoil', preview.preBoilL],
                    ['postBoil', preview.postBoilHotL],
                  ] as const
                ).map(([key, v]) => (
                  <Group key={key} justify="space-between" gap={4}>
                    <Text size="sm" c="dimmed">
                      {t(`recipe.volumes.${key}`)}
                    </Text>
                    <Text size="sm" fw={500} className="tabular">
                      {fmt(v, 'volume', 1)}
                    </Text>
                  </Group>
                ))}
              </SimpleGrid>
            </Card>
          )}

          <Group justify="space-between" mt="md">
            <Group gap="xs">
              {current.id && (
                <Button
                  variant="subtle"
                  color="red"
                  leftSection={<IconTrash size={16} />}
                  onClick={() =>
                    modals.openConfirmModal({
                      title: t('equipment.delete.title'),
                      children: <Text size="sm">{t('equipment.delete.text', { name: d.name })}</Text>,
                      labels: { confirm: t('common.delete'), cancel: t('common.cancel') },
                      confirmProps: { color: 'red' },
                      onConfirm: () => remove.mutate(current.id!, { onSuccess: onClose, onError: notifyError }),
                    })
                  }
                >
                  {t('common.delete')}
                </Button>
              )}
              {current.id && (
                <Button variant="subtle" leftSection={<IconStar size={16} />} onClick={() => makeDefault.mutate(current.id!, { onError: notifyError })}>
                  {t('equipment.makeDefault')}
                </Button>
              )}
            </Group>
            <Group gap="xs">
              <Button variant="default" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button onClick={submit} loading={save.isPending} disabled={!d.name.trim()}>
                {t('common.save')}
              </Button>
            </Group>
          </Group>
        </Stack>
      )}
    </Drawer>
  );
}

// ---- Fermenters and kegs ------------------------------------------------------------------------

type VesselEditing = { id?: string; data: CreateVesselInput };

function VesselsSection() {
  const { t } = useTranslation();
  const fmt = useFormat();
  const vessels = useVessels();
  const [editing, setEditing] = useState<VesselEditing | null>(null);
  return (
    <Stack gap="sm" mt="xl">
      <Group justify="space-between">
        <Stack gap={0}>
          <Title order={3}>{t('vessels.title')}</Title>
          <Text size="sm" c="dimmed">
            {t('vessels.subtitle')}
          </Text>
        </Stack>
        <Button variant="light" leftSection={<IconPlus size={18} />} onClick={() => setEditing({ data: { name: '', kind: 'fermenter', capacityL: null, notes: '' } })}>
          {t('vessels.new')}
        </Button>
      </Group>
      {vessels.data?.length ? (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
          {vessels.data.map((v) => (
            <Card key={v.id} withBorder radius="md" className="clickable-row" onClick={() => setEditing({ id: v.id, data: { name: v.name, kind: v.kind, capacityL: v.capacityL, notes: v.notes } })}>
              <Group justify="space-between" wrap="nowrap">
                <Text fw={600} truncate>
                  {v.name}
                </Text>
                <Badge variant="light" color={v.currentBatch ? 'yellow' : 'green'}>
                  {v.currentBatch ? t('vessels.busy') : t('vessels.free')}
                </Badge>
              </Group>
              <Text size="sm" c="dimmed">
                {[t(`vessels.kinds.${v.kind}`), v.capacityL != null ? fmt(v.capacityL, 'volume', 0) : null].filter(Boolean).join(' · ')}
              </Text>
              {v.currentBatch && (
                <Text size="sm" mt={4}>
                  #{v.currentBatch.number} {v.currentBatch.name} · {t(`batches.status.${v.currentBatch.status}`)}
                </Text>
              )}
            </Card>
          ))}
        </SimpleGrid>
      ) : (
        <Text size="sm" c="dimmed">
          {t('vessels.empty')}
        </Text>
      )}
      <VesselModal editing={editing} onClose={() => setEditing(null)} />
    </Stack>
  );
}

function VesselModal({ editing, onClose }: { editing: VesselEditing | null; onClose: () => void }) {
  const { t } = useTranslation();
  const save = useSaveVessel();
  const remove = useDeleteVessel();
  const [data, setData] = useState<CreateVesselInput | null>(null);
  const [shownFor, setShownFor] = useState<VesselEditing | null>(null);
  if (editing !== shownFor) {
    setShownFor(editing);
    setData(editing?.data ?? null);
  }
  return (
    <Modal opened={Boolean(editing)} onClose={onClose} title={editing?.id ? data?.name : t('vessels.new')}>
      {data && (
        <Stack>
          <TextInput label={t('fields.name')} value={data.name} onChange={(e) => setData({ ...data, name: e.currentTarget.value })} placeholder={t('vessels.namePlaceholder')} required data-autofocus />
          <NativeSelect
            label={t('fields.type')}
            value={data.kind}
            data={VESSEL_KINDS.map((k) => ({ value: k, label: t(`vessels.kinds.${k}`) }))}
            onChange={(e) => setData({ ...data, kind: e.currentTarget.value as VesselKind })}
          />
          <UnitInput measure="volume" label={t('vessels.capacity')} value={data.capacityL ?? null} nullable onChange={(v) => setData({ ...data, capacityL: v })} />
          <Textarea label={t('fields.notes')} value={data.notes ?? ''} autosize minRows={2} onChange={(e) => setData({ ...data, notes: e.currentTarget.value })} />
          <Group justify="space-between">
            {editing?.id ? (
              <Button variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={() => remove.mutate(editing.id!, { onSuccess: onClose, onError: notifyError })}>
                {t('common.delete')}
              </Button>
            ) : (
              <span />
            )}
            <Button
              disabled={!data.name.trim()}
              loading={save.isPending}
              onClick={() => save.mutate({ id: editing?.id, data }, { onSuccess: onClose, onError: notifyError })}
            >
              {t('common.save')}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
