# domain

Entities, value objects and domain services. Imports only other files in `src/domain`; no framework, ORM, driver or system clock. The ports live in `src/application`, so domain code never imports them: it takes the current instant as a parameter.
