import { describe, it, expect } from 'vitest';
import { successEnvelope, errorEnvelope, EnvelopeSchema } from '../../src/schemas/envelope.js';

describe('Envelope', () => {
  describe('successEnvelope', () => {
    it('creates success envelope with data', () => {
      const envelope = successEnvelope('doctor', { status: 'healthy' });
      
      expect(envelope.apiVersion).toBe('v1');
      expect(envelope.cmd).toBe('doctor');
      expect(envelope.ok).toBe(true);
      expect(envelope.data).toEqual({ status: 'healthy' });
      expect(envelope.errors).toBeUndefined();
    });

    it('creates success envelope without data', () => {
      const envelope = successEnvelope('init');
      
      expect(envelope.apiVersion).toBe('v1');
      expect(envelope.cmd).toBe('init');
      expect(envelope.ok).toBe(true);
      expect(envelope.data).toBeUndefined();
    });

    it('validates with schema', () => {
      const envelope = successEnvelope('test', { foo: 'bar' });
      const result = EnvelopeSchema.safeParse(envelope);
      
      expect(result.success).toBe(true);
    });
  });

  describe('errorEnvelope', () => {
    it('creates error envelope', () => {
      const envelope = errorEnvelope('doctor', ['Check failed', 'Missing file']);
      
      expect(envelope.apiVersion).toBe('v1');
      expect(envelope.cmd).toBe('doctor');
      expect(envelope.ok).toBe(false);
      expect(envelope.errors).toEqual(['Check failed', 'Missing file']);
      expect(envelope.data).toBeUndefined();
    });

    it('validates with schema', () => {
      const envelope = errorEnvelope('test', ['error message']);
      const result = EnvelopeSchema.safeParse(envelope);
      
      expect(result.success).toBe(true);
    });
  });

  describe('JSON serialization', () => {
    it('success envelope serializes to valid JSON', () => {
      const envelope = successEnvelope('doctor', { checks: [] });
      const json = JSON.stringify(envelope);
      const parsed = JSON.parse(json);
      
      expect(parsed.apiVersion).toBe('v1');
      expect(parsed.cmd).toBe('doctor');
      expect(parsed.ok).toBe(true);
    });

    it('error envelope serializes to valid JSON', () => {
      const envelope = errorEnvelope('init', ['Failed to create directory']);
      const json = JSON.stringify(envelope);
      const parsed = JSON.parse(json);
      
      expect(parsed.apiVersion).toBe('v1');
      expect(parsed.ok).toBe(false);
      expect(parsed.errors).toHaveLength(1);
    });
  });
});
