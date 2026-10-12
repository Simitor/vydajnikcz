import { AdminError, choice, day, financeReady, json, money, optionalText, readInput, slug, text, withAdmin } from '../../../src/lib/admin/server.ts';
import type { AdminContext } from '../../../src/lib/admin/server.ts';

export const onRequestPost = (context: AdminContext) => withAdmin(context, async db => {
	const input = await readInput(context.request);
	if (input.sourceType === 'ads') throw new AdminError('Reklamní příjem vložte přes Import reklamního výkazu. Tam se výkaz a příjem ukládají společně.');
	const source = choice(input.sourceType, ['affiliate', 'lead', 'direct', 'sponsored', 'premium'], 'Zdroj příjmu');
	const amount = money(input.amount, 'Částka', 1_000_000_000)!;
	const date = day(input.occurredAt, 'Datum reportu');
	const reference = text(input.reference, 'Reference reportu', 160);
	const rawPartner = optionalText(input.partnerId, 'Partner ID', 40);
	const partnerId = rawPartner ? slug(rawPartner, 'Partner ID') : null;
	if (partnerId && !await db.prepare('select id from monetization_partners where id=?').bind(partnerId).first()) throw new AdminError('Partner příjmu nebyl nalezen. Vyberte existujícího partnera.');
	await financeReady(db);
	const occurredAt = `${date}T00:00:00.000Z`;
	const [inserted, stored] = await db.batch([
		db.prepare("insert into monetization_revenue (source_type,partner_id,amount,currency,reference,occurred_at) values (?,?,?,'CZK',?,?) on conflict do nothing").bind(source, partnerId, amount, reference, occurredAt),
		db.prepare("select amount,currency,occurred_at from monetization_revenue where ad_report_id is null and source_type=? and coalesce(partner_id,'')=? and trim(reference)=?").bind(source, partnerId ?? '', reference),
	]);
	const row = stored.results[0];
	if (!row) throw new Error('Revenue confirmation missing');
	if (!inserted.meta.changes) {
		if (Number(row.amount) !== amount || row.currency !== 'CZK' || String(row.occurred_at).slice(0, 10) !== date) throw new AdminError('Tato reference už je zaúčtovaná s jinými údaji. Zkontrolujte původní vyúčtování; příjem nebyl přepsán.', 409);
		return json({ ok: true, outcome: 'unchanged', message: 'Tento příjem již byl zaúčtován. Součet se nezvýšil.' });
	}
	return json({ ok: true, outcome: 'created', message: 'Příjem zaúčtován.' });
});
