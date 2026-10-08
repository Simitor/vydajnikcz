import { categoryLabels } from '../../../src/lib/admin/record-model.ts';

interface Statement { bind(...values: unknown[]): Statement; run(): Promise<{ meta: { changes: number } }>; first<T>(): Promise<T | null>; }
interface Env { DB?: { prepare(sql: string): Statement }; ADMIN_TOKEN?: string; }
const categories = new Set(Object.keys(categoryLabels));
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const httpsUrl = (value: unknown) => { if (typeof value !== 'string') return false; try { return new URL(value).protocol === 'https:'; } catch { return false; } };
interface PartnerRow { id: string; display_name: string; active: number; licensed_distributor: number; registration_url: string | null; categories_json: string; regions_json: string; }
interface ProductRow { id: string; partner_id: string; category: string; coverage_json: string; }
const licensed = (partner: PartnerRow) => Boolean(partner.licensed_distributor && httpsUrl(partner.registration_url));

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
    if (!env.ADMIN_TOKEN || !env.DB) return json({ error: 'Admin není nakonfigurován.' }, 503);
    if (request.headers.get('authorization') !== `Bearer ${env.ADMIN_TOKEN}`) return json({ error: 'Neautorizováno.' }, 401);
    let input: Record<string, unknown>;
    try { input = await request.json(); } catch { return json({ error: 'Neplatný JSON.' }, 400); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: 'Neplatné údaje formuláře.' }, 422);
    const db = env.DB;
    const action = String(input.action || ''); const id = String(input.id || '');
    const operation = input.operation ?? 'upsert';
    if (!['create', 'update', 'upsert'].includes(String(operation))) return json({ error: 'Neznámý způsob ukládání.' }, 422);

    if (action === 'partner-active' || action === 'product-active') {
        if (typeof input.active !== 'boolean') return json({ error: 'Zvolte aktivní nebo vypnutý stav.' }, 422);
        if (action === 'partner-active') {
            const partner = await db.prepare('select * from monetization_partners where id=?').bind(id).first<PartnerRow>();
            if (!partner) return json({ error: 'Partner nebyl nalezen. Obnovte seznam.' }, 404);
            if (input.active) {
                const insurance = await db.prepare("select id from monetization_products where partner_id=? and category='car-insurance' and active=1 limit 1").bind(id).first();
                if ((partner.categories_json.includes('car-insurance') || insurance) && !licensed(partner)) return json({ error: 'Před aktivací pojišťovacích nabídek ověřte licenci partnera a odkaz na jeho evidenci.' }, 422);
            }
            const result = await db.prepare('update monetization_partners set active=? where id=?').bind(input.active ? 1 : 0, id).run();
            return result.meta.changes ? json({ ok: true }) : json({ error: 'Partner nebyl nalezen.' }, 404);
        }
        const partnerId = String(input.partnerId || '');
        const product = await db.prepare('select * from monetization_products where partner_id=? and id=?').bind(partnerId, id).first<ProductRow>();
        if (!product) return json({ error: 'Nabídka nebyla nalezena. Obnovte seznam.' }, 404);
        if (input.active) {
            const partner = await db.prepare('select * from monetization_partners where id=?').bind(partnerId).first<PartnerRow>();
            if (!partner) return json({ error: 'Partner nabídky nebyl nalezen.' }, 422);
            if (product.category === 'car-insurance' && !licensed(partner)) return json({ error: 'Pojištění lze zapnout pouze u ověřeného distributora s odkazem na evidenci.' }, 422);
        }
        const result = await db.prepare('update monetization_products set active=?,updated_at=? where partner_id=? and id=?').bind(input.active ? 1 : 0, new Date().toISOString(), partnerId, id).run();
        return result.meta.changes ? json({ ok: true }) : json({ error: 'Nabídka nebyla nalezena.' }, 404);
    }

    if (action === 'partner') {
        const name = String(input.name || '').trim();
        const cats = Array.isArray(input.categories) ? input.categories : [];
        if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(id) || name.length < 2 || name.length > 100 || !cats.length || cats.some(value => typeof value !== 'string' || !categories.has(value))) return json({ error: 'Doplňte platné ID, název a alespoň jednu platnou kategorii.' }, 422);
        const existing = await db.prepare('select * from monetization_partners where id=?').bind(id).first<PartnerRow>();
        if (operation === 'create' && existing) return json({ error: 'Partner s tímto ID již existuje. Otevřete jej ze seznamu pomocí Upravit.' }, 409);
        if (operation === 'update' && !existing) return json({ error: 'Upravovaný partner již neexistuje. Obnovte seznam.' }, 404);
        const activeInsurance = await db.prepare("select id from monetization_products where partner_id=? and category='car-insurance' and active=1 limit 1").bind(id).first();
        if (input.active === true && (cats.includes('car-insurance') || activeInsurance) && (input.licensed !== true || !httpsUrl(input.registrationUrl))) return json({ error: 'Před aktivací pojišťovací nabídky ověřte licenci partnera a uložte odkaz na jeho evidenci.' }, 422);
        const priority = Number(input.priority ?? 0);
        if (!Number.isFinite(priority) || priority < 0 || priority > 1000) return json({ error: 'Priorita musí být od 0 do 1000.' }, 422);
        const secretRef = typeof input.secretRef === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(input.secretRef) ? input.secretRef : null;
        const regions = Array.isArray(input.regions) ? JSON.stringify(input.regions.filter(value => typeof value === 'string').slice(0, 30)) : existing?.regions_json ?? '[]';
        const values = [name, input.active === true ? 1 : 0, input.licensed === true ? 1 : 0, httpsUrl(input.registrationUrl) ? input.registrationUrl : null, JSON.stringify(cats), regions, priority, secretRef, String(input.payoutModel || '').slice(0, 80)];
        if (operation === 'update') {
            const result = await db.prepare('update monetization_partners set display_name=?,active=?,licensed_distributor=?,registration_url=?,categories_json=?,regions_json=?,priority=?,lead_endpoint_secret_ref=?,payout_model=? where id=?').bind(...values, id).run();
            return result.meta.changes ? json({ ok: true }) : json({ error: 'Upravovaný partner již neexistuje.' }, 404);
        }
        const conflict = operation === 'create' ? '' : ' on conflict(id) do update set display_name=excluded.display_name,active=excluded.active,licensed_distributor=excluded.licensed_distributor,registration_url=excluded.registration_url,categories_json=excluded.categories_json,regions_json=excluded.regions_json,priority=excluded.priority,lead_endpoint_secret_ref=excluded.lead_endpoint_secret_ref,payout_model=excluded.payout_model';
        await db.prepare('insert into monetization_partners (id,display_name,active,licensed_distributor,registration_url,categories_json,regions_json,priority,lead_endpoint_secret_ref,payout_model) values (?,?,?,?,?,?,?,?,?,?)' + conflict).bind(id, ...values).run();
        return json({ ok: true });
    }
    if (action === 'product') {
        const partnerId = String(input.partnerId || ''); const category = String(input.category || ''); const name = String(input.name || '').trim();
        const price = input.price === null || input.price === '' ? null : typeof input.price === 'number' ? input.price : NaN;
        const period = input.period == null || input.period === '' ? null : String(input.period);
        if (!/^[a-z0-9][a-z0-9-]{1,59}$/.test(id) || !categories.has(category) || name.length < 2 || name.length > 120 || !(price === null || (Number.isFinite(price) && price >= 0 && price < 100000000)) || !httpsUrl(input.affiliateUrl) || (period !== null && !['month', 'year', 'one-off'].includes(period))) return json({ error: 'Zkontrolujte ID, kategorii, název, cenu, období a zabezpečený partnerský odkaz.' }, 422);
        const existing = await db.prepare('select * from monetization_products where partner_id=? and id=?').bind(partnerId, id).first<ProductRow>();
        if (operation === 'create' && existing) return json({ error: 'Nabídka s tímto ID již u partnera existuje. Otevřete ji ze seznamu pomocí Upravit.' }, 409);
        if (operation === 'update' && !existing) return json({ error: 'Upravovaná nabídka již neexistuje. Obnovte seznam.' }, 404);
        const partner = await db.prepare('select * from monetization_partners where id=?').bind(partnerId).first<PartnerRow>();
        if (!partner) return json({ error: 'Nejprve uložte partnera nebo vyberte existujícího partnera ze seznamu.' }, 422);
        if (category === 'car-insurance' && input.active === true && !licensed(partner)) return json({ error: 'Pojištění lze zapnout pouze u ověřeného distributora s odkazem na evidenci oprávnění.' }, 422);
        const coverage = Array.isArray(input.coverage) ? JSON.stringify(input.coverage.filter(value => typeof value === 'string').slice(0, 20)) : existing?.coverage_json ?? '[]';
        const values = [partner.display_name, category, name, price, period, input.indicative === true ? 1 : 0, new Date().toISOString(), String(input.excess || '').slice(0, 80) || null, coverage, httpsUrl(input.termsUrl) ? input.termsUrl : null, input.affiliateUrl, input.sponsored === true ? 1 : 0, input.active === true ? 1 : 0];
        if (operation === 'update') {
            const result = await db.prepare('update monetization_products set provider_name=?,category=?,product_name=?,price_amount=?,price_period=?,indicative_price=?,updated_at=?,excess=?,coverage_json=?,terms_url=?,affiliate_url=?,sponsored=?,active=? where partner_id=? and id=?').bind(...values, partnerId, id).run();
            return result.meta.changes ? json({ ok: true }) : json({ error: 'Upravovaná nabídka již neexistuje.' }, 404);
        }
        const conflict = operation === 'create' ? '' : ' on conflict(partner_id,id) do update set provider_name=excluded.provider_name,category=excluded.category,product_name=excluded.product_name,price_amount=excluded.price_amount,price_period=excluded.price_period,indicative_price=excluded.indicative_price,updated_at=excluded.updated_at,excess=excluded.excess,coverage_json=excluded.coverage_json,terms_url=excluded.terms_url,affiliate_url=excluded.affiliate_url,sponsored=excluded.sponsored,active=excluded.active';
        await db.prepare("insert into monetization_products (partner_id,id,price_currency,provider_name,category,product_name,price_amount,price_period,indicative_price,updated_at,excess,coverage_json,terms_url,affiliate_url,sponsored,active) values (?,?,'CZK',?,?,?,?,?,?,?,?,?,?,?,?,?)" + conflict).bind(partnerId, id, ...values).run();
        return json({ ok: true });
    }
    if (action === 'placement') {
        const allowed = new Set(['top-banner', 'between-hero-content', 'calculator-middle', 'calculator-bottom', 'article-inline-1', 'article-inline-2', 'before-faq', 'footer', 'sticky-mobile']); const placement = String(input.placement || '');
        if (!allowed.has(placement) || !['adsense', 'gam', 'custom'].includes(String(input.provider || ''))) return json({ error: 'Neznámá reklamní pozice nebo poskytovatel.' }, 422);
        const result = await db.prepare('update ad_placements set enabled=?,provider=?,unit_id=?,variant=?,updated_at=? where placement=?').bind(input.enabled === true ? 1 : 0, String(input.provider || 'adsense'), String(input.unitId || '').slice(0, 120) || null, String(input.variant || 'control').slice(0, 40), new Date().toISOString(), placement).run();
        return result.meta.changes ? json({ ok: true }) : json({ error: 'Reklamní pozice nebyla nalezena.' }, 404);
    }
    return json({ error: 'Neznámá operace.' }, 400);
};
