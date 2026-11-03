// @vitest-environment node
/**
 * The adapters against real HTTP servers on this machine, with the real fetch. These lock behavior
 * that a stubbed fetch cannot show: what happens on a redirect, and which error wins when the
 * deadline aborts a request that is still connecting or still sending its body.
 */
import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { OllamaAdapter, OpenAIAdapter } from './modelAdapter';

const servers: http.Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) {
    s.closeAllConnections();
    s.close();
  }
});

const listen = (handler: http.RequestListener) =>
  new Promise<string>((resolve) => {
    const server = http.createServer(handler);
    servers.push(server);
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`));
  });

describe('adapters against real local servers', () => {
  // Review round 2 (3 Nov), GPT 2 and Grok 8. A 307 or 308 makes fetch send the same POST body to
  // the new location. The local-only check runs on the first URL only, so a redirect must never be followed.
  it.each([307, 308])('never forwards the prompt when a local endpoint answers %i', async (status) => {
    const received: string[] = [];
    const target = await listen((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        received.push(body);
        res.end(JSON.stringify({ response: 'from the redirect target', choices: [{ message: { content: 'from the redirect target' } }] }));
      });
    });
    const local = await listen((_req, res) => {
      res.writeHead(status, { Location: `${target}/collect` });
      res.end();
    });
    await expect(new OllamaAdapter().executePrompt('SECRET PROMPT', { provider: 'ollama', model: 'm', endpointUrl: `${local}/api/generate` })).rejects.toThrow(/Ollama execution failed/);
    await expect(new OpenAIAdapter().executePrompt('SECRET PROMPT', { provider: 'openai', model: 'm', endpointUrl: `${local}/v1/chat/completions` })).rejects.toThrow(/OpenAI execution failed/);
    expect(received).toEqual([]);
  });

  // Grok 11 says the abort error wins the race against the deadline with a real fetch. It does not:
  // these use the real fetch and assert the deadline message.
  it('stops a request that never answers with the deadline message', async () => {
    const silent = await listen(() => undefined);
    await expect(new OllamaAdapter().executePrompt('p', { provider: 'ollama', model: 'm', endpointUrl: `${silent}/api/generate`, timeoutMs: 200 })).rejects.toThrow('Ollama execution failed: timed out after 200 ms');
  });

  it('stops a reply whose body stalls with the deadline message', async () => {
    const stall = await listen((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{"respon');
    });
    const started = performance.now();
    await expect(new OllamaAdapter().executePrompt('p', { provider: 'ollama', model: 'm', endpointUrl: `${stall}/api/generate`, timeoutMs: 200 })).rejects.toThrow('Ollama execution failed: timed out after 200 ms');
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
