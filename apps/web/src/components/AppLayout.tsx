import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { ActionIcon, AppShell, Avatar, Badge, Burger, Button, Center, Group, Loader, Menu, NavLink, ScrollArea, Stack, Text, Title, Tooltip, UnstyledButton } from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import {
  IconBooks,
  IconBottle,
  IconChevronDown,
  IconCloudOff,
  IconDroplet,
  IconFlask2,
  IconLayoutDashboard,
  IconLogout,
  IconNotebook,
  IconPackage,
  IconSettings,
  IconTool,
  type Icon,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useLogout, useMe } from '../auth';
import { useLiveUpdates, type LiveStatus } from '../live';
import { InstallMenuItem } from './InstallApp';
import { BreweryBrand } from './Logo';
import { ThemeToggle } from './ThemeControls';

interface NavItem {
  to: string;
  label: string;
  icon: Icon;
  /** Shown in the phone's bottom bar. */
  bottom?: boolean;
  soon?: boolean;
}

export function useNavItems(): NavItem[] {
  const { t } = useTranslation();
  return [
    { to: '/', label: t('nav.dashboard'), icon: IconLayoutDashboard, bottom: true },
    { to: '/recipes', label: t('nav.recipes'), icon: IconNotebook, bottom: true },
    { to: '/batches', label: t('nav.batches'), icon: IconFlask2, bottom: true },
    { to: '/inventory', label: t('nav.inventory'), icon: IconPackage, bottom: true },
    { to: '/equipment', label: t('nav.equipment'), icon: IconTool },
    { to: '/water', label: t('nav.water'), icon: IconDroplet },
    { to: '/library', label: t('nav.library'), icon: IconBooks },
    { to: '/settings', label: t('nav.settings'), icon: IconSettings },
  ];
}

const isActive = (pathname: string, to: string) => (to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`));

export function AppLayout() {
  const { t } = useTranslation();
  const { data: me, isPending, isError, refetch, isFetching } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const [opened, { toggle, close }] = useDisclosure();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const live = useLiveUpdates(Boolean(me));
  const items = useNavItems();
  const phone = useMediaQuery('(max-width: 47.99em)') ?? false;
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => content.current?.scrollTo(0, 0), [pathname]);

  if (isPending) {
    return (
      <Center mih="100dvh">
        <Loader />
      </Center>
    );
  }
  if (isError && !me) {
    return (
      <Center mih="100dvh" p="md">
        <Stack align="center" gap="sm" maw={360} ta="center">
          <IconCloudOff size={40} stroke={1.5} color="var(--mantine-color-dimmed)" />
          <Title order={3}>{t('layout.offlineTitle')}</Title>
          <Text c="dimmed" size="sm">
            {t('layout.offlineText')}
          </Text>
          <Button variant="light" loading={isFetching} onClick={() => void refetch()}>
            {t('common.tryAgain')}
          </Button>
        </Stack>
      </Center>
    );
  }
  if (!me) return <Navigate to="/login" />;

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 240, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      footer={{ height: 64, collapsed: !phone }}
      withBorder={false}
      padding={0}
      classNames={{ root: 'app-frame', header: 'app-chrome', footer: 'app-chrome app-bottom-nav', navbar: 'app-navbar', main: 'app-main' }}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label={t('layout.toggleMenu')} />
            <UnstyledButton component={Link} to="/" onClick={close} style={{ display: 'flex', alignItems: 'center' }}>
              <BreweryBrand height={30} />
            </UnstyledButton>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <LiveIndicator status={live} />
            <ThemeToggle />
            <Menu position="bottom-end" width={200}>
              <Menu.Target>
                <UnstyledButton aria-label={t('layout.userMenu')}>
                  <Group gap={6} wrap="nowrap">
                    <Avatar size={30} radius="xl" color="initials" name={me.displayName} />
                    <Text size="sm" fw={500} visibleFrom="xs">
                      {me.displayName}
                    </Text>
                    <IconChevronDown size={14} />
                  </Group>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>@{me.username}</Menu.Label>
                <Menu.Item component={Link} to="/settings" leftSection={<IconSettings size={16} />}>
                  {t('nav.settings')}
                </Menu.Item>
                <InstallMenuItem />
                <Menu.Divider />
                <Menu.Item
                  color="red"
                  leftSection={<IconLogout size={16} />}
                  onClick={() => logout.mutate(undefined, { onSuccess: () => void navigate({ to: '/login' }) })}
                >
                  {t('layout.signOut')}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar>
        <div className="app-panel app-sidebar">
          <AppShell.Section grow component={ScrollArea}>
            {items.map((item) => (
              <NavLink
                key={item.to}
                label={item.label}
                leftSection={<item.icon size={20} stroke={1.6} />}
                rightSection={item.soon ? <Badge size="xs" variant="light" color="gray">{t('common.soon')}</Badge> : undefined}
                component={Link}
                to={item.to}
                onClick={close}
                active={isActive(pathname, item.to)}
                py={10}
              />
            ))}
          </AppShell.Section>
          <AppShell.Section>
            <Group gap={6} px="sm" py={6} c="dimmed">
              <IconBottle size={14} />
              <Text size="xs">{t('layout.tagline')}</Text>
            </Group>
          </AppShell.Section>
        </div>
      </AppShell.Navbar>

      <AppShell.Main>
        <div ref={content} className="app-panel app-content">
          <Outlet />
        </div>
      </AppShell.Main>

      {/* Phones: the main areas within thumb reach. */}
      <AppShell.Footer>
        <nav className="bottom-nav">
          {items
            .filter((i) => i.bottom)
            .map((item) => (
              <UnstyledButton key={item.to} component={Link} to={item.to} className="bottom-nav-item" data-active={isActive(pathname, item.to) || undefined} onClick={close}>
                <item.icon size={22} stroke={1.7} />
                <span>{item.label}</span>
              </UnstyledButton>
            ))}
        </nav>
      </AppShell.Footer>
    </AppShell>
  );
}

/** Shown only when live updates have been unavailable for a while (brief reconnects stay silent). */
function LiveIndicator({ status }: { status: LiveStatus }) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (status === 'live') {
      setShow(false);
      return;
    }
    const timer = setTimeout(() => setShow(true), 10_000);
    return () => clearTimeout(timer);
  }, [status]);
  if (!show) return null;
  return (
    <Tooltip label={t('layout.livePaused')} multiline w={260}>
      <ActionIcon variant="subtle" color="orange" size="lg" aria-label={t('layout.livePaused')} onClick={() => window.location.reload()}>
        <IconCloudOff size={20} />
      </ActionIcon>
    </Tooltip>
  );
}
