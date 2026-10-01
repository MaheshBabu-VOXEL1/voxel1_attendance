import React from 'react';
import { useSubscription } from '../../context/SubscriptionContext';
import { AlertTriangle, Beaker, LogOut } from 'lucide-react';

interface SubscriptionBannerProps {
  onExitDemo?: () => void;
}

export const SubscriptionBanner: React.FC<SubscriptionBannerProps> = ({ onExitDemo }) => {
  const { subscription, isLoading } = useSubscription();

  if (isLoading) return null;
  if (!subscription || subscription.isSuperAdmin) return null;

  // Demo mode banner — always visible on every page
  if (subscription.isDemo) {
    return (
      <div className="px-4 py-2.5 flex items-center justify-between text-sm bg-indigo-50 border-b border-indigo-200 text-indigo-700">
        <div className="flex items-center gap-2">
          <Beaker className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium">
            🧪 Demo Mode — Data resets daily. No data saved.
          </span>
        </div>
        {onExitDemo && (
          <button
            onClick={onExitDemo}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg text-xs font-semibold transition-colors"
          >
            <LogOut size={12} /> Exit Demo
          </button>
        )}
      </div>
    );
  }

  // Read-only lock, applied by a super admin
  if (subscription.status === 'EXPIRED') {
    return (
      <div className="px-4 py-2 flex items-center gap-2 text-sm bg-red-50 border-b border-red-200 text-red-700">
        <AlertTriangle className="w-4 h-4" />
        <span>Your organization is in read-only mode. Contact support to restore access.</span>
      </div>
    );
  }

  return null;
};
