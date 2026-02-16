// scripts/init-schema.ts
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

type WeaviateProperty = {
  name: string;
  dataType: string[];
  description?: string;
  tokenization?: string;
  indexFilterable?: boolean;
  indexSearchable?: boolean;
  indexRangeFilters?: boolean;
  moduleConfig?: Record<string, unknown>;
  nestedProperties?: any[];
};

type WeaviateClassSchema = {
  class: string;
  description?: string;
  properties: WeaviateProperty[];
  vectorizer?: string;
  vectorConfig?: Record<string, unknown>;
  invertedIndexConfig?: Record<string, unknown>;
  replicationConfig?: Record<string, unknown>;
  shardingConfig?: Record<string, unknown>;
  multiTenancyConfig?: Record<string, unknown>;
  moduleConfig?: Record<string, unknown>;
};

function buildWeaviateUrl(): string {
  const host = process.env.WEAVIATE_HOST_URL ?? 'weaviate';
  const port = process.env.WEAVIATE_PORT ?? '8080';
  const secure = process.env.WEAVIATE_SECURE === 'true';
  return `${secure ? 'https' : 'http'}://${host}:${port}`;
}

const WEAVIATE_URL = buildWeaviateUrl();
const SCHEMAS_DIR = process.env.WEAVIATE_SCHEMAS_DIR ?? './json/weaviate-schemas';
const RESET_SCHEMA = process.env.WEAVIATE_RESET_SCHEMA === 'true';
const SKIP_NON_SCHEMA = process.env.WEAVIATE_SKIP_NON_SCHEMA !== 'false';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function waitForReady(): Promise<void> {
  const url = `${WEAVIATE_URL}/v1/.well-known/ready`;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // ignore
    }
    await sleep(1000);
  }
  throw new Error(`[init-schema] Weaviate not ready after timeout: ${url}`);
}

async function loadJson<T>(path: string): Promise<T> {
  const raw = await readFile(path, 'utf-8');
  return JSON.parse(raw) as T;
}

async function listJsonFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.json')).map((e) => join(dir, e.name));
  } catch {
    return [];
  }
}

function isSchemaJson(maybe: any): maybe is WeaviateClassSchema {
  return (
    maybe &&
    typeof maybe === 'object' &&
    typeof maybe.class === 'string' &&
    Array.isArray(maybe.properties) &&
    (maybe.properties.length === 0 ||
      (typeof maybe.properties[0] === 'object' && Array.isArray(maybe.properties[0]?.dataType)))
  );
}

async function fetchSchema(): Promise<any> {
  const res = await fetch(`${WEAVIATE_URL}/v1/schema`);
  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`[init-schema] GET /v1/schema failed. HTTP ${res.status}. ${text}`);
  return text ? JSON.parse(text) : {};
}

async function classExists(className: string): Promise<boolean> {
  const res = await fetch(`${WEAVIATE_URL}/v1/schema/${encodeURIComponent(className)}`);
  if (res.status === 404) return false;
  return res.ok;
}

async function getClassSchema(className: string): Promise<WeaviateClassSchema | null> {
  const res = await fetch(`${WEAVIATE_URL}/v1/schema/${encodeURIComponent(className)}`);
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const text = await res.text().catch(() => '');
  return text ? JSON.parse(text) : null;
}

async function propertyExists(className: string, propertyName: string): Promise<boolean> {
  const schema = await getClassSchema(className);
  if (!schema) return false;
  return schema.properties?.some((p) => p.name === propertyName) ?? false;
}

async function deleteClass(className: string): Promise<void> {
  const res = await fetch(`${WEAVIATE_URL}/v1/schema/${encodeURIComponent(className)}`, { method: 'DELETE' });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    if (res.status === 404) return;
    throw new Error(`[init-schema] DELETE class ${className} failed. HTTP ${res.status}. ${text}`);
  }
}

async function createClass(schema: WeaviateClassSchema): Promise<void> {
  const res = await fetch(`${WEAVIATE_URL}/v1/schema`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(schema),
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(`[init-schema] POST /v1/schema failed for class=${schema.class}. HTTP ${res.status}. ${text}`);
  }
}

async function addProperty(className: string, prop: WeaviateProperty): Promise<void> {
  const res = await fetch(`${WEAVIATE_URL}/v1/schema/${encodeURIComponent(className)}/properties`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prop),
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(
      `[init-schema] POST /v1/schema/${className}/properties failed for prop=${prop.name}. HTTP ${res.status}. ${text}`,
    );
  }
}

/**
 * A reference property is one where any dataType equals another known class name.
 * (We only treat refs between classes we are creating in this run.)
 */
function splitProperties(
  schema: WeaviateClassSchema,
  knownClasses: Set<string>,
): { base: WeaviateProperty[]; refs: WeaviateProperty[] } {
  const base: WeaviateProperty[] = [];
  const refs: WeaviateProperty[] = [];

  for (const p of schema.properties ?? []) {
    const isRef = (p.dataType ?? []).some((dt) => knownClasses.has(dt));
    if (isRef) refs.push(p);
    else base.push(p);
  }

  return { base, refs };
}

function stripProperties(schema: WeaviateClassSchema, baseProps: WeaviateProperty[]): WeaviateClassSchema {
  // keep everything else (vectorConfig, moduleConfig, etc.)
  return { ...schema, properties: baseProps };
}

async function main(): Promise<void> {
  console.log(`[init-schema] WEAVIATE_URL=${WEAVIATE_URL}`);
  console.log(`[init-schema] SCHEMAS_DIR=${SCHEMAS_DIR}`);
  console.log(`[init-schema] RESET_SCHEMA=${RESET_SCHEMA}`);

  await waitForReady();

  const files = await listJsonFiles(SCHEMAS_DIR);
  if (!files.length) throw new Error(`[init-schema] No schema .json files found in ${SCHEMAS_DIR}`);

  console.log(`[init-schema] Found ${files.length} file(s).`);

  try {
    const current = await fetchSchema();
    const classes = Array.isArray(current?.classes) ? current.classes.map((c: any) => c?.class).filter(Boolean) : [];
    console.log(`[init-schema] Existing classes: ${classes.length ? classes.join(', ') : '(none)'}`);
  } catch {
    // ignore
  }

  // Load schemas
  const schemasByClass = new Map<string, WeaviateClassSchema>();
  for (const file of files) {
    const raw = await loadJson<any>(file);

    if (!isSchemaJson(raw)) {
      const msg = `[init-schema] SKIP: ${file} is not a Weaviate class schema json.`;
      if (SKIP_NON_SCHEMA) {
        console.warn(msg);
        continue;
      }
      throw new Error(msg);
    }

    schemasByClass.set(raw.class, raw);
  }

  if (!schemasByClass.size) throw new Error(`[init-schema] No valid schema files found in ${SCHEMAS_DIR}`);

  const classes = [...schemasByClass.keys()];
  const knownClasses = new Set(classes);

  // Phase 0: Reset (delete all) if requested
  if (RESET_SCHEMA) {
    console.log(`[init-schema] Reset enabled. Deleting classes...`);
    // delete in reverse stable order
    for (const cls of [...classes].sort().reverse()) {
      if (await classExists(cls)) {
        console.log(`[init-schema] Deleting class ${cls}...`);
        await deleteClass(cls);
      }
    }
  }

  // Phase 1: Create all classes WITHOUT reference properties
  const refsByClass = new Map<string, WeaviateProperty[]>();

  console.log(`[init-schema] Phase 1: Creating base classes (no reference props)...`);
  for (const cls of classes.sort()) {
    const full = schemasByClass.get(cls)!;
    const { base, refs } = splitProperties(full, knownClasses);

    refsByClass.set(cls, refs);

    const baseSchema = stripProperties(full, base);

    const exists = await classExists(cls);
    if (exists && !RESET_SCHEMA) {
      console.log(`[init-schema] ↷ Class already exists: ${cls} (ensuring base properties)`);
      for (const prop of base) {
        const existsProp = await propertyExists(cls, prop.name);
        if (existsProp) continue;
        console.log(`[init-schema] Adding base property ${cls}.${prop.name}`);
        await addProperty(cls, prop);
      }
      continue;
    }

    console.log(`[init-schema] Creating class ${cls} (base props=${base.length}, refs=${refs.length})...`);
    await createClass(baseSchema);
    console.log(`[init-schema] ✅ Created ${cls}`);
  }

  // Phase 2: Add reference properties now that all classes exist
  console.log(`[init-schema] Phase 2: Adding reference properties...`);
  for (const cls of classes.sort()) {
    const refs = refsByClass.get(cls) ?? [];
    if (!refs.length) continue;

    for (const refProp of refs) {
      const exists = await propertyExists(cls, refProp.name);
      if (exists) {
        console.log(`[init-schema] ↷ Property already exists: ${cls}.${refProp.name} (skipping)`);
        continue;
      }
      console.log(`[init-schema] Adding ref ${cls}.${refProp.name} -> [${refProp.dataType.join(', ')}]`);
      await addProperty(cls, refProp);
    }
  }

  console.log('');
  console.log('==================================================');
  console.log('✅ Schema initialization complete');
  console.log(`📍 Weaviate: ${WEAVIATE_URL}`);
  console.log(`📁 Schemas: ${SCHEMAS_DIR}`);
  console.log(`♻️ Reset: ${RESET_SCHEMA}`);
  console.log('==================================================');
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
