import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../contexts/AuthContext';
import { ApiError } from '../services/api';
import { authApi } from '../services/auth.service';
import { AppRoutes } from './AppRoutes';

vi.mock('../services/auth.service', () => ({
  authApi: {
    login: vi.fn(),
    me: vi.fn(),
    logout: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
  },
}));

const mockedAuthApi = vi.mocked(authApi);
const genericMessage = 'Se o e-mail estiver cadastrado e ativo, enviaremos instruções para redefinir a senha.';

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('recuperação de senha', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.resetAllMocks();
  });

  it('oferece o acesso à recuperação a partir do login', async () => {
    const user = userEvent.setup();
    renderApp('/login');
    await user.click(await screen.findByRole('link', { name: 'Esqueci minha senha' }));
    expect(await screen.findByRole('heading', { name: 'Esqueci minha senha' })).toBeInTheDocument();
  });

  it('valida o e-mail e exibe somente a resposta genérica', async () => {
    mockedAuthApi.forgotPassword.mockResolvedValue({ message: genericMessage });
    const user = userEvent.setup();
    renderApp('/forgot-password');

    await user.click(await screen.findByTestId('forgot-password-submit'));
    expect(screen.getByText('E-mail é obrigatório.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('E-mail'), '  Pessoa@Empresa.COM  ');
    await user.click(screen.getByTestId('forgot-password-submit'));

    expect(await screen.findByTestId('forgot-password-success')).toHaveTextContent(genericMessage);
    expect(mockedAuthApi.forgotPassword).toHaveBeenCalledWith({ email: 'pessoa@empresa.com' });
  });

  it('rejeita acesso sem token e direciona para uma nova solicitação', async () => {
    renderApp('/reset-password');
    expect(await screen.findByTestId('reset-password-missing-token')).toHaveTextContent('inválido ou expirado');
    expect(screen.getByRole('link', { name: 'Solicitar novo link' })).toHaveAttribute('href', '/forgot-password');
    expect(mockedAuthApi.resetPassword).not.toHaveBeenCalled();
  });

  it('aplica a política local, redefine e retorna ao login com confirmação', async () => {
    mockedAuthApi.resetPassword.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderApp('/reset-password#token=token-seguro-com-mais-de-trinta-e-dois-caracteres');

    await user.type(await screen.findByLabelText('Nova senha'), 'fraca');
    await user.type(screen.getByLabelText('Confirmar nova senha'), 'fraca');
    await user.click(screen.getByTestId('reset-password-submit'));
    expect(screen.getByText('A senha deve ter pelo menos 8 caracteres.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Nova senha'));
    await user.clear(screen.getByLabelText('Confirmar nova senha'));
    await user.type(screen.getByLabelText('Nova senha'), 'NovaSenha@123');
    await user.type(screen.getByLabelText('Confirmar nova senha'), 'NovaSenha@123');
    await user.click(screen.getByTestId('reset-password-submit'));

    expect(await screen.findByRole('heading', { name: 'Acesse sua conta' })).toBeInTheDocument();
    expect(await screen.findByText('Senha redefinida com sucesso. Entre com sua nova senha.')).toBeInTheDocument();
    expect(mockedAuthApi.resetPassword).toHaveBeenCalledWith({
      token: 'token-seguro-com-mais-de-trinta-e-dois-caracteres',
      newPassword: 'NovaSenha@123',
      confirmPassword: 'NovaSenha@123',
    });
  });

  it('mantém uma mensagem única para token usado, inválido ou expirado', async () => {
    mockedAuthApi.resetPassword.mockRejectedValue(
      new ApiError('Link de redefinição inválido ou expirado.', 400, 'PASSWORD_RESET_INVALID'),
    );
    const user = userEvent.setup();
    renderApp('/reset-password#token=token-seguro-com-mais-de-trinta-e-dois-caracteres');
    await user.type(await screen.findByLabelText('Nova senha'), 'NovaSenha@123');
    await user.type(screen.getByLabelText('Confirmar nova senha'), 'NovaSenha@123');
    await user.click(screen.getByTestId('reset-password-submit'));
    expect(await screen.findByTestId('reset-password-error')).toHaveTextContent('Link de redefinição inválido ou expirado.');
  });
});
