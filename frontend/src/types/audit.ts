export type AuditEntity = 'SECURITY' | 'USER' | 'CLIENT' | 'CLIENT_ADDRESS' | 'CATEGORY' | 'PRODUCT' | 'ORDER' | 'IMPORT' | 'SUPPLIER' | 'PURCHASE_ORDER' | 'PURCHASE_APPROVAL_RULE' | 'PAYABLE' | 'RECEIVABLE' | 'FISCAL_COMPANY' | 'FISCAL_IMPORT' | 'FISCAL_DOCUMENT' | 'FISCAL_ATTACHMENT' | 'RETURN_PROCESS' | 'RETURN_REASON' | 'RETURN_ATTACHMENT' | 'COST_CENTER' | 'CHART_ACCOUNT' | 'FINANCIAL_TITLE' | 'FINANCIAL_RECURRENCE' | 'BANK_ACCOUNT' | 'BANK_STATEMENT_IMPORT' | 'BANK_RECONCILIATION' | 'FINANCIAL_SNAPSHOT' | 'WAREHOUSE' | 'STOCK_TRANSFER' | 'STOCK_INVENTORY' | 'STOCK_ADJUSTMENT' | 'STOCK_COST' | 'COGS';
export type AuditAction = 'CREATE' | 'UPDATE' | 'ACTIVATE' | 'DEACTIVATE' | 'ROLE_CHANGE' | 'STATUS_CHANGE' | 'CANCEL' | 'IMPORT' | 'STOCK_ADJUSTMENT' | 'PRIMARY_CHANGE' | 'PASSWORD_CHANGE' | 'PASSWORD_RESET_REQUEST' | 'PASSWORD_RESET' | 'LOGIN_FAILURE' | 'PASSWORD_CHANGE_FAILURE' | 'PASSWORD_RESET_FAILURE' | 'RATE_LIMIT_BLOCK' | 'RECEIVE' | 'PAYMENT' | 'PAYMENT_REVERSAL' | 'COLLECTION' | 'COLLECTION_REVERSAL' | 'SUBMIT' | 'APPROVE' | 'REJECT' | 'LINK' | 'ATTACH' | 'REMOVE' | 'PHYSICAL_CONFIRM' | 'INSPECT' | 'SETTLE' | 'SUSPEND' | 'REACTIVATE' | 'CLOSE' | 'GENERATE' | 'RECONCILE' | 'RECONCILIATION_REVERSAL' | 'TRANSFER' | 'ADJUST' | 'SNAPSHOT';

export interface AuditActor {
  id: string;
  name: string;
  email: string;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  user: AuditActor | null;
  entityType: AuditEntity;
  entityId: string;
  action: AuditAction;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  createdAt: string;
}

export interface ListAuditParams {
  entityType?: AuditEntity;
  action?: AuditAction;
  userId?: string;
  entityId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
  sortOrder: 'asc' | 'desc';
}

export interface PaginatedAuditLogs {
  data: AuditLog[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export const AUDIT_ENTITY_LABELS: Record<AuditEntity, string> = {
  SECURITY: 'Segurança', USER: 'Usuário', CLIENT: 'Cliente', CLIENT_ADDRESS: 'Endereço do cliente', CATEGORY: 'Categoria', PRODUCT: 'Produto', ORDER: 'Pedido', IMPORT: 'Importação', SUPPLIER: 'Fornecedor', PURCHASE_ORDER: 'Pedido de compra', PURCHASE_APPROVAL_RULE: 'Regra de alçada', PAYABLE: 'Conta a pagar', RECEIVABLE: 'Conta a receber', FISCAL_COMPANY: 'Empresa fiscal', FISCAL_IMPORT: 'Importação fiscal', FISCAL_DOCUMENT: 'Documento fiscal', FISCAL_ATTACHMENT: 'Anexo fiscal', RETURN_PROCESS: 'Devolução ou troca', RETURN_REASON: 'Motivo de devolução', RETURN_ATTACHMENT: 'Anexo de devolução', COST_CENTER: 'Centro de custo', CHART_ACCOUNT: 'Plano de contas', FINANCIAL_TITLE: 'Lançamento financeiro', FINANCIAL_RECURRENCE: 'Recorrência financeira', BANK_ACCOUNT: 'Conta financeira', BANK_STATEMENT_IMPORT: 'Importação bancária', BANK_RECONCILIATION: 'Conciliação bancária', FINANCIAL_SNAPSHOT: 'Snapshot financeiro', WAREHOUSE: 'Depósito', STOCK_TRANSFER: 'Transferência de estoque', STOCK_INVENTORY: 'Inventário físico', STOCK_ADJUSTMENT: 'Ajuste de estoque', STOCK_COST: 'Custo de estoque', COGS: 'CMV',
};

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  CREATE: 'Criação', UPDATE: 'Atualização', ACTIVATE: 'Ativação', DEACTIVATE: 'Inativação',
  ROLE_CHANGE: 'Alteração de perfil', STATUS_CHANGE: 'Alteração de status', CANCEL: 'Cancelamento', IMPORT: 'Importação',
  STOCK_ADJUSTMENT: 'Ajuste de estoque', PRIMARY_CHANGE: 'Alteração de principal', PASSWORD_CHANGE: 'Alteração de senha',
  PASSWORD_RESET_REQUEST: 'Solicitação de redefinição', PASSWORD_RESET: 'Redefinição de senha',
  LOGIN_FAILURE: 'Falha de login', PASSWORD_CHANGE_FAILURE: 'Falha na troca de senha',
  PASSWORD_RESET_FAILURE: 'Falha na redefinição', RATE_LIMIT_BLOCK: 'Bloqueio temporário', RECEIVE: 'Recebimento', PAYMENT: 'Pagamento', PAYMENT_REVERSAL: 'Estorno de pagamento', COLLECTION: 'Recebimento financeiro', COLLECTION_REVERSAL: 'Estorno de recebimento', SUBMIT: 'Envio para aprovação', APPROVE: 'Aprovação', REJECT: 'Rejeição', LINK: 'Vinculação', ATTACH: 'Anexo incluído', REMOVE: 'Remoção lógica', PHYSICAL_CONFIRM: 'Confirmação física', INSPECT: 'Inspeção', SETTLE: 'Liquidação', SUSPEND: 'Suspensão', REACTIVATE: 'Reativação', CLOSE: 'Encerramento', GENERATE: 'Geração', RECONCILE: 'Conciliação', RECONCILIATION_REVERSAL: 'Reversão de conciliação', TRANSFER: 'Transferência', ADJUST: 'Ajuste financeiro', SNAPSHOT: 'Snapshot',
};
