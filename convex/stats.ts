import type { MutationCtx } from "./_generated/server";

const emptyStats = {
  key: "global" as const,
  totalCreators: 0,
  submittedCount: 0,
  approvedCount: 0,
  rejectedCount: 0,
  withManagerCount: 0,
  creatorOwedAmount: 0,
  creatorPaidAmount: 0,
  managerOwedAmount: 0,
  managerPaidAmount: 0,
  grossOnApproved: 0,
  attributionPending: 0,
};

export async function changeProgramStats(
  ctx: MutationCtx,
  changes: Partial<Omit<typeof emptyStats, "key">>,
) {
  const existing = await ctx.db
    .query("programStats")
    .withIndex("by_key", (q) => q.eq("key", "global"))
    .unique();

  if (!existing) {
    await ctx.db.insert("programStats", {
      ...emptyStats,
      ...changes,
    });
    return;
  }

  const patch: Partial<Omit<typeof emptyStats, "key">> = {};
  for (const key of Object.keys(changes) as Array<keyof Omit<typeof emptyStats, "key">>) {
    patch[key] = existing[key] + (changes[key] ?? 0);
  }
  await ctx.db.patch("programStats", existing._id, patch);
}

export async function ensureProgramStats(ctx: MutationCtx) {
  const existing = await ctx.db
    .query("programStats")
    .withIndex("by_key", (q) => q.eq("key", "global"))
    .unique();
  if (existing) return existing;
  const id = await ctx.db.insert("programStats", emptyStats);
  const created = await ctx.db.get("programStats", id);
  if (!created) throw new Error("Could not initialize program stats.");
  return created;
}
