import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { ApiError } from '../services/api';
import { authApi } from '../services/auth.service';
import { authStorage } from '../utils/auth-storage';
import { PASSWORD_POLICY_TEXT, passwordSchema } from '../utils/password-schema';

const resetPasswordFormSchema = z
  .object({
    newPassword: z.string().min(1, 'Nova senha é obrigatória.').pipe(passwordSchema),
    confirmPassword: z.string().min(1, 'Confirmação da nova senha é obrigatória.'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'A confirmação da nova senha não corresponde.',
    path: ['confirmPassword'],
  });

interface FieldErrors {
  newPassword?: string;
  confirmPassword?: string;
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [token] = useState(() => (
    new URLSearchParams(location.hash.slice(1)).get('token') ?? searchParams.get('token') ?? ''
  ));
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (token && (location.hash || searchParams.has('token'))) {
      navigate('/reset-password', { replace: true });
    }
  }, [location.hash, navigate, searchParams, token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError('');

    const parsed = resetPasswordFormSchema.safeParse({ newPassword, confirmPassword });
    if (!parsed.success) {
      const flattened = z.flattenError(parsed.error).fieldErrors;
      setFieldErrors({
        newPassword: flattened.newPassword?.[0],
        confirmPassword: flattened.confirmPassword?.[0],
      });
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);
    try {
      await authApi.resetPassword({ token, ...parsed.data });
      authStorage.setNotice('Senha redefinida com sucesso. Entre com sua nova senha.');
      navigate('/login', { replace: true });
    } catch (error: unknown) {
      setFormError(error instanceof ApiError ? error.message : 'Não foi possível redefinir a senha.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="login-card" aria-labelledby="reset-password-title">
        <div className="brand-mark" aria-hidden="true">QM</div>
        <p className="eyebrow">RECUPERAÇÃO DE ACESSO</p>
        <h1 id="reset-password-title">Crie uma nova senha</h1>
        <p className="subtitle">{PASSWORD_POLICY_TEXT}</p>

        {!token ? (
          <div className="form-error" role="alert" data-testid="reset-password-missing-token">
            Link de redefinição inválido ou expirado. Solicite um novo link.
          </div>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)} noValidate>
            <div className="field-group">
              <label htmlFor="new-password">Nova senha</label>
              <input
                id="new-password"
                name="newPassword"
                type={showPasswords ? 'text' : 'password'}
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                aria-invalid={Boolean(fieldErrors.newPassword)}
                aria-describedby={fieldErrors.newPassword ? 'new-password-error' : undefined}
                disabled={isSubmitting}
              />
              {fieldErrors.newPassword && <span id="new-password-error" className="field-error">{fieldErrors.newPassword}</span>}
            </div>

            <div className="field-group">
              <label htmlFor="confirm-password">Confirmar nova senha</label>
              <input
                id="confirm-password"
                name="confirmPassword"
                type={showPasswords ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                aria-invalid={Boolean(fieldErrors.confirmPassword)}
                aria-describedby={fieldErrors.confirmPassword ? 'confirm-password-error' : undefined}
                disabled={isSubmitting}
              />
              {fieldErrors.confirmPassword && <span id="confirm-password-error" className="field-error">{fieldErrors.confirmPassword}</span>}
              <button type="button" className="password-visibility" onClick={() => setShowPasswords((visible) => !visible)}>
                {showPasswords ? 'Ocultar senhas' : 'Mostrar senhas'}
              </button>
            </div>

            {formError && <div className="form-error" role="alert" data-testid="reset-password-error">{formError}</div>}

            <button type="submit" className="primary-button" data-testid="reset-password-submit" disabled={isSubmitting}>
              {isSubmitting ? 'Redefinindo...' : 'Redefinir senha'}
            </button>
          </form>
        )}

        <Link className="auth-back-link" to={token ? '/login' : '/forgot-password'}>
          {token ? 'Voltar para o login' : 'Solicitar novo link'}
        </Link>
      </section>
    </main>
  );
}
