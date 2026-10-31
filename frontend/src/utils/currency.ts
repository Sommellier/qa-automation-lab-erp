const brlFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatCurrency(value: string): string {
  return brlFormatter.format(Number(value));
}

export function decimalToCents(value: string): bigint {
  const [integer = '0', decimals = ''] = value.split('.');
  return BigInt(integer) * 100n + BigInt(decimals.padEnd(2, '0').slice(0, 2));
}

export function formatCents(value: bigint): string {
  const integer = value / 100n;
  const decimals = (value % 100n).toString().padStart(2, '0');
  const formattedInteger = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(integer);
  return `R$ ${formattedInteger},${decimals}`;
}
