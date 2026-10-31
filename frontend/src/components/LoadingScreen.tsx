export function LoadingScreen() {
  return (
    <main className="loading-screen" aria-busy="true" aria-label="Carregando sessão">
      <span className="spinner" aria-hidden="true" />
      <p>Carregando...</p>
    </main>
  );
}

