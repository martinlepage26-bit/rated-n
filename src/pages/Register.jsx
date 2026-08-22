import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Lock, Mail, UserPlus } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import GoogleIcon from '@/components/GoogleIcon';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/lib/api';
import { safeReturnTo } from '@/lib/authReturnTo';

export default function Register() {
  const { config, refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [verifyMode, setVerifyMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const returnTo = safeReturnTo();
  const registerLink = `/login${returnTo === '/' ? '' : `?returnTo=${encodeURIComponent(returnTo)}`}`;

  const register = async (event) => {
    event.preventDefault();
    setError('');
    if (password !== confirm) return setError('Passwords do not match.');
    if (password.length < 10) return setError('Use at least 10 characters.');
    setLoading(true);
    try {
      await api.auth.register(email, password);
      setVerifyMode(true);
    } catch (caught) {
      setError(caught.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const verify = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.auth.verify(email, code);
      await refresh();
      window.location.assign(returnTo);
    } catch (caught) {
      setError(caught.message || 'Invalid verification code.');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setError('');
    setNotice('');
    try {
      await api.auth.resend(email);
      setNotice('A new code was sent.');
    } catch (caught) {
      setError(caught.message || 'Could not resend the code.');
    }
  };

  if (verifyMode) {
    return (
      <AuthLayout icon={Mail} title="Verify your email" subtitle={`We sent a code to ${email}`}>
        {error && <div className="auth-error" role="alert">{error}</div>}
        {notice && <div className="auth-notice" role="status">{notice}</div>}
        <form className="auth-form" onSubmit={verify}>
          <label htmlFor="otp">Six-digit code</label>
          <input className="otp-input" id="otp" inputMode="numeric" pattern="[0-9]{6}" maxLength="6" autoComplete="one-time-code" autoFocus value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} required />
          <button className="auth-submit" type="submit" disabled={loading || code.length !== 6}>
            {loading && <Loader2 className="spin" />}
            {loading ? 'Verifying…' : 'Verify'}
          </button>
        </form>
        <p className="auth-secondary">Didn&rsquo;t receive the code? <button type="button" onClick={resend}>Resend</button></p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout icon={UserPlus} title="Create your account" subtitle="Sign up to get started" footer={<>Already have an account? <Link to={registerLink}>Log in</Link></>}>
      {config.google_auth_enabled && (
        <>
          <a className="auth-google" href={api.auth.googleUrl(returnTo)}><GoogleIcon />Continue with Google</a>
          <div className="auth-divider"><span>or</span></div>
        </>
      )}
      {!config.email_delivery_enabled && <div className="auth-notice">Email registration is unavailable until secure delivery is configured.</div>}
      {error && <div className="auth-error" role="alert">{error}</div>}
      <form className="auth-form" onSubmit={register}>
        <label htmlFor="email">Email</label>
        <div className="auth-input"><Mail aria-hidden="true" /><input id="email" type="email" autoComplete="email" autoFocus placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
        <label htmlFor="password">Password <small>10+ characters</small></label>
        <div className="auth-input"><Lock aria-hidden="true" /><input id="password" type="password" autoComplete="new-password" placeholder="••••••••••" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
        <label htmlFor="confirm">Confirm password</label>
        <div className="auth-input"><Lock aria-hidden="true" /><input id="confirm" type="password" autoComplete="new-password" placeholder="••••••••••" value={confirm} onChange={(event) => setConfirm(event.target.value)} required /></div>
        <button className="auth-submit" type="submit" disabled={loading || !config.email_delivery_enabled}>
          {loading && <Loader2 className="spin" />}
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  );
}
