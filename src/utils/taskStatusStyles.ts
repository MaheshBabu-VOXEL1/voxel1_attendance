import type { TaskStatus } from '../services/assignedTask.service';

export const taskStatusStyles: Record<TaskStatus, { badge: string; selected: string; option: string; radio: string }> = {
  NOT_STARTED: { badge: 'bg-red-100 text-red-800', selected: 'border-red-500 bg-red-100 text-red-800', option: 'border-red-200 text-red-700', radio: 'accent-red-600' },
  START: { badge: 'bg-blue-100 text-blue-800', selected: 'border-blue-500 bg-blue-100 text-blue-800', option: 'border-blue-200 text-blue-700 hover:bg-blue-50', radio: 'accent-blue-600' },
  PROGRESS: { badge: 'bg-orange-100 text-orange-800', selected: 'border-orange-500 bg-orange-100 text-orange-800', option: 'border-orange-200 text-orange-700 hover:bg-orange-50', radio: 'accent-orange-600' },
  STUCK: { badge: 'bg-rose-100 text-rose-800', selected: 'border-rose-500 bg-rose-100 text-rose-800', option: 'border-rose-200 text-rose-700 hover:bg-rose-50', radio: 'accent-rose-600' },
  END: { badge: 'bg-green-100 text-green-800', selected: 'border-green-500 bg-green-100 text-green-800', option: 'border-green-200 text-green-700 hover:bg-green-50', radio: 'accent-green-600' },
};
