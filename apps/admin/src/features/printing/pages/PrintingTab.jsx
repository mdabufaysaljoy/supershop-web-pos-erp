import { PERMISSIONS } from '@supershop/shared';
import { useState } from 'react';
import { useSettings } from '@/features/settings/hooks';
import { useCan } from '@/lib/permissions';
import { LabelTemplateCard } from '../components/LabelTemplateCard';
import { PrinterProfilesCard } from '../components/PrinterProfilesCard';
import { QzSetupCard } from '../components/QzSetupCard';
import { ReceiptTemplateCard } from '../components/ReceiptTemplateCard';
import { usePrinters, usePrintingStatus, usePrintingTemplates } from '../resource';

/**
 * Settings → Printing (P6.4): QZ Tray signing setup, receipt & label printer profiles, and the
 * receipt (en/ar/bilingual + ZATCA TLV QR) and barcode label template editors with live previews.
 */
export function PrintingTab() {
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

  return (
    <div className="grid gap-6">
      <QzSetupCard
        printingSettings={printingSettings.data}
        taxSettings={taxSettings.data}
        status={status.data}
        canEdit={canEdit}
        onDiscoveredPrinters={setDiscoveredPrinters}
      />

      <PrinterProfilesCard
        profiles={profiles.data ?? []}
        discoveredPrinters={discoveredPrinters}
        canEdit={canEdit}
      />

      <ReceiptTemplateCard
        template={templates.data?.receipt}
        shopName={shopName}
        vatNumber={vatNumber}
        canEdit={canEdit}
      />

      <LabelTemplateCard template={templates.data?.label} shopName={shopName} canEdit={canEdit} />
    </div>
  );
}
