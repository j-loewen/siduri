import { createRootRoute, createRoute, createRouter, lazyRouteComponent, Outlet } from '@tanstack/react-router';
import { LIBRARY_KINDS, type LibraryKind } from '@brew/shared';
import { AppLayout } from './components/AppLayout';
import { BATCH_TABS, type BatchTab } from './components/batch-ui';
import { ErrorPage } from './components/ErrorPage';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { DashboardPage } from './pages/DashboardPage';
import { BatchesPage } from './pages/BatchesPage';
import { RecipesPage } from './pages/RecipesPage';

const rootRoute = createRootRoute({ component: Outlet });

const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/login', component: LoginPage });
const registerRoute = createRoute({ getParentRoute: () => rootRoute, path: '/register', component: RegisterPage });

/** Everything below requires login (guarded in AppLayout). */
const appRoute = createRoute({ getParentRoute: () => rootRoute, id: 'app', component: AppLayout });

const dashboardRoute = createRoute({ getParentRoute: () => appRoute, path: '/', component: DashboardPage });

const recipesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/recipes',
  validateSearch: (s: Record<string, unknown>): { q?: string } => (typeof s.q === 'string' && s.q ? { q: s.q } : {}),
  component: RecipesPage,
});

export const recipeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/recipes/$recipeId',
  component: lazyRouteComponent(() => import('./pages/RecipeEditorPage'), 'RecipeEditorPage'),
});

export const libraryRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/library',
  validateSearch: (s: Record<string, unknown>): { kind: LibraryKind } => ({
    kind: LIBRARY_KINDS.includes(s.kind as LibraryKind) ? (s.kind as LibraryKind) : 'fermentable',
  }),
  component: lazyRouteComponent(() => import('./pages/LibraryPage'), 'LibraryPage'),
});

const batchesRoute = createRoute({ getParentRoute: () => appRoute, path: '/batches', component: BatchesPage });

export const batchRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/batches/$batchId',
  // Without a tab, the page opens the one for the batch's status.
  validateSearch: (s: Record<string, unknown>): { tab?: BatchTab } => (BATCH_TABS.includes(s.tab as BatchTab) ? { tab: s.tab as BatchTab } : {}),
  component: lazyRouteComponent(() => import('./pages/BatchPage'), 'BatchPage'),
});

/** Full screen, outside the app layout (it checks the login itself). */
export const brewdayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/batches/$batchId/brewday',
  component: lazyRouteComponent(() => import('./pages/BrewDayPage'), 'BrewDayPage'),
});

const equipmentRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/equipment',
  component: lazyRouteComponent(() => import('./pages/EquipmentPage'), 'EquipmentPage'),
});

const settingsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/settings',
  component: lazyRouteComponent(() => import('./pages/SettingsPage'), 'SettingsPage'),
});

const inventoryRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/inventory',
  component: lazyRouteComponent(() => import('./pages/InventoryPage'), 'InventoryPage'),
});

const waterRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/water',
  component: lazyRouteComponent(() => import('./pages/WaterPage'), 'WaterPage'),
});

const trashRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/trash',
  component: lazyRouteComponent(() => import('./pages/TrashPage'), 'TrashPage'),
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  registerRoute,
  brewdayRoute,
  appRoute.addChildren([
    dashboardRoute,
    recipesRoute,
    recipeRoute,
    batchesRoute,
    batchRoute,
    libraryRoute,
    equipmentRoute,
    settingsRoute,
    inventoryRoute,
    waterRoute,
    trashRoute,
  ]),
]);

export const router = createRouter({ routeTree, defaultPreload: 'intent', defaultErrorComponent: ErrorPage });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
