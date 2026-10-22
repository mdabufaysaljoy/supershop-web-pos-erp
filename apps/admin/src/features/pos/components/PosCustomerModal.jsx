import { validators } from '@supershop/shared';
import { NameInput, PhoneInput } from '@supershop/ui';
import { Check, CreditCard, Search, UserCheck, UserPlus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { customers } from '@/features/customers/resource';
import { usePublicSettings } from '@/features/settings/hooks';
import { lookupLoyalty } from '../resource';

/**
 * Customer Selection and Creation Modal for POS:
 * 1. Search existing customers by phone number or name with live suggestions list.
 * 2. Suggests matching customers with name, phone, loyalty points, and order history.
 * 3. Add new customer with Name and Phone fields (accessible and auto-attached).
 * 4. Switch to walk-in customer anytime.
 */
export function PosCustomerModal({ open, onOpenChange, customer, onCustomerChange }) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [loyaltyMatch, setLoyaltyMatch] = useState(null);

  // Live search existing customers by name or number
  const trimmedQ = searchQuery.trim();
  const { data: searchResults, isFetching } = customers.useList({
    q: trimmedQ,
    limit: 6,
  });

  useEffect(() => {
    let cancelled = false;
    if (trimmedQ.length < 2) return undefined;
    lookupLoyalty(trimmedQ)
      .then((res) => {
        if (!cancelled) setLoyaltyMatch(res?.customer ? res : null);
      })
      .catch(() => {
        if (!cancelled) setLoyaltyMatch(null);
      });
    return () => {
      cancelled = true;
    };
  }, [trimmedQ]);

  const activeLoyaltyMatch = trimmedQ.length >= 2 ? loyaltyMatch : null;

  const customerList = useMemo(() => {
    const raw = searchResults?.data ?? (Array.isArray(searchResults) ? searchResults : []);
    return raw.filter((c) => c && c.name);
  }, [searchResults]);

  const isContact = customer?.mode === 'contact';
  const nameValue = customer?.name && !/walk-?in/i.test(customer.name) ? customer.name : '';
  const phoneValue = customer?.phone ?? '';

  /**
   * The same rule the sale is validated by: a number the till accepts here but the API refuses
   * means the cashier only finds out when the sale will not go through (D-212). The shop decides
   * whether a number from outside the Kingdom is allowed.
   */
  const publicSettings = usePublicSettings();
  const allowInternational = Boolean(publicSettings.data?.['customers.allowInternationalPhone']);
  const phoneError =
    phoneValue.trim() && !validators.normalizePhone(phoneValue, { allowInternational })
      ? allowInternational
        ? t('validation.phone.invalid', 'Enter a valid phone number.')
        : t('validation.phone.ksaOnly', 'Enter a Saudi mobile number (05XXXXXXXX).')
      : '';
  const canAttach = Boolean(nameValue.trim() || phoneValue.trim()) && !phoneError;

  const handleSelectCustomer = (c) => {
    onCustomerChange({
      mode: 'contact',
      name: c.name,
      phone: c.phone || '',
      email: c.email || null,
      customerId: c.id || c._id,
    });
    onOpenChange(false);
  };

  const handleMakeWalkIn = () => {
    onCustomerChange({ mode: 'walkin' });
    onOpenChange(false);
  };

  const handleSearchChange = (val) => {
    setSearchQuery(val);
    // If cashier types a name or phone in the search box, offer auto-filling name or phone
    const isDigits = /^[\d\s+-]+$/.test(val.trim());
    if (val.trim()) {
      if (isDigits) {
        onCustomerChange({
          mode: 'contact',
          name: nameValue,
          phone: val.trim(),
        });
      } else {
        onCustomerChange({
          mode: 'contact',
          name: val.trim(),
          phone: phoneValue,
        });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent
        className="max-w-lg p-0 overflow-hidden rounded border-slate-200 shadow-2xl bg-white"
        closeLabel={t('common.close', 'Close')}
      >
        <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded bg-primary/10 text-primary">
                <UserCheck className="size-4" />
              </div>
              <div>
                <DialogTitle className="text-sm font-bold text-slate-900">
                  {t('pos.customer.title', 'Customer')}
                </DialogTitle>
                <p className="text-[11px] text-slate-500">
                  {isContact && nameValue
                    ? `Attached: ${nameValue} (${phoneValue || 'No phone'})`
                    : 'Walk-in customer (counter sale)'}
                </p>
              </div>
            </div>
            {isContact && (
              <button
                type="button"
                onClick={handleMakeWalkIn}
                className="text-xs font-semibold text-slate-500 hover:text-destructive underline"
              >
                {t('pos.customer.makeWalkin', 'Make it a walk-in')}
              </button>
            )}
          </div>
        </div>

        <div className="p-5 flex flex-col gap-4 max-h-[75vh] overflow-y-auto">
          {/* Section 1: Search by phone number or name with suggestions */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="customer-search"
              className="text-xs font-bold text-slate-700 flex items-center justify-between"
            >
              <span>Find Existing Customer</span>
              <span className="text-[10px] font-normal text-slate-400">
                Search by name or number
              </span>
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-slate-400">
                <Search className="size-4" />
              </div>
              <input
                id="customer-search"
                type="text"
                value={searchQuery}
                placeholder="Search by phone number or name..."
                className="h-9 w-full rounded border border-slate-200 bg-white ps-9 pe-8 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all shadow-2xs"
                onChange={(e) => handleSearchChange(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 end-0 flex items-center pe-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            {/* Suggestions list according to search */}
            {searchQuery && (
              <div className="rounded border border-slate-200 bg-slate-50/70 p-2 flex flex-col gap-1.5 max-h-48 overflow-y-auto shadow-xs">
                {activeLoyaltyMatch?.customer && (
                  <button
                    type="button"
                    onClick={() =>
                      handleSelectCustomer({
                        name: activeLoyaltyMatch.customer.name,
                        phone: activeLoyaltyMatch.customer.phone,
                        email: activeLoyaltyMatch.customer.email,
                        id: activeLoyaltyMatch.customer.id,
                      })
                    }
                    className="flex items-center justify-between rounded border-2 border-primary/50 bg-primary/10 p-2 text-start hover:bg-primary/15 transition-all"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded bg-primary text-white font-bold">
                        <CreditCard className="size-4" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {activeLoyaltyMatch.customer.name}
                          </span>
                          <span className="rounded bg-primary/20 px-1 py-0.2 text-[9px] font-mono font-bold text-primary">
                            {activeLoyaltyMatch.cardNumber}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-600">
                          {activeLoyaltyMatch.customer.phone && (
                            <span>{activeLoyaltyMatch.customer.phone}</span>
                          )}
                          <span className="text-amber-700 font-semibold capitalize">
                            ★ {activeLoyaltyMatch.tier}
                          </span>
                          <span className="font-semibold text-primary">
                            {activeLoyaltyMatch.pointsBalance} pts
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="rounded bg-primary px-2 py-0.5 text-[10px] font-bold text-white shadow-2xs">
                      Attach Card
                    </span>
                  </button>
                )}
                {isFetching && !activeLoyaltyMatch ? (
                  <div className="py-3 text-center text-xs text-slate-400">
                    Searching customer database...
                  </div>
                ) : customerList.length === 0 && !activeLoyaltyMatch ? (
                  <div className="py-3 text-center text-xs text-slate-400">
                    No existing customer found. Fill details below to add as new customer.
                  </div>
                ) : (
                  customerList.map((c) => (
                    <button
                      key={c.id || c._id}
                      type="button"
                      onClick={() => handleSelectCustomer(c)}
                      className="group flex items-center justify-between rounded border border-slate-100 bg-white p-2 text-start hover:border-primary hover:bg-primary/5 transition-all"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex size-7 shrink-0 items-center justify-center rounded bg-slate-100 text-xs font-bold text-slate-700 group-hover:bg-primary group-hover:text-white transition-colors">
                          {c.name ? c.name.slice(0, 2).toUpperCase() : 'CU'}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {c.name}
                          </span>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500">
                            {c.phone && <span>{c.phone}</span>}
                            {c.loyaltyTier && (
                              <span className="text-amber-600 font-semibold capitalize">
                                ★ {c.loyaltyTier}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-primary group-hover:bg-primary group-hover:text-white transition-all">
                        Attach
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="border-b border-dashed border-slate-200" />

          {/* Section 2: Add / Edit Customer Details */}
          <div className="flex flex-col gap-2.5">
            <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <UserPlus className="size-3.5 text-primary" />
              <span>Customer Information (New or Walk-in Contact)</span>
            </h3>

            <div className="grid grid-cols-2 gap-2.5">
              <label className="grid gap-1 text-[11px] font-semibold text-slate-600">
                {t('pos.customer.name', 'Name')}
                <NameInput
                  value={nameValue}
                  placeholder="Full Name"
                  aria-label={t('pos.customer.name', 'Name')}
                  className="h-9 rounded text-xs"
                  onChange={(e) =>
                    onCustomerChange({
                      mode: 'contact',
                      name: e.target.value,
                      phone: phoneValue,
                    })
                  }
                />
              </label>

              <label className="grid gap-1 text-[11px] font-semibold text-slate-600">
                {t('pos.customer.phone', 'Phone')}
                <PhoneInput
                  value={phoneValue}
                  placeholder={allowInternational ? '+966 5X XXX XXXX' : '05XXXXXXXX'}
                  aria-label={t('pos.customer.phone', 'Phone')}
                  aria-invalid={Boolean(phoneError) || undefined}
                  aria-describedby={phoneError ? 'pos-customer-phone-error' : undefined}
                  className={`h-9 rounded text-xs ${phoneError ? 'border-destructive' : ''}`}
                  onChange={(e) =>
                    onCustomerChange({
                      mode: 'contact',
                      name: nameValue,
                      phone: e.target.value,
                    })
                  }
                />
                {phoneError && (
                  <span
                    id="pos-customer-phone-error"
                    role="alert"
                    className="text-[11px] font-medium text-destructive"
                  >
                    {phoneError}
                  </span>
                )}
              </label>
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleMakeWalkIn}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800"
          >
            {t('pos.customer.makeWalkin', 'Make it a walk-in')}
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs font-semibold rounded"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={Boolean(phoneError)}
              onClick={() => {
                if (canAttach) {
                  onCustomerChange({
                    mode: 'contact',
                    name: nameValue.trim() || 'Contact Customer',
                    phone: phoneValue.trim(),
                  });
                }
                onOpenChange(false);
              }}
              className="rounded bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold px-4 shadow-sm"
            >
              <Check className="size-3.5 me-1" />
              <span>{nameValue || phoneValue ? 'Attach to Sale' : 'Done'}</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
