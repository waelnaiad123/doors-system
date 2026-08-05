import React, { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
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

function todayLocalISO() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
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

const REFRESH_INTERVAL_MS = 90000

export default function Dashboard() {
  const { profile } = useAuth()
  const location = useLocation()
  const [stats, setStats] = useState([])
  const [attention, setAttention] = useState([])
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(true)
  const fetchingRef = React.useRef(false)

  useEffect(() => { load(false) }, [location.pathname]) // eslint-disable-line
  useEffect(() => {
    const interval = setInterval(() => load(true), REFRESH_INTERVAL_MS)
    function onVisible() { if (document.visibilityState === 'visible') load(true) }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible) }
  }, []) // eslint-disable-line

  async function load(silent) {
    if (fetchingRef.current) return
    fetchingRef.current = true
    if (!silent) setLoading(true)
    try {
      if (profile.role === 'admin' || profile.is_installations_manager) await loadAdminLike()
      else if (profile.role === 'engineer') await loadEngineer()
      else if (profile.role === 'supervisor') await loadSupervisor()
      else if (profile.role === 'technician') await loadTechnician()
      else if (profile.role === 'data_entry') await loadDataEntry()
      else if (profile.role === 'delivery_entry') await loadDeliveryEntry()
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
      fetchingRef.current = false
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
      { to: '/projects', label: 'إجمالي المشاريع', value: projectsCount ?? '—' },
      { to: '/users', label: 'مستخدمون نشطون', value: usersCount ?? '—' },
      { to: '/projects', label: 'بنود بانتظار الاعتماد', value: (pendingItems || []).length, tone: (pendingItems || []).length ? 'warn' : undefined },
      { to: '/approval', label: 'تركيبات بانتظار الاعتماد', value: (pendingInstalls || []).length, tone: (pendingInstalls || []).length ? 'warn' : undefined },
    ])

    // تفصيل: كام بند معلّق في كل مشروع، ومين المهندس المسؤول عنه
    const { data: doorsWithPending } = await fetchAllRows((from, to) =>
      supabase.from('doors').select('project_id, projects(project_name, project_number), door_items(status)').range(from, to)
    )
    const countByProject = new Map() // project_id -> { name, count }
    ;(doorsWithPending || []).forEach((d) => {
      const pendingCount = (d.door_items || []).filter((it) => it.status === 'pending_review').length
      if (pendingCount === 0) return
      const key = d.project_id
      const label = d.projects ? `${d.projects.project_number} — ${d.projects.project_name}` : 'مشروع'
      if (!countByProject.has(key)) countByProject.set(key, { label, count: 0 })
      countByProject.get(key).count += pendingCount
    })

    const projectIdsWithPending = [...countByProject.keys()]
    let engineerByProject = new Map()
    if (projectIdsWithPending.length > 0) {
      const { data: engAssigns } = await supabase
        .from('project_assignments')
        .select('project_id, profiles!project_assignments_user_id_fkey(full_name)')
        .in('project_id', projectIdsWithPending).eq('role', 'engineer').eq('is_active', true)
      ;(engAssigns || []).forEach((a) => {
        const name = a.profiles?.full_name
        if (!name) return
        if (!engineerByProject.has(a.project_id)) engineerByProject.set(a.project_id, [])
        engineerByProject.get(a.project_id).push(name)
      })
    }

    const sorted = [...countByProject.entries()].sort((a, b) => b[1].count - a[1].count)
    const items = sorted.slice(0, 8).map(([pid, info]) => {
      const engineers = engineerByProject.get(pid)
      const engineerText = engineers && engineers.length > 0 ? engineers.join('، ') : 'مفيش مهندس مخصص'
      return {
        text: `${info.label} — ${info.count} بند معلّق (المهندس: ${engineerText})`,
        to: `/assignments?project=${pid}`,
      }
    })
    if (sorted.length > 8) {
      items.push({ text: `+ ${sorted.length - 8} مشروع تاني فيهم بنود معلّقة`, to: '/projects-overview' })
    }
    setAttention(items)

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
      projectIds.length
        ? fetchAllRows((from, to) => supabase.from('daily_project_notes').select('id, project_id, projects(project_name)').eq('status', 'pending_review').in('project_id', projectIds).range(from, to))
        : Promise.resolve({ data: [] }),
      projectIds.length
        ? fetchAllRows((from, to) => supabase.from('v_deliveries_detail').select('project_id, project_name').eq('status', 'pending_review').in('project_id', projectIds).range(from, to))
        : Promise.resolve({ data: [] }),
    ])

    setStats([
      { to: '/assignments', label: 'مشاريعي', value: projectIds.length },
      { to: '/approval', label: 'تركيبات بانتظار اعتمادي', value: (pendingInstalls || []).length, tone: (pendingInstalls || []).length ? 'warn' : undefined },
      { to: '/approval', label: 'ملاحظات بانتظار اعتمادي', value: (pendingNotes || []).length, tone: (pendingNotes || []).length ? 'warn' : undefined },
      { to: '/approval', label: 'تسليمات بانتظار اعتمادي', value: (pendingDeliveries || []).length, tone: (pendingDeliveries || []).length ? 'warn' : undefined },
    ])

    if (projectIds.length > 0) {
      const { data: doorsWithItems } = await fetchAllRows((from, to) =>
        supabase.from('doors').select('project_id, door_items(status)').in('project_id', projectIds).range(from, to)
      )
      const pendingProjectIds = new Set()
      ;(doorsWithItems || []).forEach((d) => { if ((d.door_items || []).some((it) => it.status === 'pending_review')) pendingProjectIds.add(d.project_id) })

      const { data: teamAssigns } = await supabase
        .from('project_assignments').select('project_id, role')
        .in('project_id', projectIds).eq('is_active', true).in('role', ['supervisor', 'delivery_entry'])
      const hasSupervisor = new Set((teamAssigns || []).filter((t) => t.role === 'supervisor').map((t) => t.project_id))
      const hasDelivery = new Set((teamAssigns || []).filter((t) => t.role === 'delivery_entry').map((t) => t.project_id))

      const items = []
      const seenNames = new Map()
      ;(myAssigns || []).forEach((a) => { if (a.projects) seenNames.set(a.project_id, a.projects.project_name) })
      const allRelevant = new Set([...pendingProjectIds, ...projectIds.filter((pid) => !hasSupervisor.has(pid) || !hasDelivery.has(pid))])
      allRelevant.forEach((pid) => {
        const reasons = []
        if (pendingProjectIds.has(pid)) reasons.push('اعتماد البنود المعلّقة')
        if (!hasSupervisor.has(pid)) reasons.push('تخصيص مشرف')
        if (!hasDelivery.has(pid)) reasons.push('تخصيص مدخل بيانات تسليمات')
        items.push({ text: `"${seenNames.get(pid) || ''}" محتاج: ${reasons.join('، ')}`, to: `/assignments?project=${pid}` })
      })
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
    const { data: myAssigns } = await fetchAllRows((from, to) =>
      supabase.from('project_assignments').select('project_id').eq('user_id', profile.id).eq('role', 'supervisor').eq('is_active', true).range(from, to)
    )
    const projectIds = [...new Set((myAssigns || []).map((a) => a.project_id))]

    const [{ data: unenteredAll }, { data: pendingInstallsAll }] = await Promise.all([
      fetchAllRows((from, to) => supabase.from('v_unentered_workforce').select('*').range(from, to)),
      fetchAllRows((from, to) => supabase.from('v_installations_detail').select('project_id, status, technician_role').in('status', ['pending_review']).range(from, to)),
    ])
    const unentered = (unenteredAll || []).filter((p) => projectIds.includes(p.project_id))
    const myPending = (pendingInstallsAll || []).filter((r) => projectIds.includes(r.project_id) && r.technician_role !== 'supervisor')
    setStats([
      { to: '/workforce', label: 'مشاريع محتاجة حصر أفراد اليوم', value: unentered.length, tone: unentered.length ? 'warn' : undefined },
      { to: '/approval', label: 'تركيبات بانتظار اعتمادي', value: myPending.length, tone: myPending.length ? 'warn' : undefined },
    ])
    setAttention(
      unentered.slice(0, 6).map((p) => ({ text: `"${p.project_name}" لسه محتاج حصر أفراد أو تسجيل تركيب اليوم`, to: '/workforce' }))
    )
    setActions([
      { to: '/workforce', label: 'حصر الأفراد' },
      { to: '/technician', label: 'تسجيل تركيب' },
      { to: '/approval', label: 'اعتماد الإدخالات' },
    ])
  }

  async function loadTechnician() {
    const today = todayLocalISO()
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
    let pendingCount = 0
    if (projectIds.length > 0) {
      const { data: doorsWithItems } = await fetchAllRows((from, to) =>
        supabase.from('doors').select('door_items(status)').in('project_id', projectIds).range(from, to)
      )
      ;(doorsWithItems || []).forEach((d) => {
        (d.door_items || []).forEach((it) => { if (it.status === 'pending_review') pendingCount++ })
      })
    }
    setStats([
      { to: '/projects', label: 'المشاريع', value: projectIds.length },
      { to: '/projects', label: 'بنود بانتظار اعتماد المهندس', value: pendingCount },
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
