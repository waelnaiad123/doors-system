import React, { useState } from 'react'
import { useAuth } from '../AuthContext'
import { supabase } from '../lib/supabaseClient'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState('login') // 'login' | 'forgot'
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await signIn(email.trim(), password)
    setBusy(false)
    if (error) setError('بيانات الدخول غير صحيحة، أو الحساب غير مفعّل. تواصل مع الأدمن.')
  }

  async function handleForgotPassword(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/update-password`,
    })
    setBusy(false)
    if (error) { setError(error.message); return }
    setResetSent(true)
  }

  if (mode === 'forgot') {
    return (
      <div className="login-wrap">
        <form className="login-card" onSubmit={handleForgotPassword}>
          <h1>استعادة كلمة السر</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 0, marginBottom: 20 }}>
            اكتب بريدك الإلكتروني المسجّل، وهيوصلّك رابط لتعيين كلمة سر جديدة.
          </p>

          {error && <div className="alert alert-error">{error}</div>}
          {resetSent && (
            <div className="alert alert-ok">
              لو الإيميل ده مسجّل عندنا، وصله رابط لإعادة تعيين كلمة السر. افتح بريدك الإلكتروني واتبع الرابط.
            </div>
          )}

          {!resetSent && (
            <>
              <div className="field">
                <label>البريد الإلكتروني</label>
                <input
                  type="email" required autoFocus value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  style={{ width: '100%' }} placeholder="example@company.com"
                />
              </div>
              <button className="btn-primary" style={{ width: '100%' }} disabled={busy}>
                {busy ? 'جارِ الإرسال...' : 'إرسال رابط إعادة التعيين'}
              </button>
            </>
          )}

          <button
            type="button" className="btn-secondary" style={{ width: '100%', marginTop: 10 }}
            onClick={() => { setMode('login'); setError(''); setResetSent(false) }}
          >
            رجوع لتسجيل الدخول
          </button>
        </form>
      </div>
    )
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
        <button
          type="button" onClick={() => setMode('forgot')}
          style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 13, marginTop: 12, cursor: 'pointer', width: '100%' }}
        >
          نسيت كلمة السر؟
        </button>
      </form>
    </div>
  )
}
