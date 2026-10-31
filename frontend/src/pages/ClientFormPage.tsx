import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../services/api';
import { clientsApi } from '../services/client.service';

const phoneSchema = z.string().trim().refine(
  (value) => value === '' || (/^[0-9()+\-.\s]+$/.test(value) && value.length >= 8 && value.length <= 20),
  'Informe um telefone válido.',
);

const clientFormSchema = z.object({
  name: z.string().trim().min(1, 'Nome é obrigatório.').min(2, 'Nome deve ter pelo menos 2 caracteres.').max(120),
  document: z.string().trim().min(1, 'Documento é obrigatório.').min(5, 'Documento deve ter pelo menos 5 caracteres.')
    .max(30).regex(/^[\p{L}\p{N} .\-/]+$/u, 'Documento contém caracteres inválidos.'),
  email: z.string().trim().min(1, 'E-mail é obrigatório.').email('Informe um e-mail válido.').max(254),
  phone: phoneSchema,
  active: z.boolean(),
});

interface FormState { name: string; document: string; email: string; phone: string; active: boolean }
type FormErrors = Partial<Record<keyof FormState, string>>;
const INITIAL_FORM: FormState = { name: '', document: '', email: '', phone: '', active: true };

export function ClientFormPage() {
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
    let mounted = true;
    async function loadClient(): Promise<void> {
      if (!isEditing || !id || !token) return;
      try {
        const client = await clientsApi.getById(token, id);
        if (mounted) setForm({ name: client.name, document: client.document, email: client.email, phone: client.phone ?? '', active: client.active });
      } catch (requestError: unknown) {
        if (mounted) setLoadError(requestError instanceof ApiError ? requestError.message : 'Não foi possível carregar o cliente.');
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    void loadClient();
    return () => { mounted = false; };
  }, [id, isEditing, token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError('');
    const parsed = clientFormSchema.safeParse(form);
    if (!parsed.success) {
      const fields = z.flattenError(parsed.error).fieldErrors;
      setErrors({ name: fields.name?.[0], document: fields.document?.[0], email: fields.email?.[0], phone: fields.phone?.[0], active: fields.active?.[0] });
      return;
    }
    if (!token) return;
    setErrors({});
    setIsSubmitting(true);
    const common = {
      name: parsed.data.name,
      document: parsed.data.document,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
    };
    try {
      if (isEditing && id) {
        await clientsApi.update(token, id, common);
        navigate('/clients', { replace: true, state: { toast: 'Cliente atualizado com sucesso.' } });
      } else {
        await clientsApi.create(token, { ...common, phone: common.phone ?? undefined, active: parsed.data.active });
        navigate('/clients', { replace: true, state: { toast: 'Cliente cadastrado com sucesso.' } });
      }
    } catch (requestError: unknown) {
      setFormError(requestError instanceof ApiError ? requestError.message : 'Não foi possível salvar o cliente.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) return <LoadingScreen />;
  if (loadError) return <main className="centered-page"><section className="message-card">
    <h1>Não foi possível editar</h1><p role="alert">{loadError}</p><Link to="/clients" className="button-link">Voltar para clientes</Link>
  </section></main>;

  return (
    <main className="content-page form-page" data-testid="client-form-page">
      <div className="page-heading"><div><p className="eyebrow">GESTÃO DE CLIENTES</p>
        <h1>{isEditing ? 'Editar cliente' : 'Novo cliente'}</h1>
        <p className="subtitle">{isEditing ? 'Atualize os dados cadastrais do cliente.' : 'Informe os dados do novo cliente.'}</p>
      </div></div>
      <form className="entity-form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        {formError && <div className="form-error" role="alert" data-testid="client-form-error">{formError}</div>}
        <div className="field-group"><label htmlFor="client-name">Nome</label><input id="client-name" data-testid="client-name"
          value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          aria-invalid={Boolean(errors.name)} disabled={isSubmitting} />{errors.name && <span className="field-error">{errors.name}</span>}</div>
        <div className="field-group"><label htmlFor="client-document">Documento</label><input id="client-document" data-testid="client-document"
          value={form.document} onChange={(event) => setForm((current) => ({ ...current, document: event.target.value }))}
          aria-invalid={Boolean(errors.document)} disabled={isSubmitting} />{errors.document && <span className="field-error">{errors.document}</span>}</div>
        <div className="field-group"><label htmlFor="client-email">E-mail</label><input id="client-email" type="email" data-testid="client-email"
          value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
          aria-invalid={Boolean(errors.email)} disabled={isSubmitting} />{errors.email && <span className="field-error">{errors.email}</span>}</div>
        <div className="field-group"><label htmlFor="client-phone">Telefone</label><input id="client-phone" type="tel" data-testid="client-phone"
          value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
          aria-invalid={Boolean(errors.phone)} disabled={isSubmitting} />{errors.phone && <span className="field-error">{errors.phone}</span>}</div>
        {!isEditing && <div className="field-group"><label htmlFor="client-status">Status</label><select id="client-status" data-testid="client-status"
          value={String(form.active)} onChange={(event) => setForm((current) => ({ ...current, active: event.target.value === 'true' }))} disabled={isSubmitting}>
          <option value="true">Ativo</option><option value="false">Inativo</option></select></div>}
        <div className="form-actions"><Link to="/clients" className="secondary-link" data-testid="client-cancel">Cancelar</Link>
          <button type="submit" className="primary-button compact-button" data-testid="client-save" disabled={isSubmitting}>{isSubmitting ? 'Salvando...' : 'Salvar'}</button></div>
      </form>
    </main>
  );
}
