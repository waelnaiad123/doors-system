import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAll'
import { useAuth } from '../AuthContext'

// بيكوّن نص زي "مشروع أ، مشروع ب، +٣ تاني" بدل ما نكتفي بعدد بس - عشان
// المستخدم يعرف بالظبط أي مشروع المقصود من غير ما يحتاج يدوّر عليه بنفسه
function namesWithOverflow(items, max = 2) {
  const names = items.map((p) => p.project_name)
  if (names.length <= max) return names.join('، ')
  return `${names.slice(0, max).join('، ')}، +${names.length - max} تاني`
}

export default function ReminderBanner() {
  const { profile } = useAuth()
  const [unentered, setUnentered] = useState([])
  const [unenteredEngineers, setUnenteredEngineers] = useState(new Map())
  const [approvalsCount, setApprovalsCount] = useState(0)
  const [deliveriesCount, setDeliveriesCount] = useState(0)
  const [notesCount, setNotesCount] = useState(0)
  const [engineerOnboarding, setEngineerOnboarding] = useState([])
  const [stalledProjects, setStalledProjects] = useState([])
  const [teamOnboarding, setTeamOnboarding] = useState([])
  const [ready, setReady] = useState(false)

  useEffect(() => { if (profile) load() }, [profile?.id]) // eslint-disable-line
  useEffect(() => {
    if (!profile) return
    let interval = null
    function start() {
      if (interval) return
      interval = setInterval(load, 20000)
    }
    function stop() {
      if (!interval) return
      clearInterval(interval)
      interval = null
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        load() // تحديث فوري لحظة رجوع المستخدم للشاشة، بدل ما يستنى لحد 20 ثانية
        start()
      } else {
        stop() // إيقاف مؤقت بس لو الشاشة مش قدام المستخدم أصلًا - الفاصل الزمني نفسه (20 ثانية) متغيرش
      }
    }
    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [profile?.id]) // eslint-disable-line

  async function loadEngineerOnboarding() {
    const { data: myAssigns } = await fetchAllRows((from, to) =>
      supabase.from('project_assignments').select('project_id, projects(project_name, project_number)')
        .eq('user_id', profile.id).eq('role', 'engineer').eq('is_active', true).range(from, to)
    )
    const myProjectsRaw = (myAssigns || [])
      .filter((a) => a.projects)
      .map((a) => ({ id: a.project_id, project_name: a.projects.project_name, project_number: a.projects.project_number }))
    // نفس ملحوظة الدالة التانية تحت: بنشيل أي تكرار لصف تخصيص نشط على نفس المشروع
    const myProjects = [...new Map(myProjectsRaw.map((p) => [p.id, p])).values()]
    const projectIds = myProjects.map((p) => p.id)
    if (projectIds.length === 0) { setEngineerOnboarding([]); setStalledProjects([]); return }

    const { data: doorsWithItems } = await fetchAllRows((from, to) =>
      supabase.from('doors').select('project_id, door_items(status)').in('project_id', projectIds).range(from, to)
    )
    const pendingProjectIds = new Set()
    const readyProjectIds = new Set()
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

    setEngineerOnboarding(
      myProjects.filter((p) => pendingProjectIds.has(p.id) || !hasSupervisor.has(p.id) || !hasDelivery.has(p.id))
    )

    // مشاريع فريقها جاهز وعندها بنود معتمدة، بس لسه مفيش أي تركيب اتسجّل عليها
    // خالص - منفصلة عن قائمة "مشروع جديد" فوق لإنها ممكن تفضل صامتة للأبد بعد
    // ما خطوات البداية تخلص، من غير أي تنبيه يوضح إن الشغل واقف فعليًا
    const { data: anyInstalls } = await fetchAllRows((from, to) =>
      supabase.from('v_installations_detail').select('project_id').in('project_id', projectIds).range(from, to)
    )
    const startedProjectIds = new Set((anyInstalls || []).map((r) => r.project_id))
    setStalledProjects(
      myProjects.filter((p) => hasSupervisor.has(p.id) && readyProjectIds.has(p.id) && !startedProjectIds.has(p.id))
    )
  }

  async function loadTeamOnboarding() {
    const { data: myAssigns } = await fetchAllRows((from, to) =>
      supabase.from('project_assignments').select('project_id, projects(project_name, project_number)')
        .eq('user_id', profile.id).eq('role', profile.role).eq('is_active', true).range(from, to)
    )
    const myProjectsRaw = (myAssigns || [])
      .filter((a) => a.projects)
      .map((a) => ({ id: a.project_id, project_name: a.projects.project_name, project_number: a.projects.project_number }))
    // لو حصل صف تخصيص نشط مكرر لنفس المشروع (مفيش قيد unique في القاعدة يمنع
    // ده)، بنشيل التكرار هنا عشان العدد المعروض يمثّل مشاريع فريدة فعلًا
    const myProjects = [...new Map(myProjectsRaw.map((p) => [p.id, p])).values()]
    const projectIds = myProjects.map((p) => p.id)
    if (projectIds.length === 0) { setTeamOnboarding([]); return }

    const { data: anyInstalls } = await fetchAllRows((from, to) =>
      supabase.from('v_installations_detail').select('project_id').in('project_id', projectIds).range(from, to)
    )
    const startedProjectIds = new Set((anyInstalls || []).map((r) => r.project_id))
    setTeamOnboarding(myProjects.filter((p) => !startedProjectIds.has(p.id)))
  }

  async function load() {
    try {
      if (['technician', 'supervisor', 'admin', 'engineer'].includes(profile.role) || profile.is_installations_manager) {
        const { data } = await fetchAllRows((from, to) =>
          supabase.from('v_unentered_workforce').select('*').range(from, to)
        )
        // نجمع بمشروع واحد بس (مش صف لكل تاريخ) عشان العدد والأسماء يكونوا
        // دقيقين - مشروع واحد ليه يومين متأخرين كان بيتحسب مرتين قبل كده
        const byProject = new Map()
        ;(data || []).forEach((r) => {
          if (!byProject.has(r.project_id)) byProject.set(r.project_id, r)
        })
        const uniqueUnentered = Array.from(byProject.values())
        setUnentered(uniqueUnentered)

        if (uniqueUnentered.length > 0) {
          const { data: assigns } = await fetchAllRows((from, to) =>
            supabase
              .from('project_assignments')
              .select('project_id, profiles(full_name)')
              .in('project_id', uniqueUnentered.map((p) => p.project_id))
              .eq('role', 'engineer')
              .eq('is_active', true)
              .range(from, to)
          )
          const engineersByProject = new Map()
          ;(assigns || []).forEach((a) => {
            if (!engineersByProject.has(a.project_id)) engineersByProject.set(a.project_id, [])
            if (a.profiles?.full_name) engineersByProject.get(a.project_id).push(a.profiles.full_name)
          })
          setUnenteredEngineers(engineersByProject)
        } else {
          setUnenteredEngineers(new Map())
        }
      }
      if (['supervisor', 'engineer', 'admin'].includes(profile.role)) {
        const { data } = await fetchAllRows((from, to) =>
          supabase.from('v_installations_detail').select('status, technician_role')
            .in('status', ['pending_review', 'supervisor_approved']).range(from, to)
        )
        const rows = data || []
        const count = profile.role === 'supervisor'
          ? rows.filter((r) => r.status === 'pending_review' && r.technician_role !== 'supervisor').length
          : rows.length
        setApprovalsCount(count)

        const { data: notesData } = await fetchAllRows((from, to) =>
          supabase.from('daily_project_notes').select('id').eq('status', 'pending_review').range(from, to)
        )
        setNotesCount((notesData || []).length)
      }
      if (['engineer', 'admin'].includes(profile.role)) {
        const { data } = await fetchAllRows((from, to) =>
          supabase.from('v_deliveries_detail').select('status').eq('status', 'pending_review').range(from, to)
        )
        setDeliveriesCount((data || []).length)
      }
      if (profile.role === 'engineer' && !profile.is_installations_manager) {
        await loadEngineerOnboarding()
      }
      if (['supervisor', 'technician'].includes(profile.role)) {
        await loadTeamOnboarding()
      }
    } finally {
      setReady(true)
    }
  }

  if (!profile || !ready) return null
  const showEntry = unentered.length > 0
  const showApprovals = approvalsCount > 0
  const showDeliveries = deliveriesCount > 0
  const showNotes = notesCount > 0
  const showEngineerOnboarding = engineerOnboarding.length > 0
  const showStalled = stalledProjects.length > 0
  const showTeamOnboarding = teamOnboarding.length > 0
  if (!showEntry && !showApprovals && !showDeliveries && !showNotes && !showEngineerOnboarding && !showStalled && !showTeamOnboarding) return null
  const engineerOnboardingNames = showEngineerOnboarding ? namesWithOverflow(engineerOnboarding) : ''
  const stalledNames = showStalled ? namesWithOverflow(stalledProjects) : ''
  const teamOnboardingNames = showTeamOnboarding ? namesWithOverflow(teamOnboarding) : ''
  const unenteredWithEngineer = showEntry
    ? unentered.map((p) => {
        const engineers = unenteredEngineers.get(p.project_id) || []
        return { project_name: engineers.length > 0 ? `${p.project_name} (${engineers.join('/')})` : p.project_name }
      })
    : []
  const unenteredNames = showEntry ? namesWithOverflow(unenteredWithEngineer) : ''

  return (
    <div className="reminder-banner">
      {showEngineerOnboarding && (
        <Link to="/dashboard" className="reminder-line">
          📋 {engineerOnboarding.length} مشروع جديد مخصص لك ({engineerOnboardingNames}): اعتمد البنود المعلّقة وخصص مشرف ومدخل بيانات تسليمات
        </Link>
      )}
      {showStalled && (
        <Link to="/dashboard" className="reminder-line">
          ⚠️ {stalledProjects.length} مشروع فريقه جاهز وبنوده معتمدة ({stalledNames})، ولسه مفيش أي تركيب مسجّل عليه خالص
        </Link>
      )}
      {showTeamOnboarding && (
        <Link to={profile.role === 'supervisor' ? '/workforce' : '/technician'} className="reminder-line">
          📋 {teamOnboarding.length} مشروع جديد مخصص لك ({teamOnboardingNames}): {profile.role === 'supervisor' ? 'ابدأ بحصر الأفراد وتسجيل التركيب' : 'ابدأ تسجيل التركيب'}
        </Link>
      )}
      {showEntry && (
        <Link to="/technician" className="reminder-line">
          ⚠️ {unentered.length} مشروع فيه عمال ولسه محتاج تسجيل تركيب أو ملاحظة اليوم ({unenteredNames})
        </Link>
      )}
      {showApprovals && (
        <Link to="/approval" className="reminder-line">
          🔔 {approvalsCount} بند تركيب بانتظار اعتمادك
        </Link>
      )}
      {showNotes && (
        <Link to="/approval" className="reminder-line">
          🔔 {notesCount} ملاحظة/سبب عدم تنفيذ بانتظار اعتمادك
        </Link>
      )}
      {showDeliveries && (
        <Link to="/approval" className="reminder-line">
          🔔 {deliveriesCount} تسليم بانتظار اعتمادك
        </Link>
      )}
    </div>
  )
}
