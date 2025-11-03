import { describe, it, expect } from 'vitest';
import { canonicalize } from '../../src/utils/canonicalize.js';

describe('canonicalize', () => {
  it('handles null and undefined', () => {
    expect(canonicalize(null)).toBe('null');
    expect(canonicalize(undefined)).toBe('null');
  });

  it('handles booleans', () => {
    expect(canonicalize(true)).toBe('true');
    expect(canonicalize(false)).toBe('false');
  });

  it('handles integers', () => {
    expect(canonicalize(0)).toBe('0');
    expect(canonicalize(42)).toBe('42');
    expect(canonicalize(-100)).toBe('-100');
  });

  it('handles decimals', () => {
    expect(canonicalize(3.14)).toBe('3.14');
    expect(canonicalize(0.5)).toBe('0.5');
  });

  it('handles strings', () => {
    expect(canonicalize('hello')).toBe('"hello"');
    expect(canonicalize('with "quotes"')).toBe('"with \\"quotes\\""');
  });

  it('handles arrays', () => {
    expect(canonicalize([])).toBe('[]');
    expect(canonicalize([1, 2, 3])).toBe('[1,2,3]');
    expect(canonicalize(['a', 'b'])).toBe('["a","b"]');
  });

  it('handles nested arrays', () => {
    expect(canonicalize([[1, 2], [3, 4]])).toBe('[[1,2],[3,4]]');
  });

  it('handles objects with sorted keys (RFC8785)', () => {
    const obj = { z: 3, a: 1, m: 2 };
    expect(canonicalize(obj)).toBe('{"a":1,"m":2,"z":3}');
  });

  it('handles nested objects', () => {
    const obj = {
      outer: { z: 2, a: 1 },
      inner: { b: 'test' }
    };
    expect(canonicalize(obj)).toBe('{"inner":{"b":"test"},"outer":{"a":1,"z":2}}');
  });

  it('produces same output for same content (determinism)', () => {
    const obj1 = { type: 'pattern', text: 'Always use .js extensions', priority: 1 };
    const obj2 = { priority: 1, text: 'Always use .js extensions', type: 'pattern' };
    
    expect(canonicalize(obj1)).toBe(canonicalize(obj2));
  });

  it('handles mixed type arrays', () => {
    const arr = [1, 'two', true, null, { key: 'value' }];
    expect(canonicalize(arr)).toBe('[1,"two",true,null,{"key":"value"}]');
  });

  it('throws on non-finite numbers', () => {
    expect(() => canonicalize(Infinity)).toThrow('Cannot canonicalize non-finite numbers');
    expect(() => canonicalize(-Infinity)).toThrow('Cannot canonicalize non-finite numbers');
    expect(() => canonicalize(NaN)).toThrow('Cannot canonicalize non-finite numbers');
  });

  it('handles empty objects', () => {
    expect(canonicalize({})).toBe('{}');
  });

  it('produces compact output (no whitespace)', () => {
    const obj = { a: 1, b: [2, 3], c: { d: 4 } };
    const result = canonicalize(obj);
    expect(result).not.toContain(' ');
    expect(result).not.toContain('\n');
  });
});
