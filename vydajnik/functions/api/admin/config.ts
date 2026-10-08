interface D1 { prepare(sql: string): { bind(...values: unknown[]): { run(): Promise<unknown>; first<T>(): Promise<T | null> } }; }
interface Env { DB?: D1; ADMIN_TOKEN?: string; }
const categories = new Set(['car-insurance','home-insurance','energy','mortgage','loan','bank-account','mobile','internet']);
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const httpsUrl = (value: unknown) => { if (typeof value !== 'string') return false; try { return new URL(value).protocol === 'https:'; } catch { return false; } };

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
	if (!env.ADMIN_TOKEN || !env.DB) return json({ error: 'Admin není nakonfigurován.' }, 503);
	if (request.headers.get('authorization') !== `Bearer ${env.ADMIN_TOKEN}`) return json({ error: 'Neautorizováno.' }, 401);
	let input: Record<string, unknown>;
	try { input = await request.json(); } catch { return json({ error: 'Neplatný JSON.' }, 400); }
	if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: 'Neplatné údaje formuláře.' }, 422);
	const db = env.DB;
	if (input.action === 'partner') {
		const id = String(input.id || ''); const name = String(input.name || '').trim(); const cats = Array.isArray(input.categories) ? input.categories.filter((x): x is string => typeof x === 'string' && categories.has(x)) : [];
		if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(id) || name.length < 2 || name.length > 100 || !cats.length) return json({ error: 'Doplňte platné ID, název a alespoň jednu kategorii.' }, 422);
		if (cats.includes('car-insurance') && input.active === true && (input.licensed !== true || !httpsUrl(input.registrationUrl))) return json({ error: 'Před aktivací pojišťovací nabídky ověřte licenci partnera a uložte odkaz na jeho evidenci.' }, 422);
		const secretRef = typeof input.secretRef === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(input.secretRef) ? input.secretRef : null;
		await db.prepare('insert into monetization_partners (id,display_name,active,licensed_distributor,registration_url,categories_json,regions_json,priority,lead_endpoint_secret_ref,payout_model) values (?,?,?,?,?,?,?,?,?,?) on conflict(id) do update set display_name=excluded.display_name,active=excluded.active,licensed_distributor=excluded.licensed_distributor,registration_url=excluded.registration_url,categories_json=excluded.categories_json,regions_json=excluded.regions_json,priority=excluded.priority,lead_endpoint_secret_ref=excluded.lead_endpoint_secret_ref,payout_model=excluded.payout_model')
			.bind(id,name,input.active===true?1:0,input.licensed===true?1:0,httpsUrl(input.registrationUrl)?input.registrationUrl:null,JSON.stringify(cats),JSON.stringify(Array.isArray(input.regions)?input.regions.filter(x=>typeof x==='string').slice(0,30):[]),Math.max(0,Math.min(1000,Number(input.priority)||0)),secretRef,String(input.payoutModel||'').slice(0,80)).run();
		return json({ ok: true });
	}
	if (input.action === 'product') {
		const id=String(input.id||'');const partner=String(input.partnerId||'');const category=String(input.category||'');const name=String(input.name||'').trim();const price=input.price===null||input.price===''?null:Number(input.price);
		if(!/^[a-z0-9][a-z0-9-]{1,59}$/.test(id)||!categories.has(category)||name.length<2||name.length>120||!(price===null||(Number.isFinite(price)&&price>=0&&price<100000000))||!httpsUrl(input.affiliateUrl))return json({error:'Zkontrolujte ID, kategorii, název, cenu a zabezpečený partnerský odkaz.'},422);
		const partnerRow=await db.prepare('select id,display_name,active,licensed_distributor,registration_url from monetization_partners where id=?').bind(partner).first<{id:string;display_name:string;active:number;licensed_distributor:number;registration_url:string|null}>();
		if(!partnerRow?.active)return json({error:'Nejprve uložte a aktivujte partnera.'},422);
		if(category==='car-insurance'&&(!partnerRow.licensed_distributor||!httpsUrl(partnerRow.registration_url)))return json({error:'Pojištění lze přidat jen aktivnímu ověřenému distributorovi s odkazem na evidenci oprávnění.'},422);
		const coverage=Array.isArray(input.coverage)?input.coverage.filter(x=>typeof x==='string').slice(0,20):[];
		await db.prepare('insert into monetization_products (id,partner_id,provider_name,category,product_name,price_amount,price_currency,price_period,indicative_price,updated_at,excess,coverage_json,terms_url,affiliate_url,sponsored,active) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) on conflict(partner_id,id) do update set provider_name=excluded.provider_name,category=excluded.category,product_name=excluded.product_name,price_amount=excluded.price_amount,price_period=excluded.price_period,indicative_price=excluded.indicative_price,updated_at=excluded.updated_at,excess=excluded.excess,coverage_json=excluded.coverage_json,terms_url=excluded.terms_url,affiliate_url=excluded.affiliate_url,sponsored=excluded.sponsored,active=excluded.active')
			.bind(id,partner,partnerRow.display_name,category,name,price,'CZK',String(input.period||'month'),input.indicative===true?1:0,new Date().toISOString(),String(input.excess||'').slice(0,80)||null,JSON.stringify(coverage),httpsUrl(input.termsUrl)?input.termsUrl:null,input.affiliateUrl,input.sponsored===true?1:0,input.active===true?1:0).run();
		return json({ok:true});
	}
	if (input.action === 'placement') {
		const allowed=new Set(['top-banner','between-hero-content','calculator-middle','calculator-bottom','article-inline-1','article-inline-2','before-faq','footer','sticky-mobile']);const placement=String(input.placement||'');if(!allowed.has(placement)||!['adsense','gam','custom'].includes(String(input.provider||'')))return json({error:'Neznámá reklamní pozice nebo poskytovatel.'},422);
		await db.prepare('update ad_placements set enabled=?,provider=?,unit_id=?,variant=?,updated_at=? where placement=?').bind(input.enabled===true?1:0,String(input.provider||'adsense'),String(input.unitId||'').slice(0,120)||null,String(input.variant||'control').slice(0,40),new Date().toISOString(),placement).run();return json({ok:true});
	}
	return json({error:'Neznámá operace.'},400);
};
