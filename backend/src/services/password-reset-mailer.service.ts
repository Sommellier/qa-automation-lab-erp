import { env } from '../config/env.js';

export interface PasswordResetMail {
  to: string;
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export interface PasswordResetMailer {
  sendReset(mail: PasswordResetMail): Promise<void>;
}

export class DevelopmentPasswordResetMailer implements PasswordResetMailer {
  async sendReset(mail: PasswordResetMail): Promise<void> {
    console.info(
      `[recuperacao-de-senha] Destinatário: ${mail.to}\n`
      + `Olá, ${mail.name}. Link válido por ${mail.expiresInMinutes} minutos:\n${mail.resetUrl}`,
    );
  }
}

export class DisabledPasswordResetMailer implements PasswordResetMailer {
  async sendReset(): Promise<void> {
    // Adaptador intencionalmente sem entrega. Substitua-o por um provedor no ambiente hospedado.
  }
}

export function createPasswordResetMailer(): PasswordResetMailer {
  if (env.NODE_ENV === 'development' && env.PASSWORD_RESET_MAIL_MODE === 'console') {
    return new DevelopmentPasswordResetMailer();
  }
  return new DisabledPasswordResetMailer();
}
