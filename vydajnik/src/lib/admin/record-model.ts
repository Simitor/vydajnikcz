export const categoryLabels: Record<string, string> = {
	'car-insurance': 'Pojištění auta', 'home-insurance': 'Pojištění bydlení', energy: 'Energie', mortgage: 'Hypotéky',
	loan: 'Půjčky', 'bank-account': 'Bankovní účty', mobile: 'Mobilní tarify', internet: 'Internet',
};
export const leadStatusLabels: Record<string, string> = {
	new: 'Nová', sent: 'Předaná', contacted: 'Kontaktovaná', qualified: 'Kvalifikovaná', converted: 'Uzavřený obchod', rejected: 'Zamítnutá', paid: 'Zaplacená',
};
export type RecordKind = 'partners' | 'products' | 'leads';
export interface PartnerRecord {
	id: string; name: string; active: boolean; licensed: boolean; registrationUrl: string | null;
	categories: string[]; regions: string[]; priority: number; secretRef: string | null; payoutModel: string | null; createdAt: string;
}
export interface ProductRecord {
	id: string; partnerId: string; partnerName: string; partnerActive: boolean; name: string; category: string;
	price: number | null; period: string | null; indicative: boolean; sponsored: boolean; active: boolean;
	affiliateUrl: string; termsUrl: string | null; excess: string | null; coverage: string[]; updatedAt: string | null;
}
export interface LeadRecord {
	id: string; name: string; email: string; phone: string; company: string; interest: string; createdAt: string;
	status: string; partnerId: string | null; partnerName: string | null; calculator: string; leadType: string; payout: number | null;
	consent: boolean; consentTimestamp: string; source: string | null; utmSource: string | null; utmMedium: string | null;
	utmCampaign: string | null; convertedAt: string | null; partnerSentAt: string | null; details: Record<string, unknown>;
}
export type AdminRecord = PartnerRecord | ProductRecord | LeadRecord;
export interface RecordPage<T = AdminRecord> { items: T[]; total: number; page: number; limit: number; }

const object = (value: unknown): Record<string, unknown> => {
	try { const parsed = JSON.parse(String(value || '{}')); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; }
	catch { return { 'Uložené údaje': String(value ?? '') }; }
};
const strings = (value: unknown): string[] => {
	try { const parsed = JSON.parse(String(value || '[]')); return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : []; }
	catch { return []; }
};
const nullable = (value: unknown) => value == null ? null : String(value);
export const partnerRecord = (row: Record<string, unknown>): PartnerRecord => ({
	id: String(row.id), name: String(row.display_name), active: Boolean(row.active), licensed: Boolean(row.licensed_distributor),
	registrationUrl: nullable(row.registration_url), categories: strings(row.categories_json), regions: strings(row.regions_json),
	priority: Number(row.priority), secretRef: nullable(row.lead_endpoint_secret_ref), payoutModel: nullable(row.payout_model), createdAt: String(row.created_at),
});
export const productRecord = (row: Record<string, unknown>): ProductRecord => ({
	id: String(row.id), partnerId: String(row.partner_id), partnerName: String(row.partner_name ?? row.provider_name), partnerActive: Boolean(row.partner_active),
	name: String(row.product_name), category: String(row.category), price: row.price_amount == null ? null : Number(row.price_amount), period: nullable(row.price_period),
	indicative: Boolean(row.indicative_price), sponsored: Boolean(row.sponsored), active: Boolean(row.active), affiliateUrl: String(row.affiliate_url),
	termsUrl: nullable(row.terms_url), excess: nullable(row.excess), coverage: strings(row.coverage_json), updatedAt: nullable(row.updated_at),
});
export const leadRecord = (row: Record<string, unknown>): LeadRecord => {
	const details = object(row.calculator_result_json);
	return {
		id: String(row.id), name: String(row.name), email: String(row.email), phone: String(row.phone),
		company: typeof details.company === 'string' ? details.company : '', interest: typeof details.interest === 'string' ? details.interest : '',
		createdAt: String(row.created_at), status: String(row.status), partnerId: nullable(row.partner_id), partnerName: nullable(row.partner_name),
		calculator: String(row.calculator), leadType: String(row.lead_type), payout: row.payout_amount == null ? null : Number(row.payout_amount),
		consent: Boolean(row.consent), consentTimestamp: String(row.consent_timestamp), source: nullable(row.source),
		utmSource: nullable(row.utm_source), utmMedium: nullable(row.utm_medium), utmCampaign: nullable(row.utm_campaign),
		convertedAt: nullable(row.converted_at), partnerSentAt: nullable(row.partner_sent_at), details,
	};
};
