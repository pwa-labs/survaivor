import {
  buildSignedEnvelope,
  callSurvaivor,
  parseArgs,
  parseNumber,
  printJson,
  required,
} from "./lib/survaivor-client.mjs";

const args = parseArgs(process.argv.slice(2));
const gameEpoch = parseNumber(args.gameEpoch, null);
const round = parseNumber(args.round, null);
const content = args.content;
const referencedHashes = String(args.referencedHashes ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

required(gameEpoch, "--gameEpoch");
required(round, "--round");
if (referencedHashes.length === 0) {
  throw new Error("--referencedHashes is required and must include at least one hash.");
}

const { envelope } = await buildSignedEnvelope({
  actionType: "reveal",
  gameEpoch,
  round,
  payloadForHash: {
    referencedHashes,
    content: content ?? "",
  },
  note: "survaivor reveal",
});

const data = await callSurvaivor("/reveal", {
  envelope,
  referencedHashes,
  content,
});

printJson({
  ok: true,
  data,
});
