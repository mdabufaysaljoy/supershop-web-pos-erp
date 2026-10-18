import { describe, expect, it } from 'vitest';
import {
  createExportJobSchema,
  exportJobsQuerySchema,
  filterPermittedColumns,
  getAllColumns,
  getDefaultColumns,
  reportPresetSchema,
  EXPORT_FORMATS,
  EXPORT_RESOURCES,
  RESOURCE_COLUMNS,
} from '../schemas/export.js';

describe('Universal Export & Report Builder Schemas (P8.4)', () => {
  it('defines all supported resources and formats', () => {
    expect(EXPORT_FORMATS).toEqual(['xlsx', 'csv', 'json']);
    expect(EXPORT_RESOURCES).toContain('orders');
    expect(EXPORT_RESOURCES).toContain('products');
    expect(EXPORT_RESOURCES).toContain('customers');
    expect(EXPORT_RESOURCES).toContain('inventory');
    expect(EXPORT_RESOURCES).toContain('performance');
    expect(EXPORT_RESOURCES).toContain('stockout');
    expect(EXPORT_RESOURCES).toContain('audit');
  });

  it('provides column metadata for each resource', () => {
    for (const res of EXPORT_RESOURCES) {
      const cols = RESOURCE_COLUMNS[res];
      expect(Array.isArray(cols)).toBe(true);
      expect(cols.length).toBeGreaterThan(0);
      expect(cols.every((c) => typeof c.key === 'string' && typeof c.label === 'string')).toBe(
        true,
      );
    }
  });

  it('resolves default and all columns for resources', () => {
    const defaultOrderCols = getDefaultColumns('orders');
    const allOrderCols = getAllColumns('orders');

    expect(defaultOrderCols).toContain('orderNo');
    expect(defaultOrderCols).toContain('total');
    expect(allOrderCols.length).toBeGreaterThanOrEqual(defaultOrderCols.length);

    expect(getDefaultColumns('unknown_resource')).toEqual([]);
    expect(getAllColumns('unknown_resource')).toEqual([]);
  });

  it('filters columns based on permissions (cost field gating)', () => {
    const productCols = ['sku', 'name', 'price', 'cost', 'marginPercent', 'totalOnHand'];

    // Staff without viewCost
    const filteredNoCost = filterPermittedColumns(
      'products',
      productCols,
      (p) => p !== 'product.viewCost',
    );
    expect(filteredNoCost).toEqual(['sku', 'name', 'price', 'totalOnHand']);
    expect(filteredNoCost).not.toContain('cost');
    expect(filteredNoCost).not.toContain('marginPercent');

    // Staff with viewCost
    const filteredWithCost = filterPermittedColumns('products', productCols, () => true);
    expect(filteredWithCost).toContain('cost');
    expect(filteredWithCost).toContain('marginPercent');
  });

  describe('createExportJobSchema', () => {
    it('validates valid export job input', () => {
      const valid = {
        resource: 'orders',
        format: 'xlsx',
        columns: ['orderNo', 'total'],
        filters: { status: 'completed', channel: 'pos' },
        sort: { field: 'createdAt', dir: 'desc' },
        title: 'POS Orders',
      };
      const parsed = createExportJobSchema.parse(valid);
      expect(parsed.resource).toBe('orders');
      expect(parsed.format).toBe('xlsx');
      expect(parsed.columns).toEqual(['orderNo', 'total']);
    });

    it('rejects invalid resource or format', () => {
      expect(() =>
        createExportJobSchema.parse({ resource: 'invalid_res', format: 'csv' }),
      ).toThrow();

      expect(() => createExportJobSchema.parse({ resource: 'orders', format: 'pdf' })).toThrow();
    });

    it('defaults filters to empty object if omitted', () => {
      const parsed = createExportJobSchema.parse({ resource: 'inventory', format: 'csv' });
      expect(parsed.filters).toEqual({});
    });
  });

  describe('exportJobsQuerySchema', () => {
    it('applies defaults and coerces page and limit', () => {
      const parsed = exportJobsQuerySchema.parse({});
      expect(parsed.page).toBe(1);
      expect(parsed.limit).toBe(20);
    });

    it('parses valid resource and status filters', () => {
      const parsed = exportJobsQuerySchema.parse({
        page: '2',
        limit: '50',
        resource: 'products',
        status: 'done',
      });
      expect(parsed.page).toBe(2);
      expect(parsed.limit).toBe(50);
      expect(parsed.resource).toBe('products');
      expect(parsed.status).toBe('done');
    });
  });

  describe('reportPresetSchema', () => {
    it('validates a complete report preset', () => {
      const preset = {
        name: 'Weekly Orders Summary',
        resource: 'orders',
        columns: ['orderNo', 'customerName', 'total', 'createdAt'],
        filters: { range: '7d' },
        format: 'xlsx',
        sort: { field: 'createdAt', dir: 'desc' },
      };
      const parsed = reportPresetSchema.parse(preset);
      expect(parsed.name).toBe('Weekly Orders Summary');
      expect(parsed.resource).toBe('orders');
      expect(parsed.columns.length).toBe(4);
    });

    it('rejects preset with empty columns or empty name', () => {
      expect(() =>
        reportPresetSchema.parse({
          name: '',
          resource: 'orders',
          columns: ['orderNo'],
        }),
      ).toThrow();

      expect(() =>
        reportPresetSchema.parse({
          name: 'My Report',
          resource: 'orders',
          columns: [],
        }),
      ).toThrow();
    });
  });
});
