export type ProductCategory = 'car-insurance' | 'home-insurance' | 'energy' | 'mortgage' | 'loan' | 'bank-account' | 'mobile' | 'internet';

export interface Partner {
	id: string;
	name: string;
	active: boolean;
	licensedDistributor?: boolean;
	registrationUrl?: string;
	leadEndpoint?: string;
	affiliateBaseUrl?: string;
	categories: ProductCategory[];
	regions?: string[];
	priority: number;
	fallbackPartnerIds?: string[];
}

export interface ProductOffer {
	id: string;
	partnerId: string;
	providerName: string;
	category: ProductCategory;
	productName: string;
	priceAmount?: number;
	priceCurrency?: 'CZK';
	pricePeriod?: 'month' | 'year' | 'one-off';
	indicativePrice: boolean;
	updatedAt?: string;
	excess?: string;
	coverage?: string[];
	limits?: string[];
	advantages: string[];
	disadvantages: string[];
	termsUrl?: string;
	affiliatePath?: string;
	trackingId: string;
	sponsored: boolean;
	active: boolean;
}

// Only verified, real feeds should be added here. There are deliberately no demo offers or fabricated prices.
export const productOffers: ProductOffer[] = [];
