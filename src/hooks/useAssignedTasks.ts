import { useCallback, useEffect, useRef, useState } from 'react';
import { assignedTaskService, AssignedTask } from '../services/assignedTask.service';

export function useAssignedTasks(employeeId?: string) {
  const [tasks, setTasks] = useState<AssignedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const alive = useRef(false);
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++request.current;
    try {
      const rows = await assignedTaskService.list(employeeId);
      if (alive.current && version === request.current) { setTasks(rows); setError(''); }
    } catch (e) {
      if (alive.current && version === request.current) setError(e instanceof Error ? e.message : 'Could not load tasks.');
    } finally {
      if (alive.current && version === request.current) setLoading(false);
    }
  }, [employeeId]);
  useEffect(() => {
    alive.current = true;
    setLoading(true);
    void refresh();
    const tick = () => { if (!document.hidden) void refresh(); };
    const timer = window.setInterval(tick, 10000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => { alive.current = false; ++request.current; clearInterval(timer); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick); };
  }, [refresh]);
  return { tasks, loading, error, refresh };
}

