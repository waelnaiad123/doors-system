import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function UpdatePassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('كلمة السر لازم تكون 6 حروف على الأقل'); return }
    if (password !== confirm) { setError('كلمتا السر مش متطابقتين'); return }
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) { setError(error.message); return }
    setDone(true)
    setTimeout(() => navigate('/'), 2000)
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>تعيين كلمة سر جديدة</h1>
        {error && <div className="alert alert-error">{error}</div>}
        {done ? (
          <div className="alert alert-ok">تم تغيير كلمة السر بنجاح. هيتم تحويلك للبرنامج...</div>
        ) : (
          <>
            <div className="field">
              <label>كلمة السر الجديدة</label>
              <input type="password" required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%' }} />
            </div>
            <div className="field">
              <label>تأكيد كلمة السر</label>
              <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} style={{ width: '100%' }} />
            </div>
            <button className="btn-primary" style={{ width: '100%' }} disabled={busy}>
              {busy ? 'جارِ الحفظ...' : 'حفظ كلمة السر'}
            </button>
          </>
        )}
      </form>
    </div>
  )
}
