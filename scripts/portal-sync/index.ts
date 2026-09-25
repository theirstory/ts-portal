/**
 * Portal Sync service — the portal side of Portal Sync Protocol v1 (see docs/PORTAL_SYNC.md).
 *
 *   yarn portal-sync         long-running: sync on startup, every PORTAL_SYNC_INTERVAL_MINUTES,
 *                            and on signed POST /trigger pings (port PORTAL_SYNC_PORT)
 *   yarn portal-sync:once    one sync run, then exit (manual runs / cron)
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NlpProcessor, Weaviate } from './backends';
import { loadConfig } from './config';
import { releaseHeldLocksSync } from './lock';
import { formatError, log } from './log';
import { runPostProcess } from './post-process';
import { PublisherClient } from './publisher';
import { CoalescingRunner } from './scheduler';
import { createTriggerServer } from './server';
import { runSync } from './sync';
import type { RunSummary, SyncDeps } from './sync';

function packageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf-8'));
    return typeof pkg.version === 'string' ? pkg.version : '';
  } catch {
    return '';
  }
}

async function main(): Promise<void> {
  const once = process.argv.includes('--once');
  const config = loadConfig(packageVersion());

  log.info(
    `mode=${once ? 'once' : 'service'} publisher=${config.publisherUrl || '(unset)'} token=${config.token ? 'set' : '(unset)'} ` +
      `interval=${config.intervalMinutes}min port=${config.port}`,
  );
  log.info(`interviews=${config.interviewsDir} state=${config.stateFile}`);
  log.info(
    `weaviate=${config.weaviateUrl} nlp=${config.nlpUrl} postProcess=${config.postProcessCommand ? 'set' : 'none'}`,
  );

  const deps: SyncDeps = {
    publisher: new PublisherClient(config.publisherUrl, config.token),
    weaviate: new Weaviate(config.weaviateUrl, config.weaviateApiKey),
    nlp: new NlpProcessor(config.nlpUrl, config.nlpTimeoutMs),
    postProcess: config.postProcessCommand
      ? (vars) => runPostProcess(config.postProcessCommand, vars, config.postProcessTimeoutMs)
      : undefined,
  };

  if (once) {
    if (!config.enabled) {
      log.error(`Portal sync is disabled: ${config.disabledReason}.`);
      process.exit(1);
    }
    const summary = await runSync(config, deps, 'manual --once');
    process.exit(summary.state === 'succeeded' || summary.state === 'skipped' ? 0 : 1);
  }

  const runner = new CoalescingRunner<RunSummary>(
    (reason) => runSync(config, deps, reason),
    (error) => log.error(`Unexpected sync error: ${formatError(error)}`),
  );
  let nextPollAt: string | null = null;

  const server = createTriggerServer({
    token: config.token,
    enabled: config.enabled,
    onTrigger: (reason) => runner.request(reason),
    health: () => {
      const last = runner.lastResult;
      return {
        enabled: config.enabled,
        ...(config.enabled ? {} : { disabledReason: config.disabledReason }),
        running: runner.running,
        pending: runner.pending,
        intervalMinutes: config.intervalMinutes,
        nextPollAt,
        lastRun: last
          ? {
              syncId: last.syncId,
              state: last.state,
              startedAt: last.startedAt,
              finishedAt: last.finishedAt,
              message: last.message,
            }
          : null,
      };
    },
  });
  server.listen(config.port, '0.0.0.0', () => log.info(`Listening on :${config.port} (POST /trigger, GET /health)`));

  const shutdown = (signal: string) => {
    log.info(`${signal} received; shutting down`);
    releaseHeldLocksSync();
    server.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  if (!config.enabled) {
    log.info(
      `Portal sync is disabled (${config.disabledReason}). Idling. ` +
        'Set PORTAL_PUBLISHER_URL and PORTAL_SYNC_TOKEN and recreate this container to enable it.',
    );
    return;
  }

  runner.request('startup');
  if (config.intervalMinutes > 0) {
    const intervalMs = config.intervalMinutes * 60_000;
    nextPollAt = new Date(Date.now() + intervalMs).toISOString();
    setInterval(() => {
      nextPollAt = new Date(Date.now() + intervalMs).toISOString();
      runner.request('poll');
    }, intervalMs);
  } else {
    log.info('Polling disabled (PORTAL_SYNC_INTERVAL_MINUTES=0); syncing on startup and pings only.');
  }
}

main().catch((error) => {
  log.error(formatError(error));
  process.exit(1);
});
