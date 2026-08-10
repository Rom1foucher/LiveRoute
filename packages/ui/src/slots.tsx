import type { ReactNode } from "react";
import type {
  ActionsView,
  DiagnosticsView,
  DisplayView,
  RunView,
  SettingsView,
  SolverView,
} from "./view-model.ts";

/**
 * What a slot can see of the shell. It is deliberately the same grouping the
 * shared components already receive: a slot is a peer of `DecisionColumn`, not
 * a privileged observer with its own private channel into the state.
 */
export type SlotContext = {
  actions: ActionsView;
  diagnostics: DiagnosticsView;
  display: DisplayView;
  run: RunView;
  settings: SettingsView;
  solver: SolverView;
};

/** Static content, or content that needs to read the shell. */
export type Slot = ReactNode | ((context: SlotContext) => ReactNode);

/**
 * Extension points for surfaces that add capabilities the shared UI does not
 * know about — today the desktop OCR cockpit, tomorrow anything else.
 *
 * The alternative would be for `apps/desktop` to fork `App.tsx` and re-insert
 * its panels by hand, which is exactly the divergence this monorepo exists to
 * undo. A slot left `undefined` renders nothing, so the browser build pays no
 * cost for capabilities it lacks.
 */
export type UiSlots = {
  /** Actions added to the top bar, left of the theme and language pickers. */
  topBarActions?: Slot;
  /** Controls added to the workflow bar, next to the concert transition. */
  workflowActions?: Slot;
  /** A full panel rendered under the decision column. The OCR cockpit lives here. */
  decisionAside?: Slot;
  /** Rendered last, outside the layout: modals, overlays, global shortcuts. */
  overlay?: Slot;
};

export const EMPTY_SLOTS: UiSlots = {};

export const renderSlot = (slot: Slot | undefined, context: SlotContext) =>
  typeof slot === "function" ? slot(context) : slot;
