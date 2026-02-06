/**
 * Re-sanitize existing JSON fixtures under test/fixtures/external.
 *
 * Useful if fixture redaction rules change and you want to avoid re-fetching from external APIs.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sanitizeForFixture } from './fixture-utils.ts';

async function main(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const serviceRoot = path.resolve(here, '..');
  const fixturesDir = path.join(serviceRoot, 'test', 'fixtures', 'external');

  const entries = await fs.readdir(fixturesDir, { withFileTypes: true });
  const jsonFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.json')).map((e) => e.name);

  for (const name of jsonFiles) {
    const filePath = path.join(fixturesDir, name);
    const contents = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(contents);
    const sanitized = sanitizeForFixture(parsed);
    await fs.writeFile(filePath, JSON.stringify(sanitized, null, 2) + '\n', 'utf8');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

