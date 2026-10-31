import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { ApiError } from '../services/api';
import { authApi } from '../services/auth.service';

const forgotPasswordFormSchema = z.object({
  email: z.string().trim().min(1, 'E-mail é obrigatório.').email('Informe um e-mail válido.').transform((value) => value.toLowerCase()),
});

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [formError, setFormError] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError('');
    setConfirmation('');

    const parsed = forgotPasswordFormSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(z.flattenError(parsed.error).fieldErrors.email?.[0] ?? 'E-mail inválido.');
      return;
    }

    setFieldError('');
    setIsSubmitting(true);
    try {
      const result = await authApi.forgotPassword(parsed.data);
      setConfirmation(result.message);
    } catch (error: unknown) {
      setFormError(error instanceof ApiError ? error.message : 'Não foi possível concluir a solicitação.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="login-card" aria-labelledby="forgot-password-title">
        <div className="brand-mark" aria-hidden="true">QM</div>
        <p className="eyebrow">RECUPERAÇÃO DE ACESSO</p>
        <h1 id="forgot-password-title">Esqueci minha senha</h1>
        <p className="subtitle">Informe seu e-mail para receber as instruções de redefinição.</p>

        {confirmation ? (
          <div className="auth-success" role="status" data-testid="forgot-password-success">
            {confirmation}
          </div>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)} noValidate>
            <div className="field-group">
              <label htmlFor="recovery-email">E-mail</label>
              <input
                id="recovery-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={Boolean(fieldError)}
                aria-describedby={fieldError ? 'recovery-email-error' : undefined}
                disabled={isSubmitting}
              />
              {fieldError && <span id="recovery-email-error" className="field-error">{fieldError}</span>}
            </div>

            {formError && <div className="form-error" role="alert">{formError}</div>}

            <button type="submit" className="primary-button" data-testid="forgot-password-submit" disabled={isSubmitting}>
              {isSubmitting ? 'Enviando...' : 'Enviar instruções'}
            </button>
          </form>
        )}

        <Link className="auth-back-link" to="/login">Voltar para o login</Link>
      </section>
    </main>
  );
}
