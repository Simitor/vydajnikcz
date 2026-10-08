import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase } from './helpers/d1.mjs';
import { onRequestGet as records } from '../functions/api/admin/records.ts';
import { onRequestPost as config } from '../functions/api/admin/config.ts';
import { onRequestPost as updateLead } from '../functions/api/admin/leads.ts';
import { onRequestGet as products } from '../functions/api/products.ts';
import { onRequestGet as redirect } from '../functions/go/[partner]/[product].ts';
import { onRequestGet as metrics } from '../functions/api/admin/metrics.ts';

const token = 'isolated-a2-test-token';
const request = (path, body, credential = token) => new Request(`https://admin.test${path}`, {
	method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...(credential ? { authorization: `Bearer ${credential}` } : {}) },
	...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const fixture = t => { const result = createTestDatabase(); t.after(() => result.database.close()); return { ...result, env: { DB: result.DB, ADMIN_TOKEN: token } }; };
const partner = (database, id = 'partner-aa', overrides = {}) => {
	const data = { name: 'Firma Alfa', active: 1, licensed: 0, categories: ['energy'], regions: ['Praha'], ...overrides };
	database.prepare('insert into monetization_partners (id,display_name,active,licensed_distributor,categories_json,regions_json,priority,payout_model) values (?,?,?,?,?,?,10,?)')
		.run(id, data.name, data.active, data.licensed, JSON.stringify(data.categories), JSON.stringify(data.regions), 'za objednávku');
};
const product = (database, id = 'offer-aa', partnerId = 'partner-aa', overrides = {}) => {
	const data = { name: 'Nabídka Alfa', active: 1, price: 499.95, category: 'energy', ...overrides };
	database.prepare('insert into monetization_products (id,partner_id,provider_name,category,product_name,price_amount,price_period,affiliate_url,active,coverage_json) values (?,?,?,?,?,?,?,?,?,?)')
		.run(id, partnerId, 'Původní název', data.category, data.name, data.price, 'month', 'https://example.com/offer', data.active, '["Zachovat tyto podmínky"]');
};
const leadId = '11111111-1111-4111-8111-111111111111';
const lead = (database, id = leadId, overrides = {}) => {
	const data = { name: 'Žaneta Nováková', status: 'new', payout: 150.5, company: 'Firma pro poptávku', interest: 'Reklama', ...overrides };
	database.prepare('insert into monetization_leads (id,name,email,phone,calculator,lead_type,calculator_result_json,consent,consent_timestamp,status,payout_amount,source) values (?,?,?,?,?,?,?,1,?,?,?,?)')
		.run(id, data.name, 'test@example.com', '+420123456789', 'inzerce', 'advertising-inquiry', JSON.stringify({ company: data.company, interest: data.interest, other: '<script>unsafe</script>' }), '2026-10-08T12:00:00.000Z', data.status, data.payout, 'https://admin.test');
};
const get = (env, query) => records({ request: request(`/api/admin/records?${query}`), env });
const save = (env, body) => config({ request: request('/api/admin/config', body), env });

test('record lists and details require the admin token and never cache private data', async t => {
	const { env, database } = fixture(t); partner(database); product(database); lead(database);
	for (const type of ['partners', 'products', 'leads']) {
		for (const credential of [null, 'wrong-token']) {
			const response = await records({ request: request(`/api/admin/records?type=${type}`, undefined, credential), env });
			assert.equal(response.status, 401); assert.equal(response.headers.get('cache-control'), 'no-store');
			assert.deepEqual(await response.json(), { error: 'Neautorizováno.' });
		}
		const response = await get(env, `type=${type}`); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
		assert.equal((await response.json()).total, 1);
	}
	assert.equal((await get({}, 'type=partners')).status, 503);
});

test('partners support search, active/category filters and stable pagination', async t => {
	const { env, database } = fixture(t);
	for (let index = 0; index < 30; index++) partner(database, `partner-${String(index).padStart(2, '0')}`, { name: `Firma ${String(index).padStart(2, '0')}`, active: index % 2, categories: index % 2 ? ['energy'] : ['internet'] });
	const first = await (await get(env, 'type=partners&limit=10&page=1')).json(); const second = await (await get(env, 'type=partners&limit=10&page=2')).json();
	assert.equal(first.total, 30); assert.equal(first.items.length, 10); assert.equal(second.items[0].id, 'partner-10');
	assert.equal((await (await get(env, 'type=partners&active=1&category=energy')).json()).total, 15);
	assert.equal((await (await get(env, 'type=partners&q=Firma%2007')).json()).items[0].id, 'partner-07');
	partner(database, 'literal-partner', { name: 'Firma %_\\ znak' });
	const literal = await (await get(env, new URLSearchParams({ type: 'partners', q: '%_\\' }).toString())).json();
	assert.equal(literal.total, 1); assert.equal(literal.items[0].id, 'literal-partner');
	assert.equal((await (await get(env, new URLSearchParams({ type: 'partners', q: "' or 1=1 --" }).toString())).json()).total, 0);
	for (const query of ['limit=101', 'page=0', 'page=1.5', 'active=unknown', 'category=constructor']) assert.equal((await get(env, `type=partners&${query}`)).status, 422);
});

test('products use the complete partner/product identity and return editable values', async t => {
	const { env, database } = fixture(t); partner(database); partner(database, 'partner-bb', { name: 'Firma Beta', active: 0 });
	product(database, 'same-offer', 'partner-aa'); product(database, 'same-offer', 'partner-bb', { category: 'internet', price: null });
	const page = await (await get(env, 'type=products&partnerId=partner-bb&category=internet&active=1')).json();
	assert.equal(page.total, 1); assert.equal(page.items[0].price, null); assert.equal(page.items[0].partnerActive, false);
	const detail = await (await get(env, 'type=products&id=same-offer&partnerId=partner-aa')).json();
	assert.equal(detail.item.price, 499.95); assert.deepEqual(detail.item.coverage, ['Zachovat tyto podmínky']);
	assert.equal((await get(env, 'type=products&id=same-offer')).status, 422);
	assert.equal((await get(env, 'type=products&id=missing&partnerId=partner-aa')).status, 404);
	assert.equal((await (await get(env, 'type=products&q=Beta')).json()).total, 1);
});

test('editing preserves hidden metadata and updates public prices and partner names', async t => {
	const { env, database } = fixture(t); partner(database); product(database);
	const partnerBody = { action: 'partner', operation: 'update', id: 'partner-aa', name: 'Nová firma', categories: ['energy'], active: true, licensed: false, priority: 10, payoutModel: 'za objednávku' };
	assert.equal((await save(env, partnerBody)).status, 200);
	assert.equal(database.prepare('select regions_json from monetization_partners').get().regions_json, '["Praha"]');
	const productBody = { action: 'product', operation: 'update', id: 'offer-aa', partnerId: 'partner-aa', category: 'energy', name: 'Upravená nabídka', price: 699.5, period: null, affiliateUrl: 'https://example.com/offer', active: true };
	assert.equal((await save(env, productBody)).status, 200);
	assert.equal(database.prepare('select count(*) as count from monetization_products').get().count, 1);
	assert.equal(database.prepare('select coverage_json from monetization_products').get().coverage_json, '["Zachovat tyto podmínky"]');
	const response = await products({ request: request('/api/products?category=energy'), env });
	const catalog = await response.json(); assert.equal(catalog.offers[0].priceAmount, 699.5); assert.equal(catalog.offers[0].providerName, 'Nová firma'); assert.equal(catalog.offers[0].pricePeriod, null);
	assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('create cannot overwrite an existing record and update cannot recreate a missing record', async t => {
	const { env, database } = fixture(t); partner(database); product(database);
	const bodies = [
		{ action: 'partner', id: 'partner-aa', name: 'Přepsaná firma', categories: ['energy'], active: true },
		{ action: 'product', id: 'offer-aa', partnerId: 'partner-aa', name: 'Přepsaná nabídka', category: 'energy', price: 1, period: 'month', affiliateUrl: 'https://example.com/offer', active: true },
	];
	for (const body of bodies) {
		assert.equal((await save(env, { ...body, operation: 'create' })).status, 409);
		assert.equal((await save(env, { ...body, id: 'missing-record', operation: 'update' })).status, 404);
	}
	assert.equal(database.prepare('select display_name from monetization_partners').get().display_name, 'Firma Alfa');
	assert.equal(database.prepare('select product_name from monetization_products').get().product_name, 'Nabídka Alfa');
});

test('deactivation preserves records and hides public offers and affiliate redirects', async t => {
	const { env, database } = fixture(t); partner(database); product(database);
	const publicCatalog = async () => (await (await products({ request: request('/api/products?category=energy'), env })).json()).offers;
	const go = () => redirect({ request: request('/go/partner-aa/offer-aa'), env, params: { partner: 'partner-aa', product: 'offer-aa' } });
	assert.equal((await publicCatalog()).length, 1); assert.equal((await go()).status, 302);
	assert.equal((await save(env, { action: 'partner-active', id: 'partner-aa', active: false })).status, 200);
	assert.equal((await publicCatalog()).length, 0); assert.equal((await go()).status, 404);
	assert.equal(database.prepare('select active from monetization_products').get().active, 1);
	assert.equal((await save(env, { action: 'product', operation: 'update', id: 'offer-aa', partnerId: 'partner-aa', category: 'energy', name: 'Upraveno u vypnutého partnera', price: 50, period: 'year', affiliateUrl: 'https://example.com/offer', active: true })).status, 200);
	assert.equal((await publicCatalog()).length, 0);
	assert.equal((await save(env, { action: 'partner-active', id: 'partner-aa', active: true })).status, 200);
	assert.equal((await publicCatalog())[0].priceAmount, 50);
	assert.equal((await save(env, { action: 'product-active', id: 'offer-aa', partnerId: 'partner-aa', active: false })).status, 200);
	assert.equal((await publicCatalog()).length, 0); assert.equal((await go()).status, 404);
	assert.equal((await save(env, { action: 'product-active', id: 'offer-aa', partnerId: 'partner-aa', active: true })).status, 200);
	assert.equal((await go()).status, 302);
	assert.equal(database.prepare('select count(*) as count from monetization_products').get().count, 1);
	assert.equal(database.prepare('select coverage_json from monetization_products').get().coverage_json, '["Zachovat tyto podmínky"]');
});

test('activation validates licensing and rejects missing records without false success', async t => {
	const { env, database } = fixture(t); partner(database, 'partner-aa', { categories: ['car-insurance'], active: 0 }); product(database, 'offer-aa', 'partner-aa', { category: 'car-insurance', active: 0 });
	assert.equal((await save(env, { action: 'partner-active', id: 'partner-aa', active: true })).status, 422);
	assert.equal((await save(env, { action: 'product-active', id: 'offer-aa', partnerId: 'partner-aa', active: true })).status, 422);
	for (const body of [{ action: 'partner-active', id: 'missing', active: false }, { action: 'product-active', id: 'missing', partnerId: 'partner-aa', active: false }]) assert.equal((await save(env, body)).status, 404);
	assert.equal((await save(env, { action: 'partner-active', id: 'partner-aa', active: 'true' })).status, 422);
	assert.equal(database.prepare('select active from monetization_partners').get().active, 0);
});

test('lead lists search company/contact data and details contain the stored enquiry', async t => {
	const { env, database } = fixture(t); lead(database); lead(database, '22222222-2222-4222-8222-222222222222', { name: 'Jiný kontakt', status: 'paid', company: 'Jiná firma' });
	const page = await (await get(env, 'type=leads&status=new&q=Firma%20pro')).json();
	assert.equal(page.total, 1); assert.equal(page.items[0].id, leadId);
	const detail = await (await get(env, `type=leads&id=${leadId}`)).json();
	assert.equal(detail.item.company, 'Firma pro poptávku'); assert.equal(detail.item.interest, 'Reklama'); assert.equal(detail.item.email, 'test@example.com'); assert.equal(detail.item.payout, 150.5); assert.equal(detail.item.details.other, '<script>unsafe</script>');
	assert.equal((await get(env, 'type=leads&id=missing')).status, 404);
	assert.equal((await get(env, 'type=leads&status=constructor')).status, 422);
});

test('changing lead status preserves other data and refreshes metrics', async t => {
	const { env, database } = fixture(t); lead(database);
	const response = await updateLead({ request: request('/api/admin/leads', { id: leadId, status: 'contacted' }), env });
	assert.equal(response.status, 200);
	const stored = database.prepare('select * from monetization_leads where id=?').get(leadId);
	assert.equal(stored.status, 'contacted'); assert.equal(stored.payout_amount, 150.5); assert.equal(JSON.parse(stored.calculator_result_json).company, 'Firma pro poptávku');
	const overview = await (await metrics({ request: request('/api/admin/metrics'), env })).json(); assert.deepEqual(overview.leads, [{ status: 'contacted', count: 1 }]);
	assert.equal((await updateLead({ request: request('/api/admin/leads', { id: leadId, status: 'paid', payout: 200 }), env })).status, 200);
	const paid = database.prepare('select * from monetization_leads').get(); assert.equal(paid.payout_amount, 200); assert.ok(paid.converted_at);
	assert.equal((await updateLead({ request: request('/api/admin/leads', { id: leadId, status: 'unknown' }), env })).status, 422);
	assert.equal((await updateLead({ request: request('/api/admin/leads', { id: leadId, status: 'new', payout: false }), env })).status, 422);
	assert.equal((await updateLead({ request: request('/api/admin/leads', { id: '33333333-3333-4333-8333-333333333333', status: 'new' }), env })).status, 404);
	assert.equal((await updateLead({ request: request('/api/admin/leads', null), env })).status, 422);
});
