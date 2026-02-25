import { submitTrustSignal } from "../lib/identity";

export const TRUST_METRICS = {
  ADMISSION_REGISTER: "register",
  GAMEPLAY_ROUND_NO_VOTE: "round_no_vote",
  GAMEPLAY_VOTE_CAST: "vote_cast",
  GAMEPLAY_ELIMINATED: "eliminated",
  GAMEPLAY_WINNER: "winner",
} as const;

const TRUST_EVENTS = {
  REGISTER: "register",
  ROUND_NO_VOTE: "round_no_vote",
  VOTE_CAST: "vote_cast",
  ELIMINATED: "eliminated",
  WINNER: "winner",
} as const;

const TRUST_ENVS = {
  ADMISSION: "survaivor.admission.v1",
  GAMEPLAY: "survaivor.gameplay.v1",
} as const;
const SYSTEM_ACTOR_ID = "sys:survaivor";

function buildEventId(parts: Array<string | number | undefined>) {
  const safe = parts
    .filter((part): part is string | number => part !== undefined)
    .map((part) => String(part).replace(/[^a-zA-Z0-9_-]/g, "_"))
    .join("_");
  return `evt_${safe}_${Date.now()}`;
}

export async function emitRegisterIdentityVerificationSignal(
  did: string,
  accepted: boolean,
) {
  await submitTrustSignal({
    envId: TRUST_ENVS.ADMISSION,
    eventType: TRUST_EVENTS.REGISTER,
    subjectId: did,
    metricKey: TRUST_METRICS.ADMISSION_REGISTER,
    value: accepted,
    externalEventId: buildEventId([TRUST_EVENTS.REGISTER, did]),
  });
}

export async function emitRoundNoVoteSignal(
  did: string,
  context: { gameEpoch?: number; round?: number } = {},
) {
  await submitTrustSignal({
    envId: TRUST_ENVS.GAMEPLAY,
    eventType: TRUST_EVENTS.ROUND_NO_VOTE,
    subjectId: did,
    actorType: "system",
    actorId: SYSTEM_ACTOR_ID,
    metricKey: TRUST_METRICS.GAMEPLAY_ROUND_NO_VOTE,
    // Metric polarity is configured as negative in identity.app.
    value: 1,
    externalEventId: buildEventId([
      TRUST_EVENTS.ROUND_NO_VOTE,
      did,
      context.gameEpoch,
      context.round,
    ]),
  });
}

export async function emitVoteCastSignal(
  did: string,
  context: { gameEpoch?: number; round?: number } = {},
) {
  await submitTrustSignal({
    envId: TRUST_ENVS.GAMEPLAY,
    eventType: TRUST_EVENTS.VOTE_CAST,
    subjectId: did,
    metricKey: TRUST_METRICS.GAMEPLAY_VOTE_CAST,
    value: true,
    externalEventId: buildEventId([
      TRUST_EVENTS.VOTE_CAST,
      did,
      context.gameEpoch,
      context.round,
    ]),
  });
}

export async function emitEliminatedSignal(
  did: string,
  context: { gameEpoch?: number; round?: number } = {},
) {
  await submitTrustSignal({
    envId: TRUST_ENVS.GAMEPLAY,
    eventType: TRUST_EVENTS.ELIMINATED,
    subjectId: did,
    actorType: "system",
    actorId: SYSTEM_ACTOR_ID,
    metricKey: TRUST_METRICS.GAMEPLAY_ELIMINATED,
    value: true,
    externalEventId: buildEventId([
      TRUST_EVENTS.ELIMINATED,
      did,
      context.gameEpoch,
      context.round,
    ]),
  });
}

export async function emitWinnerSignal(
  did: string,
  context: { gameEpoch?: number; round?: number } = {},
) {
  await submitTrustSignal({
    envId: TRUST_ENVS.GAMEPLAY,
    eventType: TRUST_EVENTS.WINNER,
    subjectId: did,
    actorType: "system",
    actorId: SYSTEM_ACTOR_ID,
    metricKey: TRUST_METRICS.GAMEPLAY_WINNER,
    value: true,
    externalEventId: buildEventId([
      TRUST_EVENTS.WINNER,
      did,
      context.gameEpoch,
      context.round,
    ]),
  });
}
