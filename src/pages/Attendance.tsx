
import React, { useState, useEffect, useRef } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';

// Hooks
import { useGeoLocation } from '../hooks/attendance/useGeoLocation';
import { useAttendance } from '../hooks/attendance/useAttendance';
import { useSubscription } from '../context/SubscriptionContext';
import { useToast } from '../context/ToastContext';
import { GEOFENCE_RADIUS_M } from '../constants';

// UI Components
import { AttendanceHeader } from '../components/attendance/AttendanceHeader';
import { LocationCard } from '../components/attendance/LocationCard';
import { LocationDisplay } from '../components/attendance/LocationDisplay';
import { AttendanceActions } from '../components/attendance/AttendanceActions';

interface AttendanceProps {
  user: any;
  autoStart?: 'OFFICE' | 'FINISH';
  onFinish?: () => void;
}

const Attendance: React.FC<AttendanceProps> = ({ user, onFinish }) => {
  const { showToast } = useToast();

  // 1. Logic Hooks
  const {
    currentTime, activeRecord, appConfig, isLoading, status, submitPunch
  } = useAttendance(user, onFinish);

  const {
    location, geofence, isLocating, error: locationError, detectLocation
  } = useGeoLocation();

  // Subscription check for write access
  const { canPerformAction, subscription } = useSubscription();
  const canPunch = canPerformAction('write');

  // 2. Local UI State
  const [remarks, setRemarks] = useState('');
  const locationRequested = useRef(false);

  // 3. Find the location once data is ready
  useEffect(() => {
    if (isLoading || locationRequested.current) return;
    locationRequested.current = true;
    detectLocation(true);
  }, [isLoading]);

  // 4. Handlers
  const handlePunchSubmit = async () => {
    if (!canPunch) {
      if (subscription?.status === 'EXPIRED') {
        showToast('Your organization is in read-only mode. Attendance punching is disabled.', 'warning');
      } else if (subscription?.status === 'SUSPENDED') {
        showToast('Your account is suspended. Please contact support.', 'error');
      }
      return;
    }

    if (status !== 'idle' || !location) return;

    if (!geofence?.inside) {
      showToast(`You must be within ${Math.round(geofence?.radiusM ?? GEOFENCE_RADIUS_M)} m of your office to punch attendance.`, 'warning');
      return;
    }

    await submitPunch(remarks, location);
  };

  const handleBack = () => {
    if (onFinish) onFinish();
  };

  // Every punch must be made within an office's radius (also checked by the database).
  const outsideOffice = !!location && !geofence?.inside;

  if (isLoading) return <div className="h-screen flex items-center justify-center bg-white"><Loader2 className="animate-spin text-blue-600" size={48} /></div>;

  return (
    <div className="fixed inset-0 bg-[#fcfdfe] z-[9999] flex flex-col animate-in slide-in-from-bottom-6 duration-500 overflow-hidden">

      <AttendanceHeader
        currentTime={currentTime}
        onBack={handleBack}
      />

      <div className="flex-1 flex flex-col items-center justify-center px-6 min-h-0">
        <LocationCard showSuccess={status === 'success'}>
          <LocationDisplay
            location={location}
            geofence={geofence}
            isLocating={isLocating}
            error={locationError}
            onRetry={() => detectLocation(true)}
          />
        </LocationCard>
      </div>

      {/* Subscription Warning Banner */}
      {!canPunch && (
        <div className="px-4 py-3 bg-red-50 border-t border-red-200 flex items-center gap-2 text-red-700">
          <AlertTriangle className="w-5 h-5" />
          <span className="text-sm font-medium">
            {subscription?.status === 'EXPIRED'
              ? 'Your organization is in read-only mode. Attendance punching is disabled.'
              : 'Your account is suspended. Please contact support.'}
          </span>
        </div>
      )}

      <AttendanceActions
        dutyLabel={appConfig?.dutyLabel1 || 'Mark Present'}
        remarks={remarks}
        setRemarks={setRemarks}
        onSubmit={handlePunchSubmit}
        status={status}
        activeRecord={activeRecord}
        isDisabled={!canPunch || !location || outsideOffice || isLocating || status !== 'idle'}
      />
    </div>
  );
};

export default Attendance;
