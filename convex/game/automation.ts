import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { emitEliminatedSignal, emitRoundNoVoteSignal, emitWinnerSignal } from "./trust";

function pacificHour(date: Date) {
  const value = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    hour12: false,
  }).format(date);
  return Number(value);
}

async function emitNoVoteSignals(
  noVoteDids?: string[],
  context: { gameEpoch?: number; round?: number } = {},
) {
  if (!noVoteDids) return;
  for (const did of noVoteDids) {
    await emitRoundNoVoteSignal(did, context);
  }
}

async function emitResolutionOutcomeSignals(
  result: {
    eliminatedDid?: string;
    winnerDid?: string;
    gameEpoch?: number;
    round?: number;
  },
) {
  const context = {
    gameEpoch: result.gameEpoch,
    round: result.round,
  };
  if (result.eliminatedDid) {
    await emitEliminatedSignal(result.eliminatedDid, context);
  }
  if (result.winnerDid) {
    await emitWinnerSignal(result.winnerDid, context);
  }
}

export const handleTopOfHour = internalAction({
  args: {},
  handler: async (ctx): Promise<unknown> => {
    await ctx.runMutation(internal.mutations.game.reconcileStateInternal, {});

    const resolution = (await ctx.runMutation(
      internal.mutations.game.resolveVotingWindowInternal,
      {},
    )) as {
      resolved?: boolean;
      noVoteDids?: string[];
      gameEpoch?: number;
      round?: number;
      eliminatedDid?: string;
      winnerDid?: string;
    };

    if (resolution.resolved) {
      await emitNoVoteSignals(resolution.noVoteDids, {
        gameEpoch: resolution.gameEpoch,
        round: resolution.round,
      });
      await emitResolutionOutcomeSignals({
        eliminatedDid: resolution.eliminatedDid,
        winnerDid: resolution.winnerDid,
        gameEpoch: resolution.gameEpoch,
        round: resolution.round,
      });
    }

    const now = new Date();
    const isPacificNoon = pacificHour(now) === 12;
    if (isPacificNoon) {
      return (await ctx.runMutation(internal.mutations.game.startDailyGameInternal, {})) as unknown;
    }

    return resolution as unknown;
  },
});

export const handleTopOfHourSafeguard = internalAction({
  args: {},
  handler: async (ctx): Promise<unknown> => {
    const reconciled = (await ctx.runMutation(internal.mutations.game.reconcileStateInternal, {})) as {
      currentGameEpoch: number | null;
      currentRound: number | null;
      signupGameEpoch: number;
      phase: string;
    };

    const resolution = (await ctx.runMutation(
      internal.mutations.game.resolveVotingWindowInternal,
      {},
    )) as {
      resolved?: boolean;
      noVoteDids?: string[];
      gameEpoch?: number;
      round?: number;
      eliminatedDid?: string;
      winnerDid?: string;
    };

    if (resolution.resolved) {
      await emitNoVoteSignals(resolution.noVoteDids, {
        gameEpoch: resolution.gameEpoch,
        round: resolution.round,
      });
      await emitResolutionOutcomeSignals({
        eliminatedDid: resolution.eliminatedDid,
        winnerDid: resolution.winnerDid,
        gameEpoch: resolution.gameEpoch,
        round: resolution.round,
      });
    }

    const now = new Date();
    const isPacificNoon = pacificHour(now) === 12;
    if (isPacificNoon && !reconciled.currentGameEpoch) {
      return (await ctx.runMutation(internal.mutations.game.startDailyGameInternal, {})) as unknown;
    }

    return { reconciled, resolution } as const;
  },
});
