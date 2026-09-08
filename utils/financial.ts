export function calcValorParcelas(
  valorTotal: number,
  numeroParcelas: number,
  parcialParcelas: number[] = [],
  valorMinimoParcela?: number
): number[] {
  if (!valorTotal || valorTotal < 0.01) return [];
  if (numeroParcelas === 1) return [valorTotal];
  if (!numeroParcelas || numeroParcelas < 0) return [];
  if (valorMinimoParcela && valorTotal / numeroParcelas < valorMinimoParcela)
    return [];

  const getTotalParcelas = (_parcelas: number[]) =>
    parseFloat(
      _parcelas
        ?.reduce(
          (total: number, valor: string | number) => total + (+valor || 0),
          0
        )
        .toFixed(2)
    );

  const valorMinimo =
    valorMinimoParcela ?? Math.ceil((valorTotal / numeroParcelas) * 100) / 100;

  // Filtrar e validar parcelas parciais existentes
  let novasParcialParcelas = parcialParcelas
    .filter((v) => !isNaN(+v) && v >= 0)
    .map((v) => (v > valorMinimo ? v : valorMinimo));

  let valorParcelasAnteriores = getTotalParcelas(novasParcialParcelas);

  // Ajustar se as parciais já excederem o total (menos o mínimo para a última)
  while (valorParcelasAnteriores >= valorTotal - valorMinimo && novasParcialParcelas.length > 0) {
    novasParcialParcelas = novasParcialParcelas.slice(0, -1);
    valorParcelasAnteriores = getTotalParcelas(novasParcialParcelas);
  }

  const valorParcelasRestantes = valorTotal - valorParcelasAnteriores;
  const numeroParcelasRestantes = numeroParcelas - novasParcialParcelas.length;

  if (numeroParcelasRestantes <= 0) return novasParcialParcelas;

  const valorParcelas = parseFloat(
    (valorParcelasRestantes / numeroParcelasRestantes).toFixed(2)
  );
  
  const diferenca = valorParcelasRestantes - (valorParcelas * numeroParcelasRestantes);
  const valorUltimaParcela = parseFloat((valorParcelas + diferenca).toFixed(2));

  const novasParcelasGeradas = Array(numeroParcelasRestantes).fill(valorParcelas);
  
  // Ajusta a última parcela com a diferença de arredondamento
  novasParcelasGeradas[novasParcelasGeradas.length - 1] = valorUltimaParcela;

  return [...novasParcialParcelas, ...novasParcelasGeradas];
}

export function calcDataParcelas(
  numeroParcelas: number,
  dataInicial: string | Date,
  parcialParcelas: string[] = []
): string[] {
  const dateIni = new Date(dataInicial);
  if (isNaN(dateIni.getTime())) return [];

  if (numeroParcelas === 1) return [dateIni.toISOString()];

  const novasParcelas = parcialParcelas
    .map((d) => new Date(d))
    .filter((d) => !isNaN(d.getTime()))
    .sort((d1, d2) => d1.getTime() - d2.getTime());

  // Se já temos todas as datas, retorna (limitado ao numero de parcelas)
  if (novasParcelas.length >= numeroParcelas) {
    return novasParcelas
      .slice(0, numeroParcelas)
      .map((d) => d.toISOString());
  }

  // Preencher as datas restantes
  const lastDate = novasParcelas.length > 0 
    ? new Date(novasParcelas[novasParcelas.length - 1]) 
    : new Date(dateIni);
  
  // Se não tinha parciais, a primeira é a data inicial
  if (novasParcelas.length === 0) {
      novasParcelas.push(new Date(lastDate));
  }

  while (novasParcelas.length < numeroParcelas) {
    const prevDate = new Date(novasParcelas[novasParcelas.length - 1]);
    const nextDate = new Date(prevDate);
    nextDate.setMonth(nextDate.getMonth() + 1);
    novasParcelas.push(nextDate);
  }

  return novasParcelas.map((d) => d.toISOString());
}
