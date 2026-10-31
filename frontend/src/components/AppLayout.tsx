import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const orderDetailsMatch = location.pathname.match(/^\/orders\/([^/]+)$/);

  async function handleLogout(): Promise<void> {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <NavLink to="/dashboard" className="brand-inline" aria-label="QA Management - Dashboard">
          <span className="brand-mark brand-mark-small" aria-hidden="true">QM</span>
          <span>QA Management</span>
        </NavLink>

        <nav className="main-nav" aria-label="Navegação principal">
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/clients">Clientes</NavLink>
          <NavLink to="/products">Produtos</NavLink>
          <NavLink to="/stock">Estoque</NavLink>
          <NavLink to="/categories">Categorias</NavLink>
          <NavLink to="/orders">Pedidos</NavLink>
          <NavLink to="/quotes">Orçamentos</NavLink>
          <NavLink to="/suppliers">Fornecedores</NavLink>
          <NavLink to="/purchases">Compras</NavLink>
          <NavLink to="/finance">Financeiro</NavLink>
          <NavLink to="/fiscal">Fiscal</NavLink>
          <NavLink to="/returns">Devoluções</NavLink>
          <NavLink to="/reports">Relatórios</NavLink>
          {(user?.role === 'ADMIN' || user?.role === 'ANALISTA') && <NavLink to="/imports">Importações</NavLink>}
          {user?.role === 'ADMIN' && <NavLink to="/users">Usuários</NavLink>}
          {user?.role === 'ADMIN' && <NavLink to="/audit">Auditoria</NavLink>}
        </nav>

        <div className="header-actions">
          {orderDetailsMatch && (
            <NavLink to={`/fiscal?orderId=${encodeURIComponent(orderDetailsMatch[1])}`} className="profile-link">
              Documentos fiscais da venda
            </NavLink>
          )}
          <span className="header-user">{user?.name}</span>
          <NavLink to="/profile" className="profile-link" data-testid="profile-link">Meu Perfil</NavLink>
          <button
            type="button"
            className="secondary-button"
            data-testid="logout-button"
            onClick={() => void handleLogout()}
          >
            Sair
          </button>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
