import { categoryLabels } from '../../../src/lib/admin/record-model.ts';
import { adPlacements } from '../../../src/lib/admin/settings.ts';
import { AdminError, choice, flag, httpsUrl, json, money, number, optionalText, readInput, slug, strings, text, withAdmin } from '../../../src/lib/admin/server.ts';
import type { AdminContext } from '../../../src/lib/admin/server.ts';

interface PartnerRow { id: string; display_name: string; licensed_distributor: number; registration_url: string | null; categories_json: string; regions_json: string; }
interface ProductRow { id: string; category: string; coverage_json: string; }
const licensed = (partner: PartnerRow) => {
	try { return Boolean(partner.licensed_distributor && httpsUrl(partner.registration_url, 'Registr partnera')); } catch { return false; }
};
export const onRequestPost = (context: AdminContext) => withAdmin(context, async db => {
	const input = await readInput(context.request);
	const action = choice(input.action, ['partner', 'product', 'partner-active', 'product-active', 'placement'], 'Operace');
	const operation = choice(input.operation ?? 'upsert', ['create', 'update', 'upsert'], 'Způsob ukládání');
	if (action === 'placement') {
		const placement = choice(input.placement, adPlacements, 'Reklamní pozice');
		const provider = choice(input.provider, ['adsense', 'gam', 'custom'], 'Poskytovatel');
		const unitId = optionalText(input.unitId, 'ID reklamní jednotky', 120);
		const variant = text(input.variant ?? 'control', 'Varianta', 40);
		const enabled = flag(input.enabled, 'Zapnutí pozice');
		const result = await db.prepare('update ad_placements set enabled=?,provider=?,unit_id=?,variant=?,updated_at=? where placement=?').bind(enabled ? 1 : 0, provider, unitId, variant, new Date().toISOString(), placement).run();
		if (!result.meta.changes) throw new AdminError('Reklamní pozice nebyla nalezena.', 404);
		return json({ ok: true });
	}
	const id = slug(input.id, 'ID', action.startsWith('product') ? 60 : 40);
	if (action === 'partner-active') {
		if (input.active === undefined) throw new AdminError('Zvolte aktivní nebo vypnutý stav.');
		const active = flag(input.active, 'Aktivní stav');
		const partner = await db.prepare('select * from monetization_partners where id=?').bind(id).first<PartnerRow>();
		if (!partner) throw new AdminError('Partner nebyl nalezen. Obnovte seznam.', 404);
		const insurance = await db.prepare("select id from monetization_products where partner_id=? and category='car-insurance' and active=1 limit 1").bind(id).first();
		if (active && (partner.categories_json.includes('car-insurance') || insurance) && !licensed(partner)) throw new AdminError('Před aktivací pojišťovacích nabídek ověřte licenci partnera a odkaz na jeho evidenci.');
		const result = await db.prepare('update monetization_partners set active=? where id=?').bind(active ? 1 : 0, id).run();
		if (!result.meta.changes) throw new AdminError('Partner nebyl nalezen.', 404);
		return json({ ok: true });
	}
	if (action === 'partner') {
		const name = text(input.name, 'Název firmy', 100, 2);
		const cats = strings(input.categories, 'Kategorie', 8, 40, 1);
		cats.forEach(category => choice(category, Object.keys(categoryLabels), 'Kategorie'));
		const active = flag(input.active, 'Aktivní stav'); const distributor = flag(input.licensed, 'Ověření distributora');
		const registration = httpsUrl(input.registrationUrl, 'Registr partnera', true);
		const priority = number(input.priority ?? 0, 'Priorita', 1000, true);
		const secretRef = optionalText(input.secretRef, 'Webhook secret env klíč', 64);
		if (secretRef && !/^[A-Z][A-Z0-9_]{2,63}$/.test(secretRef)) throw new AdminError('Webhook secret env klíč: použijte velká písmena, číslice a podtržítka, délka 3 až 64 znaků.');
		const payoutModel = optionalText(input.payoutModel, 'Model odměny', 80);
		const existing = await db.prepare('select * from monetization_partners where id=?').bind(id).first<PartnerRow>();
		if (operation === 'create' && existing) throw new AdminError('Partner s tímto ID již existuje. Otevřete jej ze seznamu pomocí Upravit.', 409);
		if (operation === 'update' && !existing) throw new AdminError('Upravovaný partner již neexistuje. Obnovte seznam.', 404);
		const insurance = await db.prepare("select id from monetization_products where partner_id=? and category='car-insurance' and active=1 limit 1").bind(id).first();
		if (active && (cats.includes('car-insurance') || insurance) && (!distributor || !registration)) throw new AdminError('Před aktivací pojišťovací nabídky ověřte licenci partnera a uložte odkaz na jeho evidenci.');
		const regions = input.regions === undefined ? existing?.regions_json ?? '[]' : JSON.stringify(strings(input.regions, 'Regiony', 30, 80));
		const values = [name, active ? 1 : 0, distributor ? 1 : 0, registration, JSON.stringify(cats), regions, priority, secretRef, payoutModel];
		if (operation === 'update') {
			const result = await db.prepare('update monetization_partners set display_name=?,active=?,licensed_distributor=?,registration_url=?,categories_json=?,regions_json=?,priority=?,lead_endpoint_secret_ref=?,payout_model=? where id=?').bind(...values, id).run();
			if (!result.meta.changes) throw new AdminError('Upravovaný partner již neexistuje.', 404);
		} else {
			const conflict = operation === 'create' ? '' : ' on conflict(id) do update set display_name=excluded.display_name,active=excluded.active,licensed_distributor=excluded.licensed_distributor,registration_url=excluded.registration_url,categories_json=excluded.categories_json,regions_json=excluded.regions_json,priority=excluded.priority,lead_endpoint_secret_ref=excluded.lead_endpoint_secret_ref,payout_model=excluded.payout_model';
			await db.prepare('insert into monetization_partners (id,display_name,active,licensed_distributor,registration_url,categories_json,regions_json,priority,lead_endpoint_secret_ref,payout_model) values (?,?,?,?,?,?,?,?,?,?)' + conflict).bind(id, ...values).run();
		}
		return json({ ok: true });
	}
	const partnerId = slug(input.partnerId, 'Partner ID');
	const existing = await db.prepare('select * from monetization_products where partner_id=? and id=?').bind(partnerId, id).first<ProductRow>();
	if (action === 'product-active') {
		if (input.active === undefined) throw new AdminError('Zvolte aktivní nebo vypnutý stav.');
		const active = flag(input.active, 'Aktivní stav');
		if (!existing) throw new AdminError('Nabídka nebyla nalezena. Obnovte seznam.', 404);
		const partner = await db.prepare('select * from monetization_partners where id=?').bind(partnerId).first<PartnerRow>();
		if (!partner) throw new AdminError('Partner nabídky nebyl nalezen.');
		if (active && existing.category === 'car-insurance' && !licensed(partner)) throw new AdminError('Pojištění lze zapnout pouze u ověřeného distributora s odkazem na evidenci.');
		const result = await db.prepare('update monetization_products set active=?,updated_at=? where partner_id=? and id=?').bind(active ? 1 : 0, new Date().toISOString(), partnerId, id).run();
		if (!result.meta.changes) throw new AdminError('Nabídka nebyla nalezena.', 404);
		return json({ ok: true });
	}
	const name = text(input.name, 'Název produktu', 120, 2);
	const category = choice(input.category, Object.keys(categoryLabels), 'Kategorie');
	const price = money(input.price, 'Cena', 99_999_999.99, true);
	const period = input.period == null || input.period === '' ? null : choice(input.period, ['month', 'year', 'one-off'], 'Období');
	const affiliate = httpsUrl(input.affiliateUrl, 'Partnerská URL');
	const terms = httpsUrl(input.termsUrl, 'Podmínky URL', true);
	const excess = optionalText(input.excess, 'Spoluúčast', 80);
	const indicative = flag(input.indicative, 'Orientační cena'); const sponsored = flag(input.sponsored, 'Sponzorovaná pozice'); const active = flag(input.active, 'Aktivní stav');
	if (operation === 'create' && existing) throw new AdminError('Nabídka s tímto ID již u partnera existuje. Otevřete ji ze seznamu pomocí Upravit.', 409);
	if (operation === 'update' && !existing) throw new AdminError('Upravovaná nabídka již neexistuje. Obnovte seznam.', 404);
	const partner = await db.prepare('select * from monetization_partners where id=?').bind(partnerId).first<PartnerRow>();
	if (!partner) throw new AdminError('Nejprve uložte partnera nebo vyberte existujícího partnera ze seznamu.');
	if (active && category === 'car-insurance' && !licensed(partner)) throw new AdminError('Pojištění lze zapnout pouze u ověřeného distributora s odkazem na evidenci oprávnění.');
	const coverage = input.coverage === undefined ? existing?.coverage_json ?? '[]' : JSON.stringify(strings(input.coverage, 'Krytí', 20, 200));
	const values = [partner.display_name, category, name, price, period, indicative ? 1 : 0, new Date().toISOString(), excess, coverage, terms, affiliate, sponsored ? 1 : 0, active ? 1 : 0];
	if (operation === 'update') {
		const result = await db.prepare('update monetization_products set provider_name=?,category=?,product_name=?,price_amount=?,price_period=?,indicative_price=?,updated_at=?,excess=?,coverage_json=?,terms_url=?,affiliate_url=?,sponsored=?,active=? where partner_id=? and id=?').bind(...values, partnerId, id).run();
		if (!result.meta.changes) throw new AdminError('Upravovaná nabídka již neexistuje.', 404);
	} else {
		const conflict = operation === 'create' ? '' : ' on conflict(partner_id,id) do update set provider_name=excluded.provider_name,category=excluded.category,product_name=excluded.product_name,price_amount=excluded.price_amount,price_period=excluded.price_period,indicative_price=excluded.indicative_price,updated_at=excluded.updated_at,excess=excluded.excess,coverage_json=excluded.coverage_json,terms_url=excluded.terms_url,affiliate_url=excluded.affiliate_url,sponsored=excluded.sponsored,active=excluded.active';
		await db.prepare("insert into monetization_products (partner_id,id,price_currency,provider_name,category,product_name,price_amount,price_period,indicative_price,updated_at,excess,coverage_json,terms_url,affiliate_url,sponsored,active) values (?,?,'CZK',?,?,?,?,?,?,?,?,?,?,?,?,?)" + conflict).bind(partnerId, id, ...values).run();
	}
	return json({ ok: true });
});
