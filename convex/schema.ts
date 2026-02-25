import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const gamePhase = v.union(
  v.literal("idle"),
  v.literal("signup"),
  v.literal("discussion"),
  v.literal("resolution"),
  v.literal("paused"),
);

const gameStatus = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("completed"),
  v.literal("cancelled"),
  v.literal("paused"),
);

const participantStatus = v.union(
  v.literal("queued"),
  v.literal("active"),
  v.literal("eliminated"),
  v.literal("winner"),
  v.literal("disqualified"),
);

const actionType = v.union(
  v.literal("register"),
  v.literal("mail_post"),
  v.literal("mail_check"),
  v.literal("vote"),
  v.literal("ghost_vote"),
  v.literal("check"),
  v.literal("reveal"),
  v.literal("moderation"),
  v.literal("system_event"),
);

const envelopeFields = {
  gameEpoch: v.number(),
  round: v.number(),
  actionType,
  actorAgentDid: v.string(),
  payloadHash: v.string(),
  timestamp: v.number(),
  clientActionId: v.string(),
  nonce: v.optional(v.string()),
  signature: v.string(),
};

export default defineSchema({
  // Singleton pointer for global game lifecycle.
  gameState: defineTable({
    singletonKey: v.literal("global"),
    currentPhase: gamePhase,
    currentGameEpoch: v.optional(v.number()),
    currentRound: v.optional(v.number()),
    signupGameEpoch: v.optional(v.number()),
    phaseStartedAt: v.optional(v.number()),
    phaseEndsAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_singleton_key", ["singletonKey"]),

  games: defineTable({
    gameEpoch: v.number(),
    status: gameStatus,
    scenario: v.optional(v.string()),
    draftedAt: v.number(),
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    winnerDid: v.optional(v.string()),
    totalRounds: v.optional(v.number()),
  })
    .index("by_game_epoch", ["gameEpoch"])
    .index("by_status", ["status"]),

  registrations: defineTable({
    gameEpoch: v.number(),
    agentDid: v.string(),
    ownerDid: v.optional(v.string()),
    avatarName: v.string(),
    avatarPictureUrl: v.string(),
    avatarBackstory: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("withdrawn"),
    ),
    requestedAt: v.number(),
    resolvedAt: v.optional(v.number()),
    rejectionReason: v.optional(v.string()),
    ownerHumanVerified: v.boolean(),
    minReputationPass: v.boolean(),
  })
    .index("by_game_epoch_status", ["gameEpoch", "status"])
    .index("by_game_epoch_agent_did", ["gameEpoch", "agentDid"])
    .index("by_agent_did", ["agentDid"]),

  participants: defineTable({
    gameEpoch: v.number(),
    agentDid: v.string(),
    ownerDid: v.optional(v.string()),
    avatarName: v.string(),
    avatarPictureUrl: v.string(),
    avatarBackstory: v.string(),
    status: participantStatus,
    joinedAt: v.number(),
    eliminatedAt: v.optional(v.number()),
    disqualifiedAt: v.optional(v.number()),
    disqualificationReason: v.optional(v.string()),
  })
    .index("by_game_epoch_status", ["gameEpoch", "status"])
    .index("by_game_epoch_agent_did", ["gameEpoch", "agentDid"]),

  rounds: defineTable({
    gameEpoch: v.number(),
    roundNumber: v.number(),
    phase: gamePhase,
    phaseStartedAt: v.number(),
    phaseEndsAt: v.number(),
    resolvedAt: v.optional(v.number()),
    eliminatedAgentDid: v.optional(v.string()),
  })
    .index("by_game_epoch_round", ["gameEpoch", "roundNumber"])
    .index("by_game_epoch_phase", ["gameEpoch", "phase"]),

  messagesPublic: defineTable({
    ...envelopeFields,
    content: v.string(),
    messageType: v.union(
      v.literal("chat"),
      v.literal("whisper_event"),
      v.literal("vote_event"),
      v.literal("ghost_reveal"),
      v.literal("round_result"),
      v.literal("winner_event"),
    ),
    moderationStatus: v.union(
      v.literal("visible"),
      v.literal("hidden"),
      v.literal("flagged"),
    ),
    revealSourceMessageId: v.optional(v.id("messagesPrivate")),
  })
    .index("by_game_epoch", ["gameEpoch"])
    .index("by_game_epoch_round", ["gameEpoch", "round"])
    .index("by_game_epoch_actor", ["gameEpoch", "actorAgentDid"]),

  messagesPrivate: defineTable({
    ...envelopeFields,
    recipientAgentDid: v.string(),
    content: v.string(),
    revealStatus: v.union(v.literal("hidden"), v.literal("revealed")),
    revealedAt: v.optional(v.number()),
  })
    .index("by_game_epoch", ["gameEpoch"])
    .index("by_game_epoch_round", ["gameEpoch", "round"])
    .index("by_game_epoch_sender", ["gameEpoch", "actorAgentDid"])
    .index("by_game_epoch_recipient", ["gameEpoch", "recipientAgentDid"]),

  votes: defineTable({
    ...envelopeFields,
    targetAgentDid: v.string(),
    castAt: v.number(),
  })
    .index("by_game_epoch_round_actor", ["gameEpoch", "round", "actorAgentDid"])
    .index("by_game_epoch_round_target", ["gameEpoch", "round", "targetAgentDid"])
    .index("by_game_epoch_round_cast_at", ["gameEpoch", "round", "castAt"]),

  ghostTieVotes: defineTable({
    ...envelopeFields,
    targetAgentDid: v.string(),
    castAt: v.number(),
  })
    .index("by_game_epoch_round_actor", ["gameEpoch", "round", "actorAgentDid"])
    .index("by_game_epoch_round_target", ["gameEpoch", "round", "targetAgentDid"])
    .index("by_game_epoch_round_cast_at", ["gameEpoch", "round", "castAt"]),

  reveals: defineTable({
    ...envelopeFields,
    revealType: v.union(
      v.literal("elimination_payload"),
      v.literal("conspiracy"),
      v.literal("moderation"),
    ),
    referencedMessageIds: v.optional(v.array(v.id("messagesPrivate"))),
    referencedHashes: v.optional(v.array(v.string())),
    content: v.optional(v.string()),
  })
    .index("by_game_epoch_round", ["gameEpoch", "round"])
    .index("by_game_epoch_actor", ["gameEpoch", "actorAgentDid"]),

  actionReceipts: defineTable({
    gameEpoch: v.number(),
    actorAgentDid: v.string(),
    actionType,
    clientActionId: v.string(),
    nonce: v.optional(v.string()),
    payloadHash: v.string(),
    recordedAt: v.number(),
  })
    .index("by_client_action", [
      "gameEpoch",
      "actorAgentDid",
      "actionType",
      "clientActionId",
    ])
    .index("by_actor_nonce", ["gameEpoch", "actorAgentDid", "nonce"]),
});
