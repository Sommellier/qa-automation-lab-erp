
import { Page, Locator, expect } from '@playwright/test';
import type { Credenciais } from '../../utils/credentials';

export class LoginPage {

  readonly page: Page;
  readonly campoEmail: Locator;
  readonly campoSenha: Locator;
  readonly botaoEntrar: Locator;
  readonly mensagemEmailInvalido: Locator;
  readonly mensagemEmailObrigatorio: Locator;
  readonly mensagemSenhaObrigatoria: Locator;
  readonly mensagemCredenciaisInvalidas: Locator;

  constructor(page: Page) {
    this.page = page;

    this.campoEmail = page.getByTestId('login-email');
    this.campoSenha = page.getByTestId('login-password');
    this.botaoEntrar = page.getByTestId('login-submit');
    this.mensagemEmailInvalido = page.getByText('Informe um e-mail válido.');
    this.mensagemEmailObrigatorio = page.getByText('E-mail é obrigatório.');
    this.mensagemSenhaObrigatoria = page.getByText('Senha é obrigatória.');
    this.mensagemCredenciaisInvalidas = page.getByText('E-mail ou senha inválidos.');
  }

  async acessar(): Promise<void> {
    await this.page.goto('/login');
  }

  async preencherEmail(email: string): Promise<void> {
    await this.campoEmail.fill(email);
  }

  async preencherSenha(senha: string): Promise<void> {
    await this.campoSenha.fill(senha);
  }

  async clicarEntrar(): Promise<void> {
    await this.botaoEntrar.click();
  }

  async realizarLogin(
    credenciais: Credenciais
  ): Promise<void> {
    await this.preencherEmail(credenciais.email);
    await this.preencherSenha(credenciais.senha);
    await this.clicarEntrar();
  }

  async verificarMensagemEmailInvalido(): Promise<void> {
    await expect(this.mensagemEmailInvalido).toBeVisible();
  }

  async verificarMensagemEmailObrigatorio(): Promise<void> {
    await expect(this.mensagemEmailObrigatorio).toBeVisible();
  }

  async verificarMensagemSenhaObrigatoria(): Promise<void> {
    await expect(this.mensagemSenhaObrigatoria).toBeVisible();
  }

  async verificarMensagemCredenciaisInvalidas(): Promise<void> {
    await expect(this.mensagemCredenciaisInvalidas).toBeVisible();
  }
}
