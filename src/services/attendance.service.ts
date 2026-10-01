
import { supabase, isSupabaseConfigured } from './supabase';
import { apiClient, dedupe } from './api.client';
import { Attendance } from '../types';
import { organizationService } from './organization.service';
import { notificationService } from './notification.service';
import { workdaySessionManager } from './workday/workdaySessionManager';
import { ReconcileResult } from './workday/workdaySessionManager.types';
import { checkInSyncQueue, classifySyncError } from './attendance/syncQueue';
import { CheckInSyncEntry } from './attendance/syncQueue.types';

// Attendance no longer takes a selfie (GPS location only). Drop the upload
// queue older builds left in this device's storage; it can hold large photos.
try { localStorage.removeItem('voxel1_pending_selfies'); } catch { /* storage unavailable */ }

// Cache keyed by query window: "sinceDate|untilDate|employeeId|orgId"
const attCache = new Map<string, { data: Attendance[]; ts: number }>();
const ATT_CACHE_TTL = 2 * 60 * 1000;

const DEFAULT_DAYS = 30;
const daysAgoISO = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
};

export interface GetAttendanceOptions {
  since?: string;
  until?: string;
  employeeId?: string;
  maxRows?: number;
}

const notifyLineManagerOfLate = async (data: Attendance): Promise<void> => {
  if (!isSupabaseConfigured()) return;
  const orgConfig = await organizationService.getNotificationConfig();
  if (!orgConfig.enabledTypes.includes('ATTENDANCE')) return;
  const { data: empRow } = await supabase
    .from('profiles')
    .select('line_manager_id')
    .eq('id', data.employeeId.trim())
    .single();
  const managerId = empRow?.line_manager_id;
  if (!managerId) return;
  await notificationService.createNotification({
    userId: managerId,
    type: 'ATTENDANCE',
    title: `${data.employeeName} checked in late`,
    message: `Checked in at ${data.checkIn} on ${data.date}`,
    referenceType: 'attendance',
  });
};

// Combine YYYY-MM-DD date + HH:mm[:ss] time into ISO timestamp for timestamptz columns.
// If value already looks like an ISO timestamp, pass through.
function hhmmToISO(hhmm: string | undefined, dateYMD?: string): string | null {
  if (!hhmm || hhmm === '-' || String(hhmm).trim() === '') return null;
  if (/T\d{2}:\d{2}/.test(hhmm)) return hhmm; // already ISO
  const date = dateYMD || new Date().toISOString().split('T')[0];
  const parts = String(hhmm).split(':');
  if (parts.length < 2) return null;
  const h = parts[0].padStart(2, '0');
  const m = parts[1].padStart(2, '0');
  const s = (parts[2] || '00').padStart(2, '0');
  const iso = new Date(`${date}T${h}:${m}:${s}`);
  return isNaN(iso.getTime()) ? null : iso.toISOString();
}

const buildAttendancePayload = (data: Attendance, orgId: string | undefined): any => ({
  employee_id: data.employeeId.trim(),
  employee_name: data.employeeName,
  date: data.date,
  check_in: hhmmToISO(data.checkIn, data.date),
  status: data.status,
  remarks: data.remarks || '',
  location: data.location?.address || '',
  latitude: parseFloat(String(data.location?.lat || 0)),
  longitude: parseFloat(String(data.location?.lng || 0)),
  duty_type: data.dutyType,
  organization_id: orgId,
});

// Supabase stores check_in/check_out as timestamptz (full ISO string).
// The rest of the app expects HH:mm. Convert only when the value looks like
// an ISO timestamp; leave bare HH:mm strings (legacy data) unchanged.
function isoToHHMM(val: string | null | undefined): string {
  if (!val) return '';
  if (/^\d{2}:\d{2}/.test(val)) return val.slice(0, 5); // already HH:mm
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

const mapAttendance = (r: any): Attendance => ({
  id: r.id,
  employeeId: r.employee_id ? r.employee_id.toString().trim() : '',
  employeeName: r.employee_name,
  date: r.date,
  checkIn: isoToHHMM(r.check_in),
  checkOut: isoToHHMM(r.check_out),
  status: r.status as any,
  location: {
    lat: Number(r.latitude) || 0,
    lng: Number(r.longitude) || 0,
    address: r.location || 'Unknown',
  },
  remarks: r.remarks || '',
  dutyType: r.duty_type as any,
  organizationId: r.organization_id,
});

export const attendanceService = {
  clearCache() {
    attCache.clear();
  },

  async getAttendance(options: GetAttendanceOptions = {}): Promise<Attendance[]> {
    const since = options.since !== undefined ? options.since : daysAgoISO(DEFAULT_DAYS);
    const until = options.until || '';
    const employeeId = options.employeeId || '';
    const maxRows = options.maxRows || 2000;
    const orgId = apiClient.getOrganizationId() || '';
    const cacheKey = `${since}|${until}|${employeeId}|${orgId}`;

    const cached = attCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < ATT_CACHE_TTL) return cached.data;

    return dedupe(`attendance:${cacheKey}`, async () => {
      if (!isSupabaseConfigured()) {
        console.warn('[AttendanceService] Supabase not configured');
        return [];
      }
      try {
        const role = apiClient.getAuthRole();
        const isCrossOrg = role === 'ADMIN';
        console.log('[AttendanceService] Fetching — orgId:', orgId, 'role:', role, 'crossOrg:', isCrossOrg);

        // Paginate through Supabase (capped at 1000 rows per request)
        const PAGE_SIZE = 1000;
        const allData: any[] = [];
        let offset = 0;
        while (offset < maxRows) {
          let query = supabase
            .from('attendance')
            .select('*')
            .order('date', { ascending: false })
            .range(offset, offset + PAGE_SIZE - 1);

          if (orgId && !isCrossOrg) query = query.eq('organization_id', orgId);
          if (since)      query = query.gte('date', since);
          if (until)      query = query.lte('date', until);
          if (employeeId) query = query.eq('employee_id', employeeId);

          const { data, error } = await query;
          if (error) throw error;
          if (!data || data.length === 0) break;
          allData.push(...data);
          offset += PAGE_SIZE;
          if (data.length < PAGE_SIZE) break; // last page
        }

        const result = allData.map(mapAttendance);
        const tasyeeaRecords = result.filter(r => r.employeeName?.toLowerCase().includes('tasyeea'));
        console.log('[AttendanceService] Total records:', result.length, '(pages fetched:', Math.ceil(offset / PAGE_SIZE) + ')', '| Tasyeea records:', tasyeeaRecords.length);

        attCache.set(cacheKey, { data: result, ts: Date.now() });
        return result;
      } catch (e: any) {
        console.error('[AttendanceService] Failed to fetch attendance:', e?.message || e);
        return [];
      }
    });
  },

  // FROZEN: delegates to workdaySessionManager.
  // Do not change this delegation without the plan-approval gate in CLAUDE.md.
  async getActiveAttendance(employeeId: string): Promise<Attendance | undefined> {
    const { active } = await workdaySessionManager.reconcileOpenSessions(employeeId);
    return active;
  },

  async getActiveAttendanceWithReconciliation(employeeId: string): Promise<ReconcileResult> {
    return workdaySessionManager.reconcileOpenSessions(employeeId);
  },

  async saveAttendance(data: Attendance) {
    if (!isSupabaseConfigured()) return;
    const orgId = apiClient.getOrganizationId();

    const payload = buildAttendancePayload(data, orgId ?? undefined);
    try {
      const { error } = await supabase
        .from('attendance')
        .insert(payload);
      if (error) throw error;
    } catch (err: any) {
      const syncErr = classifySyncError(err);
      // A refusal (e.g. outside the office radius) would fail again on retry.
      if (!syncErr.retryable) throw err;
      try {
        checkInSyncQueue.enqueue({
          kind: 'CHECK_IN',
          payload: data,
          occurredAt: Date.now(),
        });
        console.warn('[AttendanceService] Check-in enqueued for later sync:', syncErr.code);
      } catch (enqueueErr) {
        console.error('[AttendanceService] Could not enqueue check-in:', enqueueErr);
      }
      throw err;
    }
    attendanceService.clearCache();
    apiClient.notify();

    if (data.status === 'LATE') {
      notifyLineManagerOfLate(data).catch((e: any) => {
        console.error('[AttendanceService] Failed to send late alert:', e?.message || e);
      });
    }
  },

  async drainCheckInQueue(): Promise<void> {
    if (!isSupabaseConfigured()) return;
    const orgId = apiClient.getOrganizationId();
    const MAX_DRAIN_PER_TICK = 10;
    let drained = 0;

    while (drained < MAX_DRAIN_PER_TICK) {
      const entry: CheckInSyncEntry | null = checkInSyncQueue.pickNext();
      if (!entry) break;

      try {
        const effectiveOrgId = entry.payload.organizationId || orgId;
        const pbPayload = buildAttendancePayload(entry.payload as Attendance, effectiveOrgId ?? undefined);
        const { error } = await supabase
          .from('attendance')
          .insert(pbPayload);
        if (error) throw error;
        checkInSyncQueue.markSuccess(entry.id);
        drained += 1;
      } catch (err: any) {
        const syncErr = classifySyncError(err);
        checkInSyncQueue.markFailure(entry.id, syncErr);
        break;
      }
    }

    if (drained > 0) {
      attendanceService.clearCache();
      apiClient.notify();
    }
  },

  async updateAttendance(id: string, data: Partial<Attendance>) {
    if (!isSupabaseConfigured()) return;
    // Resolve target date for time→timestamp conversion: explicit data.date, then existing row.
    let targetDate = data.date;
    if (!targetDate && (data.checkIn || data.checkOut)) {
      const { data: existing } = await supabase
        .from('attendance')
        .select('date')
        .eq('id', id.trim())
        .single();
      targetDate = existing?.date;
    }
    const updates: any = {};
    if (data.date)     updates.date = data.date;
    if (data.checkIn)  updates.check_in = hhmmToISO(data.checkIn, targetDate);
    if (data.checkOut) updates.check_out = hhmmToISO(data.checkOut, targetDate);
    if (data.remarks !== undefined) updates.remarks = data.remarks;
    if (data.checkOutLocation) {
      updates.check_out_latitude = data.checkOutLocation.lat;
      updates.check_out_longitude = data.checkOutLocation.lng;
    }
    if (data.status)   updates.status = data.status;
    const { error } = await supabase.from('attendance').update(updates).eq('id', id.trim());
    if (error) throw error;
    attendanceService.clearCache();
    apiClient.notify();
  },

  async deleteAttendance(id: string) {
    if (!isSupabaseConfigured()) return;
    const { error } = await supabase.from('attendance').delete().eq('id', id.trim());
    if (error) throw error;
    attendanceService.clearCache();
    apiClient.notify();
  },
};
