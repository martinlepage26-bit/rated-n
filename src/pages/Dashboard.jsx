import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Header from '@/components/ratedn/Header';
import { api } from '@/lib/api';

const DIFF_COLOR = { Low: '#627c68', 'Low–Moderate': '#9fb089', Moderate: '#e15a42', 'Moderate–High': '#c0442f', High: '#102632' };
const DIFF_ORDER = ['Low', 'Low–Moderate', 'Moderate', 'Moderate–High', 'High'];
const STATUS_CLASS = { 'Not started': 's-not', Applied: 's-applied', Interviewing: 's-interview', 'Offer Received': 's-offer' };
const PROFILE_STATUS_CLASS = { analyzing: 's-analyzing', ready: 's-ready', failed: 's-failed' };

function ScoreTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const value = payload[0].payload;
  return <div className="rn-tooltip"><strong>{value.title}</strong><span>Match score: <b>{value.score}%</b></span><span>Type: {value.type}</span><span>Difficulty: {value.difficulty}</span></div>;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [roles, setRoles] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.dashboard()
      .then((result) => { if (active) { setRoles(result.roles); setProfiles(result.profiles); } })
      .catch((caught) => { if (active) setError(caught.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) return <main><Header /><div className="page-loading"><div className="analysis-spinner" /><p>Loading your plan&hellip;</p></div></main>;

  const data = roles.map((role) => ({ name: role.title.length > 22 ? `${role.title.slice(0, 20)}…` : role.title, title: role.title, score: role.match_score, difficulty: role.transition_difficulty, type: role.role_type, id: role.id }));
  const average = roles.length ? Math.round(roles.reduce((sum, role) => sum + role.match_score, 0) / roles.length) : 0;
  const counts = roles.reduce((all, role) => ({ ...all, [role.transition_difficulty]: (all[role.transition_difficulty] || 0) + 1 }), {});
  const presentDifficulties = DIFF_ORDER.filter((difficulty) => counts[difficulty]);

  return <main>
    <Header />
    <section className="dash-head"><button className="back" onClick={() => navigate('/')}>&larr; Back to overview</button><p className="kicker">Your dashboard</p><h1>Your career stories, <em>tracked.</em></h1><p className="lede">See every analysis, return to its results, and compare the roles you&rsquo;ve saved.</p></section>
    {error && <div className="inline-error" role="alert">{error}</div>}
    <section className="dash-profiles">
      <div className="profiles-head"><h2>Career stories</h2><p className="list-label">{profiles.length} {profiles.length === 1 ? 'story' : 'stories'} analysed</p></div>
      {profiles.length === 0 ? <p className="list-label">No profiles yet. Add your experience on the home page to begin.</p> : <div className="profile-list">{profiles.map((profile, index) => <button key={profile.id} className="profile-card" onClick={() => navigate(`/results/${profile.id}`)}><span className="num">{String(index + 1).padStart(2, '0')}</span><span className="profile-meta"><span className="profile-title">{profile.dna_summary || `Career story ${index + 1}`}</span><span className="profile-counts"><i>{profile.competencies_count} competencies</i><i>{profile.skills_count} skills</i><i>{profile.transferable_count} transferable</i><i>{profile.roles_count} roles</i></span></span><span className={`status-pill ${PROFILE_STATUS_CLASS[profile.status] || 's-analyzing'}`}>{profile.status || 'analyzing'}</span><b>&rarr;</b></button>)}</div>}
    </section>
    <section className="dash-section-head"><p className="kicker">Your plan</p><h2>Saved paths, <em>compared.</em></h2></section>
    {roles.length === 0 ? <div className="empty-state"><h2>No saved paths yet.</h2><p>Save roles from your results to compare them here.</p><button className="text-btn" onClick={() => navigate('/')}>&rarr; Discover your paths</button></div> : <>
      <section className="dash-stats"><div><strong>{roles.length}</strong><span>saved paths</span></div><div><strong>{average}%</strong><span>avg match score</span></div>{presentDifficulties.map((difficulty) => <div key={difficulty}><strong>{counts[difficulty]}</strong><span>{difficulty.toLowerCase()} difficulty</span></div>)}</section>
      <section className="dash-body"><div className="dash-chart"><h2>Match score by role</h2><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={data} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#d9d7d0" /><XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fontFamily: 'DM Mono, monospace', fill: '#627077' }} /><YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fontFamily: 'Manrope, sans-serif', fill: '#102632' }} /><Tooltip content={<ScoreTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} /><Bar dataKey="score" radius={[3, 3, 3, 3]} barSize={22}>{data.map((item) => <Cell key={item.id} fill={DIFF_COLOR[item.difficulty] || '#102632'} />)}</Bar></BarChart></ResponsiveContainer></div><div className="dash-legend">{presentDifficulties.map((difficulty) => <span key={difficulty}><i style={{ background: DIFF_COLOR[difficulty] }} />{difficulty}</span>)}</div></div>
      <div className="dash-list"><h2>All saved roles</h2>{roles.map((role, index) => <button key={role.id} className="dash-row" onClick={() => navigate(`/role/${role.profile_id}/${role.id}`)}><span className="num">{String(index + 1).padStart(2, '0')}</span><span className="title">{role.title}</span><span className="type">{role.role_type}</span><span className={`status-pill ${STATUS_CLASS[role.status] || 's-not'}`}>{role.status || 'Not started'}</span><span className="diff">{role.transition_difficulty}</span><b>&rarr;</b></button>)}</div></section>
    </>}
  </main>;
}
