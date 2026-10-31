# QA Automation Lab — ERP

**Projeto de estudo e portfólio em Quality Assurance e Test Automation**

![Status](https://img.shields.io/badge/Status-Em_Desenvolvimento-yellow)
![Playwright](https://img.shields.io/badge/Playwright-Testing-green)
![TypeScript](https://img.shields.io/badge/TypeScript-Language-blue)
![Cucumber](https://img.shields.io/badge/Cucumber-BDD-brightgreen)

## 1. Sobre o projeto

Este repositório documenta minha jornada de aprendizagem e desenvolvimento profissional em **Quality Assurance (QA)**, com foco em automação de testes utilizando **Playwright, TypeScript e Cucumber**.

O projeto utiliza como ambiente de testes um sistema ERP desenvolvido com auxílio de Inteligência Artificial, contendo funcionalidades como:

- Gestão de produtos e SKUs.
- Controle de estoque.
- Gestão de vendas.
- Documentos e notas fiscais.
- Gestão financeira.
- Relatórios e auditoria.
- Autenticação e controle de permissões.

O objetivo não é apenas automatizar funcionalidades, mas desenvolver competências para analisar requisitos, identificar riscos, planejar testes, implementar automações confiáveis e avaliar a qualidade de um produto de software.

## 2. Objetivos de aprendizagem

### Objetivo principal

Desenvolver competências práticas de QA Automation por meio da construção progressiva de uma suíte de testes para um sistema ERP.

### Objetivos específicos

- Compreender e documentar requisitos funcionais.
- Identificar e analisar regras de negócio.
- Aplicar técnicas de desenho de testes.
- Escrever cenários de teste com Gherkin.
- Desenvolver automações E2E com Playwright.
- Utilizar TypeScript e Cucumber.
- Construir uma arquitetura de automação sustentável.
- Desenvolver testes de API e integração.
- Implementar boas práticas de gerenciamento de massa de testes.
- Executar automações em pipelines CI/CD.
- Gerar relatórios e evidências de execução.
- Documentar defeitos e melhorias identificados.

## 3. Tecnologias

| Tecnologia | Finalidade |
|---|---|
| Playwright | Automação de aplicações web |
| TypeScript | Linguagem de programação |
| Cucumber | Execução de cenários BDD |
| Gherkin | Especificação de comportamentos |
| Node.js | Ambiente de execução |
| Git/GitHub | Versionamento e portfólio |
| GitHub Actions | Integração contínua |
| PostgreSQL | Validação de persistência, quando aplicável |

Ferramentas adicionais poderão ser incorporadas conforme a evolução do projeto.

## 4. Roadmap de aprendizagem

### Fase 01 — Fundamentos de QA e análise de requisitos

**Objetivo:** desenvolver a capacidade de compreender uma funcionalidade antes de automatizá-la.

- [ ] Explorar os módulos do sistema.
- [ ] Identificar requisitos funcionais.
- [ ] Documentar regras de negócio.
- [ ] Mapear dependências entre módulos.
- [ ] Identificar riscos funcionais.
- [ ] Definir critérios de aceitação.
- [ ] Elaborar uma matriz inicial de cobertura.

**Entregável:** documentação funcional e matriz de requisitos e testes.

### Fase 02 — Planejamento e modelagem de testes

**Objetivo:** aprender a projetar cenários de teste claros, relevantes e verificáveis.

- [ ] Compreender a diferença entre caso de teste e cenário BDD.
- [ ] Escrever cenários positivos.
- [ ] Escrever cenários negativos.
- [ ] Aplicar particionamento de equivalência.
- [ ] Aplicar análise de valores-limite.
- [ ] Utilizar tabelas de decisão.
- [ ] Identificar transições de estado.
- [ ] Elaborar cenários com Gherkin.
- [ ] Revisar cobertura e eliminar redundâncias.

**Entregável:** catálogo de cenários Gherkin organizado por funcionalidade.

### Fase 03 — Primeiros testes automatizados

**Objetivo:** implementar e executar os primeiros testes E2E.

- [ ] Configurar o projeto Node.js e TypeScript.
- [ ] Instalar e configurar Playwright.
- [ ] Integrar Cucumber ao projeto.
- [ ] Criar Step Definitions.
- [ ] Trabalhar com locators.
- [ ] Implementar assertions.
- [ ] Automatizar cenários positivos.
- [ ] Automatizar cenários negativos.
- [ ] Executar a primeira suíte de regressão.

**Entregável:** primeira suíte de testes automatizados executável.

### Fase 04 — Arquitetura e boas práticas

**Objetivo:** construir uma solução de automação organizada, reutilizável e sustentável.

- [ ] Implementar Page Object Model.
- [ ] Organizar Page Objects e Step Definitions.
- [ ] Configurar Custom World e hooks.
- [ ] Criar fixtures e factories.
- [ ] Gerenciar massa de testes.
- [ ] Garantir independência e isolamento entre cenários.
- [ ] Implementar estratégias de limpeza de dados.
- [ ] Evitar esperas fixas e seletores frágeis.
- [ ] Configurar screenshots e traces.
- [ ] Melhorar tratamento e diagnóstico de falhas.

**Entregável:** framework de automação estruturado e documentado.

### Fase 05 — Testes avançados e regras de negócio

**Objetivo:** desenvolver testes que verifiquem a integridade das operações do ERP.

- [ ] Automatizar testes de API.
- [ ] Validar códigos HTTP e contratos de resposta.
- [ ] Testar autenticação e autorização.
- [ ] Validar persistência no banco de dados.
- [ ] Testar integração entre módulos.
- [ ] Validar movimentações de estoque.
- [ ] Testar consistência entre vendas e estoque.
- [ ] Validar operações de devolução.
- [ ] Testar regras financeiras.
- [ ] Validar cálculos, arredondamentos e limites.
- [ ] Desenvolver testes de regressão de fluxos críticos.

**Entregável:** suíte de testes funcionais e de integração para processos críticos do negócio.

### Fase 06 — CI/CD e portfólio profissional

**Objetivo:** disponibilizar um projeto que demonstre competências aplicáveis ao mercado de trabalho.

- [ ] Configurar GitHub Actions.
- [ ] Automatizar a execução em pipeline.
- [ ] Publicar relatórios de execução.
- [ ] Registrar evidências de falhas.
- [ ] Documentar bugs encontrados.
- [ ] Criar indicadores de execução e estabilidade.
- [ ] Documentar a arquitetura do framework.
- [ ] Revisar README e documentação técnica.
- [ ] Publicar os resultados finais no GitHub.

**Entregável:** portfólio profissional de QA Automation.

---

## 5. Estratégia de testes

A estratégia será orientada a riscos, priorizando funcionalidades com maior impacto nas operações do sistema.

Os testes serão organizados nas seguintes categorias:

| Categoria | Objetivo |
|---|---|
| Funcionais | Validar comportamentos e requisitos |
| Negativos | Verificar rejeição de dados e operações inválidas |
| Valores-limite | Avaliar comportamentos nos limites permitidos |
| Autorização | Garantir respeito às permissões |
| API | Validar contratos e comportamentos dos endpoints |
| Integração | Verificar a comunicação entre componentes |
| E2E | Validar fluxos completos de negócio |
| Regressão | Detectar efeitos colaterais após mudanças |

## 6. Estado da automação E2E

Playwright e Cucumber estão configurados em `qa-automation-erp` como uma suíte **manual e destinada a estudos**. Ela não é executada pelo build, pelo `npm test` da aplicação nem pelo GitHub Actions. O CI valida a aplicação com type-check, testes automatizados de backend/frontend e build.

O desvio do rate limiting existe somente para facilitar os cenários repetitivos de login. Ele é ativado por `npm run dev:e2e`, afeta apenas o fluxo `LOGIN` e só é aceito com `NODE_ENV=test`. Desenvolvimento e produção mantêm a proteção por IP e por conta.

## 7. Estrutura do repositório

```text
.
├── backend/                 API, Prisma e testes do servidor
├── frontend/                Aplicação React e testes da interface
├── qa-automation-erp/       Laboratório manual Playwright/Cucumber
├── scripts/                 Comandos auxiliares do projeto
├── .github/workflows/       Validação contínua da aplicação
└── package.json             Workspaces backend e frontend
```

## 8. Execução local

Pré-requisitos: Node.js 20.19 ou superior, npm e PostgreSQL.

1. Instale as dependências da aplicação:

   ```bash
   npm ci
   ```

2. Copie `backend/.env.example` para `backend/.env` e informe a conexão local e um segredo JWT com pelo menos 32 caracteres.

3. Prepare o banco e inicie o ERP:

   ```bash
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   npm run dev
   ```

## 9. Execução manual dos estudos com Playwright

Na raiz, inicie o ambiente específico de E2E:

```bash
npm run dev:e2e
```

Em outro terminal:

```bash
cd qa-automation-erp
npm ci
npx playwright install chromium
npm test
```

Crie `qa-automation-erp/.env` a partir do `.env.example` e use apenas contas próprias do ambiente de testes. O arquivo `.env`, relatórios, resultados e dependências locais não são versionados.

## 10. Validação da aplicação

```bash
npm run lint
npm test
npm run build
```

O `package.json` da raiz gerencia apenas os workspaces `backend` e `frontend`. A pasta `qa-automation-erp` possui seu próprio `package.json` e pode ser validada separadamente com `npm run build`.

## 11. Publicação no GitHub

O repositório está preparado para versionar o código sem incluir arquivos `.env`, `node_modules`, relatórios do Playwright, cobertura ou artefatos temporários. Antes de tornar o projeto público, defina uma licença e confirme que as credenciais configuradas localmente nunca foram adicionadas ao histórico do Git.
