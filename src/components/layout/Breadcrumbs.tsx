import { ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { PAGE_TITLES } from './navigation';

export function Breadcrumbs() {
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);
  const crumbs = segments.map((_, i) => {
    const path = '/' + segments.slice(0, i + 1).join('/');
    return { path, label: PAGE_TITLES[path] ?? segments[i] };
  });

  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      <ol>
        <li>
          {crumbs.length ? <Link to="/">Home</Link> : <span aria-current="page">Dashboard</span>}
        </li>
        {crumbs.map((c, i) => (
          <li key={c.path}>
            <ChevronRight size={14} aria-hidden="true" />
            {i === crumbs.length - 1 ? <span aria-current="page">{c.label}</span> : <Link to={c.path}>{c.label}</Link>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
