-- The product is Voxel1. Rename the old product name in stored email
-- templates (seeded by earlier migrations) so no email says OpenHRApp.
update public.email_templates
set
  name             = replace(replace(name,             'OpenHRApp', 'Voxel1'), 'OpenHR', 'Voxel1'),
  description      = replace(replace(description,      'OpenHRApp', 'Voxel1'), 'OpenHR', 'Voxel1'),
  subject_template = replace(replace(subject_template, 'OpenHRApp', 'Voxel1'), 'OpenHR', 'Voxel1'),
  body_template    = replace(replace(body_template,    'OpenHRApp', 'Voxel1'), 'OpenHR', 'Voxel1'),
  ai_prompt        = replace(replace(ai_prompt,        'OpenHRApp', 'Voxel1'), 'OpenHR', 'Voxel1')
where name like '%OpenHR%'
   or description like '%OpenHR%'
   or subject_template like '%OpenHR%'
   or body_template like '%OpenHR%'
   or ai_prompt like '%OpenHR%';
