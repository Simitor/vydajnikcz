import { money as validateMoney, choice } from './validation.ts';
import { adPlacements } from './settings.ts';
export type AdminFormKind = 'partner' | 'product' | 'placement' | 'revenue' | 'ad-report' | 'lead';

export interface AdminSubmission {
	endpoint: string;
	payload: Record<string, unknown>;
	successMessage: string;
	refreshMetrics: boolean;
}

const categories = new Set(['car-insurance', 'home-insurance', 'energy', 'mortgage', 'loan', 'bank-account', 'mobile', 'internet']);

const text = (data: FormData, key: string) => String(data.get(key) ?? '').trim();
const checked = (data: FormData, key: string) => data.has(key);

const requiredText = (data: FormData, key: string, label: string, max = 160) => {
	const value = text(data, key);
	if (!value) throw new Error(`Vyplňte pole ${label}.`);
	if (value.length > max) throw new Error(`Pole ${label} smí obsahovat nejvýše ${max} znaků.`);
	return value;
};

const amount = (data: FormData, key: string, label: string, max: number, optional = false) => validateMoney(numeric(data, key, label, optional), label, max, optional);

const numeric = (data: FormData, key: string, label: string, optional = false) => {
	const raw = text(data, key);
	if (!raw && optional) return null;
	const value = Number(raw);
	if (!raw || !Number.isFinite(value) || value < 0) throw new Error(`Pole ${label} musí obsahovat nezáporné číslo.`);
	return value;
};

const date = (data: FormData, key: string, label: string) => {
	const value = requiredText(data, key, label);
	const parsed = new Date(`${value}T00:00:00.000Z`);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
		throw new Error(`Pole ${label} musí obsahovat platné datum.`);
	}
	return value;
};

const httpsUrl = (data: FormData, key: string, label: string, optional = false) => {
	const value = text(data, key);
	if (!value && optional) return '';
	try {
		const url = new URL(value);
		if (value.length <= 2048 && url.protocol === 'https:' && !url.username && !url.password) return value;
	} catch { /* A malformed URL gets the same actionable message. */ }
	throw new Error(`Pole ${label} musí obsahovat odkaz začínající https://.`);
};

export const buildAdminSubmission = (kind: AdminFormKind, data: FormData): AdminSubmission => {
	if (kind === 'partner') {
		const cats = [...new Set(requiredText(data, 'categories', 'Kategorie').split(',').map(value => value.trim()).filter(Boolean))];
		if (!cats.length || cats.some(value => !categories.has(value))) throw new Error('Zadejte platné kategorie oddělené čárkou, například energy,internet.');
		const priority = numeric(data, 'priority', 'Priorita', true) ?? 0;
		if (!Number.isInteger(priority) || priority > 1000) throw new Error('Priorita musí být celé číslo od 0 do 1000.');
		return {
			endpoint: '/api/admin/config', refreshMetrics: false, successMessage: 'Partner uložen.',
			payload: {
				action: kind, id: requiredText(data, 'id', 'ID partnera', 40), name: requiredText(data, 'name', 'Název firmy', 100),
				categories: cats, registrationUrl: httpsUrl(data, 'registrationUrl', 'Registr / ověření URL', true), priority,
				secretRef: text(data, 'secretRef'), payoutModel: text(data, 'payoutModel'), active: checked(data, 'active'), licensed: checked(data, 'licensed'),
			},
		};
	}
	if (kind === 'product') {
		return {
			endpoint: '/api/admin/config', refreshMetrics: false, successMessage: 'Nabídka uložena.',
			payload: {
				action: kind, id: requiredText(data, 'id', 'ID produktu', 60), partnerId: requiredText(data, 'partnerId', 'Partner ID', 40),
				category: text(data, 'category'), name: requiredText(data, 'name', 'Název produktu', 120), price: amount(data, 'price', 'Cena', 99_999_999.99, true),
				period: text(data, 'period'), affiliateUrl: httpsUrl(data, 'affiliateUrl', 'Partnerská URL'), termsUrl: httpsUrl(data, 'termsUrl', 'Podmínky URL', true),
				excess: text(data, 'excess'), indicative: checked(data, 'indicative'), sponsored: checked(data, 'sponsored'), active: checked(data, 'active'),
			},
		};
	}
	if (kind === 'placement') {
		return {
			endpoint: '/api/admin/config', refreshMetrics: false, successMessage: 'Reklamní pozice uložena.',
			payload: { action: kind, placement: text(data, 'placement'), provider: text(data, 'provider'), unitId: text(data, 'unitId'), variant: text(data, 'variant'), enabled: checked(data, 'enabled') },
		};
	}
	if (kind === 'lead') {
		return {
			endpoint: '/api/admin/leads', refreshMetrics: true, successMessage: 'Stav poptávky uložen.',
			payload: { id: requiredText(data, 'id', 'Poptávka', 36), status: requiredText(data, 'status', 'Stav'), payout: amount(data, 'payout', 'Potvrzená odměna', 100_000_000, true) },
		};
	}
	if (kind === 'revenue') {
		return {
			endpoint: '/api/admin/revenue', refreshMetrics: true, successMessage: 'Příjem zaúčtován.',
			payload: {
				sourceType: choice(text(data, 'sourceType'), ['affiliate','lead','direct','sponsored','premium'], 'Zdroj příjmu'), amount: amount(data, 'amount', 'Částka', 1_000_000_000), occurredAt: date(data, 'occurredAt', 'Datum reportu'),
				reference: requiredText(data, 'reference', 'Reference reportu'), partnerId: text(data, 'partnerId'),
			},
		};
	}
	if (kind === 'ad-report') {
		const impressions = numeric(data, 'impressions', 'Zobrazení')!;
		const clicks = numeric(data, 'clicks', 'Kliknutí')!;
		if (!Number.isSafeInteger(impressions) || !Number.isSafeInteger(clicks) || clicks > impressions) throw new Error('Zobrazení a kliknutí musí být celá čísla. Kliknutí nesmí být více než zobrazení.');
		return {
			endpoint: '/api/admin/ad-report', refreshMetrics: true, successMessage: 'Reklamní výkaz importován.',
			payload: {
				date: date(data, 'date', 'Datum'), provider: choice(text(data, 'provider'), ['adsense','gam','custom'], 'Poskytovatel'), placement: choice(requiredText(data, 'placement', 'Reklamní pozice', 60), ['all', ...adPlacements], 'Reklamní pozice'), impressions, clicks,
				revenue: amount(data, 'revenue', 'Příjem', 100_000_000), reference: requiredText(data, 'reference', 'Reference výkazu'),
			},
		};
	}
	throw new Error('Neznámý formulář. Obnovte stránku.');
};
