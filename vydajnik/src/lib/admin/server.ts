import { AdminError } from './validation.ts';
export { AdminError, text, optionalText, choice, flag, number, money, day, slug, leadId, httpsUrl, strings } from './validation.ts';
export interface Statement {
	bind(...values: unknown[]): Statement;
	run(): Promise<{ success: boolean; meta: { changes: number } }>;
	first<T>(): Promise<T | null>;
	all<T>(): Promise<{ results: T[] }>;
}
export interface Database {
	prepare(sql: string): Statement;
	batch(statements: Statement[]): Promise<{ results: Record<string, unknown>[]; meta: { changes: number } }[]>;
}
export interface AdminContext { request: Request; env: { DB?: Database; ADMIN_TOKEN?: string }; }
export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
export const withAdmin = async ({ request, env }: AdminContext, action: (db: Database) => Promise<Response>) => {
	if (!env.ADMIN_TOKEN || !env.DB) return json({ error: 'Admin není nakonfigurován.' }, 503);
	if (request.headers.get('authorization') !== `Bearer ${env.ADMIN_TOKEN}`) return json({ error: 'Neautorizováno.' }, 401);
	try { return await action(env.DB); }
	catch (error) {
		if (error instanceof AdminError) return json({ error: error.message }, error.status);
		const detail = error instanceof Error ? error.message : '';
		if (detail.includes('A3_MIXED_AD_REPORTS')) return json({ error: 'Za stejného poskytovatele a den použijte buď souhrn all, nebo jednotlivé reklamní pozice. Jejich kombinace by zdvojila výnos.' }, 409);
		if (detail.includes('A3_PARTNER_IN_USE')) return json({ error: 'Partner má navázané záznamy. Použijte vypnutí partnera.' }, 409);
		if (detail.includes('A3_PARTNER_NOT_FOUND') || detail.includes('FOREIGN KEY constraint')) return json({ error: 'Partner záznamu nebyl nalezen. Obnovte seznam a zkontrolujte partnera.' }, 422);
		if (detail.includes('A3_INVALID_')) return json({ error: 'Databáze odmítla neplatné údaje. Zkontrolujte hodnoty a vazby záznamu.' }, 422);
		if (detail.includes('UNIQUE constraint')) return json({ error: 'Záznam s tímto ID nebo referencí již existuje. Obnovte seznam.' }, 409);
		return json({ error: 'Server nemohl požadavek dokončit. Zkuste to později.' }, 503);
	}
};
export const readInput = async (request: Request): Promise<Record<string, unknown>> => {
	const raw = await request.text();
	if (raw.length > 65536) throw new AdminError('Požadavek je příliš velký.', 413);
	let body;
	try { body = JSON.parse(raw); } catch { throw new AdminError('Neplatný JSON.', 400); }
	if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AdminError('Neplatné údaje formuláře.');
	return body;
};
export const financeReady = async (db: Database) => {
	try {
		const schema = await db.prepare('select version from admin_schema_version where id=1').first<{ version: number }>();
		if (schema?.version === 3) return;
	} catch { /* An old D1 database has no migration marker. */ }
	throw new AdminError('Databáze pro A3 není připravená. Spusťte migraci podle A3-NASAZENI.md.', 503);
};
