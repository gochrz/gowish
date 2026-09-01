import type { PayoutMethod } from "./validation";
import { businessError, required } from "./validation";

export const eligibleCountries = [
  "United States",
  "Canada",
  "Albania",
  "Andorra",
  "Armenia",
  "Austria",
  "Azerbaijan",
  "Belarus",
  "Belgium",
  "Bosnia and Herzegovina",
  "Bulgaria",
  "Croatia",
  "Cyprus",
  "Czechia",
  "Denmark",
  "Estonia",
  "Finland",
  "France",
  "Georgia",
  "Germany",
  "Greece",
  "Hungary",
  "Iceland",
  "Ireland",
  "Italy",
  "Kazakhstan",
  "Kosovo",
  "Latvia",
  "Liechtenstein",
  "Lithuania",
  "Luxembourg",
  "Malta",
  "Moldova",
  "Monaco",
  "Montenegro",
  "Netherlands",
  "North Macedonia",
  "Norway",
  "Poland",
  "Portugal",
  "Romania",
  "Russia",
  "San Marino",
  "Serbia",
  "Slovakia",
  "Slovenia",
  "Spain",
  "Sweden",
  "Switzerland",
  "Türkiye",
  "Ukraine",
  "United Kingdom",
  "Vatican City",
] as const;

const eligibleCountrySet = new Set<string>(eligibleCountries);

export function normalizeEligibleCountry(value: string) {
  const country = required(value, 80, "Country");
  if (!eligibleCountrySet.has(country)) {
    throw businessError("This program is currently open to creators in the United States, Canada, and Europe.");
  }
  return country;
}

export function normalizeFollowerCount(value: string) {
  const normalized = required(value, 40, "Followers").replace(/[\s,]/g, "");
  if (!/^\d+$/.test(normalized)) {
    throw businessError("Followers must be a number.");
  }
  const count = Number(normalized);
  if (!Number.isSafeInteger(count) || count >= 150_000) {
    throw businessError("Your selected main platform must have fewer than 150,000 followers.");
  }
  return String(count);
}

export function requireCreatorPayoutMethod(country: string, method: PayoutMethod) {
  if (country !== "United States" && method !== "paypal") {
    throw businessError("PayPal is required outside the United States.");
  }
}
