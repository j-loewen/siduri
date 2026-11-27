import { describe, expect, it } from 'vitest';
import { sameProducer } from '../src/library';

describe('sameProducer', () => {
  it('matches equal, unknown and generic producers', () => {
    expect(sameProducer('Weyermann', 'weyermann')).toBe(true);
    expect(sameProducer('', 'Weyermann')).toBe(true);
    expect(sameProducer('Generic', 'Weyermann')).toBe(true);
    expect(sameProducer('BESTMALZ', 'generic')).toBe(true);
    expect(sameProducer('Weyermann', 'BESTMALZ')).toBe(false);
  });
});
