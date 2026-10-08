export type AdminFormKind = 'partner' | 'product' | 'placement' | 'revenue' | 'ad-report';

export interface AdminSubmission {
	endpoint: string;
	payload: Record<string, unknown>;
	successMessage: string;
	refreshMetrics: boolean;
}

const categories = new Set(['car-insurance', 'home-insurance', 'energy', 'mortgage', 'loan', 'bank-account', 'mobile', 'internet']);

const text = (data: FormData, key: string) => String(data.get(key) ?? '').trim();
const checked = (data: FormData, key: string) => data.has(key);

const requiredText = (data: FormData, key: string, label: string) => {
	const value = text(data, key);
	if (!value) throw new Error(`Vyplňte pole ${label}.`);
	return value;
};

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
		if (new URL(value).protocol === 'https:') return value;
	} catch { /* A malformed URL gets the same actionable message. */ }
	throw new Error(`Pole ${label} musí obsahovat odkaz začínající https://.`);
};

export const buildAdminSubmission = (kind: AdminFormKind, data: FormData): AdminSubmission => {
	if (kind === 'partner') {
		const cats = [...new Set(requiredText(data, 'categories', 'Kategorie').split(',').map(value => value.trim()).filter(Boolean))];
		if (!cats.length || cats.some(value => !categories.has(value))) throw new Error('Zadejte platné kategorie oddělené čárkou, například energy,internet.');
		const priority = numeric(data, 'priority', 'Priorita', true) ?? 0;
		if (priority > 1000) throw new Error('Priorita musí být od 0 do 1000.');
		return {
			endpoint: '/api/admin/config', refreshMetrics: false, successMessage: 'Partner uložen.',
			payload: {
				action: kind, id: requiredText(data, 'id', 'ID partnera'), name: requiredText(data, 'name', 'Název firmy'),
				categories: cats, registrationUrl: httpsUrl(data, 'registrationUrl', 'Registr / ověření URL', true), priority,
				secretRef: text(data, 'secretRef'), payoutModel: text(data, 'payoutModel'), active: checked(data, 'active'), licensed: checked(data, 'licensed'),
			},
		};
	}
	if (kind === 'product') {
		return {
			endpoint: '/api/admin/config', refreshMetrics: false, successMessage: 'Nabídka uložena.',
			payload: {
				action: kind, id: requiredText(data, 'id', 'ID produktu'), partnerId: requiredText(data, 'partnerId', 'Partner ID'),
				category: text(data, 'category'), name: requiredText(data, 'name', 'Název produktu'), price: numeric(data, 'price', 'Cena', true),
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
	if (kind === 'revenue') {
		return {
			endpoint: '/api/admin/revenue', refreshMetrics: true, successMessage: 'Příjem zaúčtován.',
			payload: {
				sourceType: text(data, 'sourceType'), amount: numeric(data, 'amount', 'Částka'), occurredAt: date(data, 'occurredAt', 'Datum reportu'),
				reference: requiredText(data, 'reference', 'Reference reportu'), partnerId: text(data, 'partnerId'),
			},
		};
	}
	if (kind === 'ad-report') {
		const impressions = numeric(data, 'impressions', 'Zobrazení')!;
		const clicks = numeric(data, 'clicks', 'Kliknutí')!;
		if (!Number.isInteger(impressions) || !Number.isInteger(clicks) || clicks > impressions) throw new Error('Zobrazení a kliknutí musí být celá čísla. Kliknutí nesmí být více než zobrazení.');
		return {
			endpoint: '/api/admin/ad-report', refreshMetrics: true, successMessage: 'Reklamní výkaz importován.',
			payload: {
				date: date(data, 'date', 'Datum'), provider: text(data, 'provider'), placement: requiredText(data, 'placement', 'Reklamní pozice'), impressions, clicks,
				revenue: numeric(data, 'revenue', 'Příjem'), reference: requiredText(data, 'reference', 'Reference výkazu'),
			},
		};
	}
	throw new Error('Neznámý formulář. Obnovte stránku.');
};
