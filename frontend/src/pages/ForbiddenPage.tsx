import { Link } from 'react-router-dom';

export function ForbiddenPage() {
  return (
    <main className="centered-page" data-testid="forbidden-page">
      <section className="message-card">
        <span className="status-code">403</span>
        <h1>Acesso negado</h1>
        <p>Você não possui permissão para acessar esta funcionalidade.</p>
        <Link to="/dashboard" className="button-link">Voltar ao dashboard</Link>
      </section>
    </main>
  );
}

