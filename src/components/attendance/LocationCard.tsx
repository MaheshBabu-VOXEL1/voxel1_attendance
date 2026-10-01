
import React from 'react';
import { MapPin, CheckCircle2 } from 'lucide-react';

interface Props {
  showSuccess: boolean;
  /** The location status panel (LocationDisplay), styled for this dark card. */
  children?: React.ReactNode;
}

/** Centre of the attendance screen: GPS status, then a confirmation once the punch is saved. */
export const LocationCard: React.FC<Props> = ({ showSuccess, children }) => (
  <div className="relative w-full max-w-[280px] aspect-square rounded-[2.5rem] overflow-hidden bg-slate-900 shadow-2xl ring-8 ring-white flex flex-col items-center justify-center p-6 text-center">
    <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mb-3">
      <MapPin size={32} className="text-white/80" />
    </div>
    <p className="font-semibold uppercase text-[10px] tracking-widest text-white/60">Location Check</p>
    {children}

    {showSuccess && (
      <div className="absolute inset-0 bg-emerald-600/95 flex flex-col items-center justify-center z-[1002] animate-in zoom-in">
        <div className="p-4 bg-white rounded-full shadow-2xl mb-4">
          <CheckCircle2 size={48} className="text-emerald-500 animate-bounce" />
        </div>
        <h3 className="text-xl font-semibold text-white uppercase tracking-widest">Recorded</h3>
      </div>
    )}
  </div>
);
