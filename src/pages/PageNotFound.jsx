import { useNavigate } from 'react-router-dom';

export default function PageNotFound() {
  const navigate = useNavigate();
  return (
    <main className="not-found">
      <p className="kicker">404</p>
      <h1>This path hasn&apos;t been mapped.</h1>
      <p>Return to your career discovery workspace.</p>
      <button className="primary" onClick={() => navigate('/')}>Go home <b>&rarr;</b></button>
    </main>
  );
}
