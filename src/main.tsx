import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { UpdateOverlay } from './components/UpdateOverlay.tsx';
import { startDemoSession } from './demoMode';
import './index.css';

function DemoStatus({ expired, onRetry }: { expired: boolean; onRetry?: () => void }) {
  return (
    <main className="min-h-screen bg-slate-950 text-white grid place-items-center p-6">
      <section className="max-w-lg text-center space-y-4">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-400 text-slate-950 text-2xl font-black">P</div>
        <h1 className="text-2xl font-bold">{expired ? 'Demo access expired' : 'Demo unavailable'}</h1>
        <p className="text-slate-300">
          {expired
            ? 'This browser’s Pharmacy POS demo access ended after 3 days. Ask us for help if you need another demo.'
            : 'We couldn’t verify this browser’s demo session. Check your connection and try again.'}
        </p>
        {onRetry && (
          <button onClick={onRetry} className="rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-slate-950 hover:bg-emerald-300">
            Try again
          </button>
        )}
      </section>
    </main>
  );
}

const root = createRoot(document.getElementById('root')!);
const renderApp = () => root.render(
  <StrictMode>
    <App />
    <UpdateOverlay />
  </StrictMode>
);
const renderExpired = () => root.render(<DemoStatus expired />);

window.addEventListener('pharmacy-demo-expired', renderExpired);

async function boot() {
  const status = await startDemoSession();
  if (status === 'expired') {
    renderExpired();
  } else if (status === 'unavailable') {
    root.render(<DemoStatus expired={false} onRetry={() => void boot()} />);
  } else {
    renderApp();
  }
}

void boot();
