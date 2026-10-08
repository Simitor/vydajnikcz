import { buildAdminSubmission } from './requests';
import type { AdminFormKind } from './requests';

interface Metrics {
	generatedAt: string;
	revenue: { month: number; last30: number; year: number; per1000Visitors: number };
	sourceRevenue: { source: string; amount: number }[];
	ads: { impressions: number; clicks: number; ctr: number };
	adVariants: { placement: string; variant: string; impressions: number }[];
	funnel: { name: string; count: number }[];
	leads: { status: string; count: number }[];
	affiliate: { partner_id: string; product_id: string; clicks: number }[];
}

class AdminRequestError extends Error {
	status: number;
	uncertain: boolean;
	constructor(message: string, status = 0, uncertain = false) {
		super(message);
		this.status = status;
		this.uncertain = uncertain;
	}
}

const requestAdmin = async (endpoint: string, token: string, init: RequestInit = {}) => {
	const headers = new Headers(init.headers);
	headers.set('authorization', `Bearer ${token}`);
	try {
		return await fetch(endpoint, { ...init, headers, cache: 'no-store', signal: AbortSignal.timeout(20000) });
	} catch {
		throw new AdminRequestError('Spojení se serverem se nezdařilo.', 0, init.method === 'POST');
	}
};

const readJson = async (response: Response, saving = false) => {
	let data;
	try { data = await response.json(); } catch { /* Even an HTML error page must result in a readable message. */ }
	if (response.status === 401 || response.status === 403) throw new AdminRequestError('Přístup byl odmítnut. Přihlaste se znovu.', response.status);
	if (!response.ok) throw new AdminRequestError(
		typeof data?.error === 'string' ? data.error : 'Server nemohl požadavek zpracovat. Zkuste to později.',
		response.status, saving && response.status >= 500,
	);
	if (!data || typeof data !== 'object') throw new AdminRequestError('Server nevrátil platné potvrzení.', response.status, saving);
	return data;
};

const message = (element: HTMLElement, value: string, state: 'busy' | 'success' | 'error' | 'warning') => {
	element.textContent = value;
	element.dataset.state = state;
};

const errorMessage = (error: unknown) => {
	if (error instanceof AdminRequestError && error.uncertain) return `${error.message} Výsledek uložení není potvrzen. Před dalším odesláním zkontrolujte uložený záznam.`;
	return error instanceof Error ? error.message : 'Požadavek se nezdařil.';
};

export const initAdmin = () => {
	const login = document.querySelector<HTMLFormElement>('.admin-login')!;
	const msg = document.querySelector<HTMLElement>('.admin-message')!;
	const dashboard = document.querySelector<HTMLElement>('.admin-dashboard')!;
	const tokenKey = 'vydajnik-admin-token';
	const pending = new Set<HTMLFormElement>();
	let sessionVersion = 0;
	let loginPending = false;

	const invalidateSession = (error: unknown) => {
		if (error instanceof AdminRequestError && [401, 403].includes(error.status)) {
			sessionVersion++;
			sessionStorage.removeItem(tokenKey);
			dashboard.hidden = true;
			message(msg, error.message, 'error');
		}
	};
	const currency = (value: number) => Number(value || 0).toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 2 });
	const setText = (selector: string, value: string) => { document.querySelector(selector)!.textContent = value; };
	const rows = (selector: string, entries: { label: string; value: string }[], empty: string, className = 'admin-list-row') => {
		const container = document.querySelector<HTMLElement>(selector)!;
		container.replaceChildren();
		if (!entries.length) { container.textContent = empty; return; }
		for (const entry of entries) {
			const row = document.createElement('div'); row.className = className;
			const label = document.createElement('span'); label.textContent = entry.label;
			const value = document.createElement('b'); value.textContent = entry.value;
			row.append(label, value); container.append(row);
		}
	};

	const render = async (token: string, version = sessionVersion) => {
		const data: Metrics = await readJson(await requestAdmin('/api/admin/metrics', token));
		if (version !== sessionVersion) return;
		if (!data.revenue || !data.ads || ![data.sourceRevenue, data.adVariants, data.funnel, data.leads, data.affiliate].every(Array.isArray)) {
			throw new Error('Přehled se nepodařilo načíst. Obnovte stránku.');
		}
		setText('[data-kpi=month]', currency(data.revenue.month));
		setText('[data-kpi=last30]', currency(data.revenue.last30));
		setText('[data-kpi=year]', currency(data.revenue.year));
		setText('[data-kpi=rpm]', currency(data.revenue.per1000Visitors));
		const revenue = document.querySelector<HTMLElement>('[data-revenue]')!;
		revenue.replaceChildren();
		if (!data.sourceRevenue.length) revenue.textContent = 'Zatím nejsou naimportované příjmy.';
		const maximum = Math.max(1, ...data.sourceRevenue.map(row => row.amount));
		for (const entry of data.sourceRevenue) {
			const row = document.createElement('div'); row.className = 'admin-bar-row';
			const label = document.createElement('span'); label.textContent = entry.source;
			const track = document.createElement('i'); const bar = document.createElement('b');
			bar.style.width = `${Math.min(100, Math.max(2, Math.round(entry.amount / maximum * 100)))}%`; track.append(bar);
			const amount = document.createElement('strong'); amount.textContent = currency(entry.amount);
			row.append(label, track, amount); revenue.append(row);
		}
		setText('[data-ad-impressions]', Number(data.ads.impressions).toLocaleString('cs-CZ'));
		setText('[data-ad-clicks]', Number(data.ads.clicks).toLocaleString('cs-CZ'));
		setText('[data-ad-ctr]', Number(data.ads.ctr).toLocaleString('cs-CZ', { maximumFractionDigits: 2 }) + ' %');
		setText('[data-ad-variants]', data.adVariants.length ? data.adVariants.map(row => `${row.placement} · ${row.variant}: ${row.impressions}`).join(' / ') : 'Bez A/B měření');
		rows('[data-funnel]', data.funnel.map(row => ({ label: row.name, value: row.count.toLocaleString('cs-CZ') })), 'Zatím nejsou zaznamenané události.', '');
		rows('[data-leads]', data.leads.map(row => ({ label: row.status, value: String(row.count) })), 'Bez leadů.');
		rows('[data-affiliate]', data.affiliate.map(row => ({ label: `${row.partner_id} / ${row.product_id}`, value: String(row.clicks) })), 'Bez prokliků.');
		sessionStorage.setItem(tokenKey, token);
		dashboard.hidden = false;
		message(msg, `Aktualizováno ${new Date(data.generatedAt).toLocaleString('cs-CZ')}`, 'success');
	};

	const bindForm = (form: HTMLFormElement, kind: AdminFormKind) => {
		const output = form.querySelector<HTMLElement>('.config-message')!;
		form.addEventListener('submit', async event => {
			event.preventDefault();
			if (pending.has(form) || !form.reportValidity()) return;
			const token = sessionStorage.getItem(tokenKey);
			if (!token) { message(msg, 'Nejprve se přihlaste tokenem správce.', 'error'); dashboard.hidden = true; return; }
			let submission;
			try { submission = buildAdminSubmission(kind, new FormData(form)); }
			catch (error) { message(output, errorMessage(error), 'error'); return; }
			const version = sessionVersion;
			const buttons = [...form.querySelectorAll<HTMLButtonElement>('button')].map(button => ({ button, disabled: button.disabled }));
			pending.add(form); form.setAttribute('aria-busy', 'true');
			buttons.forEach(({ button }) => { button.disabled = true; });
			message(output, 'Ukládám…', 'busy');
			try {
				const response = await requestAdmin(submission.endpoint, token, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(submission.payload) });
				const result = await readJson(response, true);
				if (result.ok !== true) throw new AdminRequestError('Server nepotvrdil uložení.', response.status, true);
				if (version !== sessionVersion) return;
				message(output, submission.successMessage, 'success');
				if (submission.refreshMetrics) {
					try { await render(token, version); }
					catch (error) {
						if (version !== sessionVersion) return;
						message(output, `${submission.successMessage} Přehled se nepodařilo obnovit. Záznam znovu neodesílejte; obnovte stránku.`, 'warning');
						invalidateSession(error);
						if (error instanceof AdminRequestError && [401, 403].includes(error.status)) {
							message(msg, `${submission.successMessage} ${error.message} Záznam znovu neodesílejte.`, 'warning');
						}
					}
				}
			} catch (error) {
				if (version === sessionVersion) { message(output, errorMessage(error), 'error'); invalidateSession(error); }
			} finally {
				pending.delete(form); form.removeAttribute('aria-busy');
				buttons.forEach(({ button, disabled }) => { button.disabled = disabled; });
			}
		});
	};
	document.querySelectorAll<HTMLFormElement>('[data-admin-config]').forEach(form => bindForm(form, form.dataset.action as AdminFormKind));
	bindForm(document.querySelector<HTMLFormElement>('[data-revenue-form]')!, 'revenue');
	bindForm(document.querySelector<HTMLFormElement>('[data-ad-report]')!, 'ad-report');

	const exportButton = document.querySelector<HTMLButtonElement>('[data-export-leads]')!;
	const exportMessage = document.querySelector<HTMLElement>('[data-export-message]')!;
	exportButton.addEventListener('click', async () => {
		if (exportButton.disabled) return;
		const token = sessionStorage.getItem(tokenKey);
		if (!token) { message(msg, 'Nejprve se přihlaste tokenem správce.', 'error'); dashboard.hidden = true; return; }
		const version = sessionVersion;
		exportButton.disabled = true; exportButton.setAttribute('aria-busy', 'true');
		message(exportMessage, 'Připravuji export…', 'busy');
		try {
			const response = await requestAdmin('/api/admin/leads', token);
			if (!response.ok) { await readJson(response); throw new Error('Export se nezdařil.'); }
			if (!response.headers.get('content-type')?.toLowerCase().startsWith('text/csv')) throw new Error('Server nevrátil CSV soubor. Export se nezdařil.');
			const blob = await response.blob();
			if (version !== sessionVersion) return;
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a'); link.href = url; link.download = 'vydajnik-leady.csv';
			document.body.append(link); link.click(); link.remove();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			message(exportMessage, 'CSV soubor byl předán ke stažení.', 'success');
		} catch (error) {
			if (version === sessionVersion) { message(exportMessage, errorMessage(error), 'error'); invalidateSession(error); }
		} finally { exportButton.disabled = false; exportButton.removeAttribute('aria-busy'); }
	});

	login.addEventListener('submit', async event => {
		event.preventDefault();
		if (loginPending || !login.reportValidity()) return;
		const token = String(new FormData(login).get('token') ?? '').trim();
		if (!token) { message(msg, 'Vyplňte token správce.', 'error'); return; }
		const version = ++sessionVersion;
		const button = login.querySelector<HTMLButtonElement>('button[type=submit], button:not([type])')!;
		loginPending = true; button.disabled = true; dashboard.hidden = true; sessionStorage.removeItem(tokenKey);
		message(msg, 'Načítám…', 'busy');
		try { await render(token, version); if (version === sessionVersion) login.reset(); }
		catch (error) { if (version === sessionVersion) { message(msg, errorMessage(error), 'error'); invalidateSession(error); } }
		finally { loginPending = false; button.disabled = false; }
	});
	document.querySelector('.admin-logout')?.addEventListener('click', () => {
		sessionVersion++; sessionStorage.removeItem(tokenKey); dashboard.hidden = true; login.reset();
		dashboard.querySelectorAll<HTMLElement>('.config-message').forEach(element => { element.textContent = ''; delete element.dataset.state; });
		message(msg, 'Odhlášeno.', 'success');
	});
	const cached = sessionStorage.getItem(tokenKey);
	if (cached) {
		const version = sessionVersion;
		message(msg, 'Načítám…', 'busy');
		void render(cached, version).catch(error => {
			if (version === sessionVersion) { message(msg, errorMessage(error), 'error'); invalidateSession(error); }
		});
	}
};
