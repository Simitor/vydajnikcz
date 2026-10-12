import { leadStatusLabels } from '../../../src/lib/admin/record-model.ts';
import { AdminError, choice, json, leadId, money, readInput, withAdmin } from '../../../src/lib/admin/server.ts';
import type { AdminContext } from '../../../src/lib/admin/server.ts';
const csvCell = (value: unknown) => {
	let text = String(value ?? '');
	// Quoting alone does not stop Excel from interpreting a cell as a formula.
	if (typeof value === 'string' && (/^[\t\r\n]/.test(text) || /^[\s\u0000-\u001f]*[=+\-@]/.test(text))) text = `'${text}`;
	return `"${text.replaceAll('"', '""')}"`;
};
export const onRequestGet = (context: AdminContext) => withAdmin(context, async db => {
	const {results}=await db.prepare('select id,created_at,name,email,phone,calculator,partner_id,lead_type,consent_timestamp,status,payout_amount from monetization_leads order by created_at desc limit 5000').bind().all<Record<string,unknown>>();
	const csv=['id;created_at;jmeno;email;telefon;kalkulacka;partner;typ;souhlas;stav;payout',...results.map(row=>[row.id,row.created_at,row.name,row.email,row.phone,row.calculator,row.partner_id,row.lead_type,row.consent_timestamp,row.status,row.payout_amount].map(csvCell).join(';'))].join('\r\n');
	return new Response(`\uFEFF${csv}`,{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="vydajnik-leady.csv"','cache-control':'no-store','x-content-type-options':'nosniff'}});
});

export const onRequestPost = (context: AdminContext) => withAdmin(context, async db => {
	const body = await readInput(context.request);
	const id = leadId(body.id); const status = choice(body.status, Object.keys(leadStatusLabels), 'Stav poptávky');
	const explicitPayout = Object.hasOwn(body, 'payout') ? money(body.payout, 'Potvrzená odměna', 100_000_000, true) : undefined;
	const existing = await db.prepare('select payout_amount from monetization_leads where id=?').bind(id).first<{ payout_amount: number | null }>();
	if (!existing) throw new AdminError('Poptávka nebyla nalezena. Obnovte seznam.', 404);
	const payout = explicitPayout === undefined ? existing.payout_amount : explicitPayout;
	const result = await db.prepare("update monetization_leads set status=?,payout_amount=?,converted_at=case when ? in ('converted','paid') and converted_at is null then ? else converted_at end where id=?").bind(status, payout, status, new Date().toISOString(), id).run();
	if (!result.meta.changes) throw new AdminError('Poptávka nebyla nalezena.', 404);
	return json({ ok: true });
});
