import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

type Mode = 'login' | 'register';

interface Toast {
  id: number;
  message: string;
}

let toastId = 0;

export default function Login() {
  const { login, register, isLoading } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<Mode>('login');
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [tenantName, setTenantName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');

  function showError(message: string) {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword) {
      showError('Please fill in all fields.');
      return;
    }
    try {
      await login(loginEmail.trim(), loginPassword);
      navigate('/');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Login failed. Please check your credentials.';
      showError(msg);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantName.trim() || !ownerName.trim() || !regEmail.trim() || !regPassword) {
      showError('Please fill in all fields.');
      return;
    }
    if (regPassword !== regConfirm) {
      showError('Passwords do not match.');
      return;
    }
    if (regPassword.length < 8) {
      showError('Password must be at least 8 characters.');
      return;
    }
    try {
      await register(tenantName.trim(), ownerName.trim(), regEmail.trim(), regPassword);
      navigate('/');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Registration failed. Please try again.';
      showError(msg);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white flex flex-col items-center justify-center px-4 dark:from-gray-900 dark:to-gray-800">
      {/* Toast container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="bg-red-600 text-white text-sm rounded-lg px-4 py-3 shadow-lg max-w-xs animate-pulse"
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* Logo / Brand */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-600 mb-4 shadow-lg">
          <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-green-700 dark:text-green-400 tracking-tight">OrderFlow</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Restaurant management, simplified.</p>
      </div>

      {/* Card */}
      <div className="card w-full max-w-md p-8">
        {/* Mode toggle */}
        <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 mb-6">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              mode === 'login'
                ? 'bg-green-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              mode === 'register'
                ? 'bg-green-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            Register Tenant
          </button>
        </div>

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">Welcome back</h2>
            <div>
              <label className="label" htmlFor="login-email">Email address</label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="you@restaurant.com"
                className="input"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="input"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full mt-2"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Signing in…
                </span>
              ) : (
                'Sign In'
              )}
            </button>
            <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-2">
              Don't have an account?{' '}
              <button type="button" onClick={() => setMode('register')} className="text-green-600 hover:underline font-medium">
                Register your restaurant
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">Create your restaurant</h2>
            <div>
              <label className="label" htmlFor="reg-tenant">Restaurant name</label>
              <input
                id="reg-tenant"
                type="text"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                placeholder="Spice Garden"
                className="input"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="reg-owner">Your name</label>
              <input
                id="reg-owner"
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Rahul Sharma"
                className="input"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="reg-email">Email address</label>
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                placeholder="rahul@spicegarden.com"
                className="input"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="reg-password">Password</label>
              <input
                id="reg-password"
                type="password"
                autoComplete="new-password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                placeholder="Min 8 characters"
                className="input"
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="reg-confirm">Confirm password</label>
              <input
                id="reg-confirm"
                type="password"
                autoComplete="new-password"
                value={regConfirm}
                onChange={(e) => setRegConfirm(e.target.value)}
                placeholder="••••••••"
                className="input"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full mt-2"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Creating account…
                </span>
              ) : (
                'Create Restaurant Account'
              )}
            </button>
            <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-2">
              Already registered?{' '}
              <button type="button" onClick={() => setMode('login')} className="text-green-600 hover:underline font-medium">
                Sign in
              </button>
            </p>
          </form>
        )}
      </div>

      <p className="mt-6 text-xs text-gray-400 dark:text-gray-600">
        &copy; {new Date().getFullYear()} OrderFlow. All rights reserved.
      </p>
    </div>
  );
}
