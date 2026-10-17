import { FormField, PlainTextArea, PlainTextInput } from '@supershop/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/features/settings/components/controls';
import { useSaveSettings } from '@/features/settings/hooks';
import { listPrinters } from '@/lib/qz';

/**
 * Settings → Printing: QZ Tray connection, signing certificate & private key, and the shop's
 * 15-digit Saudi VAT number used to generate ZATCA TLV QR codes on receipts and invoices (P6.4).
 */
export function QzSetupCard({
  printingSettings,
  taxSettings,
  status,
  canEdit,
  onDiscoveredPrinters,
}) {
  const { t } = useTranslation();
  const save = useSaveSettings();
  const [certDraft, setCertDraft] = useState(null);
  const [privateKey, setPrivateKey] = useState('');
  const [vatDraft, setVatDraft] = useState(null);
  const [qzState, setQzState] = useState({ checking: false, printers: [], error: null });

  const pVal = (key) => printingSettings?.find((s) => s.key === key)?.value;
  const tVal = (key) => taxSettings?.find((s) => s.key === key)?.value;

  const enabled = Boolean(pVal('printing.enabled'));
  const autoPrint = Boolean(pVal('printing.autoPrintReceipt') ?? true);
  const savedCert = pVal('printing.qzCertificate') ?? '';
  const keyInfo = pVal('printing.qzPrivateKey');
  const savedVat = tVal('tax.vatNumber') ?? '';

  const certValue = certDraft ?? savedCert;
  const vatValue = vatDraft ?? savedVat;

  const handleDetectPrinters = async () => {
    setQzState({ checking: true, printers: [], error: null });
    try {
      const found = await listPrinters();
      const list = Array.isArray(found) ? found : [found].filter(Boolean);
      setQzState({ checking: false, printers: list, error: null });
      onDiscoveredPrinters?.(list);
    } catch (err) {
      setQzState({
        checking: false,
        printers: [],
        error: err?.message || t('printing.qz.unreachable'),
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>
            <h2>{t('printing.qz.title')}</h2>
          </CardTitle>
          <Badge tone={status?.configured ? 'ok' : 'warn'}>
            {status?.configured ? t('printing.qz.ready') : t('printing.qz.notConfigured')}
          </Badge>
        </div>
        <CardDescription>{t('printing.qz.description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Checkbox
            id="printing-enabled"
            label={t('printing.qz.enabled')}
            description={t('printing.qz.enabledHelp')}
            checked={enabled}
            disabled={!canEdit || save.isPending}
            onChange={(e) => save.mutate([{ key: 'printing.enabled', value: e.target.checked }])}
          />
          <Checkbox
            id="printing-autoprint"
            label={t('printing.qz.autoPrint')}
            description={t('printing.qz.autoPrintHelp')}
            checked={autoPrint}
            disabled={!canEdit || save.isPending}
            onChange={(e) =>
              save.mutate([{ key: 'printing.autoPrintReceipt', value: e.target.checked }])
            }
          />
        </div>

        <FormField label={t('printing.qz.vatNumber')} description={t('printing.qz.vatNumberHelp')}>
          <div className="flex max-w-md gap-2">
            <PlainTextInput
              dir="ltr"
              placeholder={t('printing.qz.vatNumberPlaceholder')}
              value={vatValue}
              disabled={!canEdit}
              onChange={(e) => setVatDraft(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              disabled={!canEdit || vatValue === savedVat || save.isPending}
              onClick={() => {
                save.mutate([{ key: 'tax.vatNumber', value: vatValue.trim() }]);
                setVatDraft(null);
              }}
            >
              {t('common.save')}
            </Button>
          </div>
        </FormField>

        <FormField
          label={t('printing.qz.certificate')}
          description={t('printing.qz.certificateHelp')}
        >
          <div className="grid gap-2">
            <PlainTextArea
              dir="ltr"
              rows={3}
              className="font-mono text-xs"
              placeholder={t('printing.qz.certificatePlaceholder')}
              value={certValue}
              disabled={!canEdit}
              onChange={(e) => setCertDraft(e.target.value)}
            />
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canEdit || certValue === savedCert || save.isPending}
                onClick={() => {
                  save.mutate([{ key: 'printing.qzCertificate', value: certValue }]);
                  setCertDraft(null);
                }}
              >
                {t('printing.qz.saveCertificate')}
              </Button>
            </div>
          </div>
        </FormField>

        <FormField
          label={t('printing.qz.privateKey')}
          description={
            keyInfo?.isSet
              ? t('printing.qz.keyStored', { masked: keyInfo.masked })
              : t('printing.qz.keyNotSet')
          }
        >
          <div className="flex gap-2">
            <PlainTextInput
              dir="ltr"
              autoComplete="off"
              placeholder={t('printing.qz.privateKeyPlaceholder')}
              value={privateKey}
              disabled={!canEdit}
              onChange={(e) => setPrivateKey(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              disabled={!canEdit || !privateKey.trim() || save.isPending}
              onClick={() => {
                save.mutate([{ key: 'printing.qzPrivateKey', value: privateKey }]);
                setPrivateKey('');
              }}
            >
              {t('common.save')}
            </Button>
          </div>
        </FormField>

        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={qzState.checking}
            onClick={handleDetectPrinters}
          >
            {t('printing.qz.detectPrinters')}
          </Button>
          {qzState.printers.length > 0 && (
            <span className="text-sm text-muted-foreground">
              {t('printing.qz.detectedCount', { count: qzState.printers.length })}:{' '}
              <span dir="ltr" className="font-mono text-xs">
                {qzState.printers.join(', ')}
              </span>
            </span>
          )}
          {qzState.error && <span className="text-sm text-destructive">{qzState.error}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
