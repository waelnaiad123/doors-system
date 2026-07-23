-- ============================================================================
-- نظام متابعة تركيبات الأبواب - قاعدة البيانات الكاملة (Supabase / PostgreSQL)
-- ============================================================================
-- هذا الملف يُنفَّذ مرة واحدة داخل: Supabase Dashboard > SQL Editor > New Query
-- يبني: الجداول + الصلاحيات (Row Level Security) + Views التقارير + بيانات أولية
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) الإضافات المطلوبة (للبحث السريع بأي حرف داخل النص)
-- ----------------------------------------------------------------------------
create extension if not exists pg_trgm;

-- ----------------------------------------------------------------------------
-- 1) الأدوار (Roles)
-- ----------------------------------------------------------------------------
create type public.user_role as enum (
  'admin',            -- الأدمن
  'data_entry',       -- مدخل بيانات المشاريع
  'technician',       -- فني التركيب
  'supervisor',       -- المشرف
  'engineer',         -- المهندس
  'delivery_entry'    -- مدخل بيانات التسليمات
);

create type public.install_status as enum ('pending_review', 'approved', 'rejected');
create type public.delivery_type as enum ('client', 'consultant');

-- ----------------------------------------------------------------------------
-- 2) المستخدمون (يُبنى فوق نظام Auth الخاص بـ Supabase)
-- ----------------------------------------------------------------------------
-- ملاحظة مهمة بخصوص كلمات السر:
-- Supabase يخزّن كلمات السر مُشفّرة (hashed) ولا يمكن لأي شخص -ولا حتى الأدمن- رؤيتها كنص صريح، وهذا معيار أمان عالمي.
-- البديل الآمن والمكافئ لما طلبته: الأدمن يقدر في أي وقت "يعيد تعيين" كلمة سر أي مستخدم فورًا (بدون الحاجة لمعرفة القديمة).
-- هذه الوظيفة ستُبنى في لوحة تحكم الأدمن بالواجهة الأمامية (المرحلة القادمة) عبر صلاحية إدارية خاصة.

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  role          public.user_role not null,
  phone         text,
  employee_code text unique,              -- كود الموظف (اختياري، للعرض والبحث)
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create index idx_profiles_role on public.profiles(role);

-- ----------------------------------------------------------------------------
-- 3) المشاريع
-- ----------------------------------------------------------------------------
create table public.projects (
  id             uuid primary key default gen_random_uuid(),
  project_number text not null unique,
  project_name   text not null,
  client_name    text,
  location_code  text,                    -- كود مكان المشروع
  notes          text,
  is_active      boolean not null default true,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);

create index idx_projects_number on public.projects using gin (project_number gin_trgm_ops);
create index idx_projects_name   on public.projects using gin (project_name gin_trgm_ops);
create index idx_projects_client on public.projects using gin (client_name gin_trgm_ops);
create index idx_projects_loc    on public.projects using gin (location_code gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- 4) الأبواب
-- ----------------------------------------------------------------------------
create table public.doors (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  door_code   text not null,              -- رقم/كود الباب داخل المشروع
  location    text,                       -- الدور / المبنى / الموقع داخل المشروع
  notes       text,
  created_at  timestamptz not null default now(),
  unique (project_id, door_code)
);

create index idx_doors_project on public.doors(project_id);
create index idx_doors_code    on public.doors using gin (door_code gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- 5) أنواع البنود (الحلق - الضلفة - وكل أنواع الإكسسوارات)
-- ----------------------------------------------------------------------------
create table public.item_types (
  id       uuid primary key default gen_random_uuid(),
  name     text not null unique,
  category text not null default 'accessory'   -- 'frame' | 'leaf' | 'accessory'
);

insert into public.item_types (name, category) values
  ('حلق', 'frame'),
  ('ضلفة', 'leaf'),
  ('كالون', 'accessory'),
  ('أكرة', 'accessory'),
  ('بانيك', 'accessory'),
  ('ترباس', 'accessory'),
  ('ماكينة غلق', 'accessory'),
  ('مهدئ', 'accessory'),
  ('ستارة', 'accessory'),
  ('كيك بليت', 'accessory'),
  ('فرش', 'accessory'),
  ('صدادة', 'accessory');
-- يمكن إضافة أي نوع آخر لاحقًا بسهولة بإدراج سطر جديد هنا، دون تعديل أي كود.

-- ----------------------------------------------------------------------------
-- 6) بنود كل باب (الـ BOM الخاص بكل باب - يختلف من باب لباب)
-- ----------------------------------------------------------------------------
create table public.door_items (
  id            uuid primary key default gen_random_uuid(),
  door_id       uuid not null references public.doors(id) on delete cascade,
  item_type_id  uuid not null references public.item_types(id),
  quantity      integer not null default 1,
  notes         text,
  created_at    timestamptz not null default now(),
  unique (door_id, item_type_id)
);

create index idx_door_items_door on public.door_items(door_id);
create index idx_door_items_type on public.door_items(item_type_id);

-- ----------------------------------------------------------------------------
-- 7) تخصيص المشاريع للمستخدمين (فني / مشرف / مهندس / مدخل بيانات / مدخل تسليمات)
--    مع دعم "تقسيم المشروع" على أكثر من شخص لنفس الدور
-- ----------------------------------------------------------------------------
create table public.project_assignments (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  user_id       uuid not null references public.profiles(id),
  role          public.user_role not null,
  assigned_by   uuid references public.profiles(id),
  assigned_at   timestamptz not null default now(),
  unassigned_at timestamptz,               -- عند إعادة التخصيص لشخص آخر، يُقفل هنا بدل الحذف (نحتفظ بالتاريخ)
  is_active     boolean not null default true,
  notes         text
);

create index idx_pa_project on public.project_assignments(project_id);
create index idx_pa_user    on public.project_assignments(user_id);
create index idx_pa_active  on public.project_assignments(project_id, role, is_active);

-- نطاق التخصيص: أبواب محددة داخل المشروع (لتقسيم مشروع كبير بين عدة أفراد لنفس الدور)
-- إن لم يوجد أي سطر هنا لتخصيص معيّن => يعني هذا الشخص مسؤول عن كامل أبواب المشروع
create table public.project_assignment_doors (
  assignment_id uuid not null references public.project_assignments(id) on delete cascade,
  door_id       uuid not null references public.doors(id) on delete cascade,
  primary key (assignment_id, door_id)
);

-- ----------------------------------------------------------------------------
-- 8) سجلات التركيب (تسجيل الفني اليومي + اعتماد المشرف)
-- ----------------------------------------------------------------------------
create table public.installation_records (
  id            uuid primary key default gen_random_uuid(),
  door_item_id  uuid not null references public.door_items(id) on delete cascade,
  technician_id uuid not null references public.profiles(id),
  installed_at  date not null default current_date,
  status        public.install_status not null default 'pending_review',
  supervisor_id uuid references public.profiles(id),
  reviewed_at   timestamptz,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- يمنع تسجيل نفس البند مرتين طالما لم يُرفض التسجيل السابق
create unique index uq_installation_active_item
  on public.installation_records(door_item_id)
  where (status <> 'rejected');

create index idx_ir_tech   on public.installation_records(technician_id, installed_at);
create index idx_ir_status on public.installation_records(status);
create index idx_ir_item   on public.installation_records(door_item_id);

-- ----------------------------------------------------------------------------
-- 9) التسليمات (للعميل بتاريخ، أو للاستشاري بكود WIR)
-- ----------------------------------------------------------------------------
create table public.deliveries (
  id                  uuid primary key default gen_random_uuid(),
  door_item_id        uuid not null references public.door_items(id) on delete cascade,
  delivery_type       public.delivery_type not null,
  client_delivery_date date,
  consultant_wir_code text,
  delivered_by        uuid references public.profiles(id),
  delivered_at        timestamptz not null default now(),
  notes                text,
  constraint chk_delivery_fields check (
    (delivery_type = 'client'     and client_delivery_date is not null) or
    (delivery_type = 'consultant' and consultant_wir_code  is not null)
  )
);

create unique index uq_delivery_item_type on public.deliveries(door_item_id, delivery_type);
create index idx_del_item on public.deliveries(door_item_id);

-- ----------------------------------------------------------------------------
-- 10) سجل التتبع (Audit Log) - خاصة لإعادة التخصيص والتعديلات بعد الاعتماد
-- ----------------------------------------------------------------------------
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  table_name  text not null,
  record_id   uuid not null,
  action      text not null,
  changed_by  uuid references public.profiles(id),
  changed_at  timestamptz not null default now(),
  old_data    jsonb,
  new_data    jsonb
);

create index idx_audit_record on public.audit_log(table_name, record_id);

-- ============================================================================
-- 11) دوال مساعدة للصلاحيات (تُستخدم داخل RLS)
-- ============================================================================
create or replace function public.is_admin()
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin' and is_active
  );
$$;

create or replace function public.my_role()
returns public.user_role language sql stable security definer as $$
  select role from public.profiles where id = auth.uid();
$$;

-- هل لدي دور معين على مشروع (بدون النظر لنطاق الأبواب)؟
create or replace function public.has_project_role(p_project_id uuid, p_roles public.user_role[])
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.project_assignments pa
    where pa.project_id = p_project_id
      and pa.user_id = auth.uid()
      and pa.is_active
      and pa.role = any(p_roles)
  );
$$;

-- هل لدي وصول لباب معين ضمن نطاقي (يأخذ في الاعتبار تقسيم المشروع)؟
create or replace function public.has_door_access(p_door_id uuid, p_roles public.user_role[])
returns boolean language sql stable security definer as $$
  select exists (
    select 1
    from public.doors d
    join public.project_assignments pa on pa.project_id = d.project_id
    where d.id = p_door_id
      and pa.user_id = auth.uid()
      and pa.is_active
      and pa.role = any(p_roles)
      and (
        not exists (select 1 from public.project_assignment_doors x where x.assignment_id = pa.id)
        or exists (select 1 from public.project_assignment_doors x
                    where x.assignment_id = pa.id and x.door_id = d.id)
      )
  );
$$;

-- ============================================================================
-- 12) تفعيل RLS على كل الجداول
-- ============================================================================
alter table public.profiles                 enable row level security;
alter table public.projects                  enable row level security;
alter table public.doors                     enable row level security;
alter table public.item_types                enable row level security;
alter table public.door_items                enable row level security;
alter table public.project_assignments       enable row level security;
alter table public.project_assignment_doors  enable row level security;
alter table public.installation_records      enable row level security;
alter table public.deliveries                enable row level security;
alter table public.audit_log                 enable row level security;

-- ---- profiles ----
create policy "read profiles" on public.profiles for select
  using (true);  -- الأسماء والأدوار تظهر للجميع (تُستخدم بالتقارير)، بدون بيانات حساسة أخرى

create policy "update own profile" on public.profiles for update
  using (auth.uid() = id or public.is_admin());

create policy "admin inserts profiles" on public.profiles for insert
  with check (public.is_admin());

-- ---- item_types (مرجع عام، يقرأه الجميع، يعدله الأدمن فقط) ----
create policy "read item types" on public.item_types for select using (true);
create policy "admin manages item types" on public.item_types for all
  using (public.is_admin()) with check (public.is_admin());

-- ---- projects ----
create policy "see assigned projects" on public.projects for select
  using (
    public.is_admin()
    or exists (select 1 from public.project_assignments pa
               where pa.project_id = projects.id and pa.user_id = auth.uid() and pa.is_active)
  );

create policy "admin or data_entry create projects" on public.projects for insert
  with check (public.is_admin() or public.my_role() = 'data_entry');

create policy "admin or assigned data_entry/engineer edit projects" on public.projects for update
  using (public.is_admin() or public.has_project_role(id, array['data_entry','engineer']::public.user_role[]));

-- ---- doors / door_items (رؤية كاملة لكل من له أي دور على المشروع) ----
create policy "see doors of my projects" on public.doors for select
  using (public.is_admin() or public.has_project_role(project_id, array['data_entry','technician','supervisor','engineer','delivery_entry']::public.user_role[]));

create policy "data_entry/admin manage doors" on public.doors for insert
  with check (public.is_admin() or public.has_project_role(project_id, array['data_entry']::public.user_role[]));

create policy "data_entry/admin update doors" on public.doors for update
  using (public.is_admin() or public.has_project_role(project_id, array['data_entry','engineer']::public.user_role[]));

create policy "see door_items of my projects" on public.door_items for select
  using (
    public.is_admin() or exists (
      select 1 from public.doors d
      where d.id = door_items.door_id
        and public.has_project_role(d.project_id, array['data_entry','technician','supervisor','engineer','delivery_entry']::public.user_role[])
    )
  );

create policy "data_entry/admin manage door_items" on public.door_items for insert
  with check (
    public.is_admin() or exists (
      select 1 from public.doors d
      where d.id = door_items.door_id
        and public.has_project_role(d.project_id, array['data_entry']::public.user_role[])
    )
  );

create policy "data_entry/admin update door_items" on public.door_items for update
  using (
    public.is_admin() or exists (
      select 1 from public.doors d
      where d.id = door_items.door_id
        and public.has_project_role(d.project_id, array['data_entry','engineer']::public.user_role[])
    )
  );

-- ---- project_assignments (التخصيص نفسه يديره الأدمن أو المهندس المسؤول) ----
create policy "see assignments of my projects" on public.project_assignments for select
  using (public.is_admin() or public.has_project_role(project_id, array['data_entry','technician','supervisor','engineer','delivery_entry']::public.user_role[]));

create policy "admin/engineer manage assignments" on public.project_assignments for insert
  with check (public.is_admin() or public.has_project_role(project_id, array['engineer']::public.user_role[]));

create policy "admin/engineer update assignments" on public.project_assignments for update
  using (public.is_admin() or public.has_project_role(project_id, array['engineer']::public.user_role[]));

create policy "see assignment doors" on public.project_assignment_doors for select
  using (
    public.is_admin() or exists (
      select 1 from public.project_assignments pa
      where pa.id = project_assignment_doors.assignment_id
        and public.has_project_role(pa.project_id, array['data_entry','technician','supervisor','engineer','delivery_entry']::public.user_role[])
    )
  );

create policy "admin/engineer manage assignment doors" on public.project_assignment_doors for insert
  with check (
    public.is_admin() or exists (
      select 1 from public.project_assignments pa
      where pa.id = project_assignment_doors.assignment_id
        and public.has_project_role(pa.project_id, array['engineer']::public.user_role[])
    )
  );

-- ---- installation_records ----
create policy "technician sees own entries" on public.installation_records for select
  using (
    public.is_admin()
    or technician_id = auth.uid()
    or exists ( -- المشرف/المهندس يرى كل إدخالات المشروع الذي هو مسؤول عنه
      select 1 from public.door_items di join public.doors d on d.id = di.door_id
      where di.id = installation_records.door_item_id
        and public.has_project_role(d.project_id, array['supervisor','engineer']::public.user_role[])
    )
  );

create policy "technician inserts own installs" on public.installation_records for insert
  with check (
    technician_id = auth.uid()
    and public.has_door_access(
      (select door_id from public.door_items where id = door_item_id),
      array['technician']::public.user_role[]
    )
  );

create policy "supervisor approves / engineer-admin edit anytime" on public.installation_records for update
  using (
    public.is_admin()
    or exists ( -- المشرف يعتمد إدخالات مشروعه فقط
      select 1 from public.door_items di join public.doors d on d.id = di.door_id
      where di.id = installation_records.door_item_id
        and public.has_project_role(d.project_id, array['supervisor','engineer']::public.user_role[])
    )
  );

-- ---- deliveries ----
create policy "see deliveries of my projects" on public.deliveries for select
  using (
    public.is_admin() or exists (
      select 1 from public.door_items di join public.doors d on d.id = di.door_id
      where di.id = deliveries.door_item_id
        and public.has_project_role(d.project_id, array['delivery_entry','supervisor','engineer']::public.user_role[])
    )
  );

create policy "delivery_entry registers deliveries of installed items only" on public.deliveries for insert
  with check (
    delivered_by = auth.uid()
    and public.has_door_access(
      (select door_id from public.door_items where id = door_item_id),
      array['delivery_entry']::public.user_role[]
    )
    and exists ( -- لازم يكون البند تم اعتماد تركيبه (approved) قبل السماح بتسليمه
      select 1 from public.installation_records ir
      where ir.door_item_id = deliveries.door_item_id and ir.status = 'approved'
    )
  );

-- ---- audit_log (قراءة فقط، للأدمن والمهندس) ----
create policy "admin/engineer read audit" on public.audit_log for select
  using (public.is_admin() or public.my_role() = 'engineer');

-- ============================================================================
-- 13) Views جاهزة للتقارير (تُبنى فوقها الفلاتر من الواجهة الأمامية)
--     security_invoker = true  =>  تُطبَّق عليها نفس صلاحيات RLS للمستخدم الحالي
-- ============================================================================
create view public.v_installations_detail
with (security_invoker = true) as
select
  ir.id                as installation_id,
  p.id                 as project_id,
  p.project_number,
  p.project_name,
  p.client_name,
  p.location_code,
  d.id                 as door_id,
  d.door_code,
  it.name              as item_type,
  it.category           as item_category,
  di.quantity,
  ir.technician_id,
  tech.full_name        as technician_name,
  ir.supervisor_id,
  sup.full_name         as supervisor_name,
  ir.installed_at,
  ir.status,
  ir.reviewed_at
from public.installation_records ir
join public.door_items di on di.id = ir.door_item_id
join public.doors d       on d.id = di.door_id
join public.projects p    on p.id = d.project_id
join public.item_types it on it.id = di.item_type_id
join public.profiles tech on tech.id = ir.technician_id
left join public.profiles sup on sup.id = ir.supervisor_id;

create view public.v_deliveries_detail
with (security_invoker = true) as
select
  dl.id                as delivery_id,
  p.id                 as project_id,
  p.project_number,
  p.project_name,
  p.client_name,
  d.id                 as door_id,
  d.door_code,
  it.name              as item_type,
  di.quantity,
  dl.delivery_type,
  dl.client_delivery_date,
  dl.consultant_wir_code,
  dl.delivered_by,
  usr.full_name        as delivered_by_name,
  dl.delivered_at
from public.deliveries dl
join public.door_items di on di.id = dl.door_item_id
join public.doors d       on d.id = di.door_id
join public.projects p    on p.id = d.project_id
join public.item_types it on it.id = di.item_type_id
left join public.profiles usr on usr.id = dl.delivered_by;

-- عدد بنود كل مشروع (المطلوب إجماليًا) مقابل ما تم تركيبه واعتماده -> يُستخدم لحساب النسب المئوية
create view public.v_project_progress
with (security_invoker = true) as
select
  p.id as project_id, p.project_number, p.project_name,
  it.name as item_type,
  count(di.id) as total_required,
  count(ir.id) filter (where ir.status = 'approved') as total_approved,
  round(
    100.0 * count(ir.id) filter (where ir.status = 'approved') / nullif(count(di.id), 0), 1
  ) as approved_percentage
from public.projects p
join public.doors d on d.project_id = p.id
join public.door_items di on di.door_id = d.id
join public.item_types it on it.id = di.item_type_id
left join public.installation_records ir on ir.door_item_id = di.id and ir.status = 'approved'
group by p.id, p.project_number, p.project_name, it.name;

-- ============================================================================
-- تم بناء القاعدة. الخطوة التالية: تنفيذ هذا الملف داخل مشروع Supabase مجاني.
-- ============================================================================
