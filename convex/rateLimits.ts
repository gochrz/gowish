import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  registrationByClient: {
    kind: "token bucket",
    rate: 5,
    period: MINUTE,
    capacity: 10,
  },
  validationByClient: {
    kind: "token bucket",
    rate: 20,
    period: MINUTE,
    capacity: 30,
  },
  publicRegistrationGlobal: {
    kind: "token bucket",
    rate: 300,
    period: MINUTE,
    capacity: 500,
    shards: 10,
  },
});

export async function limitRegistration(ctx: Parameters<typeof rateLimiter.limit>[0], key: string) {
  await rateLimiter.limit(ctx, "registrationByClient", { key, throws: true });
  await rateLimiter.limit(ctx, "publicRegistrationGlobal", { throws: true });
}

export async function limitValidation(ctx: Parameters<typeof rateLimiter.limit>[0], key: string) {
  await rateLimiter.limit(ctx, "validationByClient", { key, throws: true });
}
