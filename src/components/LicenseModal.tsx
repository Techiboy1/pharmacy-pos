import React, { useState } from 'react';
import { Shield, Key, Copy, Check } from 'lucide-react';
import { getMachineId, verifyLicenseKey } from '../utils/licenseManager';

interface LicenseModalProps {
  onActivate: () => void;
}

export const LicenseModal: React.FC<LicenseModalProps> = ({ onActivate }) => {
  const [machineId] = useState(getMachineId());
  const [licenseKey, setLicenseKey] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(machineId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleActivate = () => {
    const trimmedKey = licenseKey.trim();
    if (!trimmedKey) {
      setError('Please enter a license key.');
      return;
    }

    const result = verifyLicenseKey(trimmedKey);
    if (result.valid) {
      setError('');
      onActivate();
      window.location.reload(); // Software dashboard unlock & reload
    } else {
      setError(result.reason || 'Invalid or corrupt License Key.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 p-6 shadow-2xl border border-slate-800 text-slate-100">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500 mb-4 border border-blue-500/20">
            <Shield className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold text-white">Software Activation Required</h2>
          <p className="mt-1 text-sm text-slate-400">
            Please provide your Machine ID to get your activation license key.
          </p>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Your Machine ID
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm font-mono font-semibold text-blue-400 select-all">
                {machineId}
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-colors"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              License Key
            </label>
            <textarea
              rows={3}
              value={licenseKey}
              onChange={(e) => {
                setLicenseKey(e.target.value);
                setError('');
              }}
              placeholder="Paste your activation key here..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors resize-none"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 font-medium">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleActivate}
            className="w-full mt-2 flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm rounded-lg shadow-lg shadow-blue-500/20 transition-all cursor-pointer"
          >
            <Key className="h-4 w-4" />
            Activate Software
          </button>
        </div>
      </div>
    </div>
  );
};