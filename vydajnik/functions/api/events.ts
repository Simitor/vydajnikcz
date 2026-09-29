interface EventRow { event: string; calculator?: string; properties?: Record<string, unknown>; consent?: boolean; }
interface D1 { prepare(sql: string): { bind(...values: unknown[]): { run(): Promise<unknown> } }; }
interface Env { DB?: D1; }
const allowed = new Set(['calculator_started','calculator_completed','lead_form_started','lead_submitted','partner_clicked','affiliate_clicked','ad_view','ad_click','pdf_generated','report_downloaded','page_view']);
const allowedCalculators = new Set(['income','auto','energy','housing','car-insurance','inzerce']);

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
	if (!request.headers.get('content-type')?.includes('application/json')) return Response.json({ error: 'JSON required' }, { status: 415 });
	if (Number(request.headers.get('content-length') || 0) > 4096) return Response.json({ error: 'Event too large' }, { status: 413 });
	let input: EventRow;
	try { input = await request.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
	if (!input.consent || !allowed.has(String(input.event))) return Response.json({ error: 'Consent or event invalid' }, { status: 422 });
	if (!env.DB) return Response.json({ accepted: true }, { status: 202 });
	const raw = input.properties && typeof input.properties === 'object' ? input.properties : {};
	const properties = JSON.stringify(Object.fromEntries(['partner','product','placement','variant'].flatMap((key) => typeof raw[key] === 'string' ? [[key, String(raw[key]).slice(0, 100)]] : [])));
	await env.DB.prepare('insert into monetization_events (event_name, calculator, properties, consented_at) values (?, ?, ?, ?)')
		.bind(input.event, allowedCalculators.has(String(input.calculator)) ? input.calculator : null, properties, new Date().toISOString()).run();
	return Response.json({ accepted: true }, { status: 202, headers: { 'cache-control': 'no-store' } });
};
