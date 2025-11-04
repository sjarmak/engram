/**
 * RFC8785 canonical JSON serialization for content-addressed IDs
 *
 * Supports I-JSON: null, boolean, finite numbers, strings, arrays, plain objects
 * Note: undefined in arrays becomes "null", undefined object keys are omitted
 */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Object.prototype.toString.call(v) === '[object Object]';
}

function canonicalizeNumber(num: number): string {
  if (!Number.isFinite(num)) {
    throw new Error('Cannot canonicalize non-finite numbers');
  }

  if (Object.is(num, -0)) return '0';
  if (Number.isInteger(num)) return String(num);

  return num.toString();
}

export function canonicalize(obj: unknown): string {
  if (obj === null) return 'null';
  if (obj === undefined) return 'null';

  const type = typeof obj;

  if (type === 'boolean') return obj ? 'true' : 'false';

  if (type === 'number') {
    return canonicalizeNumber(obj as number);
  }

  if (type === 'string') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    const elements = obj.map(canonicalize);
    return `[${elements.join(',')}]`;
  }

  if (type === 'object') {
    if (!isPlainObject(obj)) {
      throw new Error('Only plain JSON objects are supported');
    }

    const objAny = obj as Record<string, unknown>;
    // Omit undefined values and sort keys
    const keys = Object.keys(objAny)
      .filter(k => objAny[k] !== undefined)
      .sort();
    const pairs = keys.map(key => {
      const value = objAny[key];
      return `${JSON.stringify(key)}:${canonicalize(value)}`;
    });
    return `{${pairs.join(',')}}`;
  }

  throw new Error(`Cannot canonicalize type: ${type}`);
}
