# Recurring tasks

Managers can select **Repeat weekly** and one or more weekdays when adding a task.
The due date is the first eligible date; without a date the schedule starts today.
Weekdays and day boundaries use Asia/Kolkata time.

Each task has an independent schedule. A batch starts with the selected weekdays
for every task; open an individual task to change its weekdays or stop recurrence.
Manager and admin permissions are checked in the database. Existing manager-only
deadline controls still apply; moving a deadline changes that occurrence only.

Each scheduled day gets a separate task, initially Not started, with a fresh work
clock and comments. Completed occurrences retain their history. Unfinished work
stays visible when the next occurrence arrives. New occurrences copy assignment,
description, project and priority from the most recent occurrence in the series.
Stopping recurrence preserves existing occurrences.

Task loading generates due occurrences transactionally. No cron service is needed;
the next load catches up after everyone has been offline. Employee lists hide the
first occurrence until its scheduled day; managers can see it in advance.

## Deployment

Apply `supabase/migrations/0094_recurring_tasks.sql` before deploying the frontend.
Recurring operations require the new RPC functions. Before the migration, existing
one-off tasks still load and recurring operations explain which migration is needed.
The migration does not change existing
one-off tasks into recurring tasks.

## Validation

Run the usual Vitest tests, TypeScript check and production build. Database behavior
can be checked against a disposable in-memory PostgreSQL runtime with:

```text
node scripts/test-recurring-tasks.mjs <absolute-path-to-@electric-sql/pglite/dist/index.js>
```

The runtime is a test-only tool and is not a production dependency.
