/**
 * RFC8785 canonical JSON serialization
 * Ensures deterministic JSON representation for content-addressed IDs
 */

export function canonicalize(obj: unknown): string {
  if (obj === null) return 'null';
  if (obj === undefined) return 'null';

  const type = typeof obj;

  if (type === 'boolean') return obj ? 'true' : 'false';

  if (type === 'number') {
    if (!Number.isFinite(obj as number)) {
      throw new Error('Cannot canonicalize non-finite numbers');
    }
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
    const keys = Object.keys(obj as object).sort();
    const pairs = keys.map((key) => {
      const value = (obj as Record<string, unknown>)[key];
      return `${JSON.stringify(key)}:${canonicalize(value)}`;
    });
    return `{${pairs.join(',')}}`;
  }

  throw new Error(`Cannot canonicalize type: ${type}`);
}

/**
 * Canonicalize numbers per RFC8785
 * - Integers: no decimal point
 * - Decimals: minimal representation
 * - No scientific notation for common ranges
 */
function canonicalizeNumber(num: number): string {
  if (Number.isInteger(num)) {
    return num.toString();
  }

  // Use minimal decimal representation
  let str = num.toString();
  
  // Handle scientific notation
  if (str.includes('e')) {
    const [mantissa, exponent] = str.split('e');
    const exp = parseInt(exponent, 10);
    
    if (exp >= 0 && exp < 21) {
      // Convert to decimal notation
      const base = parseFloat(mantissa);
      str = (base * Math.pow(10, exp)).toString();
    }
  }

  return str;
}
