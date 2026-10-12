export class AdminError extends Error {
	status: number;
	constructor(message: string, status = 422) { super(message); this.status = status; }
}

export const text = (value: unknown, label: string, max: number, min = 1): string => {
	if (typeof value !== 'string') throw new AdminError(`${label}: zadejte text.`);
	const result = value.trim();
	if (result.length < min || result.length > max || /[\u0000-\u001f\u007f]/.test(result)) throw new AdminError(`${label}: povolená délka je ${min} až ${max} znaků bez řídicích znaků.`);
	return result;
};
export const optionalText = (value: unknown, label: string, max: number) => value == null || value === '' ? null : text(value, label, max, 0) || null;
export const choice = (value: unknown, allowed: readonly string[], label: string): string => {
	if (typeof value !== 'string' || !allowed.includes(value)) throw new AdminError(`${label}: vyberte povolenou hodnotu.`);
	return value;
};
export const flag = (value: unknown, label: string, fallback = false): boolean => {
	if (value === undefined) return fallback;
	if (typeof value !== 'boolean') throw new AdminError(`${label}: použijte zapnuto nebo vypnuto.`);
	return value;
};
export const number = (value: unknown, label: string, max: number, integer = false): number => {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isSafeInteger(value))) throw new AdminError(`${label}: zadejte nezáporné ${integer ? 'celé ' : ''}číslo nejvýše ${max}.`);
	return value;
};
export const money = (value: unknown, label: string, max: number, optional = false): number | null => {
	if (optional && (value == null || value === '')) return null;
	const amount = number(value, label, max); const cents = Math.round(amount * 100);
	if (Math.abs(amount - cents / 100) > Number.EPSILON * Math.max(1, amount) * 2) throw new AdminError(`${label}: použijte nejvýše dvě desetinná místa.`);
	return cents / 100;
};
export const day = (value: unknown, label: string): string => {
	const date = text(value, label, 10, 10); const parsed = new Date(`${date}T00:00:00.000Z`);
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new AdminError(`${label}: zadejte platné datum.`);
	return date;
};
export const slug = (value: unknown, label: string, max = 40): string => {
	const id = text(value, label, max, 2);
	if (!/^[a-z0-9][a-z0-9-]+$/.test(id)) throw new AdminError(`${label}: použijte malá písmena, číslice a pomlčky.`);
	return id;
};
export const leadId = (value: unknown): string => {
	const id = text(value, 'ID poptávky', 36, 36);
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new AdminError('Zadejte platné ID poptávky.');
	return id;
};
export const httpsUrl = (value: unknown, label: string, optional = false): string | null => {
	if (optional && (value == null || value === '')) return null;
	const raw = text(value, label, 2048);
	try { const url = new URL(raw); if (url.protocol === 'https:' && !url.username && !url.password) return raw; } catch { /* Report a validation error below. */ }
	throw new AdminError(`${label}: zadejte platný odkaz začínající https:// bez přihlašovacích údajů.`);
};
export const strings = (value: unknown, label: string, maxItems: number, maxLength: number, minItems = 0): string[] => {
	if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) throw new AdminError(`${label}: povoleno ${minItems} až ${maxItems} položek.`);
	return [...new Set(value.map(item => text(item, label, maxLength)))];
};
