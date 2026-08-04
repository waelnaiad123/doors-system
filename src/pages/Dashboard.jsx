import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAll'
import { useAuth } from '../AuthContext'
import { ROLES } from '../lib/roles'

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

function todayLabel() {
  const d = new Date()
  return `${WEEKDAYS[d.getDay()]}، ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function Corners() {
  return (
    <>
      <span className="corner tl" /><span className="corner tr" />
      <span className="corner bl" /><span className="corner br" />
    </>
  )
}

function Stat({ to, label, value, tone }) {
  return (
    <Link to={to} className="dash-stat">
      <Corners />
      <div className="label">{label}</div>
      <div className={`value${tone ? ` ${tone}` : ''}`}>{value}</div>
    </Link>
  )
}

export default function Dashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState([])
  const [attention, setAttention] = useState([])
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, []) // eslint-disable-line

  async function load() {
    setLoading(true)
    try {
      if (profile.role === 'admin' || profile.is_installations_manager) await loadAdminLike()
      else if (profile.role === 'engineer') await loadEngineer()
      else if (profile.role === 'supervisor') await loadSupervisor()
      else if (profile.role === 'technician') await loadTechnician()
      else if (profile.role === 'data_entry') await loadDataEntry()
      else if (profile.role === 'delivery_entry') await loadDeliveryEntry()
    } catch (e) {
      // لوحة التحكم عرض سريع بس، لو فشل جزء منها نكمل بهدوء من غير ما نوقف الشاشة
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  async function loadAdminLike() {
    const [{ count: projectsCount }, { count: usersCount }, { data: pendingItems }, { data: pendingInstalls }] = await Promise.all([
      supabase.from('projects').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true),
      fetchAllRows((from, to) => supabase.from('door_items').select('id').eq('status', 'pending_review').range(from, to)),
      fetchAllRows((from, to) => supabase.from('v_installations_detail').select('status').in('status', ['pending_review', 'supervisor_approved']).range(from, to)),
    ])
    setStats([
      { to: '/projects', label: 'المشاريع النشطة', value: projectsCount ?? '—' },
      { to: '/users', label: 'مستخدمون نشطون', value: usersCount ?? '—' },
      { to: '/projects', label: 'بنود بانتظار الاعتماد', value: (pendingItems || []).length, tone: 'warn' },
      { to: '/approval', label: 'تركيبات بانتظار الاعتماد', value: (pendingInstalls || []).length, tone: 'warn' },
    ])
    setActions([
      { to: '/users', label: 'المستخدمون' },
      { to: '/projects-overview', label: 'نظرة عامة على المشاريع' },
      { to: '/productivity-summary', label: 'ملخص إنتاجية المهندسين' },
      { to: '/backup', label: 'نسخة احتياطية' },
    ])
  }

  async function loadEngineer() {
    const { data: myAssigns } = await fetchAllRows((from, to) =>
      supabase.from('project_assignments').select('project_id, projects(project_name)')
        .eq('user_id', profile.id).eq('role', 'engineer').eq('is_active', true).range(from, to)
    )
    const projectIds = [...new Set((myAssigns || []).map((a) => a.project_id))]

    const [{ data: pendingInstalls }, { data: pendingNotes }, { data: pendingDeliveries }] = await Promise.all([
      projectIds.length
        ? fetchAllRows((from, to) => supabase.from('v_installations_detail').select('project_id, project_name').in('project_id', projectIds).in('status', ['pending_review', 'supervisor_approved']).range(from, to))
        : Promise.resolve({ data: [] }),
      fetchAllRows((from, to) => supabase.from('daily_project_notes').select('id, project_id, projects(project_name)').eq('status', 'pending_review').range(from, to)),
      fetchAllRows((from, to) => supabase.from('v_deliveries_detail').select('project_id, project_name').eq('status', 'pending_review').range(from, to)),
    ])

    setStats([
      { to: '/assignments', label: 'مشاريعي', value: projectIds.length },
      { to: '/approval', label: 'تركيبات بانتظار اعتمادي', value: (pendingInstalls || []).length, tone: (pendingInstalls || []).length ? 'warn' : undefined },
      { to: '/approval', label: 'ملاحظات بانتظار اعتمادي', value: (pendingNotes || []).length, tone: (pendingNotes || []).length ? 'warn' : undefined },
      { to: '/approval', label: 'تسليمات بانتظار اعتمادي', value: (pendingDeliveries || []).length, tone: (pendingDeliveries || []).length ? 'warn' : undefined },
    ])

    // مشاريع محتاجة إعداد (بنود معلّقة أو فريق ناقص)
    if (projectIds.length > 0) {
      const { data: doorsWithItems } = await fetchAllRows((from, to) =>
        supabase.from('doors').select('project_id, door_items(status)').in('project_id', projectIds).range(from, to)
      )
      const pendingProjectIds = new Set()
      ;(doorsWithItems || []).forEach((d) => { if ((d.door_items || []).some((it) => it.status === 'pending_review')) pendingProjectIds.add(d.project_id) })
      const items = []
      const seenNames = new Map()
      ;(myAssigns || []).forEach((a) => { if (a.projects) seenNames.set(a.project_id, a.projects.project_name) })
      pendingProjectIds.forEach((pid) => items.push({ text: `"${seenNames.get(pid) || ''}" فيه بنود لسه محتاجة اعتمادك`, to: `/assignments?project=${pid}` }))
      setAttention(items.slice(0, 6))
    }

    setActions([
      { to: '/assignments', label: 'تخصيص المشاريع' },
      { to: '/approval', label: 'اعتماد الإدخالات' },
      { to: '/monthly-productivity', label: 'تقرير إنتاجية الشهر' },
      { to: '/installation-card', label: 'كارت متابعة تركيبات' },
    ])
  }

  async function loadSupervisor() {
    const [{ data: unentered }, { data: pendingInstalls }] = await Promise.all([
      fetchAllRows((from, to) => supabase.from('v_unentered_workforce').select('*').range(from, to)),
      fetchAllRows((from, to) => supabase.from('v_installations_detail').select('status, technician_role').in('status', ['pending_review']).range(from, to)),
    ])
    const myPending = (pendingInstalls || []).filter((r) => r.technician_role !== 'supervisor')
    setStats([
      { to: '/workforce', label: 'مشاريع محتاجة حصر أفراد اليوم', value: (unentered || []).length, tone: (unentered || []).length ? 'warn' : undefined },
      { to: '/approval', label: 'تركيبات بانتظار اعتمادي', value: myPending.length, tone: myPending.length ? 'warn' : undefined },
    ])
    setAttention(
      (unentered || []).slice(0, 6).map((p) => ({ text: `"${p.project_name}" لسه محتاج حصر أفراد أو تسجيل تركيب اليوم`, to: '/workforce' }))
    )
    setActions([
      { to: '/workforce', label: 'حصر الأفراد' },
      { to: '/technician', label: 'تسجيل تركيب' },
      { to: '/approval', label: 'اعتماد الإدخالات' },
    ])
  }

  async function loadTechnician() {
    const today = new Date().toISOString().slice(0, 10)
    const { data: myAssigns } = await fetchAllRows((from, to) =>
      supabase.from('project_assignments').select('project_id').eq('user_id', profile.id).eq('role', 'technician').eq('is_active', true).range(from, to)
    )
    const projectIds = [...new Set((myAssigns || []).map((a) => a.project_id))]
    const { data: todayEntries } = projectIds.length
      ? await fetchAllRows((from, to) => supabase.from('v_installations_detail').select('id').in('project_id', projectIds).eq('installed_at', today).eq('technician_id', profile.id).range(from, to))
      : { data: [] }
    setStats([
      { to: '/technician', label: 'مشاريعي', value: projectIds.length },
      { to: '/technician', label: 'تركيبات سجّلتها اليوم', value: (todayEntries || []).length },
    ])
    setActions([{ to: '/technician', label: 'تسجيل تركيب' }])
  }

  async function loadDataEntry() {
    const { data: myProjects } = await fetchAllRows((from, to) =>
      supabase.from('projects').select('id').range(from, to)
    )
    const projectIds = (myProjects || []).map((p) => p.id)
    const { data: pending } = projectIds.length
      ? await fetchAllRows((from, to) => supabase.from('door_items').select('id, doors!inner(project_id)').eq('status', 'pending_review').in('doors.project_id', projectIds).range(from, to))
      : { data: [] }
    setStats([
      { to: '/projects', label: 'المشاريع', value: projectIds.length },
      { to: '/projects', label: 'بنود بانتظار اعتماد المهندس', value: (pending || []).length },
    ])
    setActions([
      { to: '/projects', label: 'المشاريع' },
      { to: '/assignments', label: 'تخصيص المهندس' },
    ])
  }

  async function loadDeliveryEntry() {
    const { data: eligible } = await fetchAllRows((from, to) =>
      supabase.from('v_deliverable_items').select('id').range(from, to)
    )
    setStats([{ to: '/delivery', label: 'بنود جاهزة للتسليم', value: (eligible || []).length }])
    setActions([{ to: '/delivery', label: 'التسليمات' }])
  }

  return (
    <div>
      <div className="dash-titleblock">
        <div>
          <div className="eyebrow">نظام متابعة تركيبات الأبواب</div>
          <h1>أهلًا، {profile.full_name}</h1>
          <div className="sub">{ROLES[profile.role]}{profile.is_installations_manager ? ' — مدير التركيبات' : ''}</div>
        </div>
        <div className="date">{todayLabel()}</div>
      </div>

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>جارِ التحميل...</p>
      ) : (
        <>
          <div className="dash-grid">
            {stats.map((s, i) => <Stat key={i} {...s} />)}
          </div>

          <div className="dash-section-title">يحتاج انتباهك</div>
          {attention.length === 0 ? (
            <div className="dash-attention-empty">كل حاجة تمام حاليًا. مفيش حاجة محتاجة تصرف فوري.</div>
          ) : (
            <div className="dash-attention">
              {attention.map((a, i) => (
                <Link key={i} to={a.to} className="dash-attention-item">
                  <span>{a.text}</span>
                  <span className="go">افتح ←</span>
                </Link>
              ))}
            </div>
          )}

          <div className="dash-section-title">اختصارات</div>
          <div className="dash-actions">
            {actions.map((a, i) => <Link key={i} to={a.to} className="dash-action-btn">{a.label}</Link>)}
          </div>
        </>
      )}
    </div>
  )
}
