import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RoleToggle } from './RoleToggle.jsx';

describe('RoleToggle', () => {
  it('renders both modes and marks the active one', () => {
    render(<RoleToggle mode="customer" onSwitch={vi.fn()} />);

    const owner = screen.getByRole('button', { name: /dog owner/i });
    const groomer = screen.getByRole('button', { name: /groomer/i });
    expect(owner).toHaveAttribute('aria-pressed', 'true');
    expect(groomer).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches to the inactive mode when clicked', () => {
    const onSwitch = vi.fn();
    render(<RoleToggle mode="customer" onSwitch={onSwitch} />);

    fireEvent.click(screen.getByRole('button', { name: /groomer/i }));
    expect(onSwitch).toHaveBeenCalledWith('groomer');
  });

  it('does nothing when the active mode is clicked', () => {
    const onSwitch = vi.fn();
    render(<RoleToggle mode="groomer" onSwitch={onSwitch} />);

    fireEvent.click(screen.getByRole('button', { name: /groomer/i }));
    expect(onSwitch).not.toHaveBeenCalled();
  });
});
