import { categoryLabels, leadStatusLabels } from './record-model';
import type { AdminRecord, PartnerRecord, ProductRecord, LeadRecord, RecordKind, RecordPage } from './record-model';
import type { AdminFormKind } from './requests';

interface Session { token: string; version: number; }
interface Context {
	getSession(): Session | null;
	request(endpoint: string, token: string, init?: RequestInit): Promise<any>;
	formatError(error: unknown): string;
	onAuthError(error: unknown): void;
	globalMessage(text: string, state: 'warning' | 'error'): void;
}
const kinds: RecordKind[] = ['partners', 'products', 'leads'];
const money = (value: number | null) => value === null ? 'Cena neuvedena' : value.toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK' });
const date = (value: string | null) => {
	if (!value) return 'Neuvedeno';
	const parsed = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? value.replace(' ', 'T') + 'Z' : value);
	return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('cs-CZ') : value;
};
const notice = (element: HTMLElement, text: string, state: 'busy' | 'success' | 'warning' | 'error') => { element.textContent = text; element.dataset.state = state; };
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
	const element = document.createElement(tag); element.className = className; element.textContent = text; return element;
};
const setFields = (form: HTMLFormElement, values: Record<string, unknown>) => {
	for (const [name, value] of Object.entries(values)) {
		const field = form.elements.namedItem(name);
		if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) {
			if (field instanceof HTMLInputElement && field.type === 'checkbox') field.checked = value === true;
			else field.value = value == null ? '' : String(value);
		}
	}
};

export const initRecords = (context: Context) => {
	const states = Object.fromEntries(kinds.map(kind => [kind, { page: 1, revision: 0 }])) as Record<RecordKind, { page: number; revision: number }>;
	const editing = new Map<'partner' | 'product', { id: string; partnerId?: string }>();
	const editRevision = { partners: 0, products: 0, leads: 0 };
	const toggling = new Set<string>();
	const timers = new Map<RecordKind, ReturnType<typeof setTimeout>>();
	const formFor = (kind: 'partners' | 'products') => document.querySelector<HTMLFormElement>(`[data-action=${kind === 'partners' ? 'partner' : 'product'}]`)!;
	const leadForm = document.querySelector<HTMLFormElement>('[data-lead-form]')!;
	const leadDetail = document.querySelector<HTMLElement>('[data-lead-detail]')!;
	let currentLead: LeadRecord | null = null;
	let optionsRevision = 0;
	const current = (session: Session) => { const now = context.getSession(); return now?.version === session.version && now.token === session.token; };
	const outputFor = (kind: RecordKind) => document.querySelector<HTMLElement>(`[data-record-message=${kind}]`)!;
	const busy = (form: HTMLFormElement) => form.getAttribute('aria-busy') === 'true';
	const resetEditor = (kind: 'partners' | 'products', scroll = false, force = false) => {
		const form = formFor(kind);
		if (busy(form) && !force) return;
		editRevision[kind]++;
		editing.delete(kind === 'partners' ? 'partner' : 'product');
		form.reset();
		for (const name of ['id', 'partnerId']) { const field = form.elements.namedItem(name); if (field instanceof HTMLInputElement) field.readOnly = false; }
		form.querySelector('[data-editor-heading]')!.textContent = kind === 'partners' ? 'Nový partner' : 'Nová nabídka';
		form.querySelector('.config-message')!.textContent = '';
		if (scroll) { form.scrollIntoView({ block: 'center', behavior: 'smooth' }); form.querySelector<HTMLInputElement>('[name=id]')!.focus({ preventScroll: true }); }
	};
	const showEditor = (kind: 'partners' | 'products', record: PartnerRecord | ProductRecord, scroll = true) => {
		const form = formFor(kind);
		if (kind === 'partners') {
			const partner = record as PartnerRecord;
			setFields(form, { ...partner, categories: partner.categories.join(',') });
			editing.set('partner', { id: partner.id });
		} else {
			const product = record as ProductRecord;
			setFields(form, { ...product });
			editing.set('product', { id: product.id, partnerId: product.partnerId });
		}
		for (const name of ['id', 'partnerId']) { const field = form.elements.namedItem(name); if (field instanceof HTMLInputElement) field.readOnly = true; }
		form.querySelector('[data-editor-heading]')!.textContent = `Upravujete ${kind === 'partners' ? 'partnera' : 'nabídku'}: ${record.id}`;
		form.querySelector('.config-message')!.textContent = '';
		if (scroll) { form.scrollIntoView({ block: 'center', behavior: 'smooth' }); form.querySelector<HTMLInputElement>('[name=name]')!.focus({ preventScroll: true }); }
	};
	const appendFields = (list: HTMLElement, entries: [string, unknown][]) => {
		for (const [label, value] of entries) {
			list.append(node('dt', '', label), node('dd', '', value == null || value === '' ? 'Neuvedeno' : String(value)));
		}
	};
	const showLead = (record: LeadRecord, scroll = true) => {
		currentLead = record;
		document.querySelector('[data-lead-title]')!.textContent = `Poptávka: ${record.name}`;
		const fields = document.querySelector<HTMLElement>('[data-lead-fields]')!; fields.replaceChildren();
		appendFields(fields, [
			['Jméno', record.name], ['Firma', record.company], ['Předmět zájmu', record.interest], ['E-mail', record.email], ['Telefon', record.phone],
			['Přijato', date(record.createdAt)], ['Stav', leadStatusLabels[record.status] || record.status], ['Partner', record.partnerName || record.partnerId],
			['Stránka / kalkulačka', record.calculator], ['Typ poptávky', record.leadType], ['Zdroj', record.source],
			['Souhlas', record.consent ? `Ano · ${date(record.consentTimestamp)}` : 'Ne'], ['Předáno partnerovi', date(record.partnerSentAt)],
			['Uzavřený obchod', date(record.convertedAt)], ['Potvrzená odměna', record.payout === null ? null : money(record.payout)],
			['UTM zdroj', record.utmSource], ['UTM médium', record.utmMedium], ['UTM kampaň', record.utmCampaign], ['ID poptávky', record.id],
		]);
		const extra = document.querySelector<HTMLElement>('[data-lead-extra]')!; extra.replaceChildren();
		const remaining = Object.entries(record.details).filter(([key]) => !['company', 'interest'].includes(key));
		if (remaining.length) {
			const details = node('details'); details.append(node('summary', '', 'Další uložené údaje'));
			const list = node('dl', 'lead-fields'); appendFields(list, remaining.map(([key, value]) => [key, typeof value === 'object' ? JSON.stringify(value, null, 2) : value]));
			details.append(list); extra.append(details);
		}
		setFields(leadForm, { id: record.id, status: record.status, payout: record.payout });
		leadDetail.hidden = false;
		if (scroll) { leadForm.querySelector('.config-message')!.textContent = ''; leadDetail.scrollIntoView({ block: 'center', behavior: 'smooth' }); leadForm.querySelector<HTMLSelectElement>('[name=status]')!.focus({ preventScroll: true }); }
	};
	const detail = async (kind: RecordKind, record: AdminRecord, button?: HTMLButtonElement) => {
		const form = kind === 'leads' ? leadForm : formFor(kind);
		if (busy(form)) { notice(outputFor(kind), 'Vyčkejte na dokončení ukládání aktuálního záznamu.', 'warning'); return; }
		const key = `${kind}/${kind === 'products' ? (record as ProductRecord).partnerId : ''}/${record.id}`;
		if (toggling.has(key)) { notice(outputFor(kind), 'Vyčkejte na dokončení změny aktivního stavu tohoto záznamu.', 'warning'); return; }
		const session = context.getSession(); if (!session) return;
		const revision = ++editRevision[kind];
		if (button) button.disabled = true;
		notice(outputFor(kind), 'Otevírám záznam…', 'busy');
		try {
			const params = new URLSearchParams({ type: kind, id: record.id });
			if (kind === 'products') params.set('partnerId', (record as ProductRecord).partnerId);
			const data = await context.request(`/api/admin/records?${params}`, session.token);
			if (!current(session) || revision !== editRevision[kind]) return;
			if (!data.item) throw new Error('Záznam se nepodařilo otevřít. Obnovte seznam.');
			if (kind === 'leads') showLead(data.item); else showEditor(kind, data.item);
			notice(outputFor(kind), 'Záznam otevřen.', 'success');
		} catch (error) { if (current(session) && revision === editRevision[kind]) { notice(outputFor(kind), context.formatError(error), 'error'); context.onAuthError(error); } }
		finally { if (button) button.disabled = false; }
	};
	const toggle = async (kind: 'partners' | 'products', record: PartnerRecord | ProductRecord, button: HTMLButtonElement) => {
		const key = `${kind}/${kind === 'products' ? (record as ProductRecord).partnerId : ''}/${record.id}`;
		if (toggling.has(key) || busy(formFor(kind))) return;
		const session = context.getSession(); if (!session) return;
		const active = !record.active;
		editRevision[kind]++;
		const savedText = kind === 'partners' ? active ? 'Partner aktivován.' : 'Partner vypnut.' : active ? 'Nabídka aktivována.' : 'Nabídka vypnuta.';
		let saved = false;
		toggling.add(key); button.disabled = true;
		notice(outputFor(kind), 'Ukládám stav…', 'busy');
		try {
			const payload = { action: kind === 'partners' ? 'partner-active' : 'product-active', id: record.id, ...(kind === 'products' ? { partnerId: (record as ProductRecord).partnerId } : {}), active };
			const data = await context.request('/api/admin/config', session.token, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
			if (data.ok !== true) throw new Error('Server nepotvrdil změnu stavu. Před opakováním obnovte seznam.');
			saved = true; if (!current(session)) return;
			const identity = editing.get(kind === 'partners' ? 'partner' : 'product');
			if (identity?.id === record.id && (kind === 'partners' || identity.partnerId === (record as ProductRecord).partnerId)) setFields(formFor(kind), { active });
			await load(kind, states[kind].page, true);
			if (kind === 'partners') await Promise.all([refreshOptions(true), load('products', states.products.page, true)]);
			if (current(session)) notice(outputFor(kind), savedText, 'success');
		} catch (error) {
			if (current(session)) {
				notice(outputFor(kind), saved ? `${savedText} Seznam se nepodařilo obnovit. Změnu znovu neodesílejte.` : context.formatError(error), saved ? 'warning' : 'error');
				context.onAuthError(error);
				if (saved && !current(session)) context.globalMessage(`${savedText} Přihlaste se znovu a obnovte seznam.`, 'warning');
			}
		} finally { toggling.delete(key); button.disabled = false; }
	};
	const renderRows = (kind: RecordKind, items: AdminRecord[]) => {
		const container = document.querySelector<HTMLElement>(`[data-record-results=${kind}]`)!; container.replaceChildren();
		if (!items.length) { container.append(node('p', 'record-empty', 'Žádné záznamy neodpovídají vybraným filtrům.')); return; }
		for (const record of items) {
			const row = node('article', 'record-row'); row.dataset.recordId = record.id;
			const copy = node('div', 'record-copy'); copy.append(node('strong', 'record-title', record.name));
			const actions = node('div', 'record-actions');
			const open = node('button', 'record-button', kind === 'leads' ? 'Otevřít detail' : 'Upravit'); open.type = 'button'; open.dataset.openRecord = '';
			open.setAttribute('aria-label', `${open.textContent}: ${record.name}`); open.addEventListener('click', () => void detail(kind, record, open)); actions.append(open);
			if (kind === 'leads') {
				const lead = record as LeadRecord;
				copy.append(node('p', 'record-secondary', [lead.company, lead.email, lead.phone, date(lead.createdAt)].filter(Boolean).join(' · ')), node('span', 'record-badge', leadStatusLabels[lead.status] || lead.status));
			} else {
				const item = record as PartnerRecord | ProductRecord;
				const badge = node('span', 'record-badge', item.active ? 'Aktivní' : 'Vypnutý'); badge.dataset.active = String(item.active);
				if (kind === 'partners') copy.append(node('p', 'record-secondary', `${item.id} · ${(item as PartnerRecord).categories.map(value => categoryLabels[value] || value).join(', ')}`));
				else {
					const product = item as ProductRecord; row.dataset.recordPartnerId = product.partnerId;
					const period = product.period === 'month' ? ' / měsíc' : product.period === 'year' ? ' / rok' : product.period === 'one-off' ? ' jednorázově' : '';
					copy.append(node('p', 'record-secondary', `${product.partnerName} · ${categoryLabels[product.category] || product.category} · ${money(product.price)}${product.price === null ? '' : period}`));
					copy.append(node('p', 'record-secondary', `ID nabídky: ${product.id} · Partner: ${product.partnerId}`));
					if (product.active && !product.partnerActive) copy.append(node('span', 'record-badge', 'Na webu skrytá: partner je vypnutý'));
				}
				copy.append(badge);
				const activation = node('button', 'record-button', item.active ? 'Vypnout' : 'Aktivovat'); activation.type = 'button'; activation.dataset.toggleRecord = '';
				activation.setAttribute('aria-label', `${activation.textContent}: ${item.name}`); activation.addEventListener('click', () => void toggle(kind, item, activation)); actions.append(activation);
			}
			row.append(copy, actions); container.append(row);
		}
	};
	const load = async (kind: RecordKind, page = states[kind].page, propagate = false): Promise<boolean> => {
		const session = context.getSession(); if (!session) return false;
		const state = states[kind]; const revision = ++state.revision; state.page = page;
		const filters = document.querySelector<HTMLFormElement>(`[data-record-filters=${kind}]`)!;
		const params = new URLSearchParams({ type: kind, page: String(page), limit: '25' });
		new FormData(filters).forEach((value, key) => { if (String(value)) params.set(key, String(value)); });
		const output = outputFor(kind); notice(output, 'Načítám záznamy…', 'busy');
		const previous = document.querySelector<HTMLButtonElement>(`[data-record-prev=${kind}]`)!;
		const next = document.querySelector<HTMLButtonElement>(`[data-record-next=${kind}]`)!;
		previous.disabled = true; next.disabled = true;
		try {
			const data: RecordPage = await context.request(`/api/admin/records?${params}`, session.token);
			if (!current(session) || revision !== state.revision) return false;
			if (!Array.isArray(data.items) || !Number.isInteger(data.total)) throw new Error('Seznam se nepodařilo načíst. Obnovte stránku.');
			const lastPage = Math.max(1, Math.ceil(data.total / data.limit));
			if (data.page > lastPage) return await load(kind, lastPage, propagate);
			renderRows(kind, data.items);
			document.querySelector(`[data-record-summary=${kind}]`)!.textContent = `${data.total} záznamů · Strana ${data.page} z ${lastPage}`;
			previous.disabled = data.page <= 1; next.disabled = data.page >= lastPage;
			output.textContent = ''; delete output.dataset.state;
			return true;
		} catch (error) {
			if (current(session) && revision === state.revision) { notice(output, context.formatError(error), 'error'); if (!propagate) context.onAuthError(error); }
			if (propagate) throw error;
			return false;
		}
	};
	const refreshOptions = async (propagate = false) => {
		const session = context.getSession(); if (!session) return;
		const revision = ++optionsRevision;
		try {
			const items: PartnerRecord[] = []; let page = 1; let total = 0;
			do {
				const data: RecordPage<PartnerRecord> = await context.request(`/api/admin/records?type=partners&limit=100&page=${page}`, session.token);
				if (!current(session) || revision !== optionsRevision) return;
				if (!Array.isArray(data.items) || !Number.isInteger(data.total)) throw new Error('Výběr partnerů se nepodařilo načíst.');
				items.push(...data.items); total = data.total; page++;
			} while (items.length < total && (page - 1) * 100 < total);
			const datalist = document.querySelector<HTMLDataListElement>('#admin-partners')!; datalist.replaceChildren();
			const select = document.querySelector<HTMLSelectElement>('[data-partner-filter]')!; const selected = select.value;
			select.replaceChildren(new Option('Všichni partneři', ''));
			for (const partner of items) {
				const label = `${partner.name} (${partner.id})${partner.active ? '' : ' · vypnutý'}`;
				datalist.append(new Option(label, partner.id)); select.append(new Option(label, partner.id));
			}
			if (selected && !items.some(item => item.id === selected)) select.append(new Option(`${selected} · nenalezen`, selected));
			select.value = selected;
		} catch (error) {
			if (current(session)) {
				notice(formFor('products').querySelector<HTMLElement>('.config-message')!, `Výběr partnerů se nepodařilo obnovit. ${context.formatError(error)}`, 'error');
				if (!propagate) context.onAuthError(error);
			}
			if (propagate) throw error;
		}
	};
	for (const kind of kinds) {
		const filters = document.querySelector<HTMLFormElement>(`[data-record-filters=${kind}]`)!;
		const search = () => { clearTimeout(timers.get(kind)); void load(kind, 1); };
		filters.addEventListener('submit', event => { event.preventDefault(); search(); });
		filters.addEventListener('change', event => { if (event.target instanceof HTMLSelectElement) search(); });
		filters.querySelector('input')!.addEventListener('input', () => { clearTimeout(timers.get(kind)); timers.set(kind, setTimeout(search, 300)); });
		filters.querySelector('[data-clear-filters]')!.addEventListener('click', () => { filters.reset(); search(); });
		document.querySelector(`[data-record-prev=${kind}]`)!.addEventListener('click', () => void load(kind, Math.max(1, states[kind].page - 1)));
		document.querySelector(`[data-record-next=${kind}]`)!.addEventListener('click', () => void load(kind, states[kind].page + 1));
	}
	for (const kind of ['partners', 'products'] as const) {
		document.querySelector(`[data-new-record=${kind}]`)!.addEventListener('click', () => resetEditor(kind, true));
		document.querySelector(`[data-reset-editor=${kind}]`)!.addEventListener('click', () => resetEditor(kind));
		resetEditor(kind);
	}
	document.querySelector('[data-close-lead]')!.addEventListener('click', () => { if (!busy(leadForm)) { editRevision.leads++; leadDetail.hidden = true; currentLead = null; leadForm.reset(); } });
	return {
		loadAll: () => Promise.all([...kinds.map(kind => load(kind)), refreshOptions()]),
		prepareSubmission: (kind: AdminFormKind, payload: Record<string, unknown>) => {
			if (kind === 'partner' || kind === 'product') {
				const identity = editing.get(kind); payload.operation = identity ? 'update' : 'create';
				const key = `${kind === 'partner' ? 'partners' : 'products'}/${kind === 'product' ? identity?.partnerId ?? payload.partnerId : ''}/${identity?.id ?? payload.id}`;
				if (toggling.has(key)) throw new Error('Vyčkejte na dokončení změny aktivního stavu tohoto záznamu.');
				if (identity) { payload.id = identity.id; if (kind === 'product') payload.partnerId = identity.partnerId; }
			}
			if (kind === 'lead' && currentLead) payload.id = currentLead.id;
		},
		afterSave: async (kind: AdminFormKind, payload: Record<string, unknown>) => {
			if (kind === 'partner' || kind === 'product') {
				const recordKind = kind === 'partner' ? 'partners' : 'products';
				if (!editing.has(kind)) {
					editing.set(kind, { id: String(payload.id), ...(kind === 'product' ? { partnerId: String(payload.partnerId) } : {}) });
					const form = formFor(recordKind);
					for (const name of ['id', 'partnerId']) { const field = form.elements.namedItem(name); if (field instanceof HTMLInputElement) field.readOnly = true; }
					form.querySelector('[data-editor-heading]')!.textContent = `Upravujete ${kind === 'partner' ? 'partnera' : 'nabídku'}: ${payload.id}`;
				}
				await load(recordKind, states[recordKind].page, true);
				if (kind === 'partner') await Promise.all([refreshOptions(true), load('products', states.products.page, true)]);
			}
			if (kind === 'lead') {
				await load('leads', states.leads.page, true);
				const session = context.getSession(); if (!session || !currentLead) return;
				const data = await context.request(`/api/admin/records?${new URLSearchParams({ type: 'leads', id: currentLead.id })}`, session.token);
				if (current(session) && currentLead.id === data.item?.id) showLead(data.item, false);
			}
		},
		clear: () => {
			optionsRevision++; currentLead = null; leadDetail.hidden = true; leadForm.reset();
			document.querySelector('[data-lead-title]')!.textContent = 'Detail poptávky';
			document.querySelector('[data-lead-fields]')!.replaceChildren(); document.querySelector('[data-lead-extra]')!.replaceChildren();
			document.querySelector('#admin-partners')!.replaceChildren(); document.querySelector('[data-partner-filter]')!.replaceChildren(new Option('Všichni partneři', ''));
			for (const kind of kinds) {
				states[kind].revision++; states[kind].page = 1; editRevision[kind]++; clearTimeout(timers.get(kind));
				document.querySelector<HTMLFormElement>(`[data-record-filters=${kind}]`)!.reset();
				document.querySelector(`[data-record-results=${kind}]`)!.replaceChildren(); document.querySelector(`[data-record-summary=${kind}]`)!.textContent = '';
				const output = outputFor(kind); output.textContent = ''; delete output.dataset.state;
				for (const direction of ['prev', 'next']) document.querySelector<HTMLButtonElement>(`[data-record-${direction}=${kind}]`)!.disabled = true;
			}
			resetEditor('partners', false, true); resetEditor('products', false, true);
		},
	};
};
