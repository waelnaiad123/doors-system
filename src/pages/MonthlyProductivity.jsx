import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAll'
import { REPORT_COLUMNS, emptyColumnTotals } from '../lib/reportColumns'
import { useAuth } from '../AuthContext'

function pad(n) { return String(n).padStart(2, '0') }
function toISO(y, m, d) { return `${y}-${pad(m)}-${pad(d)}` }

export default function MonthlyProductivity() {
  const { profile } = useAuth()
  const today = new Date()
  const canManageOthers = profile.role === 'admin' || profile.is_installations_manager
  const [engineersList, setEngineersList] = useState([])
  const [selectedEngineerId, setSelectedEngineerId] = useState(profile.role === 'engineer' ? profile.id : '')
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)

  const [projects, setProjects] = useState([]) // {id, project_name, project_number, supervisor_name}
  const [itemTotals, setItemTotals] = useState({}) // project_id -> {columns, points}
  const [installedTotals, setInstalledTotals] = useState({}) // project_id -> {columns, points} (through day 20)
  const [productivityRows, setProductivityRows] = useState({}) // project_id -> row (this month)
  const [prevRows, setPrevRows] = useState({}) // project_id -> row (previous month)
  const [additionalWorks, setAdditionalWorks] = useState({}) // project_id -> total points
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyProjectId, setBusyProjectId] = useState('')

  const isCurrentOrPastMonth = year < today.getFullYear() || (year === today.getFullYear() && month <= today.getMonth() + 1)
  const isThisExactMonth = year === today.getFullYear() && month === today.getMonth() + 1
  const canEdit = isCurrentOrPastMonth && (!isThisExactMonth || today.getDate() >= 21)

  useEffect(() => {
    if (canManageOthers) loadEngineersList()
  }, []) // eslint-disable-line

  useEffect(() => { if (selectedEngineerId) loadEverything() }, [year, month, selectedEngineerId]) // eslint-disable-line

  async function loadEngineersList() {
    const { data } = await supabase.from('profiles').select('id, full_name').eq('role', 'engineer').eq('is_active', true).order('full_name')
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
          .select('project_id, projects(id, project_name, project_number)')
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

      const projList = (assigns || [])
        .map((a) => a.projects)
        .filter(Boolean)
        .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i)
        .map((p) => ({ ...p, supervisor_name: supervisorByProject[p.id] || '—' }))
      setProjects(projList)

      // 2) إجمالي بنود كل مشروع (كمية + نقاط فعلية للبند)
      const { data: doorsWithItems } = await fetchAllRows((from, to) =>
        supabase
          .from('doors')
          .select('project_id, door_items(quantity, variant, points_override, item_types(name, points))')
          .in('project_id', projectIds)
          .range(from, to)
      )
      const itemTotalsMap = {}
      projectIds.forEach((id) => { itemTotalsMap[id] = { columns: emptyColumnTotals(), points: 0 } })
      ;(doorsWithItems || []).forEach((d) => {
        const bucket = itemTotalsMap[d.project_id]
        if (!bucket) return
        ;(d.door_items || []).forEach((it) => {
          const r = { item_type: it.item_types?.name, variant: it.variant }
          const col = REPORT_COLUMNS.find((c) => c.match(r))
          const qty = Number(it.quantity) || 0
          const unitPoints = Number(it.points_override ?? it.item_types?.points) || 0
          if (col) bucket.columns[col.key] += qty
          bucket.points += qty * unitPoints
        })
      })
      setItemTotals(itemTotalsMap)

      // 3) ما تم تركيبه واعتماده حتى يوم 20 من الشهر المطلوب
      const cutoff = toISO(year, month, 20)
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

      // 4) صفوف تقرير الإنتاجية للشهر الحالي والشهر السابق
      const { data: thisMonthRows } = await supabase
        .from('monthly_productivity').select('*')
        .eq('engineer_id', selectedEngineerId).eq('year', year).eq('month', month).in('project_id', projectIds)
      const thisMap = {}
      ;(thisMonthRows || []).forEach((r) => { thisMap[r.project_id] = r })
      setProductivityRows(thisMap)

      const prevMonth = month === 1 ? 12 : month - 1
      const prevYear = month === 1 ? year - 1 : year
      const { data: prevMonthRows } = await supabase
        .from('monthly_productivity').select('*')
        .eq('engineer_id', selectedEngineerId).eq('year', prevYear).eq('month', prevMonth).in('project_id', projectIds)
      const prevMap = {}
      ;(prevMonthRows || []).forEach((r) => { prevMap[r.project_id] = r })
      setPrevRows(prevMap)

      // 5) نقاط الأعمال الإضافية لنفس الشهر
      const { data: addWorks } = await supabase
        .from('additional_works').select('*')
        .eq('engineer_id', selectedEngineerId).eq('year', year).eq('month', month).in('project_id', projectIds)
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

  function suggestedMonthPoints(projectId) {
    const installedPoints = installedTotals[projectId]?.points || 0
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
  }, [projects, productivityRows, installedTotals, prevRows]) // eslint-disable-line

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
              تقرير هذا الشهر بيتفتح للتسجيل يوم 21 فقط. النهاردة يوم {today.getDate()}.
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
                    <th>المشروع</th>
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
                    const installed = installedTotals[p.id] || { columns: emptyColumnTotals(), points: 0 }
                    const existing = productivityRows[p.id]
                    const prevPoints = prevRows[p.id]?.current_points || 0
                    const monthPoints = existing?.month_points ?? suggestedMonthPoints(p.id)
                    const currentPoints = prevPoints + monthPoints
                    const addWork = additionalWorks[p.id] || 0
                    const locked = existing?.locked
                    return (
                      <React.Fragment key={p.id}>
                        <tr style={{ fontWeight: 700 }}>
                          <td>{p.project_number} — {p.project_name}</td>
                          {REPORT_COLUMNS.map((c) => <td key={c.key}>{totals.columns[c.key] || ''}</td>)}
                          <td>{Math.round(totals.points)}</td>
                          <td colSpan={5}></td>
                        </tr>
                        <tr>
                          <td style={{ fontSize: 11, color: 'var(--muted)' }}>منفّذ حتى 20 — مشرف: {p.supervisor_name}</td>
                          {REPORT_COLUMNS.map((c) => <td key={c.key}>{installed.columns[c.key] || ''}</td>)}
                          <td></td>
                          <td>{Math.round(installed.points)}</td>
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
