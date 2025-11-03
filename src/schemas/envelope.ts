import { z } from 'zod';

/**
 * CLI JSON output envelope
 * Provides consistent structure for all --json outputs
 */
export const EnvelopeSchema = z.object({
  apiVersion: z.string().default('v1'),
  cmd: z.string(),
  ok: z.boolean(),
  data: z.unknown().optional(),
  errors: z.array(z.string()).optional(),
});

export type Envelope = z.infer<typeof EnvelopeSchema>;

export function successEnvelope(cmd: string, data?: unknown): Envelope {
  return {
    apiVersion: 'v1',
    cmd,
    ok: true,
    data,
  };
}

export function errorEnvelope(cmd: string, errors: string[]): Envelope {
  return {
    apiVersion: 'v1',
    cmd,
    ok: false,
    errors,
  };
}
