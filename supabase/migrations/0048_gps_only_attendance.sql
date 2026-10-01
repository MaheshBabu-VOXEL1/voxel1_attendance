-- Attendance is GPS location only: no selfie is taken at check-in or check-out.
-- Existing photos are deleted by the cron-selfie-storage-cleanup job (Supabase
-- does not allow deleting Storage files from SQL), which empties the selfies
-- bucket and then clears attendance.selfie. The retention settings it used to
-- read are no longer used.
delete from public.settings
where organization_id is null
  and key in ('selfie_retention_days', 'selfie_cleanup_log');
