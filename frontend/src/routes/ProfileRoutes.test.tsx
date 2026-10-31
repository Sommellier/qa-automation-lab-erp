import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../contexts/AuthContext';
import { ApiError } from '../services/api';
import { authApi } from '../services/auth.service';
import { profileApi } from '../services/profile.service';
import type { User, UserRole } from '../types/auth';
import { AppRoutes } from './AppRoutes';

vi.mock('../services/auth.service', () => ({
  authApi: { login: vi.fn(), me: vi.fn(), logout: vi.fn() },
}));
vi.mock('../services/profile.service', () => ({
  profileApi: { update: vi.fn(), changePassword: vi.fn() },
}));

const auth = vi.mocked(authApi);
const profile = vi.mocked(profileApi);

function account(role: UserRole = 'ANALISTA'): User {
  return {
    id: `${role}-id`,
    name: `${role} Teste`,
    email: `${role.toLowerCase()}@teste.local`,
    role,
    active: true,
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-20T16:30:00.000Z',
  };
}

function authenticate(role: UserRole = 'ANALISTA'): User {
  const user = account(role);
  localStorage.setItem('qa-management:access-token', `${role}-token`);
  auth.me.mockResolvedValue(user);
  return user;
}

function renderProfile(path = '/profile') {
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><AppRoutes /></AuthProvider></MemoryRouter>);
}

async function fillPasswords(current = 'Atual@123', next = 'NovaSenha@123', confirmation = next): Promise<void> {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Senha atual'), current);
  await user.type(screen.getByLabelText('Nova senha'), next);
  await user.type(screen.getByLabelText('Confirmar nova senha'), confirmation);
}

describe('perfil do usuário', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.resetAllMocks();
    auth.logout.mockResolvedValue(undefined);
    profile.changePassword.mockResolvedValue(undefined);
  });

  it.each<UserRole>(['ADMIN', 'ANALISTA', 'VISUALIZADOR'])('CT001-003: %s acessa o próprio perfil', async (role) => {
    const current = authenticate(role);
    renderProfile();
    expect(await screen.findByTestId('profile-page')).toBeInTheDocument();
    expect(screen.getByTestId('profile-link')).toBeInTheDocument();
    expect(screen.getByTestId('profile-name')).toHaveValue(current.name);
    expect(screen.getByTestId('profile-email')).toHaveValue(current.email);
    expect(screen.getByTestId('profile-email')).toHaveAttribute('readonly');
    expect(screen.getByTestId('profile-role')).toHaveTextContent(role);
    expect(screen.getByTestId('profile-status')).toHaveTextContent('Ativo');
  });

  it('CT004: redireciona usuário não autenticado para login', async () => {
    renderProfile();
    expect(await screen.findByRole('heading', { name: 'Acesse sua conta' })).toBeInTheDocument();
    expect(screen.queryByTestId('profile-page')).not.toBeInTheDocument();
  });

  it('CT005-008: valida, altera o nome, mostra toast e atualiza o header sem novo login', async () => {
    const current = authenticate();
    profile.update.mockResolvedValue({ ...current, name: 'Carlos da Silva', updatedAt: '2026-09-28T18:00:00.000Z' });
    renderProfile();
    const user = userEvent.setup();
    const input = await screen.findByTestId('profile-name');
    await user.clear(input);
    await user.click(screen.getByTestId('profile-save'));
    expect(screen.getByText('Nome é obrigatório.')).toBeInTheDocument();
    expect(profile.update).not.toHaveBeenCalled();
    await user.type(input, '  Carlos da Silva  ');
    await user.click(screen.getByTestId('profile-save'));
    await waitFor(() => expect(profile.update).toHaveBeenCalledWith('ANALISTA-token', { name: 'Carlos da Silva' }));
    expect(await screen.findByTestId('toast')).toHaveTextContent('Perfil atualizado com sucesso.');
    expect(screen.getByText('Carlos da Silva', { selector: '.header-user' })).toBeInTheDocument();
  });

  it('CT013-015: valida política, confirmação e igualdade antes da API', async () => {
    authenticate();
    renderProfile();
    const user = userEvent.setup();
    await screen.findByTestId('profile-page');
    await fillPasswords('Atual@123', 'fraca', 'fraca');
    await user.click(screen.getByTestId('change-password'));
    expect(screen.getByTestId('password-error')).toHaveTextContent('8 caracteres');
    expect(profile.changePassword).not.toHaveBeenCalled();

    await user.clear(screen.getByTestId('new-password'));
    await user.type(screen.getByTestId('new-password'), 'OutraSenha@123');
    await user.click(screen.getByTestId('change-password'));
    expect(screen.getByTestId('password-error')).toHaveTextContent('confirmação');

    await user.clear(screen.getByTestId('new-password'));
    await user.type(screen.getByTestId('new-password'), 'Atual@123');
    await user.clear(screen.getByTestId('confirm-password'));
    await user.type(screen.getByTestId('confirm-password'), 'Atual@123');
    await user.click(screen.getByTestId('change-password'));
    expect(screen.getByTestId('password-error')).toHaveTextContent('deve ser diferente');
  });

  it('CT012: apresenta erro explícito quando a senha atual está incorreta', async () => {
    authenticate();
    profile.changePassword.mockRejectedValue(new ApiError('Senha atual incorreta.', 400, 'CURRENT_PASSWORD_INCORRECT'));
    renderProfile();
    await screen.findByTestId('profile-page');
    await fillPasswords();
    await userEvent.setup().click(screen.getByTestId('change-password'));
    expect(await screen.findByTestId('password-error')).toHaveTextContent('Senha atual incorreta.');
  });

  it('RF020-021: mostra e oculta os campos preservando autocomplete', async () => {
    authenticate();
    renderProfile();
    const current = await screen.findByTestId('current-password');
    expect(current).toHaveAttribute('type', 'password');
    expect(current).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByTestId('new-password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByTestId('confirm-password')).toHaveAttribute('autocomplete', 'new-password');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mostrar senhas' }));
    expect(current).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ocultar senhas' })).toBeInTheDocument();
  });

  it('CT020: após sucesso limpa sessão, volta ao login e mostra a mensagem de segurança', async () => {
    authenticate();
    renderProfile();
    await screen.findByTestId('profile-page');
    await fillPasswords();
    await userEvent.setup().click(screen.getByTestId('change-password'));
    await waitFor(() => expect(profile.changePassword).toHaveBeenCalledWith('ANALISTA-token', {
      currentPassword: 'Atual@123', newPassword: 'NovaSenha@123', confirmPassword: 'NovaSenha@123',
    }));
    expect(await screen.findByRole('heading', { name: 'Acesse sua conta' })).toBeInTheDocument();
    expect(screen.getByTestId('toast')).toHaveTextContent('Senha alterada com sucesso. Entre novamente com sua nova senha.');
    expect(localStorage.getItem('qa-management:access-token')).toBeNull();
    expect(auth.logout).toHaveBeenCalledWith('ANALISTA-token');
  });

  it('RF024: bloqueia múltiplos submits durante a alteração', async () => {
    authenticate();
    profile.changePassword.mockReturnValue(new Promise(() => undefined));
    renderProfile();
    await screen.findByTestId('profile-page');
    await fillPasswords();
    await userEvent.setup().click(screen.getByTestId('change-password'));
    expect(screen.getByTestId('change-password')).toBeDisabled();
    expect(screen.getByTestId('change-password')).toHaveTextContent('Alterando senha...');
  });
});
