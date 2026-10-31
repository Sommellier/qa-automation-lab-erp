import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi } from '../services/auth.service';
import type { LoginCredentials, User } from '../types/auth';
import { authStorage } from '../utils/auth-storage';

const COOKIE_SESSION_MARKER = 'cookie-session';

export interface AuthContextValue {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login(credentials: LoginCredentials): Promise<void>;
  logout(): Promise<void>;
  updateUser(user: User): void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => authStorage.consumeLegacyToken() ?? COOKIE_SESSION_MARKER);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function restoreSession(): Promise<void> {
      try {
        const currentUser = await authApi.me(token ?? undefined);
        if (active) setUser(currentUser);
      } catch {
        authStorage.clear();
        if (active) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void restoreSession();
    return () => {
      active = false;
    };
    // A restauração acontece apenas na montagem. Login e logout atualizam o
    // estado diretamente e não precisam repetir a chamada a /auth/me.
  }, []);

  useEffect(() => {
    const expireSession = () => {
      setUser(null);
      setToken(null);
    };
    window.addEventListener('qa-management:session-expired', expireSession);
    return () => window.removeEventListener('qa-management:session-expired', expireSession);
  }, []);

  const login = useCallback(async (credentials: LoginCredentials): Promise<void> => {
    const session = await authApi.login(credentials);
    setToken(session.token ?? COOKIE_SESSION_MARKER);
    setUser(session.user);
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    const currentToken = token;
    authStorage.clear();
    setUser(null);
    setToken(null);

    if (currentToken) {
      await authApi.logout(currentToken).catch(() => undefined);
    }
  }, [token]);

  const updateUser = useCallback((updatedUser: User): void => {
    setUser(updatedUser);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(user && token),
      isLoading,
      login,
      logout,
      updateUser,
    }),
    [user, token, isLoading, login, logout, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
