import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/tokens.css';
import './styles/base.css';

if (import.meta.env.PROD && import.meta.env.VITE_USE_MOCK === 'true' && import.meta.env.VITE_DEMO_MODE !== 'true') {
  // Guard against shipping the mock backend by accident; only the explicit demo build may include it.
  throw new Error('VITE_USE_MOCK must not be enabled in a production build. Use `npm run build:demo` for a demo deployment.');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
