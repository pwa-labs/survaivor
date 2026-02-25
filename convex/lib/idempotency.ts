import { ConvexError } from "convex/values";

import type { MutationCtx } from "../_generated/server";
import type { SignedEnvelope } from "./validators";

export async function assertAndRecordActionReceipt(
  ctx: Pick<MutationCtx, "db">,
  envelope: SignedEnvelope,
) {
  const existingByClientAction = await ctx.db
    .query("actionReceipts")
    .withIndex("by_client_action", (q) =>
      q
        .eq("gameEpoch", envelope.gameEpoch)
        .eq("actorAgentDid", envelope.actorAgentDid)
        .eq("actionType", envelope.actionType)
        .eq("clientActionId", envelope.clientActionId),
    )
    .unique();

  if (existingByClientAction) {
    throw new ConvexError("Duplicate clientActionId for this action.");
  }

  if (envelope.nonce) {
    const existingByNonce = await ctx.db
      .query("actionReceipts")
      .withIndex("by_actor_nonce", (q) =>
        q
          .eq("gameEpoch", envelope.gameEpoch)
          .eq("actorAgentDid", envelope.actorAgentDid)
          .eq("nonce", envelope.nonce),
      )
      .unique();

    if (existingByNonce) {
      throw new ConvexError("Duplicate nonce for this actor.");
    }
  }

  await ctx.db.insert("actionReceipts", {
    gameEpoch: envelope.gameEpoch,
    actorAgentDid: envelope.actorAgentDid,
    actionType: envelope.actionType,
    clientActionId: envelope.clientActionId,
    nonce: envelope.nonce,
    payloadHash: envelope.payloadHash,
    recordedAt: Date.now(),
  });
}
