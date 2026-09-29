export type AdPlacement =
	| 'top-banner'
	| 'between-hero-content'
	| 'calculator-middle'
	| 'calculator-bottom'
	| 'article-inline-1'
	| 'article-inline-2'
	| 'before-faq'
	| 'footer'
	| 'sticky-mobile';

export interface AdSlotConfig {
	enabled: boolean;
	provider: 'adsense' | 'gam' | 'custom';
	format: 'responsive' | 'leaderboard' | 'rectangle' | 'native';
	desktopMinHeight: number;
	mobileMinHeight: number;
	mobileOnly?: boolean;
	desktopOnly?: boolean;
	variant?: string;
}

// All slots start disabled. Enable only after provider IDs, CMP consent mode and policy review are configured.
export const adsConfig: Record<AdPlacement, AdSlotConfig> = {
	'top-banner': { enabled: false, provider: 'adsense', format: 'leaderboard', desktopMinHeight: 90, mobileMinHeight: 50 },
	'between-hero-content': { enabled: false, provider: 'adsense', format: 'responsive', desktopMinHeight: 90, mobileMinHeight: 90 },
	'calculator-middle': { enabled: false, provider: 'adsense', format: 'responsive', desktopMinHeight: 250, mobileMinHeight: 180 },
	'calculator-bottom': { enabled: false, provider: 'adsense', format: 'responsive', desktopMinHeight: 250, mobileMinHeight: 180 },
	'article-inline-1': { enabled: false, provider: 'adsense', format: 'responsive', desktopMinHeight: 250, mobileMinHeight: 180 },
	'article-inline-2': { enabled: false, provider: 'adsense', format: 'responsive', desktopMinHeight: 250, mobileMinHeight: 180 },
	'before-faq': { enabled: false, provider: 'adsense', format: 'responsive', desktopMinHeight: 90, mobileMinHeight: 90 },
	footer: { enabled: false, provider: 'adsense', format: 'responsive', desktopMinHeight: 90, mobileMinHeight: 60 },
	'sticky-mobile': { enabled: false, provider: 'adsense', format: 'responsive', desktopMinHeight: 0, mobileMinHeight: 60, mobileOnly: true },
};

export const adPageDensity = {
	short: ['between-hero-content', 'footer'] as AdPlacement[],
	calculator: ['between-hero-content', 'calculator-bottom', 'before-faq'] as AdPlacement[],
	longArticle: ['between-hero-content', 'article-inline-1', 'article-inline-2', 'before-faq', 'footer'] as AdPlacement[],
};
