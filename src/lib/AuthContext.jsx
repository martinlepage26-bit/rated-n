import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [config, setConfig] = useState({ google_auth_enabled: false, email_delivery_enabled: false });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [me, publicConfig] = await Promise.all([
        api.auth.me().catch((error) => error.status === 401 ? { user: null } : Promise.reject(error)),
        api.config().catch(() => ({ google_auth_enabled: false, email_delivery_enabled: false }))
      ]);
      setUser(me.user || null);
      setConfig(publicConfig);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const logout = useCallback(async () => {
    try { await api.auth.logout(); } finally { setUser(null); }
  }, []);

  const value = useMemo(() => ({ user, config, loading, refresh, logout }), [user, config, loading, refresh, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
