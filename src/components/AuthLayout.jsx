export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <main className="auth-page">
      <button className="auth-wordmark" onClick={() => { window.location.href = '/'; }}>Rated <i>N</i></button>
      <div className="auth-wrap">
        <div className="auth-heading">
          <div className="auth-icon"><Icon aria-hidden="true" /></div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="auth-card">{children}</div>
        {footer && <p className="auth-footer">{footer}</p>}
      </div>
    </main>
  );
}
