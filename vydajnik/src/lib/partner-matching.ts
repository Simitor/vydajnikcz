import type { Partner, ProductCategory } from '../types/monetization';

export interface LeadMatchRequest { category: ProductCategory; region?: string; }

/** Route only to active, explicitly configured partners. A contact is never sent to multiple partners by default. */
export function matchLead(partners: Partner[], request: LeadMatchRequest): Partner | undefined {
	return partners
		.filter((partner) => partner.active && partner.leadEndpoint && partner.categories.includes(request.category))
		.filter((partner) => !partner.regions?.length || !request.region || partner.regions.includes(request.region))
		.sort((a, b) => b.priority - a.priority)[0];
}

export function fallbackPartners(primary: Partner, partners: Partner[], request: LeadMatchRequest): Partner[] {
	const allowed = new Set(primary.fallbackPartnerIds ?? []);
	return partners
		.filter((partner) => allowed.has(partner.id) && partner.active && partner.leadEndpoint && partner.categories.includes(request.category))
		.filter((partner) => !partner.regions?.length || !request.region || partner.regions.includes(request.region))
		.sort((a, b) => b.priority - a.priority);
}
