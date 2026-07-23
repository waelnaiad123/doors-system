import React, { useState } from 'react'
import { useAuth } from '../AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await signIn(email.trim(), password)
    setBusy(false)
    if (error) setError('بيانات الدخول غير صحيحة، أو الحساب غير مفعّل. تواصل مع الأدمن.')
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>نظام متابعة تركيبات الأبواب</h1>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0, marginBottom: 20 }}>
          سجّل الدخول ببيانات حسابك
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="field">
          <label>البريد الإلكتروني / اسم المستخدم</label>
          <input
            type="email" required autoFocus value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%' }} placeholder="example@company.com"
          />
        </div>
        <div className="field">
          <label>كلمة السر</label>
          <input
            type="password" required value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        <button className="btn-primary" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'جارِ الدخول...' : 'دخول'}
        </button>
      </form>
    </div>
  )
}
