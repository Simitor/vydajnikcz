import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

// Exercise the production SQL against SQLite without connecting to Cloudflare.
export const createTestDatabase = (filename = ':memory:', { migrate = true } = {}) => {
	const database = new DatabaseSync(filename);
	database.exec(readFileSync(new URL('../../database/monetization-d1.sql', import.meta.url), 'utf8'));
	if (migrate && !database.prepare("select name from sqlite_master where type='table' and name='admin_schema_version'").get()) {
		database.exec(readFileSync(new URL('../../database/migrations/0001_admin_a3.sql', import.meta.url), 'utf8'));
	}
	const DB = {
		prepare(sql) {
			const statement = database.prepare(sql);
			const bound = (values = []) => ({
				bind: (...next) => bound(next),
				execute() {
					if (statement.columns().length) return { success: true, results: statement.all(...values), meta: { changes: 0 } };
					const result = statement.run(...values); return { success: true, results: [], meta: { changes: Number(result.changes) } };
				},
				async run() { const result = statement.run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
				async first() { return statement.get(...values) ?? null; },
				async all() { return { results: statement.all(...values) }; },
			});
			return bound();
		},
		async batch(statements) {
			database.exec('begin immediate');
			try {
				const results = statements.map(statement => statement.execute());
				database.exec('commit'); return results;
			} catch (error) { database.exec('rollback'); throw error; }
		},
	};
	return { database, DB };
};
