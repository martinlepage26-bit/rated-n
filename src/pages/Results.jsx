import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import AnalysisOverlay from '@/components/ratedn/AnalysisOverlay';
import Header from '@/components/ratedn/Header';

const TYPE_ORDER = ['Direct', 'Adjacent', 'Unexpected', 'Stretch'];
const TYPE_COLOR = { Direct: 'ink', Adjacent: 'coral', Unexpected: 'moss', Stretch: 'sand' };
const POLL_MS = 1500;
const POLL_LIMIT_MS = 12 * 60 * 1000;

export default function Results() {
  const { profileId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState(null);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('All');
  const startedAt = useRef(Date.now());

  useEffect(() => {
    let active = true;
    let timer;
    startedAt.current = Date.now();

    const poll = async () => {
      try {
        const { profile: nextProfile } = await api.profiles.get(profileId);
        if (!active) return;
        setProfile(nextProfile);
        if (nextProfile.status === 'analyzing') {
          if (Date.now() - startedAt.current > POLL_LIMIT_MS) {
            setError('Analysis is taking longer than expected. Open this page again in a minute, or try a new story.');
            setLoading(false);
            return;
          }
          timer = window.setTimeout(poll, POLL_MS);
          return;
        }
        if (nextProfile.status === 'failed') {
          setError(nextProfile.error_message || 'The analysis could not be completed.');
          setLoading(false);
          return;
        }
        const { roles: nextRoles } = await api.profiles.roles(profileId);
        if (!active) return;
        setRoles(nextRoles);
        setLoading(false);
      } catch (caught) {
        if (active) {
          setError(caught.message);
          setLoading(false);
        }
      }
    };

    poll();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [profileId]);

  const visible = filter === 'All' ? roles : roles.filter((role) => role.role_type === filter);
  const analyzing = loading && !error && (profile?.status === 'analyzing' || !profile);

  if (analyzing) {
    return (
      <main>
        <Header />
        <AnalysisOverlay visible />
      </main>
    );
  }

  if (error || profile?.status === 'failed') {
    return (
      <main>
        <Header />
        <div className="page-loading">
          <p role="alert">{error || profile?.error_message || 'The analysis could not be completed.'}</p>
          <button className="text-btn" onClick={() => navigate('/')}>Back to overview</button>
        </div>
      </main>
    );
  }

  return (
    <main>
      <Header />
      <section className="results-head">
        <div>
          <button className="back" onClick={() => navigate('/', { state: { experienceText: profile?.experience_text || location.state?.experienceText || '', region: profile?.region || location.state?.region || '' } })}>&larr; Edit experience</button>
          <p className="kicker">Career discovery · based on your story</p>
          {roles[0]?.region && <p className="list-label results-region">Live offers scoped to <strong>{roles[0].region}</strong></p>}
          <h1>{roles.length > 0 ? <>These paths fit more<br />than your <em>past titles.</em></> : <>No credible paths <em>yet.</em></>}</h1>
        </div>
        <aside>
          <strong>{profile?.transferable_count ?? 0}</strong>
          <span>transferable capabilities<br />identified in your story</span>
        </aside>
      </section>

      <section className="dna-strip" aria-label="Professional DNA totals">
        <div><strong>{profile?.competencies_count ?? 0}</strong><span>competencies</span></div>
        <div><strong>{profile?.skills_count ?? 0}</strong><span>skills</span></div>
        <div><strong>{profile?.transferable_count ?? 0}</strong><span>transferable</span></div>
        <div><strong>{roles.length}</strong><span>live roles</span></div>
      </section>

      <section className="filters" aria-label="Filter opportunities">
        {['All', ...TYPE_ORDER].map((type) => (
          <button key={type} className={filter === type ? 'filter active' : 'filter'} aria-pressed={filter === type} onClick={() => setFilter(type)}>
            {type === 'All' ? 'All opportunities' : type}
          </button>
        ))}
      </section>

      <section className="results-layout">
        <div className="role-list">
          <p className="list-label">Opportunities ranked by evidence-backed fit</p>
          {visible.length === 0 && <p className="zero-results">{roles.length === 0 ? 'We found no defensible capability evidence in this story. Add concrete roles, projects, skills, or accomplishments and analyze it again.' : 'No roles in this category.'}</p>}
          {visible.map((role) => (
            <button key={role.id} className="role-card" onClick={() => navigate(`/role/${profileId}/${role.id}`)}>
              <span className={`match-dot ${TYPE_COLOR[role.role_type] || 'ink'}`}>{role.match_score}</span>
              <span className="role-copy">
                <small>{role.role_type}</small>
                <strong>{role.title}</strong>
                <em>{role.note}</em>
              </span>
              <b aria-hidden="true">&rarr;</b>
            </button>
          ))}
        </div>
        <aside className="signal">
          <p className="eyebrow">A useful surprise</p>
          <h2>Strong paths can exist outside your usual search.</h2>
          <p>Transferable skills can open credible roles in industries that use your evidence differently.</p>
          <button className="text-btn" onClick={() => navigate('/')}>Add another career story &rarr;</button>
        </aside>
      </section>
    </main>
  );
}
