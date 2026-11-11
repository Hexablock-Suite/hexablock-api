import { codesOf, lintFile } from '../support/lint.js';

// Gate of #90: a value object keeps its datum private and delivers it to a
// receiver. Only the border receives it: src/adapters and src/infrastructure.
// The domain and the application never call a delivery operation.
describe('delivery gate', () => {
  it('should_report_each_delivery_when_application_calls_the_three_delivery_operations', () => {
    const codes = codesOf(lintFile('test/fixtures/arch/src/application/calls-delivery.ts'));

    // deliverTo, deliverKeyTo and deliverBoundsTo.
    expect(codes.filter((code) => code.includes('no-delivery-call'))).toHaveLength(3);
  });

  // A reference without a call, such as bind() or a computed member, counts too.
  it('should_report_each_reference_when_application_takes_a_delivery_operation_without_a_call', () => {
    const codes = codesOf(lintFile('test/fixtures/arch/src/application/references-delivery.ts'));

    expect(codes.filter((code) => code.includes('no-delivery-call'))).toHaveLength(2);
  });

  it('should_report_the_delivery_when_domain_calls_a_delivery_operation', () => {
    const codes = codesOf(lintFile('test/fixtures/arch/src/domain/calls-delivery.ts'));

    expect(codes.filter((code) => code.includes('no-delivery-call'))).toHaveLength(1);
  });

  it('should_accept_the_same_deliveries_when_an_adapter_calls_them', () => {
    const codes = codesOf(lintFile('test/fixtures/arch/src/adapters/http/calls-delivery.ts'));

    expect(codes).toEqual([]);
  });
});
