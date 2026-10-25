import { describe, expect, it } from 'vitest';
import {
  assignItemsToSubscale,
  deleteSubscaleById,
  removeItemFromSubscaleById,
} from '../src/lib/subscaleAssignment';

function emptyCards(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `id-${i + 1}`,
    name: `Subscale ${i + 1}`,
    items: [] as { column: string; order: number; reverse: boolean }[],
  }));
}

describe('subscale builder assignment (P3a / F6)', () => {
  it('assigns to Subscale 1 by id when two empty cards exist', () => {
    const cards = emptyCards(2);
    const next = assignItemsToSubscale(cards, 'id-1', ['Q1', 'Q2']);
    expect(next[0].items.map((i) => i.column)).toEqual(['Q1', 'Q2']);
    expect(next[1].items).toEqual([]);
  });

  it('assigns to Subscale 1 by id when three empty cards exist', () => {
    const cards = emptyCards(3);
    const next = assignItemsToSubscale(cards, 'id-1', ['Q1']);
    expect(next[0].items.map((i) => i.column)).toEqual(['Q1']);
    expect(next[1].items).toEqual([]);
    expect(next[2].items).toEqual([]);
  });

  it('assigns to each card independently after deletes', () => {
    let cards = emptyCards(3);
    cards = assignItemsToSubscale(cards, 'id-1', ['Q1', 'Q2']);
    cards = assignItemsToSubscale(cards, 'id-3', ['Q9', 'Q10']);
    cards = deleteSubscaleById(cards, 'id-2') as typeof cards;
    // After deleting middle card, id-1 still receives items
    cards = assignItemsToSubscale(cards, 'id-1', ['Q3']);
    expect(cards.find((c) => c.id === 'id-1')?.items.map((i) => i.column)).toEqual(['Q1', 'Q2', 'Q3']);
    expect(cards.find((c) => c.id === 'id-3')?.items.map((i) => i.column)).toEqual(['Q9', 'Q10']);
    expect(cards.find((c) => c.id === 'id-2')).toBeUndefined();
  });

  it('does not assign when target id is missing', () => {
    const cards = emptyCards(2);
    const next = assignItemsToSubscale(cards, 'missing', ['Q1']);
    expect(next[0].items).toEqual([]);
    expect(next[1].items).toEqual([]);
  });

  it('removes an item by subscale id only', () => {
    let cards = emptyCards(2);
    cards = assignItemsToSubscale(cards, 'id-1', ['Q1', 'Q2']);
    cards = assignItemsToSubscale(cards, 'id-2', ['Q3']);
    cards = removeItemFromSubscaleById(cards, 'id-1', 'Q1');
    expect(cards[0].items.map((i) => i.column)).toEqual(['Q2']);
    expect(cards[1].items.map((i) => i.column)).toEqual(['Q3']);
  });

  it('handles many subscales without cross-wiring', () => {
    const cards = emptyCards(30);
    let next = cards;
    for (let i = 0; i < 30; i++) {
      next = assignItemsToSubscale(next, `id-${i + 1}`, [`Q${i + 1}`]);
    }
    for (let i = 0; i < 30; i++) {
      expect(next[i].items.map((x) => x.column)).toEqual([`Q${i + 1}`]);
    }
  });
});
