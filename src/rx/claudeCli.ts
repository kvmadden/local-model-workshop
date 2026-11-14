/**
 * Calls the `claude` command-line tool in print mode on the signed-in Claude subscription.
 * Clean environment (no API key is passed), no tools, no user or project settings, memory or hooks.
 * Node only.
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const cwd = mkdtempSync(path.join(os.tmpdir(), 'rx-claude-'));
const env = { HOME: os.homedir(), PATH: process.env.PATH ?? '', USER: os.userInfo().username, TERM: 'dumb' };

/** Throws unless the CLI reports a claude.ai subscription sign-in. Returns the auth summary. */
export function assertSubscription(): { authMethod: string; subscriptionType: string } {
  const auth = JSON.parse(execFileSync('claude', ['auth', 'status'], { env, cwd, encoding: 'utf8' })) as Record<string, unknown>;
  if (auth.authMethod !== 'claude.ai' || !auth.loggedIn) throw new Error(`claude is not signed in to a Claude subscription (authMethod ${String(auth.authMethod)})`);
  return { authMethod: String(auth.authMethod), subscriptionType: String(auth.subscriptionType) };
}

export interface ClaudeReply {
  text: string;
  error: string | null;
  wallMs: number;
  model: string[];
}

export function claudePrint(opts: { system: string; prompt: string; model?: string; timeoutMs?: number }): Promise<ClaudeReply> {
  const model = opts.model ?? 'claude-opus-5-5';
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const args = ['-p', '--model', model, '--safe-mode', '--setting-sources', '', '--tools', '', '--strict-mcp-config', '--no-session-persistence', '--output-format', 'json', '--system-prompt', opts.system];
  return new Promise((resolve) => {
    const started = performance.now();
    const child = spawn('claude', args, { env, cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => {
      clearTimeout(timer);
      const wallMs = Math.round(performance.now() - started);
      if (timedOut) return resolve({ text: '', error: `timed out after ${timeoutMs} ms`, wallMs, model: [] });
      try {
        const j = JSON.parse(out) as Record<string, unknown>;
        const used = Object.keys((j.modelUsage ?? {}) as object);
        if (j.is_error) return resolve({ text: String(j.result ?? ''), error: `claude reported an error: ${String(j.result ?? j.subtype)}`, wallMs, model: used });
        resolve({ text: String(j.result ?? ''), error: null, wallMs, model: used });
      } catch {
        resolve({ text: out, error: `claude exited ${code}: ${err.trim().slice(0, 300) || 'output was not JSON'}`, wallMs, model: [] });
      }
    });
    child.stdin.end(opts.prompt);
  });
}

/** The single JSON value in a reply, with or without a code fence. Null when there is none. */
export function jsonFrom(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(t);
  } catch {
    const a = Math.min(...['{', '['].map((c) => (t.indexOf(c) === -1 ? Infinity : t.indexOf(c))));
    const b = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
    if (!Number.isFinite(a) || b <= a) return null;
    try {
      return JSON.parse(t.slice(a, b + 1));
    } catch {
      return null;
    }
  }
}
