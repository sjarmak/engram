import { z } from 'zod';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CommandContext } from '../index.js';
import { getDatabase } from '../../store/sqlite.js';
import { Repository } from '../../store/repository.js';
import { Thread } from '../../schemas/knowledge.js';

const ThreadInputSchema = z.object({
  threadId: z.string(),
  beadId: z.string().optional(),
  url: z.string().optional(),
});

type ThreadInput = z.infer<typeof ThreadInputSchema>;

export interface ThreadResult {
  thread: Thread;
}

export interface ThreadListResult {
  threads: Thread[];
}

export async function threadCommand(ctx: CommandContext, cwd: string = process.cwd()): Promise<ThreadResult | ThreadListResult> {
  const subcommand = ctx.args[0];

  if (!subcommand) {
    throw new Error('Usage: af thread <add|get|list|link> [args]');
  }

  const dbPath = join(cwd, '.ace', 'ace.db');
  if (!existsSync(dbPath)) {
    throw new Error('Database not initialized (run: af init)');
  }

  const db = getDatabase({ path: dbPath });
  const repo = new Repository(db);

  switch (subcommand) {
    case 'add':
      return addThread(ctx, repo);
    case 'get':
      return getThread(ctx, repo);
    case 'list':
      return listThreads(ctx, repo);
    case 'link':
      return linkThreadToBead(ctx, repo);
    default:
      throw new Error(`Unknown subcommand: ${subcommand}. Use: add, get, list, or link`);
  }
}

async function addThread(ctx: CommandContext, repo: Repository): Promise<ThreadResult> {
  const threadId = ctx.options['thread-id'] as string | undefined;
  const beadId = ctx.options['bead-id'] as string | undefined;
  const url = ctx.options['url'] as string | undefined;

  if (!threadId) {
    throw new Error('Missing required option: --thread-id');
  }

  const input: ThreadInput = {
    threadId,
    beadId,
    url,
  };

  const result = ThreadInputSchema.safeParse(input);
  if (!result.success) {
    const errors = result.error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`);
    throw new Error(`Validation failed: ${errors.join(', ')}`);
  }

  const thread = repo.addThread(result.data);

  if (!ctx.options.json) {
    console.error(`✓ Thread ${threadId} tracked (ID: ${thread.id})`);
  }

  return { thread };
}

async function getThread(ctx: CommandContext, repo: Repository): Promise<ThreadResult> {
  const threadId = ctx.args[1];

  if (!threadId) {
    throw new Error('Usage: af thread get <thread-id>');
  }

  const thread = repo.getThreadByThreadId(threadId);

  if (!thread) {
    throw new Error(`Thread not found: ${threadId}`);
  }

  if (!ctx.options.json) {
    console.error(`Thread: ${thread.threadId}`);
    if (thread.beadId) console.error(`Bead: ${thread.beadId}`);
    if (thread.url) console.error(`URL: ${thread.url}`);
    console.error(`Created: ${thread.createdAt}`);
  }

  return { thread };
}

async function listThreads(ctx: CommandContext, repo: Repository): Promise<ThreadListResult> {
  const beadId = ctx.options['bead-id'] as string | undefined;

  let threads: Thread[];

  if (beadId) {
    threads = repo.listThreadsByBead(beadId);
  } else {
    const stmt = repo['db'].prepare('SELECT * FROM threads ORDER BY created_at DESC');
    const rows = stmt.all() as unknown[];
    threads = rows.map(row => repo['mapThread'](row));
  }

  if (!ctx.options.json) {
    if (threads.length === 0) {
      console.error('No threads found');
    } else {
      console.error(`Found ${threads.length} thread(s):`);
      for (const t of threads) {
        console.error(`  ${t.threadId}${t.beadId ? ` → ${t.beadId}` : ''}`);
      }
    }
  }

  return { threads };
}

async function linkThreadToBead(ctx: CommandContext, repo: Repository): Promise<ThreadResult> {
  const threadId = ctx.options['thread-id'] as string | undefined;
  const beadId = ctx.options['bead-id'] as string | undefined;

  if (!threadId || !beadId) {
    throw new Error('Missing required options: --thread-id and --bead-id');
  }

  repo.updateThreadBead(threadId, beadId);

  const thread = repo.getThreadByThreadId(threadId);
  if (!thread) {
    throw new Error(`Thread not found after update: ${threadId}`);
  }

  if (!ctx.options.json) {
    console.error(`✓ Linked thread ${threadId} to bead ${beadId}`);
  }

  return { thread };
}
