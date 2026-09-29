interface D1 {
	prepare(sql: string): { bind(...values: unknown[]): { first<T>(): Promise<T | null>; all<T>(): Promise<{ results: T[] }> } };
}
interface Env { DB?: D1; ADMIN_TOKEN?: string; }
interface MetricRow { amount: number; }

export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
	if (!env.ADMIN_TOKEN || !env.DB) return Response.json({ error: 'Admin není nakonfigurován.' }, { status: 503 });
	if (request.headers.get('authorization') !== `Bearer ${env.ADMIN_TOKEN}`) return Response.json({ error: 'Neautorizováno.' }, { status: 401, headers: { 'www-authenticate': 'Bearer' } });
	const db = env.DB;
	const [month, last30, year, sourceRevenue, funnel, daily, leadStatus, affiliate, adStats, adVariants] = await Promise.all([
		db.prepare("select coalesce(sum(amount),0) as amount from monetization_revenue where occurred_at >= date('now','start of month')").first<MetricRow>(),
		db.prepare("select coalesce(sum(amount),0) as amount from monetization_revenue where occurred_at >= date('now','-30 day')").first<MetricRow>(),
		db.prepare("select coalesce(sum(amount),0) as amount from monetization_revenue where occurred_at >= date('now','start of year')").first<MetricRow>(),
		db.prepare("select source_type as source, coalesce(sum(amount),0) as amount from monetization_revenue where occurred_at >= date('now','-30 day') group by source_type").all<{source:string;amount:number}>(),
		db.prepare("select event_name as name, count(*) as count from monetization_events where created_at >= date('now','-30 day') group by event_name").all<{name:string;count:number}>(),
		db.prepare("select date(created_at) as day, count(*) as count from monetization_events where event_name='page_view' and created_at >= date('now','-30 day') group by date(created_at) order by day").all<{day:string;count:number}>(),
		db.prepare("select status, count(*) as count from monetization_leads group by status").all<{status:string;count:number}>(),
		db.prepare("select partner_id, product_id, count(*) as clicks from monetization_events where event_name='affiliate_clicked' and created_at >= date('now','-30 day') group by partner_id, product_id order by clicks desc limit 30").all<{partner_id:string;product_id:string;clicks:number}>(),
		db.prepare("select coalesce(sum(impressions),0) as impressions,coalesce(sum(clicks),0) as clicks from publisher_daily_stats where report_date >= date('now','-30 day')").first<{impressions:number;clicks:number}>(),
		db.prepare("select json_extract(properties,'$.placement') as placement,json_extract(properties,'$.variant') as variant,count(*) as impressions from monetization_events where event_name='ad_view' and created_at >= date('now','-30 day') group by placement,variant order by placement,variant").all<{placement:string;variant:string;impressions:number}>(),
	]);
	const consentedViews = daily.results.reduce((sum, row) => sum + row.count, 0);
	return Response.json({ generatedAt: new Date().toISOString(), revenue: { month: month?.amount ?? 0, last30: last30?.amount ?? 0, year: year?.amount ?? 0, per1000Visitors: consentedViews ? (last30?.amount ?? 0) * 1000 / consentedViews : 0 }, sourceRevenue: sourceRevenue.results, funnel: funnel.results, dailyTraffic: daily.results, leads: leadStatus.results, affiliate: affiliate.results, adVariants: adVariants.results, ads: { impressions: adStats?.impressions ?? 0, clicks: adStats?.clicks ?? 0, ctr: adStats?.impressions ? 100 * adStats.clicks / adStats.impressions : 0 } }, { headers: { 'cache-control': 'no-store' } });
};
