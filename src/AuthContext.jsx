import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = لسه بيحمل
  const [profile, setProfile] = useState(null)
  const [loadingProfile, setLoadingProfile] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) { setProfile(null); return }
    setLoadingProfile(true)
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (error) console.error('تعذر تحميل بيانات المستخدم:', error.message)
        setProfile(data || null)
        setLoadingProfile(false)
      })
  }, [session?.user?.id])

  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password })

  const signOut = () => supabase.auth.signOut()

  const changePassword = (newPassword) =>
    supabase.auth.updateUser({ password: newPassword })

  const value = {
    session,
    profile,
    loading: session === undefined || (session && loadingProfile),
    signIn,
    signOut,
    changePassword,
  }

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
