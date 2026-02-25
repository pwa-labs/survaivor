import {
  callSurvaivor,
  parseArgs,
  parseNumber,
  printJson,
  required,
} from "./lib/survaivor-client.mjs";

const args = parseArgs(process.argv.slice(2));
const gameEpoch = parseNumber(args.gameEpoch, null);

required(gameEpoch, "--gameEpoch");

const data = await callSurvaivor("/game/roster", {
  gameEpoch,
});

printJson({
  ok: true,
  data,
});
