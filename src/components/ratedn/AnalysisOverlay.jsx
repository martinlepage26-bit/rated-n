export default function AnalysisOverlay({ visible }) {
  if (!visible) return null;
  return (
    <div className="analysis-overlay" role="dialog" aria-modal="true" aria-labelledby="analysis-title">
      <div className="analysis-card">
        <div className="analysis-spinner" />
        <p className="eyebrow">Building your Professional DNA</p>
        <h3 id="analysis-title">Reading everything you&apos;ve done.</h3>
        <p>Extracting competencies, finding live market roles, and comparing posted requirements with your evidence.</p>
        <ol>
          <li>Extracting skills &amp; competencies</li>
          <li>Mapping transferable capabilities</li>
          <li>Searching current roles</li>
          <li>Scoring evidence &amp; gaps</li>
        </ol>
      </div>
    </div>
  );
}
