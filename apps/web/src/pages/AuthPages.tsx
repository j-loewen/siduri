import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from '@tanstack/react-router';
import { Alert, Anchor, Button, Center, Group, Loader, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useAuthStatus, useLogin, useMe, useRegister } from '../auth';
import { Logo } from '../components/Logo';
import { ThemeToggle } from '../components/ThemeControls';
import { useErrorMessage } from '../lib/notify';

function AuthCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <Center mih="100dvh" p="md">
      <Stack w="100%" maw={400} gap="lg">
        <Group justify="space-between">
          <Logo height={36} />
          <ThemeToggle />
        </Group>
        <Paper withBorder radius="md" p="xl" shadow="sm">
          <Title order={2} size="h3" mb={subtitle ? 4 : 'md'}>
            {title}
          </Title>
          {subtitle && (
            <Text c="dimmed" size="sm" mb="md">
              {subtitle}
            </Text>
          )}
          {children}
        </Paper>
      </Stack>
    </Center>
  );
}

export function LoginPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const me = useMe();
  const status = useAuthStatus();
  const login = useLogin();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  if (me.isPending || status.isPending) {
    return (
      <Center mih="100dvh">
        <Loader />
      </Center>
    );
  }
  if (me.data) return <Navigate to="/" />;
  if (status.data?.needsSetup) return <Navigate to="/register" />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ username, password }, { onSuccess: () => void navigate({ to: '/' }) });
  };

  return (
    <AuthCard title={t('auth.signIn')}>
      <form onSubmit={submit}>
        <Stack>
          {login.isError && (
            <Alert color="red" icon={<IconAlertCircle size={18} />}>
              {errorMessage(login.error)}
            </Alert>
          )}
          <TextInput label={t('auth.username')} autoComplete="username" required autoFocus value={username} onChange={(e) => setUsername(e.currentTarget.value)} />
          <PasswordInput label={t('auth.password')} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.currentTarget.value)} />
          <Button type="submit" loading={login.isPending} fullWidth>
            {t('auth.signIn')}
          </Button>
          {status.data?.registrationOpen && (
            <Text size="sm" ta="center">
              {t('auth.noAccount')}{' '}
              <Anchor component={Link} to="/register">
                {t('auth.createOne')}
              </Anchor>
            </Text>
          )}
        </Stack>
      </form>
    </AuthCard>
  );
}

export function RegisterPage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const me = useMe();
  const status = useAuthStatus();
  const register = useRegister();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');

  if (me.isPending || status.isPending) {
    return (
      <Center mih="100dvh">
        <Loader />
      </Center>
    );
  }
  if (me.data) return <Navigate to="/" />;
  if (!status.data?.registrationOpen) return <Navigate to="/login" />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    register.mutate({ username, password, displayName: displayName || undefined }, { onSuccess: () => void navigate({ to: '/' }) });
  };

  const setup = status.data.needsSetup;
  return (
    <AuthCard title={setup ? t('auth.welcome') : t('auth.createAccount')} subtitle={setup ? t('auth.setupHint') : undefined}>
      <form onSubmit={submit}>
        <Stack>
          {register.isError && (
            <Alert color="red" icon={<IconAlertCircle size={18} />}>
              {errorMessage(register.error)}
            </Alert>
          )}
          <TextInput label={t('auth.username')} description={t('auth.usernameHint')} autoComplete="username" required autoFocus value={username} onChange={(e) => setUsername(e.currentTarget.value)} />
          <TextInput label={t('auth.displayName')} autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.currentTarget.value)} />
          <PasswordInput label={t('auth.password')} description={t('auth.passwordHint')} autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.currentTarget.value)} />
          <Button type="submit" loading={register.isPending} fullWidth>
            {setup ? t('auth.startBrewing') : t('auth.createAccount')}
          </Button>
          {!setup && (
            <Text size="sm" ta="center">
              <Anchor component={Link} to="/login">
                {t('auth.haveAccount')}
              </Anchor>
            </Text>
          )}
        </Stack>
      </form>
    </AuthCard>
  );
}
