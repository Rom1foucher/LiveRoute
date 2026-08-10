/**
 * Everything the two applications render. `apps/web` and `apps/desktop` import
 * from here and differ only by the slots they fill and the adapters they inject.
 */

export { default as App, type AppProps } from "./App.tsx";

export { AnalysisAside } from "./components/AnalysisAside.tsx";
export { AppFooter } from "./components/AppFooter.tsx";
export { ConcertTrack } from "./components/ConcertTrack.tsx";
export { DecisionColumn } from "./components/DecisionColumn.tsx";
export { Intro } from "./components/Intro.tsx";
export { ProgressPanel } from "./components/ProgressPanel.tsx";
export { RunPulsePanel } from "./components/RunPulsePanel.tsx";
export { SongsPanel } from "./components/SongsPanel.tsx";
export { TopBar } from "./components/TopBar.tsx";
export { WorkflowBar } from "./components/WorkflowBar.tsx";

export * from "./components/TokenWidgets.tsx";
export * from "./constants.tsx";
export * from "./view-model.ts";
export * from "./slots.tsx";

export {
  LanguageProvider,
  useLabels,
  useLanguage,
} from "./i18n/LanguageContext.tsx";
export { UI_FR, type Labels } from "./i18n/ui-fr.ts";
export { UI_EN } from "./i18n/ui-en.ts";
