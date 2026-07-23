import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../AuthContext'

const EMPTY_FORM = { project_number: '', project_name: '', client_name: '', location_code: '', notes: '' }

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
    load()
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
          <h2 style={{ marginBottom: 14 }}>بيانات المشروع الجديد</h2>
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
