import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { HelpDrawer } from '../HelpDrawer';

describe('HelpDrawer', () => {
  const renderDrawer = () => {
    return render(
      <MemoryRouter>
        <HelpDrawer />
      </MemoryRouter>,
    );
  };

  it('renders trigger button and opens help drawer on click', async () => {
    const user = userEvent.setup();
    renderDrawer();

    const trigger = screen.getByRole('button', { name: /help & documentation/i });
    expect(trigger).toBeInTheDocument();

    await user.click(trigger);

    expect(screen.getByRole('heading', { name: /help & guidance/i })).toBeInTheDocument();
    expect(screen.getByText(/quick reference guides, pos keyboard shortcuts/i)).toBeInTheDocument();
  });

  it('displays keyboard shortcuts cheatsheet table', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole('button', { name: /help & documentation/i }));

    expect(screen.getByText('F2')).toBeInTheDocument();
    expect(screen.getByText('F4')).toBeInTheDocument();
    expect(screen.getByText(/focus barcode and search input/i)).toBeInTheDocument();
    expect(screen.getByText(/jump to payment tender input/i)).toBeInTheDocument();
  });

  it('filters topics and shortcuts when typing in search input', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole('button', { name: /help & documentation/i }));

    const searchInput = screen.getByPlaceholderText(/search help topics/i);
    await user.type(searchInput, 'discrepancy');

    expect(screen.getByText(/cashier shifts & cash management/i)).toBeInTheDocument();
    expect(screen.queryByText(/barcode standards & symbology/i)).not.toBeInTheDocument();

    // Clear search
    const clearBtn = screen.getByRole('button', { name: /clear search/i });
    await user.click(clearBtn);

    expect(screen.getByText(/barcode standards & symbology/i)).toBeInTheDocument();
  });

  it('filters topics by badge button click', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole('button', { name: /help & documentation/i }));

    const shiftsFilterBtn = screen.getByRole('button', { name: /^shifts$/i });
    await user.click(shiftsFilterBtn);

    expect(screen.getByText(/cashier shifts & cash management/i)).toBeInTheDocument();
    expect(screen.queryByText(/universal background exports/i)).not.toBeInTheDocument();
  });

  it('displays empty state when search finds no match', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole('button', { name: /help & documentation/i }));

    const searchInput = screen.getByPlaceholderText(/search help topics/i);
    await user.type(searchInput, 'nonexistentphrase123xyz');

    expect(screen.getByText(/no help topics match your search query/i)).toBeInTheDocument();
  });
});
