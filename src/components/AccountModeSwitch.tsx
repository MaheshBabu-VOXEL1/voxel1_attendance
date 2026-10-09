import { useEffect, useState } from 'react';
import { User } from '../types';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import { apiClient } from '../services/api.client';
import './AccountModeSwitch.css';

/** Eligibility and role changes are checked against the signed-in database profile. */
export default function AccountModeSwitch({ user }: { user: User }) {
  const { login } = useAuth();
  const [eligible, setEligible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setEligible(false);
    void Promise.resolve(supabase.rpc('can_switch_account_mode')).then(({ data, error }) => {
      if (active) setEligible(!error && data === true);
    }).catch(() => { if (active) setEligible(false); });
    return () => { active = false; };
  }, [user.id]);

  if (!eligible || !['EMPLOYEE', 'MANAGER'].includes(user.role)) return null;
  const manager = user.role === 'MANAGER';
  const switchMode = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { data, error } = await supabase.rpc('switch_account_mode', {
        p_role: manager ? 'EMPLOYEE' : 'MANAGER',
      });
      if (error) throw error;
      if (data !== 'EMPLOYEE' && data !== 'MANAGER') throw new Error('Could not switch account. Please try again.');
      apiClient.setAuthRole(data);
      login({ ...user, role: data });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not switch account. Please try again.');
    } finally { setBusy(false); }
  };
  return <div className="account-mode">
    <button type="button" role="switch" aria-checked={manager} aria-label="Manager account"
      title={`Switch to ${manager ? 'employee' : 'manager'} account`} disabled={busy}
      onClick={() => void switchMode()} className="account-mode-button">
      <i aria-hidden="true" className="account-mode-track"><i /></i>
      {busy ? 'Switching…' : manager ? 'Manager' : 'Employee'}
    </button>
    {error && <div className="account-mode-error" role="alert">{error}</div>}
  </div>;
}
