/** Assign columns to a subscale by id only — never by list position or a shared "selected" index. */

export type AssignableSubscale = {
  id: string;
  items: { column: string; order: number; reverse: boolean }[];
};

export function assignItemsToSubscale<T extends AssignableSubscale>(
  subscales: T[],
  targetId: string,
  columns: string[],
): T[] {
  if (!targetId || columns.length === 0) return subscales;
  if (!subscales.some((subscale) => subscale.id === targetId)) return subscales;

  return subscales.map((subscale) => {
    if (subscale.id !== targetId) return subscale;
    const existing = new Set(subscale.items.map((item) => item.column));
    const additions = columns
      .filter((column) => !existing.has(column))
      .map((column, index) => ({
        column,
        order: subscale.items.length + index,
        reverse: false,
      }));
    if (additions.length === 0) return subscale;
    return {
      ...subscale,
      items: [...subscale.items, ...additions].map((item, order) => ({ ...item, order })),
    };
  });
}

export function removeItemFromSubscaleById<T extends AssignableSubscale>(
  subscales: T[],
  subscaleId: string,
  column: string,
): T[] {
  return subscales.map((subscale) => {
    if (subscale.id !== subscaleId) return subscale;
    return {
      ...subscale,
      items: subscale.items
        .filter((item) => item.column !== column)
        .map((item, order) => ({ ...item, order })),
    };
  });
}

export function deleteSubscaleById<T extends AssignableSubscale>(
  subscales: T[],
  subscaleId: string,
): T[] {
  return subscales
    .filter((subscale) => subscale.id !== subscaleId)
    .map((subscale, displayOrder) => ({ ...subscale, displayOrder } as T & { displayOrder?: number }));
}
