import { useEffect } from 'react';
import { ActionIcon, Tooltip, useComputedColorScheme, useMantineColorScheme, type MantineColorScheme } from '@mantine/core';
import { IconDeviceDesktop, IconMoon, IconSun } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { Theme } from '@brew/shared';
import { useMe, useUpdatePrefs } from '../auth';
import { resolveLanguage } from '../i18n';

const toScheme = (theme: Theme): MantineColorScheme => (theme === 'system' ? 'auto' : theme);

/** Applies the signed-in user's saved theme and language (they follow the user across devices). */
export function PrefsSync() {
  const { data: me } = useMe();
  const { setColorScheme } = useMantineColorScheme();
  const { i18n } = useTranslation();
  const theme = me?.prefs.theme;
  const language = me?.prefs.language;
  useEffect(() => {
    if (theme) setColorScheme(toScheme(theme));
  }, [theme, setColorScheme]);
  useEffect(() => {
    const lng = resolveLanguage(language);
    if (i18n.language !== lng) void i18n.changeLanguage(lng);
    document.documentElement.lang = lng;
  }, [language, i18n]);
  // The installed app's title bar (and mobile browser chrome) takes the header's colour.
  const computed = useComputedColorScheme('light');
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.content = computed === 'dark' ? '#1c1b19' : '#f6f4f0';
  }, [computed]);
  return null;
}

const NEXT: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' };
const ICON = { light: IconSun, dark: IconMoon, system: IconDeviceDesktop };

/** Header button cycling light → dark → system. */
export function ThemeToggle() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const updatePrefs = useUpdatePrefs();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const current: Theme = me?.prefs.theme ?? (colorScheme === 'auto' ? 'system' : colorScheme);
  const Icon = ICON[current];
  const label = t(`settings.theme.${current}`);

  const cycle = () => {
    const next = NEXT[current];
    setColorScheme(toScheme(next));
    if (me) updatePrefs.mutate({ theme: next });
  };

  return (
    <Tooltip label={t('layout.themeTooltip', { theme: label })}>
      <ActionIcon variant="default" size="lg" onClick={cycle} aria-label={label}>
        <Icon size={18} stroke={1.6} />
      </ActionIcon>
    </Tooltip>
  );
}
