// Loads test people (test-people.ts) into the service's data, from a JSON list on standard input,
// with the same environment as the service. Run next to a running service, e.g. with
// `docker compose exec`, or before it starts. Prints each person's account id, by email, as JSON.
//
//   node src/load-test-people.ts                 make each person, or bring them to what is given
//   node src/load-test-people.ts --only-missing  make only the people who aren't there yet
import { text } from "node:stream/consumers";
import { createAccounts } from "./accounts.ts";
import { configFromEnv } from "./config.ts";
import { loadTestPeople, parseTestPeople } from "./test-people.ts";

const people = parseTestPeople(JSON.parse(await text(process.stdin)));
const accounts = await createAccounts(configFromEnv(process.env));
try {
  const onlyMissing = process.argv.includes("--only-missing");
  console.log(
    JSON.stringify(await loadTestPeople(accounts, people, { onlyMissing })),
  );
} finally {
  accounts.close();
}
