import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

type CliOptions = {
  storyIds: string[];
  projectId: string;
  folderId: string;
  pageSize: number;
  concurrency: number;
  validate: boolean;
  generateMissing: boolean;
  skipInvalid: boolean;
  unpublish: boolean;
  outDir: string;
  token: string;
  format: string;
  force: boolean;
  apiBaseUrl: string;
  origin: string;
  referer: string;
};

type PublishMediaResponse = {
  url?: string;
};

type StoryListItem = {
  _id?: string;
  custom_archive_media_type?: string;
};

type StoryMediaFormat = 'video' | 'audio';

type StoryDetails = {
  id: string;
  mediaType: string;
  publishFormat: StoryMediaFormat;
  transcriptPayload: Record<string, unknown>;
};

type PublishedMediaStatusResponse = {
  published?: boolean;
  isPublished?: boolean;
  status?: string;
  url?: string;
  published_url?: string;
  mediaUrl?: string;
  media_url?: string;
};

type PublishedMediaStatus = {
  isPublished: boolean;
  url: string;
};

type ValidationResult = {
  storyId: string;
  missingFields: string[];
};

type ProcessResult =
  | {
      mode: 'validate';
      validation: ValidationResult;
    }
  | {
      mode: 'other';
    };

const SUMMARY_PROMPTS = {
  system: 'You are a writer that creates summaries',
  user: 'Do not mention the messages and treat them as a whole. The messages constitute the transcript of a recording, which is most likely an interview. The summary should give a researcher a general overview of the key topics discussed in the recording, so that the researcher can decide wheter or not the recording is relevant to their research. The summary should be no more than 100 words, although it can be less.',
};

const INDEX_PROMPTS = {
  system: 'You are a writer that creates indexes',
  user: 'Please create an index for this interview.\nEach chapter of the index should contain:\n1) a timecode signifying the start of the chapter. The timecode should have hours, minutes and seconds, not milliseconds.;\n2) a title for the chapter;\n3) a summary of the chapter;\n4) keywords separated by commas.\nI want a JSON object with an array of chapter with the attributes',
};

const VALIDATION_RECHECK_DELAY_MS = 15_000;
const VALIDATION_RECHECK_ATTEMPTS = 20;

function slugifyFilePart(input: string): string {
  const normalized = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'untitled';
}

function extractMuxPlaybackId(videoUrl: string): string {
  const match = videoUrl.match(/https?:\/\/stream\.mux\.com\/([^/]+)\//i);
  if (!match?.[1]) {
    throw new Error(`Could not extract mux_playback_id from videoURL: ${videoUrl}`);
  }

  return match[1];
}

function buildOutputFileName(
  payload: Record<string, unknown>,
  storyId: string,
  publishFormat: StoryMediaFormat,
): string {
  const story =
    payload.story && typeof payload.story === 'object' && !Array.isArray(payload.story)
      ? (payload.story as Record<string, unknown>)
      : null;
  const storyTitle = typeof story?.title === 'string' ? story.title : storyId;
  const safeTitle = slugifyFilePart(storyTitle);

  return `ts-portal-${safeTitle}-${publishFormat}.json`;
}

function printHelp(): void {
  console.log(`
Usage:
  yarn theirstory:import-stories --ids <id1,id2,...> [--out-dir json/interviews/imported]
  yarn theirstory:import-stories --ids-file ./story-ids.txt
  yarn theirstory:import-stories --project-id <projectId> [--page-size 15]
  yarn theirstory:import-stories --folder-id <folderId> [--page-size 15]
  yarn theirstory:import-stories --ids <id1,id2,...> --unpublish
  yarn theirstory:import-stories --project-id <projectId> --validate
  yarn theirstory:import-stories --project-id <projectId> --validate --generate-missing
  yarn theirstory:import-stories --project-id <projectId> --skip-invalid
  yarn theirstory:import-stories --folder-id <folderId> --concurrency 5

Options:
  --ids         Comma, whitespace, or newline-separated story IDs
  --ids-file    .txt or .json file with story IDs
  --project-id  TheirStory project ID to fetch story IDs from
  --folder-id   TheirStory folder ID to fetch story IDs from
  --page-size   Number of stories per project page. Default: 15
  --concurrency Number of stories to process in parallel. Default: 3
  --validate    Only validate required fields. No publish, unpublish, or file writes
  --generate-missing In validate mode, generate missing indexes and summaries, then re-check
  --skip-invalid Skip stories missing required fields during import
  --unpublish   Call unpublish_media instead of generating import JSON files
  --out-dir     Directory where JSON files will be written
  --token       Authorization token. Recommended: use THEIRSTORY_AUTH_TOKEN
  --format      Override publish_media format for every story: video or audio
  --force       Overwrite existing files
  --help        Show this help message

Environment variables:
  THEIRSTORY_AUTH_TOKEN
  THEIRSTORY_API_BASE_URL   Default: https://node.theirstory.io
  THEIRSTORY_ORIGIN         Default: https://lab.theirstory.io
  THEIRSTORY_REFERER        Default: https://lab.theirstory.io/
`);
}

function parseListInput(raw: string): string[] {
  return raw
    .split(/[\s,]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function loadStoryIdsFromFile(path: string): Promise<string[]> {
  const raw = await readFile(path, 'utf-8');
  const trimmed = raw.trim();

  if (!trimmed) {
    return [];
  }

  if (basename(path).toLowerCase().endsWith('.json')) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error(`File ${path} must contain a JSON array of story IDs.`);
    }

    return parsed.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
  }

  return parseListInput(trimmed);
}

function parseArgs(argv: string[]): Promise<CliOptions> | CliOptions {
  const options: CliOptions = {
    storyIds: [],
    projectId: '',
    folderId: '',
    pageSize: 15,
    concurrency: 3,
    validate: false,
    generateMissing: false,
    skipInvalid: false,
    unpublish: false,
    outDir: 'json/interviews/imported',
    token: process.env.THEIRSTORY_AUTH_TOKEN ?? '',
    format: '',
    force: false,
    apiBaseUrl: process.env.THEIRSTORY_API_BASE_URL ?? 'https://node.theirstory.io',
    origin: process.env.THEIRSTORY_ORIGIN ?? 'https://lab.theirstory.io',
    referer: process.env.THEIRSTORY_REFERER ?? 'https://lab.theirstory.io/',
  };

  let idsFilePath = '';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--force') {
      options.force = true;
      continue;
    }

    if (arg === '--unpublish') {
      options.unpublish = true;
      continue;
    }

    if (arg === '--validate') {
      options.validate = true;
      continue;
    }

    if (arg === '--generate-missing') {
      options.generateMissing = true;
      continue;
    }

    if (arg === '--skip-invalid') {
      options.skipInvalid = true;
      continue;
    }

    const value = argv[i + 1];
    if (!value) {
      throw new Error(`Missing value for ${arg}`);
    }

    switch (arg) {
      case '--ids':
        options.storyIds = parseListInput(value);
        i++;
        break;
      case '--ids-file':
        idsFilePath = value;
        i++;
        break;
      case '--project-id':
        options.projectId = value;
        i++;
        break;
      case '--folder-id':
        options.folderId = value;
        i++;
        break;
      case '--page-size':
        options.pageSize = Number.parseInt(value, 10);
        i++;
        break;
      case '--concurrency':
        options.concurrency = Number.parseInt(value, 10);
        i++;
        break;
      case '--out-dir':
        options.outDir = value;
        i++;
        break;
      case '--token':
        options.token = value;
        i++;
        break;
      case '--format':
        options.format = value;
        i++;
        break;
      case '--api-base-url':
        options.apiBaseUrl = value;
        i++;
        break;
      case '--origin':
        options.origin = value;
        i++;
        break;
      case '--referer':
        options.referer = value;
        i++;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.storyIds.length && idsFilePath) {
    return loadStoryIdsFromFile(idsFilePath).then((storyIds) => ({
      ...options,
      storyIds,
    }));
  }

  return options;
}

type ProjectStoriesResponse = {
  page?: number;
  total?: number;
  items?: StoryListItem[];
  pageSize?: number;
};

function buildHeaders(options: CliOptions): HeadersInit {
  return {
    accept: 'application/json',
    'accept-language': 'es-419,es;q=0.9',
    authorization: options.token,
    'content-type': 'application/json',
    origin: options.origin,
    priority: 'u=1, i',
    referer: options.referer,
    'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'user-agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
  };
}

function resolvePublishFormat(mediaType: string, formatOverride: string): StoryMediaFormat {
  if (formatOverride === 'video' || formatOverride === 'audio') {
    return formatOverride;
  }

  const normalizedMediaType = mediaType.toLowerCase();
  if (normalizedMediaType.includes('video') || normalizedMediaType.includes('vodeo')) {
    return 'video';
  }

  return 'audio';
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON response: ${text}`);
  }
}

async function readSuccessResponse(response: Response): Promise<void> {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchStoryDetails(storyId: string, options: CliOptions): Promise<StoryDetails> {
  const response = await fetch(`${options.apiBaseUrl}/transcripts/${storyId}`, {
    method: 'GET',
    headers: buildHeaders(options),
  });

  const payload = await readJsonResponse<unknown>(response);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`transcripts/${storyId} did not return a JSON object`);
  }

  const transcriptPayload = payload as Record<string, unknown>;
  const story =
    transcriptPayload.story && typeof transcriptPayload.story === 'object' && !Array.isArray(transcriptPayload.story)
      ? (transcriptPayload.story as Record<string, unknown>)
      : null;
  const mediaType = typeof story?.custom_archive_media_type === 'string' ? story.custom_archive_media_type.trim() : '';
  const publishFormat = resolvePublishFormat(mediaType, options.format);

  return {
    id: storyId,
    mediaType,
    publishFormat,
    transcriptPayload,
  };
}

async function generateIndexes(storyId: string, options: CliOptions): Promise<void> {
  const prompts = encodeURIComponent(JSON.stringify(INDEX_PROMPTS));
  const response = await fetch(`${options.apiBaseUrl}/transcripts/${storyId}/chatgpt_index?prompts=${prompts}`, {
    method: 'GET',
    headers: buildHeaders(options),
  });

  await readSuccessResponse(response);
}

async function generateSummary(storyId: string, options: CliOptions): Promise<void> {
  const prompts = encodeURIComponent(JSON.stringify(SUMMARY_PROMPTS));
  const response = await fetch(`${options.apiBaseUrl}/transcripts/${storyId}/chatgpt_summary?prompts=${prompts}`, {
    method: 'GET',
    headers: buildHeaders(options),
  });

  await readSuccessResponse(response);
}

async function fetchPublishedMediaUrl(storyId: string, format: StoryMediaFormat, options: CliOptions): Promise<string> {
  const response = await fetch(`${options.apiBaseUrl}/stories/${storyId}/publish_media`, {
    method: 'POST',
    headers: buildHeaders(options),
    body: JSON.stringify({ format }),
  });

  const payload = await readJsonResponse<PublishMediaResponse>(response);
  if (!payload.url) {
    throw new Error(`publish_media did not return a URL for ${storyId}`);
  }

  return payload.url;
}

function parsePublishedMediaStatus(payload: unknown): PublishedMediaStatus {
  if (typeof payload === 'boolean') {
    return { isPublished: payload, url: '' };
  }

  if (typeof payload === 'string') {
    return { isPublished: payload.toLowerCase() === 'published', url: '' };
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { isPublished: false, url: '' };
  }

  const typedPayload = payload as PublishedMediaStatusResponse;
  const publishedUrlCandidates = [
    typedPayload.url,
    typedPayload.published_url,
    typedPayload.mediaUrl,
    typedPayload.media_url,
  ];
  const publishedUrl = publishedUrlCandidates.find((value) => typeof value === 'string' && value.trim())?.trim() ?? '';
  const publishedFromStatus =
    typeof typedPayload.published === 'boolean'
      ? typedPayload.published
      : typeof typedPayload.isPublished === 'boolean'
        ? typedPayload.isPublished
        : typeof typedPayload.status === 'string'
          ? typedPayload.status.toLowerCase() === 'published'
          : false;

  return {
    isPublished: publishedFromStatus || Boolean(publishedUrl),
    url: publishedUrl,
  };
}

async function fetchPublishedMediaStatus(
  storyId: string,
  format: StoryMediaFormat,
  options: CliOptions,
): Promise<PublishedMediaStatus> {
  const response = await fetch(`${options.apiBaseUrl}/stories/${storyId}/published_media_status?format=${format}`, {
    method: 'GET',
    headers: buildHeaders(options),
  });

  const payload = await readJsonResponse<unknown>(response);
  return parsePublishedMediaStatus(payload);
}

async function unpublishMedia(storyId: string, format: StoryMediaFormat, options: CliOptions): Promise<void> {
  const response = await fetch(`${options.apiBaseUrl}/stories/${storyId}/unpublish_media`, {
    method: 'POST',
    headers: buildHeaders(options),
    body: JSON.stringify({ format }),
  });

  await readJsonResponse<unknown>(response);
}

async function fetchPaginatedStoryItems(
  resourceType: 'projects' | 'folders',
  resourceId: string,
  options: CliOptions,
): Promise<StoryListItem[]> {
  const stories: StoryListItem[] = [];
  let page = 1;
  let total: number | null = null;

  while (true) {
    const response = await fetch(
      `${options.apiBaseUrl}/${resourceType}/${resourceId}/stories?pageSize=${options.pageSize}&page=${page}`,
      {
        method: 'GET',
        headers: buildHeaders(options),
      },
    );

    const payload = await readJsonResponse<ProjectStoriesResponse>(response);
    const items = Array.isArray(payload.items) ? payload.items : [];

    if (typeof payload.total === 'number' && Number.isFinite(payload.total)) {
      total = payload.total;
    }

    console.log(
      `[theirstory-import] ${resourceType.slice(0, -1)} ${resourceId}: fetched page ${page} with ${items.length} stories.`,
    );

    stories.push(...items);

    if (items.length === 0) {
      break;
    }

    if (total !== null && stories.length >= total) {
      break;
    }

    if (items.length < options.pageSize) {
      break;
    }

    page += 1;
  }

  return stories;
}

async function fetchProjectStoryIds(projectId: string, options: CliOptions): Promise<string[]> {
  const items = await fetchPaginatedStoryItems('projects', projectId, options);
  return [...new Set(items.map((item) => (typeof item?._id === 'string' ? item._id.trim() : '')).filter(Boolean))];
}

async function fetchFolderStoryIds(folderId: string, options: CliOptions): Promise<string[]> {
  const items = await fetchPaginatedStoryItems('folders', folderId, options);
  return [...new Set(items.map((item) => (typeof item?._id === 'string' ? item._id.trim() : '')).filter(Boolean))];
}

function validateStoryPayload(storyId: string, payload: Record<string, unknown>): ValidationResult {
  const missingFields: string[] = [];
  const transcript =
    payload.transcript && typeof payload.transcript === 'object' && !Array.isArray(payload.transcript)
      ? (payload.transcript as Record<string, unknown>)
      : null;
  const story =
    payload.story && typeof payload.story === 'object' && !Array.isArray(payload.story)
      ? (payload.story as Record<string, unknown>)
      : null;
  const transcriptValue = transcript?.transcript;
  const hasTranscriptText = typeof transcriptValue === 'string' && transcriptValue.trim().length > 0;
  const hasTranscriptWords = Array.isArray(transcript?.words) && transcript.words.length > 0;
  const hasTranscriptParagraphs = Array.isArray(transcript?.paragraphs) && transcript.paragraphs.length > 0;
  const hasTranscript = hasTranscriptText || hasTranscriptWords || hasTranscriptParagraphs;
  const indexes = Array.isArray(story?.indexes)
    ? story.indexes
    : Array.isArray((payload as Record<string, unknown>).indexes)
      ? ((payload as Record<string, unknown>).indexes as unknown[])
      : [];
  const description = typeof story?.description === 'string' ? story.description.trim() : '';

  if (!hasTranscript) {
    missingFields.push('transcript.transcript');
  }

  if (indexes.length === 0) {
    missingFields.push('story.indexes');
  }

  if (!description) {
    missingFields.push('story.description');
  }

  return {
    storyId,
    missingFields,
  };
}

async function generateMissingValidationFields(
  storyId: string,
  validation: ValidationResult,
  options: CliOptions,
): Promise<void> {
  const wantsIndexes = validation.missingFields.includes('story.indexes');
  const wantsDescription = validation.missingFields.includes('story.description');

  if (!wantsIndexes && !wantsDescription) {
    return;
  }

  if (wantsIndexes) {
    console.log(`[theirstory-import] ${storyId}: generating missing story.indexes...`);
    await generateIndexes(storyId, options);
  }

  if (wantsDescription) {
    console.log(`[theirstory-import] ${storyId}: generating missing story.description...`);
    await generateSummary(storyId, options);
  }
}

async function recheckValidationAfterGeneration(storyId: string, options: CliOptions): Promise<ValidationResult> {
  for (let attempt = 1; attempt <= VALIDATION_RECHECK_ATTEMPTS; attempt++) {
    await sleep(VALIDATION_RECHECK_DELAY_MS);

    const storyDetails = await fetchStoryDetails(storyId, options);
    const validation = validateStoryPayload(storyId, storyDetails.transcriptPayload);

    if (validation.missingFields.length === 0) {
      return validation;
    }

    console.log(
      `[theirstory-import] ${storyId}: recheck ${attempt}/${VALIDATION_RECHECK_ATTEMPTS}, still missing ${validation.missingFields.join(', ')}.`,
    );
  }

  const finalStoryDetails = await fetchStoryDetails(storyId, options);
  return validateStoryPayload(storyId, finalStoryDetails.transcriptPayload);
}

function printValidationSummary(results: ValidationResult[]): void {
  const passed = results.filter((result) => result.missingFields.length === 0);
  const failed = results.filter((result) => result.missingFields.length > 0);
  const groupedMissingFields = new Map<string, string[]>();

  for (const result of failed) {
    for (const field of result.missingFields) {
      const storyIds = groupedMissingFields.get(field) ?? [];
      storyIds.push(result.storyId);
      groupedMissingFields.set(field, storyIds);
    }
  }

  console.log('[theirstory-import] ========================================');
  console.log('[theirstory-import] 📋 Validation Summary');
  console.log('[theirstory-import] ----------------------------------------');
  console.log(`[theirstory-import]   Total stories: ${results.length}`);
  console.log(`[theirstory-import]   ✅ Passed: ${passed.length}`);
  console.log(`[theirstory-import]   ❌ Failed: ${failed.length}`);

  for (const [field, storyIds] of groupedMissingFields.entries()) {
    console.log('[theirstory-import] ----------------------------------------');
    console.log(`[theirstory-import]   ⚠ Missing ${field}: ${storyIds.length}`);
    console.log(`[theirstory-import]     ${storyIds.join(', ')}`);
  }

  console.log('[theirstory-import] ========================================');
}

async function processStory(storyId: string, options: CliOptions): Promise<ProcessResult> {
  console.log(`[theirstory-import] Processing ${storyId}...`);

  const storyDetails = await fetchStoryDetails(storyId, options);
  const validation = validateStoryPayload(storyId, storyDetails.transcriptPayload);

  if (options.validate) {
    if (validation.missingFields.length === 0) {
      console.log(`[theirstory-import] ${storyId}: validation passed.`);
    } else {
      console.log(`[theirstory-import] ${storyId}: missing ${validation.missingFields.join(', ')}.`);

      if (options.generateMissing) {
        await generateMissingValidationFields(storyId, validation, options);
        console.log(
          `[theirstory-import] ${storyId}: rechecking validation. Metadata generation can take a few minutes...`,
        );

        const recheckedValidation = await recheckValidationAfterGeneration(storyId, options);

        if (recheckedValidation.missingFields.length === 0) {
          console.log(`[theirstory-import] ${storyId}: validation passed after regeneration.`);
        } else {
          console.log(
            `[theirstory-import] ${storyId}: still missing ${recheckedValidation.missingFields.join(', ')} after regeneration.`,
          );
        }

        return {
          mode: 'validate',
          validation: recheckedValidation,
        };
      }
    }

    return {
      mode: 'validate',
      validation,
    };
  }

  if (!options.unpublish && validation.missingFields.length > 0) {
    const missingFieldsText = validation.missingFields.join(', ');

    if (options.skipInvalid) {
      console.log(`[theirstory-import] ${storyId}: skipping invalid story. Missing ${missingFieldsText}.`);
      return { mode: 'other' };
    }

    throw new Error(`${storyId}: missing required fields: ${missingFieldsText}`);
  }

  const publishedStatus = await fetchPublishedMediaStatus(storyId, storyDetails.publishFormat, options);

  if (options.unpublish) {
    if (!publishedStatus.isPublished) {
      console.log(
        `[theirstory-import] ${storyId}: media type "${storyDetails.mediaType || 'unknown'}" is already unpublished for "${storyDetails.publishFormat}". Skipping.`,
      );
      return { mode: 'other' };
    }

    await unpublishMedia(storyId, storyDetails.publishFormat, options);
    console.log(
      `[theirstory-import] ${storyId}: media type "${storyDetails.mediaType || 'unknown'}" -> unpublished as "${storyDetails.publishFormat}".`,
    );
    return { mode: 'other' };
  }

  let publishedVideoUrl = publishedStatus.url;

  if (publishedStatus.isPublished) {
    console.log(
      `[theirstory-import] ${storyId}: media type "${storyDetails.mediaType || 'unknown'}" is already published as "${storyDetails.publishFormat}". Skipping publish and reusing existing media URL.`,
    );
  }
  if (!publishedVideoUrl) {
    publishedVideoUrl = await fetchPublishedMediaUrl(storyId, storyDetails.publishFormat, options);
  }
  const muxPlaybackId = extractMuxPlaybackId(publishedVideoUrl);
  const finalPayload = {
    ...storyDetails.transcriptPayload,
    videoURL: publishedVideoUrl,
    mux_playback_id: muxPlaybackId,
  };

  const outPath = resolve(join(options.outDir, buildOutputFileName(finalPayload, storyId, storyDetails.publishFormat)));

  try {
    await writeFile(outPath, `${JSON.stringify(finalPayload, null, 2)}\n`, {
      encoding: 'utf-8',
      flag: options.force ? 'w' : 'wx',
    });
  } catch (error) {
    if (!options.force && typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST') {
      console.log(
        `[theirstory-import] ${storyId}: output file already exists at ${outPath}. Skipping write. Use --force to overwrite.`,
      );
      return { mode: 'other' };
    }

    throw error;
  }

  console.log(
    `[theirstory-import] ${storyId}: media type "${storyDetails.mediaType || 'unknown'}" -> publish format "${storyDetails.publishFormat}".`,
  );
  console.log(`[theirstory-import] Saved ${outPath}`);
  return { mode: 'other' };
}

async function processStoriesWithConcurrency(storyIds: string[], options: CliOptions): Promise<ProcessResult[]> {
  const results: ProcessResult[] = new Array(storyIds.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= storyIds.length) {
        return;
      }

      results[currentIndex] = await processStory(storyIds[currentIndex], options);
    }
  }

  const workerCount = Math.min(options.concurrency, storyIds.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function main(): Promise<void> {
  const maybeOptions = parseArgs(process.argv.slice(2));
  const options = maybeOptions instanceof Promise ? await maybeOptions : maybeOptions;

  if (!options.token) {
    throw new Error('Missing token. Use --token or set THEIRSTORY_AUTH_TOKEN.');
  }

  if (!Number.isInteger(options.pageSize) || options.pageSize <= 0) {
    throw new Error('Invalid --page-size value. It must be a positive integer.');
  }

  if (!Number.isInteger(options.concurrency) || options.concurrency <= 0) {
    throw new Error('Invalid --concurrency value. It must be a positive integer.');
  }

  if (!options.storyIds.length && options.projectId) {
    options.storyIds = await fetchProjectStoryIds(options.projectId, options);
  }

  if (!options.storyIds.length && options.folderId) {
    options.storyIds = await fetchFolderStoryIds(options.folderId, options);
  }

  if (!options.storyIds.length) {
    throw new Error('No story IDs found. Use --ids, --ids-file, --project-id, or --folder-id.');
  }

  if (options.validate && options.unpublish) {
    throw new Error('Cannot use --validate and --unpublish together.');
  }

  if (options.generateMissing && !options.validate) {
    throw new Error('Cannot use --generate-missing without --validate.');
  }

  if (!options.unpublish && !options.validate) {
    await mkdir(resolve(options.outDir), { recursive: true });
  }

  const uniqueStoryIds = [...new Set(options.storyIds)];
  console.log(`[theirstory-import] Stories to import: ${uniqueStoryIds.length}`);
  console.log(
    `[theirstory-import] Mode: ${options.validate ? 'validate' : options.unpublish ? 'unpublish' : 'import'}`,
  );
  console.log(`[theirstory-import] Concurrency: ${options.concurrency}`);
  if (!options.unpublish && !options.validate) {
    console.log(`[theirstory-import] Output directory: ${resolve(options.outDir)}`);
  }

  const results = await processStoriesWithConcurrency(uniqueStoryIds, options);

  if (options.validate) {
    const validationResults = results
      .filter((result): result is Extract<ProcessResult, { mode: 'validate' }> => result.mode === 'validate')
      .map((result) => result.validation);
    printValidationSummary(validationResults);
  }

  console.log(
    `[theirstory-import] ${options.validate ? 'Validation' : options.unpublish ? 'Unpublish' : 'Import'} completed.`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[theirstory-import] Error: ${message}`);
  process.exit(1);
});
