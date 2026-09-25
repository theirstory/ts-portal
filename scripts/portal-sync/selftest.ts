/**
 * Self-test for portal-sync (no Weaviate / NLP / publisher needed):  yarn portal-sync:test
 * Covers HMAC verification, manifest diffing, run coalescing, the /trigger server, inventory
 * hashing/sending, manifest removals, the data version, and full runSync() runs against in-memory
 * fakes in a temp directory.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testimonyUuid } from '../lib/testimony-ids';
import { storyIdFromTranscription } from './backends';
import type { ListedTestimony } from './backends';
import type { PortalSyncConfig } from './config';
import { bumpDataVersion, readDataVersion } from './data-version';
import { collectionMetaHash, planSync } from './diff';
import { signPing, verifyPing } from './hmac';
import {
  buildInventoryItems,
  INVENTORY_RESEND_MS,
  inventoryDue,
  inventoryHash,
  loadInventoryCache,
  reportInventory,
} from './inventory';
import { CoalescingRunner } from './scheduler';
import { createTriggerServer } from './server';
import { emptyState, loadState } from './state';
import { runSync } from './sync';
import type { SyncDeps } from './sync';
import type { InventoryReport, ItemSnapshot, LocalState, Manifest, StatusReport } from './types';

const tests: [string, () => Promise<void> | void][] = [];
const test = (name: string, fn: () => Promise<void> | void) => tests.push([name, fn]);

// ---------------------------------------------------------------- HMAC
const TOKEN = 'pps_test_token';
const BODY = Buffer.from('{"portalId":"p1","reason":"publish","requestedAt":"2026-09-24T18:00:00.000Z"}');
const NOW = 1_790_000_000;

test('hmac: valid signature accepted', () => {
  const ts = String(NOW);
  const sig = signPing(TOKEN, ts, BODY);
  assert.match(sig, /^sha256=[0-9a-f]{64}$/);
  assert.deepEqual(
    verifyPing({ token: TOKEN, timestampHeader: ts, signatureHeader: sig, rawBody: BODY, nowSeconds: NOW }),
    {
      ok: true,
    },
  );
});

test('hmac: matches an independent computation of HMAC(token, "<ts>.<body>")', async () => {
  const { createHmac } = await import('node:crypto');
  const ts = String(NOW);
  const expected = createHmac('sha256', TOKEN).update(`${ts}.${BODY.toString()}`).digest('hex');
  assert.equal(signPing(TOKEN, ts, BODY), `sha256=${expected}`);
  // Uppercase hex is accepted too.
  const upper = `sha256=${expected.toUpperCase()}`;
  assert.equal(
    verifyPing({ token: TOKEN, timestampHeader: ts, signatureHeader: upper, rawBody: BODY, nowSeconds: NOW }).ok,
    true,
  );
});

test('hmac: rejects wrong token, tampered body, bad format, skew', () => {
  const ts = String(NOW);
  const sig = signPing(TOKEN, ts, BODY);
  const v = (o: Partial<Parameters<typeof verifyPing>[0]>) =>
    verifyPing({ token: TOKEN, timestampHeader: ts, signatureHeader: sig, rawBody: BODY, nowSeconds: NOW, ...o }).ok;
  assert.equal(v({ token: 'other' }), false);
  assert.equal(v({ rawBody: Buffer.from(BODY.toString() + ' ') }), false);
  assert.equal(v({ signatureHeader: sig.slice('sha256='.length) }), false);
  assert.equal(v({ signatureHeader: 'sha256=abc' }), false);
  assert.equal(v({ signatureHeader: undefined }), false);
  assert.equal(v({ timestampHeader: undefined }), false);
  assert.equal(v({ timestampHeader: '12.5' }), false);
  // Signed with a different timestamp than the header.
  assert.equal(v({ timestampHeader: String(NOW + 1) }), false);
  // Skew: exactly 300s is OK, 301s is not (both directions).
  for (const delta of [300, -300]) {
    const t = String(NOW + delta);
    assert.equal(v({ timestampHeader: t, signatureHeader: signPing(TOKEN, t, BODY) }), true);
  }
  for (const delta of [301, -301]) {
    const t = String(NOW + delta);
    assert.equal(v({ timestampHeader: t, signatureHeader: signPing(TOKEN, t, BODY) }), false);
  }
  assert.equal(v({ token: '' }), false);
});

// ---------------------------------------------------------------- diff
const manifest = (items: Manifest['items'], collections: Manifest['collections'] = []): Manifest => ({
  protocol: 1,
  portalId: 'p1',
  collections: collections.length
    ? collections
    : [
        { id: 'coll-a', name: 'Coll A', description: 'A' },
        { id: 'coll-b', name: 'Coll B', description: '' },
      ],
  items,
});
const local = (
  collectionId: string,
  storyId: string,
  version: string,
  meta = collectionMetaHash({ name: 'Coll A', description: 'A' }),
) => ({
  version,
  collectionId,
  uuid: testimonyUuid(collectionId, storyId),
  file: `${collectionId}/${storyId}.json`,
  collectionMeta: meta,
  syncedAt: 'x',
});

test('diff: new / version / collection / meta / unchanged / removed', () => {
  const state: LocalState = {
    ...emptyState(),
    items: {
      same: local('coll-a', 'same', 'v1'),
      bumped: local('coll-a', 'bumped', 'v1'),
      moved: local('coll-a', 'moved', 'v1'),
      renamedColl: local('coll-a', 'renamedColl', 'v1', 'stale-hash'),
      gone: local('coll-a', 'gone', 'v1'),
    },
  };
  const plan = planSync(
    manifest([
      { storyId: 'same', collectionId: 'coll-a', version: 'v1' },
      { storyId: 'bumped', collectionId: 'coll-a', version: 'v2' },
      { storyId: 'moved', collectionId: 'coll-b', version: 'v1' },
      { storyId: 'renamedColl', collectionId: 'coll-a', version: 'v1' },
      { storyId: 'fresh', collectionId: 'coll-a', version: 'v1' },
      { storyId: 'fresh', collectionId: 'coll-a', version: 'v1' },
    ]),
    state,
  );
  const reasons = Object.fromEntries(plan.updates.map((u) => [u.item.storyId, u.reason]));
  assert.deepEqual(reasons, { bumped: 'version', moved: 'collection', renamedColl: 'collection-meta', fresh: 'new' });
  assert.deepEqual(
    plan.removals.map((r) => r.storyId),
    ['gone'],
  );
  assert.equal(plan.unchanged, 1);
  assert.equal(plan.warnings.length, 1); // duplicate "fresh"
});

test('diff: collection id compared after normalization (Coll-A == coll-a)', () => {
  const state: LocalState = { ...emptyState(), items: { s: local('coll-a', 's', 'v1') } };
  const plan = planSync(
    manifest(
      [{ storyId: 's', collectionId: 'Coll-A', version: 'v1' }],
      [{ id: 'Coll-A', name: 'Coll A', description: 'A' }],
    ),
    state,
  );
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.unchanged, 1);
});

test('uuid: matches importer/NLP formula uuidV5("<coll lower>:<storyId>", URL ns)', () => {
  // Reference value computed with Python: uuid.uuid5(uuid.NAMESPACE_URL, "coleman-archive:66f1a2b3c4d5e6f7a8b9c0d1")
  assert.equal(testimonyUuid('Coleman-Archive', '66f1a2b3c4d5e6f7a8b9c0d1'), '95581117-2aae-52cb-8c6b-5c52b6b8b21b');
});

// ---------------------------------------------------------------- scheduler
test('scheduler: concurrent requests coalesce into exactly one follow-up run', async () => {
  let runs = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const runner = new CoalescingRunner(async () => {
    runs += 1;
    if (runs === 1) await gate;
  });
  assert.equal(runner.request('a'), 'started');
  assert.equal(runner.request('b'), 'queued');
  assert.equal(runner.request('c'), 'queued');
  assert.equal(runner.request('d'), 'queued');
  release();
  await runner.idle();
  assert.equal(runs, 2);
  assert.equal(runner.running, false);
  assert.equal(runner.request('e'), 'started');
  await runner.idle();
  assert.equal(runs, 3);
});

// ---------------------------------------------------------------- HTTP server
test('server: /trigger verifies, returns 202, coalesces; /health works', async () => {
  const triggers: string[] = [];
  const server = createTriggerServer({
    token: TOKEN,
    enabled: true,
    onTrigger: (reason) => {
      triggers.push(reason);
      return triggers.length === 1 ? 'started' : 'queued';
    },
    health: () => ({ enabled: true }),
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const ts = String(Math.floor(Date.now() / 1000));
    const ok = await fetch(`${base}/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Portal-Timestamp': ts,
        'X-Portal-Signature': signPing(TOKEN, ts, BODY),
      },
      body: BODY,
    });
    assert.equal(ok.status, 202);
    assert.deepEqual(await ok.json(), { accepted: true, run: 'started' });
    assert.deepEqual(triggers, ['ping:publish']);

    const bad = await fetch(`${base}/trigger`, {
      method: 'POST',
      headers: { 'X-Portal-Timestamp': ts, 'X-Portal-Signature': signPing('wrong', ts, BODY) },
      body: BODY,
    });
    assert.equal(bad.status, 401);

    const stale = String(Number(ts) - 600);
    const old = await fetch(`${base}/trigger`, {
      method: 'POST',
      headers: { 'X-Portal-Timestamp': stale, 'X-Portal-Signature': signPing(TOKEN, stale, BODY) },
      body: BODY,
    });
    assert.equal(old.status, 401);

    const big = Buffer.alloc(9000, 'a');
    const huge = await fetch(`${base}/trigger`, {
      method: 'POST',
      headers: { 'X-Portal-Timestamp': ts, 'X-Portal-Signature': signPing(TOKEN, ts, big) },
      body: big,
    });
    assert.equal(huge.status, 413);
    assert.equal(triggers.length, 1);

    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true, enabled: true });
    assert.equal((await fetch(`${base}/trigger`)).status, 405);
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------- full run with fakes
function snapshot(
  storyId: string,
  version: string,
  collection: { id: string; name: string; description: string },
): ItemSnapshot {
  return {
    storyId,
    version,
    collection,
    folder: { id: '', name: '', path: '' },
    payload: {
      story: { _id: storyId, title: `Story ${storyId}` },
      transcript: { storyId },
      participants: [],
      tags: [],
      videoURL: 'x',
    },
  };
}

function testConfig(dir: string): PortalSyncConfig {
  return {
    enabled: true,
    disabledReason: '',
    publisherUrl: 'http://publisher.invalid',
    token: TOKEN,
    intervalMinutes: 0,
    port: 0,
    postProcessCommand: '',
    postProcessTimeoutMs: 0,
    interviewsDir: join(dir, 'interviews'),
    stateFile: join(dir, '.portal-sync', 'state.json'),
    lockFile: join(dir, '.portal-sync', 'state.json.lock'),
    inventoryFile: join(dir, '.portal-sync', 'inventory.json'),
    dataVersionFile: join(dir, '.portal-sync', 'data-version.json'),
    weaviateUrl: '',
    weaviateApiKey: '',
    nlpUrl: '',
    nlpTimeoutMs: 0,
    portalVersion: 'test',
  };
}

type FakeTestimony = { collectionId: string; title: string; storyId: string };

/** In-memory Weaviate: processStory writes Testimonies, deleteTestimony removes them. */
function fakeWeaviate(testimonies: Map<string, FakeTestimony>, deleted: string[]) {
  const storyIdLookups: string[] = [];
  return {
    storyIdLookups,
    weaviate: {
      waitUntilReady: async () => {},
      deleteTestimony: async (uuid: string) => {
        deleted.push(uuid);
        const existed = testimonies.delete(uuid);
        return { chunksDeleted: existed ? 3 : 0 };
      },
      listTestimonies: async (): Promise<ListedTestimony[]> =>
        [...testimonies].map(([uuid, t]) => ({ uuid, collectionId: t.collectionId, title: t.title })),
      getTestimonyStoryId: async (uuid: string) => {
        storyIdLookups.push(uuid);
        const t = testimonies.get(uuid);
        return t ? t.storyId : null;
      },
    },
  };
}

test('runSync: process, update, move collection, remove, failure retry', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'portal-sync-test-'));
  try {
    const config = testConfig(dir);
    const collA = { id: 'coll-a', name: 'Coll A', description: 'A' };
    const collB = { id: 'coll-b', name: 'Coll B', description: 'B' };

    const current: Manifest = { protocol: 1, portalId: 'p1', collections: [collA, collB], items: [] };
    const snapshots = new Map<string, ItemSnapshot>();
    const statuses: StatusReport[] = [];
    const processed: string[] = [];
    const deleted: string[] = [];
    const postProcessed: string[] = [];
    let failNlpFor = '';

    const testimonies = new Map<string, FakeTestimony>();
    const deps: SyncDeps = {
      publisher: {
        getManifest: async () => structuredClone(current),
        getItem: async (id) => structuredClone(snapshots.get(id) ?? null),
        postStatus: async (r) => void statuses.push(structuredClone(r)),
        postInventory: async () => {},
      },
      weaviate: fakeWeaviate(testimonies, deleted).weaviate,
      nlp: {
        waitUntilReady: async () => {},
        processStory: async ({ payload, collection }) => {
          if (payload.story._id === failNlpFor) throw new Error('NLP exploded');
          processed.push(`${collection.id}:${payload.story._id}`);
          testimonies.set(testimonyUuid(collection.id, payload.story._id), {
            collectionId: collection.id,
            title: payload.story.title,
            storyId: payload.story._id,
          });
          return { chunks: 5 };
        },
      },
      postProcess: async (vars) => void postProcessed.push(`${vars.COLLECTION_ID}:${vars.STORY_ID}:${vars.STORY_UUID}`),
    };

    // Run 1: two new items.
    current.items = [
      { storyId: 's1', collectionId: 'coll-a', version: 'v1' },
      { storyId: 's2', collectionId: 'coll-a', version: 'v1' },
    ];
    snapshots.set('s1', snapshot('s1', 'v1', collA));
    snapshots.set('s2', snapshot('s2', 'v1', collA));
    let summary = await runSync(config, deps, 'test');
    assert.equal(summary.state, 'succeeded');
    assert.deepEqual(processed, ['coll-a:s1', 'coll-a:s2']);
    assert.deepEqual(postProcessed, [
      `coll-a:s1:${testimonyUuid('coll-a', 's1')}`,
      `coll-a:s2:${testimonyUuid('coll-a', 's2')}`,
    ]);
    assert.deepEqual(
      statuses.map((s) => s.state),
      ['running', 'succeeded'],
    );
    assert.deepEqual(statuses[1].items, [
      { storyId: 's1', version: 'v1', state: 'synced' },
      { storyId: 's2', version: 'v1', state: 'synced' },
    ]);
    const s1File = JSON.parse(await readFile(join(config.interviewsDir, 'coll-a', 's1.json'), 'utf-8'));
    assert.equal(s1File.story._id, 's1');
    assert.equal(s1File.payload, undefined, 'file holds the raw payload like the importer writes');
    assert.deepEqual(
      JSON.parse(await readFile(join(config.interviewsDir, 'coll-a', 'collection.json'), 'utf-8')),
      collA,
    );
    assert.equal(existsSync(config.lockFile), false, 'lock released');

    // Run 2: nothing changed.
    processed.length = 0;
    statuses.length = 0;
    summary = await runSync(config, deps, 'test');
    assert.equal(summary.state, 'succeeded');
    assert.deepEqual(processed, []);
    assert.equal(statuses[1].items.length, 0);

    // Run 3: s1 bumped, s2 moved to coll-b, s3 new but NLP fails, (none removed).
    current.items = [
      { storyId: 's1', collectionId: 'coll-a', version: 'v2' },
      { storyId: 's2', collectionId: 'coll-b', version: 'v1' },
      { storyId: 's3', collectionId: 'coll-b', version: 'v1' },
    ];
    snapshots.set('s1', snapshot('s1', 'v2', collA));
    snapshots.set('s2', snapshot('s2', 'v1', collB));
    snapshots.set('s3', snapshot('s3', 'v1', collB));
    failNlpFor = 's3';
    processed.length = 0;
    statuses.length = 0;
    summary = await runSync(config, deps, 'test');
    assert.equal(summary.state, 'partial');
    assert.deepEqual(processed, ['coll-a:s1', 'coll-b:s2']);
    assert.deepEqual(deleted, [testimonyUuid('coll-a', 's2')], 'old uuid deleted on collection change');
    assert.equal(existsSync(join(config.interviewsDir, 'coll-a', 's2.json')), false);
    assert.equal(existsSync(join(config.interviewsDir, 'coll-b', 's2.json')), true);
    const failed = statuses[1].items.find((i) => i.storyId === 's3');
    assert.equal(failed?.state, 'failed');
    assert.match(failed?.error ?? '', /NLP exploded/);
    let state = await loadState(config.stateFile);
    assert.equal(state.items.s1.version, 'v2');
    assert.equal(state.items.s2.collectionId, 'coll-b');
    assert.equal(state.items.s3.version, '', 'failed item tracked for cleanup but version not recorded');

    // Run 4: s3 retried and succeeds; s1 unpublished -> removed.
    failNlpFor = '';
    current.items = current.items.filter((i) => i.storyId !== 's1');
    processed.length = 0;
    deleted.length = 0;
    statuses.length = 0;
    summary = await runSync(config, deps, 'test');
    assert.equal(summary.state, 'succeeded');
    assert.deepEqual(processed, ['coll-b:s3']);
    assert.deepEqual(deleted, [testimonyUuid('coll-a', 's1')]);
    assert.deepEqual(statuses[1].items, [
      { storyId: 's1', version: 'v2', state: 'removed' },
      { storyId: 's3', version: 'v1', state: 'synced' },
    ]);
    assert.equal(existsSync(join(config.interviewsDir, 'coll-a', 's1.json')), false);
    state = await loadState(config.stateFile);
    assert.deepEqual(Object.keys(state.items).sort(), ['s2', 's3']);
    assert.equal(state.lastSync?.state, 'succeeded');

    // Run 5: collection renamed -> items in it re-processed.
    current.collections = [collA, { ...collB, name: 'Coll B renamed' }];
    processed.length = 0;
    summary = await runSync(config, deps, 'test');
    assert.deepEqual(processed.sort(), ['coll-b:s2', 'coll-b:s3']);
    assert.equal(
      JSON.parse(await readFile(join(config.interviewsDir, 'coll-b', 'collection.json'), 'utf-8')).name,
      'Coll B renamed',
    );

    // Run 6: manifest failure -> failed run, state untouched.
    const before = await readFile(config.stateFile, 'utf-8');
    deps.publisher.getManifest = async () => {
      throw new Error('GET /manifest: 401 Unauthorized');
    };
    statuses.length = 0;
    summary = await runSync(config, deps, 'test');
    assert.equal(summary.state, 'failed');
    assert.equal(statuses[1].state, 'failed');
    assert.match(statuses[1].message ?? '', /401/);
    assert.deepEqual(JSON.parse(await readFile(config.stateFile, 'utf-8')).items, JSON.parse(before).items);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- inventory
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('inventory: items sorted, deduped, managed from state, story ids from state or cache', () => {
  const state: LocalState = {
    ...emptyState(),
    items: { s1: { ...local('coll-a', 's1', 'v1'), uuid: U(2) } },
  };
  const listed: ListedTestimony[] = [
    { uuid: U(3), collectionId: 'imported', title: 'Legacy' },
    { uuid: U(2), collectionId: 'coll-a', title: 'Synced' },
    { uuid: U(1), collectionId: 'imported', title: 'Unknown' },
    { uuid: U(3), collectionId: 'imported', title: 'Legacy' },
  ];
  const items = buildInventoryItems(listed, state, { [U(3)]: 'legacy-story' });
  assert.deepEqual(items, [
    { uuid: U(1), storyId: '', collectionId: 'imported', title: 'Unknown', managed: false },
    { uuid: U(2), storyId: 's1', collectionId: 'coll-a', title: 'Synced', managed: true },
    { uuid: U(3), storyId: 'legacy-story', collectionId: 'imported', title: 'Legacy', managed: false },
  ]);
  // Hash ignores input order and changes with content.
  const shuffled = buildInventoryItems([...listed].reverse(), state, { [U(3)]: 'legacy-story' });
  assert.equal(inventoryHash(shuffled), inventoryHash(items));
  assert.notEqual(inventoryHash(items.slice(1)), inventoryHash(items));
  assert.notEqual(inventoryHash([{ ...items[0], title: 'Renamed' }, ...items.slice(1)]), inventoryHash(items));
});

test('inventory: due when hash changed, never sent, or >= 24h since last send', () => {
  const now = Date.parse('2026-09-25T12:00:00.000Z');
  const sent = (ms: number) => ({
    cacheVersion: 1 as const,
    storyIds: {},
    lastSentHash: 'h',
    lastSentAt: new Date(ms).toISOString(),
  });
  assert.equal(inventoryDue('h', { cacheVersion: 1, storyIds: {} }, now), true);
  assert.equal(inventoryDue('h2', sent(now - 1000), now), true);
  assert.equal(inventoryDue('h', sent(now - 1000), now), false);
  assert.equal(inventoryDue('h', sent(now - INVENTORY_RESEND_MS + 1), now), false);
  assert.equal(inventoryDue('h', sent(now - INVENTORY_RESEND_MS), now), true);
});

test('inventory: story id parsed from the NLP transcription JSON', () => {
  assert.equal(storyIdFromTranscription(JSON.stringify({ id: '66f1', weaviate_uuid: 'x', sections: [] })), '66f1');
  assert.equal(storyIdFromTranscription('not json'), '');
  assert.equal(storyIdFromTranscription(undefined), '');
  assert.equal(storyIdFromTranscription(JSON.stringify({ sections: [] })), '');
});

test('reportInventory: resolves story ids once, sends on change / 24h, retries after failure', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'portal-sync-inv-'));
  try {
    const cacheFile = join(dir, 'inventory.json');
    const testimonies = new Map<string, FakeTestimony>([
      [U(1), { collectionId: 'imported', title: 'Legacy one', storyId: 'legacy1' }],
      [U(2), { collectionId: 'coll-a', title: 'Synced', storyId: 's1' }],
    ]);
    const fake = fakeWeaviate(testimonies, []);
    const sent: InventoryReport[] = [];
    let failPost = false;
    const deps = {
      weaviate: fake.weaviate,
      publisher: {
        postInventory: async (r: InventoryReport) => {
          if (failPost) throw new Error('POST /inventory: HTTP 503');
          sent.push(structuredClone(r));
        },
      },
    };
    const state: LocalState = { ...emptyState(), items: { s1: { ...local('coll-a', 's1', 'v1'), uuid: U(2) } } };
    let clock = Date.parse('2026-09-25T00:00:00.000Z');
    const now = () => new Date(clock);

    assert.equal(await reportInventory(cacheFile, deps, state, now), 'sent');
    assert.deepEqual(fake.storyIdLookups, [U(1)], 'only the unmanaged Testimony is looked up');
    assert.deepEqual(sent[0].items, [
      { uuid: U(1), storyId: 'legacy1', collectionId: 'imported', title: 'Legacy one', managed: false },
      { uuid: U(2), storyId: 's1', collectionId: 'coll-a', title: 'Synced', managed: true },
    ]);
    assert.equal(sent[0].generatedAt, now().toISOString());

    // Unchanged, 1h later: not sent, no new lookups.
    clock += 60 * 60 * 1000;
    assert.equal(await reportInventory(cacheFile, deps, state, now), 'unchanged');
    assert.equal(sent.length, 1);
    assert.deepEqual(fake.storyIdLookups, [U(1)]);

    // Changed, but the POST fails: not recorded, so the next call re-sends.
    testimonies.delete(U(1));
    failPost = true;
    await assert.rejects(reportInventory(cacheFile, deps, state, now), /503/);
    failPost = false;
    assert.equal(await reportInventory(cacheFile, deps, state, now), 'sent');
    assert.deepEqual(
      sent[1].items.map((i) => i.uuid),
      [U(2)],
    );
    assert.deepEqual((await loadInventoryCache(cacheFile)).storyIds, {}, 'cache pruned to present uuids');

    // Unchanged for 24h: re-sent.
    clock += INVENTORY_RESEND_MS;
    assert.equal(await reportInventory(cacheFile, deps, state, now), 'sent');
    assert.equal(sent.length, 3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- data version
test('data version: missing -> 1 -> 2, corrupt treated as 0, atomic JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'portal-sync-dv-'));
  try {
    const file = join(dir, 'nested', 'data-version.json');
    assert.equal(await readDataVersion(file), 0);
    assert.equal((await bumpDataVersion(file)).version, 1);
    const second = await bumpDataVersion(file, new Date('2026-09-25T00:00:00.000Z'));
    assert.deepEqual(JSON.parse(await readFile(file, 'utf-8')), { version: 2, updatedAt: '2026-09-25T00:00:00.000Z' });
    assert.equal(second.version, 2);
    await writeFile(file, '{oops');
    assert.equal(await readDataVersion(file), 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------- removals + inventory + data version in runSync
test('runSync: manifest removals (managed skip, already gone, files), inventory, data version', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'portal-sync-rm-'));
  try {
    const config = testConfig(dir);
    const collA = { id: 'coll-a', name: 'Coll A', description: 'A' };
    const current: Manifest = { protocol: 1, portalId: 'p1', collections: [collA], items: [] };
    const snapshots = new Map<string, ItemSnapshot>();
    const statuses: StatusReport[] = [];
    const inventories: InventoryReport[] = [];
    const deleted: string[] = [];
    let failInventory = false;

    // Legacy import: story "legacy1" under json/interviews/imported/ (old file name, {payload} wrapper
    // on one copy), and "legacy2" whose Testimony exists but has no file.
    const legacy1Uuid = testimonyUuid('imported', 'legacy1');
    const legacy2Uuid = testimonyUuid('imported', 'legacy2');
    const testimonies = new Map<string, FakeTestimony>([
      [legacy1Uuid, { collectionId: 'imported', title: 'Legacy 1', storyId: 'legacy1' }],
      [legacy2Uuid, { collectionId: 'imported', title: 'Legacy 2', storyId: 'legacy2' }],
      [testimonyUuid('imported', 'adopt'), { collectionId: 'imported', title: 'Adopt me', storyId: 'adopt' }],
    ]);
    await mkdir(join(config.interviewsDir, 'imported', 'sub'), { recursive: true });
    const legacyFileA = join(config.interviewsDir, 'imported', 'ts-portal-legacy-one-mp4.json');
    const legacyFileB = join(config.interviewsDir, 'imported', 'sub', 'copy.json');
    const otherFile = join(config.interviewsDir, 'imported', 'other.json');
    await writeFile(legacyFileA, JSON.stringify({ story: { _id: 'legacy1' }, transcript: {} }));
    await writeFile(legacyFileB, JSON.stringify({ payload: { story: { _id: 'legacy1' } } }));
    await writeFile(otherFile, JSON.stringify({ story: { _id: 'someone-else' } }));

    const fake = fakeWeaviate(testimonies, deleted);
    const deps: SyncDeps = {
      publisher: {
        getManifest: async () => structuredClone(current),
        getItem: async (id) => structuredClone(snapshots.get(id) ?? null),
        postStatus: async (r) => void statuses.push(structuredClone(r)),
        postInventory: async (r) => {
          if (failInventory) throw new Error('POST /inventory: HTTP 500');
          inventories.push(structuredClone(r));
        },
      },
      weaviate: fake.weaviate,
      nlp: {
        waitUntilReady: async () => {},
        processStory: async ({ payload, collection }) => {
          testimonies.set(testimonyUuid(collection.id, payload.story._id), {
            collectionId: collection.id,
            title: payload.story.title,
            storyId: payload.story._id,
          });
          return { chunks: 1 };
        },
      },
    };

    // Run 1: s1 synced; no removals yet. Inventory lists all 4, data version 1.
    current.items = [{ storyId: 's1', collectionId: 'coll-a', version: 'v1' }];
    snapshots.set('s1', snapshot('s1', 'v1', collA));
    let summary = await runSync(config, deps, 'test');
    assert.equal(summary.state, 'succeeded');
    assert.equal(inventories.length, 1);
    const s1Uuid = testimonyUuid('coll-a', 's1');
    assert.deepEqual(inventories[0].items.map((i) => [i.storyId, i.managed]).sort(), [
      ['adopt', false],
      ['legacy1', false],
      ['legacy2', false],
      ['s1', true],
    ]);
    assert.equal(inventories[0].items.find((i) => i.uuid === s1Uuid)?.collectionId, 'coll-a');
    assert.equal(await readDataVersion(config.dataVersionFile), 1);

    // Run 2: nothing changed -> no data version bump, inventory not re-sent.
    summary = await runSync(config, deps, 'test');
    assert.equal(summary.items.length, 0);
    assert.equal(await readDataVersion(config.dataVersionFile), 1);
    assert.equal(inventories.length, 1);

    // Run 3: removals for legacy1 (files), legacy2 (no file), a managed uuid (s1: ignored), an
    // uuid being adopted in this manifest (ignored), an already-gone uuid, and a malformed uuid.
    // "adopt" is published into collection "imported" (adoption keeps the uuid).
    const goneUuid = '11111111-2222-4333-8444-555555555555';
    current.items.push({ storyId: 'adopt', collectionId: 'imported', version: 'v1' });
    snapshots.set('adopt', snapshot('adopt', 'v1', { id: 'imported', name: 'Imported', description: '' }));
    current.removals = [
      { uuid: legacy1Uuid, storyId: 'legacy1', requestedAt: 'x' },
      { uuid: legacy2Uuid.toUpperCase(), storyId: 'legacy2' },
      { uuid: s1Uuid, storyId: 's1' },
      { uuid: testimonyUuid('imported', 'adopt'), storyId: 'adopt' },
      { uuid: goneUuid, storyId: '' },
      { uuid: 'not-a-uuid', storyId: 'x' },
    ];
    deleted.length = 0;
    statuses.length = 0;
    summary = await runSync(config, deps, 'test');
    assert.equal(summary.state, 'partial');
    assert.deepEqual(statuses[1].items, [
      { storyId: 'legacy1', uuid: legacy1Uuid, state: 'removed' },
      { storyId: 'legacy2', uuid: legacy2Uuid, state: 'removed' },
      { storyId: '', uuid: goneUuid, state: 'removed' },
      { storyId: 'x', uuid: 'not-a-uuid', state: 'failed', error: 'invalid uuid "not-a-uuid"' },
      { storyId: 'adopt', version: 'v1', state: 'synced' },
    ]);
    assert.deepEqual(deleted, [legacy1Uuid, legacy2Uuid, goneUuid], 'managed / adopted uuids never deleted');
    assert.equal(existsSync(legacyFileA), false);
    assert.equal(existsSync(legacyFileB), false);
    assert.equal(existsSync(otherFile), true);
    assert.equal(existsSync(join(config.interviewsDir, 'coll-a', 's1.json')), true);
    assert.equal(testimonies.has(s1Uuid), true);
    assert.equal(await readDataVersion(config.dataVersionFile), 2);
    const inv = inventories[inventories.length - 1];
    assert.deepEqual(inv.items.map((i) => [i.storyId, i.managed]).sort(), [
      ['adopt', true],
      ['s1', true],
    ]);

    // Run 4: publisher hasn't dropped the removals yet (e.g. inventory lost) -> re-applied as
    // already gone, still "removed"; the managed ones still skipped. Inventory failure doesn't fail the run.
    current.removals = current.removals.slice(0, 3);
    failInventory = true;
    deleted.length = 0;
    summary = await runSync(config, deps, 'test');
    assert.equal(summary.state, 'succeeded');
    assert.deepEqual(
      summary.items.map((i) => i.state),
      ['removed', 'removed'],
    );
    assert.deepEqual(deleted, [legacy1Uuid, legacy2Uuid]);
    assert.equal(await readDataVersion(config.dataVersionFile), 3);
    assert.equal(existsSync(config.lockFile), false, 'lock released after inventory failure');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function main() {
  let failures = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`ok   ${name}`);
    } catch (error) {
      failures += 1;
      console.log(`FAIL ${name}`);
      console.log(error);
    }
  }
  console.log(`\n${tests.length - failures}/${tests.length} passed`);
  process.exit(failures ? 1 : 0);
}

void main();
