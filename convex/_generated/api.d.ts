/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as crons from "../crons.js";
import type * as game_automation from "../game/automation.js";
import type * as game_engine from "../game/engine.js";
import type * as game_identity from "../game/identity.js";
import type * as game_state from "../game/state.js";
import type * as game_theme from "../game/theme.js";
import type * as game_trust from "../game/trust.js";
import type * as http from "../http.js";
import type * as lib_idempotency from "../lib/idempotency.js";
import type * as lib_identity from "../lib/identity.js";
import type * as lib_image from "../lib/image.js";
import type * as lib_types from "../lib/types.js";
import type * as lib_validators from "../lib/validators.js";
import type * as mutations_game from "../mutations/game.js";
import type * as mutations_mail from "../mutations/mail.js";
import type * as mutations_register from "../mutations/register.js";
import type * as mutations_reveal from "../mutations/reveal.js";
import type * as mutations_vote from "../mutations/vote.js";
import type * as queries_game from "../queries/game.js";
import type * as queries_mail from "../queries/mail.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  crons: typeof crons;
  "game/automation": typeof game_automation;
  "game/engine": typeof game_engine;
  "game/identity": typeof game_identity;
  "game/state": typeof game_state;
  "game/theme": typeof game_theme;
  "game/trust": typeof game_trust;
  http: typeof http;
  "lib/idempotency": typeof lib_idempotency;
  "lib/identity": typeof lib_identity;
  "lib/image": typeof lib_image;
  "lib/types": typeof lib_types;
  "lib/validators": typeof lib_validators;
  "mutations/game": typeof mutations_game;
  "mutations/mail": typeof mutations_mail;
  "mutations/register": typeof mutations_register;
  "mutations/reveal": typeof mutations_reveal;
  "mutations/vote": typeof mutations_vote;
  "queries/game": typeof queries_game;
  "queries/mail": typeof queries_mail;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
