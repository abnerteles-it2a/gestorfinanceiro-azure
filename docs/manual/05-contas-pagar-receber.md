# Gestor Financeiro — Manual Oficial do Sistema
## Capítulo 5: Contas a Pagar e a Receber

### 5.1 Visão Operacional vs Visão de Caixa
Enquanto o Fluxo de Caixa acompanha o dinheiro que já entrou ou saiu da conta bancária, o módulo de **Contas a Pagar e a Receber** cuida dos compromissos futuros assumidos:
- **Contas a Pagar**: Obrigações futuras (boletos, faturas de cartão de crédito, notas fiscais de fornecedores, impostos e salários a pagar).
- **Contas a Receber**: Direitos creditórios futuros (vendas faturadas a prazo, contratos de clientes com vencimento futuro, reembolsos).

### 5.2 Como Cadastrar uma Conta a Pagar ou a Receber
1. No menu principal, acesse o módulo **Financeiro / Contábil**.
2. Na aba correspondente ("Contas a Pagar" ou "Contas a Receber"), clique em **Novo Lançamento**.
3. Preencha os campos obrigatórios:
   - **Título / Descrição**: Identificação da obrigação (ex: *Fornecedor XYZ - Nota 1042* ou *Fatura Nubank Outubro*).
   - **Valor (R$)**: Quantia nominal a ser paga ou recebida.
   - **Data de Vencimento**: Dia limite para o pagamento.
4. Preencha os campos complementares:
   - **Categoria**: Associação orçamentária.
   - **Fornecedor / Cliente**: Entidade relacionada.
   - **Conta Bancária de Vinculação**: Conta de onde sairá ou onde entrará o recurso quando for liquidado.
5. Clique em **Salvar**.

### 5.3 Como Baixar / Liquidar uma Conta
- Quando o pagamento for realizado ou o valor cair na conta:
  1. Na lista de Contas a Pagar/Receber, localize o item.
  2. Clique no botão de ação **Liquidar / Baixar** (ícone de check).
  3. O sistema marcará o título como `Liquidado` e, opcionalmente, gerará a transação de débito/crédito correspondente na conta bancária vinculada, mantendo o saldo 100% conciliado.
