// Run with: node scripts/test-recurring-tasks.mjs <path-to-pglite-module>
// Uses an isolated, in-memory PostgreSQL instance; never connects to Supabase.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : '@electric-sql/pglite');
const db = new PGlite();
const migration = async name => db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
const manager = '00000000-0000-0000-0000-000000000001';
const employee = '00000000-0000-0000-0000-000000000002';
const other = '00000000-0000-0000-0000-000000000003';
const org = '00000000-0000-0000-0000-000000000010';
const otherOrg = '00000000-0000-0000-0000-000000000020';
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const as = id => db.query("select set_config('test.actor', $1, false)", [id]);
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.actor', true), '')::uuid $$;
    create table organizations(id uuid primary key);
    create table profiles(id uuid primary key, organization_id uuid, role text,
      status text default 'ACTIVE', name text, line_manager_id uuid);
    create function public.auth_org_id() returns uuid language sql stable as
      $$ select organization_id from profiles where id = auth.uid() $$;
    create function public.auth_role() returns text language sql stable as
      $$ select role from profiles where id = auth.uid() $$;
    create table daily_tasks(id uuid);
    insert into organizations values ('${org}'), ('${otherOrg}');
    insert into profiles(id, organization_id, role, name, line_manager_id) values
      ('${manager}', '${org}', 'MANAGER', 'Manager', null),
      ('${employee}', '${org}', 'EMPLOYEE', 'Employee', '${manager}'),
      ('${other}', '${otherOrg}', 'MANAGER', 'Other', null);
  `);
  await migration('0059_assigned_tasks.sql');
  await db.exec(`
    alter table assigned_tasks add column project_name text, add column started_at timestamptz,
      add column due_date date, add column self_created boolean default false,
      add column half_day boolean default false;
    create function assign_employee_task(p_employee_id uuid, p_description text, p_project_name text)
    returns assigned_tasks language plpgsql as $$ declare t assigned_tasks; begin
      t := assign_employee_task(p_employee_id, p_description);
      update assigned_tasks set project_name = p_project_name where id = t.id returning * into t;
      return t; end $$;
  `);
  await migration('0069_unassigned_tasks.sql');
  await migration('0084_task_work_clock.sql');
  await migration('0088_task_priority.sql');
  await migration('0094_recurring_tasks.sql');
  await as(manager);
  const [{ today }] = await query("select ((now() at time zone 'Asia/Kolkata')::date)::text as today");
  const create = async (days, offset = 0, who = employee, status = 'NOT_STARTED') => (await query(
    `select * from create_recurring_task($1, 'Weekly report', 'Project', $2::date + $3::integer, $4::integer[], $5)`,
    [who, today, offset, days, status]))[0];
  assert.equal((await query("select next_task_weekday('2026-10-23', array[1])::text as d"))[0].d, '2026-10-26');
  assert.equal((await query("select next_task_weekday('2026-10-26', array[1])::text as d"))[0].d, '2026-10-26');
  const root = await create([0, 1, 2, 3, 4, 5, 6], -14, employee, 'END');
  await as(employee);
  await db.exec('select materialize_recurring_tasks(); select materialize_recurring_tasks();');
  let rows = await query('select * from assigned_tasks where recurrence_root_id = $1 order by occurrence_date', [root.id]);
  assert.equal(rows.length, 15, 'catch up every due day exactly once');
  assert.equal(rows[0].status, 'END', 'completion history remains intact');
  assert(rows.slice(1).every(t => t.status === 'NOT_STARTED' && t.worked_seconds === 0 && !t.completed_at && !t.started_at && !t.work_resumed_at));
  await assert.rejects(query('select set_task_recurrence($1, array[1])', [root.id]), /Only active managers/);
  await assert.rejects(query("select manager_set_task_plan($1, 'HIGH', null, false)", [root.id]), /Only active managers/);
  await as(other);
  await assert.rejects(query('select set_task_recurrence($1, array[1])', [root.id]), /Task not found/);
  await as(manager);
  const before = (await query('select count(*)::integer as n from assigned_tasks'))[0].n;
  await assert.rejects(create([9]), /valid weekdays/);
  assert.equal((await query('select count(*)::integer as n from assigned_tasks'))[0].n, before, 'invalid schedule rolls back task creation');
  const future = await create([1], 7);
  assert.equal(new Date(future.due_date).getUTCDay(), 1);
  const ids = [];
  for (let i = 0; i < 20; i++) ids.push((await create([i % 7])).id);
  assert.equal(new Set(ids).size, 20);
  await query('select set_task_recurrence($1, array[2,4])', [ids[0]]);
  assert.deepEqual((await query('select recurrence_days from assigned_tasks where id = $1', [ids[0]]))[0].recurrence_days, [2, 4]);
  assert.deepEqual((await query('select recurrence_days from assigned_tasks where id = $1', [ids[1]]))[0].recurrence_days, [1]);
  await query('select set_task_recurrence($1, array[]::integer[])', [rows[1].id]);
  assert((await query('select recurrence_days, recurrence_next_date from assigned_tasks where recurrence_root_id = $1', [root.id])).every(t => t.recurrence_days.length === 0 && !t.recurrence_next_date));
  await query("select manager_set_task_plan($1, 'HIGH', $2::date + 1, false)", [root.id, today]);
  const changed = (await query('select * from assigned_tasks where id = $1', [root.id]))[0];
  assert.equal(changed.due_changes, 1);
  assert.deepEqual(changed.occurrence_date, root.occurrence_date, 'moving deadline does not change occurrence identity');
  const deleted = await create([0, 1, 2, 3, 4, 5, 6], -1);
  await db.exec('select materialize_recurring_tasks()');
  const child = (await query('select id from assigned_tasks where recurrence_root_id = $1 and id <> $1', [deleted.id]))[0];
  await query('delete from assigned_tasks where id = $1', [deleted.id]);
  const retained = (await query('select * from assigned_tasks where id = $1', [child.id]))[0];
  assert.equal(retained.recurrence_root_id, null);
  assert.deepEqual(retained.recurrence_days, []);
  console.log('PASS: migration, weekday alignment, offline catch-up, completion history, fresh clocks, idempotency, 20 independent rules, rule changes, stopping recurrence, date tracking and role/organization checks');
} finally { await db.close(); }
