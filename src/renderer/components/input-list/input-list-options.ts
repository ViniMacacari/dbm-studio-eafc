export interface InputListOption {
  value: string;
  label: string;
  detail?: string;
  searchText?: string;
}

export function filterInputListOptions(options: InputListOption[], query: string): InputListOption[] {
  const normalizedQuery = normalizeInputListSearch(query);
  if (!normalizedQuery) return options;
  return options.filter((option) => normalizeInputListSearch(`${option.label} ${option.detail ?? ""} ${option.searchText ?? ""}`).includes(normalizedQuery));
}

function normalizeInputListSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}
