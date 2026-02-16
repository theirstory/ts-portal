import 'dotenv/config';
import fs from 'fs';
import path from 'path';

/**
 * Function that generates TypeScript types from Weaviate schema.
 *
 * This function:
 * 1. Fetches the schema from Weaviate REST API
 * 2. Generates an enum with all collection names (SchemaTypes)
 * 3. Creates TypeScript interfaces for each collection
 * 4. Builds a SchemaMap type that maps enum values to their types
 * 5. Writes the generated code to types/weaviate.ts
 *
 * @throws {Error} If the schema fetch fails or any generation step fails
 */

const WEAVIATE_HOST = process.env.WEAVIATE_HOST_URL! ?? 'localhost';
const WEAVIATE_PORT = process.env.WEAVIATE_PORT ?? '8080';
const ADMIN_KEY = process.env.WEAVIATE_ADMIN_KEY;

async function main() {
  const headers: Record<string, string> = {};
  if (ADMIN_KEY) {
    headers['Authorization'] = `Bearer ${ADMIN_KEY}`;
  }

  const res = await fetch(`http://${WEAVIATE_HOST}:${WEAVIATE_PORT}/v1/schema`, {
    headers,
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch schema: ${res.status} ${res.statusText}`);
  }

  const schema = await res.json();

  const mapType = (type: string): string => {
    return (
      {
        text: 'string',
        number: 'number',
        int: 'number',
        boolean: 'boolean',
        date: 'string',
      }[type] || 'any'
    );
  };

  const enumDefinition = `export enum SchemaTypes {\n${schema.classes
    .map((cls: any) => `  ${cls.class} = "${cls.class}",`)
    .join('\n')}\n}`;

  const types = schema.classes
    .map((cls: any) => {
      const props = cls.properties.map((prop: any) => `  ${prop.name}: ${mapType(prop.dataType[0])};`).join('\n');
      return `export type ${cls.class} = {\n${props}\n}`;
    })
    .join('\n\n');

  const schemaMap = `export type SchemaMap = {\n${schema.classes
    .map((cls: any) => `  [SchemaTypes.${cls.class}]: ${cls.class};`)
    .join('\n')}\n};`;

  const __dirname = path.dirname(new URL(import.meta.url).pathname);
  const outputPath = path.join(__dirname, '../types/weaviate.ts');

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${enumDefinition}\n\n${types}\n\n${schemaMap}`);
  console.log('✅ Weaviate types, enum y SchemaMap generated in types/weaviate.ts');
}

main().catch((err) => {
  console.error('❌ Error generating types:', err);
  process.exit(1);
});
