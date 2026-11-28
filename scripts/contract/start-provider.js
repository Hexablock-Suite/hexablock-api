// Starts the provider composition of the contract job (#151): AppModule on
// an in-memory PGlite database, plus the state-change endpoint at
// /v1/_pact/provider-states. Only this command mounts that endpoint. The
// production start (dist/main.js) never does, and the build leaves test/
// out of dist/.
// Run it with the example configuration:
//   node --env-file=.env.example scripts/contract/start-provider.js
// PORT names the port; the default is 3000. The state-change endpoint writes
// any data for anyone, so the command listens on the loopback address
// 127.0.0.1 only. A client that asks for localhost still reaches it: the
// name resolves to 127.0.0.1, and curl, Node fetch and the Pact verifier try
// each address of the name (#239). The list of level editors is empty, as
// in stubTestEnvironment(), so a LEVEL_EDITOR_IDS of the shell never reaches
// the composition. The Vite module runner of vite-plus loads the TypeScript
// sources, decorators included, as Vitest does, so the command needs no
// build.
import { resolve } from 'node:path';
import { createServer, createServerModuleRunner } from 'vite-plus';

const ROOT = resolve(import.meta.dirname, '../..');
const COMPOSITION = '/test/support/contract/provider-app.ts';
const HOST = '127.0.0.1';
const PORT = process.env.PORT ?? 3000;

process.env.LEVEL_EDITOR_IDS = '';

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
await provider.app.listen(PORT, HOST);
console.log(`The provider composition listens on http://${HOST}:${PORT}.`);
