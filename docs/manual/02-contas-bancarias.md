# Gestor Financeiro — Manual Oficial do Sistema
## Capítulo 2: Contas Bancárias e Gestão de Saldos

### 2.1 Conceito de Contas Bancárias
Uma conta bancária no Gestor Financeiro representa qualquer local onde há custódia ou movimentação de recursos financeiros:
- Contas correntes (ex: Itaú, Bradesco, Santander, Banco do Brasil).
- Bancos digitais e contas de pagamento (ex: Nubank, Inter, C6, Mercado Pago).
- Contas de corretora de investimentos (ex: XP, BTG, Rico, Avenue).
- Caixinha física ou carteira em dinheiro vivo.

### 2.2 Como Cadastrar uma Nova Conta Bancária
Existem duas formas simples de cadastrar uma conta:

**Método 1: Pelo menu de Configurações**
1. Clique no ícone de engrenagem (Configurações) no canto superior direito do sistema.
2. No modal de configurações, selecione a aba **Contas**.
3. Na seção "Adicionar Nova Conta", preencha:
   - **Nome da Conta**: Identificador de uso fácil (ex: *Nubank Principal*, *Itaú PJ*, *Caixa Físico*).
   - **Instituição / Banco**: Selecione a instituição financeira correspondente.
   - **Saldo Inicial (R$)**: O saldo exato existente na conta na data em que você começa o controle.
   - **Tipo de Conta**: Corrente, Poupança, Pagamento, Investimento ou Dinheiro.
4. Clique em **Salvar Conta**.

**Método 2: Cadastro Rápido durante um Lançamento**
- Ao abrir o modal de "Novo Lançamento", ao lado do campo seletor de "Conta Bancária", clique no botão `+` azul para cadastrar uma nova conta instantaneamente sem sair do fluxo.

### 2.3 Como o Sistema Calcula o Saldo Real das Contas
O saldo exibido na interface é dinâmico e auditado através do histórico contábil:
$$\text{Saldo Atual} = \text{Saldo Inicial} + \sum(\text{Entradas}) - \sum(\text{Saídas}) + \sum(\text{Transferências Recebidas}) - \sum(\text{Transferências Enviadas})$$

### 2.4 Transferências entre Contas
- Para transferir recursos de um banco para outro (ex: do Itaú para a corretora XP), utilize o tipo **Transferência**.
- A transferência debita a conta de origem e credita a conta de destino simultaneamente, sem inflar artificialmente o total de receitas ou despesas operacionais do mês.
