import { PERMISSIONS as P } from '@supershop/shared';
import { createBrowserRouter } from 'react-router';
import { AppLayout } from '@/components/layout/AppLayout';
import { allNavItems } from '@/components/layout/navigation';
import { RequireAuth } from '@/features/auth/components/RequireAuth';
import { BranchesPage } from '@/features/branches/pages/BranchesPage';
import { BrandsPage } from '@/features/brands/pages/BrandsPage';
import { CategoriesPage } from '@/features/categories/pages/CategoriesPage';
import { CustomFieldsPage } from '@/features/customFields/pages/CustomFieldsPage';
import { MediaLibraryPage } from '@/features/media/pages/MediaLibraryPage';
import { ProductTransferPage } from '@/features/productTransfer/pages/ProductTransferPage';
import { ProductEditorPage } from '@/features/products/pages/ProductEditorPage';
import { ProductsPage } from '@/features/products/pages/ProductsPage';
import { SuppliersPage } from '@/features/suppliers/pages/SuppliersPage';
import { SettingsPage } from '@/features/settings/pages/SettingsPage';
import { RequirePermission } from '@/features/auth/components/RequirePermission';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { ComingSoonPage } from '@/pages/ComingSoonPage';
import { HomePage } from '@/pages/HomePage';
import { NotFoundPage } from '@/pages/NotFoundPage';

/**
 * Feature pages register here as they ship: path → element. Anything in the menu without an
 * entry renders the ComingSoon placeholder. Every menu route is permission-gated from NAV.
 */
const PAGES = {
  '/products': <ProductsPage />,
  '/brands': <BrandsPage />,
  '/suppliers': <SuppliersPage />,
  '/branches': <BranchesPage />,
  '/categories': <CategoriesPage />,
  '/media': <MediaLibraryPage />,
  '/settings': <SettingsPage />,
};

/** Sub-pages of a menu section: `{ path, permission, element }` (matched before `:id`). */
const SUB_PAGES = {
  '/products': [
    { path: 'new', permission: P.PRODUCT_CREATE, element: <ProductEditorPage /> },
    {
      path: 'fields',
      permission: P.CUSTOM_FIELD_MANAGE,
      element: <CustomFieldsPage entity="product" />,
    },
    {
      path: 'transfer',
      permission: [P.PRODUCT_IMPORT, P.PRODUCT_EXPORT],
      element: <ProductTransferPage />,
    },
    { path: ':id', permission: P.PRODUCT_VIEW, element: <ProductEditorPage /> },
  ],
};

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
            .flatMap((item) => [
              {
                path: item.path.slice(1),
                element: (
                  <RequirePermission perm={item.permission}>
                    {PAGES[item.path] ?? <ComingSoonPage labelKey={item.label} />}
                  </RequirePermission>
                ),
              },
              // Sub-pages (editors) carry their own permission.
              ...(SUB_PAGES[item.path] ?? []).map((sub) => ({
                path: `${item.path.slice(1)}/${sub.path}`,
                element: <RequirePermission perm={sub.permission}>{sub.element}</RequirePermission>,
              })),
            ]),
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export const createRouter = () => createBrowserRouter(routes);
