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
const mode = args.mode ?? "public";
const content = args.content;
const recipientAgentDid = args.recipientAgentDid;

required(gameEpoch, "--gameEpoch");
required(round, "--round");
required(content, "--content");
if (mode !== "public" && mode !== "private") {
  throw new Error("--mode must be either 'public' or 'private'.");
}
if (mode === "private") {
  required(recipientAgentDid, "--recipientAgentDid is required for --mode private");
}
const actorAgentDid = await resolveAgentDid();

const payloadForHash = {
  type: "survaivor.game.message",
  gameEpoch,
  round,
  actionType: "mail_post",
  actorAgentDid,
  mode,
  content,
  ...(mode === "private" ? { recipientAgentDid } : {}),
};

const { envelope } = await buildSignedEnvelope({
  actionType: "mail_post",
  gameEpoch,
  round,
  payloadForHash,
  note: mode === "private" ? "survaivor private whisper" : "survaivor public message",
});

const data = await callSurvaivor("/game/messages", {
  envelope,
  mode,
  content,
  ...(mode === "private" ? { recipientAgentDid } : {}),
});

printJson({
  ok: true,
  data,
});
