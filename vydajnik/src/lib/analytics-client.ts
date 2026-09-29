type MonetizationEvent = 'calculator_started' | 'calculator_completed' | 'lead_form_started' | 'lead_submitted' | 'partner_clicked' | 'affiliate_clicked' | 'ad_view' | 'ad_click' | 'pdf_generated' | 'report_downloaded' | 'page_view';
type Category = 'analytics' | 'advertising' | 'marketing';

export function hasConsent(category: Category): boolean {
	try { return JSON.parse(localStorage.getItem('vydajnik-consent-v1') || '{}')[category] === true; } catch { return false; }
}

export async function track(event: MonetizationEvent, calculator?: string, properties: Record<string, unknown> = {}, category: Category = 'analytics') {
	if (!hasConsent(category)) return;
	try {
		await fetch('/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, keepalive: true, body: JSON.stringify({ event, calculator, properties, consent: true }) });
	} catch { /* Tracking must never block the calculator or a partner navigation. */ }
}

export function initializeAnalytics() {
	if (!hasConsent('analytics')) return;
	void track('page_view', location.pathname);
	document.querySelectorAll<HTMLElement>('[data-partner-click]').forEach((link) => {
		link.addEventListener('click', () => {
			const { partner, product } = link.dataset;
			void track('partner_clicked', document.body.dataset.calculator, { partner, product }, 'marketing');
		}, { once: true });
	});
	window.addEventListener('vydajnik:ad-impression', (event) => {
		const detail = (event as CustomEvent).detail;
		void track('ad_view', location.pathname, { placement: detail?.placement, variant: detail?.variant }, 'advertising');
	});
}
