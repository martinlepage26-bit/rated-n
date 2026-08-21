import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Mail } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { api } from '@/lib/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState(''); const [loading, setLoading] = useState(false); const [sent, setSent] = useState(false); const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault(); setLoading(true); setError('');
    try { await api.auth.forgotPassword(email); setSent(true); }
    catch (caught) { setError(caught.message || 'Could not send a reset link.'); }
    finally { setLoading(false); }
  };
  return <AuthLayout icon={Mail} title="Reset password" subtitle="We’ll send you a secure reset link" footer={<Link to="/login"><ArrowLeft size={12} /> Back to log in</Link>}>
    {sent ? <p className="auth-success" role="status">If an account exists with that email, a password reset link will arrive shortly.</p> : <form className="auth-form" onSubmit={submit}>{error && <div className="auth-error" role="alert">{error}</div>}<label htmlFor="email">Email address</label><div className="auth-input"><Mail aria-hidden="true" /><input id="email" type="email" autoComplete="email" autoFocus placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></div><button className="auth-submit" type="submit" disabled={loading}>{loading && <Loader2 className="spin" />}{loading ? 'Sending…' : 'Send reset link'}</button></form>}
  </AuthLayout>;
}
