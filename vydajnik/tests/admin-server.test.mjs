import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTestDatabase } from './helpers/d1.mjs';
import { onRequestPost as config } from '../functions/api/admin/config.ts';
import { onRequestPost as revenue } from '../functions/api/admin/revenue.ts';
import { onRequestPost as adReport } from '../functions/api/admin/ad-report.ts';
import { onRequestPost as leadUpdate } from '../functions/api/admin/leads.ts';
import { onRequestGet as records } from '../functions/api/admin/records.ts';
import { onRequestGet as metrics } from '../functions/api/admin/metrics.ts';
import { buildAdminSubmission } from '../src/lib/admin/requests.ts';

const token = 'test-only-a3-token';
const today = new Date().toISOString().slice(0, 10);
const request = (body, credential = token) => new Request('https://admin.test/api/admin', {
	method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${credential}` }, body: JSON.stringify(body),
});
const fixture = (t, migrate = true) => {
	const result = createTestDatabase(':memory:', { migrate }); t.after(() => result.database.close());
	return { ...result, env: { DB: result.DB, ADMIN_TOKEN: token } };
};
const send = (handler, env, body) => handler({ request: request(body), env });
const partner = { action: 'partner', id: 'partner-aa', name: 'Firma Alfa', categories: ['energy'], active: true, licensed: false, priority: 10 };
const product = { action: 'product', id: 'offer-aa', partnerId: 'partner-aa', category: 'energy', name: 'Nabídka Alfa', price: 100, period: 'month', affiliateUrl: 'https://example.com/offer', active: true };
const income = { sourceType: 'direct', amount: 100, reference: 'INVOICE-1', occurredAt: today };
const report = { date: today, provider: 'custom', placement: 'all', impressions: 1000, clicks: 10, revenue: 100, reference: 'REPORT-1' };
const snapshot = database => ['monetization_partners', 'monetization_products', 'publisher_daily_stats', 'monetization_revenue'].map(table => database.prepare(`select * from ${table} order by rowid`).all());
const overview = env => metrics({ request: new Request('https://admin.test/api/admin/metrics', { headers: { authorization: `Bearer ${token}` } }), env }).then(response => response.json());
const migration = readFileSync(new URL('../database/migrations/0001_admin_a3.sql', import.meta.url), 'utf8');
const audit = readFileSync(new URL('../database/a3-preflight.sql', import.meta.url), 'utf8');

test('partner/product fields reject incorrect types, lengths and values without changing records', async t => {
	const { env, database } = fixture(t);
	assert.equal((await send(config, env, partner)).status, 200); assert.equal((await send(config, env, product)).status, 200);
	const before = snapshot(database);
	for (const invalid of [
		{ name: {} }, { name: 'a'.repeat(101) }, { categories: ['constructor'] }, { categories: 'energy' }, { categories: [] },
		{ active: 'true' }, { licensed: 1 }, { priority: '10' }, { priority: 1.5 }, { secretRef: 'invalid-secret' },
		{ secretRef: 'A'.repeat(65) }, { payoutModel: 'a'.repeat(81) }, { registrationUrl: 'http://example.com' },
		{ registrationUrl: 'https://user:password@example.com' }, { regions: ['Praha', 7] }, { regions: Array(31).fill('Praha') },
	]) {
		const response = await send(config, env, { ...partner, ...invalid });
		assert.equal(response.status, 422, JSON.stringify(invalid)); assert.equal(response.headers.get('cache-control'), 'no-store');
		assert.deepEqual(snapshot(database), before);
	}
	for (const invalid of [
		{ id: 'a'.repeat(61) }, { partnerId: 'missing-partner' }, { name: 'a'.repeat(121) }, { price: false }, { price: 0.001 },
		{ price: -1 }, { period: 'weekly' }, { active: 'on' }, { indicative: 'false' }, { sponsored: 1 },
		{ termsUrl: 'javascript:alert(1)' }, { affiliateUrl: 'https://user:pass@example.com' }, { excess: 'a'.repeat(81) },
		{ coverage: [false] }, { coverage: Array(21).fill('podmínka') },
	]) {
		assert.equal((await send(config, env, { ...product, ...invalid })).status, 422, JSON.stringify(invalid));
		assert.deepEqual(snapshot(database), before);
	}
});

test('optional price is distinct from zero, and invalid optional values are not silently discarded', async t => {
	const { env, database } = fixture(t); await send(config, env, partner);
	for (const [price, expected] of [['', null], [null, null], [0, 0], [12.34, 12.34]]) {
		assert.equal((await send(config, env, { ...product, price })).status, 200);
		assert.equal(database.prepare('select price_amount from monetization_products').get().price_amount, expected);
	}
	assert.equal((await send(config, env, { ...product, termsUrl: 'not a URL' })).status, 422);
});

test('manual revenue replays are idempotent and conflicting reference data cannot overwrite an income', async t => {
	const { env, database } = fixture(t);
	assert.equal((await (await send(revenue, env, { ...income, reference: '  INVOICE-1  ' })).json()).outcome, 'created');
	assert.equal((await (await send(revenue, env, income)).json()).outcome, 'unchanged');
	for (const invalid of [{ amount: 120 }, { occurredAt: '2026-01-01' }]) assert.equal((await send(revenue, env, { ...income, ...invalid })).status, 409);
	assert.equal(database.prepare('select count(*) as n from monetization_revenue').get().n, 1);
	assert.equal(database.prepare('select amount from monetization_revenue').get().amount, 100);
	assert.equal((await overview(env)).revenue.month, 100);
});

test('manual reference identity includes the source and partner, and validates partner existence', async t => {
	const { env, database } = fixture(t); await send(config, env, partner); await send(config, env, { ...partner, id: 'partner-bb' });
	assert.equal((await send(revenue, env, { ...income, partnerId: 'missing-partner' })).status, 422);
	for (const body of [income, { ...income, partnerId: 'partner-aa' }, { ...income, partnerId: 'partner-bb' }, { ...income, sourceType: 'affiliate', partnerId: 'partner-aa' }]) assert.equal((await send(revenue, env, body)).status, 200);
	assert.equal(database.prepare('select count(*) as n from monetization_revenue').get().n, 4);
	assert.equal((await send(revenue, env, { ...income, sourceType: 'ads' })).status, 422);
});

test('simultaneous income imports store one amount and precise cent totals', async t => {
	const { env, database } = fixture(t);
	const responses = await Promise.all(Array.from({ length: 20 }, () => send(revenue, env, { ...income, amount: 0.1 })));
	const results = await Promise.all(responses.map(response => response.json()));
	assert.equal(results.filter(result => result.outcome === 'created').length, 1);
	assert.equal(results.filter(result => result.outcome === 'unchanged').length, 19);
	await send(revenue, env, { ...income, reference: 'INVOICE-2', amount: 0.2 });
	assert.equal(database.prepare('select count(*) as n from monetization_revenue').get().n, 2);
	assert.equal((await overview(env)).revenue.month, 0.3);
});

test('financial validation covers reference length, impossible dates, money precision and counter bounds', async t => {
	const { env, database } = fixture(t);
	for (const invalid of [{ reference: ' ' }, { reference: 'x'.repeat(161) }, { reference: {} }, { reference: 'bad\nref' }, { amount: 0.001 }, { amount: 1000000001 }, { occurredAt: '2026-02-31' }, { sourceType: 'unknown' }, { partnerId: 7 }]) assert.equal((await send(revenue, env, { ...income, ...invalid })).status, 422, JSON.stringify(invalid));
	for (const invalid of [{ reference: 'x'.repeat(161) }, { placement: 'invented' }, { provider: 'unknown' }, { clicks: 1001 }, { impressions: 1.5 }, { impressions: Number.MAX_SAFE_INTEGER + 1 }, { revenue: 0.001 }, { revenue: 100000001 }, { date: '2026-02-31' }]) assert.equal((await send(adReport, env, { ...report, ...invalid })).status, 422, JSON.stringify(invalid));
	assert.equal(database.prepare('select count(*) as n from monetization_revenue').get().n, 0);
	assert.equal(database.prepare('select count(*) as n from publisher_daily_stats').get().n, 0);
	assert.equal((await send(revenue, env, { ...income, amount: 0.00000001 })).status, 422);
});

test('large valid cent amounts are accepted without floating point precision errors', async t => {
	const { env } = fixture(t);
	for (const amount of [999999999.91, 999999999.99, 800000000.39, 199999999.92]) {
		assert.equal((await send(revenue, env, { ...income, amount, reference: String(amount) })).status, 200, String(amount));
	}
});

test('ad report replays and corrections maintain exactly one linked revenue record', async t => {
	const { env, database } = fixture(t);
	assert.equal((await (await send(adReport, env, report)).json()).outcome, 'created');
	const originalId = database.prepare('select id from monetization_revenue').get().id;
	assert.equal((await (await send(adReport, env, report)).json()).outcome, 'unchanged');
	assert.equal((await (await send(adReport, env, { ...report, revenue: 120, impressions: 1200, reference: 'CORRECTED-1' })).json()).outcome, 'updated');
	const stored = database.prepare('select * from monetization_revenue').get();
	assert.equal(stored.id, originalId); assert.equal(stored.amount, 120); assert.equal(stored.reference, 'CORRECTED-1'); assert.ok(stored.ad_report_id);
	assert.equal(database.prepare('select count(*) as n from monetization_revenue').get().n, 1);
	const totals = await overview(env); assert.equal(totals.revenue.month, 120); assert.equal(totals.ads.impressions, 1200);
});

test('same report reference can contain distinct positions/providers without losing or duplicating revenue', async t => {
	const { env, database } = fixture(t);
	for (const body of [{ ...report, placement: 'top-banner', revenue: 10 }, { ...report, placement: 'footer', revenue: 20 }, { ...report, provider: 'adsense', revenue: 30 }]) assert.equal((await send(adReport, env, body)).status, 200);
	assert.equal(database.prepare('select count(*) as n from monetization_revenue').get().n, 3);
	assert.equal((await overview(env)).revenue.month, 60);
	assert.equal((await send(adReport, env, report)).status, 409);
	assert.equal((await send(adReport, env, { ...report, provider: 'adsense', placement: 'footer' })).status, 409);
	assert.equal((await overview(env)).revenue.month, 60);
});

test('concurrent report imports and competing aggregate/position reports cannot double count', async t => {
	const { env, database } = fixture(t);
	const repeated = await Promise.all(Array.from({ length: 12 }, () => send(adReport, env, report)));
	const results = await Promise.all(repeated.map(response => response.json()));
	assert.equal(results.filter(result => result.outcome === 'created').length, 1);
	assert.equal(database.prepare('select count(*) as n from monetization_revenue').get().n, 1);
	const competing = await Promise.all([send(adReport, env, { ...report, provider: 'gam' }), send(adReport, env, { ...report, provider: 'gam', placement: 'footer' })]);
	assert.deepEqual(competing.map(response => response.status).sort(), [200, 409]);
	assert.equal((await overview(env)).revenue.month, 200);
});

test('a ledger write failure rolls back a new report and a corrected report', async t => {
	const { env, database } = fixture(t);
	database.exec("create trigger test_income_failure before insert on monetization_revenue begin select raise(abort,'test failure'); end");
	const failed = await send(adReport, env, report); assert.equal(failed.status, 503); assert.match((await failed.json()).error, /Server/);
	assert.equal(database.prepare('select count(*) as n from publisher_daily_stats').get().n, 0);
	database.exec('drop trigger test_income_failure'); await send(adReport, env, report);
	database.exec("create trigger test_correction_failure before update on monetization_revenue begin select raise(abort,'test failure'); end");
	assert.equal((await send(adReport, env, { ...report, revenue: 120 })).status, 503);
	assert.equal(database.prepare('select revenue from publisher_daily_stats').get().revenue, 100);
	assert.equal(database.prepare('select amount from monetization_revenue').get().amount, 100);
});

test('missing records and malformed requests cannot produce success confirmations', async t => {
	const { env, database } = fixture(t); await send(config, env, partner);
	for (const body of [{ ...partner, id: 'missing-partner', operation: 'update' }, { ...product, operation: 'update' }, { action: 'partner-active', id: 'missing-partner', active: false }, { action: 'product-active', id: 'missing-offer', partnerId: 'partner-aa', active: false }]) assert.equal((await send(config, env, body)).status, 404);
	database.exec("delete from ad_placements where placement='footer'");
	assert.equal((await send(config, env, { action: 'placement', placement: 'footer', provider: 'custom', enabled: false })).status, 404);
	assert.equal((await send(leadUpdate, env, { id: '33333333-3333-4333-8333-333333333333', status: 'new' })).status, 404);
	assert.equal((await send(leadUpdate, env, { id: 'not-a-uuid', status: 'new' })).status, 422);
	for (const handler of [config, revenue, adReport, leadUpdate]) {
		assert.equal((await send(handler, env, null)).status, 422);
		const response = await handler({ request: new Request('https://admin.test', { method: 'POST', body: '{' }), env });
		assert.equal(response.status, 401);
		const bad = await handler({ request: new Request('https://admin.test', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: '{' }), env }); assert.equal(bad.status, 400);
	}
});

test('database constraints enforce unique income references and protect partner history', async t => {
	const { env, database } = fixture(t); await send(config, env, partner); await send(config, env, product);
	await send(revenue, env, { ...income, partnerId: 'partner-aa' });
	assert.throws(() => database.prepare("insert into monetization_revenue(source_type,partner_id,amount,reference,occurred_at) values('direct','partner-aa',100,'INVOICE-1',?)").run(today), /UNIQUE/);
	assert.throws(() => database.prepare("insert into monetization_revenue(source_type,amount,reference,occurred_at) values('ads',100,'BAD',?)").run(today), /A3_INVALID/);
	assert.throws(() => database.exec("update monetization_products set partner_id='missing-partner'"), /A3_PARTNER_NOT_FOUND/);
	assert.throws(() => database.exec("delete from monetization_partners where id='partner-aa'"), /A3_PARTNER_IN_USE/);
});

test('old databases reject financial writes with an actionable migration message', async t => {
	const { env, database } = fixture(t, false);
	for (const [handler, body] of [[revenue, income], [adReport, report]]) {
		const response = await send(handler, env, body); assert.equal(response.status, 503); assert.match((await response.json()).error, /A3-NASAZENI/);
	}
	assert.equal(database.prepare('select count(*) as n from monetization_revenue').get().n, 0);
});

test('migration preserves clean old income/history and links existing or missing ad revenue', async t => {
	const { database, env } = fixture(t, false);
	database.prepare("insert into monetization_revenue(id,source_type,amount,reference,occurred_at,imported_at) values(7,'direct',10,?,?,'2026-01-01')").run('\u00a0 INVOICE-OLD \u202f', today);
	database.prepare("insert into publisher_daily_stats(report_date,provider,placement,revenue,reference) values(?,'custom','all',100,' OLD-AD ')").run(today);
	database.prepare("insert into monetization_revenue(id,source_type,amount,reference,occurred_at) values(8,'ads',100,' OLD-AD ',?)").run(today);
	database.prepare("insert into publisher_daily_stats(report_date,provider,placement,revenue,reference) values(?,'adsense','all',20,'MISSING-INCOME')").run(today);
	assert.deepEqual(database.prepare(audit).all(), []);
	database.exec(migration);
	assert.equal(database.prepare('select imported_at from monetization_revenue where id=7').get().imported_at, '2026-01-01');
	assert.equal(database.prepare('select reference from monetization_revenue where id=7').get().reference, 'INVOICE-OLD');
	assert.ok(database.prepare('select ad_report_id from monetization_revenue where id=8').get().ad_report_id);
	assert.equal(database.prepare('select count(*) as n from monetization_revenue').get().n, 3);
	assert.equal((await overview(env)).revenue.month, 130);
	assert.equal((await (await send(adReport, env, { ...report, reference: 'OLD-AD', impressions: 0, clicks: 0 })).json()).outcome, 'unchanged');
});

test('migration audits ambiguous old records and never silently changes their financial data', t => {
	for (const seed of [
		db => { for (let i=0;i<2;i++) db.prepare("insert into monetization_revenue(source_type,amount,reference,occurred_at) values('direct',100,'DUPLICATE',?)").run(today); },
		db => db.prepare("insert into monetization_revenue(source_type,amount,reference,occurred_at) values('ads',100,'UNMATCHED',?)").run(today),
		db => { for (const placement of ['all','footer']) db.prepare("insert into publisher_daily_stats(report_date,provider,placement,revenue,reference) values(?,'custom',?,100,'MIXED')").run(today, placement); },
		db => db.prepare("insert into monetization_products(id,partner_id,provider_name,category,product_name,affiliate_url) values('old-offer','missing-partner','Old','energy','Old','https://example.com')").run(),
	]) {
		const { database } = fixture(t, false); seed(database); const before = snapshot(database);
		assert.ok(database.prepare(audit).all().length);
		assert.throws(() => database.exec(migration), /A3_EXISTING_DATA_REQUIRE_REVIEW/);
		assert.deepEqual(snapshot(database), before);
		assert.equal(database.prepare("select name from pragma_table_info('monetization_revenue') where name='ad_report_id'").get(), undefined);
	}
});

test('list query validation and database errors return private, readable responses', async t => {
	const { env } = fixture(t);
	for (const query of ['type=leads&id=bad', 'type=products&partnerId=BAD', 'type=partners&status=new', 'type=leads&active=1']) {
		const response = await records({ request: new Request(`https://admin.test/api/admin/records?${query}`, { headers: { authorization: `Bearer ${token}` } }), env });
		assert.equal(response.status, 422); assert.equal(response.headers.get('cache-control'), 'no-store');
	}
	const brokenEnv = { ADMIN_TOKEN: token, DB: { prepare() { throw new Error('SQL with internal private details'); } } };
	const response = await metrics({ request: new Request('https://admin.test', { headers: { authorization: `Bearer ${token}` } }), env: brokenEnv });
	assert.equal(response.status, 503); assert.doesNotMatch(JSON.stringify(await response.json()), /private details/);
});

test('client form builders reject forbidden finance sources and excessive precision before submission', () => {
	const form = values => { const data = new FormData(); Object.entries(values).forEach(([key,value]) => data.set(key,String(value))); return data; };
	assert.throws(() => buildAdminSubmission('revenue', form({ ...income, sourceType: 'ads' })), /Zdroj/);
	assert.throws(() => buildAdminSubmission('revenue', form({ ...income, amount: '0.001' })), /desetinná/);
	assert.throws(() => buildAdminSubmission('ad-report', form({ ...report, placement: 'unknown' })), /pozice/);
});
