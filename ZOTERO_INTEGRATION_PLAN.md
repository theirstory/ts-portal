# Zotero Integration Plan

## Context
TheirStory's research portal needs Zotero integration so users can save oral history interviews and timestamped transcript excerpts to their personal Zotero libraries. This adds academic research workflow support — researchers can authenticate once via OAuth, then cite whole interviews or highlighted portions directly from the portal. The Discover chat will also gain awareness of users' existing Zotero libraries for cross-referencing.

## Architecture Overview

**No new npm dependencies.** OAuth 1.0a signing uses Node.js `crypto`. Zotero REST API called with `fetch`. Credentials stored in encrypted HTTP-only cookies (AES-256-GCM). Feature-flagged via `config.json`.

## New Files (17)

### Foundation (`lib/zotero/`)
| File | Purpose |
|---|---|
| `lib/zotero/types.ts` | TypeScript types for Zotero items, OAuth tokens, sessions |
| `lib/zotero/crypto.ts` | AES-256-GCM encrypt/decrypt using `ZOTERO_COOKIE_SECRET` env var |
| `lib/zotero/cookies.ts` | Read/write/clear encrypted HTTP-only `zotero_session` cookie |
| `lib/zotero/oauth.ts` | OAuth 1.0a HMAC-SHA1 signature generation, request/access token helpers |
| `lib/zotero/client.ts` | Server-side Zotero API client: `createInterviewItem`, `createChildNote`, `searchUserLibrary` |

### API Routes (`app/api/zotero/`)
| File | Method | Purpose |
|---|---|---|
| `auth/request-token/route.ts` | POST | Get OAuth request token, return authorization URL |
| `auth/callback/route.ts` | GET | Exchange verifier for API key, set session cookie, redirect back |
| `auth/status/route.ts` | GET | Check if user is authenticated |
| `auth/logout/route.ts` | POST | Clear session cookie |
| `items/route.ts` | POST | Create interview item in user's Zotero library |
| `notes/route.ts` | POST | Create timestamped child note on a parent item |
| `search/route.ts` | POST | Search user's Zotero library (used by chat) |

### Client-Side
| File | Purpose |
|---|---|
| `app/stores/useZoteroStore.ts` | Zustand store: auth state, save actions, last saved item key |
| `components/zotero/ZoteroAuthButton.tsx` | Connect/disconnect button for AppTopBar |
| `components/zotero/ZoteroSaveInterviewButton.tsx` | "Save to Zotero" button for StoryMetadata panel |
| `components/zotero/ZoteroSaveSelectionButton.tsx` | Save highlighted transcript portion as Zotero note |
| `app/hooks/useTranscriptSelection.ts` | Reads `data-word-start`/`data-word-end` from selected spans |

## Modified Files (9)

| File | Change |
|---|---|
| `config/organizationConfig.ts` | Add `isZoteroEnabled` convenience export |
| `config.json` + `config.example.json` | Add `features.zotero: { enabled: false }` |
| `.env.example` | Add `ZOTERO_CLIENT_KEY`, `ZOTERO_CLIENT_SECRET`, `ZOTERO_COOKIE_SECRET` |
| `components/AppTopBar/AppTopBar.tsx` | Add `ZoteroAuthButton` (gated by feature flag) |
| `StoryMetadata.tsx` | Add `ZoteroSaveInterviewButton` below interview title |
| `StoryTranscriptToolbar.tsx` | Add `ZoteroSaveSelectionButton` next to cite button |
| `StoryTranscriptToolbarMenuMobile.tsx` | Add "Save to Zotero" menu item |
| `app/api/discover/route.ts` | Search user's Zotero library, inject as context in system prompt |
| `types/chat.ts` | Add `ZoteroContextItem`, extend `ChatRequest`/`ChatStreamChunk` |

## OAuth 1.0a Flow

```
Client                    Server                      Zotero
  |-- POST /api/zotero/auth/request-token ------------>|
  |                         |-- POST /oauth/request -->|
  |                         |<-- oauth_token ----------|
  |                         | (store token_secret in   |
  |                         |  encrypted pending cookie)|
  |<-- { authorizationUrl } |                          |
  |-- redirect to Zotero -------------------------------->|
  |                                                    |
  |<-- redirect to /api/zotero/auth/callback?token&verifier
  |                         |-- POST /oauth/access --->|
  |                         |<-- api_key + userID -----|
  |                         | (set zotero_session cookie)
  |<-- redirect to original page with ?zotero=connected
```

After OAuth, the `oauth_token` from the access response IS the API key. All subsequent Zotero API calls use `Zotero-API-Key: <key>` header — no further OAuth signing.

## Citation Flows

### Save Whole Interview
1. User clicks "Save to Zotero" in StoryMetadata
2. `POST /api/zotero/items` with interview metadata from `storyHubPage.properties`
3. Creates Zotero `interview` item type with: title, interviewee/interviewer creators, date, medium (audio/video), portal URL, archive name, description
4. Stores returned `itemKey` in `useZoteroStore.lastSavedItemKey`

### Save Transcript Selection
1. User highlights words in transcript (words have `data-word-start`/`data-word-end`)
2. `useTranscriptSelection` hook extracts `{ selectedText, startTime, endTime }`
3. User clicks Zotero save button in toolbar
4. If no `lastSavedItemKey` → first saves the parent interview item
5. `POST /api/zotero/notes` creates child note with HTML:
   ```html
   <p><strong>Transcript excerpt</strong> (00:14:32 – 00:16:45)</p>
   <blockquote>Selected transcript text here...</blockquote>
   <p>Speaker: Jane Doe | Section: Early Childhood</p>
   <p>Source: <a href="https://portal.url/story/uuid?start=872&end=1005">Interview Title</a></p>
   ```

## Chat Integration
When user is Zotero-authenticated and uses Discover chat:
1. `useChatStore.sendMessage` includes `includeZoteroContext: true` in request
2. `/api/discover` route reads `zotero_session` cookie, searches user's library with query
3. Zotero results appended to system prompt as `ZOTERO LIBRARY CONTEXT:` section
4. AI can reference items as `[Z1]`, `[Z2]` and note they're from the user's personal library

## Environment Variables
```
ZOTERO_CLIENT_KEY=          # OAuth consumer key from zotero.org/oauth/apps
ZOTERO_CLIENT_SECRET=       # OAuth consumer secret
ZOTERO_COOKIE_SECRET=       # 32-byte hex for AES-256-GCM (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

## Implementation Order
1. **Foundation**: types → crypto → cookies → oauth → client → config changes
2. **OAuth routes**: request-token → callback → status → logout
3. **Client auth**: Zustand store → ZoteroAuthButton → AppTopBar integration
4. **Save interview**: items route → ZoteroSaveInterviewButton → StoryMetadata integration
5. **Save selection**: selection hook → notes route → ZoteroSaveSelectionButton → toolbar integration
6. **Chat**: search route → chat types → discover route → chat store updates

## Verification
1. Set env vars, enable `features.zotero` in config.json, run `yarn dev`
2. Verify "Connect Zotero" appears in AppTopBar
3. Click connect → complete OAuth flow on Zotero.org → verify redirect back with authenticated state
4. Navigate to a story page → verify "Save to Zotero" button in metadata panel
5. Click save → verify interview item appears in Zotero library
6. Select transcript text → verify save selection button enables → click → verify note appears as child of interview item in Zotero
7. Open Discover chat → ask a question → verify Zotero library context appears in response
8. Disconnect → verify all Zotero UI elements hide/disable

## Key Design Decisions

- **HTTP-only cookies** for credentials (not localStorage) — prevents XSS exposure of Zotero API key
- **AES-256-GCM encryption** on cookie — protects key even if cookie value observed in logs
- **No new npm deps** — OAuth 1.0a signing is ~50 lines with Node.js `crypto`
- **`lastSavedItemKey` in Zustand** — avoids creating duplicate interview items when saving multiple excerpts
- **Server-side Zotero search** in chat route — credentials never sent to client
- **Feature-flagged** — disabled by default, no impact on existing deployments
