// Child of the pool error spec. It runs the production pool creation path,
// createDatabase() of connection.ts, with plain Node, emits one synthetic
// pool error on the real pool and then answers a stdin handshake, so the
// spec can see that the process stays responsive. The error is synthetic:
// it exercises the EventEmitter contract of pg.Pool, and it does not prove
// anything about a real network failure.
import { createDatabase } from '../../../src/infrastructure/database/connection.ts';

const database = createDatabase('postgres://pool-child:pool-child@127.0.0.1:1/pool-child');
console.log('READY');
database.$client.emit(
  'error',
  Object.assign(new Error('synthetic idle-client error'), { code: 'ECONNRESET' }),
);
console.log('EMITTED');
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  const command = chunk.trim();
  if (command === 'ping') {
    process.stdout.write('pong\n');
  } else if (command === 'exit') {
    void database.$client.end().then(() => process.exit(0));
  }
});
