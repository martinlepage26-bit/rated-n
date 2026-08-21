import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import Header from '@/components/ratedn/Header';
import Toast from '@/components/ratedn/Toast';
import { api } from '@/lib/api';

const STATUS_OPTIONS = ['Not started', 'Applied', 'Interviewing', 'Offer Received'];
const MATERIAL_TABS = [
  { key: 'resume_markdown', label: 'Résumé' },
  { key: 'cover_letter_markdown', label: 'Cover letter' },
  { key: 'linkedin_summary_markdown', label: 'LinkedIn summary' }
];

export default function RoleDetail() {
  const { profileId, roleId } = useParams();
  const navigate = useNavigate();
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('resume_markdown');
  const toastTimer = useRef();

  const notify = (message) => {
    window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(''), 2600);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.roles.get(roleId)
      .then(({ role: result }) => { if (active) setRole(result); })
      .catch((caught) => { if (active) setError(caught.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; window.clearTimeout(toastTimer.current); };
  }, [roleId]);

  if (loading) return <main><Header /><div className="page-loading"><div className="analysis-spinner" /><p>Opening this role&hellip;</p></div></main>;
  if (!role || error) return <main><Header /><div className="page-loading"><p role="alert">{error || 'Role not found.'}</p><button className="text-btn" onClick={() => navigate(`/results/${profileId}`)}>Back to results</button></div></main>;

  const hasMaterials = Boolean(role.resume_markdown || role.cover_letter_markdown || role.linkedin_summary_markdown);
  const scoreRows = Object.entries(role.score_breakdown || {});

  const updateRole = async (changes, successMessage) => {
    try {
      const { role: updated } = await api.roles.update(role.id, changes);
      setRole(updated);
      notify(successMessage);
    } catch (caught) {
      notify(caught.message || 'Could not save that change.');
    }
  };

  const generateMaterials = async () => {
    setMaterialsLoading(true);
    try {
      const { role: updated } = await api.roles.generateMaterials(role.id);
      setRole(updated);
      notify('Application materials generated.');
    } catch (caught) {
      notify(caught.message || 'Could not generate materials right now.');
    } finally {
      setMaterialsLoading(false);
    }
  };

  const copyMaterial = async () => {
    try {
      await navigator.clipboard.writeText(role[activeTab] || '');
      notify('Copied to clipboard.');
    } catch {
      notify('Clipboard access is unavailable. Select the text to copy it.');
    }
  };

  return (
    <main>
      <Header />
      <section className="detail-hero">
        <button className="back" onClick={() => navigate(`/results/${profileId}`)}>&larr; All opportunities</button>
        <div className="role-heading">
          <div>
            <p className="kicker">{role.role_type} opportunity</p>
            <h1>{role.title}</h1>
            <p>{role.note}</p>
          </div>
          <div className="big-score"><strong>{role.match_score}%</strong><span>credible match</span></div>
        </div>
      </section>

      <section className="progress-strip">
        <label className="eyebrow" htmlFor="role-status">Track your progress</label>
        <div className="status-select">
          <select id="role-status" value={role.status || 'Not started'} onChange={(event) => updateRole({ status: event.target.value }, `Status updated to “${event.target.value}”.`)}>
            {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </div>
      </section>

      <section className="detail-grid">
        <article className="evidence">
          <p className="eyebrow">Why you qualify</p>
          <h2>Your evidence carries.</h2>
          <p>{role.why_qualify}</p>
          {role.evidence_quote && <blockquote className="quote">&ldquo;{role.evidence_quote}&rdquo;{role.evidence_source && <small>Evidence from {role.evidence_source}</small>}</blockquote>}
          {role.strengths?.length > 0 && <div className="chips" aria-label="Matched strengths">{role.strengths.map((strength) => <span key={strength}>{strength}</span>)}</div>}
        </article>
        <aside className="scorecard">
          <p className="eyebrow">How this score was made</p>
          {scoreRows.length > 0 ? scoreRows.map(([label, value]) => (
            <div className="score-row" key={label}>
              <span>{label.replaceAll('_', ' ')}</span><b>{value}%</b><i><i style={{ width: `${value}%` }} /></i>
            </div>
          )) : <p className="list-label">Score breakdown unavailable for this role.</p>}
          <div className="difficulty-row"><span>Transition difficulty</span><b>{role.transition_difficulty}</b></div>
          {(role.market_evidence || role.success_signal) && <div className="market-evidence">
            <p className="eyebrow">Live market evidence</p>
            {role.market_evidence && <p>{role.market_evidence}</p>}
            {role.success_signal && <p><strong>Success signal: </strong>{role.success_signal}</p>}
            {role.market_sources?.length > 0 && <ul className="source-list">{role.market_sources.slice(0, 4).map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title} — {source.employer}</a></li>)}</ul>}
          </div>}
        </aside>
      </section>

      {role.gaps?.length > 0 && <section className="gaps"><div><p className="eyebrow">Career gap analysis</p><h2>What&rsquo;s missing &mdash; and closable.</h2></div><ul>{role.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul></section>}

      <section className="path">
        <div><p className="eyebrow">A realistic path</p><h2>Close the gaps. Build one proof point.</h2></div>
        <ol>{(role.path_steps || []).map((step, index) => <li key={step}><b>{String(index + 1).padStart(2, '0')}</b><span>{step}</span></li>)}</ol>
        <button className="primary" onClick={() => updateRole({ saved: true }, 'This role has been saved to your plan.')} disabled={role.saved}>{role.saved ? 'Saved to your plan' : <>Save this path <b>&rarr;</b></>}</button>
      </section>

      <section className="materials">
        <div className="materials-head">
          <div><p className="eyebrow">Application materials</p><h2>Targeted for this role &mdash; from your real experience.</h2></div>
          {!hasMaterials && <button className="primary" onClick={generateMaterials} disabled={materialsLoading}>{materialsLoading ? 'Generating…' : <>Generate materials <b>&rarr;</b></>}</button>}
        </div>
        {hasMaterials ? <div className="materials-body">
          <div className="mat-tabs" role="tablist" aria-label="Application materials">{MATERIAL_TABS.map((tab) => <button key={tab.key} type="button" role="tab" aria-selected={activeTab === tab.key} className={activeTab === tab.key ? 'mat-tab active' : 'mat-tab'} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>)}</div>
          <article className="mat-content"><button className="copy-btn" onClick={copyMaterial}>Copy</button><ReactMarkdown>{role[activeTab] || ''}</ReactMarkdown></article>
        </div> : <p className="list-label">A targeted résumé, cover letter, and LinkedIn summary for {role.title} &mdash; generated only from experience you actually have.</p>}
      </section>
      <Toast toast={toast} />
    </main>
  );
}
