import { Button, Center, Code, Stack, Text, Title } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

/** Shown when a page fails to render; offers a reload instead of a blank screen. */
export function ErrorPage({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return (
    <Center mih="60dvh" p="md">
      <Stack align="center" gap="sm" maw={460} ta="center">
        <IconAlertTriangle size={40} stroke={1.5} color="var(--mantine-color-red-6)" />
        <Title order={3}>{t('errors.pageTitle')}</Title>
        <Text c="dimmed" size="sm">
          {t('errors.pageText')}
        </Text>
        <Code block style={{ maxWidth: '100%', whiteSpace: 'pre-wrap' }}>
          {error instanceof Error ? error.message : String(error)}
        </Code>
        <Button variant="light" onClick={() => window.location.reload()}>
          {t('errors.reload')}
        </Button>
      </Stack>
    </Center>
  );
}
