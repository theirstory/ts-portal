import { spawn } from 'node:child_process';
import { log } from './log';

/** Env vars that must never reach a user-supplied command. */
const SECRET_ENV = ['PORTAL_SYNC_TOKEN'];

/**
 * Run PORTAL_SYNC_POST_PROCESS_COMMAND through `sh -c` with STORY_ID / STORY_UUID / COLLECTION_ID
 * (and STORY_FILE) in its env. Resolves on exit 0; rejects on non-zero exit, signal, or timeout.
 */
export function runPostProcess(
  command: string,
  vars: { STORY_ID: string; STORY_UUID: string; COLLECTION_ID: string; STORY_FILE: string },
  timeoutMs: number,
): Promise<void> {
  const env: NodeJS.ProcessEnv = { ...process.env, ...vars };
  for (const key of SECRET_ENV) delete env[key];

  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', command], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    const onData = (stream: 'out' | 'err') => (chunk: Buffer) => {
      const text = chunk.toString();
      tail = (tail + text).slice(-2000);
      for (const line of text.split('\n')) {
        if (line.trim()) (stream === 'out' ? log.info : log.warn)(`  [post-process ${vars.STORY_ID}] ${line}`);
      }
    };
    child.stdout.on('data', onData('out'));
    child.stderr.on('data', onData('err'));

    let timedOut = false;
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
            setTimeout(() => child.kill('SIGKILL'), 10_000).unref();
          }, timeoutMs)
        : undefined;
    if (timer) timer.unref();

    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      reject(new Error(`post-process command could not start: ${error.message}`));
    });
    child.on('exit', (code, signal) => {
      if (timer) clearTimeout(timer);
      if (code === 0) return resolve();
      const lastLine = tail.trim().split('\n').slice(-1)[0] ?? '';
      reject(
        new Error(
          `post-process command ${
            timedOut
              ? `timed out after ${Math.round(timeoutMs / 60000)} min`
              : signal
                ? `killed by ${signal}`
                : `exited ${code}`
          }${lastLine ? `: ${lastLine.slice(0, 300)}` : ''}`,
        ),
      );
    });
  });
}
