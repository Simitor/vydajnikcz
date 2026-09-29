interface D1 { prepare(sql: string): { bind(...values: unknown[]): { all<T>(): Promise<{ results: T[] }> } }; }
interface Env { DB?: D1; ADSENSE_CLIENT?: string; GOOGLE_CMP_CONFIGURED?: string; }
const names = new Set(['top-banner','between-hero-content','calculator-middle','calculator-bottom','article-inline-1','article-inline-2','before-faq','footer','sticky-mobile']);
export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
	const url = new URL(request.url); const requested = url.searchParams.get('placement') || '';
	if (!names.has(requested) || !env.DB) return Response.json({ enabled: false }, { headers: { 'cache-control': 'no-store' } });
	const { results } = await env.DB.prepare('select placement,enabled,provider,unit_id,desktop_format,mobile_format,variant from ad_placements where placement=?').bind(requested).all<{placement:string;enabled:number;provider:string;unit_id:string|null;desktop_format:string;mobile_format:string;variant:string}>();
	const slot = results[0]; if (!slot?.enabled || !slot.unit_id || !['adsense','gam','custom'].includes(slot.provider) || (slot.provider!=='custom'&&env.GOOGLE_CMP_CONFIGURED!=='true') || (slot.provider==='adsense'&&!env.ADSENSE_CLIENT)) return Response.json({ enabled: false }, { headers: { 'cache-control': 'no-store' } });
	return Response.json({ ...slot, enabled: true, adsenseClient: env.ADSENSE_CLIENT || null }, { headers: { 'cache-control': 'no-store' } });
};
