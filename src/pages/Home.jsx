import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import Header from '@/components/ratedn/Header';
import Toast from '@/components/ratedn/Toast';
import AnalysisOverlay from '@/components/ratedn/AnalysisOverlay';
import { SAMPLE_EXPERIENCE } from '@/lib/ratedn';
import { useAuth } from '@/lib/AuthContext';

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInput = useRef(null);
  const [profileText, setProfileText] = useState(() => location.state?.experienceText || '');
  const [region, setRegion] = useState(() => location.state?.region || '');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const { user } = useAuth();
  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(''), 2800); };

  useEffect(() => {
    const target = searchParams.get('focus');
    if (!target) return;
    window.setTimeout(() => {
      document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (target === 'profile-text') document.getElementById(target)?.focus();
    }, 100);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const runAnalysis = async () => {
    if (!user) {
      navigate(`/login?returnTo=${encodeURIComponent('/')}`);
      return;
    }
    const trimmed = profileText.trim();
    if (!trimmed) {
      setError('Please describe your experience before continuing.');
      return;
    }
    if (trimmed.length < 40) {
      setError('Add a little more detail — a few roles, projects, or skills help us find credible paths.');
      return;
    }
    setAnalyzing(true);
    setError('');
    try {
      const { profile } = await api.profiles.analyze(trimmed, region.trim());
      navigate(`/results/${profile.id}`, { state: { experienceText: trimmed, region: region.trim() } });
    } catch (caught) {
      setError(caught.message || 'We could not analyze your experience just now. Please try again.');
      setAnalyzing(false);
    }
  };

  const loadTextFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.type && file.type !== 'text/plain' && !file.name.toLowerCase().endsWith('.txt')) {
      setError('Please choose a plain-text (.txt) file.');
      return;
    }
    if (file.size > 500_000) {
      setError('That file is too large. Please use a text file under 500 KB.');
      return;
    }
    setProfileText(await file.text());
    setError('');
    notify(`${file.name} added.`);
  };

  return (
    <main>
      <Header />
      <section className="hero">
        <div className="hero-copy">
          <p className="kicker">Your career, seen differently</p>
          <h1>Discover what you&rsquo;re qualified <em>to become.</em></h1>
          <p className="lede">Rated N turns the experience you&rsquo;ve accumulated into credible career paths you may not know to search for.</p>
          <div className="actions">
            <button className="primary" onClick={() => document.getElementById('profile-text')?.focus()}>Show my opportunities <b>&rarr;</b></button>
            <button className="text-btn" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}>How it works</button>
          </div>
        </div>
        <div className="hero-art">
          <picture>
            <source srcSet="/career-map.webp" type="image/webp" />
            <img src="/career-map.png" width="1536" height="1024" fetchPriority="high" alt="A professional-network collage mapping experience, skills, and competencies into career paths" className="hero-img" />
          </picture>
        </div>
      </section>

      <section className="momentum" id="how-it-works">
        <div>
          <p className="kicker">Your Professional DNA</p>
          <h2>A fuller picture than a job title.</h2>
        </div>
        <div className="stats">
          <div><strong>1</strong><span>career story</span></div>
          <div><strong>&infin;</strong><span>possible pathways</span></div>
          <div><strong>0</strong><span>invented credentials</span></div>
        </div>
      </section>

      <section className="workspace" aria-labelledby="discovery-heading">
        <div className="profile-panel">
          <div className="panel-top">
            <div>
              <p className="eyebrow">Begin your discovery</p>
              <h3 id="discovery-heading">Tell us a little about what you have done.</h3>
            </div>
            <span className="status">Private by default</span>
          </div>
          <p>Paste roles, projects, courses, accomplishments, or skills. Every result is tied back to the evidence you provide.</p>
          <label className="sr-only" htmlFor="profile-text">Your experience</label>
          <textarea
            id="profile-text"
            value={profileText}
            onChange={(event) => { setProfileText(event.target.value); if (error) setError(''); }}
            placeholder="Example: I managed a frontline team, trained new hires, organized complex schedules, and improved customer service..."
            aria-describedby={error ? 'experience-error' : undefined}
          />
          {error && <p className="field-error" id="experience-error" role="alert">{error}</p>}
          <label className="sr-only" htmlFor="region">Location (optional)</label>
          <input
            id="region"
            className="region-input"
            value={region}
            onChange={(event) => { setRegion(event.target.value); if (error) setError(''); }}
            placeholder="Location — e.g. Toronto, Canada or Remote"
          />
          <div className="intake-actions">
            <button className="primary" onClick={runAnalysis} disabled={analyzing}>Find my paths <b>&rarr;</b></button>
            <button className="text-btn" onClick={() => { setProfileText(SAMPLE_EXPERIENCE); setError(''); notify('Demo experience added.'); }}>Use an example</button>
            <button className="text-btn" onClick={() => fileInput.current?.click()}>Upload .txt</button>
            <input ref={fileInput} className="sr-only" type="file" accept="text/plain,.txt" onChange={loadTextFile} />
          </div>
          <button className="privacy-link" onClick={() => setPrivacyOpen(true)}>What happens to my data?</button>
        </div>
        <div className="question-panel">
          <p className="eyebrow">The question that matters</p>
          <h3>What could you become next?</h3>
          <p>Explore live roles based on demonstrated capability &mdash; not only the titles you have held.</p>
          <button className="primary light" onClick={runAnalysis} disabled={analyzing}>Discover roles <b>&rarr;</b></button>
        </div>
      </section>

      {privacyOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPrivacyOpen(false); }}>
          <section className="privacy-modal" role="dialog" aria-modal="true" aria-labelledby="privacy-title">
            <button className="modal-close" onClick={() => setPrivacyOpen(false)} aria-label="Close privacy information">&times;</button>
            <p className="eyebrow">Your data</p>
            <h2 id="privacy-title">Your career story stays in your account.</h2>
            <p>Your text is encrypted in transit, stored with your private Rated N profile, and analyzed by Cloudflare-hosted AI. Live job searches receive only derived role titles and the location you enter—not your raw career story.</p>
            <p>Rated N does not sell your data or expose one user&rsquo;s profiles to another.</p>
            <button className="primary" onClick={() => setPrivacyOpen(false)}>Understood</button>
          </section>
        </div>
      )}

      <Toast toast={toast} />
      <AnalysisOverlay visible={analyzing} />
    </main>
  );
}
