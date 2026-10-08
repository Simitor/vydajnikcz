export type ConsentSignal = {
  gdprApplies?: boolean;
  tcString?: string;
  purpose?: { consents?: Record<string, boolean> };
  vendor?: { consents?: Record<string, boolean> };
};

export function isValidAdsensePublisherId(value: string) {
  return /^ca-pub-\d{16}$/.test(value);
}

export function isValidAdsenseSlotId(value: string) {
  return /^\d{6,16}$/.test(value);
}

/** Fail closed for EEA traffic unless the installed CMP returns the needed TCF consents. */
export function mayRequestAds(signal: ConsentSignal) {
  if (signal.gdprApplies === false) return true;
  return Boolean(
    signal.tcString &&
    signal.purpose?.consents?.["1"] &&
    signal.purpose?.consents?.["3"] &&
    signal.purpose?.consents?.["4"] &&
    signal.vendor?.consents?.["755"],
  );
}
