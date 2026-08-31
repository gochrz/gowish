import { ConvexError } from "convex/values";

export function clean(value: string | undefined, maxLength: number, field: string) {
  const normalized = (value ?? "").trim();
  if (normalized.length > maxLength) {
    throw validationError(`${field} is too long.`);
  }
  return normalized;
}

export function required(value: string | undefined, maxLength: number, field: string) {
  const normalized = clean(value, maxLength, field);
  if (!normalized) {
    throw validationError(`${field} is required.`);
  }
  return normalized;
}

export function normalizeEmail(value: string, field: string) {
  const normalized = required(value, 254, field).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) {
    throw validationError(`${field} does not look right.`);
  }
  return normalized;
}

export function normalizeCode(value: string | undefined) {
  return clean(value, 16, "Referral code").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normalizeHandle(value: string, field: string) {
  const normalized = required(value, 100, field).replace(/^@+/, "");
  if (!/^[^\s@/]{1,100}$/.test(normalized)) {
    throw validationError(`${field} is invalid.`);
  }
  return `@${normalized}`;
}

export type PayoutMethod = "venmo" | "apple_cash";

export function normalizePayout(method: PayoutMethod, destination: string, legalName: string) {
  const payoutLegalName = required(legalName, 120, "Payout name");
  if (method === "venmo") {
    return {
      payoutMethod: method,
      payoutDestination: normalizeHandle(destination, "Venmo handle"),
      payoutLegalName,
    };
  }

  const contact = required(destination, 254, "Apple Cash phone number or email");
  if (contact.includes("@")) {
    try {
      return {
        payoutMethod: method,
        payoutDestination: normalizeEmail(contact, "Apple Cash phone number or email"),
        payoutLegalName,
      };
    } catch {
      throw validationError("Apple Cash phone number or email is invalid.");
    }
  }

  const digits = contact.replace(/\D/g, "");
  if (digits.length === 10) {
    return { payoutMethod: method, payoutDestination: `+1${digits}`, payoutLegalName };
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return { payoutMethod: method, payoutDestination: `+${digits}`, payoutLegalName };
  }
  throw validationError("Apple Cash phone number or email is invalid.");
}

export function optional(value: string | undefined, maxLength: number, field: string) {
  const normalized = clean(value, maxLength, field);
  return normalized || undefined;
}

export function requireConsent(accepted: boolean, version: string, origin: string, expectedVersion: string) {
  if (!accepted) {
    throw validationError("Consent is required.");
  }
  const consentVersion = required(version, 80, "Consent version");
  if (consentVersion !== expectedVersion) {
    throw validationError("Consent version is not supported. Refresh the page and try again.");
  }
  return {
    consentAccepted: true,
    consentVersion,
    consentOrigin: required(origin, 300, "Consent origin"),
  };
}

export function validationError(message: string) {
  return new ConvexError({ code: "VALIDATION_ERROR", message });
}

export function businessError(message: string) {
  return new ConvexError({ code: "BUSINESS_RULE", message });
}
