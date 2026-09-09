import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="page container center">
      <h1 className="page-title">404</h1>
      <p className="page-subtitle">There's no clip at this address.</p>
      <div className="hero-actions center">
        <Link to="/" className="btn btn-lg">
          Back home
        </Link>
        <Link to="/daily" className="btn btn-green btn-lg">
          Play today's daily
        </Link>
      </div>
    </div>
  );
}
