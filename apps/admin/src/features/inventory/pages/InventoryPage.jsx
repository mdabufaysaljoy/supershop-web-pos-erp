import { PERMISSIONS as P } from '@supershop/shared';
import { ArrowLeftRight, ClipboardCheck, PackagePlus, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/features/auth/store';
import { Select } from '@/features/settings/components/controls';
import { useCan } from '@/lib/permissions';
import { useListParams } from '@/lib/useListParams';
import { DocumentsTab } from '../components/DocumentsTab';
import { LevelsTab } from '../components/LevelsTab';
import { MovementsTab } from '../components/MovementsTab';
import { OperationDialog } from '../components/OperationDialog';
import { StockOperationDialog } from '../components/StockOperationDialog';
import { ThresholdDialog } from '../components/ThresholdDialog';
import { useInventoryBranches } from '../resource';

const TABS = [
  { id: 'levels', label: 'inventory.tabs.levels', Component: LevelsTab },
  { id: 'movements', label: 'inventory.tabs.movements', Component: MovementsTab },
  { id: 'documents', label: 'inventory.tabs.documents', Component: DocumentsTab },
];
/** Header actions: [mode, permission, icon]. */
const ACTIONS = [
  ['receive', P.INVENTORY_RECEIVE, PackagePlus],
  ['adjust', P.INVENTORY_ADJUST, SlidersHorizontal],
  ['count', P.INVENTORY_ADJUST, ClipboardCheck],
  ['transfer', P.INVENTORY_TRANSFER, ArrowLeftRight],
];

/**
 * Inventory (P2.4): stock per branch, the movement ledger and stock documents, plus receive /
 * adjust / count / transfer. Everything is limited to the user's branches by the API; the branch
 * filter and tab live in the URL.
 */
export function InventoryPage() {
  const { t } = useTranslation();
  const can = useCan();
  const searchParams = useSearchParams();
  const [params, setParams] = searchParams;
  const { go } = useListParams(searchParams);
  const active = TABS.find((tab) => tab.id === params.get('tab')) ?? TABS[0];
  const branchId = params.get('branchId') ?? '';
  const access = useAuthStore((s) => s.access);
  const { data: branchOptions = [] } = useInventoryBranches();
  const [operation, setOperation] = useState(null); // { mode, initial }
  const [documentId, setDocumentId] = useState(null);
  const [thresholdOf, setThresholdOf] = useState(null);

  /** Switching tab keeps the branch filter, drops the rest. */
  const openTab = (id) => setParams({ tab: id, ...(branchId && { branchId }) });
  const { Component } = active;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold">{t('inventory.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('inventory.description')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ACTIONS.filter(([, perm]) => can(perm)).map(([mode, , Icon]) => (
            <Button
              key={mode}
              variant={mode === 'receive' ? 'default' : 'outline'}
              onClick={() => setOperation({ mode, initial: { branchId } })}
            >
              <Icon className="size-4" aria-hidden />
              {t(`inventory.modes.${mode}.action`)}
            </Button>
          ))}
        </div>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-3 border-b">
        <div role="tablist" aria-label={t('inventory.title')} className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              type="button"
              aria-selected={tab.id === active.id}
              onClick={() => openTab(tab.id)}
              className="-mb-px border-b-2 px-3 py-2 text-sm font-medium aria-selected:border-primary aria-[selected=false]:border-transparent aria-[selected=false]:text-muted-foreground"
            >
              {t(tab.label)}
            </button>
          ))}
        </div>
        {branchOptions.length > 1 && (
          <Select
            className="mb-2 w-auto"
            aria-label={t('inventory.branchFilter')}
            value={branchId}
            onChange={(e) => go({ branchId: e.target.value, page: 1 })}
          >
            <option value="">
              {t(access?.allBranches ? 'inventory.allBranches' : 'inventory.myBranches')}
            </option>
            {branchOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} · {b.name.en}
              </option>
            ))}
          </Select>
        )}
      </div>

      <div role="tabpanel">
        <Component
          params={params}
          go={go}
          onDocument={setDocumentId}
          onThreshold={setThresholdOf}
          onAdjust={(level) =>
            setOperation({
              mode: 'adjust',
              initial: { branchId: level.branch?.id, variant: level.variant },
            })
          }
          onHistory={(level) =>
            setParams({ tab: 'movements', variantId: level.variant.id, branchId: level.branch.id })
          }
        />
      </div>

      {operation && (
        <StockOperationDialog
          mode={operation.mode}
          initial={operation.initial}
          branchOptions={branchOptions}
          open
          onOpenChange={(open) => !open && setOperation(null)}
        />
      )}
      <OperationDialog operationId={documentId} onClose={() => setDocumentId(null)} />
      <ThresholdDialog level={thresholdOf} onClose={() => setThresholdOf(null)} />
    </div>
  );
}
