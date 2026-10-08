import { isValidAdsensePublisherId } from "../lib/monetization/adsense";

export type AdSlotDefinition = {
  id: string;
  page: "home" | "car-calculator";
  position: string;
  format: "auto" | "horizontal" | "rectangle";
  minHeight: number;
  enabled: boolean;
  providerSlotId: string;
};

const env = import.meta.env;
const publisherId = env.PUBLIC_ADSENSE_PUBLISHER_ID ?? "";
const publishingEnabled = env.PUBLIC_MONETIZATION_ADS_ENABLED === "true" && isValidAdsensePublisherId(publisherId);

/** Empty IDs mean that the placement stays completely absent from the rendered page. */
export const adSlots: AdSlotDefinition[] = [
  { id: "home-after-hero", page: "home", position: "Po úvodní sekci", format: "auto", minHeight: 120, enabled: publishingEnabled, providerSlotId: env.PUBLIC_AD_SLOT_HOME_AFTER_HERO ?? "" },
  { id: "home-between-sections", page: "home", position: "Mezi obsahovými sekcemi", format: "auto", minHeight: 120, enabled: publishingEnabled, providerSlotId: env.PUBLIC_AD_SLOT_HOME_MID ?? "" },
  { id: "home-before-footer", page: "home", position: "Před patičkou", format: "auto", minHeight: 120, enabled: publishingEnabled, providerSlotId: env.PUBLIC_AD_SLOT_HOME_FOOTER ?? "" },
  { id: "car-above-calculator", page: "car-calculator", position: "Nad kalkulačkou", format: "auto", minHeight: 100, enabled: publishingEnabled, providerSlotId: env.PUBLIC_AD_SLOT_CAR_TOP ?? "" },
  { id: "car-below-results", page: "car-calculator", position: "Pod výsledky", format: "auto", minHeight: 100, enabled: publishingEnabled, providerSlotId: env.PUBLIC_AD_SLOT_CAR_RESULTS ?? "" },
  { id: "car-before-footer", page: "car-calculator", position: "Před patičkou", format: "auto", minHeight: 100, enabled: publishingEnabled, providerSlotId: env.PUBLIC_AD_SLOT_CAR_FOOTER ?? "" },
];

export function findAdSlot(id: string) {
  return adSlots.find((slot) => slot.id === id);
}
