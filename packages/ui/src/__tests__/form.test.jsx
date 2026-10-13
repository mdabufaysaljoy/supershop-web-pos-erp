import { zodResolver } from '@hookform/resolvers/zod';
import { validators } from '@supershop/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { EmailInput, FormField, MoneyInput, NameInput, PhoneInput, QtyInput } from '../index.js';

// The SAME shared schemas the API validates with.
const schema = z.object({
  name: validators.name,
  email: validators.email,
  phone: validators.phone(),
  price: validators.moneyInput({ allowZero: false }),
  qty: validators.quantity({ max: 10 }),
});

// Tests render raw i18n keys; apps translate them with t().
function CheckoutLikeForm({ onSubmit }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', phone: '', price: '', qty: '1' },
  });
  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormField label="Name" error={errors.name?.message}>
        <NameInput {...register('name')} />
      </FormField>
      <FormField label="Email" error={errors.email?.message}>
        <EmailInput {...register('email')} />
      </FormField>
      <FormField label="Phone" error={errors.phone?.message}>
        <PhoneInput {...register('phone')} />
      </FormField>
      <FormField label="Price" error={errors.price?.message}>
        <MoneyInput currency="SAR" {...register('price')} />
      </FormField>
      <FormField label="Qty" error={errors.qty?.message}>
        <QtyInput
          stepper
          incrementLabel="Increase"
          decrementLabel="Decrease"
          {...register('qty')}
        />
      </FormField>
      <button type="submit">Submit</button>
    </form>
  );
}

describe('react-hook-form + shared schemas', () => {
  it('submits normalized values: E.164 phone, money in halalas, integer qty', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CheckoutLikeForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Name'), '  محمد  العتيبي ');
    await user.type(screen.getByLabelText('Email'), 'Mohammed@Example.com');
    await user.type(screen.getByLabelText('Phone'), '٠٥١٢٣٤٥٦٧٨');
    await user.type(screen.getByLabelText('Price'), '19.99');
    await user.click(screen.getByRole('button', { name: 'Increase' })); // stepper → RHF sees 2
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual({
      name: 'محمد العتيبي',
      email: 'mohammed@example.com',
      phone: '+966512345678',
      price: 1999,
      qty: 2,
    });
  });

  it('shows field errors (i18n keys) and marks controls invalid', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CheckoutLikeForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Phone'), '0412');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Phone')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Phone')).toHaveAccessibleDescription('validation.phone.ksaOnly');
    expect(screen.getByLabelText('Price')).toHaveAccessibleDescription('validation.money.invalid');
  });
});
