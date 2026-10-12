import { choice, day, financeReady, json, money, number, readInput, text, withAdmin } from '../../../src/lib/admin/server.ts';
import type { AdminContext } from '../../../src/lib/admin/server.ts';
import { adPlacements } from '../../../src/lib/admin/settings.ts';

export const onRequestPost = (context: AdminContext) => withAdmin(context, async db => {
	const input = await readInput(context.request);
	const date = day(input.date, 'Datum výkazu');
	const provider = choice(input.provider, ['adsense', 'gam', 'custom'], 'Poskytovatel');
	const placement = choice(input.placement, ['all', ...adPlacements], 'Reklamní pozice');
	const reference = text(input.reference, 'Reference výkazu', 160);
	const impressions = number(input.impressions, 'Zobrazení', Number.MAX_SAFE_INTEGER, true);
	const clicks = number(input.clicks, 'Kliknutí', impressions, true);
	const revenue = money(input.revenue, 'Příjem', 100_000_000)!;
	await financeReady(db);
	const [previous, changed] = await db.batch([
		db.prepare('select id from publisher_daily_stats where report_date=? and provider=? and placement=?').bind(date, provider, placement),
		db.prepare(`insert into publisher_daily_stats (report_date,provider,placement,impressions,clicks,revenue,reference) values (?,?,?,?,?,?,?)
			on conflict(report_date,provider,placement) do update set impressions=excluded.impressions,clicks=excluded.clicks,revenue=excluded.revenue,reference=excluded.reference
			where impressions is not excluded.impressions or clicks is not excluded.clicks or revenue is not excluded.revenue or reference is not excluded.reference`).bind(date, provider, placement, impressions, clicks, revenue, reference),
	]);
	const outcome = !previous.results.length ? 'created' : changed.meta.changes ? 'updated' : 'unchanged';
	const messages = { created: 'Reklamní výkaz importován a příjem zaúčtován.', updated: 'Reklamní výkaz aktualizován včetně příjmu.', unchanged: 'Tento reklamní výkaz již byl importován. Součet se nezvýšil.' };
	return json({ ok: true, outcome, message: messages[outcome] });
});
