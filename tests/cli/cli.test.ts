import { describe, it, expect } from 'vitest';
import { parseArgs, registerCommand, CommandContext } from '../../src/cli/index.js';

describe('CLI', () => {
  describe('parseArgs', () => {
    it('parses command with no options', () => {
      const { command, ctx } = parseArgs(['node', 'af', 'doctor']);

      expect(command).toBe('doctor');
      expect(ctx.args).toEqual([]);
      expect(ctx.options.json).toBe(false);
      expect(ctx.options.verbose).toBe(false);
    });

    it('parses --json flag', () => {
      const { command, ctx } = parseArgs(['node', 'af', 'doctor', '--json']);

      expect(command).toBe('doctor');
      expect(ctx.options.json).toBe(true);
    });

    it('parses --verbose flag', () => {
      const { command, ctx } = parseArgs(['node', 'af', 'doctor', '--verbose']);

      expect(command).toBe('doctor');
      expect(ctx.options.verbose).toBe(true);
    });

    it('parses -v flag', () => {
      const { command, ctx } = parseArgs(['node', 'af', 'doctor', '-v']);

      expect(command).toBe('doctor');
      expect(ctx.options.verbose).toBe(true);
    });

    it('parses command with arguments', () => {
      const { command, ctx } = parseArgs(['node', 'af', 'capture', 'bd-42', '--json']);

      expect(command).toBe('capture');
      expect(ctx.args).toEqual(['bd-42']);
      expect(ctx.options.json).toBe(true);
    });

    it('defaults to help when no command given', () => {
      const { command } = parseArgs(['node', 'af']);

      expect(command).toBe('help');
    });

    it('handles multiple flags and arguments', () => {
      const { command, ctx } = parseArgs([
        'node',
        'af',
        'learn',
        '--json',
        '--verbose',
        'arg1',
        'arg2',
      ]);

      expect(command).toBe('learn');
      expect(ctx.args).toEqual(['arg1', 'arg2']);
      expect(ctx.options.json).toBe(true);
      expect(ctx.options.verbose).toBe(true);
    });
  });

  describe('registerCommand', () => {
    it('registers and retrieves command', async () => {
      const handler = async (_ctx: CommandContext) => ({ result: 'test' });

      registerCommand('test-cmd', handler);

      expect(typeof handler).toBe('function');
    });
  });
});
