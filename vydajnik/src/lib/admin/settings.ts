export const adPlacements = ['top-banner', 'between-hero-content', 'calculator-middle', 'calculator-bottom', 'article-inline-1', 'article-inline-2', 'before-faq', 'footer', 'sticky-mobile'] as const;
export const adPlacementLabels: Record<string, string> = {
	'top-banner': 'Banner nahoře', 'between-hero-content': 'Pod úvodem', 'calculator-middle': 'Uvnitř kalkulačky', 'calculator-bottom': 'Pod kalkulačkou',
	'article-inline-1': 'V článku — první', 'article-inline-2': 'V článku — druhá', 'before-faq': 'Před častými otázkami', footer: 'Patička', 'sticky-mobile': 'Mobilní přichycená reklama',
};
