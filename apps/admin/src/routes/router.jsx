import { PERMISSIONS as P } from '@supershop/shared';
import { createBrowserRouter } from 'react-router';
import { AppLayout } from '@/components/layout/AppLayout';
import { allNavItems } from '@/components/layout/navigation';
import { RequireAuth } from '@/features/auth/components/RequireAuth';
import { BranchesPage } from '@/features/branches/pages/BranchesPage';
import { BrandsPage } from '@/features/brands/pages/BrandsPage';
import { CategoriesPage } from '@/features/categories/pages/CategoriesPage';
import { CustomerDetailPage } from '@/features/customers/pages/CustomerDetailPage';
import { CustomersPage } from '@/features/customers/pages/CustomersPage';
import { CampaignsPage } from '@/features/campaigns/pages/CampaignsPage';
import { CampaignEditorPage } from '@/features/campaigns/pages/CampaignEditorPage';
import { CustomFieldsPage } from '@/features/customFields/pages/CustomFieldsPage';
import { InventoryPage } from '@/features/inventory/pages/InventoryPage';
import { MediaLibraryPage } from '@/features/media/pages/MediaLibraryPage';
import { OrderDetailPage } from '@/features/orders/pages/OrderDetailPage';
import { AppearancePage } from '@/features/site/pages/AppearancePage';
import { MenuEditorPage } from '@/features/site/pages/MenuEditorPage';
import { PageBuilderPage } from '@/features/pages/pages/PageBuilderPage';
import { PagesPage } from '@/features/pages/pages/PagesPage';
import { OrdersPage } from '@/features/orders/pages/OrdersPage';
import { PosPage } from '@/features/pos/pages/PosPage';
import { ProductTransferPage } from '@/features/productTransfer/pages/ProductTransferPage';
import { ProductEditorPage } from '@/features/products/pages/ProductEditorPage';
import { ProductsPage } from '@/features/products/pages/ProductsPage';
import { PurchaseOrderEditorPage } from '@/features/purchaseOrders/pages/PurchaseOrderEditorPage';
import { PurchaseOrdersPage } from '@/features/purchaseOrders/pages/PurchaseOrdersPage';
import { ReportsPage } from '@/features/reports/pages/ReportsPage';
import { ReturnsPage } from '@/features/returns/pages/ReturnsPage';
import { SuppliersPage } from '@/features/suppliers/pages/SuppliersPage';
import { SettingsPage } from '@/features/settings/pages/SettingsPage';
import { ShiftsPage } from '@/features/shifts/pages/ShiftsPage';
import { TrackingPage } from '@/features/tracking/pages/TrackingPage';
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
  '/orders': <OrdersPage />,
  '/customers': <CustomersPage />,
  '/pos': <PosPage />,
  '/shifts': <ShiftsPage />,
  '/returns': <ReturnsPage />,
  '/pages': <PagesPage />,
  '/appearance': <AppearancePage />,
  '/products': <ProductsPage />,
  '/brands': <BrandsPage />,
  '/suppliers': <SuppliersPage />,
  '/branches': <BranchesPage />,
  '/inventory': <InventoryPage />,
  '/purchase-orders': <PurchaseOrdersPage />,
  '/categories': <CategoriesPage />,
  '/media': <MediaLibraryPage />,
  '/campaigns': <CampaignsPage />,
  '/tracking': <TrackingPage />,
  '/settings': <SettingsPage />,
  '/reports': <ReportsPage />,
};

/** Sub-pages of a menu section: `{ path, permission, element }` (matched before `:id`). */
const SUB_PAGES = {
  '/campaigns': [
    { path: 'new', permission: P.CAMPAIGN_MANAGE, element: <CampaignEditorPage /> },
    { path: ':id', permission: P.CAMPAIGN_VIEW, element: <CampaignEditorPage /> },
  ],
  '/orders': [{ path: ':id', permission: P.ORDER_VIEW, element: <OrderDetailPage /> }],
  '/customers': [{ path: ':id', permission: P.CUSTOMER_VIEW, element: <CustomerDetailPage /> }],
  '/pages': [{ path: ':id', permission: P.PAGE_VIEW, element: <PageBuilderPage /> }],
  '/appearance': [
    { path: ':id', permission: [P.PAGE_VIEW, P.MENU_MANAGE], element: <MenuEditorPage /> },
  ],
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
  '/purchase-orders': [
    { path: 'new', permission: P.PURCHASE_MANAGE, element: <PurchaseOrderEditorPage /> },
    {
      path: ':id',
      permission: [P.PURCHASE_VIEW, P.PURCHASE_MANAGE],
      element: <PurchaseOrderEditorPage />,
    },
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
