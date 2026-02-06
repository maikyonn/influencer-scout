import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const fixtureMode =
	process.env.PIPELINE_MOCK_MODE === 'fixtures' ||
	process.env.PIPELINE_FIXTURES_DIR !== undefined;

const fixturesDir =
	process.env.PIPELINE_FIXTURES_DIR ||
	resolve(fileURLToPath(new URL('../../test/fixtures/external', import.meta.url)));

const fixtureCache = new Map<string, unknown>();

export function isFixtureMode(): boolean {
	return fixtureMode;
}

export function getFixturesDir(): string {
	return fixturesDir;
}

export function loadFixture<T>(name: string, fallback?: T): T {
	if (fixtureCache.has(name)) {
		return fixtureCache.get(name) as T;
	}

	try {
		const raw = readFileSync(resolve(fixturesDir, name), 'utf-8');
		const parsed = JSON.parse(raw) as T;
		fixtureCache.set(name, parsed);
		return parsed;
	} catch (error) {
		if (fallback !== undefined) {
			return fallback;
		}
		throw error;
	}
}
