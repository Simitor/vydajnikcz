interface D1 { prepare(sql: string): { bind(...values: unknown[]): { all<T>(): Promise<{ results: T[] }> } }; }
interface Env { DB?: D1; }
interface Offer { id: string; partner_id: string; provider_name: string; registration_url: string | null; category: string; product_name: string; price_amount: number | null; price_currency: string; price_period: string | null; indicative_price: number; updated_at: string | null; excess: string | null; coverage_json: string; terms_url: string | null; sponsored: number; }
const categories = new Set(['car-insurance','home-insurance','energy','mortgage','loan','bank-account','mobile','internet']);

export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
	const category = new URL(request.url).searchParams.get('category') || '';
	if (!categories.has(category) || !env.DB) return Response.json({ offers: [] }, { headers: { 'cache-control': 'public, max-age=60' } });
	const { results } = await env.DB.prepare('select pr.id, pr.partner_id, pr.provider_name, pa.registration_url, pr.category, pr.product_name, pr.price_amount, pr.price_currency, pr.price_period, pr.indicative_price, pr.updated_at, pr.excess, pr.coverage_json, pr.terms_url, pr.sponsored from monetization_products pr inner join monetization_partners pa on pa.id=pr.partner_id and pa.active=1 where pr.category = ? and pr.active = 1 order by pr.provider_name asc')
		.bind(category).all<Offer>();
	return Response.json({ offers: results.map((row) => ({ id: row.id, partnerId: row.partner_id, providerName: row.provider_name, registrationUrl: row.registration_url, category: row.category, productName: row.product_name, priceAmount: row.price_amount, priceCurrency: row.price_currency, pricePeriod: row.price_period, indicativePrice: Boolean(row.indicative_price), updatedAt: row.updated_at, excess: row.excess, coverage: JSON.parse(row.coverage_json || '[]'), termsUrl: row.terms_url, affiliatePath: `/go/${encodeURIComponent(row.partner_id)}/${encodeURIComponent(row.id)}`, sponsored: Boolean(row.sponsored) })) }, { headers: { 'cache-control': 'public, max-age=60' } });
};
