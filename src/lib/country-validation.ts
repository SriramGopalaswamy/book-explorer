// Country-specific phone codes and tax number validation patterns

export interface CountryPhoneConfig {
  code: string;
  digits: number; // expected digits after country code
  label: string;
}

export interface CountryTaxConfig {
  pattern: RegExp;
  label: string;
  placeholder: string;
}

export const COUNTRY_PHONE_CONFIG: Record<string, CountryPhoneConfig> = {
  "India": { code: "+91", digits: 10, label: "10-digit mobile number" },
  "United States": { code: "+1", digits: 10, label: "10-digit number" },
  "United Kingdom": { code: "+44", digits: 10, label: "10-digit number" },
  "Canada": { code: "+1", digits: 10, label: "10-digit number" },
  "Australia": { code: "+61", digits: 9, label: "9-digit number" },
  "Germany": { code: "+49", digits: 11, label: "10-11 digit number" },
  "France": { code: "+33", digits: 9, label: "9-digit number" },
  "Japan": { code: "+81", digits: 10, label: "10-digit number" },
  "China": { code: "+86", digits: 11, label: "11-digit number" },
  "Brazil": { code: "+55", digits: 11, label: "10-11 digit number" },
  "Singapore": { code: "+65", digits: 8, label: "8-digit number" },
  "United Arab Emirates": { code: "+971", digits: 9, label: "9-digit number" },
  "Saudi Arabia": { code: "+966", digits: 9, label: "9-digit number" },
  "South Africa": { code: "+27", digits: 9, label: "9-digit number" },
  "Mexico": { code: "+52", digits: 10, label: "10-digit number" },
  "South Korea": { code: "+82", digits: 10, label: "10-digit number" },
  "Indonesia": { code: "+62", digits: 11, label: "10-12 digit number" },
  "Malaysia": { code: "+60", digits: 10, label: "9-10 digit number" },
  "Thailand": { code: "+66", digits: 9, label: "9-digit number" },
  "Philippines": { code: "+63", digits: 10, label: "10-digit number" },
  "Bangladesh": { code: "+880", digits: 10, label: "10-digit number" },
  "Pakistan": { code: "+92", digits: 10, label: "10-digit number" },
  "Sri Lanka": { code: "+94", digits: 9, label: "9-digit number" },
  "Nepal": { code: "+977", digits: 10, label: "10-digit number" },
  "Nigeria": { code: "+234", digits: 10, label: "10-digit number" },
  "Kenya": { code: "+254", digits: 9, label: "9-digit number" },
  "Italy": { code: "+39", digits: 10, label: "10-digit number" },
  "Spain": { code: "+34", digits: 9, label: "9-digit number" },
  "Netherlands": { code: "+31", digits: 9, label: "9-digit number" },
  "Sweden": { code: "+46", digits: 9, label: "9-digit number" },
  "Switzerland": { code: "+41", digits: 9, label: "9-digit number" },
  "Russia": { code: "+7", digits: 10, label: "10-digit number" },
  "Turkey": { code: "+90", digits: 10, label: "10-digit number" },
  "Egypt": { code: "+20", digits: 10, label: "10-digit number" },
  "Israel": { code: "+972", digits: 9, label: "9-digit number" },
  "New Zealand": { code: "+64", digits: 9, label: "8-9 digit number" },
  "Ireland": { code: "+353", digits: 9, label: "9-digit number" },
  "Poland": { code: "+48", digits: 9, label: "9-digit number" },
  "Norway": { code: "+47", digits: 8, label: "8-digit number" },
  "Denmark": { code: "+45", digits: 8, label: "8-digit number" },
  "Finland": { code: "+358", digits: 9, label: "9-digit number" },
  "Portugal": { code: "+351", digits: 9, label: "9-digit number" },
  "Belgium": { code: "+32", digits: 9, label: "9-digit number" },
  "Austria": { code: "+43", digits: 10, label: "10-digit number" },
  "Greece": { code: "+30", digits: 10, label: "10-digit number" },
  "Czech Republic": { code: "+420", digits: 9, label: "9-digit number" },
  "Romania": { code: "+40", digits: 9, label: "9-digit number" },
  "Hungary": { code: "+36", digits: 9, label: "9-digit number" },
};

export const COUNTRY_TAX_CONFIG: Record<string, CountryTaxConfig> = {
  "India": { pattern: /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/, label: "GSTIN", placeholder: "22AAAAA0000A1Z5" },
  "United States": { pattern: /^\d{2}-\d{7}$/, label: "EIN", placeholder: "12-3456789" },
  "United Kingdom": { pattern: /^GB\d{9}$|^GB\d{12}$|^GBGD\d{3}$|^GBHA\d{3}$/, label: "VAT Number", placeholder: "GB123456789" },
  "Canada": { pattern: /^\d{9}RT\d{4}$/, label: "GST/HST", placeholder: "123456789RT0001" },
  "Australia": { pattern: /^\d{11}$/, label: "ABN", placeholder: "12345678901" },
  "Germany": { pattern: /^DE\d{9}$/, label: "USt-IdNr", placeholder: "DE123456789" },
  "France": { pattern: /^FR[A-Z0-9]{2}\d{9}$/, label: "TVA", placeholder: "FRXX123456789" },
  "Singapore": { pattern: /^[A-Z]\d{7}[A-Z]$|^\d{9}[A-Z]$/, label: "GST Reg No", placeholder: "M12345678X" },
  "United Arab Emirates": { pattern: /^\d{15}$/, label: "TRN", placeholder: "100000000000003" },
  "Saudi Arabia": { pattern: /^3\d{14}$/, label: "VAT Number", placeholder: "300000000000003" },
  "Japan": { pattern: /^T\d{13}$/, label: "Invoice Reg No", placeholder: "T1234567890123" },
  "South Korea": { pattern: /^\d{3}-\d{2}-\d{5}$/, label: "BRN", placeholder: "123-45-67890" },
  "Brazil": { pattern: /^\d{14}$|^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/, label: "CNPJ", placeholder: "12.345.678/0001-95" },
  "Malaysia": { pattern: /^[A-Z]\d{2}-\d{4}-\d{8}$/, label: "SST No", placeholder: "W10-1234-12345678" },
  "South Africa": { pattern: /^4\d{9}$/, label: "VAT Number", placeholder: "4123456789" },
  "Mexico": { pattern: /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/, label: "RFC", placeholder: "XAXX010101000" },
  "Italy": { pattern: /^IT\d{11}$/, label: "P.IVA", placeholder: "IT12345678901" },
  "Spain": { pattern: /^ES[A-Z]\d{7}[A-Z]$|^ES\d{8}[A-Z]$/, label: "NIF/CIF", placeholder: "ESA12345678" },
  "Netherlands": { pattern: /^NL\d{9}B\d{2}$/, label: "BTW", placeholder: "NL123456789B01" },
  "Switzerland": { pattern: /^CHE-\d{3}\.\d{3}\.\d{3}$/, label: "UID", placeholder: "CHE-123.456.789" },
  "Turkey": { pattern: /^\d{10}$/, label: "VKN", placeholder: "1234567890" },
};

/**
 * Get phone config for a country, with sensible defaults
 */
export function getPhoneConfig(country: string): CountryPhoneConfig {
  return COUNTRY_PHONE_CONFIG[country] || { code: "", digits: 10, label: "phone number" };
}

/**
 * Get tax config for a country
 */
export function getTaxConfig(country: string): CountryTaxConfig | null {
  return COUNTRY_TAX_CONFIG[country] || null;
}

/**
 * Extract raw digits from a phone string (strip code, spaces, dashes)
 */
export function extractPhoneDigits(phone: string, countryCode: string): string {
  let cleaned = phone.replace(/[\s\-\(\)]/g, "");
  if (countryCode && cleaned.startsWith(countryCode)) {
    cleaned = cleaned.slice(countryCode.length);
  }
  return cleaned.replace(/\D/g, "");
}

/**
 * Validate phone number for a given country
 */
export function validatePhone(phone: string, country: string): string | null {
  if (!phone.trim()) return null; // optional field
  const config = getPhoneConfig(country);
  const digits = extractPhoneDigits(phone, config.code);
  
  if (digits.length === 0) return "Enter a valid phone number";
  
  // Allow a range of ±2 digits for flexibility across countries
  const minDigits = Math.max(config.digits - 2, 7);
  const maxDigits = config.digits + 2;
  
  if (digits.length < minDigits || digits.length > maxDigits) {
    return `${country || "Phone"} requires ${config.label} (${config.digits} digits). Got ${digits.length}.`;
  }
  return null;
}

/**
 * Validate tax/GST number for a given country
 */
export function validateTaxNumber(taxNumber: string, country: string): string | null {
  if (!taxNumber.trim()) return null; // optional field
  const config = getTaxConfig(country);
  if (!config) return null; // no known pattern, accept anything
  
  if (!config.pattern.test(taxNumber.trim())) {
    return `Invalid ${config.label} format for ${country}. Expected: ${config.placeholder}`;
  }
  return null;
}
