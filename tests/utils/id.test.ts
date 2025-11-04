import { describe, it, expect } from 'vitest';
import { deterministicId, shortId, isValidId, isValidShortId } from '../../src/utils/id.js';

describe('deterministicId', () => {
  it('generates 64-character hex string', () => {
    const id = deterministicId({ type: 'test' });
    expect(id).toHaveLength(64);
    expect(id).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces same ID for same content', () => {
    const obj = { type: 'pattern', text: 'Always use .js extensions' };
    const id1 = deterministicId(obj);
    const id2 = deterministicId(obj);

    expect(id1).toBe(id2);
  });

  it('produces same ID regardless of key order', () => {
    const obj1 = { a: 1, b: 2, c: 3 };
    const obj2 = { c: 3, a: 1, b: 2 };

    expect(deterministicId(obj1)).toBe(deterministicId(obj2));
  });

  it('produces different IDs for different content', () => {
    const id1 = deterministicId({ type: 'pattern' });
    const id2 = deterministicId({ type: 'fact' });

    expect(id1).not.toBe(id2);
  });

  it('handles complex nested structures', () => {
    const obj = {
      metadata: { version: 1, created: '2025-11-03' },
      items: [{ id: 1 }, { id: 2 }],
      config: { enabled: true },
    };

    const id = deterministicId(obj);
    expect(id).toHaveLength(64);
  });

  it('is stable across multiple calls', () => {
    const obj = { stable: 'test', value: 42 };
    const ids = Array.from({ length: 100 }, () => deterministicId(obj));

    expect(new Set(ids).size).toBe(1);
  });
});

describe('shortId', () => {
  it('generates 8-character hex string', () => {
    const id = shortId({ type: 'test' });
    expect(id).toHaveLength(8);
    expect(id).toMatch(/^[a-f0-9]{8}$/);
  });

  it('is prefix of full deterministicId', () => {
    const obj = { type: 'test', value: 123 };
    const full = deterministicId(obj);
    const short = shortId(obj);

    expect(full.startsWith(short)).toBe(true);
    expect(full.slice(0, 8)).toBe(short);
  });

  it('produces same short ID for same content', () => {
    const obj = { data: 'consistent' };
    expect(shortId(obj)).toBe(shortId(obj));
  });
});

describe('isValidId', () => {
  it('validates correct 64-character hex IDs', () => {
    const validId = 'a'.repeat(64);
    expect(isValidId(validId)).toBe(true);
  });

  it('rejects IDs with wrong length', () => {
    expect(isValidId('a'.repeat(63))).toBe(false);
    expect(isValidId('a'.repeat(65))).toBe(false);
    expect(isValidId('a'.repeat(8))).toBe(false);
  });

  it('rejects IDs with invalid characters', () => {
    expect(isValidId('g'.repeat(64))).toBe(false);
    expect(isValidId('Z'.repeat(64))).toBe(false);
    expect(isValidId('1234567890abcdef'.repeat(4).replace('a', 'G'))).toBe(false);
  });

  it('rejects uppercase hex', () => {
    expect(isValidId('A'.repeat(64))).toBe(false);
  });

  it('accepts real deterministicId output', () => {
    const id = deterministicId({ test: 'data' });
    expect(isValidId(id)).toBe(true);
  });
});

describe('isValidShortId', () => {
  it('validates correct 8-character hex IDs', () => {
    expect(isValidShortId('a1b2c3d4')).toBe(true);
    expect(isValidShortId('00000000')).toBe(true);
    expect(isValidShortId('ffffffff')).toBe(true);
  });

  it('rejects IDs with wrong length', () => {
    expect(isValidShortId('a'.repeat(7))).toBe(false);
    expect(isValidShortId('a'.repeat(9))).toBe(false);
    expect(isValidShortId('a'.repeat(64))).toBe(false);
  });

  it('rejects IDs with invalid characters', () => {
    expect(isValidShortId('g1234567')).toBe(false);
    expect(isValidShortId('ABCDEF12')).toBe(false);
  });

  it('accepts real shortId output', () => {
    const id = shortId({ test: 'data' });
    expect(isValidShortId(id)).toBe(true);
  });
});
