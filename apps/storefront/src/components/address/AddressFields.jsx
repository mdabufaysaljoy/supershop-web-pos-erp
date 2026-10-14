'use client';

import { FormField, PlainTextInput } from '@supershop/ui';
import { useT } from '@/i18n/I18nProvider';

/** An empty Saudi address; the optional National Address parts stay blank until typed. */
export const EMPTY_ADDRESS = Object.freeze({
  city: '',
  line1: '',
  district: '',
  buildingNumber: '',
  postalCode: '',
  additionalNumber: '',
  shortAddress: '',
  landmark: '',
});

/** Only the keys the API accepts (a saved address carries nothing else back into a form). */
export const toAddressForm = (address) => ({
  ...EMPTY_ADDRESS,
  ...Object.fromEntries(
    Object.keys(EMPTY_ADDRESS).map((k) => [k, address?.[k] == null ? '' : String(address[k])]),
  ),
});

/**
 * The delivery-address block, shared by checkout and the account address book so both ask for the
 * same things in the same order (CLAUDE.md §3.5). Labels live in the `checkout` namespace.
 * @param {{ value: object, onChange: (patch: object) => void, error: (path: string) => string | undefined }} props
 *   `error` is called with the plain field name ('line1'); the caller adds any prefix.
 */
export function AddressFields({ value, onChange, error }) {
  const t = useT();
  return (
    <>
      <FormField label={t('checkout.addressLine')} error={error('line1')} required>
        <PlainTextInput
          autoComplete="street-address"
          maxLength={200}
          placeholder={t('checkout.addressLinePlaceholder')}
          value={value.line1}
          onChange={(e) => onChange({ line1: e.target.value })}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('checkout.city')} error={error('city')} required>
          <PlainTextInput
            autoComplete="address-level2"
            maxLength={60}
            value={value.city}
            onChange={(e) => onChange({ city: e.target.value })}
          />
        </FormField>
        <FormField label={t('checkout.district')} error={error('district')}>
          <PlainTextInput
            maxLength={80}
            value={value.district}
            onChange={(e) => onChange({ district: e.target.value })}
          />
        </FormField>
        <FormField label={t('checkout.postalCode')} error={error('postalCode')}>
          <PlainTextInput
            inputMode="numeric"
            dir="ltr"
            maxLength={5}
            autoComplete="postal-code"
            value={value.postalCode}
            onChange={(e) => onChange({ postalCode: e.target.value })}
          />
        </FormField>
        <FormField label={t('checkout.buildingNumber')} error={error('buildingNumber')}>
          <PlainTextInput
            inputMode="numeric"
            dir="ltr"
            maxLength={4}
            value={value.buildingNumber}
            onChange={(e) => onChange({ buildingNumber: e.target.value })}
          />
        </FormField>
        <FormField label={t('checkout.additionalNumber')} error={error('additionalNumber')}>
          <PlainTextInput
            inputMode="numeric"
            dir="ltr"
            maxLength={4}
            value={value.additionalNumber}
            onChange={(e) => onChange({ additionalNumber: e.target.value })}
          />
        </FormField>
        <FormField
          label={t('checkout.shortAddress')}
          description={t('checkout.shortAddressHint')}
          error={error('shortAddress')}
        >
          <PlainTextInput
            dir="ltr"
            maxLength={8}
            value={value.shortAddress}
            onChange={(e) => onChange({ shortAddress: e.target.value })}
          />
        </FormField>
      </div>
      <FormField label={t('checkout.landmark')} error={error('landmark')}>
        <PlainTextInput
          maxLength={200}
          placeholder={t('checkout.landmarkPlaceholder')}
          value={value.landmark}
          onChange={(e) => onChange({ landmark: e.target.value })}
        />
      </FormField>
    </>
  );
}
