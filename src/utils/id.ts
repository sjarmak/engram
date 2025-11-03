import { createHash } from 'node:crypto';
import { canonicalize } from './canonicalize.js';

/**
 * Content-addressed ID: same content always produces same 64-char hex ID
 */
export function deterministicId(obj: unknown): string {
  const canonical = canonicalize(obj);
  const hash = createHash('sha256');
  hash.update(canonical, 'utf8');
  return hash.digest('hex');
}

export function shortId(obj: unknown): string {
  return deterministicId(obj).slice(0, 8);
}

export function isValidId(id: string): boolean {
  return /^[a-f0-9]{64}$/.test(id);
}

export function isValidShortId(id: string): boolean {
  return /^[a-f0-9]{8}$/.test(id);
}
