# Portal Sync (Portal Publisher)

Portal Sync keeps a portal in step with what has been published to it in **Portal Publisher**.
It is the portal side of _Portal Sync Protocol v1_.

- **Pull, not push.** The `portal-sync` service asks the publisher for a manifest of what should
  be live, fetches snapshots of new or changed recordings, runs them through the NLP processor
  into Weaviate, and removes recordings that were unpublished. The publisher never gets
  credentials to your server, and the portal never needs a TheirStory token.
- **"Sync now" pings.** Portal Publisher can also POST a signed, data-free ping to
  `https://<your-domain>/api/portal-sync` after each publish or unpublish, so changes show up
  within a minute instead of at the next poll.

```
Portal Publisher ◀── GET manifest / items, POST status ── portal-sync (container)
      │                                                        ▲   │
      └── POST https://<domain>/api/portal-sync ─▶ frontend ───┘   ├─▶ json/interviews/<collection>/<story>.json
                (signed ping, forwarded as-is)                     ├─▶ nlp-processor /process-story ─▶ Weaviate
                                                                   └─▶ PORTAL_SYNC_POST_PROCESS_COMMAND (optional)
```

## What a sync run does

1. `GET {PORTAL_PUBLISHER_URL}/api/portal/v1/manifest` with `Authorization: Bearer $PORTAL_SYNC_TOKEN`.
2. Compares the manifest with the local state file, `json/.portal-sync/state.json`
   (`storyId → version, collectionId, Testimony UUID, file`).
3. **Removals first.** For each synced story that is no longer in the manifest, it deletes the
   story's `Chunks` (`theirstory_id == uuid`) and its `Testimonies` object from Weaviate,
   deletes its JSON file, and forgets it.
4. **Updates, one at a time** (NLP is heavy). For each story that is new, has a new `version`,
   moved to a different collection, or whose collection name or description changed:
   - `GET /api/portal/v1/items/{storyId}`
   - if the collection changed, deletes the old Testimony UUID and its file first
   - writes the payload to `json/interviews/<collectionId>/<storyId>.json`, or to
     `json/interviews/<collectionId>/<folder path>/<storyId>.json` when the item has a folder, so a
     later `weaviate:import` derives the same folder, plus
     `json/interviews/<collectionId>/collection.json` (`id`, `name`, `description`; any other
     keys you add, such as `image`, are kept)
   - `POST /process-story?write_to_weaviate=true&run_ner=true` to the NLP processor, which
     replaces that Testimony's chunks in place
   - runs `PORTAL_SYNC_POST_PROCESS_COMMAND`, if set
   - records the new version only if all of that succeeded. Failed items are retried on the next run.
5. `POST /api/portal/v1/status` at the start (`running`) and at the end (`succeeded`, `partial` or
   `failed`), with a result for every item the run touched.

Only stories that portal-sync itself synced are ever removed. Interviews you imported by hand
(`yarn weaviate:import`) are never touched, unless Portal Publisher publishes the same story into
the same collection id, in which case portal-sync takes it over (see [Existing data](#existing-data)).

The Testimony UUID is the same one `weaviate:import` and the NLP processor use:
`uuidV5("<collectionId lowercased>:<storyId>", URL namespace)` (`scripts/lib/testimony-ids.ts`).

## Configuration

Set these in `.env.production` (production compose) or `.env.local` (dev compose):

| Variable                                   | Default                          | Meaning                                                                                                                                                                   |
| ------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORTAL_PUBLISHER_URL`                     | (none)                           | Base URL of Portal Publisher, e.g. `https://publisher.theirstory.io`. **Required.**                                                                                       |
| `PORTAL_SYNC_TOKEN`                        | (none)                           | The `pps_…` token shown once when the portal was created in Portal Publisher. **Required.** Keep it secret. It is never logged.                                           |
| `PORTAL_SYNC_INTERVAL_MINUTES`             | `15`                             | How often to poll. `0` turns polling off, so syncs happen only at startup and on pings.                                                                                   |
| `PORTAL_SYNC_POST_PROCESS_COMMAND`         | (none)                           | Shell command (`sh -c`) run after each recording is (re)processed. Gets `STORY_ID`, `STORY_UUID`, `COLLECTION_ID`, `STORY_FILE`. A non-zero exit marks the item `failed`. |
| `PORTAL_SYNC_POST_PROCESS_TIMEOUT_MINUTES` | `60`                             | Kill the post-process command after this long (`0` = no limit).                                                                                                           |
| `PORTAL_SYNC_NLP_TIMEOUT_MINUTES`          | `30`                             | Timeout for one `/process-story` call.                                                                                                                                    |
| `PORTAL_SYNC_PORT`                         | `7171`                           | Port of the service's internal HTTP server. It is not published to the host.                                                                                              |
| `PORTAL_SYNC_HOST`                         | `portal-sync`                    | Used by the **frontend** to reach the service (`http://$PORTAL_SYNC_HOST:$PORTAL_SYNC_PORT/trigger`). Set it to `localhost` when you run both outside Docker.             |
| `PORTAL_VERSION`                           | package version                  | Reported as `portalVersion` in status reports. A git SHA works well here.                                                                                                 |
| `PORTAL_SYNC_STATE_FILE`                   | `./json/.portal-sync/state.json` | Where sync state lives.                                                                                                                                                   |
| `INTERVIEWS_DIR`                           | `./json/interviews`              | Same meaning as for `weaviate:import`.                                                                                                                                    |

Weaviate and NLP connection settings are the same ones the importer uses: `WEAVIATE_HOST_URL`,
`WEAVIATE_PORT`, `WEAVIATE_SECURE`, `WEAVIATE_ADMIN_KEY` (optional), and `NLP_HOST`, `NLP_PORT`,
`NLP_SECURE` (default `nlp-processor:7070`).

If `PORTAL_PUBLISHER_URL` or `PORTAL_SYNC_TOKEN` is missing, the service logs
`Portal sync is disabled` and idles. It does not crash-loop. `/api/portal-sync` then returns `503`.

## Enable it on a droplet

1. In Portal Publisher, create the portal (or rotate its token) and copy the `pps_…` token.
2. On the droplet, in the repo, add to `.env.production`:

   ```bash
   PORTAL_PUBLISHER_URL=https://publisher.theirstory.io
   PORTAL_SYNC_TOKEN=pps_...
   # optional
   PORTAL_SYNC_INTERVAL_MINUTES=15
   ```

3. Start (or recreate) the service, and the frontend so it picks up the new route and env:

   ```bash
   git pull
   docker compose -f docker-compose.prod.yml up -d --build portal-sync frontend
   docker compose -f docker-compose.prod.yml logs -f portal-sync
   ```

   `./scripts/deploy/deploy-prod.sh` also starts `portal-sync`, because it brings up every
   service in `docker-compose.prod.yml`.

4. In Portal Publisher, set the portal's **sync URL** to:

   ```
   https://<your-domain>/api/portal-sync
   ```

   The frontend route checks nothing itself. It forwards the raw body (8 KB max) and the
   `X-Portal-*` headers to the internal `portal-sync` service. That service verifies the
   HMAC-SHA256 signature (constant-time compare, timestamp within 5 minutes of now) and answers
   `202`. Pings that arrive during a run are merged into a single follow-up run.

You should see `Sync … started (startup)` and then `Sync … succeeded: N synced, …` in the logs.

### Health / status

```bash
docker compose -f docker-compose.prod.yml exec portal-sync \
  node -e "fetch('http://127.0.0.1:7171/health').then(r=>r.json()).then(console.log)"
cat json/.portal-sync/state.json   # lastSync + every synced item
```

## Manual runs and testing

A one-shot run (manual runs or cron) exits `0` on success and `1` on a failed or partial run:

```bash
# Inside Docker, using the service's env and volumes:
docker compose -f docker-compose.prod.yml run --rm portal-sync yarn portal-sync:once

# Locally, against a dev stack (Weaviate on :8081, NLP on :7070):
PORTAL_PUBLISHER_URL=https://publisher.theirstory.io PORTAL_SYNC_TOKEN=pps_... \
WEAVIATE_HOST_URL=localhost WEAVIATE_PORT=8081 NLP_HOST=localhost \
  yarn portal-sync:once
```

A run lock (`json/.portal-sync/state.json.lock`) stops a manual `--once` from colliding with
the running service. If the service is mid-run, the manual run logs that and exits `0`.

To check that the ping path works end to end, sign a ping yourself:

```bash
TOKEN=pps_...; BODY='{"portalId":"test","reason":"manual","requestedAt":"now"}'; TS=$(date +%s)
SIG=$(printf '%s' "$TS.$BODY" | openssl dgst -sha256 -hmac "$TOKEN" | awk '{print $NF}')
curl -i -X POST https://<your-domain>/api/portal-sync \
  -H 'Content-Type: application/json' -H "X-Portal-Timestamp: $TS" -H "X-Portal-Signature: sha256=$SIG" \
  -d "$BODY"      # expect HTTP 202
```

Unit tests (HMAC verification, manifest diffing, coalescing, the trigger server, and a full run
against in-memory fakes) need no running services:

```bash
yarn portal-sync:test
```

## Existing data

Portals that were filled with `theirstory:import-stories` + `weaviate:import` before sync was set up:

- **Same collection id.** If the publisher's `collectionId` matches the collection id the old
  import used (the `id` in that folder's `collection.json`, or the folder name), the Testimony
  UUID is the same. The first sync **replaces the Weaviate data in place**. No duplicates appear.
- **The old JSON file stays on disk.** The old importer named files `ts-portal-<title>-<format>.json`,
  often under `json/interviews/imported/`. Portal Sync writes `<collectionId>/<storyId>.json`
  and leaves the old file where it is. A later `yarn weaviate:import` (or `weaviate-init`) would
  import that file again. With the same collection id that re-import only overwrites the synced
  version with the older snapshot. With a **different** collection id (e.g. the default
  `imported`), the old copy is a separate Testimony and the story appears **twice**.

Clean up with the bundled helper, which finds JSON files whose story is now synced but that
are not the synced file:

```bash
docker compose -f docker-compose.prod.yml run --rm portal-sync yarn portal-sync:legacy          # dry run
docker compose -f docker-compose.prod.yml run --rm portal-sync yarn portal-sync:legacy --apply  # delete
```

`--apply` deletes those files. When a copy used a different collection id, it also deletes that
copy's Testimony and Chunks from Weaviate. Run it after the first successful sync.

Other notes:

- Don't edit files under `json/interviews/<collectionId>/` by hand for synced stories. The next
  change from the publisher overwrites them, and an unpublish deletes them.
- Deleting `json/.portal-sync/state.json` makes portal-sync treat everything as new. It then
  re-processes every item, which is safe but slow, and it can no longer remove stories that are
  missing from the manifest, because it doesn't know it ever had them.
- The state file is keyed by story id and doesn't care which portal a token belongs to. If you point
  a portal at a different Portal Publisher portal, every story from the old one is removed.

## Post-process hook (forks with extra enrichment)

Forks that run extra enrichment after the NLP step can hook it in. For example, the Stanford fork
runs Claude entity extraction:

```bash
PORTAL_SYNC_POST_PROCESS_COMMAND='yarn tsx scripts/extract-entities-claude.ts --uuid "$STORY_UUID"'
```

The command runs with the service's working directory (`/app`) and environment, plus
`STORY_ID`, `STORY_UUID` (the Testimony UUID), `COLLECTION_ID` and `STORY_FILE` (absolute path to
the JSON). `PORTAL_SYNC_TOKEN` is removed from its environment. Its output is logged with the
story id. A non-zero exit (or timeout) marks that item `failed`, so it is retried on the next
run: the NLP step runs again, then the command. Make the command idempotent.

## Files

- `scripts/portal-sync/`: the service (`index.ts` entry point, `sync.ts` the algorithm,
  `diff.ts` manifest diffing, `hmac.ts` ping verification, `server.ts` HTTP server, `legacy.ts`
  the cleanup helper, `selftest.ts` the tests)
- `scripts/lib/testimony-ids.ts`: the Testimony UUID and collection-id helpers, shared with
  `import-interviews-weaviate.ts`
- `app/api/portal-sync/route.ts`: public ping endpoint that forwards to the service
- `docker-compose.prod.yml` / `docker-compose.yml`: the `portal-sync` service
