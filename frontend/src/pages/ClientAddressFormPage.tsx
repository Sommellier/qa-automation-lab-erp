import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { LoadingScreen } from '../components/LoadingScreen';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../services/api';
import { clientsApi } from '../services/client.service';
import { ADDRESS_TYPE_LABELS, type AddressType, type ClientAddressInput } from '../types/client';

const schema = z.object({
  type: z.enum(['RESIDENTIAL', 'COMMERCIAL', 'BILLING', 'OTHER']),
  zipCode: z.string().trim().min(2, 'Informe o CEP/código postal.').max(20).regex(/^[\p{L}\p{N}\s-]+$/u, 'CEP/código postal inválido.'),
  street: z.string().trim().min(2, 'Informe o logradouro.').max(160),
  number: z.string().trim().min(1, 'Informe o número.').max(20),
  complement: z.string().trim().max(120),
  district: z.string().trim().min(1, 'Informe o bairro.').max(100),
  city: z.string().trim().min(1, 'Informe a cidade.').max(100),
  state: z.string().trim().min(1, 'Informe o estado.').max(100),
  country: z.string().trim().min(2, 'Informe o país.').max(100),
  isPrimary: z.boolean(),
});

type FormState = z.input<typeof schema>;
const initial: FormState = { type: 'RESIDENTIAL', zipCode: '', street: '', number: '', complement: '', district: '', city: '', state: '', country: 'Brasil', isPrimary: false };

export function ClientAddressFormPage() {
  const { clientId, addressId } = useParams<{ clientId: string; addressId?: string }>();
  const editing = Boolean(addressId);
  const { token } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(initial);
  const [clientName, setClientName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!token || !clientId) return;
      try {
        const client = await clientsApi.getById(token, clientId);
        if (!client.active) throw new ApiError('Não é possível alterar endereços de um cliente inativo.', 409);
        if (mounted) setClientName(client.name);
        if (addressId) {
          const address = await clientsApi.getAddress(token, clientId, addressId);
          if (mounted) setForm({ type: address.type, zipCode: address.zipCode, street: address.street, number: address.number, complement: address.complement ?? '', district: address.district, city: address.city, state: address.state, country: address.country, isPrimary: address.isPrimary });
        }
      } catch (error) {
        if (mounted) setFormError(error instanceof ApiError ? error.message : 'Não foi possível carregar o endereço.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, [addressId, clientId, token]);

  function change(name: keyof FormState, value: string | boolean) { setForm((current) => ({ ...current, [name]: value })); }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const flat = z.flattenError(parsed.error).fieldErrors;
      setErrors(Object.fromEntries(Object.entries(flat).map(([key, value]) => [key, value?.[0] ?? 'Campo inválido.'])));
      return;
    }
    if (!token || !clientId) return;
    setErrors({}); setSaving(true);
    const input: ClientAddressInput = { ...parsed.data, complement: parsed.data.complement || undefined };
    try {
      if (editing && addressId) await clientsApi.updateAddress(token, clientId, addressId, input);
      else await clientsApi.createAddress(token, clientId, input);
      navigate(`/clients/${clientId}`, { replace: true, state: { toast: editing ? 'Endereço atualizado com sucesso.' : 'Endereço cadastrado com sucesso.' } });
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Não foi possível salvar o endereço.');
    } finally { setSaving(false); }
  }

  if (loading) return <LoadingScreen />;
  const field = (name: Exclude<keyof FormState, 'type' | 'isPrimary' | 'complement'>, label: string) => <div className="field-group"><label htmlFor={`address-${name}`}>{label}</label><input id={`address-${name}`} data-testid={`address-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`} value={String(form[name])} onChange={(event) => change(name, event.target.value)} aria-invalid={Boolean(errors[name])} disabled={saving || Boolean(formError && !clientName)} />{errors[name] && <span className="field-error">{errors[name]}</span>}</div>;

  return <main className="content-page form-page" data-testid="client-address-form-page">
    <div className="page-heading"><div><p className="eyebrow">ENDEREÇOS DO CLIENTE</p><h1>{editing ? 'Editar endereço' : 'Novo endereço'}</h1><p className="subtitle">{clientName || 'Cliente'}</p></div></div>
    <form className="entity-form" onSubmit={(event) => void submit(event)} noValidate>
      {formError && <div className="form-error" role="alert" data-testid="address-form-error">{formError}</div>}
      <div className="form-grid"><div className="field-group"><label htmlFor="address-type">Tipo</label><select id="address-type" data-testid="address-type" value={form.type} onChange={(event) => change('type', event.target.value as AddressType)} disabled={saving}>{Object.entries(ADDRESS_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>{field('zipCode', 'CEP')}</div>
      <div className="form-grid">{field('street', 'Logradouro')}{field('number', 'Número')}</div>
      <div className="field-group"><label htmlFor="address-complement">Complemento</label><input id="address-complement" data-testid="address-complement" value={form.complement} onChange={(event) => change('complement', event.target.value)} disabled={saving} />{errors.complement && <span className="field-error">{errors.complement}</span>}</div>
      <div className="form-grid">{field('district', 'Bairro')}{field('city', 'Cidade')}</div>
      <div className="form-grid">{field('state', 'Estado')}{field('country', 'País')}</div>
      <label className="checkbox-field" htmlFor="address-primary"><input id="address-primary" type="checkbox" data-testid="address-primary" checked={form.isPrimary} onChange={(event) => change('isPrimary', event.target.checked)} disabled={saving} /> Endereço principal</label>
      <div className="form-actions"><Link to={`/clients/${clientId}`} className="secondary-link" data-testid="address-cancel">Cancelar</Link><button type="submit" className="primary-button compact-button" data-testid="address-save" disabled={saving || Boolean(formError && !clientName)}>{saving ? 'Salvando...' : 'Salvar'}</button></div>
    </form>
  </main>;
}
