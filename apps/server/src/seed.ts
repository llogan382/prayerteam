// `pnpm db:seed`: local demo data for DATABASE_URL (default: the Compose
// Postgres). Run `pnpm db:migrate` first. Safe to run again. Later specs
// extend it into the reviewer demo Church (#15).
import { createDatabase, localDatabaseUrl } from "@prayerteam/db";
import { AccountEmailTakenError, createAccounts, offlineAuthConfig } from "./auth/accounts.ts";

export const demoAccount = {
  email: "demo@prayerteam.example",
  password: "pray-for-one-another",
  // An Account with no Church yet, so not a Member (GLOSSARY.md).
  displayName: "Sam Demo",
};

const database = createDatabase({ connectionString: process.env.DATABASE_URL ?? localDatabaseUrl("prayerteam") });
const accounts = createAccounts(database.db, offlineAuthConfig);

try {
  await accounts.create(demoAccount);
  console.log(`Created ${demoAccount.email} (password: ${demoAccount.password})`);
} catch (error) {
  if (!(error instanceof AccountEmailTakenError)) throw error;
  console.log(`${demoAccount.email} already exists`);
} finally {
  await database.close();
}
