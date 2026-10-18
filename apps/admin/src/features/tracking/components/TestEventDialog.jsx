import { CheckCircle2, FlaskConical, Loader2, Send, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDispatchTestEvent } from '../resource';

export function TestEventDialog({ open, onOpenChange }) {
  const { t } = useTranslation();
  const dispatchTest = useDispatchTestEvent();

  const [provider, setProvider] = useState('meta');
  const [event, setEvent] = useState('purchase');
  const [testEventCode, setTestEventCode] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [value, setValue] = useState(150);

  const [result, setResult] = useState(null);

  const handleSend = (e) => {
    e.preventDefault();
    setResult(null);

    dispatchTest.mutate(
      {
        provider,
        event,
        ...(testEventCode && { testEventCode }),
        ...(orderNumber && { orderNumber }),
        value: Number(value) || 100,
        currency: 'SAR',
      },
      {
        onSuccess: (data) => {
          setResult(data);
        },
        onError: (err) => {
          setResult({ success: false, error: err.message });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" closeLabel={t('common.close')}>
        <form onSubmit={handleSend} className="space-y-4">
          <div>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="size-5 text-primary" aria-hidden />
              {t('tracking.logs.test.title')}
            </DialogTitle>
            <DialogDescription>{t('tracking.logs.test.desc')}</DialogDescription>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="test-provider" className="text-xs">
                  {t('tracking.logs.test.provider')}
                </Label>
                <select
                  id="test-provider"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="meta">Meta (CAPI)</option>
                  <option value="ga4">Google Analytics 4 (MP)</option>
                  <option value="google_ads">Google Ads</option>
                </select>
              </div>

              <div>
                <Label htmlFor="test-event" className="text-xs">
                  {t('tracking.logs.test.event')}
                </Label>
                <select
                  id="test-event"
                  value={event}
                  onChange={(e) => setEvent(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="purchase">purchase</option>
                  <option value="add_to_cart">add_to_cart</option>
                  <option value="sign_up">sign_up</option>
                </select>
              </div>
            </div>

            {provider === 'meta' && (
              <div>
                <Label htmlFor="test-event-code" className="text-xs">
                  {t('tracking.logs.test.testCode')}
                </Label>
                <Input
                  id="test-event-code"
                  placeholder="e.g. TEST12345"
                  value={testEventCode}
                  onChange={(e) => setTestEventCode(e.target.value)}
                  className="mt-1"
                />
                <span className="text-[11px] text-muted-foreground block mt-0.5">
                  {t('tracking.logs.test.testCodeHelp')}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="test-order-no" className="text-xs">
                  {t('tracking.logs.test.orderNo')}
                </Label>
                <Input
                  id="test-order-no"
                  placeholder="TEST-ORD-001"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="test-value" className="text-xs">
                  {t('tracking.logs.test.value')} (SAR)
                </Label>
                <Input
                  id="test-value"
                  type="number"
                  min="1"
                  step="0.01"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* Result view */}
          {result && (
            <div
              className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                result.success
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-200'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-800 dark:text-rose-200'
              }`}
            >
              <div className="flex items-center gap-1.5 font-semibold">
                {result.success ? (
                  <CheckCircle2 className="size-4 text-emerald-600" />
                ) : (
                  <XCircle className="size-4 text-rose-600" />
                )}
                {result.success
                  ? t('tracking.notifications.testSuccess')
                  : t('tracking.notifications.testFailed')}
              </div>
              {result.log?.latencyMs && (
                <div className="text-[11px]">
                  Latency: <span className="font-mono">{result.log.latencyMs} ms</span>
                </div>
              )}
              {result.error && <div className="text-[11px]">{result.error}</div>}
              {result.result?.response && (
                <pre className="bg-background/80 p-2 rounded text-[11px] font-mono overflow-x-auto max-h-36 border border-border">
                  {JSON.stringify(result.result.response, null, 2)}
                </pre>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={dispatchTest.isPending} className="gap-1.5">
              {dispatchTest.isPending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  {t('tracking.logs.test.sending')}
                </>
              ) : (
                <>
                  <Send className="size-3.5" />
                  {t('tracking.logs.test.send')}
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
