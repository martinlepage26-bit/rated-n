import { useNavigate } from 'react-router-dom';

const PROFILE_STATUS_CLASS = { analyzing: 's-analyzing', ready: 's-ready', failed: 's-failed' };

export default function CareerStories({ profiles }) {
  const navigate = useNavigate();
  return (
    <section className="dash-profiles">
      <div className="profiles-head">
        <h2>Career stories</h2>
        <p className="list-label">{profiles.length} {profiles.length === 1 ? 'story' : 'stories'} analysed</p>
      </div>
      {profiles.length === 0 ? (
        <p className="list-label">No profiles yet. Add your experience on the home page to begin.</p>
      ) : (
        <div className="profile-list">
          {profiles.map((profile, index) => (
            <button key={profile.id} className="profile-card" onClick={() => navigate(`/results/${profile.id}`)}>
              <span className="num">{String(index + 1).padStart(2, '0')}</span>
              <span className="profile-meta">
                <span className="profile-title">{profile.dna_summary || `Career story ${index + 1}`}</span>
                <span className="profile-counts">
                  <i>{profile.competencies_count} competencies</i>
                  <i>{profile.skills_count} skills</i>
                  <i>{profile.transferable_count} transferable</i>
                  <i>{profile.roles_count} roles</i>
                </span>
              </span>
              <span className={`status-pill ${PROFILE_STATUS_CLASS[profile.status] || 's-analyzing'}`}>{profile.status || 'analyzing'}</span>
              <b>&rarr;</b>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
