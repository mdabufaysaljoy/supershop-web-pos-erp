import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  CodeInput,
  EmailInput,
  FormField,
  MoneyInput,
  NameInput,
  PasswordInput,
  PhoneInput,
  PlainTextArea,
  QtyInput,
  SlugInput,
} from '../index.js';

const setup = (ui) => {
  render(ui);
  return { input: screen.getByRole('textbox'), user: userEvent.setup() };
};

describe('keystroke filtering', () => {
  it('SlugInput keeps a-z, 0-9 and single hyphens', async () => {
    const { input, user } = setup(<SlugInput aria-label="slug" />);
    await user.type(input, 'Summer Sale--2026!');
    expect(input).toHaveValue('summersale-2026');
  });

  it('PlainTextArea renders a textarea that keeps newlines and drops markup', async () => {
    const { input, user } = setup(<PlainTextArea aria-label="description" />);
    expect(input.tagName).toBe('TEXTAREA');
    await user.type(input, 'Line <b>one</b>{Enter}two');
    expect(input).toHaveValue('Line bone/b\ntwo');
  });

  it('NameInput blocks digits and symbols, keeps Arabic and Latin letters', async () => {
    const { input, user } = setup(<NameInput aria-label="name" />);
    await user.type(input, "Jo3hn O'Neil-Smith! محمد٣");
    expect(input).toHaveValue("John O'Neil-Smith محمد");
  });

  it('EmailInput lower-cases and drops spaces as you type', async () => {
    const { input, user } = setup(<EmailInput aria-label="email" />);
    await user.type(input, 'John Doe@Example.COM');
    expect(input).toHaveValue('johndoe@example.com');
  });

  it('PhoneInput accepts digits/leading + only, converts Arabic digits, cleans paste', async () => {
    const { input, user } = setup(<PhoneInput aria-label="phone" />);
    await user.type(input, '+966 5a1-2٣');
    expect(input).toHaveValue('+966512٣'.replace('٣', '3'));
    await user.clear(input);
    await user.click(input);
    await user.paste('(050) 123-4567 ext');
    expect(input).toHaveValue('0501234567');
  });

  it('MoneyInput allows one dot and at most 2 decimals; ".5" becomes "0.5"', async () => {
    const { input, user } = setup(<MoneyInput aria-label="price" />);
    await user.type(input, '1a2.3.456');
    expect(input).toHaveValue('12.34');
    await user.clear(input);
    await user.type(input, '.5');
    expect(input).toHaveValue('0.5');
    await user.clear(input);
    await user.type(input, '١٩٫٩٩');
    expect(input).toHaveValue('19.99');
  });

  it('QtyInput: digits only, length bounded by max', async () => {
    const { input, user } = setup(<QtyInput aria-label="qty" max={500} />);
    await user.type(input, '1-2.5e9');
    expect(input).toHaveValue('125');
  });

  it('CodeInput upper-cases and restricts to A–Z 0–9 - _ .', async () => {
    const { input, user } = setup(<CodeInput aria-label="sku" />);
    await user.type(input, 'tsh blk/m.01');
    expect(input).toHaveValue('TSHBLKM.01');
  });
});

describe('keyboard & autofill hints', () => {
  it.each([
    [EmailInput, { type: 'email', inputmode: 'email', autocomplete: 'email', dir: 'ltr' }],
    [PhoneInput, { type: 'tel', inputmode: 'tel', autocomplete: 'tel', dir: 'ltr' }],
    [NameInput, { type: 'text', autocomplete: 'name', dir: 'auto', maxlength: '60' }],
    [MoneyInput, { inputmode: 'decimal', dir: 'ltr' }],
    [QtyInput, { inputmode: 'numeric', dir: 'ltr' }],
  ])('%o', (Comp, attrs) => {
    render(<Comp aria-label="f" />);
    const el = screen.getByLabelText('f');
    for (const [k, v] of Object.entries(attrs)) expect(el).toHaveAttribute(k, v);
  });

  it('caller props override defaults (e.g. new-password, placeholder)', () => {
    render(
      <PasswordInput
        aria-label="pw"
        autoComplete="new-password"
        showLabel="Show"
        hideLabel="Hide"
      />,
    );
    expect(screen.getByLabelText('pw')).toHaveAttribute('autocomplete', 'new-password');
  });
});

describe('PasswordInput', () => {
  it('toggles visibility with an accessible pressed state', async () => {
    const user = userEvent.setup();
    render(<PasswordInput aria-label="pw" showLabel="Show password" hideLabel="Hide password" />);
    const input = screen.getByLabelText('pw');
    expect(input).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('QtyInput stepper', () => {
  it('steps within [min, max] and fires onChange', async () => {
    const user = userEvent.setup();
    const changes = [];
    render(
      <QtyInput
        aria-label="qty"
        stepper
        min={1}
        max={3}
        defaultValue="2"
        decrementLabel="Decrease"
        incrementLabel="Increase"
        onChange={(e) => changes.push(e.target.value)}
      />,
    );
    const inc = screen.getByRole('button', { name: 'Increase' });
    await user.click(inc);
    await user.click(inc); // clamped at 3
    expect(screen.getByLabelText('qty')).toHaveValue('3');
    await user.click(screen.getByRole('button', { name: 'Decrease' }));
    expect(screen.getByLabelText('qty')).toHaveValue('2');
    expect(changes).toEqual(['3', '2']); // clicking + at max changes nothing → no change event
  });
});

describe('FormField', () => {
  it('wires label, description and error to the control', () => {
    render(
      <FormField
        label="Phone"
        description="Saudi mobile"
        error="Enter a Saudi mobile number."
        required
      >
        <PhoneInput />
      </FormField>,
    );
    const input = screen.getByLabelText(/Phone/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toHaveAccessibleDescription('Saudi mobile Enter a Saudi mobile number.');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a Saudi mobile number.');
  });

  it('no error → not invalid, no alert', () => {
    render(
      <FormField label="Name">
        <NameInput />
      </FormField>,
    );
    expect(screen.getByLabelText('Name')).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
