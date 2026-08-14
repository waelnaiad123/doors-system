import React, { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAll'
import { useAuth } from '../AuthContext'
import { ROLES } from '../lib/roles'
import { cairoTodayStr } from '../lib/cairoTime'

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

function todayLabel() {
  const [y, m, d] = cairoTodayStr().split('-').map(Number)
  const jsDate = new Date(y, m - 1, d) // بس عشان نطلع اسم اليوم (getDay) من تاريخ القاهرة الصحيح
  return `${WEEKDAYS[jsDate.getDay()]}، ${d} ${MONTHS[m - 1]} ${y}`
}

function todayLocalISO() {
  return cairoTodayStr()
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
  const [error, setError] = useState('')
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
      setError('')
      if (profile.role === 'admin' || profile.is_installations_manager) await loadAdminLike()
      else if (profile.role === 'engineer') await loadEngineer()
      else if (profile.role === 'supervisor') await loadSupervisor()
      else if (profile.role === 'technician') await loadTechnician()
      else if (profile.role === 'data_entry') await loadDataEntry()
      else if (profile.role === 'delivery_entry') await loadDeliveryEntry()
    } catch (e) {
      console.error(e)
      setError(`تحميل بيانات اللوحة الرئيسية: ${e.message}`)
    } finally {
      setLoading(false)
      fetchingRef.current = false
    }
  }

  async function loadAdminLike() {
    const [
      { count: projectsCount }, { count: usersCount }, { data: pendingItems },
      { data: pendingInstalls }, { data: pendingDeliveries }, { data: pendingNotes },
      { data: pendingFinalDeliveries },
    ] = await Promise.all([
      supabase.from('projects').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true),
      fetchAllRows((from, to) => supabase.from('door_items').select('id').eq('status', 'pending_review').range(from, to)),
      fetchAllRows((from, to) => supabase.from('v_installations_detail').select('project_id, project_name, project_number, status').in('status', ['pending_review', 'supervisor_approved']).range(from, to)),
      fetchAllRows((from, to) => supabase.from('v_deliveries_detail').select('project_id, project_name, project_number, status').eq('status', 'pending_review').range(from, to)),
      fetchAllRows((from, to) => supabase.from('daily_project_notes').select('project_id, projects(project_name, project_number)').eq('status', 'pending_review').range(from, to)),
      fetchAllRows((from, to) => supabase.from('projects').select('id, project_name, project_number').eq('final_delivery_status', 'pending_approval').range(from, to)),
    ])
    setStats([
      { to: '/projects', label: 'إجمالي المشاريع', value: projectsCount ?? '—' },
      { to: '/users', label: 'مستخدمون نشطون', value: usersCount ?? '—' },
      { to: '/projects', label: 'بنود بانتظار الاعتماد', value: (pendingItems || []).length, tone: (pendingItems || []).length ? 'warn' : undefined },
      { to: '/approval', label: 'تركيبات بانتظار الاعتماد', value: (pendingInstalls || []).length, tone: (pendingInstalls || []).length ? 'warn' : undefined },
      { to: '/approval', label: 'تسليمات بانتظار الاعتماد', value: (pendingDeliveries || []).length, tone: (pendingDeliveries || []).length ? 'warn' : undefined },
      { to: '/approval', label: 'ملاحظات بانتظار الاعتماد', value: (pendingNotes || []).length, tone: (pendingNotes || []).length ? 'warn' : undefined },
      { to: '/delivery', label: 'طلبات تسليم نهائي بانتظار الاعتماد', value: (pendingFinalDeliveries || []).length, tone: (pendingFinalDeliveries || []).length ? 'warn' : undefined },
    ])

    // تفصيل: كام بند/تركيب/تسليم/ملاحظة معلّقة في كل مشروع، ومين المهندس المسؤول عنه
    const { data: doorsWithPending } = await fetchAllRows((from, to) =>
      supabase.from('doors').select('project_id, projects(project_name, project_number), door_items(status)').range(from, to)
    )
    const countByProject = new Map() // project_id -> { label, itemCount, installCount, deliveryCount, noteCount }
    function ensureProject(pid, label) {
      if (!countByProject.has(pid)) countByProject.set(pid, { label, itemCount: 0, installCount: 0, deliveryCount: 0, noteCount: 0 })
      return countByProject.get(pid)
    }
    ;(doorsWithPending || []).forEach((d) => {
      const pendingCount = (d.door_items || []).filter((it) => it.status === 'pending_review').length
      if (pendingCount === 0) return
      const label = d.projects ? `${d.projects.project_number} — ${d.projects.project_name}` : 'مشروع'
      ensureProject(d.project_id, label).itemCount += pendingCount
    })
    ;(pendingInstalls || []).forEach((r) => {
      const label = r.project_number ? `${r.project_number} — ${r.project_name}` : (r.project_name || 'مشروع')
      ensureProject(r.project_id, label).installCount += 1
    })
    ;(pendingDeliveries || []).forEach((r) => {
      const label = r.project_number ? `${r.project_number} — ${r.project_name}` : (r.project_name || 'مشروع')
      ensureProject(r.project_id, label).deliveryCount += 1
    })
    ;(pendingNotes || []).forEach((n) => {
      const proj = n.projects
      const label = proj?.project_number ? `${proj.project_number} — ${proj.project_name}` : (proj?.project_name || 'مشروع')
      ensureProject(n.project_id, label).noteCount += 1
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

    const sorted = [...countByProject.entries()].sort((a, b) => {
      const totalA = a[1].itemCount + a[1].installCount + a[1].deliveryCount + a[1].noteCount
      const totalB = b[1].itemCount + b[1].installCount + b[1].deliveryCount + b[1].noteCount
      return totalB - totalA
    })
    const items = sorted.slice(0, 8).map(([pid, info]) => {
      const engineers = engineerByProject.get(pid)
      const engineerText = engineers && engineers.length > 0 ? engineers.join('، ') : 'مفيش مهندس مخصص'
      const parts = []
      if (info.itemCount > 0) parts.push(`${info.itemCount} بند معلّق`)
      if (info.installCount > 0) parts.push(`${info.installCount} تركيب بانتظار الاعتماد`)
      if (info.deliveryCount > 0) parts.push(`${info.deliveryCount} تسليم بانتظار الاعتماد`)
      if (info.noteCount > 0) parts.push(`${info.noteCount} ملاحظة بانتظار الاعتماد`)
      // فيه اعتماد مستحق (تركيب/تسليم/ملاحظة) → شاشة اعتماد الإدخالات مباشرة على المشروع ده.
      // غير كده لو بند BOM بس محتاج اعتماد → شاشة المشروع نفسها فين بيتم اعتماده.
      const hasApprovalWork = info.installCount > 0 || info.deliveryCount > 0 || info.noteCount > 0
      const to = hasApprovalWork ? `/approval?project=${pid}` : `/projects/${pid}`
      return {
        text: `${info.label} — ${parts.join('، ')} (المهندس: ${engineerText})`,
        to,
      }
    })
    if (sorted.length > 8) {
      items.push({ text: `+ ${sorted.length - 8} مشروع تاني فيهم بنود أو موافقات معلّقة`, to: '/projects-overview' })
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
      const readyProjectIds = new Set() // فيه بند معتمد واحد على الأقل جاهز للتركيب
      ;(doorsWithItems || []).forEach((d) => {
        const statuses = (d.door_items || []).map((it) => it.status)
        if (statuses.includes('pending_review')) pendingProjectIds.add(d.project_id)
        if (statuses.includes('approved')) readyProjectIds.add(d.project_id)
      })

      const { data: teamAssigns } = await supabase
        .from('project_assignments').select('project_id, role')
        .in('project_id', projectIds).eq('is_active', true).in('role', ['supervisor', 'delivery_entry'])
      const hasSupervisor = new Set((teamAssigns || []).filter((t) => t.role === 'supervisor').map((t) => t.project_id))
      const hasDelivery = new Set((teamAssigns || []).filter((t) => t.role === 'delivery_entry').map((t) => t.project_id))

      // مشروع فريقه جاهز وعنده بنود معتمدة، بس لسه مفيش أي تركيب اتسجّل عليه
      // خالص - ده مختلف عن "بنود بانتظار اعتماد" لإنه ممكن يفضل صامت للأبد
      // بمجرد ما خطوات البداية تخلص، من غير أي تنبيه يوضح إن الشغل واقف فعليًا
      const { data: anyInstalls } = await fetchAllRows((from, to) =>
        supabase.from('v_installations_detail').select('project_id').in('project_id', projectIds).range(from, to)
      )
      const startedProjectIds = new Set((anyInstalls || []).map((r) => r.project_id))
      const stalledProjectIds = new Set(
        projectIds.filter((pid) => hasSupervisor.has(pid) && readyProjectIds.has(pid) && !startedProjectIds.has(pid))
      )

      const installProjectIds = new Set((pendingInstalls || []).map((r) => r.project_id))
      const noteProjectIds = new Set((pendingNotes || []).map((n) => n.project_id))
      const deliveryProjectIds = new Set((pendingDeliveries || []).map((r) => r.project_id))

      const items = []
      const seenNames = new Map()
      ;(myAssigns || []).forEach((a) => { if (a.projects) seenNames.set(a.project_id, a.projects.project_name) })
      const allRelevant = new Set([
        ...pendingProjectIds,
        ...installProjectIds,
        ...noteProjectIds,
        ...deliveryProjectIds,
        ...stalledProjectIds,
        ...projectIds.filter((pid) => !hasSupervisor.has(pid) || !hasDelivery.has(pid)),
      ])
      allRelevant.forEach((pid) => {
        const reasons = []
        if (pendingProjectIds.has(pid)) reasons.push('اعتماد البنود المعلّقة')
        if (installProjectIds.has(pid)) reasons.push('اعتماد التركيبات المعلّقة')
        if (noteProjectIds.has(pid)) reasons.push('اعتماد الملاحظات المعلّقة')
        if (deliveryProjectIds.has(pid)) reasons.push('اعتماد التسليمات المعلّقة')
        if (stalledProjectIds.has(pid)) reasons.push('لسه مفيش أي تركيب مسجّل رغم إن الفريق والبنود جاهزين')
        if (!hasSupervisor.has(pid)) reasons.push('تخصيص مشرف')
        if (!hasDelivery.has(pid)) reasons.push('تخصيص مدخل بيانات تسليمات')
        const hasApprovalWork = installProjectIds.has(pid) || noteProjectIds.has(pid) || deliveryProjectIds.has(pid)
        const to = hasApprovalWork
          ? `/approval?project=${pid}`
          : pendingProjectIds.has(pid)
            ? `/projects/${pid}`
            : stalledProjectIds.has(pid)
              ? `/projects/${pid}`
              : `/assignments?project=${pid}`
        items.push({ text: `"${seenNames.get(pid) || ''}" محتاج: ${reasons.join('، ')}`, to })
      })
      if (items.length > 6) {
        const extra = items.length - 6
        items.length = 6
        items.push({ text: `+ ${extra} مشروع تاني فيه بنود أو موافقات معلّقة`, to: '/projects-overview' })
      }
      setAttention(items)
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
      fetchAllRows((from, to) => supabase.from('v_installations_detail').select('project_id, project_name, status, technician_role').in('status', ['pending_review']).range(from, to)),
    ])
    const unentered = (unenteredAll || []).filter((p) => projectIds.includes(p.project_id))
    const myPending = (pendingInstallsAll || []).filter((r) => projectIds.includes(r.project_id) && r.technician_role !== 'supervisor')
    setStats([
      { to: '/technician', label: 'مشاريع فيها عمال ولسه محتاجة تسجيل تركيب', value: unentered.length, tone: unentered.length ? 'warn' : undefined },
      { to: '/approval', label: 'تركيبات بانتظار اعتمادي', value: myPending.length, tone: myPending.length ? 'warn' : undefined },
    ])

    const nameByProject = new Map()
    unentered.forEach((p) => nameByProject.set(p.project_id, p.project_name))
    myPending.forEach((r) => { if (!nameByProject.has(r.project_id)) nameByProject.set(r.project_id, r.project_name) })
    const unenteredIds = new Set(unentered.map((p) => p.project_id))
    const pendingIds = new Set(myPending.map((r) => r.project_id))
    const allRelevant = [...new Set([...unenteredIds, ...pendingIds])]
    const attentionItems = allRelevant.map((pid) => {
      const reasons = []
      // ملحوظة: v_unentered_workforce معناها "فيه عمال متسجلين ولسه محدش سجّل
      // تركيب أو ملاحظة" - حصر الأفراد نفسه خلص، الناقص هو التركيب/الملاحظة بس
      if (unenteredIds.has(pid)) reasons.push('تسجيل تركيب أو ملاحظة اليوم')
      if (pendingIds.has(pid)) reasons.push('اعتماد تركيبات بانتظارك')
      return {
        text: `"${nameByProject.get(pid) || ''}" محتاج: ${reasons.join('، ')}`,
        to: pendingIds.has(pid) ? '/approval' : '/technician',
      }
    })
    if (attentionItems.length > 6) {
      const extra = attentionItems.length - 6
      attentionItems.length = 6
      attentionItems.push({ text: `+ ${extra} مشروع تاني محتاج تصرف منك`, to: '/workforce' })
    }
    setAttention(attentionItems)
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
      supabase.from('projects').select('id, project_name, project_number').range(from, to)
    )
    const projectIds = (myProjects || []).map((p) => p.id)
    let pendingCount = 0
    const doorItemCountByProject = new Map()
    if (projectIds.length > 0) {
      const { data: doorsWithItems } = await fetchAllRows((from, to) =>
        supabase.from('doors').select('project_id, door_items(status)').in('project_id', projectIds).range(from, to)
      )
      ;(doorsWithItems || []).forEach((d) => {
        const items = d.door_items || []
        doorItemCountByProject.set(d.project_id, (doorItemCountByProject.get(d.project_id) || 0) + items.length)
        items.forEach((it) => { if (it.status === 'pending_review') pendingCount++ })
      })
    }
    setStats([
      { to: '/projects', label: 'المشاريع', value: projectIds.length },
      { to: '/projects', label: 'بنود بانتظار اعتماد المهندس', value: pendingCount },
    ])

    if (projectIds.length > 0) {
      const { data: engAssigns } = await supabase
        .from('project_assignments').select('project_id')
        .in('project_id', projectIds).eq('role', 'engineer').eq('is_active', true)
      const hasEngineer = new Set((engAssigns || []).map((a) => a.project_id))

      const items = []
      ;(myProjects || []).forEach((p) => {
        const reasons = []
        if (!doorItemCountByProject.get(p.id)) reasons.push('لسه معملتش فيه أي باب أو بند خالص')
        if (!hasEngineer.has(p.id)) reasons.push('لسه محتاج تخصيص مهندس')
        if (reasons.length === 0) return
        items.push({
          text: `"${p.project_number} — ${p.project_name}" ${reasons.join('، ')}`,
          to: reasons.length === 1 && reasons[0] === 'لسه محتاج تخصيص مهندس' ? `/assignments?project=${p.id}` : `/projects/${p.id}`,
        })
      })
      if (items.length > 8) {
        const extra = items.length - 8
        items.length = 8
        items.push({ text: `+ ${extra} مشروع تاني محتاج تكمّل بياناته`, to: '/projects' })
      }
      setAttention(items)
    }

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
      {error && <div className="alert alert-error">{error}</div>}

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
