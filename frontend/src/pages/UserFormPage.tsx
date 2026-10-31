import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../services/api';
import { usersApi } from '../services/user.service';
import type { UserRole } from '../types/auth';
import { passwordSchema } from '../utils/password-schema';

const baseFormSchema = z.object({
  name: z.string().trim().min(1, 'Nome é obrigatório.').max(120, 'Nome deve ter no máximo 120 caracteres.'),
  email: z.string().trim().min(1, 'E-mail é obrigatório.').email('Informe um e-mail válido.'),
  role: z.enum(['ADMIN', 'ANALISTA', 'VISUALIZADOR']),
  active: z.boolean(),
});

const createFormSchema = baseFormSchema.extend({
  password: z.string().min(1, 'Senha é obrigatória.').pipe(passwordSchema),
});

interface FormState {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  active: boolean;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

const INITIAL_FORM: FormState = {
  name: '',
  email: '',
  password: '',
  role: 'ANALISTA',
  active: true,
};

export function UserFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const { token } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadUser(): Promise<void> {
      if (!isEditing || !id || !token) return;

      try {
        const user = await usersApi.getById(token, id);
        if (active) {
          setForm({
            name: user.name,
            email: user.email,
            password: '',
            role: user.role,
            active: user.active,
          });
        }
      } catch (requestError: unknown) {
        if (active) {
          setLoadError(requestError instanceof ApiError ? requestError.message : 'Não foi possível carregar o usuário.');
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadUser();
    return () => {
      active = false;
    };
  }, [id, isEditing, token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError('');
    const schema = isEditing ? baseFormSchema : createFormSchema;
    const parsed = schema.safeParse(form);

    if (!parsed.success) {
      const flattened = z.flattenError(parsed.error).fieldErrors;
      setErrors({
        name: flattened.name?.[0],
        email: flattened.email?.[0],
        password: parsed.error.issues.find((issue) => issue.path[0] === 'password')?.message,
        role: flattened.role?.[0],
        active: flattened.active?.[0],
      });
      return;
    }

    if (!token) return;
    setErrors({});
    setIsSubmitting(true);

    try {
      if (isEditing && id) {
        await usersApi.update(token, id, {
          name: parsed.data.name,
          email: parsed.data.email,
          role: parsed.data.role,
          active: parsed.data.active,
        });
        navigate('/users', { replace: true, state: { toast: 'Usuário atualizado com sucesso.' } });
      } else {
        const createData = createFormSchema.parse(form);
        await usersApi.create(token, createData);
        navigate('/users', { replace: true, state: { toast: 'Usuário criado com sucesso.' } });
      }
    } catch (requestError: unknown) {
      setFormError(requestError instanceof ApiError ? requestError.message : 'Não foi possível salvar o usuário.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) return <LoadingScreen />;

  if (loadError) {
    return (
      <main className="centered-page">
        <section className="message-card">
          <h1>Não foi possível editar</h1>
          <p role="alert">{loadError}</p>
          <Link to="/users" className="button-link">Voltar para usuários</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="content-page form-page" data-testid="user-form-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">GESTÃO DE USUÁRIOS</p>
          <h1>{isEditing ? 'Editar usuário' : 'Novo usuário'}</h1>
          <p className="subtitle">
            {isEditing ? 'Atualize os dados e as permissões do usuário.' : 'Defina os dados e o acesso inicial.'}
          </p>
        </div>
      </div>

      <form className="entity-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        {formError && <div className="form-error" role="alert" data-testid="user-form-error">{formError}</div>}

        <div className="field-group">
          <label htmlFor="user-name">Nome</label>
          <input
            id="user-name"
            data-testid="user-name"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            aria-invalid={Boolean(errors.name)}
            disabled={isSubmitting}
          />
          {errors.name && <span className="field-error">{errors.name}</span>}
        </div>

        <div className="field-group">
          <label htmlFor="user-email">E-mail</label>
          <input
            id="user-email"
            type="email"
            data-testid="user-email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            aria-invalid={Boolean(errors.email)}
            disabled={isSubmitting}
          />
          {errors.email && <span className="field-error">{errors.email}</span>}
        </div>

        {!isEditing && (
          <div className="field-group">
            <label htmlFor="user-password">Senha inicial</label>
            <input
              id="user-password"
              type="password"
              autoComplete="new-password"
              data-testid="user-password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              aria-invalid={Boolean(errors.password)}
              disabled={isSubmitting}
            />
            {errors.password && <span className="field-error">{errors.password}</span>}
          </div>
        )}

        <div className="form-grid">
          <div className="field-group">
            <label htmlFor="user-role">Perfil</label>
            <select
              id="user-role"
              data-testid="user-role"
              value={form.role}
              onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as UserRole }))}
              disabled={isSubmitting}
            >
              <option value="ADMIN">ADMIN</option>
              <option value="ANALISTA">ANALISTA</option>
              <option value="VISUALIZADOR">VISUALIZADOR</option>
            </select>
          </div>

          <div className="field-group">
            <label htmlFor="user-status">Status</label>
            <select
              id="user-status"
              data-testid="user-status"
              value={String(form.active)}
              onChange={(event) => setForm((current) => ({ ...current, active: event.target.value === 'true' }))}
              disabled={isSubmitting}
            >
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          </div>
        </div>

        <div className="form-actions">
          <Link to="/users" className="secondary-link" data-testid="user-cancel">Cancelar</Link>
          <button type="submit" className="primary-button compact-button" data-testid="user-save" disabled={isSubmitting}>
            {isSubmitting ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </main>
  );
}
