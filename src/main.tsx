import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from '@/App';
import { AppProvider } from '@/providers/AppProvider';
import '@/index.css';

/**
 * Static hosts without rewrite rules (GitHub Pages project sites) cannot serve
 * /decks on a cold load — the file simply does not exist, and a custom 404.html
 * is not used for sub-path sites. Hash routing avoids that entirely: the server
 * only ever sees /index.html.
 *
 * Set VITE_ROUTER=hash for such hosts; local dev and hosts with SPA rewrites
 * (Netlify, Cloudflare Pages, Nginx try_files) keep clean URLs.
 */
const useHashRouter = import.meta.env.VITE_ROUTER === 'hash';
const basename = useHashRouter ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '');

async function bootstrap() {
  const { prepareDb } = await import('@/lib/db/bootstrap');
  await prepareDb();
  const Router = useHashRouter ? HashRouter : BrowserRouter;
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <Router basename={basename}>
        <AppProvider>
          <App />
        </AppProvider>
      </Router>
    </React.StrictMode>,
  );
}

void bootstrap();
