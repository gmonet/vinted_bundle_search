import { localMatch, normalize, textMatches } from '../src/core/matching';
import { newQuery, type Item } from '../src/core/types';

const item = (p: Partial<Item>): Item => ({
  id: '1',
  title: '',
  url: '',
  photo: null,
  price: 3,
  totalPrice: null,
  currency: 'EUR',
  brand: null,
  size: null,
  status: null,
  sellerId: 's',
  matches: [],
  source: 'wardrobe',
  ...p,
});

describe('textMatches', () => {
  it('ignores case and accents', () => {
    expect(normalize('Hélicoptère POLICE')).toBe('helicoptere police');
    expect(textMatches('helicoptere', 'Hélicoptère police')).toBe(true);
  });
  it('requires every word', () => {
    expect(textMatches('playmobil police', 'Playmobil pompiers')).toBe(false);
    expect(textMatches('playmobil police', 'Voiture de police Playmobil')).toBe(true);
  });
  it('tolerates plurals and small typos', () => {
    expect(textMatches('lego', 'Lot de legos')).toBe(true);
    expect(textMatches('playmobile', 'Playmobil 5182')).toBe(true);
    expect(textMatches('pol', 'Napoleon')).toBe(false);
  });
});

describe('localMatch', () => {
  it('checks price, status and brand', () => {
    const q = newQuery({
      text: 'police',
      priceTo: 5,
      statuses: ['2', '3'],
      brands: [{ id: '1', title: 'Playmobil' }],
    });
    const ok = item({ title: 'Moto police', brand: 'Playmobil', status: 'Bon état', price: 4 });
    expect(localMatch(ok, q)).toBe(true);
    expect(localMatch({ ...ok, price: 6 }, q)).toBe(false);
    expect(localMatch({ ...ok, status: 'Satisfaisant' }, q)).toBe(false);
    expect(localMatch({ ...ok, brand: 'LEGO' }, q)).toBe(false);
  });
  it('matches the brand as part of the text', () => {
    expect(
      localMatch(
        item({ title: 'Voiture police', brand: 'LEGO' }),
        newQuery({ text: 'lego police' }),
      ),
    ).toBe(true);
  });
});
