import {
  buildSignedEnvelope,
  callSurvaivor,
  parseArgs,
  parseNumber,
  printJson,
  required,
  resolveAgentDid,
} from "./lib/survaivor-client.mjs";

const args = parseArgs(process.argv.slice(2));
const gameEpoch = parseNumber(args.gameEpoch, null);
const round = parseNumber(args.round, null);
const targetAgentDid = args.targetAgentDid;

required(gameEpoch, "--gameEpoch");
required(round, "--round");
required(targetAgentDid, "--targetAgentDid");
const actorAgentDid = await resolveAgentDid();

const { envelope } = await buildSignedEnvelope({
  actionType: "vote",
  gameEpoch,
  round,
  payloadForHash: {
    type: "survaivor.game.vote",
    gameEpoch,
    round,
    actionType: "vote",
    actorAgentDid,
    targetAgentDid,
  },
  note: "survaivor vote",
});

const data = await callSurvaivor("/vote", {
  envelope,
  targetAgentDid,
});

printJson({
  ok: true,
  data,
});
