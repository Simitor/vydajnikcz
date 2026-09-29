interface D1 { prepare(sql: string): { bind(...values: unknown[]): { first<T>(): Promise<T | null>; run(): Promise<unknown> } }; }
interface Env { DB?: D1; }
interface ProductRow { id: string; partner_id: string; affiliate_url: string; active: number; partner_active: number; }

export const onRequestGet = async ({ request, env, params }: { request: Request; env: Env; params: Record<string, string> }) => {
	if (!env.DB) return new Response('Partnerské odkazy nejsou nakonfigurovány.', { status: 503 });
	const product = await env.DB.prepare('select pr.id, pr.partner_id, pr.affiliate_url, pr.active, pa.active as partner_active from monetization_products pr inner join monetization_partners pa on pa.id=pr.partner_id where pr.partner_id = ? and pr.id = ?')
		.bind(params.partner, params.product).first<ProductRow>();
	if (!product || !product.active || !product.partner_active || !/^https:\/\//i.test(product.affiliate_url)) return new Response('Nabídka již není dostupná.', { status: 404 });
	const url = new URL(request.url);
	const calculator = (url.searchParams.get('calculator') || '').slice(0, 80);
	if (url.searchParams.get('track') === '1') await env.DB.prepare("insert into monetization_events (event_name, calculator, partner_id, product_id, consented_at) values ('affiliate_clicked', ?, ?, ?, ?)")
		.bind(calculator || null, product.partner_id, product.id, new Date().toISOString()).run();
	return Response.redirect(product.affiliate_url, 302);
};
