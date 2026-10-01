
import { useState, useEffect, useCallback } from 'react';
import { hrService } from '../../services/hrService';
import { Attendance, AppConfig, Shift } from '../../types';
import { useToast } from '../../context/ToastContext';

export const useAttendance = (user: any, onFinish?: () => void) => {
  const { showToast } = useToast();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeRecord, setActiveRecord] = useState<Attendance | undefined>(undefined);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [employeeShift, setEmployeeShift] = useState<Shift | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success'>('idle');

  // Clock Timer
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const refreshData = useCallback(async () => {
    try {
      // Drain the core check-in sync queue (offline/5xx check-ins that
      // never created a record). See Others/CHECKIN_SYNC_QUEUE_RECORD.md.
      // Fire-and-forget — failures are reclassified + rescheduled inside.
      hrService.drainCheckInQueue?.().catch(() => { /* handled inside */ });

      const today = new Date().toISOString().split('T')[0];
      const [reconciled, config, shift] = await Promise.all([
        hrService.getActiveAttendanceWithReconciliation(user.id),
        hrService.getConfig(),
        hrService.resolveShiftForEmployee(user.id, user.shiftId),
      ]);

      const { active, closedPast } = reconciled;

      if (active && active.date !== today) {
        setActiveRecord(undefined);
      } else {
        setActiveRecord(active);
      }
      setAppConfig(config);
      setEmployeeShift(shift);

      // If the workday session manager just closed any past-date sessions
      // as a client-side fallback, surface a one-time, human-readable toast.
      if (closedPast.length > 0) {
        const dates = closedPast.map(s => s.date).join(', ');
        showToast(
          `We auto-closed your forgotten check-out from ${dates}. Please remember to check out at end of day.`,
          'info'
        );
      }
    } catch (e) {
      console.error('Data sync failed', e);
    }
  }, [user.id, user.shiftId, showToast]);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await refreshData();
      setIsLoading(false);
    };
    init();
  }, [refreshData]);

  const submitPunch = async (
    remarks: string,
    location: { lat: number; lng: number; address: string }
  ) => {
    setStatus('loading');
    try {
      const punchTime = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
      const today = new Date().toISOString().split('T')[0];

      if (activeRecord && !activeRecord.checkOut) {
        // Clock Out
        await hrService.updateAttendance(activeRecord.id, {
          checkOut: punchTime,
          remarks,
          checkOutLocation: { lat: location.lat, lng: location.lng },
        });
      } else {
        // Clock In
        let punchStatus: Attendance['status'] = 'PRESENT';
        
        // Late Calculation Logic (Strict Mode Enforced)
        // Priority: employee shift > global appConfig
        const shiftStart = employeeShift?.startTime || appConfig?.officeStartTime;
        const shiftGrace = employeeShift?.lateGracePeriod ?? appConfig?.lateGracePeriod ?? 0;

        if (shiftStart) {
          const [pH, pM] = punchTime.split(':').map(Number);
          const [sH, sM] = shiftStart.split(':').map(Number);

          const punchMins = pH * 60 + pM;
          const startMins = sH * 60 + sM + shiftGrace;

          if (punchMins > startMins) {
            punchStatus = 'LATE';
          }
        }
        
        await hrService.saveAttendance({
          id: '', 
          employeeId: user.id, 
          employeeName: user.name, 
          date: today,
          checkIn: punchTime, 
          status: punchStatus, 
          location, 
          remarks,
          dutyType: 'OFFICE'
        });
      }
      
      setStatus('success');
      await refreshData();
      
      // Auto-close after success
      setTimeout(() => {
        if (onFinish) onFinish();
      }, 1500);

    } catch (err: any) {
      console.error(err);
      setStatus('idle');
      // The database repeats the office-radius check (migration 0049).
      if (String(err?.message || '').includes('OUTSIDE_OFFICE')) {
        showToast("You are outside your office's allowed area. Move closer and try again.", "warning");
      } else {
        showToast("Failed to submit attendance. Please try again.", "error");
      }
    }
  };

  return {
    currentTime,
    activeRecord,
    appConfig,
    isLoading,
    status,
    submitPunch
  };
};
