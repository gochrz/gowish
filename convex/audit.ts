import type { MutationCtx } from "./_generated/server";

export async function recordAudit(
  ctx: MutationCtx,
  event: {
    actor: "public" | "admin" | "system";
    action: string;
    entityType: "creator" | "manager" | "system";
    entityKey: string;
    details: Record<string, unknown>;
  },
) {
  await ctx.db.insert("auditEvents", {
    actor: event.actor,
    action: event.action,
    entityType: event.entityType,
    entityKey: event.entityKey,
    eventAt: Date.now(),
    details: JSON.stringify(event.details),
  });
}
