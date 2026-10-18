import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT_DIR = path.resolve(import.meta.dirname, '../../../../../');

describe('Admin User Guide & In-App Help (P10.5)', () => {
  it('docs/ADMIN_USER_GUIDE.md exists and contains exhaustive operational documentation', () => {
    const guidePath = path.join(ROOT_DIR, 'docs/ADMIN_USER_GUIDE.md');
    expect(fs.existsSync(guidePath), 'docs/ADMIN_USER_GUIDE.md should exist').toBe(true);

    const content = fs.readFileSync(guidePath, 'utf8');
    expect(content.length).toBeGreaterThan(10000);

    // Section headers and core topics
    const expectedSections = [
      'Executive Overview & Architectural Invariants',
      'Authentication, Security & Staff Access Control',
      'Point of Sale (POS) Counter Operations',
      'Cashier Shifts & Till Reconciliation',
      'Hardware, Thermal Receipts & Barcode Label Printing',
      'Catalog & Product Management',
      'Inventory Control, Transfers & Stock Ledger',
      'Omnichannel Orders & Fulfillment',
      'Returns, Exchanges & Credit Notes',
      'Customer Management & Dynamic Segmentation',
      'Customer Loyalty Program',
      'Marketing Campaigns & Omnichannel Messaging',
      'Storefront CMS, Visual Page Builder & Navigation',
      'Analytics, Forecasting & Universal Data Exports',
      'Settings, Localization & Marketing Tracking',
      'Database Indexes, Backups & Disaster Recovery',
      'Staff Checklists, Keyboard Shortcuts & Error Reference',
    ];

    for (const section of expectedSections) {
      expect(content).toContain(section);
    }

    // Critical operational concepts
    const requiredKeywords = [
      'Integer Money (Halalas)',
      'Append-Only Stock Ledger',
      'Zero-Halala Remainder Pricing on Returns',
      'ZATCA Phase-1',
      'Two-Factor Authentication',
      'QZ Tray',
      'SHIFT_DISCREPANCY_TOO_LARGE',
      'X-Report',
      'Z-Report',
      'Held Baskets',
      'Code 128',
      'Formula Injection Defense',
      'UTF-8 Byte Order Mark',
      'F2',
      'F4',
      'npm run db:indexes',
      'npm run ops:backup',
    ];

    for (const kw of requiredKeywords) {
      expect(content).toContain(kw);
    }
  });

  it('admin in-app help drawer component exists and is mounted in AppLayout', () => {
    const drawerPath = path.join(ROOT_DIR, 'apps/admin/src/components/help/HelpDrawer.jsx');
    const layoutPath = path.join(ROOT_DIR, 'apps/admin/src/components/layout/AppLayout.jsx');

    expect(fs.existsSync(drawerPath), 'HelpDrawer.jsx should exist').toBe(true);
    expect(fs.existsSync(layoutPath), 'AppLayout.jsx should exist').toBe(true);

    const drawerContent = fs.readFileSync(drawerPath, 'utf8');
    expect(drawerContent).toContain('HelpDrawer');
    expect(drawerContent).toContain('SHORTCUT_DEFS');
    expect(drawerContent).toContain('TOPIC_KEYS');

    const layoutContent = fs.readFileSync(layoutPath, 'utf8');
    expect(layoutContent).toContain('HelpDrawer');
    expect(layoutContent).toContain('<HelpDrawer />');
  });

  it('admin en.json contains all help strings and topics', () => {
    const enLocalePath = path.join(ROOT_DIR, 'apps/admin/src/locales/en.json');
    expect(fs.existsSync(enLocalePath)).toBe(true);

    const enJson = JSON.parse(fs.readFileSync(enLocalePath, 'utf8'));
    expect(enJson.help).toBeDefined();
    expect(enJson.help.title).toBeDefined();
    expect(enJson.help.topics.pos).toBeDefined();
    expect(enJson.help.topics.shifts).toBeDefined();
    expect(enJson.help.topics.returns).toBeDefined();
    expect(enJson.help.topics.orders).toBeDefined();
    expect(enJson.help.topics.inventory).toBeDefined();
    expect(enJson.help.topics.barcodes).toBeDefined();
    expect(enJson.help.topics.translations).toBeDefined();
    expect(enJson.help.topics.exports).toBeDefined();
    expect(enJson.help.shortcuts.f2).toBeDefined();
    expect(enJson.help.shortcuts.f4).toBeDefined();
  });
});
