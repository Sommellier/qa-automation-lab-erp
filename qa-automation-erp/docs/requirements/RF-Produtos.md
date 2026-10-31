# Levantamento de Requisitos Funcionais — Gestão de Produtos

## 1. Informações gerais

| Campo | Informação |
|---|---|
| Módulo | Gestão de Produtos |
| Documento | RF-Produtos |
| Versão | 1.0 |
| Status | Em levantamento |
| Responsável | Richard Schmitz Riedo |
| Última atualização | A preencher |

## 2. Objetivo

Documentar os requisitos funcionais, regras de negócio, critérios de aceitação e comportamentos esperados do módulo de Gestão de Produtos.

Este documento servirá como base para planejamento, elaboração e automação de testes.

## 3. Escopo

### Funcionalidades a investigar

- Cadastro de produtos.
- Consulta e listagem.
- Edição de produtos.
- Ativação e inativação.
- Pesquisa e filtros.
- Validações de campos.
- Permissões de acesso.

### Fora do escopo inicial

- Movimentação de estoque.
- Emissão de notas fiscais.
- Processamento de vendas.

As integrações com esses módulos serão analisadas em etapas posteriores.

## 4. Levantamento de requisitos funcionais

### RF-PROD-001 — Cadastro de produtos

**Descrição:**

O sistema deve permitir o cadastro de novos produtos mediante o preenchimento dos dados exigidos pela aplicação.

**Origem do requisito:** Gestão do produto

**Status:** Concluído

**Pré-condições:**
- Usuário autenticado.
- Permissão para cadastrar produtos.
- Acesso à funcionalidade de cadastro.

**Comportamento:**
- O usuário informa os dados necessários.
- O sistema valida os campos.
- O sistema registra o produto quando os dados são válidos.
- O sistema apresenta confirmação da operação.

**Critérios de aceitação candidatos:**

- CA-001: Permitir cadastrar um produto com dados válidos.
- CA-002: Exibir feedback de sucesso após a persistência.
- CA-003: Disponibilizar o produto cadastrado para consulta.

**Pendências:**
- Confirmar campos obrigatórios.
- Confirmar regras de validação.
- Confirmar permissões necessárias.
- Confirmar o comportamento após salvar.

---

### RF-PROD-002 — Unicidade do SKU

**Descrição:**

O sistema deve impedir a existência de produtos com SKU duplicado dentro do escopo de unicidade definido pelo negócio.

**Origem do requisito:** A confirmar.

**Status:** Hipótese — pendente de validação.

**Regras de negócio a investigar:**
- RN-001: Determinar o escopo de unicidade do SKU.
- RN-002: Determinar como espaços e diferenças entre maiúsculas e minúsculas são tratados.
- RN-003: Determinar se SKUs de produtos inativos podem ser reutilizados.

**Critérios de aceitação candidatos:**
- CA-001: Rejeitar o cadastro quando o SKU já existir no escopo definido.
- CA-002: Apresentar mensagem de validação apropriada.
- CA-003: Não persistir o produto rejeitado.

**Pendências:**
- Confirmar todas as regras acima.
- Verificar se a validação ocorre também no backend.

---

## 5. Dúvidas e pendências

| ID | Pergunta | Status |
|---|---|---|
| DUV-001 | SKU é obrigatório? | Sim |
| DUV-002 | SKU deve ser único? | Sim |
| DUV-003 | Produtos inativos podem ser editados? | Sim |
| DUV-004 | O preço pode ser zero? | Sim |


## 6. Evidências e referências

Registrar aqui as fontes utilizadas para identificar e confirmar requisitos.

Exemplos:
- Especificações funcionais.
- Prompts originais do ERP.
- Telas da aplicação.
- Código de validação do backend.
- Contratos da API.
- Decisões sobre regras de negócio.

**Atenção:** comportamento observado não representa, por si só, confirmação de requisito.

## 7. Histórico de alterações

| Versão | Alteração |
|---|---|
| 1.0 | Estrutura inicial do levantamento |
