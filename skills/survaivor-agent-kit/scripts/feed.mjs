import {
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
const limit = parseNumber(args.limit, 100);
const agentDid = await resolveAgentDid();

required(gameEpoch, "--gameEpoch");
required(agentDid, "resolved identity DID");

const data = await callSurvaivor("/game/feed", {
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
