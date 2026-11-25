import { describe, expect, it } from 'vitest';
import { hopLineSchema, normalizeOrigin, parseLibraryData } from '../src';

describe('origin', () => {
  it('turns codes and other spellings into country names', () => {
    expect(normalizeOrigin('DE')).toBe('Germany');
    expect(normalizeOrigin('de')).toBe('Germany');
    expect(normalizeOrigin('UK')).toBe('United Kingdom');
    expect(normalizeOrigin('USA')).toBe('United States');
    expect(normalizeOrigin('NZL')).toBe('New Zealand');
    expect(normalizeOrigin('England')).toBe('United Kingdom');
    expect(normalizeOrigin(' Czech  Republic ')).toBe('Czechia');
  });

  it('keeps names and anything it does not know', () => {
    expect(normalizeOrigin('Germany')).toBe('Germany');
    expect(normalizeOrigin('Bavaria')).toBe('Bavaria');
    expect(normalizeOrigin('XYZ')).toBe('XYZ');
    expect(normalizeOrigin('  ')).toBe('');
  });

  it('applies to library items and recipe lines', () => {
    expect(parseLibraryData('hop', { name: 'Saaz', origin: 'CZ' }).origin).toBe('Czechia');
    expect(hopLineSchema.parse({ id: 'h', name: 'Cascade', origin: 'US' })).toMatchObject({ origin: 'United States', producer: '' });
  });
});
