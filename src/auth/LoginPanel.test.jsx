import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LoginPanel } from './LoginPanel.jsx';

const sendMagicLink = vi.fn();
const signInWithPassword = vi.fn();

vi.mock('./AuthProvider.jsx', () => ({
  useAuth: () => ({
    authError: '',
    authMessage: '',
    isConfigured: true,
    sendMagicLink,
    signInWithPassword,
  }),
}));

describe('LoginPanel', () => {
  afterEach(() => {
    sendMagicLink.mockReset();
    signInWithPassword.mockReset();
  });

  it('keeps magic link sign-in as the default', async () => {
    sendMagicLink.mockResolvedValueOnce(undefined);

    render(<LoginPanel />);

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'owner@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }));

    await waitFor(() => {
      expect(sendMagicLink).toHaveBeenCalledWith('owner@example.com');
    });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('can switch to password sign-in for users who added a password', async () => {
    signInWithPassword.mockResolvedValueOnce(undefined);

    render(<LoginPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Use password instead' }));
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'owner@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'correct-horse-battery-staple' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with password' }));

    await waitFor(() => {
      expect(signInWithPassword).toHaveBeenCalledWith(
        'owner@example.com',
        'correct-horse-battery-staple',
      );
    });
    expect(sendMagicLink).not.toHaveBeenCalled();
  });
});
