import type { ReactNode } from "react";
import { useLanguage } from "../i18n/LanguageContext.tsx";
import {
  CONCERTS,
  THEME_IDS,
  themeLabel,
  type ThemeId,
} from "../constants.tsx";
import { AnalysisResult } from "@glcp/core";
import { SongPolicyResult } from "@glcp/core";

type TopBarProps = {
  analysisOpen: boolean;
  concert: (typeof CONCERTS)[number];
  gaugeSongs: number;
  remaining: number;
  result: AnalysisResult | null;
  setTheme: (value: ThemeId) => void;
  songPolicy: SongPolicyResult | null;
  theme: ThemeId;
  /** From `slots.topBarActions`. Rendered ahead of the language and theme
   * pickers, inside the same `.topbar-actions` row — a slot is a peer of
   * these controls, not markup bolted on after the header. */
  actions?: ReactNode;
};

export function TopBar({
  analysisOpen,
  concert,
  gaugeSongs,
  remaining,
  result,
  setTheme,
  songPolicy,
  theme,
  actions,
}: TopBarProps) {
  const { L, language, setLanguage } = useLanguage();
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">GL</span>
        <span>
          <strong>{L.topbar.liveRoute}</strong>
          <small>{L.topbar.productSubtitle}</small>
        </span>
      </div>
      <div className="top-metrics">
        <div className="top-metric">
          <span>{L.topbar.concert}</span>
          <strong>{concert.short}</strong>
        </div>
        <div className="top-metric">
          <span>{L.topbar.jaugeDuConcert}</span>
          <strong>{gaugeSongs} / 3</strong>
        </div>
        <div className="top-metric accented">
          <span>{L.topbar.prochaineSong}</span>
          <strong>
            {remaining} {L.topbar.techniquesShort}
          </strong>
        </div>
        <div className="top-metric">
          <span>{L.topbar.analyse}</span>
          <strong>
            {result || songPolicy
              ? L.topbar.calcule
              : analysisOpen
                ? L.topbar.ouvert
                : L.topbar.surDemande}
          </strong>
        </div>
      </div>
      <div className="topbar-actions">
        {actions}
        <div className="lang-switch" role="group" aria-label={L.lang.label}>
          {(["fr", "en"] as const).map((code) => (
            <button
              key={code}
              type="button"
              className={language === code ? "active" : ""}
              aria-pressed={language === code}
              onClick={() => setLanguage(code)}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>
        <span className="theme-select-wrap">
          <select
            className="theme-select"
            aria-label={L.theme.label}
            value={theme}
            onChange={(event) => setTheme(event.target.value as ThemeId)}
          >
            {THEME_IDS.map((id) => (
              <option key={id} value={id}>
                {themeLabel(id, L)}
              </option>
            ))}
          </select>
        </span>
      </div>
    </header>
  );
}
