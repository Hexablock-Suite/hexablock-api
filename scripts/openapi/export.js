// Writes the OpenAPI document of the built app to openapi/openapi.json.
// With --check, it writes to a temp file and fails when the committed file
// differs. Run it after `pnpm build`: it imports the compiled app from dist.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../dist/infrastructure/app.module.js';
import { buildOpenApiDocument } from '../../dist/infrastructure/http-app.js';

const COMMITTED = resolve(import.meta.dirname, '../../openapi/openapi.json');

// Object keys are sorted at every level, so the file has a stable order.
function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])]),
    );
  }
  return value;
}

async function renderDocument() {
  // The app is created but never listens on a port.
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    return `${JSON.stringify(sortKeys(buildOpenApiDocument(app)), null, 2)}\n`;
  } finally {
    await app.close();
  }
}

function readCommitted() {
  try {
    return readFileSync(COMMITTED, 'utf8');
  } catch {
    return undefined;
  }
}

const document = await renderDocument();

if (process.argv.includes('--check')) {
  const scratch = mkdtempSync(join(tmpdir(), 'hexablock-openapi-'));
  const fresh = join(scratch, 'openapi.json');
  writeFileSync(fresh, document);
  const upToDate = readFileSync(fresh, 'utf8') === readCommitted();
  rmSync(scratch, { recursive: true, force: true });
  if (!upToDate) {
    console.error('openapi/openapi.json is out of date. Run `pnpm openapi:export` and commit it.');
    process.exit(1);
  }
  console.log('openapi/openapi.json is up to date.');
} else {
  writeFileSync(COMMITTED, document);
  console.log('Wrote openapi/openapi.json.');
}
