import React, { useState } from 'react';
import { authService } from '../services/auth.service';
import { isSupabaseConfigured } from '../services/supabase';
import type { User } from '../types';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
  initError?: string;
}

const inputClass = 'h-10 w-full rounded-[5px] border border-[#c7d5e6] bg-white px-3 outline-none focus:border-[#4c83bf] focus:ring-2 focus:ring-[#4c83bf]/20';

/**
 * Everyone logs in with their mobile number only (added by the organization;
 * there is no sign-up). The Manager's number opens the Manager board.
 */
const Login: React.FC<LoginProps> = ({ onLoginSuccess, initError }) => {
  const [mobile, setMobile] = useState('');
  const [error, setError] = useState(initError || '');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!isSupabaseConfigured()) {
      setError('The sign-in service is not configured.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await authService.loginWithMobile(mobile.trim());
      if (!result.user) {
        setError(result.error || 'Could not log in. Please try again.');
        return;
      }
      onLoginSuccess(result.user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not log in. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="account-entry flex min-h-screen flex-col items-center justify-center bg-white px-5 py-10 text-[#172945]">
      <img src="/img/voxel1-logo.png" alt="VOXEL1" width={182} height={50} className="mb-6 h-[50px] w-auto" />
      <div className="w-full max-w-[456px] rounded-md border border-[#ccd8e8] bg-white px-6 py-6 sm:px-6 sm:py-7">
        <h1 className="mb-4 text-center text-[36px] font-bold leading-tight tracking-tight">Log In</h1>

        <form onSubmit={handleLogin} className="space-y-4" autoComplete="on">
          <div>
            <label htmlFor="login-mobile" className="mb-1 block text-sm font-semibold">Mobile Number</label>
            <input
              id="login-mobile"
              name="mobile"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              placeholder="e.g. 98765 43210"
              value={mobile}
              onChange={event => { setMobile(event.target.value); setError(''); }}
              className={inputClass}
            />
          </div>

          {error && (
            <div role="alert" className="rounded-[5px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button type="submit" disabled={isLoading} className="mt-1 h-[46px] w-full rounded-[5px] bg-[#4c83bf] text-sm font-semibold text-white transition-colors hover:bg-[#3a70ad] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4c83bf] disabled:opacity-60">
            {isLoading ? 'Logging In…' : 'Log In'}
          </button>
        </form>
      </div>
    </main>
  );
};

export default Login;
