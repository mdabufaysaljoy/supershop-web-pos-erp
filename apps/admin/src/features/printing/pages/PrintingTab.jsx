import { PERMISSIONS } from '@supershop/shared';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/features/settings/hooks';
import { useCan } from '@/lib/permissions';
import { LabelTemplateCard } from '../components/LabelTemplateCard';
import { PrinterProfilesCard } from '../components/PrinterProfilesCard';
import { QzSetupCard } from '../components/QzSetupCard';
import { ReceiptTemplateCard } from '../components/ReceiptTemplateCard';
import { usePrinters, usePrintingStatus, usePrintingTemplates } from '../resource';

/**
 * Settings → Printing (P6.4), read top to bottom as the three things a shop actually has to do:
 *   1. let this computer talk to the printers (QZ Tray, and the shop's own signing keys);
 *   2. tell it which printers are here and what paper is in them;
 *   3. say what a receipt and a barcode label should say.
 * Each step shows whether it is done, so a half-set-up shop can see where it stopped.
 */
export function PrintingTab() {
  const { t } = useTranslation();
  const canEdit = useCan()(PERMISSIONS.SETTINGS_PRINTING);
  const status = usePrintingStatus();
  const printingSettings = useSettings('printing');
  const taxSettings = useSettings('tax');
  const generalSettings = useSettings('general');
  const profiles = usePrinters();
  const templates = usePrintingTemplates();
  const [discoveredPrinters, setDiscoveredPrinters] = useState([]);

  const shopName = generalSettings.data?.find((s) => s.key === 'store.name')?.value ?? 'Supershop';
  const vatNumber = taxSettings.data?.find((s) => s.key === 'tax.vatNumber')?.value ?? '';
  const printerCount = profiles.data?.length ?? 0;

  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">{t('printing.intro')}</p>

      <Step
        n={1}
        title={t('printing.steps.connect')}
        hint={t('printing.steps.connectHint')}
        done={Boolean(status.data?.configured)}
        pending={status.isPending}
      >
        <QzSetupCard
          printingSettings={printingSettings.data}
          taxSettings={taxSettings.data}
          status={status.data}
          canEdit={canEdit}
          onDiscoveredPrinters={setDiscoveredPrinters}
        />
      </Step>

      <Step
        n={2}
        title={t('printing.steps.printers')}
        hint={t('printing.steps.printersHint')}
        done={printerCount > 0}
        pending={profiles.isPending}
      >
        <PrinterProfilesCard
          profiles={profiles.data ?? []}
          discoveredPrinters={discoveredPrinters}
          canEdit={canEdit}
        />
      </Step>

      <Step
        n={3}
        title={t('printing.steps.layout')}
        hint={t('printing.steps.layoutHint')}
        done={Boolean(templates.data)}
        pending={templates.isPending}
      >
        <div className="grid gap-6">
          <ReceiptTemplateCard
            template={templates.data?.receipt}
            shopName={shopName}
            vatNumber={vatNumber}
            canEdit={canEdit}
          />
          <LabelTemplateCard
            template={templates.data?.label}
            shopName={shopName}
            canEdit={canEdit}
          />
        </div>
      </Step>
    </div>
  );
}

/** One step of the set-up, numbered, with a plain line about what it is for and whether it is done. */
function Step({ n, title, hint, done, pending, children }) {
  const { t } = useTranslation();
  return (
    <section className="grid gap-3">
      <header className="flex flex-wrap items-center gap-2">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {n}
        </span>
        <h2 className="text-base font-semibold">{title}</h2>
        {!pending &&
          (done ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="size-3.5" aria-hidden />
              {t('printing.steps.done')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
              <CircleAlert className="size-3.5" aria-hidden />
              {t('printing.steps.todo')}
            </span>
          ))}
        <p className="basis-full text-sm text-muted-foreground">{hint}</p>
      </header>
      {children}
    </section>
  );
}
