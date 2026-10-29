import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from '@/App';
import { AppProvider } from '@/providers/AppProvider';
import '@/index.css';

async function bootstrap() {
  const { prepareDb } = await import('@/lib/db/bootstrap');
  await prepareDb();
  // Vite exposes the deploy base (e.g. "/wordflow/" on GitHub Pages, "/" locally).
  // React Router needs it as `basename` or every route would 404 under a subpath.
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '');
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <BrowserRouter basename={basename}>
        <AppProvider>
          <App />
        </AppProvider>
      </BrowserRouter>
    </React.StrictMode>,
  );
}

void bootstrap();
