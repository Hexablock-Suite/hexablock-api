import { codesOf, lintFile } from '../support/lint.js';

// Gate of #217: a use case awaits no read in each pass of a loop. One read
// per item makes the cost of a request grow with its count of items. The
// use case asks a port for all items in one call instead.
describe('await-in-loop gate', () => {
  it('should_report_each_await_when_application_awaits_inside_a_loop', () => {
    const codes = codesOf(lintFile('test/fixtures/arch/src/application/awaits-in-loop.ts'));

    // One await in a for-of loop and one await in a while loop.
    expect(codes.filter((code) => code.includes('no-await-in-loop'))).toHaveLength(2);
  });

  it('should_accept_the_read_when_application_awaits_once_for_all_items', () => {
    const codes = codesOf(lintFile('test/fixtures/arch/src/application/awaits-once.ts'));

    expect(codes).toEqual([]);
  });
});
