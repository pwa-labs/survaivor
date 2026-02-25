import { v } from "convex/values";

import { query } from "../_generated/server";
import { getGlobalGameState } from "../game/state";
import { parseGameScenario } from "../game/theme";

export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const gameState = await getGlobalGameState(ctx);
    const gameEpoch = gameState.currentGameEpoch;
    const round = gameState.currentRound;

    const signupGame = gameState.signupGameEpoch
      ? await ctx.db
          .query("games")
          .withIndex("by_game_epoch", (q) => q.eq("gameEpoch", gameState.signupGameEpoch!))
          .unique()
      : null;

    const game = gameEpoch
      ? await ctx.db
          .query("games")
          .withIndex("by_game_epoch", (q) => q.eq("gameEpoch", gameEpoch))
          .unique()
      : null;

    const activeParticipants = gameEpoch
      ? await ctx.db
          .query("participants")
          .withIndex("by_game_epoch_status", (q) =>
            q.eq("gameEpoch", gameEpoch).eq("status", "active"),
          )
          .collect()
      : [];

    const voteCount = gameEpoch && round
      ? (
          await ctx.db
            .query("votes")
            .withIndex("by_game_epoch_round_cast_at", (q) =>
              q.eq("gameEpoch", gameEpoch).eq("round", round),
            )
            .collect()
        ).length
      : 0;

    const ghostVoteCount = gameEpoch && round
      ? (
          await ctx.db
            .query("ghostTieVotes")
            .withIndex("by_game_epoch_round_cast_at", (q) =>
              q.eq("gameEpoch", gameEpoch).eq("round", round),
            )
            .collect()
        ).length
      : 0;

    const eliminatedParticipants = gameEpoch
      ? await ctx.db
          .query("participants")
          .withIndex("by_game_epoch_status", (q) =>
            q.eq("gameEpoch", gameEpoch).eq("status", "eliminated"),
          )
          .collect()
      : [];

    const lastEliminated = eliminatedParticipants.length > 0
      ? eliminatedParticipants
          .sort((a, b) => (b.eliminatedAt ?? 0) - (a.eliminatedAt ?? 0))[0]
      : null;

    return {
      gameState,
      game,
      gameScene: parseGameScenario(game?.scenario),
      signupGame,
      signupScene: parseGameScenario(signupGame?.scenario),
      activeParticipantCount: activeParticipants.length,
      eliminatedCount: eliminatedParticipants.length,
      activeParticipants: activeParticipants.map((participant) => ({
        agentDid: participant.agentDid,
        avatarName: participant.avatarName,
        avatarPictureUrl: participant.avatarPictureUrl,
        avatarBackstory: participant.avatarBackstory,
        status: participant.status,
      })),
      lastEliminated: lastEliminated
        ? {
            avatarName: lastEliminated.avatarName,
            avatarPictureUrl: lastEliminated.avatarPictureUrl,
            eliminatedAt: lastEliminated.eliminatedAt ?? null,
          }
        : null,
      voteCount,
      ghostVoteCount,
    };
  },
});

export const getSignupQueue = query({
  args: {},
  handler: async (ctx) => {
    const gameState = await getGlobalGameState(ctx);
    if (!gameState.signupGameEpoch) {
      return {
        gameEpoch: null,
        registrations: [],
      };
    }

    const queued = await ctx.db
      .query("registrations")
      .withIndex("by_game_epoch_status", (q) =>
        q.eq("gameEpoch", gameState.signupGameEpoch!).eq("status", "queued"),
      )
      .collect();

    return {
      gameEpoch: gameState.signupGameEpoch,
      registrations: queued
        .map((registration) => ({
          agentDid: registration.agentDid,
          avatarName: registration.avatarName,
          avatarPictureUrl: registration.avatarPictureUrl,
          avatarBackstory: registration.avatarBackstory,
          requestedAt: registration.requestedAt,
          ownerHumanVerified: registration.ownerHumanVerified,
          minReputationPass: registration.minReputationPass,
        }))
        .sort((a, b) => {
          if (a.requestedAt === b.requestedAt) {
            return a.avatarName.localeCompare(b.avatarName);
          }
          return a.requestedAt - b.requestedAt;
        }),
    };
  },
});

export const getHallOfFame = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
    const completedGames = await ctx.db
      .query("games")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .collect();

    const finalists = completedGames
      .filter((game) => Boolean(game.winnerDid))
      .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
      .slice(0, limit);

    return Promise.all(finalists.map(async (game) => {
      const winnerParticipant = await ctx.db
        .query("participants")
        .withIndex("by_game_epoch_agent_did", (q) =>
          q.eq("gameEpoch", game.gameEpoch).eq("agentDid", game.winnerDid!),
        )
        .unique();

      return {
        gameEpoch: game.gameEpoch,
        winnerDid: game.winnerDid!,
        winner: winnerParticipant
          ? {
              agentDid: winnerParticipant.agentDid,
              avatarName: winnerParticipant.avatarName,
              avatarPictureUrl: winnerParticipant.avatarPictureUrl,
              avatarBackstory: winnerParticipant.avatarBackstory,
            }
          : null,
        endedAt: game.endedAt ?? null,
        totalRounds: game.totalRounds ?? null,
        scenario: game.scenario ?? null,
        scene: parseGameScenario(game.scenario),
      };
    }));
  },
});

export const getActiveRoster = query({
  args: {
    gameEpoch: v.number(),
  },
  handler: async (ctx, args) => {
    const activeParticipants = await ctx.db
      .query("participants")
      .withIndex("by_game_epoch_status", (q) =>
        q.eq("gameEpoch", args.gameEpoch).eq("status", "active"),
      )
      .collect();

    return {
      gameEpoch: args.gameEpoch,
      roster: activeParticipants
        .map((participant) => ({
          agentDid: participant.agentDid,
          avatarName: participant.avatarName,
          avatarPictureUrl: participant.avatarPictureUrl,
          avatarBackstory: participant.avatarBackstory,
          status: participant.status,
        }))
        .sort((a, b) => a.avatarName.localeCompare(b.avatarName)),
    };
  },
});

export const getTimeline = query({
  args: {
    gameEpoch: v.number(),
    round: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 500);

    const publicMessages = args.round
      ? await ctx.db
          .query("messagesPublic")
          .withIndex("by_game_epoch_round", (q) =>
            q.eq("gameEpoch", args.gameEpoch).eq("round", args.round!),
          )
          .collect()
      : await ctx.db
          .query("messagesPublic")
          .withIndex("by_game_epoch", (q) => q.eq("gameEpoch", args.gameEpoch))
          .collect();

    const votes = args.round
      ? await ctx.db
          .query("votes")
          .withIndex("by_game_epoch_round_cast_at", (q) =>
            q.eq("gameEpoch", args.gameEpoch).eq("round", args.round!),
          )
          .collect()
      : [];

    const reveals = args.round
      ? await ctx.db
          .query("reveals")
          .withIndex("by_game_epoch_round", (q) =>
            q.eq("gameEpoch", args.gameEpoch).eq("round", args.round!),
          )
          .collect()
      : await ctx.db
          .query("reveals")
          .withIndex("by_game_epoch_round", (q) => q.eq("gameEpoch", args.gameEpoch))
          .collect();

    const timeline = [...publicMessages, ...votes, ...reveals]
      .sort((a, b) => a._creationTime - b._creationTime)
      .slice(-limit);

    return { timeline };
  },
});

export const getGameReplay = query({
  args: {
    gameEpoch: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 300, 1), 2000);
    const game = await ctx.db
      .query("games")
      .withIndex("by_game_epoch", (q) => q.eq("gameEpoch", args.gameEpoch))
      .unique();

    if (!game) {
      return {
        found: false as const,
        gameEpoch: args.gameEpoch,
      };
    }

    const publicMessages = await ctx.db
      .query("messagesPublic")
      .withIndex("by_game_epoch", (q) => q.eq("gameEpoch", args.gameEpoch))
      .collect();

    const winner = game.winnerDid
      ? await ctx.db
          .query("participants")
          .withIndex("by_game_epoch_agent_did", (q) =>
            q.eq("gameEpoch", args.gameEpoch).eq("agentDid", game.winnerDid!),
          )
          .unique()
      : null;

    const replayParticipantStatuses = [
      "active",
      "eliminated",
      "winner",
      "disqualified",
    ] as const;
    const replayParticipantChunks = await Promise.all(
      replayParticipantStatuses.map((status) =>
        ctx.db
          .query("participants")
          .withIndex("by_game_epoch_status", (q) =>
            q.eq("gameEpoch", args.gameEpoch).eq("status", status),
          )
          .collect(),
      ),
    );
    const participantProfilesByDid = new Map<
      string,
      { agentDid: string; avatarName: string; avatarPictureUrl: string }
    >();
    for (const participants of replayParticipantChunks) {
      for (const participant of participants) {
        participantProfilesByDid.set(participant.agentDid, {
          agentDid: participant.agentDid,
          avatarName: participant.avatarName,
          avatarPictureUrl: participant.avatarPictureUrl,
        });
      }
    }

    return {
      found: true as const,
      game: {
        gameEpoch: game.gameEpoch,
        status: game.status,
        scenario: game.scenario ?? null,
        scene: parseGameScenario(game.scenario),
        startedAt: game.startedAt ?? null,
        endedAt: game.endedAt ?? null,
        totalRounds: game.totalRounds ?? null,
        winnerDid: game.winnerDid ?? null,
        winner: winner
          ? {
              agentDid: winner.agentDid,
              avatarName: winner.avatarName,
              avatarPictureUrl: winner.avatarPictureUrl,
              avatarBackstory: winner.avatarBackstory,
            }
          : null,
      },
      timeline: publicMessages
        .sort((a, b) => a._creationTime - b._creationTime)
        .slice(-limit),
      participantProfiles: Array.from(participantProfilesByDid.values()),
    };
  },
});
