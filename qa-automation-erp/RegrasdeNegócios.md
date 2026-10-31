# QA Management

Base full stack para um sistema de gestão com autenticação, perfil próprio, RBAC, usuários, clientes e seus endereços, produtos, fornecedores, compras com aprovação por alçada, financeiro avançado, pedidos, estoque, documentos fiscais importados por XML, Dashboard, auditoria, relatórios e importação em lote de clientes e produtos via CSV.

## Arquitetura

O repositório usa npm workspaces e mantém frontend e backend independentes. No backend, as responsabilidades estão separadas em rotas, controllers, services e repositories. No frontend, a sessão fica centralizada no `AuthProvider`; `ProtectedRoute` protege páginas privadas e `RoleRoute` restringe formulários conforme o perfil.

A Gestão de Usuários oferece pesquisa parcial por nome/e-mail, filtros de perfil e status, ordenação validada, paginação, criação, edição e ativação/inativação lógica. O service impede inativar ou rebaixar o último administrador ativo.

A Gestão de Clientes oferece consulta individual, pesquisa parcial por nome/documento/e-mail, filtro de status, ordenação validada, paginação, cadastro, edição e ativação/inativação lógica. Todos os perfis podem consultar; `ADMIN` e `ANALISTA` podem criar e editar; somente `ADMIN` pode alterar status.

Cada cliente pode ter zero ou mais endereços estruturados. O primeiro endereço ativo torna-se principal automaticamente. Promoções de principal são serializadas por cliente, auditadas e protegidas também por índice parcial único no PostgreSQL. Clientes inativos permitem consulta, mas bloqueiam toda mutação de endereço.

A Gestão de Produtos oferece consulta individual, pesquisa parcial por nome/SKU, filtros de categoria e status, ordenação validada, paginação, cadastro, edição e ativação/inativação lógica. Preços usam `DECIMAL(12,2)` no PostgreSQL, sem `Float`; estoque zero é válido e aparece como “Sem estoque”. Todos os perfis podem consultar; `ADMIN` e `ANALISTA` podem criar e editar; somente `ADMIN` pode alterar status.

A Gestão de Pedidos relaciona `Order`, `OrderItem`, `Client` e `Product`. A criação recalcula preços no backend, guarda snapshots de nome/SKU/preço, reserva estoque com atualização condicional e executa tudo em transação `Serializable`, com nova tentativa em conflitos. A numeração amigável (`PED-000001`) vem de uma sequence do PostgreSQL, adequada a concorrência e com possibilidade normal de lacunas. O fluxo permitido é `PENDING -> CONFIRMED -> PROCESSING -> COMPLETED`; apenas `ADMIN` cancela pedidos pendentes ou confirmados, devolvendo o estoque na mesma transação.

A Gestão de Fornecedores e Compras relaciona `Supplier`, `PurchaseOrder`, itens, recebimentos e produtos. O pedido guarda snapshots de nome, SKU, custo unitário e subtotal. Cada recebimento parcial ou total é serializado e atômico: bloqueia a compra, valida o saldo pendente, registra o documento, incrementa o estoque, cria uma movimentação `PURCHASE_RECEIPT`, atualiza as quantidades recebidas e audita a operação na mesma transação. O histórico de custos usa os recebimentos efetivos, preservando fornecedor, compra, documento, quantidade e custo da época.

A aprovação de compras é um fluxo separado do recebimento. A compra passa por `DRAFT`, `PENDING_APPROVAL`, `APPROVED` ou `REJECTED`; regras por perfil definem a alçada máxima e somente uma compra aprovada pode ser recebida. Submissões, aprovações e rejeições preservam comentário, responsável, data e auditoria.

Contas a Pagar nasce do recebimento, e não apenas da emissão da compra. A condição negociada define de 1 a 24 parcelas, prazo do primeiro vencimento e intervalo. O backend divide centavos sem perda, gera títulos `CP-000001` e mantém pagamentos `PAG-000001` imutáveis, com estorno explícito. Pagamentos parciais, quitação, cancelamento e estorno usam bloqueio de linha e transação serializável. O status “Atrasado” é derivado da data corrente, evitando atualização agendada ou estado temporal desatualizado.

Contas a Receber fecha o ciclo da venda: a condição de pagamento é definida no pedido, mas os títulos `CR-000001` surgem somente na transição atômica para `COMPLETED`. Recebimentos `RCB-000001` podem ser parciais ou totais, e estornos preservam o lançamento original. O extrato por cliente consolida faturado, recebido, aberto e atrasado; o painel combina as entradas com o Contas a Pagar para produzir fluxo de caixa líquido diário.

O Dashboard consulta um endpoint agregado e exibe clientes/produtos ativos, falta e baixo estoque, pedidos por status, receita concluída, cinco pedidos recentes e pedidos por dia nos últimos 30 dias. O backend usa `count`, `groupBy`, `aggregate`, consultas com `select` e agregação SQL diária; não carrega tabelas inteiras nem usa dados mockados. Timestamps são persistidos como UTC e a série diária é agrupada explicitamente em UTC; datas de pedidos são apresentadas no frontend em `America/Sao_Paulo`.

O histórico de auditoria registra, no PostgreSQL, mutações concluídas em usuários, clientes, endereços, categorias, produtos e pedidos. Um serviço central sanitiza recursivamente os dados e elimina senhas, hashes, tokens, segredos e credenciais. O autor sempre vem do JWT validado; o frontend não informa `userId`. A mutação principal e o `AuditLog` usam a mesma transação, inclusive na reserva/devolução de estoque e promoção de endereço principal, de modo que falha na auditoria provoca rollback integral. Leituras e os próprios registros de auditoria não geram eventos.

Os timestamps de auditoria são persistidos em UTC e apresentados no horário local do navegador. A consulta é paginada e aplica filtros no banco com `select` restrito. Os índices compostos combinam cada seletor principal (`entityType`, `entityId`, `userId` e `action`) com `createdAt`, além do índice temporal, para favorecer histórico recente e filtros sem criar combinações excessivas.

O módulo de Relatórios disponibiliza visões de Clientes, Produtos, Pedidos e Faturamento para todos os perfis autenticados. Listas, filtros, contagens, agrupamentos e somas são executados no PostgreSQL/Prisma; o frontend recebe dados paginados e agregados. Pedidos e Faturamento usam, por padrão, os últimos 30 dias em UTC. `dateFrom` representa `00:00:00.000Z` e `dateTo`, `23:59:59.999Z`.

Faturamento realizado considera exclusivamente pedidos `COMPLETED`. O ticket médio financeiro é a média dos totais concluídos. O indicador de cancelamentos é operacional e não representa perda contábil. Estoque baixo reutiliza o limite do Dashboard (`stock <= 5`), e o valor estimado é calculado no banco como `SUM(price * stock)` usando `Decimal`.

O módulo de Importações aceita exclusivamente CSV UTF-8 separado por `;`, com ou sem BOM. O backend usa `multer` em memória, limitado a 5 MB, e `csv-parse`, limitado a 5.000 registros. Cabeçalhos são mapeados por nome e podem estar em qualquer ordem; colunas desconhecidas são rejeitadas e linhas vazias são ignoradas. Clientes exigem `name`, `document`, `email` e `active`, com `phone` opcional. Produtos exigem `name`, `sku`, `price`, `stock`, `category` e `active`, com `description` opcional. Valor `active` vazio assume `true`, igual ao cadastro manual.

O módulo Fiscal e Documentos importa exclusivamente XML de NF-e modelo 55. A prévia valida XML, chave de acesso, estrutura e duplicidade antes da confirmação; o arquivo original, itens, totais, tributos declarados e metadados de protocolo são preservados. Fornecedor, cliente, produtos, compra, venda e títulos financeiros podem ser associados de forma explícita e auditada. Esses vínculos são referenciais: não alteram estoque, status de pedido ou saldos financeiros.

O Financeiro Avançado reutiliza os títulos de contas a pagar e a receber como núcleo único, sem duplicar saldos. Plano de contas, centros de custo, rateios, recorrências e ajustes classificam o título; um serviço transacional exclusivo centraliza liquidação, estorno e movimentação da conta financeira. Importações bancárias, transações de extrato e conciliações permanecem em entidades próprias, com vínculos muitos-para-muitos e reversão auditável.

A DRE gerencial usa a data de competência e a natureza configurada no plano de contas. O fluxo de caixa previsto usa vencimentos e recorrências, enquanto o realizado deriva exclusivamente de movimentações efetivas das contas financeiras. Transferências entre contas próprias criam débito e crédito vinculados: aparecem por conta, mas são neutras no caixa consolidado e não afetam a DRE. Títulos históricos sem classificação aparecem em uma fila de revisão, sem classificação retroativa arbitrária.

A emissão de notas fiscais não pertence a este módulo. Não há certificado digital, assinatura, cálculo tributário, transmissão, cancelamento ou consulta automática à SEFAZ. A situação fiscal exibida é a declarada no XML importado e não representa validação on-line.

A validação e a execução são operações separadas. A execução recebe novamente o arquivo, revalida as regras e duplicidades diretamente no PostgreSQL, persiste apenas linhas válidas com `createMany` e conclui tudo em uma única transação. Falhas inesperadas provocam rollback. Duplicidades são consultadas em lote, evitando N+1. Cada validação cria um `ImportJob` com resumo e erros em JSON; o arquivo original não é armazenado. A execução gera somente um `AuditLog` agregado, sem conteúdo integral do CSV e sem um evento por linha.

Os JWTs continuam stateless, mas não ficam mais acessíveis ao JavaScript: access e refresh token são enviados em cookies `HttpOnly`, `SameSite=Lax` e `Secure` em produção. O access token dura 15 minutos e o refresh, 8 horas por padrão; a renovação rotaciona os dois e também o token CSRF. Cada requisição protegida compara `User.tokenVersion`, portanto alteração ou redefinição de senha invalida imediatamente todas as sessões anteriores sem Redis ou blacklist.

## Pré-requisitos

- Node.js 20.19 ou superior
- npm 10 ou superior
- PostgreSQL 15 ou superior, ou Docker com Compose

## Configuração rápida

1. Instale as dependências na raiz:

   ```bash
   npm install
   ```

2. Copie os arquivos de ambiente:

   ```powershell
   Copy-Item backend/.env.example backend/.env
   Copy-Item frontend/.env.example frontend/.env
   ```

3. Em `backend/.env`, substitua `SUA_SENHA` pela senha local do PostgreSQL e troque `JWT_SECRET` por um segredo aleatório de pelo menos 32 caracteres. Para desenvolvimento, mantenha `PASSWORD_RESET_MAIL_MODE=console`: o link de recuperação será exibido somente no terminal do backend. Esse arquivo é ignorado pelo Git.

## PostgreSQL

### Opção A: Docker

```bash
docker compose up -d
```

Isso disponibiliza o banco `qa_management` em `localhost:5432`, com usuário `qa_management` e senha `qa_management_dev`.

Ao usar o Compose, ajuste a linha correspondente no `backend/.env`:

```env
DATABASE_URL="postgresql://qa_management:qa_management_dev@localhost:5432/qa_management?schema=public"
```

### Opção B: instalação local

Crie um banco e um usuário no PostgreSQL:

```sql
CREATE USER qa_management WITH PASSWORD 'qa_management_dev';
CREATE DATABASE qa_management OWNER qa_management;
```

Para uma instalação local com o superusuário padrão, use `postgres` como usuário e informe sua senha somente no `backend/.env`. Ajuste host, porta ou credenciais conforme sua instalação.

## Migration, Prisma e seed

Com o PostgreSQL em execução:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

Em CI ou produção, aplique migrations versionadas com:

```bash
npm run db:deploy -w backend
```

O seed é idempotente: executar novamente atualiza os três usuários, os quatro clientes, quatro endereços, os cinco produtos, dois fornecedores e cinco pedidos de desenvolvimento. Há clientes, produtos e fornecedores ativos e inativos, clientes com um ou vários endereços, tipos variados, endereço inativo, um produto com estoque zero e uma amostra para cada status de pedido. As sequences são sincronizadas com o maior número existente sem serem reduzidas.

## Execução

Inicie frontend e backend juntos:

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3333
- Health check: http://localhost:3333/health

Também é possível iniciar separadamente com `npm run dev -w backend` e `npm run dev -w frontend`.

## Credenciais locais

| Perfil | E-mail | Senha |
|---|---|---|
| ADMIN | `admin@qamgmt.local` | `Admin@123` |
| ANALISTA | `analista@qamgmt.local` | `Analista@123` |
| VISUALIZADOR | `visualizador@qamgmt.local` | `Visualizador@123` |

Use estas credenciais somente no ambiente local. O seed armazena apenas hashes bcrypt com custo 12.

## API

| Método | Rota | Autenticação | Descrição |
|---|---|---|---|
| `POST` | `/api/auth/login` | Não | Valida credenciais, retorna o usuário público e grava os cookies de sessão |
| `POST` | `/api/auth/forgot-password` | Não | Emite um link de uso único e sempre retorna uma resposta genérica |
| `POST` | `/api/auth/reset-password` | Não | Consome o link, redefine a senha e invalida todos os JWTs anteriores |
| `POST` | `/api/auth/refresh` | Refresh cookie + CSRF | Rotaciona a sessão curta sem expor tokens ao JavaScript |
| `GET` | `/api/auth/me` | Cookie HttpOnly ou Bearer | Restaura a sessão e retorna perfil, status e timestamps do usuário atual |
| `POST` | `/api/auth/logout` | Cookie + CSRF ou Bearer | Expira os três cookies da sessão com status 204 |
| `PATCH` | `/api/profile` | Cookie + CSRF ou Bearer | Atualiza somente o nome do próprio usuário |
| `PATCH` | `/api/profile/password` | Cookie + CSRF ou Bearer | Valida a senha atual, troca o hash e invalida tokens anteriores |
| `GET` | `/api/users` | ADMIN | Lista usuários com pesquisa, filtros, ordenação e paginação |
| `GET` | `/api/users/:id` | ADMIN | Retorna um usuário para edição |
| `POST` | `/api/users` | ADMIN | Cria um usuário com senha bcrypt |
| `PATCH` | `/api/users/:id` | ADMIN | Atualiza nome, e-mail, perfil e/ou status |
| `PATCH` | `/api/users/:id/status` | ADMIN | Ativa ou inativa um usuário |
| `GET` | `/api/clients` | ADMIN, ANALISTA, VISUALIZADOR | Lista clientes com pesquisa, filtro, ordenação e paginação |
| `GET` | `/api/clients/:id` | ADMIN, ANALISTA, VISUALIZADOR | Retorna os detalhes de um cliente |
| `POST` | `/api/clients` | ADMIN, ANALISTA | Cria um cliente |
| `PATCH` | `/api/clients/:id` | ADMIN, ANALISTA | Atualiza os dados cadastrais de um cliente |
| `PATCH` | `/api/clients/:id/status` | ADMIN | Ativa ou inativa um cliente |
| `GET` | `/api/clients/:clientId/addresses` | ADMIN, ANALISTA, VISUALIZADOR | Lista endereços com filtros, ordenação e paginação |
| `GET` | `/api/clients/:clientId/addresses/:addressId` | ADMIN, ANALISTA, VISUALIZADOR | Retorna um endereço vinculado ao cliente |
| `POST` | `/api/clients/:clientId/addresses` | ADMIN, ANALISTA | Cria um endereço; o primeiro ativo é principal |
| `PATCH` | `/api/clients/:clientId/addresses/:addressId` | ADMIN, ANALISTA | Atualiza os campos estruturados do endereço |
| `PATCH` | `/api/clients/:clientId/addresses/:addressId/status` | ADMIN | Ativa ou inativa um endereço |
| `PATCH` | `/api/clients/:clientId/addresses/:addressId/primary` | ADMIN, ANALISTA | Promove um endereço ativo a principal |
| `GET` | `/api/products` | ADMIN, ANALISTA, VISUALIZADOR | Lista produtos com pesquisa, filtros, ordenação e paginação |
| `GET` | `/api/products/:id` | ADMIN, ANALISTA, VISUALIZADOR | Retorna os detalhes de um produto |
| `POST` | `/api/products` | ADMIN, ANALISTA | Cria um produto e normaliza o SKU para maiúsculas |
| `PATCH` | `/api/products/:id` | ADMIN, ANALISTA | Atualiza os dados comerciais de um produto |
| `PATCH` | `/api/products/:id/status` | ADMIN | Ativa ou inativa um produto |
| `GET` | `/api/suppliers` | ADMIN, ANALISTA, VISUALIZADOR | Lista fornecedores com pesquisa, filtros, ordenação e paginação |
| `GET` | `/api/suppliers/:id` | ADMIN, ANALISTA, VISUALIZADOR | Retorna os detalhes de um fornecedor |
| `POST` | `/api/suppliers` | ADMIN, ANALISTA | Cria um fornecedor |
| `PATCH` | `/api/suppliers/:id` | ADMIN, ANALISTA | Atualiza os dados cadastrais de um fornecedor |
| `PATCH` | `/api/suppliers/:id/status` | ADMIN | Ativa ou inativa um fornecedor |
| `GET` | `/api/purchases` | ADMIN, ANALISTA, VISUALIZADOR | Lista compras com filtros e paginação |
| `GET` | `/api/purchases/:id` | ADMIN, ANALISTA, VISUALIZADOR | Retorna a compra, seus itens e recebimentos |
| `POST` | `/api/purchases` | ADMIN, ANALISTA | Cria uma compra pendente com snapshots de custo |
| `GET` | `/api/purchases/approval-rules` | Todos autenticados | Lista as alçadas de aprovação por perfil |
| `PATCH` | `/api/purchases/approval-rules/:role` | ADMIN | Atualiza o limite de aprovação de um perfil |
| `POST` | `/api/purchases/:id/submit` | ADMIN, ANALISTA | Submete uma compra em rascunho para aprovação |
| `POST` | `/api/purchases/:id/approve` | ADMIN, ANALISTA | Aprova uma compra dentro da alçada do responsável |
| `POST` | `/api/purchases/:id/reject` | ADMIN, ANALISTA | Rejeita uma compra aguardando aprovação, com justificativa |
| `POST` | `/api/purchases/:id/receipts` | ADMIN, ANALISTA | Registra recebimento e entrada atômica no estoque |
| `POST` | `/api/purchases/:id/cancel` | ADMIN | Cancela saldo ainda pendente sem estornar recebimentos concluídos |
| `GET` | `/api/purchases/cost-history/:productId` | ADMIN, ANALISTA, VISUALIZADOR | Lista o histórico paginado de custos efetivamente recebidos |
| `GET` | `/api/payables` | ADMIN, ANALISTA, VISUALIZADOR | Lista contas a pagar, incluindo filtro temporal de atrasos |
| `GET` | `/api/payables/summary` | ADMIN, ANALISTA, VISUALIZADOR | Retorna saldos, atrasos, pagamentos do mês e previsão diária |
| `GET` | `/api/payables/:id` | ADMIN, ANALISTA, VISUALIZADOR | Retorna título, origem e histórico de pagamentos/estornos |
| `POST` | `/api/payables/:id/payments` | ADMIN, ANALISTA | Registra pagamento parcial ou total |
| `POST` | `/api/payables/:id/payments/:paymentId/reverse` | ADMIN | Estorna um pagamento com justificativa, sem apagá-lo |
| `POST` | `/api/payables/:id/cancel` | ADMIN | Cancela um título sem pagamentos efetivos |
| `GET` | `/api/receivables` | ADMIN, ANALISTA, VISUALIZADOR | Lista contas a receber e permite filtrar títulos atrasados |
| `GET` | `/api/receivables/summary` | ADMIN, ANALISTA, VISUALIZADOR | Retorna faturamento, inadimplência e fluxo de caixa consolidado |
| `GET` | `/api/receivables/clients/:clientId/statement` | ADMIN, ANALISTA, VISUALIZADOR | Retorna extrato e indicadores financeiros do cliente |
| `GET` | `/api/receivables/:id` | ADMIN, ANALISTA, VISUALIZADOR | Retorna título, pedido e histórico de recebimentos/estornos |
| `POST` | `/api/receivables/:id/collections` | ADMIN, ANALISTA | Registra recebimento parcial ou total |
| `POST` | `/api/receivables/:id/collections/:collectionId/reverse` | ADMIN | Estorna um recebimento com justificativa |
| `POST` | `/api/receivables/:id/cancel` | ADMIN | Cancela um título sem recebimentos efetivos |
| `GET` | `/api/finance/setup` | Todos autenticados | Retorna plano de contas, centros de custo e contas financeiras |
| `POST/PATCH` | `/api/finance/cost-centers/:id?` | ADMIN | Cadastra e mantém a hierarquia de centros de custo |
| `POST/PATCH` | `/api/finance/chart-accounts/:id?` | ADMIN | Cadastra e mantém o plano de contas gerencial |
| `POST/PATCH` | `/api/finance/bank-accounts/:id?` | ADMIN | Cadastra e mantém contas financeiras |
| `GET/POST` | `/api/finance/titles` | Todos / ADMIN, ANALISTA | Consulta ou cria títulos manuais classificados e rateados |
| `GET/PATCH` | `/api/finance/titles/:type/:id` | Todos / ADMIN, ANALISTA | Consulta ou altera um título permitido |
| `POST` | `/api/finance/titles/:type/:id/settlements` | ADMIN, ANALISTA | Liquida parcial ou totalmente e movimenta a conta financeira |
| `POST` | `/api/finance/titles/:type/:id/settlements/:settlementId/reverse` | ADMIN | Estorna liquidação e cria contramovimento |
| `POST` | `/api/finance/titles/:type/:id/adjustments` | ADMIN | Aplica juros, multa ou desconto com memória de cálculo |
| `GET/POST` | `/api/finance/recurrences` | Todos / ADMIN, ANALISTA | Consulta ou cria recorrências financeiras |
| `POST` | `/api/finance/recurrences/process` | ADMIN | Gera ocorrências vencidas de forma idempotente |
| `POST` | `/api/finance/bank-transfers` | ADMIN, ANALISTA | Transfere entre contas próprias com partidas vinculadas |
| `POST` | `/api/finance/statement-imports/preview` | ADMIN, ANALISTA | Valida e pré-visualiza extrato OFX ou CSV |
| `POST` | `/api/finance/statement-imports/:id/confirm` | ADMIN, ANALISTA | Confirma uma importação bancária validada |
| `POST` | `/api/finance/reconciliations` | ADMIN, ANALISTA | Concilia transações e movimentos, inclusive muitos-para-muitos |
| `GET` | `/api/finance/reports/dre` | Todos autenticados | Gera DRE gerencial por competência |
| `GET` | `/api/finance/reports/dre/export` | Todos autenticados | Exporta a DRE gerencial em CSV |
| `GET` | `/api/finance/reports/cash-flow` | Todos autenticados | Gera fluxo previsto e realizado |
| `GET` | `/api/finance/dashboard` | Todos autenticados | Consolida indicadores, alertas e projeções financeiras |
| `GET` | `/api/orders` | ADMIN, ANALISTA, VISUALIZADOR | Lista pedidos com pesquisa, filtros, ordenação e paginação |
| `GET` | `/api/orders/:id` | ADMIN, ANALISTA, VISUALIZADOR | Retorna pedido, cliente e snapshots dos itens |
| `POST` | `/api/orders` | ADMIN, ANALISTA | Cria pedido e reserva estoque em transação serializável |
| `PATCH` | `/api/orders/:id/status` | ADMIN, ANALISTA* | Avança o fluxo; cancelamento é exclusivo de ADMIN |
| `GET` | `/api/dashboard/summary` | ADMIN, ANALISTA, VISUALIZADOR | Retorna indicadores, gráficos, pedidos recentes e estoque baixo |
| `GET` | `/api/audit` | ADMIN | Lista eventos de auditoria com pesquisa, filtros, paginação e ordenação temporal |
| `GET` | `/api/reports/clients` | Todos autenticados | Relatório paginado e indicadores de clientes |
| `GET` | `/api/reports/products` | Todos autenticados | Relatório paginado, estoque e valor estimado dos produtos |
| `GET` | `/api/reports/orders` | Todos autenticados | Relatório paginado e indicadores de pedidos |
| `GET` | `/api/reports/revenue` | Todos autenticados | Faturamento concluído, série diária e rankings |
| `GET` | `/api/imports/clients/template` | Todos autenticados | Baixa o modelo UTF-8 de clientes |
| `GET` | `/api/imports/products/template` | Todos autenticados | Baixa o modelo UTF-8 de produtos |
| `POST` | `/api/imports/clients/validate` | ADMIN, ANALISTA | Valida CSV multipart no campo `file` sem criar clientes |
| `POST` | `/api/imports/products/validate` | ADMIN, ANALISTA | Valida CSV multipart no campo `file` sem criar produtos |
| `POST` | `/api/imports/clients/execute` | ADMIN, ANALISTA | Revalida e importa clientes válidos |
| `POST` | `/api/imports/products/execute` | ADMIN, ANALISTA | Revalida e importa produtos válidos |
| `GET` | `/api/imports` | ADMIN, ANALISTA | Histórico paginado; ANALISTA vê somente os próprios jobs |
| `GET` | `/api/imports/:id` | ADMIN, ANALISTA | Detalhes e erros de uma importação autorizada |
| `GET` | `/api/fiscal/companies` | Todos autenticados | Lista empresas fiscais cadastradas |
| `POST` | `/api/fiscal/companies` | ADMIN | Cadastra uma empresa fiscal |
| `PATCH` | `/api/fiscal/companies/:id` | ADMIN | Atualiza uma empresa fiscal |
| `POST` | `/api/fiscal/imports/preview` | ADMIN, ANALISTA | Valida um lote multipart de XML de NF-e sem criar documentos |
| `GET` | `/api/fiscal/imports/:id` | Todos autenticados | Consulta o lote, arquivos e resultado da importação |
| `POST` | `/api/fiscal/imports/:id/confirm` | ADMIN, ANALISTA | Confirma atomicamente os XML válidos e seus vínculos explícitos |
| `GET` | `/api/fiscal/documents` | Todos autenticados | Lista documentos fiscais com filtros, resumo e paginação |
| `GET` | `/api/fiscal/documents/:id` | Todos autenticados | Consulta XML, itens, tributos, vínculos, divergências e anexos |
| `PATCH` | `/api/fiscal/documents/:id/links` | ADMIN, ANALISTA | Atualiza vínculos referenciais sem produzir movimentações automáticas |
| `POST` | `/api/fiscal/documents/:id/attachments` | ADMIN, ANALISTA | Inclui anexo permitido e auditado |
| `GET` | `/api/fiscal/documents/:id/attachments/:attachmentId/download` | Todos autenticados | Baixa um anexo ativo |
| `DELETE` | `/api/fiscal/documents/:id/attachments/:attachmentId` | ADMIN | Remove logicamente um anexo auxiliar; o XML original é imutável |
| `GET` | `/health` | Não | Verifica se o processo HTTP está ativo |

Exemplo de login:

```json
{
  "email": "admin@qamgmt.local",
  "password": "Admin@123"
}
```

Nenhuma resposta expõe `passwordHash`.

Parâmetros aceitos em `GET /api/users`:

```text
search=carlos
role=ANALISTA
active=true|false
page=1
pageSize=10 (máximo 100)
sortBy=name|email|createdAt
sortOrder=asc|desc
```

Parâmetros aceitos em `GET /api/clients`:

```text
search=carlos|123456|carlos@empresa.com
active=true|false
page=1
pageSize=10 (máximo 100)
sortBy=name|email|document|createdAt
sortOrder=asc|desc
```

Parâmetros aceitos em `GET /api/products`:

```text
search=notebook|NOTE001
category=Informática
active=true|false
page=1
pageSize=10 (máximo 100)
sortBy=name|sku|price|stock|createdAt
sortOrder=asc|desc
```

Parâmetros aceitos em `GET /api/orders`:

```text
search=PED-000001|carlos|12345678900
status=PENDING|CONFIRMED|PROCESSING|COMPLETED|CANCELLED
client=carlos|12345678900|carlos@empresa.com
dateStart=2026-09-01
dateEnd=2026-09-30
page=1
pageSize=10 (máximo 100)
sortBy=number|total|status|createdAt
sortOrder=asc|desc
```

O corpo de criação aceita somente `clientId` e `items[{ productId, quantity }]`. Preços, subtotais e total enviados pelo cliente são rejeitados; o backend usa `Decimal` e os valores persistidos dos produtos.

`GET /api/dashboard/summary` retorna um snapshot com `generatedAt`, `timezone`, métricas de `clients`, `products`, `orders` e `revenue`. A receita usa exclusivamente pedidos `COMPLETED`; estoque baixo inclui até 10 produtos ativos com `stock <= 5`; pedidos recentes são os cinco mais novos. A série `orders.last30Days` sempre contém 30 dias, incluindo dias sem pedidos com contagem zero.

Parâmetros aceitos em `GET /api/audit`:

```text
entityType=USER|CLIENT|CLIENT_ADDRESS|CATEGORY|PRODUCT|SUPPLIER|PURCHASE_ORDER|PAYABLE|RECEIVABLE|ORDER|IMPORT
action=CREATE|UPDATE|ACTIVATE|DEACTIVATE|ROLE_CHANGE|STATUS_CHANGE|CANCEL|RECEIVE|PAYMENT|PAYMENT_REVERSAL|COLLECTION|COLLECTION_REVERSAL|IMPORT|STOCK_ADJUSTMENT|PRIMARY_CHANGE|PASSWORD_CHANGE
userId=uuid
entityId=identificador
search=nome|email|identificador
dateFrom=2026-09-01
dateTo=2026-09-30
page=1
pageSize=20 (máximo 100)
sortOrder=asc|desc (padrão desc)
```

Não existem endpoints de atualização ou remoção de `AuditLog`; o módulo é somente leitura para a aplicação.

Os relatórios aceitam `page`/`pageSize` (máximo 100) e apenas campos de ordenação autorizados. Clientes filtram por `search`, `active`, `createdFrom` e `createdTo`; Produtos por `search`, `category`, `active`, `stockStatus`, `createdFrom` e `createdTo`; Pedidos por `search`, `status`, `clientId`, `dateFrom`, `dateTo`, `minTotal` e `maxTotal`. Faturamento aceita `dateFrom` e `dateTo`. Todos os intervalos usam `YYYY-MM-DD`.

Rotas do frontend:

- `/profile`: qualquer usuário autenticado; nome editável e dados de conta/senha próprios;
- `/dashboard`: qualquer usuário autenticado;
- `/clients` e `/clients/:id`: qualquer usuário autenticado;
- `/clients/new` e `/clients/:id/edit`: `ADMIN` e `ANALISTA`;
- `/clients/:clientId/addresses/new` e `/clients/:clientId/addresses/:addressId/edit`: `ADMIN` e `ANALISTA`;
- `/products` e `/products/:id`: qualquer usuário autenticado;
- `/products/new` e `/products/:id/edit`: `ADMIN` e `ANALISTA`;
- `/suppliers` e `/suppliers/:id`: qualquer usuário autenticado;
- `/suppliers/new` e `/suppliers/:id/edit`: `ADMIN` e `ANALISTA`;
- `/purchases` e `/purchases/:id`: qualquer usuário autenticado;
- `/purchases/new`: `ADMIN` e `ANALISTA`;
- `/products/:id/cost-history`: histórico de custos para qualquer usuário autenticado;
- `/finance/payables` e `/finance/payables/:id`: qualquer usuário autenticado; pagamentos para `ADMIN` e `ANALISTA`, cancelamento e estorno somente para `ADMIN`;
- `/finance/receivables` e `/finance/receivables/:id`: qualquer usuário autenticado; recebimentos para `ADMIN` e `ANALISTA`, cancelamento e estorno somente para `ADMIN`;
- `/finance/clients/:clientId/statement`: extrato financeiro do cliente para qualquer usuário autenticado;
- `/categories` e `/categories/:id`: todos os usuários autenticados;
- `/categories/new` e `/categories/:id/edit`: `ADMIN` e `ANALISTA`; ativação/inativação somente para `ADMIN`;
- `/products/:id/stock`: histórico para qualquer usuário autenticado; movimentação manual somente para `ADMIN`;
- `/orders` e `/orders/:id`: qualquer usuário autenticado;
- `/orders/new`: `ADMIN` e `ANALISTA`;
- `/users`, `/users/new` e `/users/:id/edit`: somente `ADMIN`;
- `/audit`: somente `ADMIN`;
- `/reports`: todos os usuários autenticados;
- `/imports`: `ADMIN` e `ANALISTA`, com abas Clientes, Produtos e Histórico;
- `/forbidden`: acesso negado para perfil sem permissão.

## Movimentação de estoque (Fase 11)

`Product.stock` permanece como saldo atual para consultas e relatórios, mas não pode mais ser alterado pelo `PATCH /api/products/:id` nem pelo formulário comum de edição. Toda alteração passa pelo `StockService`, que persiste o novo saldo e o `StockMovement` na mesma transação.

Tipos persistidos: `ENTRY`, `EXIT`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`, `SALE`, `ORDER_CANCELLATION`, `PURCHASE_RECEIPT` e `INITIAL_BALANCE`. A quantidade é sempre inteira e positiva; o tipo define a direção. Saídas nunca admitem saldo negativo.

Endpoints:

```text
GET  /api/products/:id/stock/movements  ADMIN, ANALISTA, VISUALIZADOR
POST /api/products/:id/stock/entry      ADMIN
POST /api/products/:id/stock/exit       ADMIN
POST /api/products/:id/stock/adjust     ADMIN
```

O histórico aceita `type`, `dateFrom`, `dateTo`, `createdById`, `orderId`, `reason`, `page`, `pageSize` e `sortOrder=asc|desc`; a ordem padrão é a mais recente primeiro. Movimentações são imutáveis e não possuem endpoints `PATCH` ou `DELETE`.

Pedidos reutilizam o domínio de estoque dentro da transação serializável existente: a criação registra uma `SALE` por item e o cancelamento elegível registra `ORDER_CANCELLATION` por item. O `AuditLog` do pedido continua agregado; não é criado um log redundante por item. Entrada, saída e ajuste manuais geram `AuditAction.STOCK_ADJUSTMENT` no produto.

A migration `20260928000000_add_stock_movements` cria enum, tabela, restrições e índices, além de gerar `INITIAL_BALANCE` para saldos positivos já existentes sem mudar `Product.stock`. Produtos novos e importados com saldo positivo também recebem a abertura dentro da mesma transação. Produto com saldo zero não gera movimento artificial, pois `quantity` é obrigatoriamente positiva.

Concorrência é protegida por transações `Serializable`, retentativa de conflitos PostgreSQL e redução condicional com `stock >= quantity`. Um teste de integração opcional contra PostgreSQL real pode ser executado com:

```powershell
$env:RUN_DB_INTEGRATION='1'; npm exec -w backend vitest -- run src/services/stock.integration.test.ts
```

## Categorias de produtos (Fase 12)

`Category` é uma entidade persistida e `Product.categoryId` é uma chave estrangeira obrigatória com `ON DELETE RESTRICT`. A migration `20260929000000_add_product_categories` cria categorias a partir dos textos existentes, consolida nomes por bordas/espaços/case, valida que nenhum produto ficou órfão e somente depois remove a coluna textual antiga.

Os nomes preservam acentos e grafia de exibição. A unicidade lógica usa `normalized_name`, gerado pela função compartilhada `trim + compactação de espaços + lowercase`. Categorias inativas continuam visíveis em produtos históricos, mas não podem ser usadas em novos produtos, trocas de categoria ou importações.

```text
GET   /api/categories                 ADMIN, ANALISTA, VISUALIZADOR
GET   /api/categories/options         ADMIN, ANALISTA, VISUALIZADOR
GET   /api/categories/:id             ADMIN, ANALISTA, VISUALIZADOR
POST  /api/categories                 ADMIN, ANALISTA
PATCH /api/categories/:id             ADMIN, ANALISTA
PATCH /api/categories/:id/status      ADMIN
GET   /api/reports/products/export    CSV ou XLSX, todos os autenticados
```

`/api/categories/options` retorna somente ativas por padrão; `includeInactive=true` é usado por filtros que precisam alcançar produtos históricos. O CSV de importação permanece amigável e usa o nome em `category`; o backend resolve a categoria ativa sem criá-la automaticamente. Relatórios e exportações filtram por `categoryId`, mas exibem/exportam `Category.name`.

## Endereços de clientes (Fase 13)

`ClientAddress` mantém tipo, código postal, logradouro, número, complemento, bairro, cidade, estado e país em campos separados. Os tipos são `RESIDENTIAL`, `COMMERCIAL`, `BILLING` e `OTHER`. Não existe exclusão física nem integração com pedidos, frete, mapas ou importação nesta fase.

A migration `20260930000000_add_client_addresses` é aditiva, usa `ON DELETE RESTRICT`, impede um endereço inativo de ser principal e cria o índice parcial único `client_addresses_one_active_primary_per_client`. O service também adquire `pg_advisory_xact_lock` por cliente antes das mutações: a troca de principal, a auditoria `PRIMARY_CHANGE` e os demais ajustes confirmam ou revertem juntos.

O primeiro endereço ativo torna-se principal mesmo que o payload informe `false`. Um principal só pode ser inativado quando não existe outro endereço ativo; havendo outro, ele deve ser promovido antes. Ao reativar o único endereço ativo, ele volta a ser principal. Endereços de clientes inativos permanecem consultáveis, mas não podem ser alterados.

Não foram acrescentadas colunas ao relatório/exportação de clientes nesta fase: isso evita ampliar contratos opcionais e mantém o escopo concentrado no cadastro contextual. Pedidos continuam sem referência a endereço; uma evolução futura deve persistir snapshots imutáveis de entrega/cobrança.

## Perfil e alteração de senha (Fase 14)

Todos os perfis autenticados acessam `/profile`. A página usa `GET /api/auth/me`, permite alterar somente `name` e apresenta e-mail, perfil, status, criação e última atualização como dados somente leitura. O backend usa schema estrito e sempre toma o identificador do JWT, portanto `role`, `active`, `email`, `id` ou `userId` enviados no corpo são rejeitados e nunca chegam ao `Prisma.update`.

A política centralizada exige no mínimo 8 caracteres, uma letra maiúscula, uma minúscula, um número e um caractere especial. Criação de usuário e alteração de senha usam a mesma regra e custo bcrypt 12. Os seeds `Admin@123`, `Analista@123` e `Visualizador@123` continuam compatíveis.

`PATCH /api/profile/password` confirma a nova senha, valida a senha atual com `bcrypt.compare`, impede reutilizar a senha vigente e persiste apenas o novo `passwordHash`. O incremento transacional de `tokenVersion` invalida todos os JWTs antigos. Após sucesso, o `AuthContext.logout()` limpa a sessão, redireciona para `/login` e exibe a orientação para entrar com a nova senha.

Alterações de nome geram `USER/UPDATE` com apenas o diff de `name`. Trocas de senha geram `USER/PASSWORD_CHANGE` com `{ userId, changed: true }`; senha atual, nova senha, confirmação, hashes e tokens são removidos pela sanitização central. Tentativas incorretas passam pela proteção progressiva descrita abaixo.

## Recuperação de senha (Fase 15)

O login oferece `/forgot-password`, que chama `POST /api/auth/forgot-password`. Conta existente, ausente ou inativa recebe a mesma mensagem e o mesmo status `202`, evitando enumeração por conteúdo. Para um usuário ativo, o backend gera 32 bytes aleatórios, envia o valor bruto somente ao adaptador de e-mail e guarda apenas o SHA-256 em `PasswordResetToken`. Um novo pedido invalida links anteriores e o prazo padrão é de 15 minutos, configurável por `PASSWORD_RESET_TTL_MINUTES` até o limite de 60 minutos.

`/reset-password` recebe o token no fragmento `#token=...`, que não é enviado ao servidor web nem em cabeçalhos Referer, captura o valor e remove imediatamente o fragmento da barra de endereço. `POST /api/auth/reset-password` usa uma mensagem única para token inválido, expirado ou já usado, impede reutilizar a senha vigente e executa numa transação o consumo condicional do token, o novo hash bcrypt, a invalidação dos demais links, o incremento de `tokenVersion` e a auditoria. Um advisory lock por usuário serializa solicitações e redefinições concorrentes; o link permanece de uso único e todos os JWTs anteriores deixam de funcionar.

O contrato `PasswordResetMailer` permite trocar a entrega sem alterar o domínio. Em desenvolvimento, `PASSWORD_RESET_MAIL_MODE=console` imprime o link no terminal do backend; fora de `NODE_ENV=development`, esse modo nunca imprime o token e o adaptador desabilitado é usado até que um provedor real seja configurado. As ações `PASSWORD_RESET_REQUEST` e `PASSWORD_RESET` registram apenas o identificador e o resultado lógico, sem senha, hash ou token.

## Proteção contra abuso (Fase 16)

Login, troca de senha, solicitação de recuperação e consumo do link usam contadores persistentes em `SecurityThrottle`. Cada fluxo possui dimensões independentes por IP e por conta. O banco recebe somente HMAC-SHA-256 derivado do identificador e de `JWT_SECRET`; IP e e-mail não são armazenados em claro na tabela de limitação nem nos eventos de segurança.

Por padrão, a quinta tentativa em 15 minutos inicia bloqueio temporário. Reincidências aumentam o período para 1, 2, 4, 8, 16 e no máximo 30 minutos, sem bloqueio permanente. Após 24 horas sem nova progressão, o nível volta ao início. Advisory locks ordenados serializam tentativas concorrentes entre processos. Um sucesso limpa apenas o contador da conta; o contador do IP continua sua janela para não ser zerado por outra credencial válida.

Respostas bloqueadas usam status `429`, código `RATE_LIMITED` e cabeçalho `Retry-After`. Os parâmetros `RATE_LIMIT_MAX_ATTEMPTS`, `RATE_LIMIT_WINDOW_MINUTES`, `RATE_LIMIT_BASE_BLOCK_MINUTES`, `RATE_LIMIT_MAX_BLOCK_MINUTES` e `RATE_LIMIT_ESCALATION_RESET_MINUTES` permitem ajuste. `TRUST_PROXY_HOPS` deve permanecer `0` em acesso direto e só deve refletir a quantidade real de proxies reversos confiáveis; isso impede que `X-Forwarded-For` seja aceito indiscriminadamente.

Falhas relevantes geram `LOGIN_FAILURE`, `PASSWORD_CHANGE_FAILURE` ou `PASSWORD_RESET_FAILURE`; o início de um bloqueio gera `RATE_LIMIT_BLOCK` com fluxo, dimensão, nível e duração. Para identidades ainda não autenticadas, a entidade `SECURITY` usa somente o identificador protegido. Senhas, tokens, e-mails e endereços IP não entram no evento.

## Segurança de sessão (Fase 17)

O frontend não grava mais JWT em `localStorage` e remove automaticamente a chave legada durante a migração. Todas as chamadas usam `credentials: include`; o contrato antigo dos services conserva apenas um marcador opaco em memória para minimizar mudanças nas telas, sem enviá-lo no cabeçalho `Authorization`. Integrações não baseadas em navegador ainda podem usar Bearer e, por não dependerem de cookies ambientais, não passam pela validação CSRF.

O access token fica no cookie `qa_access_token`, com escopo `/api`, e o refresh no `qa_refresh_token`, restrito a `/api/auth`. Ambos são `HttpOnly`, `SameSite=Lax` e recebem `Secure` quando `NODE_ENV=production`. O cookie `qa_csrf_token` precisa ser legível pelo frontend para o padrão double-submit: ele contém 32 bytes aleatórios e uma assinatura HMAC-SHA-256 vinculada ao usuário. `POST`, `PUT`, `PATCH` e `DELETE` autenticados por cookie exigem que esse valor também esteja em `X-CSRF-Token`, com comparação segura no backend.

O access token expira após `ACCESS_TOKEN_TTL_MINUTES=15`. Uma resposta `401` dispara no máximo uma renovação compartilhada em `POST /api/auth/refresh`, evitando tempestade de requests concorrentes; o refresh expira após `REFRESH_TOKEN_TTL_HOURS=8`. Cada renovação usa novo `jti`, access, refresh e CSRF. `POST /api/auth/logout` e a redefinição de senha expiram todos os cookies. A troca/redefinição de senha também incrementa `tokenVersion`, bloqueando imediatamente access e refresh anteriores.

## Fornecedores e Compras (Fase 18)

Fornecedores têm cadastro próprio, pesquisa por nome, documento, e-mail ou contato, ativação lógica e unicidade de documento/e-mail. Todos os perfis consultam; `ADMIN` e `ANALISTA` criam e editam; somente `ADMIN` altera o status. Fornecedor inativo permanece no histórico, mas não pode ser usado em uma nova compra.

Uma compra nasce `PENDING` e recebe número concorrente `PC-000001`. Seus itens guardam snapshots imutáveis de nome, SKU, quantidade solicitada, quantidade recebida, custo unitário e subtotal; o backend calcula o total com `Decimal`. Recebimentos recebem número `REC-000001` e aceitam qualquer combinação de itens ainda pendentes. A situação muda para `PARTIALLY_RECEIVED` ou `RECEIVED` conforme o saldo, sem permitir excesso, quantidade zero ou duplicidade de item no mesmo documento.

O recebimento usa uma transação `Serializable` com nova tentativa em conflito e bloqueio da compra por `FOR UPDATE`. Documento, itens recebidos, saldo do produto, movimento de estoque, situação da compra e auditoria `RECEIVE` confirmam ou revertem juntos. Uma compra parcialmente recebida pode ser cancelada por `ADMIN`: apenas o saldo pendente deixa de ser esperado; o estoque já recebido e seu histórico não são alterados.

O histórico em `/products/:id/cost-history` deriva dos itens efetivamente recebidos, e não apenas dos pedidos emitidos. Assim, uma compra cancelada antes do recebimento não cria custo histórico, enquanto recebimentos parciais preservam custo, quantidade, fornecedor e documentos de origem. Não há edição ou exclusão de compra/recebimento, mantendo rastreabilidade.

## Contas a Pagar (Fase 19)

A compra define `paymentInstallments`, `firstPaymentDueDays` e `paymentIntervalDays`. Cada recebimento calcula seu próprio total e gera as parcelas correspondentes; recebimentos parciais criam obrigações somente sobre a mercadoria efetivamente recebida. A divisão é feita em centavos inteiros e qualquer resto é distribuído entre as primeiras parcelas, portanto a soma dos títulos sempre coincide exatamente com o recebimento.

Os estados persistidos são `PENDING`, `PARTIALLY_PAID`, `PAID` e `CANCELLED`. `OVERDUE` é um estado efetivo calculado quando um título aberto possui vencimento anterior ao dia corrente em UTC. O filtro de atraso é executado no PostgreSQL e não depende de cron, Redis ou atualização escrita durante uma leitura. Datas de vencimento usam `DATE`, e a interface as apresenta sem conversão indevida de fuso.

Um pagamento nunca pode ser zero, futuro ou superior ao saldo. Pagamentos parciais atualizam o saldo; o valor exato restante quita o título. Registros financeiros não são removidos: o estorno por `ADMIN` marca o pagamento original com responsável, data e justificativa, recalcula o título e cria auditoria `PAYMENT_REVERSAL`. Títulos com pagamento efetivo só podem ser cancelados depois dos estornos necessários.

O painel financeiro mostra saldo aberto, valor em atraso, compromissos dos próximos 30 dias, total pago no mês e previsão diária de saída. Consultas e operações são protegidas por RBAC; os totais usam `Decimal`, e pagamento, saldo e auditoria confirmam ou revertem juntos sob transação `Serializable` com retentativa de conflito.

## Contas a Receber e Caixa Consolidado (Fase 20)

Pedidos de venda agora aceitam `paymentInstallments`, `firstPaymentDueDays` e `paymentIntervalDays`. A criação apenas persiste essa condição; os títulos são gerados quando `PROCESSING` avança para `COMPLETED`, dentro da mesma transação serializável do status e da auditoria. Se a geração financeira falhar, o pedido não fica concluído. A migration cria uma parcela padrão para pedidos que já estavam concluídos, evitando histórico financeiro incompleto.

Cada parcela usa `Decimal` e divisão em centavos inteiros, portanto a soma coincide exatamente com o total do pedido. Os estados persistidos são `PENDING`, `PARTIALLY_RECEIVED`, `RECEIVED` e `CANCELLED`; `OVERDUE` é derivado pela data de vencimento para títulos abertos. Recebimentos futuros, zerados ou maiores que o saldo são rejeitados.

Recebimentos geram documentos `RCB-000001`. Um estorno administrativo não apaga o registro: marca data, responsável e justificativa, recalcula o saldo e audita `COLLECTION_REVERSAL`. Títulos com valor recebido exigem estorno antes do cancelamento. As operações usam bloqueio `FOR UPDATE`, auditoria no mesmo commit e retentativa de conflitos de serialização.

O extrato do cliente apresenta faturado, recebido, aberto e atrasado, com acesso aos pedidos e títulos de origem. O resumo financeiro compara faturado, recebido e pendente, mede inadimplência e agrega, por vencimento, entradas de contas a receber e saídas de contas a pagar. O saldo líquido diário é apenas previsão operacional; não substitui conciliação bancária ou regime contábil formal.

## Aprovação de compras por alçada (Fase 21)

Cada compra inicia como rascunho e precisa ser submetida. A submissão calcula a alçada necessária a partir do total e produz um evento imutável. Um responsável só pode aprovar valores dentro do limite ativo do próprio perfil e nunca pode receber uma compra apenas por tê-la criado. Rejeições exigem justificativa; a compra rejeitada pode ser revisada em uma evolução futura, mas não entra automaticamente no fluxo de recebimento.

As transições são protegidas por bloqueio de linha e transação serializável. O histórico guarda estado anterior e novo, comentário, responsável e data, enquanto o `AuditLog` registra as ações agregadas. A rota de recebimento exige `APPROVED` no backend, independentemente da tela usada pelo cliente.

## Fiscal e Documentos (Fase 22)

A importação aceita um lote de XML de NF-e modelo 55 em memória, com limites configuráveis por arquivo e por quantidade. A prévia rejeita DTD/entidades, XML malformado, modelo diferente, chave inválida, arquivo duplicado e documento já existente. A confirmação revalida o lote e cria todos os documentos válidos em uma única transação serializável; uma falha inesperada reverte o lote inteiro.

Cada documento preserva a chave de 44 dígitos, emitente, destinatário, datas, itens, totais, tributos declarados, protocolo e XML original imutável. Anexos auxiliares aceitam XML, PDF, PNG e JPEG, possuem limite próprio e remoção lógica. Divergências de cadastro e vínculos pendentes aparecem separadas da situação fiscal declarada no arquivo.

Fornecedor, cliente, produtos, compra, venda, contas a pagar e contas a receber são associados somente por ação explícita de `ADMIN` ou `ANALISTA`. O backend valida compatibilidade de operação e parte, registra `LINK` e não chama os serviços de estoque, pedidos, recebimentos, pagamentos ou cobranças. Assim, importar ou vincular um XML nunca cria entrada/saída, muda status ou altera saldo.

Este escopo não emite NF-e. Certificados digitais, assinatura, autorização, inutilização, cancelamento, carta de correção, consulta à SEFAZ, cálculo tributário e obrigações acessórias permanecem isolados para uma evolução própria, com requisitos jurídicos e operacionais específicos.

## Financeiro Avançado (Fase 24)

O plano de contas possui natureza gerencial (`REVENUE`, `DEDUCTION`, `COST`, `EXPENSE`, `FINANCIAL_REVENUE`, `FINANCIAL_EXPENSE`, `INCOME_TAX`, patrimonial ou neutra) e hierarquia protegida contra ciclos. Centros de custo também são hierárquicos. Um título manual exige competência, emissão, vencimento, classificação e rateio; percentuais são convertidos em centavos, distribuindo eventual resto para que a soma permaneça exatamente igual ao valor original.

Liquidações e estornos passam por um único serviço financeiro, com bloqueio do título, transação `Serializable`, chave opcional de idempotência, validação do saldo ajustado e criação atômica da movimentação bancária. Juros simples são calculados proporcionalmente aos dias; multa e desconto aceitam valor fixo ou percentual e preservam taxa, período, base, valor aplicado, justificativa, autor e reversão. Descontos e estornos são exclusivos de `ADMIN`.

Recorrências suportam periodicidade semanal, mensal, bimestral, trimestral, semestral e anual, término por data ou quantidade, suspensão, reativação e encerramento. O dia 31 é ajustado para o último dia válido do mês. A geração possui chave única por recorrência e competência, podendo ser chamada por um agendador externo sem duplicar títulos.

Extratos OFX e CSV são pré-validados quanto a formato, tamanho, codificação, limites e duplicidade. O CSV recebe mapeamento explícito de colunas. Sugestões automáticas só são determinísticas quando valor, janela de data e referência oferecem confiança suficiente; ambiguidades ficam para decisão humana. A conciliação permite um-para-um, um-para-muitos e muitos-para-muitos, guarda o valor de cada vínculo e pode ser revertida sem excluir o histórico.

| Operação | DRE por competência | Fluxo de caixa realizado |
| --- | --- | --- |
| Venda a prazo | Reconhece receita no período classificado | Reconhece somente quando recebida |
| Compra para estoque | Não vira despesa automaticamente | Registra a saída quando liquidada |
| Pagamento de aluguel | Reconhece a despesa na competência | Registra a saída na liquidação |
| Transferência própria | Não altera o resultado | Não altera o caixa consolidado |

## Qualidade e validação

```bash
npm run lint
npm test
npm run build
```

Os testes cobrem autenticação, cookies HttpOnly, CSRF assinado, separação e rotação de access/refresh, perfil, alteração e recuperação de senha, token com hash/expiração/uso único, resposta antienumeração, rate limiting por IP/conta, progressão/expiração do bloqueio, concorrência real dos contadores, invalidação real de sessão, autorização frontend e backend, CRUD lógico, endereços de clientes, fornecedores, compras, aprovação por alçada, contas a pagar e a receber, Dashboard, auditoria, relatórios, importações e estoque. O módulo fiscal cobre parser seguro, chave de acesso, modelo 55, schemas estritos e RBAC das rotas; o fluxo local também verifica duplicidade, vínculos explícitos, anexo lógico, imutabilidade do XML original e ausência de mudanças automáticas em estoque, compra, venda e financeiro. O Financeiro Avançado acrescenta cobertura de schemas, RBAC, rateio exato, memória de cálculo, regra de datas recorrentes, parsing seguro de OFX/CSV e contratos de conciliação; os fluxos anteriores continuam validando geração por compras e vendas, parcialidade, quitação, excesso, estorno, cancelamento, estoque, extrato e auditoria. ClientAddress cobre schemas, vínculo, cliente inativo, primeiro/principal, status, paginação, RBAC, auditoria, constraint e concorrência real. Para estoque são verificados validação, entrada, saída, ajustes, saldo insuficiente, saldo inicial, RBAC, filtros, paginação, imutabilidade de API, integração com produto/importação/pedido, rollback e concorrência real. Para CSV são verificados BOM, UTF-8, cabeçalhos, ordem de colunas, arquivos malformados, valores entre aspas, limites, validação por linha, duplicidades internas e no banco, parcialidade, revalidação, transação, rollback, RBAC, histórico, auditoria agregada, templates e volumes de 10, 100, 1.000 e 5.000 registros.

Playwright e Cucumber estão presentes em `qa-automation-erp` como uma suíte manual destinada a estudos de automação. Essa suíte não participa do `npm test`, do build padrão nem do gate de CI da aplicação. Para executá-la localmente, inicie o ERP pela raiz com `npm run dev:e2e` e, em outro terminal, execute `npm test` dentro de `qa-automation-erp`. O modo E2E define `NODE_ENV=test` e desativa exclusivamente o rate limiting do fluxo de login; recuperação e troca de senha continuam protegidas. A aplicação rejeita essa configuração de desvio em desenvolvimento ou produção.

## Estrutura

```text
qa-management/
├── backend/
│   ├── prisma/
│   │   ├── migrations/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   └── src/
│       ├── config/
│       ├── controllers/
│       ├── errors/
│       ├── middlewares/
│       ├── repositories/
│       ├── routes/
│       ├── schemas/
│       ├── services/
│       └── types/
├── frontend/
│   └── src/
│       ├── components/
│       ├── contexts/
│       ├── hooks/
│       ├── pages/
│       ├── routes/
│       ├── services/
│       ├── test/
│       ├── types/
│       └── utils/
├── compose.yaml
└── package.json
```

## Limitações conhecidas

- A rotação do refresh é stateless: sem uma tabela de sessões ou blacklist, uma cópia roubada do refresh anterior não pode ter replay detectado e permanece válida por no máximo `REFRESH_TOKEN_TTL_HOURS`. Troca/redefinição de senha revoga todas as cópias via `tokenVersion`.
- O logout expira os cookies do navegador, mas não mantém revogação individual por dispositivo. Sessões persistidas no banco, MFA e gerenciamento de dispositivos ficam para etapas futuras.
- Em desenvolvimento HTTP, `Secure` precisa permanecer desligado para o navegador aceitar os cookies locais; em `NODE_ENV=production` ele é obrigatório automaticamente. Uma implantação também deve manter HTTPS e uma política de segurança de conteúdo rigorosa.
- Um provedor hospedado de e-mail permanece para uma etapa futura.
- O health check confirma o servidor HTTP, não a conexão com o banco.
- A proteção do último administrador usa uma contagem seguida de atualização. Para múltiplas instâncias com alta concorrência, essa regra deve evoluir para uma transação serializável ou bloqueio no banco.
- A sequence de pedidos privilegia unicidade sob concorrência e pode deixar lacunas quando uma transação falha, comportamento esperado no PostgreSQL.
- O Dashboard é atualizado na abertura ou manualmente; atualização automática e WebSocket permanecem fora do escopo.
- As listas do Dashboard são deliberadamente limitadas a 5 pedidos recentes e 10 produtos com estoque baixo; análises configuráveis e BI permanecem fora do escopo.
- A auditoria ainda não possui limpeza automática. Com o crescimento do volume, deve ser definida uma política formal de retenção e avaliados arquivamento, particionamento e exportação antes de remover qualquer registro.
- A auditoria registra falhas e bloqueios dos fluxos sensíveis, mas não persiste IP, e-mail ou token em claro. Login bem-sucedido, leituras e user-agent continuam fora do histórico.
- O relatório de produtos possui exportação CSV/XLSX; impressão, agendamento, personalização e exportações dos demais relatórios permanecem fora do escopo.
- O faturamento permanece agrupado diariamente mesmo para intervalos longos. Agrupamento mensal pode ser incluído em uma evolução futura.
- Importações são síncronas e mantêm o arquivo em memória, com limites configuráveis por `CSV_IMPORT_MAX_FILE_SIZE_MB` e `CSV_IMPORT_MAX_ROWS`. Volumes maiores devem migrar para armazenamento temporário e processamento assíncrono.
- O histórico guarda um resumo JSON dos erros, adequado ao limite atual de 5.000 linhas. Crescimento do limite deve considerar uma tabela normalizada ou armazenamento externo de resultados.
- A entrada em Excel/XLSX, importação de pedidos/usuários, edição de linhas e processamento em filas permanecem fora do escopo.
- O estoque é único por produto; depósitos, reservas, lotes, validade, séries, custo médio e transferências permanecem fora do escopo da Fase 11.
- Compras possuem aprovação por alçada, mas não incluem frete, devolução ao fornecedor ou cálculo tributário. O histórico atual registra custo de aquisição unitário, sem calcular custo médio contábil do estoque.
- O módulo fiscal importa NF-e modelo 55, não emite documentos e não consulta a SEFAZ. NFC-e, CT-e, NFS-e, manifestação do destinatário, certificados digitais e regras tributárias permanecem fora deste escopo.
- Vínculos fiscais com compras, vendas e financeiro são deliberadamente referenciais. Movimentações automáticas só devem ser acrescentadas quando houver uma regra de negócio explícita, idempotente e coberta por testes de integração.
- O Financeiro Avançado fornece processamento idempotente de recorrências por endpoint, mas não mantém um worker ou cron próprio; produção deve acionar esse endpoint por um agendador autenticado.
- A DRE é gerencial e depende de classificação explícita. Ela não calcula custo contábil de mercadorias vendidas, impostos, depreciação ou partidas dobradas automaticamente e não substitui escrituração oficial.
- Títulos históricos sem conta gerencial permanecem na fila de revisão; não há migração que invente classificações para dados anteriores.
- Produtos com saldo zero não recebem `INITIAL_BALANCE`, porque a regra de domínio e a restrição no banco exigem quantidade estritamente positiva; o primeiro movimento futuro passa a ser o início do histórico.
