import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

// Exercise the production SQL against SQLite without connecting to Cloudflare.
export const createTestDatabase = (filename = ':memory:') => {
	const database = new DatabaseSync(filename);
	database.exec(readFileSync(new URL('../../database/monetization-d1.sql', import.meta.url), 'utf8'));
	const DB = {
		prepare(sql) {
			const statement = database.prepare(sql);
			const bound = (values = []) => ({
				bind: (...next) => bound(next),
				async run() { const result = statement.run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
				async first() { return statement.get(...values) ?? null; },
				async all() { return { results: statement.all(...values) }; },
			});
			return bound();
		},
	};
	return { database, DB };
};
