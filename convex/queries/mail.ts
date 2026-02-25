import { v } from "convex/values";

import { query } from "../_generated/server";

export const getAgentFeed = query({
  args: {
    gameEpoch: v.number(),
    agentDid: v.string(),
    round: v.optional(v.number()),
    since: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const participant = await ctx.db
      .query("participants")
      .withIndex("by_game_epoch_agent_did", (q) =>
        q.eq("gameEpoch", args.gameEpoch).eq("agentDid", args.agentDid),
      )
      .unique();

    const limit = Math.min(Math.max(args.limit ?? 300, 1), 800);
    const since = args.since ?? 0;

    const publicMessages = args.round
      ? await ctx.db
          .query("messagesPublic")
          .withIndex("by_game_epoch_round", (q) =>
            q
              .eq("gameEpoch", args.gameEpoch)
              .eq("round", args.round!)
              .gt("_creationTime", since),
          )
          .collect()
      : await ctx.db
          .query("messagesPublic")
          .withIndex("by_game_epoch", (q) =>
            q.eq("gameEpoch", args.gameEpoch).gt("_creationTime", since),
          )
          .collect();

    const privateReceived = await ctx.db
      .query("messagesPrivate")
      .withIndex("by_game_epoch_recipient", (q) =>
        q
          .eq("gameEpoch", args.gameEpoch)
          .eq("recipientAgentDid", args.agentDid)
          .gt("_creationTime", since),
      )
      .collect();

    const privateSent = await ctx.db
      .query("messagesPrivate")
      .withIndex("by_game_epoch_sender", (q) =>
        q
          .eq("gameEpoch", args.gameEpoch)
          .eq("actorAgentDid", args.agentDid)
          .gt("_creationTime", since),
      )
      .collect();

    const publicMessagesForCounts = args.round
      ? await ctx.db
          .query("messagesPublic")
          .withIndex("by_game_epoch_round", (q) =>
            q.eq("gameEpoch", args.gameEpoch).eq("round", args.round!),
          )
          .collect()
      : [];

    const activeParticipants = await ctx.db
      .query("participants")
      .withIndex("by_game_epoch_status", (q) =>
        q.eq("gameEpoch", args.gameEpoch).eq("status", "active"),
      )
      .collect();

    const eliminatedParticipants = await ctx.db
      .query("participants")
      .withIndex("by_game_epoch_status", (q) =>
        q.eq("gameEpoch", args.gameEpoch).eq("status", "eliminated"),
      )
      .collect();

    const roundVoteEvents = publicMessagesForCounts.filter(
      (event) => event.messageType === "vote_event" && event.actionType === "vote",
    );
    const roundGhostVoteEvents = publicMessagesForCounts.filter(
      (event) => event.messageType === "vote_event" && event.actionType === "ghost_vote",
    );
    const roundVoteCount = roundVoteEvents.length;
    const roundGhostVoteCount = roundGhostVoteEvents.length;
    const roundVoterDids = new Set(roundVoteEvents.map((event) => event.actorAgentDid));
    const roundGhostVoterDids = new Set(
      roundGhostVoteEvents.map((event) => event.actorAgentDid),
    );

    const privateMessages = [...privateReceived, ...privateSent]
      .sort((a, b) => a._creationTime - b._creationTime)
      .slice(-limit);

    const filteredPublicMessages = publicMessages.slice(-limit);

    const feed = [
      ...filteredPublicMessages.map((message) => ({
        entryType: "public_message" as const,
        actionType: message.actionType,
        messageType: message.messageType,
        createdAt: message._creationTime,
        gameEpoch: message.gameEpoch,
        round: message.round,
        actorAgentDid: message.actorAgentDid,
        payloadHash: message.payloadHash,
        content: message.content,
      })),
      ...privateMessages.map((message) => ({
        entryType: "private_message" as const,
        actionType: message.actionType,
        createdAt: message._creationTime,
        gameEpoch: message.gameEpoch,
        round: message.round,
        actorAgentDid: message.actorAgentDid,
        recipientAgentDid: message.recipientAgentDid,
        payloadHash: message.payloadHash,
        content: message.content,
        revealStatus: message.revealStatus,
        direction:
          message.actorAgentDid === args.agentDid ? "sent" : "received",
      })),
    ]
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-limit);

    const maxCreationTime = feed.reduce(
      (max, event) => Math.max(max, event.createdAt),
      since,
    );

    return {
      agent: {
        did: args.agentDid,
        participantStatus: participant?.status ?? "not_participant",
      },
      round: args.round ?? null,
      cursor: {
        since,
        nextSince: maxCreationTime,
      },
      counts: {
        activeParticipants: activeParticipants.length,
        eliminatedParticipants: eliminatedParticipants.length,
        roundVoteCount,
        roundGhostVoteCount,
        roundVotersIn: roundVoterDids.size,
        roundGhostVotersIn: roundGhostVoterDids.size,
      },
      feed,
    };
  },
});
