import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { ROLES, ROLE_LIST } from '../lib/roles'

const EMPTY_FORM = { email: '', password: '', full_name: '', role: 'technician', can_create_projects: false }

async function extractFunctionError(error, data) {
  if (data?.error) return data.error
  if (error?.context) {
    try {
      const body = await error.context.json()
      if (body?.error) return body.error
    } catch { /* تعذّر قراءة تفاصيل الخطأ، سيتم استخدام الرسالة العامة */ }
  }
  return error?.message || 'حدث خطأ غير متوقع'
}


export default function UsersScreen() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')

  useEffect(() => { loadUsers() }, [])

  async function loadUsers() {
    setLoading(true)
    setError('')
    const { data, error } = await supabase
      .from('profiles')
      .select('*, profiles_private(phone, email)')
      .order('full_name')
    if (error) setError(error.message)
    setUsers(data || [])
    setLoading(false)
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError(''); setNotice('')
    if (!form.email.trim() || !form.password || !form.full_name.trim()) { setError('املأ كل الحقول المطلوبة'); return }
    if (form.password.length < 6) { setError('كلمة السر لازم تكون 6 حروف على الأقل'); return }
    setSaving(true)
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: {
          action: 'create_user',
          email: form.email.trim(),
          password: form.password,
          full_name: form.full_name.trim(),
          role: form.role,
          can_create_projects: form.can_create_projects,
        },
      })
      if (error || data?.error) throw new Error(await extractFunctionError(error, data))
      setNotice(`تم إنشاء حساب "${form.full_name}" بنجاح.`)
      setForm(EMPTY_FORM); setShowForm(false)
      await loadUsers()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleResetPassword(user) {
    const newPass = window.prompt(`كلمة سر جديدة لـ "${user.full_name}" (6 حروف على الأقل):`)
    if (!newPass) return
    if (newPass.length < 6) { setError('كلمة السر لازم تكون 6 حروف على الأقل'); return }
    setBusyId(user.id)
    setError(''); setNotice('')
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'reset_password', user_id: user.id, new_password: newPass },
      })
      if (error || data?.error) throw new Error(await extractFunctionError(error, data))
      setNotice(`تم تغيير كلمة السر لـ "${user.full_name}" بنجاح.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  async function handleDeleteUser(user) {
    const confirmText = window.prompt(
      `هذا الإجراء نهائي ومفيش تراجع عنه. هيتم حذف حساب "${user.full_name}" بالكامل مع كل صلاحياته.\nاكتب اسمه بالظبط عشان تأكيد الحذف: ${user.full_name}`
    )
    if (confirmText !== user.full_name) {
      if (confirmText !== null) setError('الاسم اللي كتبته مش مطابق، اتلغى الحذف.')
      return
    }
    setBusyId(user.id)
    setError(''); setNotice('')
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'delete_user', user_id: user.id },
      })
      if (error || data?.error) throw new Error(await extractFunctionError(error, data))
      setNotice(`تم حذف حساب "${user.full_name}" نهائيًا.`)
      await loadUsers()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId('')
    }
  }

  async function updateField(user, field, value) {
    setBusyId(user.id)
    setError('')
    const { error } = await supabase.from('profiles').update({ [field]: value }).eq('id', user.id)
    setBusyId('')
    if (error) { setError(error.message); return }
    await loadUsers()
  }

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <h1>المستخدمون</h1>
        <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>{showForm ? 'إلغاء' : '+ مستخدم جديد'}</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-ok">{notice}</div>}

      {showForm && (
        <form className="card" onSubmit={handleCreate}>
          <h2 style={{ marginBottom: 12 }}>حساب جديد</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <label>الاسم الكامل *</label>
              <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="field">
              <label>الدور *</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ROLE_LIST.filter((r) => r !== 'admin').map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
              </select>
            </div>
            <div className="field">
              <label>البريد الإلكتروني *</label>
              <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="field">
              <label>كلمة سر مبدئية *</label>
              <input type="text" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
          </div>
          {form.role === 'data_entry' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <input type="checkbox" checked={form.can_create_projects}
                onChange={(e) => setForm({ ...form, can_create_projects: e.target.checked })} style={{ width: 20, height: 20 }} />
              يقدر ينشئ مشاريع جديدة من الصفر
            </label>
          )}
          <button className="btn-primary" disabled={saving}>{saving ? 'جارِ الإنشاء...' : 'إنشاء الحساب'}</button>
        </form>
      )}

      <div className="card">
        {loading ? (
          <p style={{ color: 'var(--muted)' }}>جارِ التحميل...</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr><th>الاسم</th><th>البريد</th><th>الدور</th><th>الحالة</th><th>إنشاء مشاريع</th><th>تفويض شامل</th><th>مدير التركيبات</th><th></th></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.full_name}</td>
                    <td style={{ fontSize: 12.5 }}>{u.profiles_private?.email || '—'}</td>
                    <td>
                      <select value={u.role} disabled={busyId === u.id || u.role === 'admin'}
                        onChange={(e) => updateField(u, 'role', e.target.value)}>
                        {ROLE_LIST.map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
                      </select>
                    </td>
                    <td>
                      <button className={u.is_active ? 'btn-ok sm' : 'btn-danger sm'} disabled={busyId === u.id || u.role === 'admin'}
                        onClick={() => updateField(u, 'is_active', !u.is_active)}>
                        {u.is_active ? 'مفعّل' : 'مُعطّل'}
                      </button>
                    </td>
                    <td>
                      {u.role === 'data_entry' ? (
                        <input type="checkbox" checked={!!u.can_create_projects} disabled={busyId === u.id}
                          onChange={(e) => updateField(u, 'can_create_projects', e.target.checked)} style={{ width: 20, height: 20 }} />
                      ) : '—'}
                    </td>
                    <td>
                      {u.role === 'data_entry' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <button
                            className={u.all_projects_data_entry ? 'btn-ok sm' : 'btn-secondary sm'}
                            disabled={busyId === u.id}
                            onClick={() => updateField(u, 'all_projects_data_entry', !u.all_projects_data_entry)}
                          >
                            {u.all_projects_data_entry ? 'مدخل بيانات: كل المشاريع ✓' : 'تفويض مدخل بيانات لكل المشاريع'}
                          </button>
                          <button
                            className={u.all_projects_delivery_entry ? 'btn-ok sm' : 'btn-secondary sm'}
                            disabled={busyId === u.id}
                            onClick={() => updateField(u, 'all_projects_delivery_entry', !u.all_projects_delivery_entry)}
                          >
                            {u.all_projects_delivery_entry ? 'مدخل تسليمات: كل المشاريع ✓' : 'تفويض مدخل تسليمات لكل المشاريع'}
                          </button>
                        </div>
                      )}
                      {u.role === 'delivery_entry' && (
                        <button
                          className={u.all_projects_delivery_entry ? 'btn-ok sm' : 'btn-secondary sm'}
                          disabled={busyId === u.id}
                          onClick={() => updateField(u, 'all_projects_delivery_entry', !u.all_projects_delivery_entry)}
                        >
                          {u.all_projects_delivery_entry ? 'كل المشاريع ✓' : 'تفويض لكل المشاريع'}
                        </button>
                      )}
                      {u.role !== 'data_entry' && u.role !== 'delivery_entry' && '—'}
                    </td>
                    <td>
                      <button
                        className={u.is_installations_manager ? 'btn-ok sm' : 'btn-secondary sm'}
                        disabled={busyId === u.id}
                        onClick={() => updateField(u, 'is_installations_manager', !u.is_installations_manager)}
                      >
                        {u.is_installations_manager ? 'مفعّل ✓' : 'تفعيل'}
                      </button>
                    </td>
                    <td>
                      <button className="btn-secondary sm" disabled={busyId === u.id} onClick={() => handleResetPassword(u)}>
                        إعادة تعيين كلمة السر
                      </button>
                      <button className="btn-danger sm" disabled={busyId === u.id} onClick={() => handleDeleteUser(u)} style={{ marginInlineStart: 6 }}>
                        حذف الحساب
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
        ملاحظة: "تعطيل" الحساب (بدل الحذف النهائي) هو اللي بيمنع الدخول فورًا، مع الحفاظ على كل سجلاته القديمة
        (تركيبات، تسليمات...) سليمة في التقارير. حساب الأدمن نفسه لا يمكن تعطيله أو تغيير دوره من هنا.
      </p>
    </div>
  )
}
