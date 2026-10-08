import { PERMISSIONS as P } from '@supershop/shared';
import {
  BarChart3,
  Boxes,
  Factory,
  FileText,
  FolderTree,
  Images,
  LayoutDashboard,
  Megaphone,
  Package,
  Receipt,
  ScrollText,
  Settings,
  Tags,
  ShieldCheck,
  ShoppingCart,
  UserCog,
  Users,
} from 'lucide-react';

/**
 * Single source of truth for the admin menu AND its routes (routes/router.jsx builds one route per
 * item, guarded by the same permission). Add a section = add an item here + its page component.
 * `label`/`section` are i18n keys.
 */
export const NAV = [
  {
    section: 'nav.sections.overview',
    items: [
      { path: '/', label: 'nav.dashboard', icon: LayoutDashboard, permission: P.DASHBOARD_VIEW },
    ],
  },
  {
    section: 'nav.sections.sales',
    items: [
      { path: '/pos', label: 'nav.pos', icon: ShoppingCart, permission: P.POS_SELL },
      { path: '/orders', label: 'nav.orders', icon: Receipt, permission: P.ORDER_VIEW },
      { path: '/customers', label: 'nav.customers', icon: Users, permission: P.CUSTOMER_VIEW },
    ],
  },
  {
    section: 'nav.sections.catalog',
    items: [
      { path: '/products', label: 'nav.products', icon: Package, permission: P.PRODUCT_VIEW },
      { path: '/inventory', label: 'nav.inventory', icon: Boxes, permission: P.INVENTORY_VIEW },
      {
        path: '/categories',
        label: 'nav.categories',
        icon: FolderTree,
        permission: P.CATEGORY_MANAGE,
      },
      { path: '/brands', label: 'nav.brands', icon: Tags, permission: P.BRAND_MANAGE },
      { path: '/suppliers', label: 'nav.suppliers', icon: Factory, permission: P.SUPPLIER_MANAGE },
      { path: '/media', label: 'nav.media', icon: Images, permission: P.MEDIA_MANAGE },
    ],
  },
  {
    section: 'nav.sections.content',
    items: [
      { path: '/pages', label: 'nav.pages', icon: FileText, permission: P.PAGE_VIEW },
      { path: '/campaigns', label: 'nav.campaigns', icon: Megaphone, permission: P.CAMPAIGN_VIEW },
    ],
  },
  {
    section: 'nav.sections.insights',
    items: [{ path: '/reports', label: 'nav.reports', icon: BarChart3, permission: P.REPORT_VIEW }],
  },
  {
    section: 'nav.sections.admin',
    items: [
      { path: '/staff', label: 'nav.staff', icon: UserCog, permission: P.STAFF_VIEW },
      { path: '/roles', label: 'nav.roles', icon: ShieldCheck, permission: P.ROLE_MANAGE },
      { path: '/settings', label: 'nav.settings', icon: Settings, permission: P.SETTINGS_VIEW },
      { path: '/audit', label: 'nav.audit', icon: ScrollText, permission: P.AUDIT_VIEW },
    ],
  },
];

/** Sections with only the items the user may open; empty sections are dropped. */
export const filterNav = (nav, can) =>
  nav
    .map((s) => ({ ...s, items: s.items.filter((i) => can(i.permission)) }))
    .filter((s) => s.items.length > 0);

export const allNavItems = (nav = NAV) => nav.flatMap((s) => s.items);
