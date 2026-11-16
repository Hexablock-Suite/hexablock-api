import { DOMAIN_SURFACE_BASELINE } from './domain-surface.baseline.js';
import { baselineDrift, surfaceSitesOf, typeScriptFilesIn } from './domain-surface.js';

// Gate of #102: a domain type keeps its fields private and has no getter. No
// string, number or Date crosses a public signature of src/domain. Three
// cases pass: a boolean query, the factory of a value object that takes the
// raw value, and the delivery operations (decision 15). The baseline lists
// the sites that break the rule today. The list only shrinks.
const FIXTURES = 'test/fixtures/domain-surface';
const SITE =
  /^src\/domain\/\S+\.ts \S+ (field|get-accessor|set-accessor|get-method|parameter|return|constant|type)$/;

describe('domain surface gate', () => {
  describe('rule', () => {
    const fixtureSites = surfaceSitesOf(typeScriptFilesIn(FIXTURES));

    // The sites of one fixture file, without the file path.
    const sitesIn = (file: string): string[] => {
      const prefix = `${FIXTURES}/${file} `;
      return fixtureSites
        .filter((site) => site.startsWith(prefix))
        .map((site) => site.slice(prefix.length));
    };

    it('should_report_the_field_when_a_class_declares_a_public_field', () => {
      // The private field and the #private field pass.
      expect(sitesIn('public-field.ts')).toEqual(['Scoreboard.best field']);
    });

    it('should_report_each_field_when_a_class_declares_a_public_readonly_field', () => {
      // One field in the class body and one in the constructor.
      expect(sitesIn('public-readonly-field.ts')).toEqual([
        'Membership.gameId field',
        'Membership.userId field',
      ]);
    });

    it('should_report_each_property_when_an_exported_interface_declares_fields', () => {
      expect(sitesIn('interface-field.ts')).toEqual([
        'ScoreState.userId field',
        'ScoreState.best field',
      ]);
    });

    it('should_report_each_accessor_when_a_class_declares_a_get_and_a_set_accessor', () => {
      expect(sitesIn('get-accessor.ts')).toEqual([
        'Ledger.balance get-accessor',
        'Ledger.balance set-accessor',
      ]);
    });

    it('should_report_the_method_when_its_name_starts_with_get', () => {
      // A class method and an interface method. A private getter method passes.
      expect(sitesIn('get-method.ts')).toEqual([
        'Account.getOwner get-method',
        'ScoreSource.getBest get-method',
      ]);
    });

    it('should_report_each_parameter_when_a_public_signature_takes_a_string', () => {
      // A public constructor, a method and an interface method. A private method passes.
      expect(sitesIn('string-parameter.ts')).toEqual([
        'Greeting.constructor(text) parameter',
        'Greeting.rename(text) parameter',
        'Checker.verify(typed) parameter',
      ]);
    });

    it('should_report_each_return_type_when_a_public_signature_returns_a_number', () => {
      // A plain number, a number as a type argument and a function type.
      expect(sitesIn('number-return.ts')).toEqual([
        'Counter.count() return',
        'Counter.limitsOf() return',
        'Order() return',
      ]);
    });

    it('should_report_each_parameter_when_a_public_signature_takes_a_date', () => {
      expect(sitesIn('date-parameter.ts')).toEqual([
        'Timeline.recordAt(at) parameter',
        'startAt(at) parameter',
      ]);
    });

    it('should_report_each_constant_when_a_module_exports_a_string_constant', () => {
      // A template, a literal, a declared string and a Range<number> from a
      // call. A constant that the module does not export passes.
      expect(sitesIn('exported-constant.ts')).toEqual([
        'NAME_PATTERN constant',
        'GREETING constant',
        'TITLE constant',
        'LIMITS constant',
      ]);
    });

    it('should_accept_the_query_when_an_operation_returns_a_boolean', () => {
      expect(sitesIn('boolean-query.ts')).toEqual([]);
    });

    it('should_accept_the_factory_when_a_value_object_takes_the_raw_value', () => {
      // One raw value, two raw values, and a factory that returns a Result.
      expect(sitesIn('value-object-factory.ts')).toEqual([]);
    });

    it('should_report_the_raw_parameter_when_a_static_method_is_not_a_value_object_factory', () => {
      // An aggregate factory, a factory that also takes a domain value, and a
      // static query that returns a boolean.
      expect(sitesIn('factory-boundary.ts')).toEqual([
        'Session.begin(at) parameter',
        'Badge.award(at) parameter',
        'Badge.isTooLong(raw) parameter',
      ]);
    });

    it('should_accept_the_three_delivery_operations_when_a_value_object_declares_them', () => {
      // sendTo() has the shape of a delivery and another name, so it breaks the rule.
      expect(sitesIn('delivery-operations.ts')).toEqual(['Span.sendTo(receiver) parameter']);
    });
  });

  describe('baseline', () => {
    const domainSites = surfaceSitesOf(typeScriptFilesIn('src/domain'));
    const drift = baselineDrift(domainSites, DOMAIN_SURFACE_BASELINE);

    it('should_list_every_site_when_the_gate_reads_each_file_of_src_domain', () => {
      expect(drift.unlisted, 'Fix each new site. Never add it to the baseline.').toEqual([]);
    });

    it('should_keep_no_stale_entry_when_the_gate_reads_each_file_of_src_domain', () => {
      expect(drift.stale, 'Remove each entry whose site is fixed.').toEqual([]);
    });

    // One entry per site, never a whole file: a file entry hides the next break in that file.
    it('should_name_one_site_when_each_baseline_entry_is_read', () => {
      expect(DOMAIN_SURFACE_BASELINE.filter((entry) => !SITE.test(entry))).toEqual([]);
    });

    it('should_report_the_entry_when_the_baseline_keeps_a_site_that_the_code_no_longer_has', () => {
      expect(baselineDrift(['a field'], ['a field', 'b field'])).toEqual({
        unlisted: [],
        stale: ['b field'],
      });
    });

    it('should_report_the_site_when_the_code_has_a_site_that_the_baseline_does_not_list', () => {
      expect(baselineDrift(['a field', 'b field'], ['a field'])).toEqual({
        unlisted: ['b field'],
        stale: [],
      });
    });
  });
});
