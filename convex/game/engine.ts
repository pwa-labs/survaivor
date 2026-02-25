import { ConvexError } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { ensureGlobalGameState } from "./state";
import { generateGameScenario } from "./theme";

const MAX_PARTICIPANTS_PER_GAME = 24;
const SYSTEM_ACTOR_DID = "system:survaivor";
const ALLOW_UNVERIFIED_OWNER_REGISTRATIONS_FLAG = "ALLOW_UNVERIFIED_OWNER_REGISTRATIONS";

type Phase = Doc<"gameState">["currentPhase"];

function parseBooleanEnvFlag(name: string, fallback = false) {
  const value = process.env[name];
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }
  return fallback;
}

async function getGameByEpochOrThrow(ctx: Pick<MutationCtx, "db">, gameEpoch: number) {
  const game = await ctx.db
    .query("games")
    .withIndex("by_game_epoch", (q) => q.eq("gameEpoch", gameEpoch))
    .unique();
  if (!game) {
    throw new ConvexError(`Game ${gameEpoch} not found.`);
  }
  return game;
}

async function getMaxGameEpoch(ctx: Pick<MutationCtx, "db">) {
  const games = await ctx.db.query("games").collect();
  return games.reduce((max, game) => Math.max(max, game.gameEpoch), 0);
}

async function transitionToPhase(
  ctx: Pick<MutationCtx, "db">,
  state: Doc<"gameState">,
  phase: Phase,
  now: number,
  phaseEndsAt: number,
  roundNumber?: number,
) {
  await ctx.db.patch(state._id, {
    currentPhase: phase,
    phaseStartedAt: now,
    phaseEndsAt,
    currentRound: roundNumber ?? state.currentRound,
    updatedAt: now,
  });
}

function nextTopOfHour(fromTs: number) {
  const d = new Date(fromTs);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(d.getUTCHours() + 1);
  return d.getTime();
}

async function startRoundDiscussion(
  ctx: Pick<MutationCtx, "db">,
  state: Doc<"gameState">,
  roundNumber: number,
  now: number,
) {
  if (!state.currentGameEpoch) {
    throw new ConvexError("Cannot start round without an active game.");
  }
  const phaseEndsAt = nextTopOfHour(now);
  await ctx.db.insert("rounds", {
    gameEpoch: state.currentGameEpoch,
    roundNumber,
    phase: "discussion",
    phaseStartedAt: now,
    phaseEndsAt,
  });
  await transitionToPhase(ctx, state, "discussion", now, phaseEndsAt, roundNumber);
}

async function getOrCreateDraftGameForSignup(ctx: Pick<MutationCtx, "db">, now: number) {
  const state = await ensureGlobalGameState(ctx);
  if (state.signupGameEpoch) {
    const existing = await ctx.db
      .query("games")
      .withIndex("by_game_epoch", (q) => q.eq("gameEpoch", state.signupGameEpoch!))
      .unique();
    if (existing && existing.status === "draft") {
      if (!existing.scenario) {
        const scenario = generateGameScenario(existing.gameEpoch);
        await ctx.db.patch(existing._id, { scenario: scenario.encoded });
      }
      return { state, gameEpoch: existing.gameEpoch };
    }
  }

  const nextEpoch = (await getMaxGameEpoch(ctx)) + 1;
  const scenario = generateGameScenario(nextEpoch);
  await ctx.db.insert("games", {
    gameEpoch: nextEpoch,
    status: "draft",
    scenario: scenario.encoded,
    draftedAt: now,
  });
  await ctx.db.patch(state._id, {
    signupGameEpoch: nextEpoch,
    updatedAt: now,
  });
  return { state, gameEpoch: nextEpoch };
}

export async function ensureSignupGameOpen(ctx: Pick<MutationCtx, "db">) {
  const now = Date.now();
  const { gameEpoch } = await getOrCreateDraftGameForSignup(ctx, now);
  return { gameEpoch };
}

export async function startDailyGameFromSignup(
  ctx: Pick<MutationCtx, "db">,
) {
  const now = Date.now();
  const state = await ensureGlobalGameState(ctx);
  if (state.currentGameEpoch) {
    throw new ConvexError("Cannot start a new game while one is currently running.");
  }
  const { gameEpoch: signupGameEpoch } = await getOrCreateDraftGameForSignup(ctx, now);

  const game = await getGameByEpochOrThrow(ctx, signupGameEpoch);
  const enforceOwnerHumanVerification = !parseBooleanEnvFlag(
    ALLOW_UNVERIFIED_OWNER_REGISTRATIONS_FLAG,
    false,
  );
  const queuedRegistrations = await ctx.db
    .query("registrations")
    .withIndex("by_game_epoch_status", (q) =>
      q.eq("gameEpoch", signupGameEpoch).eq("status", "queued"),
    )
    .collect();

  const accepted = queuedRegistrations
    .filter(
      (registration) =>
        (!enforceOwnerHumanVerification || registration.ownerHumanVerified) &&
        registration.minReputationPass &&
        !registration.duplicateFingerprintFlag,
    )
    .sort((a, b) => {
      if (a.requestedAt === b.requestedAt) return a.agentDid.localeCompare(b.agentDid);
      return a.requestedAt - b.requestedAt;
    })
    .slice(0, MAX_PARTICIPANTS_PER_GAME);

  if (accepted.length < 2) {
    await ctx.db.patch(game._id, {
      status: "cancelled",
      endedAt: now,
    });
    await ctx.db.patch(state._id, {
      currentPhase: "idle",
      currentGameEpoch: undefined,
      currentRound: undefined,
      phaseStartedAt: undefined,
      phaseEndsAt: undefined,
      updatedAt: now,
    });
    const { gameEpoch } = await getOrCreateDraftGameForSignup(ctx, now + 1);
    return {
      started: false as const,
      reason: "Not enough eligible participants.",
      signupGameEpoch: gameEpoch,
    };
  }

  for (const registration of queuedRegistrations) {
    const status = accepted.some((candidate) => candidate._id === registration._id)
      ? "accepted"
      : "rejected";
    await ctx.db.patch(registration._id, {
      status,
      resolvedAt: now,
      rejectionReason:
        status === "accepted"
          ? undefined
          : registration.duplicateFingerprintFlag
            ? "duplicate_fingerprint_flag"
            : enforceOwnerHumanVerification && !registration.ownerHumanVerified
              ? "owner_not_human_verified"
              : !registration.minReputationPass
                ? "min_reputation_not_met"
                : "ineligible",
    });
  }

  for (const registration of accepted) {
    await ctx.db.insert("participants", {
      gameEpoch: signupGameEpoch,
      agentDid: registration.agentDid,
      ownerDid: registration.ownerDid,
      avatarName: registration.avatarName,
      avatarPictureUrl: registration.avatarPictureUrl,
      avatarBackstory: registration.avatarBackstory,
      status: "active",
      joinedAt: now,
    });
  }

  await ctx.db.patch(game._id, {
    status: "active",
    startedAt: now,
  });

  await ctx.db.patch(state._id, {
    currentGameEpoch: signupGameEpoch,
    currentRound: 1,
    signupGameEpoch: undefined,
    updatedAt: now,
  });

  const refreshedState = await ensureGlobalGameState(ctx);
  await startRoundDiscussion(ctx, refreshedState, 1, now);

  const { gameEpoch: nextSignupGameEpoch } = await getOrCreateDraftGameForSignup(ctx, now + 1);
  return {
    started: true as const,
    currentGameEpoch: signupGameEpoch,
    signupGameEpoch: nextSignupGameEpoch,
  };
}

function topRankedCandidates(counts: Map<string, number>) {
  let max = Number.NEGATIVE_INFINITY;
  const candidates: string[] = [];
  for (const [did, count] of counts.entries()) {
    if (count > max) {
      max = count;
      candidates.length = 0;
      candidates.push(did);
      continue;
    }
    if (count === max) {
      candidates.push(did);
    }
  }
  return { candidates, maxCount: Number.isFinite(max) ? max : 0 };
}

function hashDeterministic(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicFallbackTieBreak(candidates: string[], gameEpoch: number, round: number) {
  return [...candidates].sort((a, b) => {
    const aHash = hashDeterministic(`${gameEpoch}:${round}:${a}`);
    const bHash = hashDeterministic(`${gameEpoch}:${round}:${b}`);
    if (aHash === bHash) return a.localeCompare(b);
    return aHash - bHash;
  })[0];
}

async function chooseEliminatedDid(
  ctx: Pick<MutationCtx, "db">,
  activeParticipants: Doc<"participants">[],
  votes: Doc<"votes">[],
  gameEpoch: number,
  round: number,
) {
  if (activeParticipants.length === 0) {
    throw new ConvexError("No active participants available for resolution.");
  }

  const activeDidSet = new Set(activeParticipants.map((participant) => participant.agentDid));
  const counts = new Map<string, number>();
  for (const participant of activeParticipants) counts.set(participant.agentDid, 0);

  for (const vote of votes) {
    if (activeDidSet.has(vote.targetAgentDid)) {
      counts.set(vote.targetAgentDid, (counts.get(vote.targetAgentDid) ?? 0) + 1);
    }
  }

  const survivorTop = topRankedCandidates(counts);
  if (survivorTop.candidates.length === 1) {
    return {
      eliminatedDid: survivorTop.candidates[0],
      tieBreakSource: "survivor_votes" as const,
      voteCount: survivorTop.maxCount,
    };
  }

  const ghostVotes = await ctx.db
    .query("ghostTieVotes")
    .withIndex("by_game_epoch_round_cast_at", (q) =>
      q.eq("gameEpoch", gameEpoch).eq("round", round),
    )
    .collect();
  const ghostCounts = new Map<string, number>();
  for (const did of survivorTop.candidates) ghostCounts.set(did, 0);
  for (const vote of ghostVotes) {
    if (ghostCounts.has(vote.targetAgentDid)) {
      ghostCounts.set(vote.targetAgentDid, (ghostCounts.get(vote.targetAgentDid) ?? 0) + 1);
    }
  }
  const ghostTop = topRankedCandidates(ghostCounts);
  if (ghostTop.candidates.length === 1) {
    return {
      eliminatedDid: ghostTop.candidates[0],
      tieBreakSource: "ghost_votes" as const,
      voteCount: survivorTop.maxCount,
    };
  }

  const historicalVotes = (
    await ctx.db
      .query("votes")
      .withIndex("by_game_epoch_round_cast_at", (q) =>
        q.eq("gameEpoch", gameEpoch).lt("round", round),
      )
      .collect()
  ).filter((vote) => survivorTop.candidates.includes(vote.targetAgentDid));
  const historicalCounts = new Map<string, number>();
  for (const did of survivorTop.candidates) historicalCounts.set(did, 0);
  for (const vote of historicalVotes) {
    historicalCounts.set(vote.targetAgentDid, (historicalCounts.get(vote.targetAgentDid) ?? 0) + 1);
  }
  const historicalTop = topRankedCandidates(historicalCounts);
  if (historicalTop.candidates.length === 1) {
    return {
      eliminatedDid: historicalTop.candidates[0],
      tieBreakSource: "historical_votes" as const,
      voteCount: survivorTop.maxCount,
    };
  }

  return {
    eliminatedDid: deterministicFallbackTieBreak(survivorTop.candidates, gameEpoch, round),
    tieBreakSource: "deterministic_fallback" as const,
    voteCount: survivorTop.maxCount,
  };
}

async function emitRoundResultEvent(
  ctx: Pick<MutationCtx, "db">,
  input: {
    gameEpoch: number;
    round: number;
    eliminatedDid: string;
    eliminatedAvatarName: string;
    voteCount: number;
    tieBreakSource:
      | "survivor_votes"
      | "ghost_votes"
      | "historical_votes"
      | "deterministic_fallback";
    timestamp: number;
  },
) {
  const tieBreakText =
    input.tieBreakSource === "survivor_votes"
      ? ""
      : input.tieBreakSource === "ghost_votes"
        ? " Ghost tie-break votes decided the tie."
        : input.tieBreakSource === "historical_votes"
          ? " Historical vote pressure decided the tie."
          : " Deterministic protocol fallback decided the tie.";
  await ctx.db.insert("messagesPublic", {
    gameEpoch: input.gameEpoch,
    round: input.round,
    actionType: "system_event",
    actorAgentDid: SYSTEM_ACTOR_DID,
    payloadHash: `system:round_result:${input.gameEpoch}:${input.round}:${input.eliminatedDid}`,
    timestamp: input.timestamp,
    clientActionId: `system:round_result:${input.gameEpoch}:${input.round}`,
    nonce: `system:round_result:${input.gameEpoch}:${input.round}`,
    signature: "system",
    content: `Round ${input.round} ended. ${input.eliminatedAvatarName} was eliminated with ${input.voteCount} vote(s).${tieBreakText}`,
    messageType: "round_result",
    moderationStatus: "visible",
  });
}

async function emitWinnerEvent(
  ctx: Pick<MutationCtx, "db">,
  input: {
    gameEpoch: number;
    round: number;
    winnerDid: string;
    winnerAvatarName: string;
    timestamp: number;
  },
) {
  await ctx.db.insert("messagesPublic", {
    gameEpoch: input.gameEpoch,
    round: input.round,
    actionType: "system_event",
    actorAgentDid: SYSTEM_ACTOR_DID,
    payloadHash: `system:winner:${input.gameEpoch}:${input.winnerDid}`,
    timestamp: input.timestamp,
    clientActionId: `system:winner:${input.gameEpoch}`,
    nonce: `system:winner:${input.gameEpoch}`,
    signature: "system",
    content: `${input.winnerAvatarName} won game ${input.gameEpoch}.`,
    messageType: "winner_event",
    moderationStatus: "visible",
  });
}

export async function resolveVotingWindow(
  ctx: Pick<MutationCtx, "db">,
) {
  const now = Date.now();
  const state = await ensureGlobalGameState(ctx);
  if (!state.currentGameEpoch || !state.currentRound) {
    return { resolved: false as const, reason: "No active game." };
  }
  if (state.currentPhase !== "discussion") {
    return {
      resolved: false as const,
      reason: `Cannot resolve from phase ${state.currentPhase}.`,
    };
  }
  if (!state.phaseEndsAt || now < state.phaseEndsAt) {
    return {
      resolved: false as const,
      reason: "Round is still active.",
    };
  }

  const activeParticipants = await ctx.db
    .query("participants")
    .withIndex("by_game_epoch_status", (q) =>
      q.eq("gameEpoch", state.currentGameEpoch!).eq("status", "active"),
    )
    .collect();

  if (activeParticipants.length < 2) {
    throw new ConvexError("Resolution requires at least two active participants.");
  }

  const votes = await ctx.db
    .query("votes")
    .withIndex("by_game_epoch_round_cast_at", (q) =>
      q.eq("gameEpoch", state.currentGameEpoch!).eq("round", state.currentRound!),
    )
    .collect();
  const voters = new Set(votes.map((vote) => vote.actorAgentDid));
  const noVoteDids = activeParticipants
    .map((participant) => participant.agentDid)
    .filter((did) => !voters.has(did));

  const elimination = await chooseEliminatedDid(
    ctx,
    activeParticipants,
    votes,
    state.currentGameEpoch,
    state.currentRound,
  );
  const eliminatedDid = elimination.eliminatedDid;
  const eliminated = activeParticipants.find((participant) => participant.agentDid === eliminatedDid);
  if (!eliminated) {
    throw new ConvexError("Failed to resolve eliminated participant.");
  }

  await ctx.db.patch(eliminated._id, {
    status: "eliminated",
    eliminatedAt: now,
  });
  await emitRoundResultEvent(ctx, {
    gameEpoch: state.currentGameEpoch,
    round: state.currentRound,
    eliminatedDid,
    eliminatedAvatarName: eliminated.avatarName,
    voteCount: elimination.voteCount,
    tieBreakSource: elimination.tieBreakSource,
    timestamp: now,
  });

  const round = await ctx.db
    .query("rounds")
    .withIndex("by_game_epoch_round", (q) =>
      q.eq("gameEpoch", state.currentGameEpoch!).eq("roundNumber", state.currentRound!),
    )
    .unique();
  if (!round) {
    throw new ConvexError("Active round record missing during resolution.");
  }
  await ctx.db.patch(round._id, {
    phase: "resolution",
    resolvedAt: now,
    eliminatedAgentDid: eliminatedDid,
  });

  const remainingActive = await ctx.db
    .query("participants")
    .withIndex("by_game_epoch_status", (q) =>
      q.eq("gameEpoch", state.currentGameEpoch!).eq("status", "active"),
    )
    .collect();

  if (remainingActive.length === 1) {
    const winner = remainingActive[0];
    await ctx.db.patch(winner._id, {
      status: "winner",
    });

    const game = await getGameByEpochOrThrow(ctx, state.currentGameEpoch);
    await ctx.db.patch(game._id, {
      status: "completed",
      endedAt: now,
      winnerDid: winner.agentDid,
      totalRounds: state.currentRound,
    });

    await ctx.db.patch(state._id, {
      currentPhase: "idle",
      currentGameEpoch: undefined,
      currentRound: undefined,
      phaseStartedAt: undefined,
      phaseEndsAt: undefined,
      updatedAt: now,
    });
    await emitWinnerEvent(ctx, {
      gameEpoch: state.currentGameEpoch,
      round: state.currentRound,
      winnerDid: winner.agentDid,
      winnerAvatarName: winner.avatarName,
      timestamp: now,
    });

    return {
      resolved: true as const,
      completed: true as const,
      gameEpoch: state.currentGameEpoch,
      round: state.currentRound,
      winnerDid: winner.agentDid,
      eliminatedDid,
      noVoteDids,
    };
  }

  const nextRound = state.currentRound + 1;
  await startRoundDiscussion(ctx, state, nextRound, now);
  return {
    resolved: true as const,
    completed: false as const,
    gameEpoch: state.currentGameEpoch,
    round: state.currentRound,
    eliminatedDid,
    nextRound,
    noVoteDids,
  };
}

export async function reconcileState(ctx: Pick<MutationCtx, "db">) {
  const now = Date.now();
  const { gameEpoch } = await getOrCreateDraftGameForSignup(ctx, now);
  const state = await ensureGlobalGameState(ctx);

  if (!state.signupGameEpoch) {
    await ctx.db.patch(state._id, { signupGameEpoch: gameEpoch, updatedAt: now });
  }

  return {
    currentGameEpoch: state.currentGameEpoch ?? null,
    currentRound: state.currentRound ?? null,
    signupGameEpoch: state.signupGameEpoch ?? gameEpoch,
    phase: state.currentPhase,
  };
}
