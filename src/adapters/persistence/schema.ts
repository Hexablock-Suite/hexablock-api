// Drizzle schema of the API. drizzle-kit reads this file to generate the
// migrations in drizzle/. Business tables arrive with the reviewed requirements.
// The schema lives in the persistence adapter because the repositories query
// these tables, and rule adapters-never-import-infrastructure forbids them to
// import src/infrastructure.
export {};
