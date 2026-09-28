import { useEffect, useState } from 'react';
import { AlertCircle, Download, Loader2, Pill, WifiOff } from 'lucide-react';

export function UpdateOverlay() {
  const [status, setStatus] = useState<PharmacyUpdateStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const updater = window.pharmacyUpdater;
    if (!updater) return;

    let receivedEvent = false;
    const unsubscribe = updater.onStatus((nextStatus) => {
      receivedEvent = true;
      setStatus(nextStatus);
      setDismissed(false);
    });

    updater.getStatus().then((initialStatus) => {
      if (!receivedEvent) setStatus(initialStatus);
    }).catch(() => {
      // Keep the pharmacy app usable if the updater bridge is unavailable.
    });

    return unsubscribe;
  }, []);

  if (
    !status ||
    dismissed ||
    status.phase === 'idle' ||
    status.phase === 'checking' ||
    status.phase === 'not-available'
  ) {
    return null;
  }

  const isError = status.phase === 'error';
  const isDownloading = status.phase === 'downloading';
  const isInstalling = status.phase === 'installing';
  const percent = Math.max(0, Math.min(100, Math.round(status.percent || 0)));

  const title = isError
    ? 'Update could not be completed'
    : isInstalling
      ? 'Update downloaded'
      : isDownloading
        ? 'Downloading update'
        : status.phase === 'available'
          ? 'Update found'
          : 'Checking for updates';

  const description = isError
    ? 'The updater could not reach GitHub. Your local pharmacy data remains on this computer. You can continue offline.'
    : isInstalling
      ? `Version ${status.version || ''} is ready. Pharmacy POS is restarting now.`
      : isDownloading
        ? `Downloading version ${status.version || 'update'}…`
        : status.phase === 'available'
          ? `Version ${status.version || 'new'} is available. Preparing the download…`
          : `Current version: ${status.currentVersion}. Checking GitHub for a newer version…`;

  return (
    <div
      className="fixed inset-0 z-[10000] grid place-items-center bg-slate-950/90 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-title"
    >
      <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-7 text-center text-white shadow-2xl">
        <div className={`mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl border ${
          isError
            ? 'border-amber-400/30 bg-amber-400/10 text-amber-300'
            : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
        }`}>
          {isError ? (
            <WifiOff className="h-8 w-8" />
          ) : isInstalling ? (
            <Pill className="h-8 w-8" />
          ) : isDownloading ? (
            <Download className="h-8 w-8" />
          ) : (
            <Loader2 className="h-8 w-8 animate-spin" />
          )}
        </div>

        <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">
          Pharmacy POS
        </p>
        <h1 id="update-title" className="mt-2 text-xl font-black">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">{description}</p>

        {!isError && (
          <div className="mt-6">
            {isDownloading ? (
              <>
                <div
                  className="h-2 overflow-hidden rounded-full bg-slate-700"
                  role="progressbar"
                  aria-label="Update download progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent}
                >
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-[width] duration-300"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-xs text-slate-400">
                  <span>{percent}%</span>
                  {status.bytesPerSecond ? (
                    <span>{(status.bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s</span>
                  ) : <span>Downloading…</span>}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-400">
                {isInstalling ? <Pill className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
                <span>{isInstalling ? 'Restarting Pharmacy POS' : 'Please keep the app open'}</span>
              </div>
            )}
          </div>
        )}

        {isError && (
          <div className="mt-5 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-left text-xs text-amber-100">
            <div className="flex gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{status.message || 'Check your internet connection and try again with the next app launch.'}</span>
            </div>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="mt-3 w-full rounded-lg bg-slate-700 px-4 py-2.5 font-bold text-white transition hover:bg-slate-600"
            >
              Continue offline
            </button>
          </div>
        )}

        {!isError && (
          <p className="mt-6 text-[11px] text-slate-500">
            Your local database and LAN sharing stay on your pharmacy network.
          </p>
        )}
      </div>
    </div>
  );
}
