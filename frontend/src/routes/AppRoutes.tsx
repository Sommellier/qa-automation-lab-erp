import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { ClientDetailsPage } from '../pages/ClientDetailsPage';
import { AuditPage } from '../pages/AuditPage';
import { ClientFormPage } from '../pages/ClientFormPage';
import { ClientsPage } from '../pages/ClientsPage';
import { DashboardPage } from '../pages/DashboardPage';
import { ForbiddenPage } from '../pages/ForbiddenPage';
import { LoginPage } from '../pages/LoginPage';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage';
import { ResetPasswordPage } from '../pages/ResetPasswordPage';
import { NewOrderPage } from '../pages/NewOrderPage';
import { OrderDetailsPage } from '../pages/OrderDetailsPage';
import { OrdersPage } from '../pages/OrdersPage';
import { ProductDetailsPage } from '../pages/ProductDetailsPage';
import { ProductFormPage } from '../pages/ProductFormPage';
import { ProductsPage } from '../pages/ProductsPage';
import { StockPage } from '../pages/StockPage';
import { ReportsPage } from '../pages/ReportsPage';
import { ImportsPage } from '../pages/ImportsPage';
import { UserFormPage } from '../pages/UserFormPage';
import { UsersPage } from '../pages/UsersPage';
import { ProtectedRoute } from './ProtectedRoute';
import { RoleRoute } from './RoleRoute';
import { CategoriesPage } from '../pages/CategoriesPage';
import { CategoryFormPage } from '../pages/CategoryFormPage';
import { CategoryDetailsPage } from '../pages/CategoryDetailsPage';
import { ClientAddressFormPage } from '../pages/ClientAddressFormPage';
import { ProfilePage } from '../pages/ProfilePage';
import { SuppliersPage } from '../pages/SuppliersPage';
import { SupplierFormPage } from '../pages/SupplierFormPage';
import { PurchasesPage } from '../pages/PurchasesPage';
import { NewPurchasePage } from '../pages/NewPurchasePage';
import { PurchaseDetailsPage } from '../pages/PurchaseDetailsPage';
import { PurchaseApprovalsPage } from '../pages/PurchaseApprovalsPage';
import { ProductCostHistoryPage } from '../pages/ProductCostHistoryPage';
import { PayablesPage } from '../pages/PayablesPage';
import { ReceivablesPage } from '../pages/ReceivablesPage';
import { ClientStatementPage } from '../pages/ClientStatementPage';
import { FiscalDocumentsPage } from '../pages/FiscalDocumentsPage';
import { FiscalImportPage } from '../pages/FiscalImportPage';
import { FiscalDocumentDetailsPage } from '../pages/FiscalDocumentDetailsPage';
import { ReturnsPage } from '../pages/ReturnsPage';
import { NewReturnPage } from '../pages/NewReturnPage';
import { ReturnDetailsPage } from '../pages/ReturnDetailsPage';
import { FinancePage } from '../pages/FinancePage';
import { FinancialSetupPage } from '../pages/FinancialSetupPage';
import { FinancialTitleFormPage } from '../pages/FinancialTitleFormPage';
import { FinancialTitleDetailsPage } from '../pages/FinancialTitleDetailsPage';
import { FinancialRecurrencesPage } from '../pages/FinancialRecurrencesPage';
import { BankReconciliationPage } from '../pages/BankReconciliationPage';
import { AdvancedStockPage } from '../pages/AdvancedStockPage';
import { WarehousesPage } from '../pages/WarehousesPage';
import { StockTransfersPage } from '../pages/StockTransfersPage';
import { StockInventoriesPage } from '../pages/StockInventoriesPage';
import { StockAdjustmentsPage } from '../pages/StockAdjustmentsPage';
import { QuotesPage } from '../pages/QuotesPage';
import { NewQuotePage } from '../pages/NewQuotePage';
import { QuoteDetailsPage } from '../pages/QuoteDetailsPage';
import { SalesSettingsPage } from '../pages/SalesSettingsPage';
import { SalesCommissionsPage } from '../pages/SalesCommissionsPage';

function LegacyFinanceRedirect({ type }: { type: 'PAYABLE' | 'RECEIVABLE' }) {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/finance/titles/${type}/${id}` : '/finance'} replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/forbidden" element={<ForbiddenPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/clients/new" element={<RoleRoute roles={['ADMIN', 'ANALISTA']}><ClientFormPage /></RoleRoute>} />
        <Route path="/clients/:id/edit" element={<RoleRoute roles={['ADMIN', 'ANALISTA']}><ClientFormPage /></RoleRoute>} />
        <Route path="/clients/:id" element={<ClientDetailsPage />} />
        <Route path="/clients/:clientId/addresses/new" element={<RoleRoute roles={['ADMIN', 'ANALISTA']}><ClientAddressFormPage /></RoleRoute>} />
        <Route path="/clients/:clientId/addresses/:addressId/edit" element={<RoleRoute roles={['ADMIN', 'ANALISTA']}><ClientAddressFormPage /></RoleRoute>} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/new" element={<RoleRoute roles={['ADMIN', 'ANALISTA']}><ProductFormPage /></RoleRoute>} />
        <Route path="/products/:id/edit" element={<RoleRoute roles={['ADMIN', 'ANALISTA']}><ProductFormPage /></RoleRoute>} />
        <Route path="/products/:id/stock" element={<StockPage />} />
        <Route path="/products/:id" element={<ProductDetailsPage />} />
        <Route path="/stock" element={<AdvancedStockPage />} />
        <Route path="/stock/warehouses" element={<WarehousesPage />} />
        <Route path="/stock/transfers" element={<StockTransfersPage />} />
        <Route path="/stock/inventories" element={<StockInventoriesPage />} />
        <Route path="/stock/adjustments" element={<StockAdjustmentsPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/categories/new" element={<RoleRoute roles={['ADMIN', 'ANALISTA']}><CategoryFormPage /></RoleRoute>} />
        <Route path="/categories/:id/edit" element={<RoleRoute roles={['ADMIN', 'ANALISTA']}><CategoryFormPage /></RoleRoute>} />
        <Route path="/categories/:id" element={<CategoryDetailsPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/new" element={<RoleRoute roles={['ADMIN', 'ANALISTA']}><NewOrderPage /></RoleRoute>} />
        <Route path="/orders/:id" element={<OrderDetailsPage />} />
        <Route path="/quotes" element={<QuotesPage />} />
        <Route path="/quotes/new" element={<RoleRoute roles={['ADMIN', 'ANALISTA']}><NewQuotePage /></RoleRoute>} />
        <Route path="/quotes/:id/edit" element={<RoleRoute roles={['ADMIN', 'ANALISTA']}><NewQuotePage /></RoleRoute>} />
        <Route path="/quotes/settings" element={<RoleRoute roles={['ADMIN']}><SalesSettingsPage /></RoleRoute>} />
        <Route path="/quotes/commissions" element={<SalesCommissionsPage />} />
        <Route path="/quotes/:id" element={<QuoteDetailsPage />} />
        <Route path="/suppliers" element={<SuppliersPage />} />
        <Route path="/suppliers/new" element={<RoleRoute roles={['ADMIN', 'ANALISTA']}><SupplierFormPage /></RoleRoute>} />
        <Route path="/suppliers/:id/edit" element={<RoleRoute roles={['ADMIN', 'ANALISTA']}><SupplierFormPage /></RoleRoute>} />
        <Route path="/purchases" element={<PurchasesPage />} />
        <Route path="/purchases/new" element={<RoleRoute roles={['ADMIN', 'ANALISTA']}><NewPurchasePage /></RoleRoute>} />
        <Route path="/purchases/approvals" element={<PurchaseApprovalsPage />} />
        <Route path="/purchases/:id" element={<PurchaseDetailsPage />} />
        <Route path="/products/:id/cost-history" element={<ProductCostHistoryPage />} />
        <Route path="/finance/payables" element={<PayablesPage />} />
        <Route path="/finance/payables/:id" element={<LegacyFinanceRedirect type="PAYABLE" />} />
        <Route path="/finance/receivables" element={<ReceivablesPage />} />
        <Route path="/finance/receivables/:id" element={<LegacyFinanceRedirect type="RECEIVABLE" />} />
        <Route path="/finance/clients/:clientId/statement" element={<ClientStatementPage />} />
        <Route path="/finance" element={<FinancePage />} />
        <Route path="/finance/setup" element={<RoleRoute roles={['ADMIN']}><FinancialSetupPage /></RoleRoute>} />
        <Route path="/finance/titles/new" element={<RoleRoute roles={['ADMIN', 'ANALISTA']}><FinancialTitleFormPage /></RoleRoute>} />
        <Route path="/finance/titles/:type/:id" element={<FinancialTitleDetailsPage />} />
        <Route path="/finance/recurrences" element={<FinancialRecurrencesPage />} />
        <Route path="/finance/reconciliation" element={<BankReconciliationPage />} />
        <Route path="/fiscal" element={<FiscalDocumentsPage />} />
        <Route path="/fiscal/import" element={<RoleRoute roles={['ADMIN', 'ANALISTA']}><FiscalImportPage /></RoleRoute>} />
        <Route path="/fiscal/documents/:id" element={<FiscalDocumentDetailsPage />} />
        <Route path="/returns" element={<ReturnsPage />} />
        <Route path="/returns/new" element={<RoleRoute roles={['ADMIN', 'ANALISTA']}><NewReturnPage /></RoleRoute>} />
        <Route path="/returns/:id" element={<ReturnDetailsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/imports" element={<RoleRoute roles={['ADMIN', 'ANALISTA']}><ImportsPage /></RoleRoute>} />
        <Route path="/users" element={<RoleRoute roles={['ADMIN']}><UsersPage /></RoleRoute>} />
        <Route path="/users/new" element={<RoleRoute roles={['ADMIN']}><UserFormPage /></RoleRoute>} />
        <Route path="/users/:id/edit" element={<RoleRoute roles={['ADMIN']}><UserFormPage /></RoleRoute>} />
        <Route path="/audit" element={<RoleRoute roles={['ADMIN']}><AuditPage /></RoleRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
