import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const DIFF_COLOR = { Low: '#627c68', 'Low–Moderate': '#9fb089', Moderate: '#e15a42', 'Moderate–High': '#c0442f', High: '#102632' };
const DIFF_ORDER = ['Low', 'Low–Moderate', 'Moderate', 'Moderate–High', 'High'];
const STATUS_CLASS = { 'Not started': 's-not', Applied: 's-applied', Interviewing: 's-interview', 'Offer Received': 's-offer' };

function ScoreTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const value = payload[0].payload;
  return (
    <div className="rn-tooltip">
      <strong>{value.title}</strong>
      <span>Match score: <b>{value.score}%</b></span>
      <span>Type: {value.type}</span>
      <span>Difficulty: {value.difficulty}</span>
    </div>
  );
}

export default function SavedPaths({ roles }) {
  const navigate = useNavigate();
  if (roles.length === 0) {
    return (
      <div className="empty-state">
        <h2>No saved paths yet.</h2>
        <p>Save roles from your results to compare them here.</p>
        <button className="text-btn" onClick={() => navigate('/')}>&rarr; Discover your paths</button>
      </div>
    );
  }

  const data = roles.map((role) => ({
    name: role.title.length > 22 ? `${role.title.slice(0, 20)}…` : role.title,
    title: role.title,
    score: role.match_score,
    difficulty: role.transition_difficulty,
    type: role.role_type,
    id: role.id
  }));
  const average = Math.round(roles.reduce((sum, role) => sum + role.match_score, 0) / roles.length);
  const counts = roles.reduce((all, role) => ({ ...all, [role.transition_difficulty]: (all[role.transition_difficulty] || 0) + 1 }), {});
  const presentDifficulties = DIFF_ORDER.filter((difficulty) => counts[difficulty]);

  return (
    <>
      <section className="dash-stats">
        <div><strong>{roles.length}</strong><span>saved paths</span></div>
        <div><strong>{average}%</strong><span>avg match score</span></div>
        {presentDifficulties.map((difficulty) => (
          <div key={difficulty}><strong>{counts[difficulty]}</strong><span>{difficulty.toLowerCase()} difficulty</span></div>
        ))}
      </section>
      <section className="dash-body">
        <div className="dash-chart">
          <h2>Match score by role</h2>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={data} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#d9d7d0" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fontFamily: 'DM Mono, monospace', fill: '#627077' }} />
                <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fontFamily: 'Manrope, sans-serif', fill: '#102632' }} />
                <Tooltip content={<ScoreTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar dataKey="score" radius={[3, 3, 3, 3]} barSize={22}>
                  {data.map((item) => <Cell key={item.id} fill={DIFF_COLOR[item.difficulty] || '#102632'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="dash-legend">
            {presentDifficulties.map((difficulty) => (
              <span key={difficulty}><i style={{ background: DIFF_COLOR[difficulty] }} />{difficulty}</span>
            ))}
          </div>
        </div>
        <div className="dash-list">
          <h2>All saved roles</h2>
          {roles.map((role, index) => (
            <button key={role.id} className="dash-row" onClick={() => navigate(`/role/${role.profile_id}/${role.id}`)}>
              <span className="num">{String(index + 1).padStart(2, '0')}</span>
              <span className="title">{role.title}</span>
              <span className="type">{role.role_type}</span>
              <span className={`status-pill ${STATUS_CLASS[role.status] || 's-not'}`}>{role.status || 'Not started'}</span>
              <span className="diff">{role.transition_difficulty}</span>
              <b>&rarr;</b>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
