const { join } = require('node:path');

// Layer rules of the Clean architecture (spec S6). The paths are relative to
// the folder where depcruise runs: the repository root, or a fixture tree in
// test/fixtures/arch that the gate tests use.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-imports-only-domain',
      comment:
        'The domain imports nothing outside src/domain: no outer layer, no package (@nestjs/*, drizzle-orm, pg) and no Node built-in.',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: { pathNot: '^src/domain/' },
    },
    {
      name: 'application-imports-only-domain',
      comment:
        'The application imports only src/domain and itself: no adapter, no infrastructure and no package such as @nestjs/*. Aspects are custom decorators, not Nest interceptors.',
      severity: 'error',
      from: { path: '^src/application/' },
      to: { pathNot: '^src/(application|domain)/' },
    },
    {
      name: 'adapters-never-import-infrastructure',
      comment:
        'Adapters never import src/infrastructure. The infrastructure wires adapters, not the reverse.',
      severity: 'error',
      from: { path: '^src/adapters/' },
      to: { path: '^src/infrastructure/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: join(__dirname, 'tsconfig.json') },
  },
};
