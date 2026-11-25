import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/charts/styles.css';
import './styles.css';
import './i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createTheme, MantineProvider, type CSSVariablesResolver } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { PrefsSync } from './components/ThemeControls';
import { setupPwa } from './pwa';
import { router } from './router';

const theme = createTheme({
  primaryColor: 'brew',
  primaryShade: { light: 7, dark: 6 },
  // Picks black or white text on filled buttons, so the bright amber stays readable.
  autoContrast: true,
  defaultRadius: 'md',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  headings: { fontWeight: '650' },
  colors: {
    /** Accent: the amber of a pale ale, lightest to darkest. */
    brew: ['#fff8e6', '#ffefcc', '#ffdd99', '#ffca62', '#ffba36', '#ffb01b', '#ffab09', '#e39500', '#ca8400', '#af7100'],
    /** Dark mode surfaces (7 page, 6 cards/inputs, 5 hover, 4 borders). */
    dark: ['#c9c9c9', '#b8b8b8', '#828282', '#696969', '#2c2a27', '#2a2825', '#1c1b19', '#141312', '#0f0e0d', '#0a0a09'],
  },
});

/** The app's own colours (frame and cards), per colour scheme. */
const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    '--app-chrome': '#f6f4f0',
    '--app-chrome-hover': '#ece8e1',
    '--app-card': '#ffffff',
  },
  dark: {
    '--app-chrome': 'var(--mantine-color-dark-6)',
    '--app-chrome-hover': 'var(--mantine-color-dark-5)',
    '--app-card': 'var(--mantine-color-dark-6)',
  },
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

setupPwa();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} defaultColorScheme="auto">
      <QueryClientProvider client={queryClient}>
        <Notifications position="bottom-right" />
        <PrefsSync />
        <ModalsProvider>
          <RouterProvider router={router} />
        </ModalsProvider>
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);
