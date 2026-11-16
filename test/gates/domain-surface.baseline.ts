// The sites of src/domain that break the domain surface rule today (#102).
// One entry names one site: the file, the member and the kind of the break.
// A task that fixes a site removes its entry. Never add an entry: a new site
// is a regression. The gate fails when an entry names a site that the code no
// longer has, so the list only shrinks. Each comment names the issue that
// removes the entries below it.
export const DOMAIN_SURFACE_BASELINE: readonly string[] = [];
