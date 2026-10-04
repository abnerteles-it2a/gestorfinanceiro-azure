# Gestor Financeiro — Manual Oficial do Sistema
## Capítulo 7: DRE Contábil, Balanço Patrimonial e Relatórios Fiscais

### 7.1 DRE — Demonstração do Resultado do Exercício
O DRE gerencial do Gestor Financeiro resume o desempenho operacional em determinado período:
- **Receita Operacional Bruta**: Todas as receitas geradas.
- **(-) Deduções e Impostos**: Tributos diretos (como DAS MEI, Simples Nacional, ISS).
- **(=) Receita Líquida**.
- **(-) Custos e Despesas Operacionais**: Gastos com fornecedores, infraestrutura, marketing e pessoal.
- **(=) Resultado Operacional Líquido (Lucro ou Prejuízo)**.
- **Margem Operacional (%)**: Percentual de lucro retido frente à receita bruta.

### 7.2 Balanço Patrimonial
Mede a riqueza e solidez acumulada no tempo:
- **Ativos**:
  - Circulante: Dinheiro disponível em contas bancárias + Contas a Receber no curto prazo.
  - Não Circulante: Carteira de investimentos (Ações, FIIs, CDBs, Cripto).
- **Passivos**:
  - Obrigações a Vencer (Contas a Pagar a fornecedores, faturas de cartão de crédito pendentes).
- **Patrimônio Líquido**:
  $$\text{Patrimônio Líquido} = \text{Ativos Totais} - \text{Passivos Totais}$$

### 7.3 Regime de Caixa vs Regime de Competência
- **Regime de Caixa**: Registra os valores no momento em que o dinheiro efetivamente entra ou sai da conta bancária (visão do extrato financeiro).
- **Regime de Competência**: Reconhece a receita ou a despesa na data do fato gerador (quando a venda foi efetuada ou o serviço contratado, independente da data de liquidação do boleto).
- A DRE atualmente exibida usa movimentos de caixa. O núcleo de competência gerencial está em implementação; não confundir a existência de regras testadas com uma visão integrada já disponível.
- Receita/despesa por competência deve ter data do fato econômico e vínculo com sua liquidação, para evitar dupla contagem. Registros históricos sem vínculo exigem revisão explícita; não são conciliados por coincidência de valor/data.
- Relatórios gerenciais e pareceres de IA não garantem conformidade contábil ou fiscal. Valide classificação, completude e período com a pessoa responsável pela contabilidade.

### 7.3.1 Cartão e fatura
A compra no crédito e o pagamento da fatura são eventos distintos. O núcleo de ciclos e parcelas já dispõe de regras testadas, mas sua integração de cadastro, persistência e telas ainda está pendente. Até essa integração, não cadastre compra e pagamento como duas saídas independentes: revise os registros legados e não presuma conciliação automática.

### 7.4 Monitoramento e Obrigações Fiscais MEI
Para microempreendedores individuais:
- **Limite Anual de Faturamento MEI**: R$ 81.000,00 (média de R$ 6.750,00/mês).
- **Termômetro MEI**: Widget visual no Dashboard que indica a porcentagem consumida do teto no ano corrente.
- **Relatório Mensal de Receitas Brutas**: Gera o documento oficial com a segregação exigida por lei entre Comércio, Indústria e Serviços.
- **Declaração Anual DASN-SIMEI**: Totaliza as receitas anuais para preenchimento direto no portal do Simples Nacional da Receita Federal.
