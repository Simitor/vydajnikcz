import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestDatabase } from './helpers/d1.mjs';
import { buildAdminSubmission } from '../src/lib/admin/requests.ts';
import { onRequestPost as config } from '../functions/api/admin/config.ts';
import { onRequestPost as revenue } from '../functions/api/admin/revenue.ts';
import { onRequestPost as adReport } from '../functions/api/admin/ad-report.ts';
import { onRequestGet as leads } from '../functions/api/admin/leads.ts';
import { onRequestGet as metrics } from '../functions/api/admin/metrics.ts';

const token = 'test-only-admin-token';
const today = new Date().toISOString().slice(0, 10);
const handlers = { '/api/admin/config': config, '/api/admin/revenue': revenue, '/api/admin/ad-report': adReport };
const form = values => {
	const data = new FormData();
	for (const [key, value] of Object.entries(values)) {
		if (value === true) data.set(key, 'on');
		else if (value !== false) data.set(key, String(value));
	}
	return data;
};
const request = (endpoint, body, credential = token) => new Request(`https://admin.test${endpoint}`, {
	method: body === undefined ? 'GET' : 'POST',
	headers: { 'content-type': 'application/json', ...(credential ? { authorization: `Bearer ${credential}` } : {}) },
	...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const save = (submission, env) => handlers[submission.endpoint]({ request: request(submission.endpoint, submission.payload), env });
const fixture = t => {
	const result = createTestDatabase();
	t.after(() => result.database.close());
	return { ...result, env: { DB: result.DB, ADMIN_TOKEN: token } };
};
const partnerData = { id: 'test-partner', name: 'Žluťoučká firma', categories: ' energy, internet,energy ', priority: '10', active: true, licensed: false };
const productData = { id: 'test-product', partnerId: 'test-partner', category: 'energy', name: 'Testovací nabídka', price: '499.95', period: 'month', affiliateUrl: 'https://example.com/offer', indicative: true, sponsored: false, active: true };

test('all five forms save typed values and remain saved after reopening the database', async t => {
	const directory = mkdtempSync(join(tmpdir(), 'vydajnik-admin-'));
	const filename = join(directory, 'test.sqlite');
	let result = createTestDatabase(filename);
	t.after(() => { result.database.close(); rmSync(filename); rmdirSync(directory); });
	const env = { DB: result.DB, ADMIN_TOKEN: token };
	const submissions = [
		buildAdminSubmission('partner', form(partnerData)),
		buildAdminSubmission('product', form(productData)),
		buildAdminSubmission('placement', form({ placement: 'top-banner', provider: 'custom', unitId: 'test-unit', variant: 'control', enabled: false })),
		buildAdminSubmission('revenue', form({ sourceType: 'direct', amount: '1234.56', occurredAt: today, reference: 'TEST-INVOICE' })),
		buildAdminSubmission('ad-report', form({ provider: 'custom', date: today, placement: 'all', impressions: '1000', clicks: '12', revenue: '25.50', reference: 'TEST-AD-REPORT' })),
	];
	for (const submission of submissions) {
		const response = await save(submission, env);
		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), { ok: true });
	}
	const overview = await metrics({ request: request('/api/admin/metrics'), env });
	const data = await overview.json();
	assert.equal(data.revenue.month, 1260.06);
	assert.equal(data.ads.impressions, 1000);
	assert.equal(data.ads.clicks, 12);
	result.database.close();
	result = createTestDatabase(filename);
	const storedPartner = result.database.prepare('select * from monetization_partners').get();
	assert.equal(storedPartner.display_name, 'Žluťoučká firma');
	assert.deepEqual(JSON.parse(storedPartner.categories_json), ['energy', 'internet']);
	assert.equal(storedPartner.active, 1);
	assert.equal(storedPartner.licensed_distributor, 0);
	const storedProduct = result.database.prepare('select * from monetization_products').get();
	assert.equal(storedProduct.price_amount, 499.95);
	assert.equal(storedProduct.indicative_price, 1);
	assert.equal(storedProduct.sponsored, 0);
	assert.equal(storedProduct.active, 1);
	assert.equal(result.database.prepare("select unit_id from ad_placements where placement='top-banner'").get().unit_id, 'test-unit');
	assert.equal(result.database.prepare('select count(*) as count from monetization_revenue').get().count, 2);
});

test('an empty product price remains null while zero is saved as zero', async t => {
	const { database, env } = fixture(t);
	await save(buildAdminSubmission('partner', form(partnerData)), env);
	for (const [raw, expected] of [['', null], ['0', 0]]) {
		const response = await save(buildAdminSubmission('product', form({ ...productData, price: raw })), env);
		assert.equal(response.status, 200);
		assert.equal(database.prepare('select price_amount from monetization_products').get().price_amount, expected);
	}
});

test('invalid data is rejected without a database write', async t => {
	const { database, env } = fixture(t);
	assert.throws(() => buildAdminSubmission('partner', form({ ...partnerData, categories: 'energy,unknown' })), /kategorie/);
	assert.throws(() => buildAdminSubmission('revenue', form({ sourceType: 'direct', amount: '', occurredAt: today, reference: 'TEST' })), /nezáporné číslo/);
	assert.throws(() => buildAdminSubmission('revenue', form({ sourceType: 'direct', amount: '1', occurredAt: '2026-02-31', reference: 'TEST' })), /platné datum/);
	assert.throws(() => buildAdminSubmission('ad-report', form({ date: today, impressions: '1', clicks: '2' })), /Kliknutí/);
	assert.throws(() => buildAdminSubmission('product', form({ ...productData, affiliateUrl: 'http://example.com' })), /https/);
	const badProduct = await save(buildAdminSubmission('product', form(productData)), env);
	assert.equal(badProduct.status, 422);
	assert.match((await badProduct.json()).error, /partnera/);
	const badPartner = await config({ request: request('/api/admin/config', { action: 'partner', ...partnerData, id: 'INVALID', categories: ['energy'] }), env });
	assert.equal(badPartner.status, 422);
	for (const amount of ['', null, false, -1]) {
		const response = await revenue({ request: request('/api/admin/revenue', { amount, sourceType: 'direct', occurredAt: today, reference: 'TEST' }), env });
		assert.equal(response.status, 422);
	}
	const impossibleDate = await revenue({ request: request('/api/admin/revenue', { amount: 1, sourceType: 'direct', occurredAt: '2026-02-31', reference: 'TEST' }), env });
	assert.equal(impossibleDate.status, 422);
	for (const body of [null, [], 'invalid']) {
		for (const [endpoint, handler] of Object.entries(handlers)) {
			assert.equal((await handler({ request: request(endpoint, body), env })).status, 422);
		}
	}
	const badReport = await adReport({ request: request('/api/admin/ad-report', { date: '2026-02-31', provider: 'custom', placement: 'all', impressions: 1, clicks: 0, revenue: 1, reference: 'TEST' }), env });
	assert.equal(badReport.status, 422);
	for (const table of ['monetization_partners', 'monetization_products', 'monetization_revenue', 'publisher_daily_stats']) {
		assert.equal(database.prepare(`select count(*) as count from ${table}`).get().count, 0);
	}
});

test('saving, metrics and CSV require the correct admin token', async t => {
	const { env, database } = fixture(t);
	for (const credential of [null, 'wrong-token']) {
		for (const [endpoint, handler] of Object.entries(handlers)) {
			const response = await handler({ request: request(endpoint, { action: 'partner' }, credential), env });
			assert.equal(response.status, 401);
		}
		for (const [endpoint, handler] of [['/api/admin/leads', leads], ['/api/admin/metrics', metrics]]) {
			const response = await handler({ request: request(endpoint, undefined, credential), env });
			assert.equal(response.status, 401);
			assert.equal(response.headers.get('content-disposition'), null);
		}
	}
	assert.equal(database.prepare('select count(*) as count from monetization_partners').get().count, 0);
});

test('CSV preserves Czech characters, quoting and line breaks, and neutralizes formulas', async t => {
	const { env, database } = fixture(t);
	const names = ['Žaneta; "Nováková"\nDruhý řádek', '=HYPERLINK("https://example.com")', '  @SUM(1)', '\t=1+1'];
	for (const [index, name] of names.entries()) {
		database.prepare('insert into monetization_leads (id,name,email,phone,calculator,lead_type,consent,consent_timestamp) values (?,?,?,?,?,?,1,?)')
			.run(`test-${index}`, name, 'test@example.com', '+420123456789', 'test', 'direct', today);
	}
	const response = await leads({ request: request('/api/admin/leads'), env });
	assert.equal(response.status, 200);
	assert.equal(response.headers.get('content-type'), 'text/csv; charset=utf-8');
	assert.match(response.headers.get('content-disposition'), /vydajnik-leady.csv/);
	const bytes = Buffer.from(await response.arrayBuffer());
	assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
	const csv = bytes.toString('utf8');
	assert.ok(csv.includes('"Žaneta; ""Nováková""\nDruhý řádek"'));
	assert.ok(csv.includes('"\'=HYPERLINK(""https://example.com"")"'));
	assert.ok(csv.includes('"\'  @SUM(1)"'));
	assert.ok(csv.includes('"\'\t=1+1"'));
	assert.ok(csv.includes('"\'+420123456789"'));
});
