/** Reserved domain types for the upcoming Czech salary/OSVČ calculator. */
export type IncomeMode = "employee" | "self-employed-flat-expenses" | "self-employed-actual-expenses" | "flat-tax" | "agreement";
export type SalaryCalculationInput = { mode: IncomeMode; grossMonthlyOrAnnual: number; period: "monthly" | "annual" };
// Tax and insurance rules will be implemented against a dated, sourced constants set before this module is activated.
