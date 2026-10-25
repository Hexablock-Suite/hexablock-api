// Verifies the client pact against a running API (spec S9).
// BACKEND_URL names the API. PACT_FILE names a local pact; without it, the
// pact comes from the main branch of the client repository.
// A missing pact fails the run. It never counts as a pass.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Verifier } from '@pact-foundation/pact';

const CLIENT_PACT_URL =
  'https://raw.githubusercontent.com/Hexablock-Suite/hexablock-app/main/pacts/hexablock-app-hexablock-api.json';

const providerBaseUrl = process.env.BACKEND_URL ?? 'http://localhost:3000';
const pactFile = process.env.PACT_FILE;

async function resolvePactSource() {
  if (pactFile) {
    const path = resolve(pactFile);
    if (!existsSync(path)) {
      throw new Error(`No pact file at ${path}.`);
    }
    return path;
  }
  const response = await fetch(CLIENT_PACT_URL, { method: 'HEAD' });
  if (!response.ok) {
    throw new Error(`No client pact at ${CLIENT_PACT_URL} (HTTP ${response.status}).`);
  }
  return CLIENT_PACT_URL;
}

try {
  const pactSource = await resolvePactSource();
  console.log(`Verifying ${pactSource} against ${providerBaseUrl}.`);
  await new Verifier({
    provider: 'hexablock-api',
    providerBaseUrl,
    pactUrls: [pactSource],
    failIfNoPactsFound: true,
    // Provider states: none yet. When an interaction needs one, set
    // providerStatesSetupUrl to a test-only state-change endpoint. Only the
    // test composition of the API mounts that endpoint, never production.
  }).verifyProvider();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
