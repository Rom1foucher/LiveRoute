import { useLabels } from "../i18n/LanguageContext.tsx";

/** Compact task summary plus the three scenario thresholds users need. */
export function Intro() {
  const L = useLabels();
  return (
    <section className="run-brief">
      <div className="run-brief-main">
        <h1>{L.intro.title}</h1>
        <p>{L.intro.lede}</p>
      </div>
      <ul className="run-brief-facts">
        <li>
          <strong>{L.intro.factGreatSuccessValue}</strong>
          <span>{L.intro.factGreatSuccessLabel}</span>
        </li>
        <li>
          <strong>{L.intro.factLegendValue}</strong>
          <span>{L.intro.factLegendLabel}</span>
        </li>
        <li>
          <strong>{L.intro.factCapValue}</strong>
          <span>{L.intro.factCapLabel}</span>
        </li>
      </ul>
    </section>
  );
}
