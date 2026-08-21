import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Loader2, Lock } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { api } from '@/lib/api';

export default function ResetPassword() {
  const [params] = useSearchParams(); const token = params.get('token');
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault(); setError('');
    if (password !== confirm) return setError('Passwords do not match.');
    if (password.length < 10) return setError('Use at least 10 characters.');
    setLoading(true);
    try { await api.auth.resetPassword(token, password); window.location.assign('/login?reset=success'); }
    catch (caught) { setError(caught.message || 'Could not reset the password.'); }
    finally { setLoading(false); }
  };
  if (!token) return <AuthLayout icon={AlertTriangle} title="Invalid reset link" subtitle="This password reset link is incomplete" footer={<Link to="/forgot-password">Request a new link</Link>}><p className="auth-success">Please request a new password reset email.</p></AuthLayout>;
  return <AuthLayout icon={Lock} title="New password" subtitle="Choose a new password for your account">{error && <div className="auth-error" role="alert">{error}</div>}<form className="auth-form" onSubmit={submit}><label htmlFor="password">New password <small>10+ characters</small></label><div className="auth-input"><Lock aria-hidden="true" /><input id="password" type="password" autoComplete="new-password" autoFocus placeholder="••••••••••" value={password} onChange={(event) => setPassword(event.target.value)} required /></div><label htmlFor="confirm">Confirm password</label><div className="auth-input"><Lock aria-hidden="true" /><input id="confirm" type="password" autoComplete="new-password" placeholder="••••••••••" value={confirm} onChange={(event) => setConfirm(event.target.value)} required /></div><button className="auth-submit" type="submit" disabled={loading}>{loading && <Loader2 className="spin" />}{loading ? 'Resetting…' : 'Reset password'}</button></form></AuthLayout>;
}
