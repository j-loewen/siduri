import { useState } from 'react';
import { Alert, Badge, Button, Card, Center, Group, Loader, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconInfoCircle, IconPlus, IconStar, IconStarFilled } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { WATER_IONS, waterDataSchema, type LibraryItemDto } from '@brew/shared';
import { residualAlkalinity, sulfateChlorideRatio, type Ions } from '@brew/brewcalc';
import { useLibrary, useSettings, useUpdateSettings } from '../data';
import { PageHeader } from '../components/recipe-ui';
import { notifyError } from '../lib/notify';
import { useFormat } from '../units';
import { EditDrawer, type LibraryEditing } from './LibraryPage';

/** Water reports (your tap water) and target profiles. Recipes pick them in their Water section. */
export function WaterPage() {
  const { t } = useTranslation();
  const profiles = useLibrary('water');
  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const [editing, setEditing] = useState<LibraryEditing | null>(null);
  const all = profiles.data ?? [];
  const mine = all.filter((p) => p.data.role === 'source');
  const targets = all.filter((p) => p.data.role === 'target');
  const defaultId = settings.data?.defaultSourceWaterId ?? null;

  const open = (p: LibraryItemDto<'water'>) => setEditing({ kind: 'water', id: p.id, seedKey: p.seedKey, data: p.data });
  const create = (role: 'source' | 'target') =>
    setEditing({ kind: 'water', data: waterDataSchema.parse({ name: role === 'source' ? t('waterPage.newSourceName') : t('waterPage.newTargetName'), role }) });

  if (profiles.isPending) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }

  return (
    <>
      <PageHeader title={t('waterPage.title')} subtitle={t('waterPage.subtitle')} />
      <Stack gap="xl">
        <Stack gap="sm">
          <Group justify="space-between">
            <Title order={3}>{t('waterPage.mine')}</Title>
            <Button variant="light" leftSection={<IconPlus size={18} />} onClick={() => create('source')}>
              {t('waterPage.newSource')}
            </Button>
          </Group>
          {mine.length === 0 && (
            <Alert icon={<IconInfoCircle size={18} />} variant="light">
              {t('waterPage.howToGet')}
            </Alert>
          )}
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
            {mine.map((p) => (
              <ProfileCard
                key={p.id}
                profile={p}
                onOpen={() => open(p)}
                action={
                  <Button
                    size="xs"
                    variant={p.id === defaultId ? 'light' : 'subtle'}
                    leftSection={p.id === defaultId ? <IconStarFilled size={14} /> : <IconStar size={14} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateSettings.mutate({ defaultSourceWaterId: p.id === defaultId ? null : p.id }, { onError: notifyError });
                    }}
                  >
                    {p.id === defaultId ? t('waterPage.isDefault') : t('waterPage.makeDefault')}
                  </Button>
                }
              />
            ))}
          </SimpleGrid>
        </Stack>

        <Stack gap="sm">
          <Group justify="space-between">
            <Stack gap={0}>
              <Title order={3}>{t('waterPage.targets')}</Title>
              <Text size="sm" c="dimmed">
                {t('waterPage.targetsHint')}
              </Text>
            </Stack>
            <Button variant="default" leftSection={<IconPlus size={18} />} onClick={() => create('target')}>
              {t('waterPage.newTarget')}
            </Button>
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
            {targets.map((p) => (
              <ProfileCard key={p.id} profile={p} onOpen={() => open(p)} />
            ))}
          </SimpleGrid>
        </Stack>
      </Stack>
      <EditDrawer editing={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function ProfileCard({ profile, onOpen, action }: { profile: LibraryItemDto<'water'>; onOpen: () => void; action?: React.ReactNode }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const d = profile.data;
  const ions = Object.fromEntries(WATER_IONS.map((k) => [k, d[k]])) as Ions;
  const ratio = sulfateChlorideRatio(ions);
  return (
    <Card withBorder radius="md" className="clickable-row" onClick={onOpen}>
      <Group justify="space-between" wrap="nowrap" gap="xs" mb={6}>
        <Text fw={600} truncate>
          {profile.name}
        </Text>
        {action}
      </Group>
      <SimpleGrid cols={6} spacing={4}>
        {WATER_IONS.map((ion) => (
          <Stack key={ion} gap={0} align="center">
            <Text size="xs" c="dimmed">
              {t(`library.ions.${ion}`)}
            </Text>
            <Text size="sm" fw={600} className="tabular">
              {fmt.num(d[ion], 0)}
            </Text>
          </Stack>
        ))}
      </SimpleGrid>
      <Group gap={6} mt="xs">
        <Badge variant="light" color="gray">
          {t('water.so4cl')} {ratio != null ? fmt.num(ratio, 2) : '–'}
        </Badge>
        <Badge variant="light" color="gray">
          {t('water.ra')} {fmt.num(residualAlkalinity(ions), 0)}
        </Badge>
      </Group>
    </Card>
  );
}
