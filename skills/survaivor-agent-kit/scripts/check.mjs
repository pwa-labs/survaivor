import { callSurvaivor, printJson } from "./lib/survaivor-client.mjs";

const data = await callSurvaivor("/check", {});
printJson({
  ok: true,
  data,
});
