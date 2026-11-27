// `pnpm db:seed`: local demo data for DATABASE_URL (default: the Compose
// Postgres). Run `pnpm db:migrate` first. Safe to run again. Later specs
// extend it into the reviewer demo Church (#15).
import { createDatabase, localDatabaseUrl } from "@prayerteam/db";
import { AccountEmailTakenError, createAccount } from "./auth/accounts.ts";
import { createAuth, offlineAuthConfig } from "./auth/auth.ts";

export const demoAccount = {
  email: "demo@prayerteam.example",
  password: "pray-for-one-another",
  // An Account with no Church yet, so not a Member (GLOSSARY.md).
  displayName: "Sam Demo",
};

const database = createDatabase({ connectionString: process.env.DATABASE_URL ?? localDatabaseUrl("prayerteam") });
const auth = createAuth(database.db, offlineAuthConfig);

try {
  await createAccount(auth, demoAccount);
  console.log(`Created ${demoAccount.email} (password: ${demoAccount.password})`);
} catch (error) {
  if (!(error instanceof AccountEmailTakenError)) throw error;
  console.log(`${demoAccount.email} already exists`);
} finally {
  await database.close();
}
