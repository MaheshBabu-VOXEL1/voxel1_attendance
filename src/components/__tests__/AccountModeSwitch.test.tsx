import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AccountModeSwitch from '../AccountModeSwitch';
import { User } from '../../types';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), login: vi.fn(), setAuthRole: vi.fn() }));
vi.mock('../../services/supabase', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('../../services/api.client', () => ({ apiClient: { setAuthRole: mocks.setAuthRole } }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ login: mocks.login }) }));
const user = { id: 'employee-1', name: 'Employee', role: 'EMPLOYEE' } as User;

describe('account mode switch', () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it('hides the switch when the server denies eligibility', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    render(<AccountModeSwitch user={user} />);
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('can_switch_account_mode'));
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
  it('fails closed when eligibility cannot be loaded', async () => {
    mocks.rpc.mockRejectedValue(new Error('Offline'));
    render(<AccountModeSwitch user={user} />);
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalled());
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
  it.each(['EMPLOYEE', 'MANAGER'] as const)('switches from %s only after server confirmation', async role => {
    const target = role === 'EMPLOYEE' ? 'MANAGER' : 'EMPLOYEE';
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: target, error: null });
    render(<AccountModeSwitch user={{ ...user, role }} />);
    const control = await screen.findByRole('switch', { name: 'Manager account' });
    expect(control).toHaveAttribute('aria-checked', String(role === 'MANAGER'));
    fireEvent.click(control);
    await waitFor(() => expect(mocks.login).toHaveBeenCalledWith({ ...user, role: target }));
    expect(mocks.rpc).toHaveBeenLastCalledWith('switch_account_mode', { p_role: target });
    expect(mocks.setAuthRole).toHaveBeenCalledWith(target);
  });
  it('keeps the current mode and shows a retryable error when switching fails', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: null, error: new Error('Access denied') });
    render(<AccountModeSwitch user={user} />);
    fireEvent.click(await screen.findByRole('switch'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Access denied');
    expect(mocks.login).not.toHaveBeenCalled();
    expect(screen.getByRole('switch')).toBeEnabled();
  });
});
