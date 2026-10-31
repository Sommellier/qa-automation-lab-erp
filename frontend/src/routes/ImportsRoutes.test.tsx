import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../contexts/AuthContext';
import { authApi } from '../services/auth.service';
import { importsApi } from '../services/import.service';
import type { UserRole } from '../types/auth';
import type { ImportJob } from '../types/import';
import { AppRoutes } from './AppRoutes';

vi.mock('../services/auth.service', () => ({ authApi: { login: vi.fn(), me: vi.fn(), logout: vi.fn() } }));
vi.mock('../services/import.service', () => ({ importsApi: { validate: vi.fn(), execute: vi.fn(), template: vi.fn(), list: vi.fn(), getById: vi.fn() } }));
const auth = vi.mocked(authApi); const imports = vi.mocked(importsApi);
const accountDetails = { active: true, createdAt: '2026-09-26T12:00:00.000Z', updatedAt: '2026-09-26T12:00:00.000Z' };
const job: ImportJob = { id: 'job-1', type: 'CLIENTS', fileName: 'clientes.csv', totalRows: 3, validRows: 2, invalidRows: 1, importedRows: 2, status: 'COMPLETED', errors: [{ line: 3, errors: [{ field: 'email', code: 'INVALID_EMAIL', message: 'Informe um e-mail válido.', value: 'ruim' }] }], createdById: 'admin', createdBy: { id: 'admin', name: 'Administrador', email: 'admin@teste.com' }, createdAt: '2026-09-27T17:00:00.000Z', completedAt: '2026-09-27T17:00:01.000Z' };

function authenticate(role: UserRole) { window.localStorage.setItem('qa-management:access-token', `${role}-token`); auth.me.mockResolvedValue({ id: role, name: role, email: `${role.toLowerCase()}@teste.com`, role, ...accountDetails }); }
function renderImports() { render(<MemoryRouter initialEntries={['/imports']}><AuthProvider><AppRoutes /></AuthProvider></MemoryRouter>); }

describe('importações CSV', () => {
  beforeEach(() => {
    window.localStorage.clear(); vi.resetAllMocks(); auth.logout.mockResolvedValue(undefined);
    imports.validate.mockResolvedValue({ jobId: 'job-1', totalRows: 3, validRows: 2, invalidRows: 1, errors: job.errors ?? [] });
    imports.execute.mockResolvedValue({ jobId: 'job-1', totalRows: 3, imported: 2, rejected: 1, errors: job.errors ?? [] });
    imports.list.mockResolvedValue({ data: [job], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }); imports.getById.mockResolvedValue(job);
    imports.template.mockResolvedValue({ blob: new Blob(['csv'], { type: 'text/csv' }), fileName: 'modelo_clientes.csv' });
  });

  it.each<UserRole>(['ADMIN', 'ANALISTA'])('%s acessa a página e vê o menu', async (role) => {
    authenticate(role); renderImports(); expect(await screen.findByTestId('imports-page')).toBeInTheDocument(); expect(screen.getByRole('link', { name: 'Importações' })).toBeInTheDocument(); expect(screen.getByTestId('clients-import-tab')).toHaveAttribute('aria-selected', 'true');
  });

  it('VISUALIZADOR não vê o menu e recebe a página de acesso negado', async () => {
    authenticate('VISUALIZADOR'); renderImports(); expect(await screen.findByTestId('forbidden-page')).toBeInTheDocument(); expect(screen.queryByRole('link', { name: 'Importações' })).not.toBeInTheDocument(); expect(imports.list).not.toHaveBeenCalled();
  });

  it('valida, mostra múltiplos indicadores e só então executa a importação parcial', async () => {
    authenticate('ADMIN'); renderImports(); const user = userEvent.setup(); const file = new File(['name;document;email;phone;active'], 'clientes.csv', { type: 'text/csv' });
    await user.upload(await screen.findByTestId('import-file'), file); await user.click(screen.getByTestId('import-validate'));
    expect(await screen.findByTestId('import-total')).toHaveTextContent('3'); expect(screen.getByTestId('import-valid')).toHaveTextContent('2'); expect(screen.getByTestId('import-invalid')).toHaveTextContent('1'); expect(screen.getByTestId('import-errors-table')).toHaveTextContent('Informe um e-mail válido.'); expect(imports.execute).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('import-execute')); await waitFor(() => expect(imports.execute).toHaveBeenCalledWith('CLIENTS', 'ADMIN-token', file, 'job-1')); expect(await screen.findByTestId('import-result')).toHaveTextContent(/Importação concluída/i);
  });

  it('alterna para Produtos e mostra o contrato CSV correspondente', async () => {
    authenticate('ANALISTA'); renderImports(); const user = userEvent.setup(); await user.click(await screen.findByTestId('products-import-tab'));
    expect(screen.getByRole('heading', { name: 'Importar Produtos' })).toBeInTheDocument(); expect(screen.getByText(/name, sku, price, stock, category, active/)).toBeInTheDocument(); expect(screen.getByText(/description/)).toBeInTheDocument();
  });

  it('carrega histórico e abre detalhes com erros como texto', async () => {
    authenticate('ADMIN'); renderImports(); const user = userEvent.setup(); await user.click(await screen.findByTestId('imports-history-tab')); expect(await screen.findByTestId('import-history-table')).toHaveTextContent('clientes.csv'); await user.click(screen.getByRole('button', { name: 'Ver detalhes' }));
    expect(await screen.findByRole('dialog', { name: 'Detalhes da importação' })).toHaveTextContent('Administrador'); expect(screen.getByTestId('import-errors-table')).toHaveTextContent('ruim');
  });

  it('baixa o template pela ação dedicada', async () => {
    authenticate('ADMIN'); const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:modelo'); const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined); const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined); renderImports(); const user = userEvent.setup(); await user.click(await screen.findByTestId('import-template-download'));
    await waitFor(() => expect(imports.template).toHaveBeenCalledWith('CLIENTS', 'ADMIN-token')); expect(createUrl).toHaveBeenCalled(); expect(click).toHaveBeenCalled(); expect(revokeUrl).toHaveBeenCalledWith('blob:modelo');
  });
});
