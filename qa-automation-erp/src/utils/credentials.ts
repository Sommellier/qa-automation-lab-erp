
export const PERFIS_TESTE = [
  'Admin',
  'Analista',
  'Visualizador',
  'usuario_inexistente',
  'senha_incorreta',
  'usuario_email_ausente',
  'usuario_senha_ausente',
  'usuario_com_email_invalido'
] as const;

export type PerfilTeste = typeof PERFIS_TESTE[number];

export interface Credenciais {
  email: string;
  senha: string;
}

// Validação dos perfis
export function validarPerfilTeste(
  perfil: string
): asserts perfil is PerfilTeste {
  if (
    !PERFIS_TESTE.some(
      perfilValido => perfilValido === perfil
    )
  ) {
    throw new Error(
      `Perfil de teste não reconhecido: ${perfil}`
    );
  }
}

// Obtenção das variáveis de ambiente
function obterVariavel(nome: string): string {
  const valor = process.env[nome];

  if (!valor) {
    throw new Error(
      `Variável de ambiente obrigatória: ${nome}`
    );
  }

  return valor;
}

// Obtenção das credenciais
export function obterCredenciais(
  perfil: PerfilTeste
): Credenciais {
  switch (perfil) {
    case 'Admin':
      return {
        email: obterVariavel('QA_ADMIN_EMAIL'),
        senha: obterVariavel('QA_ADMIN_PASSWORD')
      };

    case 'Analista':
      return {
        email: obterVariavel('QA_ANALISTA_EMAIL'),
        senha: obterVariavel('QA_ANALISTA_PASSWORD')
      };

    case 'Visualizador':
      return {
        email: obterVariavel('QA_VISUALIZADOR_EMAIL'),
        senha: obterVariavel('QA_VISUALIZADOR_PASSWORD')
      };

    case 'usuario_inexistente':
      return {
        email: obterVariavel('QA_INVALID_USER_EMAIL'),
        senha: obterVariavel('QA_INVALID_USER_PASSWORD')
      };

    case 'senha_incorreta':
      return {
        email: obterVariavel('QA_WRONG_PASSWORD_EMAIL'),
        senha: obterVariavel('QA_WRONG_PASSWORD')
      };

    case 'usuario_email_ausente':
      return {
        email: '',
        senha: 'senha-ficticia'
      }

    case 'usuario_senha_ausente':
      return {
        email: 'email_ficticio@gmail.com',
        senha: ''
      }
    case 'usuario_com_email_invalido':
      return {
        email: 'teste@teste',
        senha: 'senha-ficticia'
      }
  }
}
