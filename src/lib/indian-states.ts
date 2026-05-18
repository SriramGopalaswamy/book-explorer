/**
 * Canonical Indian states / union territories list.
 *
 * Single source of truth for state selectors, GST place-of-supply lookups,
 * leave-rule defaults, and e-invoice / e-way bill state-code mapping.
 *
 * Shape rationale:
 *  - `code`         — 2-letter ISO subdivision code (e.g. "KA"). Used by
 *                     onboarding, warehouses, invoicing place-of-supply.
 *  - `name`         — Full English name. Display label everywhere.
 *  - `gstStateCode` — 2-digit GSTN code (e.g. "29"). Used by e-invoice /
 *                     e-way bill APIs and the first 2 digits of every GSTIN.
 *
 * Includes 28 states + 8 union territories. The historical "Andhra Pradesh
 * (Old)" entry with GST code 28 is retained for legacy data display, but
 * marked `legacy: true` so new selectors filter it out.
 *
 * GBC-129 — Wave-2 audit, P-14 probe enforces uniqueness.
 */

export interface IndianState {
  /** ISO 3166-2:IN subdivision code (e.g. "KA"). */
  code: string;
  /** Full English name (e.g. "Karnataka"). */
  name: string;
  /** 2-digit GSTN state code (e.g. "29"). */
  gstStateCode: string;
  /** Historical/superseded entry — hidden from selectors. */
  legacy?: boolean;
}

export const INDIAN_STATES: readonly IndianState[] = Object.freeze([
  // States
  { code: "AP", name: "Andhra Pradesh", gstStateCode: "37" },
  { code: "AR", name: "Arunachal Pradesh", gstStateCode: "12" },
  { code: "AS", name: "Assam", gstStateCode: "18" },
  { code: "BR", name: "Bihar", gstStateCode: "10" },
  { code: "CG", name: "Chhattisgarh", gstStateCode: "22" },
  { code: "GA", name: "Goa", gstStateCode: "30" },
  { code: "GJ", name: "Gujarat", gstStateCode: "24" },
  { code: "HR", name: "Haryana", gstStateCode: "06" },
  { code: "HP", name: "Himachal Pradesh", gstStateCode: "02" },
  { code: "JH", name: "Jharkhand", gstStateCode: "20" },
  { code: "KA", name: "Karnataka", gstStateCode: "29" },
  { code: "KL", name: "Kerala", gstStateCode: "32" },
  { code: "MP", name: "Madhya Pradesh", gstStateCode: "23" },
  { code: "MH", name: "Maharashtra", gstStateCode: "27" },
  { code: "MN", name: "Manipur", gstStateCode: "14" },
  { code: "ML", name: "Meghalaya", gstStateCode: "17" },
  { code: "MZ", name: "Mizoram", gstStateCode: "15" },
  { code: "NL", name: "Nagaland", gstStateCode: "13" },
  { code: "OD", name: "Odisha", gstStateCode: "21" },
  { code: "PB", name: "Punjab", gstStateCode: "03" },
  { code: "RJ", name: "Rajasthan", gstStateCode: "08" },
  { code: "SK", name: "Sikkim", gstStateCode: "11" },
  { code: "TN", name: "Tamil Nadu", gstStateCode: "33" },
  { code: "TG", name: "Telangana", gstStateCode: "36" },
  { code: "TR", name: "Tripura", gstStateCode: "16" },
  { code: "UP", name: "Uttar Pradesh", gstStateCode: "09" },
  { code: "UK", name: "Uttarakhand", gstStateCode: "05" },
  { code: "WB", name: "West Bengal", gstStateCode: "19" },
  // Union Territories
  { code: "AN", name: "Andaman & Nicobar", gstStateCode: "35" },
  { code: "CH", name: "Chandigarh", gstStateCode: "04" },
  { code: "DL", name: "Delhi", gstStateCode: "07" },
  { code: "DN", name: "Dadra & Nagar Haveli", gstStateCode: "26" },
  { code: "JK", name: "Jammu & Kashmir", gstStateCode: "01" },
  { code: "LA", name: "Ladakh", gstStateCode: "38" },
  { code: "LD", name: "Lakshadweep", gstStateCode: "31" },
  { code: "PY", name: "Puducherry", gstStateCode: "34" },
  // Historical — kept for legacy data only
  { code: "DD", name: "Daman & Diu", gstStateCode: "25", legacy: true },
  { code: "APO", name: "Andhra Pradesh (Old)", gstStateCode: "28", legacy: true },
]);

/** Active (non-legacy) states only — use for selector dropdowns. */
export const INDIAN_STATES_ACTIVE: readonly IndianState[] = Object.freeze(
  INDIAN_STATES.filter((s) => !s.legacy),
);

/**
 * Map of GST state code → state name (e.g. "29" → "Karnataka").
 * Includes legacy entries so historical e-invoice / e-way bill rows still
 * resolve a human-readable label.
 */
export const GST_STATE_CODE_TO_NAME: Readonly<Record<string, string>> =
  Object.freeze(
    Object.fromEntries(INDIAN_STATES.map((s) => [s.gstStateCode, s.name])),
  );

/** Map of ISO code → state. */
export const ISO_CODE_TO_STATE: Readonly<Record<string, IndianState>> =
  Object.freeze(
    Object.fromEntries(INDIAN_STATES.map((s) => [s.code, s])),
  );

/** Find a state by full name (case-insensitive). */
export function findStateByName(name: string | null | undefined): IndianState | undefined {
  if (!name) return undefined;
  const needle = name.trim().toLowerCase();
  return INDIAN_STATES.find((s) => s.name.toLowerCase() === needle);
}

/** Find a state by GST 2-digit code (e.g. "29"). */
export function findStateByGstCode(gstCode: string | null | undefined): IndianState | undefined {
  if (!gstCode) return undefined;
  return INDIAN_STATES.find((s) => s.gstStateCode === gstCode);
}
