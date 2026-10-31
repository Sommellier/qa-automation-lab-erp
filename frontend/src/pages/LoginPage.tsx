import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { LoadingScreen } from '../components/LoadingScreen';
import { Toast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../services/api';
import { authStorage } from '../utils/auth-storage';

const loginFormSchema = z.object({
  email: z.string().trim().min(1, 'E-mail é obrigatório.').email('Informe um e-mail válido.'),
  password: z.string().min(1, 'Senha é obrigatória.'),
});

interface FieldErrors {
  email?: string;
  password?: string;
}

interface LocationState {
  from?: { pathname?: string };
  message?: string;
}

export function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState(() => (location.state as LocationState | null)?.message ?? authStorage.consumeNotice());

  useEffect(() => {
    const message = (location.state as LocationState | null)?.message;
    if (message) setNotice(message);
  }, [location.state]);

  if (isLoading) return <LoadingScreen />;

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError('');

    const parsed = loginFormSchema.safeParse({ email, password });

    if (!parsed.success) {
      const flattened = z.flattenError(parsed.error).fieldErrors;
      setFieldErrors({
        email: flattened.email?.[0],
        password: flattened.password?.[0],
      });
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      await login(parsed.data);
      const state = location.state as LocationState | null;
      navigate(state?.from?.pathname ?? '/dashboard', { replace: true });
    } catch (error: unknown) {
      setFormError(error instanceof ApiError ? error.message : 'Não foi possível realizar o login.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-mark" aria-hidden="true">QM</div>
        <p className="eyebrow">QA MANAGEMENT</p>
        <h1 id="login-title">Acesse sua conta</h1>
        <p className="subtitle">Gestão de clientes e produtos em um só lugar.</p>

        <form onSubmit={(event) => void handleSubmit(event)} noValidate>
          <div className="field-group">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              data-testid="login-email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? 'email-error' : undefined}
              disabled={isSubmitting}
            />
            {fieldErrors.email && (
              <span id="email-error" className="field-error" data-testid="login-email-error">
                {fieldErrors.email}
              </span>
            )}
          </div>

          <div className="field-group">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              data-testid="login-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? 'password-error' : undefined}
              disabled={isSubmitting}
            />
            {fieldErrors.password && (
              <span id="password-error" className="field-error" data-testid="login-password-error">
                {fieldErrors.password}
              </span>
            )}
            <Link className="forgot-password-link" to="/forgot-password">Esqueci minha senha</Link>
          </div>

          {formError && (
            <div className="form-error" role="alert" data-testid="login-error">
              {formError}
            </div>
          )}

          <button type="submit" className="primary-button" data-testid="login-submit" disabled={isSubmitting}>
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </section>
      {notice && <Toast message={notice} onDismiss={() => setNotice('')} />}
    </main>
  );
}
