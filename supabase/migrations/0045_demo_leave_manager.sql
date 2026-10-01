-- Keep the sample employee's leave requests in the sample manager's queue.
-- Scope every correction to the demo organization and these two demo users.
update public.profiles employee
set line_manager_id = manager.id
from public.profiles manager, public.organizations org
where employee.organization_id = org.id
  and manager.organization_id = org.id
  and org.is_demo = true
  and employee.email = 'demo-employee@openhrapp.com'
  and manager.email = 'demo-manager@openhrapp.com'
  and employee.line_manager_id is distinct from manager.id;

update public.leaves leave_request
set line_manager_id = manager.id::text,
    status = 'PENDING_MANAGER'
from public.profiles employee, public.profiles manager, public.organizations org
where leave_request.organization_id = org.id
  and employee.organization_id = org.id
  and manager.organization_id = org.id
  and org.is_demo = true
  and employee.email = 'demo-employee@openhrapp.com'
  and manager.email = 'demo-manager@openhrapp.com'
  and leave_request.employee_id = employee.id::text
  and leave_request.status = 'PENDING_HR'
  and leave_request.line_manager_id is null;
