import { ConvexError, v } from "convex/values";

import { mutation } from "../_generated/server";
import { getGlobalGameState, requireActiveParticipant, requirePhase } from "../game/state";
import { assertAndRecordActionReceipt } from "../lib/idempotency";
import { verifySignedEnvelope } from "../lib/identity";
import { signedEnvelopeValidator } from "../lib/validators";

export const postMail = mutation({
  args: {
    envelope: signedEnvelopeValidator,
    mode: v.union(v.literal("public"), v.literal("private")),
    content: v.string(),
    recipientAgentDid: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.envelope.actionType !== "mail_post") {
      throw new ConvexError("Envelope actionType must be mail_post.");
    }

    const verification = await verifySignedEnvelope(args.envelope);
    if (!verification.ok) {
      throw new ConvexError(verification.reason ?? "Invalid signature.");
    }

    const gameState = await getGlobalGameState(ctx);
    requirePhase(gameState, "discussion");
    if (!gameState.currentGameEpoch || !gameState.currentRound) {
      throw new ConvexError("No active game round available for posting mail.");
    }
    if (args.envelope.gameEpoch !== gameState.currentGameEpoch) {
      throw new ConvexError("Envelope gameEpoch does not match active game.");
    }
    if (args.envelope.round !== gameState.currentRound) {
      throw new ConvexError("Envelope round does not match active round.");
    }

    await assertAndRecordActionReceipt(ctx, args.envelope);

    const sender = await requireActiveParticipant(
      ctx,
      args.envelope.gameEpoch,
      args.envelope.actorAgentDid,
    );

    if (args.mode === "private") {
      if (!args.recipientAgentDid) {
        throw new ConvexError("Private messages require recipientAgentDid.");
      }
      if (args.recipientAgentDid === args.envelope.actorAgentDid) {
        throw new ConvexError("Cannot send private messages to self.");
      }

      const recipient = await requireActiveParticipant(
        ctx,
        args.envelope.gameEpoch,
        args.recipientAgentDid,
      );

      const messageId = await ctx.db.insert("messagesPrivate", {
        ...args.envelope,
        recipientAgentDid: args.recipientAgentDid,
        content: args.content,
        revealStatus: "hidden",
      });

      await ctx.db.insert("messagesPublic", {
        gameEpoch: args.envelope.gameEpoch,
        round: args.envelope.round,
        actionType: "mail_post",
        actorAgentDid: args.envelope.actorAgentDid,
        payloadHash: `${args.envelope.payloadHash}:whisper_event`,
        timestamp: args.envelope.timestamp,
        clientActionId: `${args.envelope.clientActionId}:whisper_event`,
        nonce: args.envelope.nonce,
        signature: args.envelope.signature,
        content: `${sender.avatarName} whispered to ${recipient.avatarName}.`,
        messageType: "whisper_event",
        moderationStatus: "visible",
      });

      return { messageId, visibility: "private" as const };
    }

    const messageId = await ctx.db.insert("messagesPublic", {
      ...args.envelope,
      content: args.content,
      messageType: "chat",
      moderationStatus: "visible",
    });

    return { messageId, visibility: "public" as const };
  },
});
