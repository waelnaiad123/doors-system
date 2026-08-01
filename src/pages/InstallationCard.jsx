import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/fetchAll'

// كل بند من بنود الشركة وعموده المقابل في نظامنا (البنود اللي مش موجودة هنا، زي architrave، مستبعدة من التقرير عمدًا)
const REPORT_COLUMNS = [
  { key: 'frame', label: 'تركيب فريم', match: (r) => r.item_type === 'حلق' },
  { key: 'frame_cast', label: 'صب فريم', match: (r) => r.item_type === 'صب حلق' },
  { key: 'leaf_large', label: 'ضلف (ك)', match: (r) => r.item_type === 'ضلفة' && r.variant === 'large' },
  { key: 'leaf_regular', label: 'ضلف (ص)', match: (r) => r.item_type === 'ضلفة' && !r.variant },
  { key: 'sliding_door', label: 'باب جرار', match: (r) => r.item_type === 'ضلفة' && r.variant === 'sliding' },
  { key: 'vent_frame', label: 'حلق شباك', match: (r) => r.item_type === 'حلق هواية/شباك' },
  { key: 'vent_count', label: 'ريش هواية/شباك', match: (r) => r.item_type === 'عدد الهوايات' },
  { key: 'kalon', label: 'كالون', match: (r) => r.item_type === 'كالون' },
  { key: 'panic', label: 'بانيك', match: (r) => r.item_type === 'بانيك' },
  { key: 'akra', label: 'أكرة', match: (r) => r.item_type === 'أكرة' },
  { key: 'closer', label: 'ماكينة', match: (r) => r.item_type === 'ماكينة غلق' },
  { key: 'coordinator', label: 'مهدئ', match: (r) => r.item_type === 'مهدئ' },
  { key: 'flush_bolt', label: 'ترباس', match: (r) => r.item_type === 'ترباس' },
  { key: 'dust_proof', label: 'صدادة ترباس', match: (r) => r.item_type === 'صدادة ترباس' },
  { key: 'door_stop', label: 'صدادة', match: (r) => r.item_type === 'صدادة' },
  { key: 'd_bottom', label: 'فرش', match: (r) => r.item_type === 'فرش' },
  { key: 'threshold', label: 'عتب', match: (r) => r.item_type === 'عتب' },
  { key: 'astragal', label: 'ستارة', match: (r) => r.item_type === 'ستارة' },
  { key: 'gasket', label: 'كاوتش', match: (r) => r.item_type === 'كاوتش' },
  { key: 'pull_handle', label: 'مقبض', match: (r) => r.item_type === 'مقبض' },
  { key: 'push_plate', label: 'بوش بليت', match: (r) => r.item_type === 'بوش بليت' },
  { key: 'kick_plate', label: 'كيك بليت', match: (r) => r.item_type === 'كيك بليت' },
]

function pad(n) { return String(n).padStart(2, '0') }
function toISO(y, m, d) { return `${y}-${pad(m)}-${pad(d)}` }
function daysInMonth(y, m) { return new Date(y, m, 0).getDate() }

function getPeriodRange(year, month, period) {
  if (period === 1) {
    const pm = month === 1 ? 12 : month - 1
    const py = month === 1 ? year - 1 : year
    return { start: toISO(py, pm, 21), end: toISO(py, pm, daysInMonth(py, pm)) }
  }
  if (period === 2) return { start: toISO(year, month, 1), end: toISO(year, month, 10) }
  return { start: toISO(year, month, 11), end: toISO(year, month, 20) }
}

function dateRangeList(start, end) {
  const list = []
  let cur = new Date(start + 'T00:00:00')
  const last = new Date(end + 'T00:00:00')
  while (cur <= last) {
    list.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`)
    cur.setDate(cur.getDate() + 1)
  }
  return list
}

function emptyTotals() {
  const t = {}
  REPORT_COLUMNS.forEach((c) => { t[c.key] = 0 })
  return t
}

export default function InstallationCard() {
  const today = new Date()
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [project, setProject] = useState(null)
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [period, setPeriod] = useState(2)

  const [totalItems, setTotalItems] = useState([]) // كل بنود المشروع (بغض النظر عن حالة التركيب)
  const [installRows, setInstallRows] = useState([]) // كل تسجيلات التركيب المعتمدة في المشروع
  const [workforceRows, setWorkforceRows] = useState([])
  const [notesRows, setNotesRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadProjects() }, [])
  useEffect(() => { if (projectId) loadProjectData() }, [projectId]) // eslint-disable-line

  async function loadProjects() {
    const { data, error } = await fetchAllRows((from, to) =>
      supabase.from('projects').select('id, project_name, project_number, client_name, po_number').order('project_name').range(from, to)
    )
    if (error) setError(error.message)
    setProjects(data || [])
  }

  async function loadProjectData() {
    setLoading(true)
    setError('')
    try {
      const p = projects.find((x) => x.id === projectId)
      setProject(p || null)

      const { data: doorsWithItems, error: e1 } = await fetchAllRows((from, to) =>
        supabase
          .from('doors')
          .select('door_items(quantity, variant, item_types(name))')
          .eq('project_id', projectId)
          .range(from, to)
      )
      if (e1) throw e1
      const flatItems = []
      ;(doorsWithItems || []).forEach((d) => {
        (d.door_items || []).forEach((it) => {
          flatItems.push({ item_type: it.item_types?.name, variant: it.variant, quantity: it.quantity })
        })
      })
      setTotalItems(flatItems)

      const { data: installs, error: e2 } = await fetchAllRows((from, to) =>
        supabase
          .from('v_installations_detail')
          .select('item_type, variant, quantity, installed_at, points_earned')
          .eq('project_id', projectId).eq('status', 'approved')
          .range(from, to)
      )
      if (e2) throw e2
      setInstallRows(installs || [])

      const { data: wf, error: e3 } = await supabase
        .from('daily_workforce').select('work_date, headcount, planned_points').eq('project_id', projectId)
      if (e3) throw e3
      setWorkforceRows(wf || [])

      const { data: notes, error: e4 } = await supabase
        .from('daily_project_notes').select('note_date, installation_notes, non_execution_reason').eq('project_id', projectId)
      if (e4) throw e4
      setNotesRows(notes || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const { start, end } = useMemo(() => getPeriodRange(year, month, period), [year, month, period])
  const days = useMemo(() => dateRangeList(start, end), [start, end])

  // إجمالي كل بند في المشروع (بغض النظر عن حالة التركيب)
  const projectTotals = useMemo(() => {
    const t = emptyTotals()
    totalItems.forEach((r) => {
      const col = REPORT_COLUMNS.find((c) => c.match(r))
      if (col) t[col.key] += Number(r.quantity) || 0
    })
    return t
  }, [totalItems])



  // ما تم تركيبه واعتماده قبل بداية المدة
  const beforeTotals = useMemo(() => {
    const t = emptyTotals()
    let points = 0
    installRows.forEach((r) => {
      if (r.installed_at >= start) return
      const col = REPORT_COLUMNS.find((c) => c.match(r))
      if (col) t[col.key] += Number(r.quantity) || 0
      points += Number(r.points_earned) || 0
    })
    return { totals: t, points }
  }, [installRows, start])

  // بيانات كل يوم داخل المدة
  const dailyData = useMemo(() => {
    return days.map((d) => {
      const t = emptyTotals()
      let executedPoints = 0
      installRows.forEach((r) => {
        if (r.installed_at !== d) return
        const col = REPORT_COLUMNS.find((c) => c.match(r))
        if (col) t[col.key] += Number(r.quantity) || 0
        executedPoints += Number(r.points_earned) || 0
      })
      const wf = workforceRows.find((w) => w.work_date === d)
      return {
        date: d,
        headcount: wf?.headcount ?? '',
        plannedPoints: wf?.planned_points ?? '',
        executedPoints,
        totals: t,
      }
    })
  }, [days, installRows, workforceRows])

  // إجمالي المُنفذ خلال المدة (مجموع الأيام)
  const periodTotals = useMemo(() => {
    const t = emptyTotals()
    let points = 0
    dailyData.forEach((day) => {
      REPORT_COLUMNS.forEach((c) => { t[c.key] += day.totals[c.key] })
      points += day.executedPoints
    })
    return { totals: t, points }
  }, [dailyData])

  // إجمالي التركيب بالمشروع حتى نهاية المدة = قبل المدة + خلال المدة
  const cumulativeThroughEnd = useMemo(() => {
    const t = emptyTotals()
    REPORT_COLUMNS.forEach((c) => { t[c.key] = beforeTotals.totals[c.key] + periodTotals.totals[c.key] })
    return { totals: t, points: beforeTotals.points + periodTotals.points }
  }, [beforeTotals, periodTotals])

  const projectPointsTotal = useMemo(() => {
    // نقاط كل بند = نقاطه المعتمدة × إجمالي كميته بالمشروع؛ نجيب النقاط من أول سطر تركيب بنفس البند لو موجود، أو من الكميات فقط لو لأ
    // أبسط طريقة: نستخدم points_earned/quantity من installRows كمتوسط نقطة لكل بند لو موجود
    const perItemPoints = {}
    installRows.forEach((r) => {
      if (!r.quantity) return
      const unit = Number(r.points_earned) / Number(r.quantity)
      if (Number.isFinite(unit)) perItemPoints[`${r.item_type}|${r.variant || ''}`] = unit
    })
    let total = 0
    totalItems.forEach((r) => {
      const key = `${r.item_type}|${r.variant || ''}`
      const unit = perItemPoints[key]
      if (unit) total += unit * (Number(r.quantity) || 0)
    })
    return Math.round(total)
  }, [totalItems, installRows])

  const periodNotes = useMemo(
    () => notesRows.filter((n) => n.note_date >= start && n.note_date <= end && n.installation_notes),
    [notesRows, start, end]
  )
  const periodReasons = useMemo(
    () => notesRows.filter((n) => n.note_date >= start && n.note_date <= end && n.non_execution_reason),
    [notesRows, start, end]
  )

  const workedDaysCount = dailyData.filter((d) => Number(d.headcount) > 0).length

  return (
    <div>
      <div className="no-print">
        <h1>كارت متابعة تركيبات</h1>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="card">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <div className="field">
              <label>المشروع</label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">-- اختر مشروعًا --</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.project_number} — {p.project_name}</option>
                ))}
              </select>
            </div>
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
            <div className="field">
              <label>المدة</label>
              <select value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
                <option value={1}>الأولى (21 من الشهر السابق - آخره)</option>
                <option value={2}>الثانية (1 - 10)</option>
                <option value={3}>الثالثة (11 - 20)</option>
              </select>
            </div>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 8 }}>
            الفترة المحددة: من {start} إلى {end}
          </p>
        </div>
      </div>

      {loading && <p className="no-print" style={{ color: 'var(--muted)' }}>جارِ التحميل...</p>}

      {projectId && !loading && project && (
        <>
          <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <button className="btn-primary" onClick={() => window.print()}>🖨 طباعة الكارت</button>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <img src="/france-metal-logo.jpg" alt="France Metal" style={{ height: 50 }} />
              <div style={{ textAlign: 'center' }}>
                <h2 style={{ marginBottom: 2 }}>كارت متابعة إنتاجية ونقاط المشروع</h2>
                <div style={{ fontSize: 13 }}>الشركة الفرنسية للصناعات المعدنية — إدارة التركيبات</div>
              </div>
              <table style={{ fontSize: 12.5 }}>
                <tbody>
                  <tr><td><strong>اسم المشروع</strong></td><td>{project.project_name}</td></tr>
                  <tr><td><strong>اسم العميل</strong></td><td>{project.client_name || '—'}</td></tr>
                  <tr><td><strong>P.O</strong></td><td>{project.project_number}</td></tr>
                  <tr><td><strong>إنتاجية مدة</strong></td><td>{period} / شهر {month}/{year}</td></tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', gap: 20, marginBottom: 10, flexWrap: 'wrap' }}>
              <span className="badge badge-ok">عدد نقاط المشروع: {projectPointsTotal}</span>
              <span className="badge badge-pending">النقاط المنفذة خلال المدة: {periodTotals.points}</span>
              <span className="badge badge-empty">عدد أيام العمل خلال المدة: {workedDaysCount}</span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th>التاريخ</th><th>عدد العمال</th><th>نقاط منفذة</th><th>نقاط مخططة</th>
                    {REPORT_COLUMNS.map((c) => <th key={c.key}>{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ fontWeight: 700 }}>
                    <td colSpan={4}>إجمالي بنود المشروع</td>
                    {REPORT_COLUMNS.map((c) => <td key={c.key}>{projectTotals[c.key] || ''}</td>)}
                  </tr>
                  <tr style={{ fontWeight: 700, background: 'var(--bg)' }}>
                    <td colSpan={2}>تركيب سابق (قبل {start})</td>
                    <td colSpan={2}>{beforeTotals.points}</td>
                    {REPORT_COLUMNS.map((c) => <td key={c.key}>{beforeTotals.totals[c.key] || ''}</td>)}
                  </tr>
                  {dailyData.map((day) => (
                    <tr key={day.date}>
                      <td className="code-cell">{day.date}</td>
                      <td>{day.headcount}</td>
                      <td>{day.executedPoints || ''}</td>
                      <td>{day.plannedPoints}</td>
                      {REPORT_COLUMNS.map((c) => <td key={c.key}>{day.totals[c.key] || ''}</td>)}
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700, background: 'var(--bg)' }}>
                    <td colSpan={2}>تركيب خلال المدة</td>
                    <td colSpan={2}>{periodTotals.points}</td>
                    {REPORT_COLUMNS.map((c) => <td key={c.key}>{periodTotals.totals[c.key] || ''}</td>)}
                  </tr>
                  <tr style={{ fontWeight: 700 }}>
                    <td colSpan={2}>إجمالي التركيب بالمشروع حتى نهاية المدة</td>
                    <td colSpan={2}>{cumulativeThroughEnd.points}</td>
                    {REPORT_COLUMNS.map((c) => <td key={c.key}>{cumulativeThroughEnd.totals[c.key] || ''}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 8 }}>أسباب عدم التنفيذ خلال المدة</h3>
            {periodReasons.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>لا يوجد.</p>
            ) : (
              <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 13 }}>
                {periodReasons.map((n, i) => (
                  <li key={i}><strong className="code-cell">{n.note_date}</strong>: {n.non_execution_reason}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h3 style={{ marginBottom: 8 }}>ملاحظات خلال المدة</h3>
            {periodNotes.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>لا يوجد.</p>
            ) : (
              <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 13 }}>
                {periodNotes.map((n, i) => (
                  <li key={i}><strong className="code-cell">{n.note_date}</strong>: {n.installation_notes}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="card" style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', paddingTop: 40 }}>
            <div>المشرف المسؤول<div style={{ borderTop: '1px solid var(--border)', marginTop: 40, paddingTop: 4 }}>التوقيع</div></div>
            <div>المهندس المسؤول<div style={{ borderTop: '1px solid var(--border)', marginTop: 40, paddingTop: 4 }}>التوقيع</div></div>
            <div>مدير التركيبات<div style={{ borderTop: '1px solid var(--border)', marginTop: 40, paddingTop: 4 }}>التوقيع</div></div>
          </div>
        </>
      )}
    </div>
  )
}
