import pg from 'pg';
import { createLogger } from '../utils/logger.js';

const { Pool } = pg;

const logger = createLogger({ component: 'db' });

let pool: pg.Pool | null = null;

export function getDbPool(): pg.Pool {
	if (pool) return pool;
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		throw new Error('DATABASE_URL is required');
	}
	pool = new Pool({
		connectionString,
		// Avoid hanging forever on network issues.
		connectionTimeoutMillis: 10_000,
		idleTimeoutMillis: 30_000,
	});
	pool.on('error', (err) => {
		logger.error('pg_pool_error', { error: err instanceof Error ? err.message : String(err) });
	});
	return pool;
}

export async function dbQuery<T extends pg.QueryResultRow = any>(text: string, params: any[] = []): Promise<pg.QueryResult<T>> {
	const p = getDbPool();
	return p.query<T>(text, params);
}

export async function withDbClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
	const p = getDbPool();
	const client = await p.connect();
	try {
		return await fn(client);
	} finally {
		client.release();
	}
}

export async function dbPing(): Promise<void> {
	await dbQuery('SELECT 1');
}
