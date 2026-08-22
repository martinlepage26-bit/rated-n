import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CareerStories from '@/components/ratedn/CareerStories';
import Header from '@/components/ratedn/Header';
import SavedPaths from '@/components/ratedn/SavedPaths';
import { api } from '@/lib/api';

export default function Dashboard() {
  const navigate = useNavigate();
  const [roles, setRoles] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.dashboard()
      .then((result) => {
        if (!active) return;
        setRoles(result.roles);
        setProfiles(result.profiles);
      })
      .catch((caught) => { if (active) setError(caught.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) {
    return <main><Header /><div className="page-loading"><div className="analysis-spinner" /><p>Loading your plan&hellip;</p></div></main>;
  }

  return (
    <main>
      <Header />
      <section className="dash-head">
        <button className="back" onClick={() => navigate('/')}>&larr; Back to overview</button>
        <p className="kicker">Your dashboard</p>
        <h1>Your career stories, <em>tracked.</em></h1>
        <p className="lede">See every analysis, return to its results, and compare the roles you&rsquo;ve saved.</p>
      </section>
      {error && <div className="inline-error" role="alert">{error}</div>}
      <CareerStories profiles={profiles} />
      <section className="dash-section-head">
        <p className="kicker">Your plan</p>
        <h2>Saved paths, <em>compared.</em></h2>
      </section>
      <SavedPaths roles={roles} />
    </main>
  );
}
