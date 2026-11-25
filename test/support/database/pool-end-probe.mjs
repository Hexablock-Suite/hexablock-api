// Preloaded only in the child of the shutdown spec. The spec needs to see
// that the production shutdown calls pool.end(), and the production code
// logs nothing there, so this test-only probe counts the calls of
// pg.Pool.prototype.end on stdout. It adds no production logging and it
// changes no behavior: the wrapped method still ends the pool.
import pg from 'pg';

// The original method, read through Reflect so the linter sees no unbound
// method reference: the wrapper below still calls it with the pool as this.
const end = Reflect.get(pg.Pool.prototype, 'end');
pg.Pool.prototype.end = function poolEndProbe(...args) {
  process.stdout.write('POOL_END_CALLED\n');
  return end.call(this, ...args);
};
