export function rowNumberBackgroundClass(
  isHighlighted: boolean,
  isExcluded: boolean,
  rowIndex: number,
): string {
  if (isHighlighted) return 'bg-accent-100';
  if (isExcluded) return 'bg-warning-50';
  return rowIndex % 2 ? 'bg-secondary-50' : 'bg-white';
}
