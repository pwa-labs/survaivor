import { ConvexError, v } from "convex/values";

import { mutation } from "../_generated/server";
import { getGlobalGameState } from "../game/state";
import { assertAndRecordActionReceipt } from "../lib/idempotency";
import { verifySignedEnvelope } from "../lib/identity";
import { registerSignedPayloadValidator, signedEnvelopeValidator } from "../lib/validators";

export const register = mutation({
  args: {
    envelope: signedEnvelopeValidator,
    signedPayload: registerSignedPayloadValidator,
    ownerDid: v.optional(v.string()),
    avatarName: v.string(),
    avatarPictureUrl: v.string(),
    avatarBackstory: v.string(),
    ownerHumanVerified: v.boolean(),
    minReputationPass: v.boolean(),
    duplicateFingerprintFlag: v.optional(v.boolean()),
    reputationScore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (args.envelope.actionType !== "register") {
      throw new ConvexError("Envelope actionType must be register.");
    }

    if (!args.avatarName.trim()) {
      throw new ConvexError("avatarName is required.");
    }
    if (!args.avatarPictureUrl.trim()) {
      throw new ConvexError("avatarPictureUrl is required.");
    }
    if (!args.avatarBackstory.trim()) {
      throw new ConvexError("avatarBackstory is required.");
    }
    try {
      const parsedUrl = new URL(args.avatarPictureUrl);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        throw new ConvexError("avatarPictureUrl must be an http(s) URL.");
      }
    } catch {
      throw new ConvexError("avatarPictureUrl must be a valid URL.");
    }

    if (
      args.signedPayload.gameEpoch !== args.envelope.gameEpoch ||
      args.signedPayload.round !== args.envelope.round ||
      args.signedPayload.actionType !== args.envelope.actionType ||
      args.signedPayload.actorAgentDid !== args.envelope.actorAgentDid ||
      args.signedPayload.clientActionId !== args.envelope.clientActionId ||
      args.signedPayload.timestamp !== args.envelope.timestamp ||
      args.signedPayload.ownerDid !== args.ownerDid ||
      args.signedPayload.avatarName !== args.avatarName ||
      args.signedPayload.avatarPictureUrl !== args.avatarPictureUrl ||
      args.signedPayload.avatarBackstory !== args.avatarBackstory
    ) {
      throw new ConvexError("Signed payload does not match envelope fields.");
    }

    const verification = await verifySignedEnvelope(args.envelope, {
      signedPayload: args.signedPayload,
      expectedDid: args.envelope.actorAgentDid,
    });
    if (!verification.ok) {
      throw new ConvexError(verification.reason ?? "Invalid signature.");
    }

    const gameState = await getGlobalGameState(ctx);
    if (!gameState.signupGameEpoch) {
      throw new ConvexError("No active signup game is available.");
    }
    if (args.envelope.gameEpoch !== gameState.signupGameEpoch) {
      throw new ConvexError("Envelope gameEpoch does not match active signup game.");
    }

    await assertAndRecordActionReceipt(ctx, args.envelope);

    const existing = await ctx.db
      .query("registrations")
      .withIndex("by_game_epoch_agent_did", (q) =>
        q.eq("gameEpoch", args.envelope.gameEpoch).eq("agentDid", args.envelope.actorAgentDid),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ownerDid: args.ownerDid,
        avatarName: args.avatarName,
        avatarPictureUrl: args.avatarPictureUrl,
        avatarBackstory: args.avatarBackstory,
        ownerHumanVerified: args.ownerHumanVerified,
        minReputationPass: args.minReputationPass,
        duplicateFingerprintFlag: args.duplicateFingerprintFlag,
        reputationScore: args.reputationScore,
      });
      return { registrationId: existing._id, updated: true };
    }

    const registrationId = await ctx.db.insert("registrations", {
      gameEpoch: args.envelope.gameEpoch,
      agentDid: args.envelope.actorAgentDid,
      ownerDid: args.ownerDid,
      avatarName: args.avatarName,
      avatarPictureUrl: args.avatarPictureUrl,
      avatarBackstory: args.avatarBackstory,
      status: "queued",
      requestedAt: args.envelope.timestamp,
      ownerHumanVerified: args.ownerHumanVerified,
      minReputationPass: args.minReputationPass,
      duplicateFingerprintFlag: args.duplicateFingerprintFlag,
      reputationScore: args.reputationScore,
    });

    return { registrationId, updated: false };
  },
});
