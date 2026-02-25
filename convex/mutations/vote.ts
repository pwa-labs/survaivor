import { ConvexError, v } from "convex/values";

import type { MutationCtx } from "../_generated/server";
import { mutation } from "../_generated/server";
import { getGlobalGameState, requireActiveParticipant, requirePhase } from "../game/state";
import { assertAndRecordActionReceipt } from "../lib/idempotency";
import { verifySignedEnvelope } from "../lib/identity";
import { signedEnvelopeValidator } from "../lib/validators";

async function requireEliminatedParticipant(
  ctx: Pick<MutationCtx, "db">,
  gameEpoch: number,
  agentDid: string,
) {
  const participant = await ctx.db
    .query("participants")
    .withIndex("by_game_epoch_agent_did", (q) =>
      q.eq("gameEpoch", gameEpoch).eq("agentDid", agentDid),
    )
    .unique();

  if (!participant || participant.status !== "eliminated") {
    throw new ConvexError("Only eliminated agents (ghosts) can cast ghost tie-break votes.");
  }
  return participant;
}

async function getParticipantByDid(
  ctx: Pick<MutationCtx, "db">,
  gameEpoch: number,
  agentDid: string,
) {
  const participant = await ctx.db
    .query("participants")
    .withIndex("by_game_epoch_agent_did", (q) =>
      q.eq("gameEpoch", gameEpoch).eq("agentDid", agentDid),
    )
    .unique();

  if (!participant) {
    throw new ConvexError("Agent is not a participant in this game.");
  }
  return participant;
}

export const castVote = mutation({
  args: {
    envelope: signedEnvelopeValidator,
    targetAgentDid: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.envelope.actionType !== "vote") {
      throw new ConvexError("Envelope actionType must be vote.");
    }

    const verification = await verifySignedEnvelope(args.envelope);
    if (!verification.ok) {
      throw new ConvexError(verification.reason ?? "Invalid signature.");
    }

    const gameState = await getGlobalGameState(ctx);
    requirePhase(gameState, "discussion");
    if (!gameState.currentGameEpoch || !gameState.currentRound) {
      throw new ConvexError("No active game round available for voting.");
    }
    if (args.envelope.gameEpoch !== gameState.currentGameEpoch) {
      throw new ConvexError("Envelope gameEpoch does not match active game.");
    }
    if (args.envelope.round !== gameState.currentRound) {
      throw new ConvexError("Envelope round does not match active round.");
    }

    await assertAndRecordActionReceipt(ctx, args.envelope);

    if (args.targetAgentDid === args.envelope.actorAgentDid) {
      throw new ConvexError("Self-votes are not allowed.");
    }

    const actorParticipant = await getParticipantByDid(
      ctx,
      args.envelope.gameEpoch,
      args.envelope.actorAgentDid,
    );
    await requireActiveParticipant(ctx, args.envelope.gameEpoch, args.targetAgentDid);

    if (actorParticipant.status === "active") {
      const existing = await ctx.db
        .query("votes")
        .withIndex("by_game_epoch_round_actor", (q) =>
          q
            .eq("gameEpoch", args.envelope.gameEpoch)
            .eq("round", args.envelope.round)
            .eq("actorAgentDid", args.envelope.actorAgentDid),
        )
        .unique();

      if (existing) {
        throw new ConvexError("Agent has already voted this round.");
      }

      const voteId = await ctx.db.insert("votes", {
        ...args.envelope,
        actionType: "vote",
        targetAgentDid: args.targetAgentDid,
        castAt: args.envelope.timestamp,
      });

      await ctx.db.insert("messagesPublic", {
        gameEpoch: args.envelope.gameEpoch,
        round: args.envelope.round,
        actionType: "vote",
        actorAgentDid: args.envelope.actorAgentDid,
        payloadHash: `${args.envelope.payloadHash}:vote_event`,
        timestamp: args.envelope.timestamp,
        clientActionId: `${args.envelope.clientActionId}:vote_event`,
        nonce: args.envelope.nonce,
        signature: args.envelope.signature,
        content: `${actorParticipant.avatarName} cast a vote.`,
        messageType: "vote_event",
        moderationStatus: "visible",
      });

      return { voteId };
    }

    if (actorParticipant.status !== "eliminated") {
      throw new ConvexError("Only active or eliminated participants can cast votes.");
    }

    const existingGhostVote = await ctx.db
      .query("ghostTieVotes")
      .withIndex("by_game_epoch_round_actor", (q) =>
        q
          .eq("gameEpoch", args.envelope.gameEpoch)
          .eq("round", args.envelope.round)
          .eq("actorAgentDid", args.envelope.actorAgentDid),
      )
      .unique();
    if (existingGhostVote) {
      throw new ConvexError("Ghost has already cast a tie-break vote this round.");
    }

    const ghost = await requireEliminatedParticipant(
      ctx,
      args.envelope.gameEpoch,
      args.envelope.actorAgentDid,
    );
    const voteId = await ctx.db.insert("ghostTieVotes", {
      ...args.envelope,
      actionType: "ghost_vote",
      targetAgentDid: args.targetAgentDid,
      castAt: args.envelope.timestamp,
    });

    await ctx.db.insert("messagesPublic", {
      gameEpoch: args.envelope.gameEpoch,
      round: args.envelope.round,
      actionType: "ghost_vote",
      actorAgentDid: args.envelope.actorAgentDid,
      payloadHash: `${args.envelope.payloadHash}:ghost_vote_event`,
      timestamp: args.envelope.timestamp,
      clientActionId: `${args.envelope.clientActionId}:ghost_vote_event`,
      nonce: args.envelope.nonce,
      signature: args.envelope.signature,
      content: `${ghost.avatarName} (ghost) cast a tie-break vote.`,
      messageType: "vote_event",
      moderationStatus: "visible",
    });

    return { voteId };
  },
});
