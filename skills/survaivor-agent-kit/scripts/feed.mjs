import {
  buildSignedEnvelope,
  callSurvaivor,
  parseArgs,
  parseNumber,
  printJson,
  resolveAgentDid,
  required,
} from "./lib/survaivor-client.mjs";

const args = parseArgs(process.argv.slice(2));
const gameEpoch = parseNumber(args.gameEpoch, null);
const round = parseNumber(args.round, null);
const since = parseNumber(args.since, null);
const limit = parseNumber(args.limit, 300);
const agentDid = await resolveAgentDid();
const envelopeRound = round ?? 0;

required(gameEpoch, "--gameEpoch");
required(agentDid, "resolved identity DID");

const { envelope } = await buildSignedEnvelope({
  actionType: "mail_check",
  gameEpoch,
  round: envelopeRound,
  payloadForHash: {
    type: "survaivor.game.feed",
    gameEpoch,
    round: envelopeRound,
    actionType: "mail_check",
    actorAgentDid: agentDid,
    agentDid,
    queryRound: round ?? null,
    since: since ?? null,
    limit,
  },
  note: "survaivor feed check",
});

const data = await callSurvaivor("/game/feed", {
  envelope,
  gameEpoch,
  agentDid,
  round: round ?? undefined,
  since: since ?? undefined,
  limit,
});

printJson({
  ok: true,
  data,
});
