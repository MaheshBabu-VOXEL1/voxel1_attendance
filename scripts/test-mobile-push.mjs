// Isolated PostgreSQL checks. Never connects to production.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const q = async sql => (await db.query(sql)).rows;
try {
 await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create schema auth;
 create function auth.uid() returns uuid language sql as $$select current_setting('test.actor')::uuid$$;
 create table profiles(id uuid primary key, organization_id uuid, role text, name text, status text default 'ACTIVE');
 create table notifications(id uuid primary key default gen_random_uuid(), organization_id uuid,user_id uuid,type text,title text,message text,reference_id text,reference_type text,action_url text);
 create table assigned_tasks(id uuid primary key default gen_random_uuid(),organization_id uuid,employee_id uuid,employee_name text,manager_name text,description text,status text,self_created boolean default false);
 create table task_comments(id uuid primary key default gen_random_uuid(),task_id uuid,author_name text,body text);
 create table attendance(id uuid primary key default gen_random_uuid(),organization_id uuid,employee_id text,check_in timestamptz,check_out timestamptz);
 create function try_uuid(text) returns uuid language sql as $$select $1::uuid$$;
 insert into profiles(id,organization_id,role,name) values
 ('${id(1)}','${id(10)}','MANAGER','Manager'),('${id(2)}','${id(10)}','EMPLOYEE','Employee'),
 ('${id(3)}','${id(20)}','MANAGER','Other manager');
 select set_config('test.actor','${id(2)}',false);
 `);
 await db.exec(await readFile(new URL('../supabase/migrations/0100_mobile_notifications.sql',import.meta.url),'utf8'));
 await db.exec(`select register_mobile_push('employee-device-token-12345');
 select set_config('test.actor','${id(1)}',false);
 select register_mobile_push('manager-device-token-12345');
 insert into assigned_tasks(id,organization_id,employee_id,employee_name,manager_name,description,status)
 values('${id(100)}','${id(10)}','${id(2)}','Employee','Manager','Test task','NOT_STARTED');`);
 assert.equal((await q('select * from notifications')).length,2,'assignment reaches employee and org manager');
 assert.equal((await q('select * from mobile_push_queue')).length,2);
 assert.equal((await q(`select * from notifications where user_id = '${id(3)}'`)).length,0,'other organization excluded');
 await db.exec(`update assigned_tasks set status = 'START'; update assigned_tasks set description = 'Edited';
 insert into task_comments(task_id,author_name,body) values('${id(100)}','Employee','Comment');
 insert into attendance(organization_id,employee_id,check_in) values('${id(10)}','${id(2)}',now());
 update attendance set check_out = now();`);
 assert.equal((await q('select * from notifications')).length,6,'status, comment, check-in, checkout each notify manager; edits do not');
 const jobs = await q('select * from claim_mobile_push()');
 assert.equal(jobs.length,6);
 assert.equal((await q('select * from claim_mobile_push()')).length,0,'lease prevents concurrent delivery');
 await db.exec(`select set_config('test.actor','${id(2)}',false); select register_mobile_push('manager-device-token-12345');`);
 assert.equal((await q(`select user_id from mobile_push_tokens where token = 'manager-device-token-12345'`))[0].user_id,id(2),'shared phone transfers to current account');
 await db.exec(`select unregister_mobile_push('manager-device-token-12345');`);
 assert.equal((await q('select * from mobile_push_queue')).length,1,'unregister cascades pending device jobs');
 await db.exec(`update profiles set status = 'INACTIVE' where id = '${id(2)}';`);
 await assert.rejects(db.exec(`select register_mobile_push('inactive-device-token-12345')`),/Active account/);
 console.log('Mobile push database checks passed');
} finally { await db.close(); }
