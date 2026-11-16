import { SyncInstant } from '../../../src/domain/progress/sync-instant.js';
import { RecordingReceiver } from '../../support/recording-receiver.js';
import { valueOf } from '../../support/result.js';

// The largest distance from the epoch that a JavaScript Date holds, in
// milliseconds (ECMAScript time values).
const DATE_LIMIT_MS = 8_640_000_000_000_000;
const SYNC_MS = Date.parse('2026-11-06T10:00:00.000Z');

const instant = (epochMs: number): SyncInstant => valueOf(SyncInstant.of(epochMs));

describe('SyncInstant', () => {
  it.each([0, -1, SYNC_MS, DATE_LIMIT_MS, -DATE_LIMIT_MS])(
    'should_accept_the_instant_when_value_is_a_whole_number_of_milliseconds_in_the_date_range',
    (epochMs) => {
      expect(instant(epochMs).equals(instant(epochMs))).toBe(true);
    },
  );

  // One failure mechanism (decision 11): a failed Result with the code of
  // the rule, never an exception. The border writes the message.
  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'should_give_the_code_of_the_rule_when_value_is_not_a_whole_number_of_milliseconds',
    (epochMs) => {
      expect(SyncInstant.of(epochMs)).toEqual({ ok: false, error: 'invalid-sync-instant' });
    },
  );

  it.each([DATE_LIMIT_MS + 1, -DATE_LIMIT_MS - 1, Number.MAX_SAFE_INTEGER])(
    'should_give_the_code_of_the_rule_when_value_is_outside_the_date_range',
    (epochMs) => {
      expect(SyncInstant.of(epochMs)).toEqual({ ok: false, error: 'invalid-sync-instant' });
    },
  );

  // A Date is not the raw value: the domain holds no Date (classes.md,
  // section «Domain design rules»).
  it.each([undefined, null, '0', new Date(SYNC_MS), {}])(
    'should_give_the_code_of_the_rule_when_value_is_not_a_number',
    (value) => {
      expect(SyncInstant.of(value as unknown as number)).toEqual({
        ok: false,
        error: 'invalid-sync-instant',
      });
    },
  );

  it('should_be_equal_when_two_instants_hold_the_same_milliseconds', () => {
    expect(instant(SYNC_MS).equals(instant(SYNC_MS))).toBe(true);
    expect(instant(SYNC_MS).equals(instant(SYNC_MS + 1))).toBe(false);
  });

  // An equal instant is not later, so updatedAt keeps the instant it has.
  it('should_be_later_only_when_its_milliseconds_are_greater_than_the_other', () => {
    expect(instant(SYNC_MS + 1).isLaterThan(instant(SYNC_MS))).toBe(true);
    expect(instant(SYNC_MS).isLaterThan(instant(SYNC_MS))).toBe(false);
    expect(instant(SYNC_MS - 1).isLaterThan(instant(SYNC_MS))).toBe(false);
  });

  it('should_deliver_the_milliseconds_to_the_receiver_when_the_factory_took_them', () => {
    const receiver = new RecordingReceiver<number>();

    instant(SYNC_MS).deliverTo(receiver);

    expect(receiver.received).toEqual([SYNC_MS]);
  });

  it('should_have_no_public_value_field_when_the_value_leaves_through_a_delivery', () => {
    const built = instant(SYNC_MS);
    const receiver = new RecordingReceiver<number>();

    // @ts-expect-error -- the milliseconds are private.
    void built.epochMs;
    // The delivery returns nothing: the receiver holds the value.
    expect(built.deliverTo(receiver)).toBeUndefined();
  });
});
