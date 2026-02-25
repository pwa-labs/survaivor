import { ConvexError, v } from "convex/values";

import { mutation } from "../_generated/server";
import { getGlobalGameState } from "../game/state";
import { assertAndRecordActionReceipt } from "../lib/idempotency";
import { verifySignedEnvelope } from "../lib/identity";
import { signedEnvelopeValidator } from "../lib/validators";

export const revealPrivateMessages = mutation({
  args: {
    envelope: signedEnvelopeValidator,
    referencedHashes: v.array(v.string()),
    content: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.envelope.actionType !== "reveal") {
      throw new ConvexError("Envelope actionType must be reveal.");
    }
    if (args.referencedHashes.length === 0) {
      throw new ConvexError("At least one referenced private message hash is required.");
    }

    const verification = await verifySignedEnvelope(args.envelope);
    if (!verification.ok) {
      throw new ConvexError(verification.reason ?? "Invalid signature.");
    }

    const gameState = await getGlobalGameState(ctx);
    if (!gameState.currentGameEpoch || !gameState.currentRound) {
      throw new ConvexError("No active game available for reveals.");
    }
    if (args.envelope.gameEpoch !== gameState.currentGameEpoch) {
      throw new ConvexError("Envelope gameEpoch does not match active game.");
    }
    if (args.envelope.round !== gameState.currentRound) {
      throw new ConvexError("Envelope round does not match active round.");
    }

    await assertAndRecordActionReceipt(ctx, args.envelope);

    const participant = await ctx.db
      .query("participants")
      .withIndex("by_game_epoch_agent_did", (q) =>
        q.eq("gameEpoch", args.envelope.gameEpoch).eq("agentDid", args.envelope.actorAgentDid),
      )
      .unique();
    if (!participant || participant.status !== "eliminated" || !participant.eliminatedAt) {
      throw new ConvexError("Only eliminated agents (ghosts) can reveal private messages.");
    }

    const receivedMessages = await ctx.db
      .query("messagesPrivate")
      .withIndex("by_game_epoch_recipient", (q) =>
        q
          .eq("gameEpoch", args.envelope.gameEpoch)
          .eq("recipientAgentDid", args.envelope.actorAgentDid),
      )
      .collect();
    const byHash = new Map(receivedMessages.map((message) => [message.payloadHash, message]));
    const targetMessages = args.referencedHashes
      .map((hash) => byHash.get(hash))
      .filter((message): message is (typeof receivedMessages)[number] => Boolean(message));

    if (targetMessages.length !== args.referencedHashes.length) {
      throw new ConvexError("One or more referenced private messages were not found.");
    }

    const now = Date.now();
    const ghostName = participant.avatarName;

    for (const message of targetMessages) {
      if (message.timestamp > participant.eliminatedAt) {
        throw new ConvexError("Ghost reveals can only include private messages received before elimination.");
      }

      const originalSender = await ctx.db
        .query("participants")
        .withIndex("by_game_epoch_agent_did", (q) =>
          q
            .eq("gameEpoch", args.envelope.gameEpoch)
            .eq("agentDid", message.actorAgentDid),
        )
        .unique();
      const senderName = originalSender?.avatarName ?? message.actorAgentDid;

      await ctx.db.insert("messagesPublic", {
        gameEpoch: args.envelope.gameEpoch,
        round: args.envelope.round,
        actionType: "reveal",
        actorAgentDid: args.envelope.actorAgentDid,
        payloadHash: message.payloadHash,
        timestamp: args.envelope.timestamp,
        clientActionId: `${args.envelope.clientActionId}:${message._id}`,
        nonce: args.envelope.nonce,
        signature: args.envelope.signature,
        content: `${senderName} whispered to ${ghostName}: ${message.content}`,
        messageType: "ghost_reveal",
        moderationStatus: "visible",
        revealSourceMessageId: message._id,
      });
      if (message.revealStatus !== "revealed") {
        await ctx.db.patch(message._id, {
          revealStatus: "revealed",
          revealedAt: now,
        });
      }
    }

    const revealId = await ctx.db.insert("reveals", {
      ...args.envelope,
      revealType: "elimination_payload",
      referencedHashes: args.referencedHashes,
      content: args.content,
    });

    return { revealId, revealedCount: targetMessages.length };
  },
});
