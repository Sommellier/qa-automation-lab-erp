import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Toast } from '../components/Toast';
import { useAuth } from '../hooks/useAuth';
import { ApiError } from '../services/api';
import { profileApi } from '../services/profile.service';
import { PASSWORD_POLICY_TEXT, passwordSchema } from '../utils/password-schema';
import { authStorage } from '../utils/auth-storage';

const profileSchema = z.object({
  name: z.string().trim().min(1, 'Nome é obrigatório.').max(120, 'Nome deve ter no máximo 120 caracteres.'),
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Senha atual é obrigatória.'),
    newPassword: z.string().min(1, 'Nova senha é obrigatória.').pipe(passwordSchema),
    confirmPassword: z.string().min(1, 'Confirmação da nova senha é obrigatória.'),
  })
  .superRefine((data, context) => {
    if (data.newPassword !== data.confirmPassword) {
      context.addIssue({ code: 'custom', message: 'A confirmação da nova senha não corresponde.', path: ['confirmPassword'] });
    }
    if (data.currentPassword && data.newPassword === data.currentPassword) {
      context.addIssue({ code: 'custom', message: 'A nova senha deve ser diferente da senha atual.', path: ['newPassword'] });
    }
  });

const EMPTY_PASSWORDS = { currentPassword: '', newPassword: '', confirmPassword: '' };

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function ProfilePage() {
  const { user, token, updateUser, logout } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name ?? '');
  const [nameError, setNameError] = useState('');
  const [profileError, setProfileError] = useState('');
  const [passwords, setPasswords] = useState(EMPTY_PASSWORDS);
  const [passwordError, setPasswordError] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [toast, setToast] = useState('');
  const accessToken = token ?? '';

  if (!user || !token) return null;

  async function saveProfile(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setNameError('');
    setProfileError('');
    const parsed = profileSchema.safeParse({ name });
    if (!parsed.success) {
      setNameError(z.flattenError(parsed.error).fieldErrors.name?.[0] ?? 'Nome inválido.');
      return;
    }

    setSavingProfile(true);
    try {
      const updated = await profileApi.update(accessToken, parsed.data);
      updateUser(updated);
      setName(updated.name);
      setToast('Perfil atualizado com sucesso.');
    } catch (error: unknown) {
      setProfileError(error instanceof ApiError ? error.message : 'Não foi possível atualizar o perfil.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPasswordError('');
    const parsed = changePasswordSchema.safeParse(passwords);
    if (!parsed.success) {
      setPasswordError(parsed.error.issues[0]?.message ?? 'Dados de senha inválidos.');
      return;
    }

    setSavingPassword(true);
    try {
      await profileApi.changePassword(accessToken, parsed.data);
      const successMessage = 'Senha alterada com sucesso. Entre novamente com sua nova senha.';
      authStorage.setNotice(successMessage);
      const logoutRequest = logout();
      navigate('/login', {
        replace: true,
        state: { message: successMessage },
      });
      await logoutRequest;
    } catch (error: unknown) {
      setPasswordError(error instanceof ApiError ? error.message : 'Não foi possível alterar a senha.');
      setSavingPassword(false);
    }
  }

  const inputType = showPasswords ? 'text' : 'password';

  return (
    <main className="content-page profile-page" data-testid="profile-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CONTA</p>
          <h1>Meu Perfil</h1>
          <p className="subtitle">Consulte seus dados e mantenha sua senha protegida.</p>
        </div>
      </div>

      <div className="profile-sections">
        <form className="entity-form profile-card" onSubmit={(event) => void saveProfile(event)} noValidate>
          <div className="profile-card-heading">
            <h2>Informações da conta</h2>
            <p>Somente o nome pode ser alterado por você.</p>
          </div>
          {profileError && <div className="form-error" role="alert">{profileError}</div>}
          <div className="field-group">
            <label htmlFor="profile-name">Nome</label>
            <input id="profile-name" data-testid="profile-name" value={name} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(nameError)} disabled={savingProfile} />
            {nameError && <span className="field-error">{nameError}</span>}
          </div>
          <div className="field-group">
            <label htmlFor="profile-email">E-mail</label>
            <input id="profile-email" data-testid="profile-email" type="email" value={user.email} readOnly />
            <small>O e-mail é o identificador de acesso e não pode ser alterado aqui.</small>
          </div>
          <dl className="profile-account-grid">
            <div><dt>Perfil</dt><dd data-testid="profile-role">{user.role}</dd></div>
            <div><dt>Status</dt><dd data-testid="profile-status"><span className={`status-badge ${user.active ? 'status-active' : 'status-inactive'}`}>{user.active ? 'Ativo' : 'Inativo'}</span></dd></div>
            <div><dt>Data de criação</dt><dd>{formatDate(user.createdAt)}</dd></div>
            <div><dt>Última atualização</dt><dd>{formatDate(user.updatedAt)}</dd></div>
          </dl>
          <div className="form-actions">
            <button type="submit" className="primary-button compact-button" data-testid="profile-save" disabled={savingProfile}>
              {savingProfile ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </form>

        <form className="entity-form profile-card" onSubmit={(event) => void changePassword(event)} noValidate>
          <div className="profile-card-heading">
            <h2>Alterar senha</h2>
            <p>{PASSWORD_POLICY_TEXT}</p>
          </div>
          {passwordError && <div className="form-error" role="alert" data-testid="password-error">{passwordError}</div>}
          <div className="field-group">
            <label htmlFor="current-password">Senha atual</label>
            <input id="current-password" data-testid="current-password" type={inputType} autoComplete="current-password" value={passwords.currentPassword} onChange={(event) => setPasswords((current) => ({ ...current, currentPassword: event.target.value }))} disabled={savingPassword} />
          </div>
          <div className="field-group">
            <label htmlFor="new-password">Nova senha</label>
            <input id="new-password" data-testid="new-password" type={inputType} autoComplete="new-password" value={passwords.newPassword} onChange={(event) => setPasswords((current) => ({ ...current, newPassword: event.target.value }))} disabled={savingPassword} />
          </div>
          <div className="field-group">
            <label htmlFor="confirm-password">Confirmar nova senha</label>
            <input id="confirm-password" data-testid="confirm-password" type={inputType} autoComplete="new-password" value={passwords.confirmPassword} onChange={(event) => setPasswords((current) => ({ ...current, confirmPassword: event.target.value }))} disabled={savingPassword} />
          </div>
          <button type="button" className="password-visibility" onClick={() => setShowPasswords((current) => !current)} aria-pressed={showPasswords} disabled={savingPassword}>
            {showPasswords ? 'Ocultar senhas' : 'Mostrar senhas'}
          </button>
          <div className="form-actions">
            <button type="submit" className="primary-button compact-button" data-testid="change-password" disabled={savingPassword}>
              {savingPassword ? 'Alterando senha...' : 'Alterar senha'}
            </button>
          </div>
        </form>
      </div>
      {toast && <Toast message={toast} onDismiss={() => setToast('')} />}
    </main>
  );
}
