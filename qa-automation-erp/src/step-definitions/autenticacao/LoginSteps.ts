
import { Given, Then, When } from '@cucumber/cucumber';
import { CustomWorld } from '../../support/CustomWorld';
import { LoginPage } from '../../pages/autenticacao/LoginPage';
import {
  obterCredenciais,
  validarPerfilTeste
} from '../../utils/credentials';


Given('que estou na página de login',
  async function (this: CustomWorld): Promise<void> {
    await this.pages.obter(LoginPage).acessar();
  }
);

When('realizo login com o perfil {string}',
  async function (this: CustomWorld, perfil: string): Promise<void> {
    validarPerfilTeste(perfil);
    const credenciais = obterCredenciais(perfil);
    await this.pages.obter(LoginPage).realizarLogin(credenciais);
  }
);

// Validações
Then('devo visualizar a mensagem de credenciais inválidas',
  async function (this: CustomWorld): Promise<void> {
    await this.pages.obter(LoginPage).verificarMensagemCredenciaisInvalidas();
  }
);

Then('devo visualizar a mensagem de e-mail obrigatório',
  async function (this: CustomWorld): Promise<void> {
    await this.pages.obter(LoginPage).verificarMensagemEmailObrigatorio();
  }
);


Then('devo visualizar a mensagem de senha obrigatória',
  async function (this: CustomWorld): Promise<void> {
    await this.pages.obter(LoginPage).verificarMensagemSenhaObrigatoria();
  }
);

Then('devo visualizar a mensagem de e-mail inválido',
  async function (this: CustomWorld): Promise<void> {
    await this.pages.obter(LoginPage).verificarMensagemEmailInvalido();
  }
);