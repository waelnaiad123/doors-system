import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../AuthContext'

const EMPTY_FORM = { project_number: '', project_name: '', client_name: '', location_code: '', notes: '' }
const FIELD_LABELS = { project_number: 'رقم المشروع', project_name: 'اسم المشروع', client_name: 'اسم العميل', location_code: 'كود مكان المشروع' }
const MAPPING_KEY = 'project_import_cell_mapping_v1'

function colLetter(i) {
  let s = ''
  i += 1
  while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26) }
  return s
}

export default function Projects() {
  const { profile } = useAuth()
  const canCreate = ['admin', 'data_entry'].includes(profile?.role)

  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [importMode, setImportMode] = useState(false)
  const [sheetGrid, setSheetGrid] = useState([])
  const [cellMapping, setCellMapping] = useState({})
  const [importError, setImportError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    let query = supabase.from('projects').select('*').order('created_at', { ascending: false }).limit(200)
    if (q.trim()) {
      const term = `%${q.trim()}%`
      query = query.or(
        `project_number.ilike.${term},project_name.ilike.${term},client_name.ilike.${term},location_code.ilike.${term}`
      )
    }
    const { data, error } = await query
    if (error) setError(error.message)
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line
  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error } = await supabase.from('projects').insert({
      ...form,
      created_by: profile.id,
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    setForm(EMPTY_FORM)
    setShowForm(false)
    setImportMode(false)
    load()
  }

  function applyMapping(mapping, grid) {
    const next = { ...EMPTY_FORM }
    Object.keys(FIELD_LABELS).forEach((field) => {
      const pos = mapping[field]
      if (pos && grid[pos.r] && grid[pos.r][pos.c] != null) {
        next[field] = String(grid[pos.r][pos.c])
      }
    })
    setForm((f) => ({ ...f, ...next }))
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError('')
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
      const capped = grid.slice(0, 40).map((row) => row.slice(0, 20))
      setSheetGrid(capped)

      const saved = localStorage.getItem(MAPPING_KEY)
      if (saved) {
        const mapping = JSON.parse(saved)
        setCellMapping(mapping)
        applyMapping(mapping, capped)
      }
    } catch (err) {
      setImportError('تعذّرت قراءة الملف. تأكد إنه ملف إكسيل صالح.')
    }
  }

  function setCellForField(field, value) {
    if (!value) return
    const [r, c] = value.split(',').map(Number)
    const mapping = { ...cellMapping, [field]: { r, c } }
    setCellMapping(mapping)
    setForm((f) => ({ ...f, [field]: String(sheetGrid[r][c] ?? '') }))
    localStorage.setItem(MAPPING_KEY, JSON.stringify(mapping))
  }

  function cellOptionLabel(r, c) {
    const val = sheetGrid[r]?.[c]
    const shown = val == null || val === '' ? '(فارغة)' : String(val).slice(0, 30)
    return `${colLetter(c)}${r + 1}: ${shown}`
  }

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <h1>المشاريع</h1>
        {canCreate && (
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'إلغاء' : '+ مشروع جديد'}
          </button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <form className="card" onSubmit={handleCreate}>
          <div className="toolbar" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
            <h2>بيانات المشروع الجديد</h2>
            <div className="toolbar">
              <button type="button" className={!importMode ? 'btn-primary sm' : 'btn-secondary sm'} onClick={() => setImportMode(false)}>إدخال يدوي</button>
              <button type="button" className={importMode ? 'btn-primary sm' : 'btn-secondary sm'} onClick={() => setImportMode(true)}>استيراد من ملف</button>
            </div>
          </div>

          {importMode && (
            <div className="field">
              <label>ملف إكسيل يحتوي على بيانات المشروع</label>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
              {importError && <p style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 6 }}>{importError}</p>}

              {sheetGrid.length > 0 && (
                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {Object.keys(FIELD_LABELS).map((field) => (
                    <div key={field} className="field">
                      <label>{FIELD_LABELS[field]} — اختر الخلية من الملف</label>
                      <select
                        value={cellMapping[field] ? `${cellMapping[field].r},${cellMapping[field].c}` : ''}
                        onChange={(e) => setCellForField(field, e.target.value)}
                      >
                        <option value="">-- اختر خلية --</option>
                        {sheetGrid.map((row, r) => row.map((_, c) => (
                          <option key={`${r},${c}`} value={`${r},${c}`}>{cellOptionLabel(r, c)}</option>
                        )))}
                      </select>
                    </div>
                  ))}
                  <p style={{ fontSize: 12, color: 'var(--muted)', gridColumn: '1 / -1' }}>
                    اختيارك هيتحفظ تلقائيًا، فالمرة الجاية لما ترفع ملف بنفس الشكل هيتملى الفورم لوحده.
                  </p>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <label>رقم المشروع *</label>
              <input required value={form.project_number}
                onChange={(e) => setForm({ ...form, project_number: e.target.value })} />
            </div>
            <div className="field">
              <label>اسم المشروع *</label>
              <input required value={form.project_name}
                onChange={(e) => setForm({ ...form, project_name: e.target.value })} />
            </div>
            <div className="field">
              <label>اسم العميل</label>
              <input value={form.client_name}
                onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
            </div>
            <div className="field">
              <label>كود مكان المشروع</label>
              <input value={form.location_code}
                onChange={(e) => setForm({ ...form, location_code: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>ملاحظات</label>
            <textarea rows={2} style={{ width: '100%' }} value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <button className="btn-primary" disabled={saving}>{saving ? 'جارِ الحفظ...' : 'حفظ المشروع'}</button>
        </form>
      )}

      <div className="card">
        <div className="toolbar">
          <input
            placeholder="ابحث بالاسم، الرقم، العميل، أو كود المكان..."
            style={{ flex: 1, minWidth: 260 }}
            value={q} onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {loading ? (
          <p style={{ color: 'var(--muted)' }}>جارِ التحميل...</p>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <div className="icon">🚪</div>
            لا توجد مشاريع لعرضها. {canCreate && 'ابدأ بإنشاء مشروع جديد من الأعلى.'}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>رقم المشروع</th><th>اسم المشروع</th><th>العميل</th><th>كود المكان</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="code-cell">{p.project_number}</td>
                  <td>{p.project_name}</td>
                  <td>{p.client_name || '—'}</td>
                  <td className="code-cell">{p.location_code || '—'}</td>
                  <td><Link className="btn-secondary sm" to={`/projects/${p.id}`}>فتح ↦</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
