/**
 * Public surface of the decision engine. Applications import from here and
 * never reach into a deep path such as `@glcp/core/src/solver/song-policy.ts`,
 * so that internal moves stay internal.
 *
 * Message rendering lives in `@glcp/core/i18n`, injectable interfaces in
 * `@glcp/core/ports`, and the browser-backed implementations in
 * `@glcp/core/adapters/browser`.
 */

export * from "./live-model.ts";
export * from "./monte-carlo.ts";
export * from "./run-pulse.ts";

export * from "./domain/carryover-selection.ts";
export * from "./domain/live-rules.ts";
export * from "./domain/session-state.ts";
export * from "./domain/song-catalog.ts";
export * from "./domain/song-data.ts";
export * from "./domain/technique-carryover.ts";

export * from "./solver/carry.ts";
export * from "./solver/context.ts";
export * from "./solver/cross-section.ts";
export * from "./solver/forced-override.ts";
export * from "./solver/hunt-state.ts";
export * from "./solver/horizon-outcome.ts";
export * from "./solver/page-actions.ts";
export * from "./solver/resource-economy.ts";
export * from "./solver/robustness.ts";
export * from "./solver/song-dp.ts";
export * from "./solver/song-policy.ts";
export * from "./solver/song-transition.ts";
export * from "./solver/supply-model.ts";
export * from "./solver/technique-dp.ts";
export * from "./solver/terminal-technique.ts";
export * from "./solver/utility-model.ts";
export * from "./solver/value.ts";

export * from "./planner/strategic-plan.ts";

export * from "./diagnostics/decision-log.ts";
export * from "./diagnostics/decision-safety.ts";

export * from "./ports/index.ts";

export * from "./diagnostics/replay.ts";
