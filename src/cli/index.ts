#!/usr/bin/env node

import { successEnvelope, errorEnvelope } from '../schemas/envelope.js';

export interface CliOptions {
  json: boolean;
  verbose: boolean;
}

export interface CommandContext {
  args: string[];
  options: CliOptions;
}

export type CommandHandler = (ctx: CommandContext) => Promise<unknown>;

const commands = new Map<string, CommandHandler>();

export function registerCommand(name: string, handler: CommandHandler): void {
  commands.set(name, handler);
}

export function parseArgs(argv: string[]): { command: string; ctx: CommandContext } {
  const args = argv.slice(2);
  
  const options: CliOptions = {
    json: false,
    verbose: false,
  };

  const filtered: string[] = [];

  for (const arg of args) {
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else {
      filtered.push(arg);
    }
  }

  const command = filtered[0] || 'help';
  const commandArgs = filtered.slice(1);

  return {
    command,
    ctx: {
      args: commandArgs,
      options,
    },
  };
}

export async function runCli(argv: string[]): Promise<void> {
  const { command, ctx } = parseArgs(argv);

  const handler = commands.get(command);

  if (!handler) {
    const error = `Unknown command: ${command}`;
    
    if (ctx.options.json) {
      console.log(JSON.stringify(errorEnvelope(command, [error])));
    } else {
      console.error(`Error: ${error}`);
      console.error('Run "af help" for usage information');
    }
    process.exit(1);
  }

  try {
    const result = await handler(ctx);

    if (ctx.options.json) {
      console.log(JSON.stringify(successEnvelope(command, result)));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    
    if (ctx.options.json) {
      console.log(JSON.stringify(errorEnvelope(command, [message])));
    } else {
      console.error(`Error: ${message}`);
    }
    process.exit(1);
  }
}
