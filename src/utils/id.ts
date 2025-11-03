import { createHash } from 'node:crypto';
import { canonicalize } from './canonicalize.js';

/**
 * Generate a deterministic content-addressed ID
 * 
 * Process:
 * 1. Canonicalize input via RFC8785
 * 2. Compute SHA-256 hash
 * 3. Return 64-character hex string
 * 
 * Same content always produces same ID.
 */
export function deterministicId(obj: unknown): string {
  const canonical = canonicalize(obj);
  const hash = createHash('sha256');
  hash.update(canonical, 'utf8');
  return hash.digest('hex');
}

/**
 * Generate short ID (first 8 characters) for human-readable display
 */
export function shortId(obj: unknown): string {
  return deterministicId(obj).slice(0, 8);
}

/**
 * Validate if a string is a valid deterministic ID
 */
export function isValidId(id: string): boolean {
  return /^[a-f0-9]{64}$/.test(id);
}

/**
 * Validate if a string is a valid short ID
 */
export function isValidShortId(id: string): boolean {
  return /^[a-f0-9]{8}$/.test(id);
}
