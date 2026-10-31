# language: pt
@Autenticacao
Funcionalidade: Autenticação de usuários
  Como usuário cadastrado no ERP
  Quero realizar minha autenticação
  Para acessar funcionalidades autorizadas

  Contexto: Acessar a página de login
    Dado que estou na página de login

  @smoke @positivo @CT-Login
  Cenário: Login com credenciais válidas
    Quando realizo login com o perfil "Admin"
    Então devo acessar o dashboard
    E devo visualizar a opção de sair

  @negativo @CT-Login
  Cenário: Login com credenciais inválidas
    Quando realizo login com o perfil "usuario_inexistente"
    Então devo visualizar a mensagem de credenciais inválidas

  @negativo @CT-Login
  Cenário: Login com senha inválidas
    Quando realizo login com o perfil "senha_incorreta"
    Então devo visualizar a mensagem de credenciais inválidas

  @negativo @CT-Login
  Cenário: Login com e-mail ausente
    Quando realizo login com o perfil "usuario_email_ausente"
    Então devo visualizar a mensagem de e-mail obrigatório

  @negativo @CT-Login
  Cenário: Login com senha ausente
    Quando realizo login com o perfil "usuario_senha_ausente"
    Então devo visualizar a mensagem de senha obrigatória

  @negativo @CT-Login
  Cenário: Login com e-mail inválido
    Quando realizo login com o perfil "usuario_com_email_invalido"
    Então devo visualizar a mensagem de e-mail inválido
