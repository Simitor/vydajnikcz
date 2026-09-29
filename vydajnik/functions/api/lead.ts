interface Env {
	LEAD_WEBHOOK_URL?: string;
	LEAD_WEBHOOK_SECRET?: string;
	DB?: { prepare(sql: string): { bind(...values: unknown[]): { run(): Promise<unknown> } } };
}

const json = (body: unknown, status = 200) => Response.json(body, {
	status,
	headers: { 'cache-control': 'no-store' },
});

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
	if (!request.headers.get('content-type')?.includes('application/json')) return json({ error: 'Očekáváme JSON.' }, 415);
	let data: Record<string, unknown>;
	try { data = await request.json(); } catch { return json({ error: 'Formulář se nepodařilo přečíst.' }, 400); }
	if (JSON.stringify(data).length > 16384) return json({ error: 'Formulář je příliš velký.' }, 413);
	if (typeof data.website === 'string' && data.website.length) return json({ ok: true });
	const name = typeof data.name === 'string' ? data.name.trim() : '';
	const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
	const phone = typeof data.phone === 'string' ? data.phone.replace(/[\s().-]/g, '') : '';
	if (name.length < 2 || name.length > 100) return json({ error: 'Zadejte platné jméno.' }, 422);
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return json({ error: 'Zadejte platný e-mail.' }, 422);
	if (!/^(?:\+420|\+421|00420|00421|420|421)?\d{9}$/.test(phone)) return json({ error: 'Zadejte české nebo slovenské telefonní číslo.' }, 422);
	if (data.consent !== true) return json({ error: 'Pro odeslání je nutný souhlas se zpracováním údajů.' }, 422);
	if (!env.LEAD_WEBHOOK_URL && !env.DB) return json({ error: 'Odesílání formuláře zatím není nakonfigurováno.' }, 503);
	const leadId = crypto.randomUUID();
	const calculator = String(data.calculator || 'unknown').slice(0, 80);
	const leadType = String(data.leadType || (calculator === 'inzerce' ? 'advertising-inquiry' : 'information-request')).slice(0, 60);
	const result = JSON.stringify({ ...(data.result && typeof data.result === 'object' ? data.result as Record<string, unknown> : {}), company: typeof data.company === 'string' ? data.company.slice(0, 160) : undefined, interest: typeof data.interest === 'string' ? data.interest.slice(0, 80) : undefined });
	try {
		if (env.DB) await env.DB.prepare("insert into monetization_leads (id, name, email, phone, calculator, lead_type, calculator_result_json, consent, consent_timestamp, status, source) values (?, ?, ?, ?, ?, ?, ?, 1, ?, 'new', ?)")
			.bind(leadId, name, email, phone, calculator, leadType, result, new Date().toISOString(), new URL(request.url).origin).run();
		if (env.LEAD_WEBHOOK_URL) {
		const response = await fetch(env.LEAD_WEBHOOK_URL, {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...(env.LEAD_WEBHOOK_SECRET ? { authorization: `Bearer ${env.LEAD_WEBHOOK_SECRET}` } : {}) },
			body: JSON.stringify({ id: leadId, name, phone, email, company: data.company, interest: data.interest, calculator, leadType, result: data.result ?? null, consent: true, consentTimestamp: new Date().toISOString(), submittedAt: new Date().toISOString(), ip: request.headers.get('CF-Connecting-IP') }),
		});
		if (!response.ok) return json({ error: 'Odeslání se nepodařilo. Zkuste to prosím později.' }, 502);
		}
		return json({ ok: true });
	} catch { return json({ error: 'Odeslání se nepodařilo. Zkuste to prosím později.' }, 502); }
};
