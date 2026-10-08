/** Pure car and alternative transport calculations. Monetary inputs are supplied by the user. */
export type CarInputs = {
  purchasePrice: number; futureValue: number; years: number; annualKm: number; consumption: number; fuelPrice: number;
  liability: number; comprehensive: number; service: number; tires: number; other: number;
  transitMonthly: number; transitOtherMonthly: number; shareRate: number; shareUnit: "km" | "hour" | "minute"; shareUnitsMonthly: number;
};
export type TransportResult = { annual: number; monthly: number; total: number; perKm: number };
export function calculateCarCosts(i: CarInputs) {
  const depreciation = Math.max(0, i.purchasePrice - i.futureValue) / i.years;
  const fuel = i.annualKm * i.consumption / 100 * i.fuelPrice;
  const service = i.liability + i.comprehensive + i.service + i.tires + i.other;
  const annual = depreciation + fuel + service;
  const car: TransportResult = { annual, monthly: annual / 12, total: annual * i.years, perKm: i.annualKm > 0 ? annual / i.annualKm : 0 };
  const transitAnnual = (i.transitMonthly + i.transitOtherMonthly) * 12;
  const transit: TransportResult = { annual: transitAnnual, monthly: transitAnnual / 12, total: transitAnnual * i.years, perKm: i.annualKm > 0 ? transitAnnual / i.annualKm : 0 };
  const shareAnnual = i.shareRate * i.shareUnitsMonthly * 12;
  const sharing: TransportResult = { annual: shareAnnual, monthly: shareAnnual / 12, total: shareAnnual * i.years, perKm: i.annualKm > 0 ? shareAnnual / i.annualKm : 0 };
  return { car, transit, sharing, fuel, service, depreciation };
}
