import { createBrowserRouter } from 'react-router';
import { AppLayout } from '@/components/layout/AppLayout';
import { allNavItems } from '@/components/layout/navigation';
import { RequireAuth } from '@/features/auth/components/RequireAuth';
import { RequirePermission } from '@/features/auth/components/RequirePermission';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { ComingSoonPage } from '@/pages/ComingSoonPage';
import { HomePage } from '@/pages/HomePage';
import { NotFoundPage } from '@/pages/NotFoundPage';

/**
 * Feature pages register here as they ship: path → element. Anything in the menu without an
 * entry renders the ComingSoon placeholder. Every menu route is permission-gated from NAV.
 */
const PAGES = {};

/** Route objects (exported for tests, which mount them in a memory router). */
export const routes = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <HomePage /> },
          ...allNavItems()
            .filter((item) => item.path !== '/')
            .map((item) => ({
              path: item.path.slice(1),
              element: (
                <RequirePermission perm={item.permission}>
                  {PAGES[item.path] ?? <ComingSoonPage labelKey={item.label} />}
                </RequirePermission>
              ),
            })),
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export const createRouter = () => createBrowserRouter(routes);
