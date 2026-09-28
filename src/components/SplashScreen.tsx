import React, { useEffect, useState } from 'react';
import { Pill, Sparkles, ArrowRight } from 'lucide-react';

export function SplashScreen({ onStart }: { onStart: () => void }) {
  const [closing, setClosing] = useState(false);

  function handleDismiss() {
    if (closing) return;
    setClosing(true);
    setTimeout(() => {
      onStart();
    }, 250); // Smooth fade-out transition
  }

  useEffect(() => {
    // Keyboard ka koi bhi key press karne par continue ho
    function handleKeyDown() {
      handleDismiss();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      onClick={handleDismiss}
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-between p-8 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white select-none cursor-pointer transition-opacity duration-300 ${
        closing ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Top: Arabic Bismillah */}
      <div className="w-full text-center pt-8 sm:pt-12 animate-in fade-in slide-in-from-top-4 duration-700">
        <p className="font-serif text-2xl sm:text-3xl md:text-4xl text-emerald-400 tracking-wide leading-relaxed drop-shadow-[0_2px_12px_rgba(16,185,129,0.35)]">
          بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
        </p>
      </div>

      {/* Center: Branding & Logo */}
      <div className="flex flex-col items-center text-center my-auto animate-in fade-in zoom-in-95 duration-700 delay-150">
        {/* Glowing Pill Icon */}
        <div className="relative mb-6">
          <div className="absolute -inset-2 rounded-2xl bg-emerald-500/20 blur-xl animate-pulse"></div>
          <div className="relative grid place-items-center h-20 w-20 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 text-white shadow-2xl border border-emerald-400/40">
            <Pill className="h-10 w-10 drop-shadow" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl sm:text-5xl font-black tracking-wider uppercase bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent drop-shadow-md">
          STANDARD PRO
        </h1>
        <p className="text-xs sm:text-sm font-medium uppercase tracking-[0.25em] text-slate-400 mt-2">
          Pharmacy Management & POS System
        </p>

        {/* Divider */}
        <div className="w-24 h-0.5 bg-gradient-to-r from-transparent via-emerald-500 to-transparent my-5"></div>

        {/* Powered by TECHI & Phone */}
        <div className="flex flex-col items-center gap-1">
          <div className="text-xs sm:text-sm text-slate-300 font-medium">
            Powered by <span className="text-emerald-400 font-bold tracking-wide">TECHI</span>
          </div>
          <div className="text-xs font-mono font-semibold px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-slate-300 shadow-inner">
            📞 03314289788
          </div>
        </div>
      </div>

      {/* Bottom: Press any key to continue */}
      <div className="w-full text-center pb-6 sm:pb-10 animate-bounce duration-1000">
        <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-slate-800/90 border border-slate-700 text-slate-300 text-xs sm:text-sm font-semibold shadow-lg hover:border-emerald-500 hover:text-white transition-all">
          <Sparkles className="h-4 w-4 text-emerald-400" />
          <span>Press any key or click anywhere to continue</span>
          <ArrowRight className="h-4 w-4 text-emerald-400" />
        </div>
      </div>
    </div>
  );
}