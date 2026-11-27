import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Anchor, Button, Group, NativeSelect, Paper, PasswordInput, SegmentedControl, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { LIBRARY_DATA_LICENSE_URL, LIBRARY_DATA_URL, MEASURES, METRIC_UNITS, SOURCE_URL, UNITS, US_UNITS, type Measure, type Theme, type UnitPrefs } from '@brew/shared';
import { api } from '../api';
import { meKey, useMe, useUpdatePrefs } from '../auth';
import { useEquipment, useSettings, useUpdateSettings } from '../data';
import { LANGUAGE_NAMES } from '../i18n';
import { BackupSection } from '../components/BackupSection';
import { McpConnections } from '../components/McpConnections';
import { RecipeImagePicker } from '../components/RecipeImage';
import { TrashKeepFor } from '../components/trash-ui';
import { notifyError, notifyOk } from '../lib/notify';
import { useQueryClient } from '@tanstack/react-query';
import type { UserDto } from '@brew/shared';

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Paper withBorder radius="md" p={{ base: 'sm', sm: 'lg' }}>
      <Title order={4}>{title}</Title>
      {description && (
        <Text size="sm" c="dimmed" mb="sm">
          {description}
        </Text>
      )}
      <Stack gap="sm" mt={description ? 0 : 'sm'}>
        {children}
      </Stack>
    </Paper>
  );
}

const MEASURE_ORDER: Measure[] = ['massLarge', 'massSmall', 'volume', 'volumeSmall', 'temperature', 'gravity', 'color', 'pressure', 'carbonation', 'specificVolume', 'rate', 'diastaticPower'];

export function SettingsPage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const updatePrefs = useUpdatePrefs();
  if (!me) return null;
  const units = me.prefs.units;
  const preset = MEASURE_ORDER.every((m) => units[m] === METRIC_UNITS[m]) ? 'metric' : MEASURE_ORDER.every((m) => units[m] === US_UNITS[m]) ? 'us' : 'custom';
  const setUnits = (patch: Partial<UnitPrefs>) => updatePrefs.mutate({ units: patch }, { onError: notifyError });

  return (
    <Stack gap="md" maw={860}>
      <Title order={2}>{t('settings.title')}</Title>

      <Section title={t('settings.appearance')}>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              {t('settings.theme.label')}
            </Text>
            <SegmentedControl
              value={me.prefs.theme}
              data={(['light', 'dark', 'system'] as Theme[]).map((v) => ({ value: v, label: t(`settings.theme.${v}`) }))}
              onChange={(v) => updatePrefs.mutate({ theme: v as Theme })}
            />
          </Stack>
          <NativeSelect
            label={t('settings.language')}
            value={me.prefs.language}
            data={[{ value: 'auto', label: t('settings.languageAuto') }, ...Object.entries(LANGUAGE_NAMES).map(([value, label]) => ({ value, label }))]}
            onChange={(e) => updatePrefs.mutate({ language: e.currentTarget.value })}
          />
        </SimpleGrid>
      </Section>

      <Section title={t('settings.units.title')} description={t('settings.units.description')}>
        <SegmentedControl
          value={preset}
          data={[
            { value: 'metric', label: t('settings.units.metric') },
            { value: 'us', label: t('settings.units.us') },
            { value: 'custom', label: t('settings.units.custom'), disabled: true },
          ]}
          onChange={(v) => setUnits(v === 'us' ? US_UNITS : METRIC_UNITS)}
          maw={420}
        />
        <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
          {MEASURE_ORDER.map((m) => (
            <NativeSelect
              key={m}
              label={t(`settings.units.measures.${m}`)}
              value={units[m]}
              data={UNITS[MEASURES[m]].map((u) => ({ value: u.id, label: u.symbol }))}
              onChange={(e) => setUnits({ [m]: e.currentTarget.value })}
            />
          ))}
        </SimpleGrid>
      </Section>

      <BrewerySection />
      <Section title={t('settings.trash.title')} description={t('settings.trash.description')}>
        <TrashKeepFor />
      </Section>
      <Section title={t('settings.backup.title')} description={t('settings.backup.description')}>
        <BackupSection />
      </Section>
      <Section title={t('settings.mcp.title')} description={t('settings.mcp.description')}>
        <McpConnections />
      </Section>
      <AccountSection me={me} />

      <Section title={t('settings.about.title')}>
        <Text size="sm">{t('settings.about.text')}</Text>
        <Text size="sm">
          {t('settings.about.license')}{' '}
          <Anchor href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
            {t('settings.about.source')}
          </Anchor>
        </Text>
        <Text size="sm" c="dimmed">
          {t('settings.about.data')}{' '}
          <Anchor href={LIBRARY_DATA_URL} target="_blank" rel="noopener noreferrer">
            open-brewing-data
          </Anchor>
          ,{' '}
          <Anchor href={LIBRARY_DATA_LICENSE_URL} target="_blank" rel="noopener noreferrer">
            {t('settings.about.dataLicense')}
          </Anchor>{' '}
          ·{' '}
          <Anchor href="https://github.com/beerjson/beerjson" target="_blank" rel="noopener noreferrer">
            BeerJSON
          </Anchor>
        </Text>
      </Section>
    </Stack>
  );
}

function BrewerySection() {
  const { t } = useTranslation();
  const settings = useSettings();
  const update = useUpdateSettings();
  const equipment = useEquipment();
  const [name, setName] = useState('');
  useEffect(() => setName(settings.data?.breweryName ?? ''), [settings.data?.breweryName]);
  if (!settings.data) return null;
  return (
    <Section title={t('settings.brewery.title')}>
      <Group gap="md" align="center" wrap="nowrap">
        <RecipeImagePicker image={settings.data.breweryLogo} onChange={(breweryLogo) => update.mutate({ breweryLogo }, { onError: notifyError })} size={84} />
        <Text size="sm" c="dimmed">
          {t('settings.brewery.logoHint')}
        </Text>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <TextInput
          label={t('settings.brewery.name')}
          placeholder={t('settings.brewery.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onBlur={() => name !== settings.data!.breweryName && update.mutate({ breweryName: name }, { onError: notifyError })}
        />
        <NativeSelect
          label={t('settings.brewery.defaultEquipment')}
          value={settings.data.defaultEquipmentId ?? ''}
          data={[{ value: '', label: '–' }, ...(equipment.data ?? []).map((e) => ({ value: e.id, label: e.name }))]}
          onChange={(e) => update.mutate({ defaultEquipmentId: e.currentTarget.value || null }, { onError: notifyError })}
        />
      </SimpleGrid>
    </Section>
  );
}

function AccountSection({ me }: { me: UserDto }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [displayName, setDisplayName] = useState(me.displayName);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);

  const saveName = () => {
    if (!displayName.trim() || displayName === me.displayName) return;
    api<UserDto>('/api/me/profile', 'PATCH', { displayName })
      .then((u) => qc.setQueryData(meKey, u))
      .catch(notifyError);
  };
  const changePassword = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    api<void>('/api/me/password', 'POST', { currentPassword: current, newPassword: next })
      .then(() => {
        setCurrent('');
        setNext('');
        notifyOk(t('settings.account.passwordChanged'));
      })
      .catch(notifyError)
      .finally(() => setBusy(false));
  };

  return (
    <Section title={t('settings.account.title')} description={`@${me.username}`}>
      <TextInput label={t('auth.displayName')} value={displayName} onChange={(e) => setDisplayName(e.currentTarget.value)} onBlur={saveName} maw={360} />
      <form onSubmit={changePassword}>
        <Group align="flex-end" gap="sm">
          <PasswordInput label={t('settings.account.currentPassword')} value={current} onChange={(e) => setCurrent(e.currentTarget.value)} autoComplete="current-password" required />
          <PasswordInput label={t('settings.account.newPassword')} value={next} onChange={(e) => setNext(e.currentTarget.value)} autoComplete="new-password" minLength={8} required />
          <Button type="submit" variant="default" loading={busy}>
            {t('settings.account.changePassword')}
          </Button>
        </Group>
      </form>
    </Section>
  );
}
