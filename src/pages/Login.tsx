import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { hrService } from '../services/hrService';
import { authService } from '../services/auth.service';
import { isSupabaseConfigured } from '../services/supabase';
import type { User } from '../types';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
  initError?: string;
}

type Portal = 'employee' | 'manager';

const inputClass = 'h-10 w-full rounded-[5px] border border-[#c7d5e6] bg-white px-3 outline-none focus:border-[#4c83bf] focus:ring-2 focus:ring-[#4c83bf]/20';

/**
 * Employees log in with their mobile number only (added by the organization;
 * there is no sign-up). Managers and Admins log in with email + password.
 */
const Login: React.FC<LoginProps> = ({ onLoginSuccess, initError }) => {
  const [portal, setPortal] = useState<Portal>('employee');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(initError || '');
  const [isLoading, setIsLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStatus, setForgotStatus] = useState<'idle' | 'loading' | 'sent'>('idle');

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!isSupabaseConfigured()) {
      setError('The sign-in service is not configured.');
      return;
    }

    setIsLoading(true);
    try {
      const result = portal === 'employee'
        ? await authService.loginWithMobile(mobile.trim())
        : await hrService.login(email.trim(), password);
      if (!result.user) {
        const message = result.error || 'Could not log in. Please try again.';
        setError(portal === 'manager' && /email not confirmed|not verified|verify your email/i.test(message)
          ? 'This manager account needs activation. Please contact support.'
          : message);
        return;
      }

      if (portal === 'manager' && result.user.role === 'EMPLOYEE') {
        await authService.logout();
        setError('Employees log in with their mobile number. Choose "Employee" above.');
        return;
      }

      onLoginSuccess(result.user);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not log in. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setForgotStatus('loading');
    try {
      const result = await authService.requestPasswordReset(forgotEmail.trim());
      if (result.ok) {
        setForgotStatus('sent');
      } else {
        setError(result.error || 'Could not send the reset link. Please try again.');
        setForgotStatus('idle');
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send the reset link. Please try again.');
      setForgotStatus('idle');
    }
  };

  const openForgotPassword = () => {
    setForgotEmail(email);
    setForgotStatus('idle');
    setError('');
    setShowForgot(true);
  };

  return (
    <main className="account-entry flex min-h-screen flex-col items-center justify-center bg-white px-5 py-10 text-[#172945]">
      <img src="/img/voxel1-logo.png" alt="VOXEL1" width={182} height={50} className="mb-6 h-[50px] w-auto" />
      <div className="w-full max-w-[456px] rounded-md border border-[#ccd8e8] bg-white px-6 py-6 sm:px-6 sm:py-7">
        <h1 className="mb-4 text-center text-[36px] font-bold leading-tight tracking-tight">
          {showForgot ? 'Reset Password' : 'Log In'}
        </h1>

        {showForgot ? (
          forgotStatus === 'sent' ? (
            <div className="space-y-5 text-center">
              <p role="status" className="text-sm leading-relaxed">If an account exists for that email, a password reset link is on its way.</p>
              <button type="button" onClick={() => setShowForgot(false)} className="h-[46px] w-full rounded-[5px] bg-[#4c83bf] font-semibold text-white hover:bg-[#3a70ad]">Back to Log In</button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label htmlFor="forgot-email" className="mb-1 block text-sm font-semibold">Email</label>
                <input id="forgot-email" type="email" autoComplete="email" required value={forgotEmail} onChange={event => setForgotEmail(event.target.value)} className={inputClass} />
              </div>
              {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
              <button type="submit" disabled={forgotStatus === 'loading'} className="h-[46px] w-full rounded-[5px] bg-[#4c83bf] font-semibold text-white hover:bg-[#3a70ad] disabled:opacity-60">{forgotStatus === 'loading' ? 'Sending…' : 'Send Reset Link'}</button>
              <button type="button" onClick={() => { setShowForgot(false); setError(''); }} className="w-full text-center text-sm font-medium text-[#3979b9] hover:underline">Back to Log In</button>
            </form>
          )
        ) : (
          <form onSubmit={handleLogin} className="space-y-4" autoComplete="on">
            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold">I am a</legend>
              <div className="grid grid-cols-2 overflow-hidden rounded-[5px] border border-[#c7d5e6]" aria-label="Portal type">
                {(['employee', 'manager'] as const).map(option => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={portal === option}
                    onClick={() => { setPortal(option); setError(''); }}
                    className={`h-10 text-sm font-semibold transition-colors ${portal === option ? 'bg-[#4c83bf] text-white' : 'bg-white text-[#172945] hover:bg-[#f2f7fc]'}`}
                  >
                    {option === 'employee' ? 'Employee' : 'Manager'}
                  </button>
                ))}
              </div>
            </fieldset>

            {portal === 'employee' ? (
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
            ) : (
              <>
                <div>
                  <label htmlFor="login-email" className="mb-1 block text-sm font-semibold">Email</label>
                  <input id="login-email" name="email" type="email" autoComplete="username" required value={email} onChange={event => { setEmail(event.target.value); setError(''); }} className={inputClass} />
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label htmlFor="login-password" className="text-sm font-semibold">Password</label>
                    <button type="button" onClick={openForgotPassword} className="text-xs font-medium text-[#3979b9] hover:underline">Forgot password?</button>
                  </div>
                  <div className="relative">
                    <input id="login-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={event => { setPassword(event.target.value); setError(''); }} className={`${inputClass} pr-11`} />
                    <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#60748d] hover:text-[#3979b9]">
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {error && (
              <div role="alert" className="rounded-[5px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <button type="submit" disabled={isLoading} className="mt-1 h-[46px] w-full rounded-[5px] bg-[#4c83bf] text-sm font-semibold text-white transition-colors hover:bg-[#3a70ad] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4c83bf] disabled:opacity-60">
              {isLoading ? 'Logging In…' : 'Log In'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
};

export default Login;
