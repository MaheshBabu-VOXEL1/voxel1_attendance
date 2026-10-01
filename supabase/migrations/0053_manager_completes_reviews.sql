-- Performance reviews finish with the manager's review; there is no Admin
-- sign-off step any more (Voxel1 has one manager). The app now completes a
-- review when the manager submits it. Reviews already waiting for the old
-- Admin step are completed as they stand.
update public.performance_reviews
set status = 'COMPLETED',
    completed_at = coalesce(completed_at, manager_reviewed_at, now())
where status = 'MANAGER_REVIEWED';
