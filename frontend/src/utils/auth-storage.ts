const TOKEN_KEY = 'qa-management:access-token';
const NOTICE_KEY = 'qa-management:auth-notice';

export const authStorage = {
  consumeLegacyToken(): string | null {
    const token = window.localStorage.getItem(TOKEN_KEY);
    window.localStorage.removeItem(TOKEN_KEY);
    return token;
  },

  clear(): void {
    window.localStorage.removeItem(TOKEN_KEY);
  },

  setNotice(message: string): void {
    window.sessionStorage.setItem(NOTICE_KEY, message);
  },

  consumeNotice(): string {
    const message = window.sessionStorage.getItem(NOTICE_KEY) ?? '';
    window.sessionStorage.removeItem(NOTICE_KEY);
    return message;
  },
};

