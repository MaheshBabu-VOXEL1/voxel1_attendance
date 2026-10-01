import React from 'react';
import { Building, ArrowRight } from 'lucide-react';
import { Attendance, AppConfig } from '../../types';

interface Props {
  activeShift?: Attendance;
  appConfig: AppConfig | null;
  isLoading: boolean;
  onNavigate: (path: string) => void;
}

export const AttendanceSessionButton: React.FC<Props> = ({ activeShift, appConfig, isLoading, onNavigate }) => (
      <div className="flex items-center gap-3">
        {isLoading ? (
          <div className="w-48 h-16 bg-slate-100 rounded-[1.5rem] animate-pulse"></div>
        ) : activeShift ? (
          <button
            onClick={() => onNavigate('attendance-finish')}
            className="w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-3 md:py-4 bg-rose-500 rounded-2xl md:rounded-[1.5rem] shadow-lg shadow-rose-200 hover:bg-rose-600 transition-all group active:scale-95 animate-in zoom-in"
          >
            <div className="relative">
              <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse"></div>
              <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-white animate-ping opacity-75"></div>
            </div>
            <div className="text-left">
              <p className="text-[9px] font-semibold text-rose-100 uppercase tracking-widest leading-none mb-1">{appConfig?.dutyLabel1 || 'Mark Present'} Session Active</p>
              <p className="text-xs font-semibold text-white uppercase">Check Out</p>
            </div>
            <ArrowRight size={16} className="text-rose-200 group-hover:text-white transition-colors ml-2" />
          </button>
        ) : (
          <button
            onClick={() => onNavigate('attendance-quick-office')}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 md:px-8 md:py-4 bg-primary text-white rounded-2xl md:rounded-[1.5rem] shadow-lg shadow-primary-light hover:bg-primary-hover active:scale-95 transition-all animate-in slide-in-from-right-4"
          >
            <Building size={16} />
            <span className="text-[10px] font-semibold uppercase tracking-widest">{appConfig?.dutyLabel1 || 'Mark Present'}</span>
          </button>
        )}
      </div>
);
