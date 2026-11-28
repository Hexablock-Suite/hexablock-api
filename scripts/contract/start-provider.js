// Starts the provider composition of the contract job (#151): AppModule on
// an in-memory PGlite database, plus the state-change endpoint at
// /v1/_pact/provider-states. Only this command mounts that endpoint. The
// production start (dist/main.js) never does, and the build leaves test/
// out of dist/. The composition turns the rate limit of sign-up and sign-in
// off, whatever AUTH_RATE_LIMIT holds, because the contract job signs in for
// each provider state (#170).
// Run it with the example configuration:
//   node --env-file=.env.example scripts/contract/start-provider.js
// PORT names the port; the default is 3000. The Vite module runner of
// vite-plus loads the TypeScript sources, decorators included, as Vitest
// does, so the command needs no build.
import { resolve } from 'node:path';
import { createServer, createServerModuleRunner } from 'vite-plus';

const ROOT = resolve(import.meta.dirname, '../..');
const COMPOSITION = '/test/support/contract/provider-app.ts';

const vite = await createServer({
  root: ROOT,
  configFile: false,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
});
const runner = createServerModuleRunner(vite.environments.ssr, { hmr: false });
const { createProviderApp } = await runner.import(COMPOSITION);
const provider = await createProviderApp(['error', 'warn']);
// SIGTERM and SIGINT close the app, as in main.ts.
provider.app.enableShutdownHooks();
await provider.app.listen(process.env.PORT ?? 3000);
console.log(`The provider composition listens on port ${process.env.PORT ?? 3000}.`);
