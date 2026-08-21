import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Lock, LogIn, Mail } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import GoogleIcon from '@/components/GoogleIcon';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/api';
import { safeReturnTo } from '@/lib/authReturnTo';

export default function Login() {
  const { config, refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const returnTo = safeReturnTo();

  const submit = async (event) => {
    event.preventDefault(); setError(''); setLoading(true);
    try { await api.auth.login(email, password); await refresh(); window.location.assign(returnTo); }
    catch (caught) { setError(caught.message || 'Invalid email or password.'); }
    finally { setLoading(false); }
  };

  return <AuthLayout icon={LogIn} title="Welcome back" subtitle="Log in to your account" footer={<>Don&rsquo;t have an account? <Link to={`/register${returnTo === '/' ? '' : `?returnTo=${encodeURIComponent(returnTo)}`}`}>Create one</Link></>}>
    {config.google_auth_enabled && <><a className="auth-google" href={api.auth.googleUrl(returnTo)}><GoogleIcon />Continue with Google</a><div className="auth-divider"><span>or</span></div></>}
    {error && <div className="auth-error" role="alert">{error}</div>}
    <form className="auth-form" onSubmit={submit}>
      <label htmlFor="email">Email</label><div className="auth-input"><Mail aria-hidden="true" /><input id="email" type="email" autoComplete="email" autoFocus placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
      <div className="auth-label-row"><label htmlFor="password">Password</label><Link to="/forgot-password">Forgot password?</Link></div><div className="auth-input"><Lock aria-hidden="true" /><input id="password" type="password" autoComplete="current-password" placeholder="••••••••••" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
      <button className="auth-submit" type="submit" disabled={loading}>{loading && <Loader2 className="spin" aria-hidden="true" />}{loading ? 'Logging in…' : 'Log in'}</button>
    </form>
  </AuthLayout>;
}
