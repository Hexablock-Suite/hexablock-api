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
    {
      name: 'http-adapters-never-import-persistence',
      comment:
        'HTTP adapters never import src/adapters/persistence. A controller talks to use cases only, not to the database.',
      severity: 'error',
      from: { path: '^src/adapters/http/' },
      to: { path: '^src/adapters/persistence/' },
    },
    {
      name: 'persistence-adapters-never-import-http',
      comment:
        'Persistence adapters never import src/adapters/http. A repository knows no request and no DTO.',
      severity: 'error',
      from: { path: '^src/adapters/persistence/' },
      to: { path: '^src/adapters/http/' },
    },
    {
      name: 'persistence-adapters-never-import-nest',
      comment:
        'Persistence adapters may import drizzle-orm but never @nestjs/*. The infrastructure binds them to Nest.',
      severity: 'error',
      from: { path: '^src/adapters/persistence/' },
      to: { path: '@nestjs/' },
    },
    {
      name: 'http-adapters-import-only-nest',
      comment:
        'HTTP adapters import only @nestjs/* among packages. A Node built-in is not a package.',
      severity: 'error',
      from: { path: '^src/adapters/http/' },
      to: { path: 'node_modules/', pathNot: 'node_modules/@nestjs/' },
    },
    {
      name: 'persistence-adapters-import-only-drizzle',
      comment:
        'Persistence adapters import only drizzle-orm among packages. persistence-adapters-never-import-nest reports @nestjs/*.',
      severity: 'error',
      from: { path: '^src/adapters/persistence/' },
      to: { path: 'node_modules/', pathNot: 'node_modules/(?:drizzle-orm|@nestjs)/' },
    },
    {
      name: 'jwt-adapters-import-only-nest-jwt',
      comment: 'JWT adapters import only @nestjs/jwt among packages.',
      severity: 'error',
      from: { path: '^src/adapters/jwt/' },
      to: { path: 'node_modules/', pathNot: 'node_modules/@nestjs/jwt/' },
    },
    {
      name: 'logging-adapters-import-only-nest-common',
      comment: 'Logging adapters import only @nestjs/common among packages.',
      severity: 'error',
      from: { path: '^src/adapters/logging/' },
      to: { path: 'node_modules/', pathNot: 'node_modules/@nestjs/common/' },
    },
    {
      name: 'crypto-adapters-import-only-node-crypto',
      comment:
        'Crypto adapters import only node:crypto among Node built-ins. other-adapters-import-no-package keeps every package out.',
      severity: 'error',
      from: { path: '^src/adapters/crypto/' },
      to: { dependencyTypes: ['core'], pathNot: '^crypto$' },
    },
    {
      name: 'clock-adapters-import-no-built-in',
      comment:
        'Clock adapters import no Node built-in: the system clock is a global of JavaScript. other-adapters-import-no-package keeps every package out.',
      severity: 'error',
      from: { path: '^src/adapters/clock/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'other-adapters-import-no-package',
      comment:
        'Code of src/adapters outside the folders with a package rule (http/, persistence/, jwt/ and logging/) imports no package.',
      severity: 'error',
      from: {
        path: '^src/adapters/',
        pathNot: '^src/adapters/(?:http|persistence|jwt|logging)/',
      },
      to: { path: 'node_modules/' },
    },
    {
      name: 'infrastructure-imports-no-port',
      comment:
        'No file of src/infrastructure except app.module.ts imports src/application/ports/. A class that implements a port is an adapter of layer 3 (#212). AppModule imports the tokens and the types of the ports to bind them.',
      severity: 'error',
      from: {
        path: '^src/infrastructure/',
        pathNot: '^src/infrastructure/app[.]module[.]ts$',
      },
      to: { path: '^src/application/ports/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: join(__dirname, 'tsconfig.json') },
  },
};
