import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAll'
import { REPORT_COLUMNS, emptyColumnTotals } from '../lib/reportColumns'
import { useAuth } from '../AuthContext'
import { cairoTodayStr } from '../lib/cairoTime'

function pad(n) { return String(n).padStart(2, '0') }
function toISO(y, m, d) { return `${y}-${pad(m)}-${pad(d)}` }

export default function MonthlyProductivity() {
  const { profile } = useAuth()
  const [todayY, todayM, todayD] = cairoTodayStr().split('-').map(Number)
  const canManageOthers = profile.role === 'admin' || profile.is_installations_manager
  const [engineersList, setEngineersList] = useState([])
  const [selectedEngineerId, setSelectedEngineerId] = useState(profile.role === 'engineer' ? profile.id : '')
  const [year, setYear] = useState(todayY)
  const [month, setMonth] = useState(todayM)

  const [projects, setProjects] = useState([]) // {id, project_name, project_number, supervisor_name}
  const [itemTotals, setItemTotals] = useState({}) // project_id -> {columns, points}
  const [doorMeta, setDoorMeta] = useState({ catalogPoints: {}, frameLeafQty: {}, idsByProject: {} })
  const [engineerDoorIds, setEngineerDoorIds] = useState({}) // project_id -> Set(door_id) لو مقسوم، أو undefined لو عام
  const [installedTotals, setInstalledTotals] = useState({}) // project_id -> {columns, points} (through day 20)
  const [workforceTotals, setWorkforceTotals] = useState({}) // project_id -> {allTime, thisMonth} headcount
  const [productivityRows, setProductivityRows] = useState({}) // project_id -> row (this month)
  const [prevRows, setPrevRows] = useState({}) // project_id -> row (previous month)
  const [additionalWorks, setAdditionalWorks] = useState({}) // project_id -> total points
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyProjectId, setBusyProjectId] = useState('')

  const isCurrentOrPastMonth = year < todayY || (year === todayY && month <= todayM)
  const isThisExactMonth = year === todayY && month === todayM
  const canEdit = isCurrentOrPastMonth && (!isThisExactMonth || todayD >= 21)

  useEffect(() => {
    if (canManageOthers) loadEngineersList()
  }, []) // eslint-disable-line

  useEffect(() => { if (selectedEngineerId) loadEverything() }, [year, month, selectedEngineerId]) // eslint-disable-line

  async function loadEngineersList() {
    const { data, error } = await supabase.from('profiles').select('id, full_name').eq('role', 'engineer').eq('is_active', true).order('full_name')
    if (error) { setError(error.message); return }
    setEngineersList(data || [])
  }

  async function loadEverything() {
    setLoading(true)
    setError('')
    try {
      // 1) مشاريع المهندس + المشرف المسؤول عن كل مشروع
      const { data: assigns, error: eAssign } = await fetchAllRows((from, to) =>
        supabase
          .from('project_assignments')
          .select('id, project_id, projects(id, project_name, project_number, final_delivery_status, final_delivery_approved_at)')
          .eq('user_id', selectedEngineerId).eq('role', 'engineer').eq('is_active', true)
          .range(from, to)
      )
      if (eAssign) throw eAssign
      const projectIds = [...new Set((assigns || []).map((a) => a.project_id))]
      if (projectIds.length === 0) { setProjects([]); setLoading(false); return }

      const { data: supAssigns, error: eSup } = await supabase
        .from('project_assignments')
        .select('project_id, profiles!project_assignments_user_id_fkey(full_name)')
        .in('project_id', projectIds).eq('role', 'supervisor').eq('is_active', true)
      if (eSup) console.error('خطأ في جلب أسماء المشرفين:', eSup.message)
      const supervisorByProject = {}
      ;(supAssigns || []).forEach((s) => { supervisorByProject[s.project_id] = s.profiles?.full_name || '—' })

      const assignmentIdByProject = {}
      ;(assigns || []).forEach((a) => { if (a.projects) assignmentIdByProject[a.project_id] = a.id })

      const projList = (assigns || [])
        .map((a) => a.projects)
        .filter(Boolean)
        .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i)
        .map((p) => ({ ...p, supervisor_name: supervisorByProject[p.id] || '—', assignment_id: assignmentIdByProject[p.id] }))
      setProjects(projList)

      // 2) إجمالي بنود كل مشروع (كمية + نقاط فعلية للبند)
      const { data: doorsWithItems } = await fetchAllRows((from, to) =>
        supabase
          .from('doors')
          .select('id, project_id, door_items(quantity, variant, points_override, item_types(name, points))')
          .in('project_id', projectIds)
          .range(from, to)
      )
      const itemTotalsMap = {}
      // بيانات إضافية لكل باب - محتاجينها لحساب نصيب المهندس من نقاط
      // التسليم (لو مقسوم) ومعادلة حلق/ضلفة × 7
      const doorCatalogPoints = {} // door_id -> نقاط الكتالوج لبنود الباب ده
      const doorFrameLeafQty = {} // door_id -> { frameQty, leafQty }
      const doorIdsByProject = {} // project_id -> [door_id...]
      projectIds.forEach((id) => { itemTotalsMap[id] = { columns: emptyColumnTotals(), points: 0 }; doorIdsByProject[id] = [] })
      ;(doorsWithItems || []).forEach((d) => {
        const bucket = itemTotalsMap[d.project_id]
        if (!bucket) return
        doorIdsByProject[d.project_id].push(d.id)
        doorCatalogPoints[d.id] = 0
        doorFrameLeafQty[d.id] = { frameQty: 0, leafQty: 0 }
        ;(d.door_items || []).forEach((it) => {
          const name = it.item_types?.name
          const r = { item_type: name, variant: it.variant }
          const col = REPORT_COLUMNS.find((c) => c.match(r))
          const qty = Number(it.quantity) || 0
          const unitPoints = Number(it.points_override ?? it.item_types?.points) || 0
          if (col) bucket.columns[col.key] += qty
          bucket.points += qty * unitPoints
          doorCatalogPoints[d.id] += qty * unitPoints
          if (name === 'حلق' || name === 'حلق هواية/شباك') doorFrameLeafQty[d.id].frameQty += qty
          else if (name === 'ضلفة') doorFrameLeafQty[d.id].leafQty += qty
        })
      })
      setItemTotals(itemTotalsMap)
      setDoorMeta({ catalogPoints: doorCatalogPoints, frameLeafQty: doorFrameLeafQty, idsByProject: doorIdsByProject })

      // نقاط التسليم بتتوزع بالنسبة والتناسب لو المشروع مقسوم - نجيب هل
      // لهذا المهندس تحديدًا أبواب متخصصة له في أي من مشاريعه (project_assignment_doors)
      const assignmentIds = Object.values(assignmentIdByProject).filter(Boolean)
      const engDoorMap = {}
      if (assignmentIds.length > 0) {
        const { data: assignDoors } = await fetchAllRows((from, to) =>
          supabase.from('project_assignment_doors').select('assignment_id, door_id').in('assignment_id', assignmentIds).range(from, to)
        )
        const doorsByAssignment = {}
        ;(assignDoors || []).forEach((r) => {
          if (!doorsByAssignment[r.assignment_id]) doorsByAssignment[r.assignment_id] = []
          doorsByAssignment[r.assignment_id].push(r.door_id)
        })
        Object.entries(assignmentIdByProject).forEach(([pid, aid]) => {
          if (doorsByAssignment[aid]) engDoorMap[pid] = new Set(doorsByAssignment[aid])
        })
      }
      setEngineerDoorIds(engDoorMap)

      // 3) ما تم تركيبه واعتماده حتى يوم 20 من الشهر المطلوب
      const cutoff = toISO(year, month, 20)
      const prevMonth = month === 1 ? 12 : month - 1
      const prevYear = month === 1 ? year - 1 : year
      const { data: installs } = await fetchAllRows((from, to) =>
        supabase
          .from('v_installations_detail')
          .select('project_id, item_type, variant, quantity, points_earned, installed_at')
          .in('project_id', projectIds).eq('status', 'approved').lte('installed_at', cutoff)
          .range(from, to)
      )
      const installedMap = {}
      projectIds.forEach((id) => { installedMap[id] = { columns: emptyColumnTotals(), points: 0 } })
      ;(installs || []).forEach((r) => {
        const bucket = installedMap[r.project_id]
        if (!bucket) return
        const col = REPORT_COLUMNS.find((c) => c.match(r))
        if (col) bucket.columns[col.key] += Number(r.quantity) || 0
        bucket.points += Number(r.points_earned) || 0
      })
      setInstalledTotals(installedMap)

      // 3.5) حصر الأفراد: إجمالي من بداية المشروع لغاية يوم 20 من الشهر المطلوب،
      // وكمان إجمالي خلال الشهر بس (من يوم 21 الشهر السابق لغاية يوم 20 الحالي).
      // بنجيب كل الصفوف لغاية يوم 20 مرة واحدة، وبنحسب المجموعين من نفس البيانات.
      const periodStart = toISO(prevYear, prevMonth, 21)
      const { data: wfRows, error: e9 } = await fetchAllRows((from, to) =>
        supabase
          .from('daily_workforce')
          .select('project_id, work_date, headcount')
          .in('project_id', projectIds).lte('work_date', cutoff)
          .range(from, to)
      )
      if (e9) throw e9
      const workforceMap = {}
      projectIds.forEach((id) => { workforceMap[id] = { allTime: 0, thisMonth: 0 } })
      ;(wfRows || []).forEach((r) => {
        const bucket = workforceMap[r.project_id]
        if (!bucket) return
        const h = Number(r.headcount) || 0
        bucket.allTime += h
        if (r.work_date >= periodStart) bucket.thisMonth += h
      })
      setWorkforceTotals(workforceMap)

      // 4) صفوف تقرير الإنتاجية للشهر الحالي والشهر السابق
      const { data: thisMonthRows, error: e6 } = await supabase
        .from('monthly_productivity').select('*')
        .eq('engineer_id', selectedEngineerId).eq('year', year).eq('month', month).in('project_id', projectIds)
      if (e6) throw e6
      const thisMap = {}
      ;(thisMonthRows || []).forEach((r) => { thisMap[r.project_id] = r })
      setProductivityRows(thisMap)

      const { data: prevMonthRows, error: e7 } = await supabase
        .from('monthly_productivity').select('*')
        .eq('engineer_id', selectedEngineerId).eq('year', prevYear).eq('month', prevMonth).in('project_id', projectIds)
      if (e7) throw e7
      const prevMap = {}
      ;(prevMonthRows || []).forEach((r) => { prevMap[r.project_id] = r })
      setPrevRows(prevMap)

      // 5) نقاط الأعمال الإضافية لنفس الشهر
      const { data: addWorks, error: e8 } = await supabase
        .from('additional_works').select('*')
        .eq('engineer_id', selectedEngineerId).eq('year', year).eq('month', month).in('project_id', projectIds)
      if (e8) throw e8
      const addMap = {}
      ;(addWorks || []).forEach((r) => {
        addMap[r.project_id] = (Number(r.factory_storage) || 0) + (Number(r.install_storage) || 0)
          + (Number(r.factory_repairs) || 0) + (Number(r.other_points) || 0)
      })
      setAdditionalWorks(addMap)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // نصيب المهندس من نقاط التسليم - بس لو المشروع اتسلّم فعليًا، وبس لو تاريخ
  // الاعتماد نفسه واقع في حدود الشهر المعروض ده أو قبله (نفس مبدأ أي تركيب
  // حقيقي له تاريخ - ما تظهرش في شهور قبل ما التسليم يحصل فعليًا). بتتحسب
  // حية دايمًا، مش متخزّنة في أي مكان.
  // إجمالي نقاط التسليم المتوقعة للمشروع كامل (مش نصيب مهندس معيّن) - نفس
  // معادلة كارت المتابعة بالظبط، بتتحسب حية دايمًا وتتعرض من أول يوم بغض
  // النظر عن حالة التسليم الفعلية (إسقاط "لو سلّمنا دلوقتي")
  function projectDeliveryPointsProjection(projectId) {
    const doorIds = doorMeta.idsByProject[projectId] || []
    let total = 0
    doorIds.forEach((did) => {
      const fl = doorMeta.frameLeafQty[did] || { frameQty: 0, leafQty: 0 }
      total += (fl.frameQty > 0 ? fl.frameQty : fl.leafQty) * 7
    })
    return total
  }

  function deliveryPointsShare(projectId) {
    const project = projects.find((p) => p.id === projectId)
    if (!project || project.final_delivery_status !== 'delivered' || !project.final_delivery_approved_at) return 0

    const cutoff = toISO(year, month, 20)
    const approvedDateStr = project.final_delivery_approved_at.slice(0, 10) // YYYY-MM-DD
    if (approvedDateStr > cutoff) return 0 // التسليم حصل بعد نهاية الفترة المعروضة، لسه ما يظهرش هنا

    const totalDeliveryPoints = projectDeliveryPointsProjection(projectId)
    const totalProjectPoints = itemTotals[projectId]?.points || 0
    if (totalProjectPoints <= 0) return 0

    // نصيب المهندس من نقاط الكتالوج - لو معندوش أبواب مخصصة له تحديدًا
    // (مشروع مش مقسوم)، ياخد المشروع كامل (100%)
    const myDoorIds = engineerDoorIds[projectId]
    let myPoints = totalProjectPoints
    if (myDoorIds) {
      myPoints = 0
      myDoorIds.forEach((did) => { myPoints += doorMeta.catalogPoints[did] || 0 })
    }

    return Math.round((myPoints / totalProjectPoints) * totalDeliveryPoints)
  }

  // نقاط "مركبة حتى 20" شاملة نصيب التسليم (لو ظهر في حدود الفترة دي) - نفس
  // معاملة أي بند تركيب حقيقي بالظبط، مش رقم منفصل
  function installedPointsWithDelivery(projectId) {
    return (installedTotals[projectId]?.points || 0) + deliveryPointsShare(projectId)
  }

  function suggestedMonthPoints(projectId) {
    const installedPoints = installedPointsWithDelivery(projectId)
    const prevPoints = prevRows[projectId]?.current_points || 0
    return Math.max(0, installedPoints - prevPoints)
  }

  async function saveMonthPoints(projectId, rawValue) {
    if (!canEdit) return
    const value = Number(rawValue)
    if (!Number.isFinite(value) || value < 0) return
    setBusyProjectId(projectId)
    setError(''); setNotice('')
    try {
      const existing = productivityRows[projectId]
      const prevPoints = prevRows[projectId]?.current_points || 0

      if (!existing) {
        const { error } = await supabase.from('monthly_productivity').insert({
          project_id: projectId, engineer_id: selectedEngineerId, year, month,
          prev_points: prevPoints, month_points: value, created_by: profile.id,
        })
        if (error) throw error
        // اقفل صف الشهر السابق لنفس المشروع (لو موجود) بما إن الشهر الجديد بقى مرتبط بيه
        const prevRow = prevRows[projectId]
        if (prevRow && !prevRow.locked) {
          await supabase.from('monthly_productivity').update({ locked: true }).eq('id', prevRow.id)
        }
      } else {
        if (value > existing.month_points) {
          setError('يُسمح فقط بتقليل "تنفيذ نقاط خلال الشهر"، مش زيادتها.')
          setBusyProjectId('')
          return
        }
        const { error } = await supabase.from('monthly_productivity').update({ month_points: value }).eq('id', existing.id)
        if (error) throw error
      }
      setNotice('تم الحفظ.')
      await loadEverything()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyProjectId('')
    }
  }

  const supervisorTotals = useMemo(() => {
    const m = new Map()
    projects.forEach((p) => {
      const points = productivityRows[p.id]?.month_points ?? suggestedMonthPoints(p.id)
      const key = p.supervisor_name
      m.set(key, (m.get(key) || 0) + points)
    })
    return Array.from(m.entries())
  }, [projects, productivityRows, installedTotals, prevRows, doorMeta, engineerDoorIds, itemTotals]) // eslint-disable-line

  const engineerGrandTotal = useMemo(
    () => supervisorTotals.reduce((s, [, v]) => s + v, 0),
    [supervisorTotals]
  )

  return (
    <div>
      <div className="no-print">
        <h1>تقرير إنتاجية الشهر</h1>
        {error && <div className="alert alert-error">{error}</div>}
        {notice && <div className="alert alert-ok">{notice}</div>}
        <div className="card">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            {canManageOthers && (
              <div className="field">
                <label>المهندس</label>
                <select value={selectedEngineerId} onChange={(e) => setSelectedEngineerId(e.target.value)}>
                  <option value="">-- اختر مهندسًا --</option>
                  {engineersList.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </div>
            )}
            <div className="field">
              <label>السنة</label>
              <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>الشهر</label>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          {!canEdit && isThisExactMonth && (
            <div className="alert" style={{ marginTop: 10, background: 'var(--pending-soft)', color: 'var(--pending)' }}>
              تقرير هذا الشهر بيتفتح للتسجيل يوم 21 فقط. النهاردة يوم {todayD}.
            </div>
          )}
        </div>
      </div>

      {loading && <p className="no-print" style={{ color: 'var(--muted)' }}>جارِ التحميل...</p>}

      {!loading && projects.length === 0 && (
        <div className="card empty-state no-print"><div className="icon">📋</div>لا توجد مشاريع مخصصة لك كمهندس.</div>
      )}

      {!loading && projects.length > 0 && (
        <>
          <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <button className="btn-primary" onClick={() => window.print()}>🖨 طباعة التقرير (A3)</button>
          </div>

          <div className="card print-a3 print-compact">
            <h2 style={{ textAlign: 'center', marginBottom: 10 }}>تقرير إنتاجية شهر {month}/{year}</h2>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th className="print-proj-col">المشروع</th>
                    <th>حصر الأفراد</th>
                    {REPORT_COLUMNS.map((c) => <th key={c.key}>{c.label}</th>)}
                    <th>إجمالي نقاط المشروع</th>
                    <th>نقاط مركبة حتى 20</th>
                    <th>تنفيذ نقاط سابق</th>
                    <th>تنفيذ نقاط حالي</th>
                    <th>تنفيذ نقاط خلال الشهر</th>
                    <th>نقاط أعمال إضافية</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => {
                    const totals = itemTotals[p.id] || { columns: emptyColumnTotals(), points: 0 }
                    const projectPointsTotal = totals.points + projectDeliveryPointsProjection(p.id)
                    const installed = installedTotals[p.id] || { columns: emptyColumnTotals(), points: 0 }
                    const installedPointsDisplayed = installedPointsWithDelivery(p.id)
                    const existing = productivityRows[p.id]
                    const prevPoints = prevRows[p.id]?.current_points || 0
                    const monthPoints = existing?.month_points ?? suggestedMonthPoints(p.id)
                    const currentPoints = prevPoints + monthPoints
                    const addWork = additionalWorks[p.id] || 0
                    const locked = existing?.locked
                    const workforce = workforceTotals[p.id] || { allTime: 0, thisMonth: 0 }
                    return (
                      <React.Fragment key={p.id}>
                        <tr className="print-bold-row" style={{ fontWeight: 700 }}>
                          <td className="print-proj-col">{p.project_number} — {p.project_name}</td>
                          <td title="إجمالي حصر الأفراد من بداية المشروع حتى يوم 20 من هذا الشهر">{workforce.allTime || ''}</td>
                          {REPORT_COLUMNS.map((c) => <td key={c.key}>{totals.columns[c.key] || ''}</td>)}
                          <td>{Math.round(projectPointsTotal)}</td>
                          <td colSpan={5}></td>
                        </tr>
                        <tr>
                          <td className="print-proj-col" style={{ fontSize: 11, color: 'var(--muted)' }}>منفّذ حتى 20 — مشرف: {p.supervisor_name}</td>
                          <td title="حصر الأفراد خلال الشهر بس (من يوم 21 الشهر السابق لغاية يوم 20 الحالي)">{workforce.thisMonth || ''}</td>
                          {REPORT_COLUMNS.map((c) => <td key={c.key}>{installed.columns[c.key] || ''}</td>)}
                          <td></td>
                          <td>{Math.round(installedPointsDisplayed)}</td>
                          <td>{Math.round(prevPoints)}</td>
                          <td>{Math.round(currentPoints)}</td>
                          <td>
                            {canEdit && !locked ? (
                              <input
                                type="number" min={0} defaultValue={monthPoints}
                                disabled={busyProjectId === p.id}
                                onBlur={(e) => { if (Number(e.target.value) !== monthPoints) saveMonthPoints(p.id, e.target.value) }}
                                style={{ width: 70 }}
                              />
                            ) : (
                              Math.round(monthPoints)
                            )}
                          </td>
                          <td>{Math.round(addWork)}</td>
                        </tr>
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 8 }}>تجميع نقاط تنفيذ خلال الشهر لكل مشرف</h3>
            <table>
              <thead><tr><th>المشرف</th><th>إجمالي النقاط</th></tr></thead>
              <tbody>
                {supervisorTotals.map(([name, points]) => (
                  <tr key={name}><td>{name}</td><td>{Math.round(points)}</td></tr>
                ))}
              </tbody>
            </table>
            <p style={{ marginTop: 10, fontWeight: 700 }}>إجمالي المهندس {profile.full_name}: {Math.round(engineerGrandTotal)} نقطة</p>
          </div>
        </>
      )}
    </div>
  )
}
