import { categoryLabels, leadStatusLabels, partnerRecord, productRecord, leadRecord } from '../../../src/lib/admin/record-model.ts';

import { AdminError, json, leadId, slug, withAdmin } from '../../../src/lib/admin/server.ts';
import type { AdminContext } from '../../../src/lib/admin/server.ts';

export const onRequestGet = (context: AdminContext) => withAdmin(context, async db => {
	const params = new URL(context.request.url).searchParams;
	const type = params.get('type');
	if (!['partners', 'products', 'leads'].includes(type || '')) return json({ error: 'Neznámý seznam.' }, 400);
	const page = Number(params.get('page') ?? 1); const limit = Number(params.get('limit') ?? 25);
	const query = (params.get('q') || '').trim(); const active = params.get('active') || ''; const status = params.get('status') || '';
	const category = params.get('category') || ''; const partnerId = params.get('partnerId') || '';
	if (!Number.isInteger(page) || page < 1 || page > 1000000 || !Number.isInteger(limit) || limit < 1 || limit > 100 || query.length > 160 ||
		!['', '0', '1'].includes(active) || (category && !Object.hasOwn(categoryLabels, category)) || (status && !Object.hasOwn(leadStatusLabels, status))) {
		return json({ error: 'Zkontrolujte hledání, filtry a číslo stránky.' }, 422);
	}
	const isPartner = type === 'partners'; const isProduct = type === 'products';
	if (partnerId) slug(partnerId, 'Partner ID');
	if ((isPartner && partnerId) || ((isPartner || isProduct) && status) || (!isPartner && !isProduct && (category || active))) throw new AdminError('Vyberte filtry odpovídající tomuto seznamu.');
	const from = isPartner ? 'monetization_partners r' : isProduct ? 'monetization_products r left join monetization_partners pa on pa.id=r.partner_id' : 'monetization_leads r left join monetization_partners pa on pa.id=r.partner_id';
	const fields = isPartner ? 'r.*' : isProduct ? 'r.*, pa.display_name as partner_name, pa.active as partner_active' : 'r.*, pa.display_name as partner_name';
	const map = isPartner ? partnerRecord : isProduct ? productRecord : leadRecord;
	const id = params.get('id');
	if (id !== null) {
		if (isPartner || isProduct) slug(id, 'ID', isProduct ? 60 : 40); else leadId(id);
		if (isProduct && !partnerId) return json({ error: 'Vyberte partnera produktu.' }, 422);
		const row = await db.prepare(`select ${fields} from ${from} where r.id=?${isProduct ? ' and r.partner_id=?' : ''}`)
			.bind(...(isProduct ? [id, partnerId] : [id])).first<Record<string, unknown>>();
		return row ? json({ item: map(row) }) : json({ error: 'Záznam nebyl nalezen. Obnovte seznam.' }, 404);
	}
	const where: string[] = []; const values: unknown[] = [];
	if (query) {
		const columns = isPartner ? ['r.id', 'r.display_name'] : isProduct ? ['r.id', 'r.product_name', 'r.partner_id', 'pa.display_name'] : ['r.id', 'r.name', 'r.email', 'r.phone', 'r.calculator_result_json'];
		const pattern = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
		where.push(`(${columns.map(column => `${column} like ? escape '\\'`).join(' or ')})`);
		values.push(...columns.map(() => pattern));
	}
	if (active && (isPartner || isProduct)) { where.push('r.active=?'); values.push(Number(active)); }
	if (category && isPartner) { where.push('exists (select 1 from json_each(r.categories_json) where value=?)'); values.push(category); }
	if (category && isProduct) { where.push('r.category=?'); values.push(category); }
	if (partnerId && !isPartner) { where.push('r.partner_id=?'); values.push(partnerId); }
	if (status && !isPartner && !isProduct) { where.push('r.status=?'); values.push(status); }
	const filter = where.length ? ` where ${where.join(' and ')}` : '';
	const order = isPartner ? 'r.display_name collate nocase, r.id' : isProduct ? 'r.product_name collate nocase, r.partner_id, r.id' : 'r.created_at desc, r.id';
	const [count, rows] = await Promise.all([
		db.prepare(`select count(*) as total from ${from}${filter}`).bind(...values).first<{ total: number }>(),
		db.prepare(`select ${fields} from ${from}${filter} order by ${order} limit ? offset ?`).bind(...values, limit, (page - 1) * limit).all<Record<string, unknown>>(),
	]);
	return json({ items: rows.results.map(map), total: count?.total ?? 0, page, limit });
});
