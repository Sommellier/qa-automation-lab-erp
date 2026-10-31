export function cleanCategoryName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeCategoryName(value: string): string {
  return cleanCategoryName(value).toLocaleLowerCase('pt-BR');
}
