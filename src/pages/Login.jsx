import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [authError, setAuthError] = useState(null)
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    if (!loading && user) navigate('/', { replace: true })
  }, [user, loading, navigate])

  async function handleGoogleLogin() {
    setAuthError(null)
    setSigningIn(true)
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        skipBrowserRedirect: false,
      },
    })
    console.log('signInWithOAuth result:', { data, error })
    if (error) {
      console.error('OAuth error (full object):', error)
      setAuthError(error.message)
      setSigningIn(false)
    }
    // on success Supabase redirects the browser — no further action needed
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '1.5rem' }}>
      <h1>Espanyolo</h1>
      <p>Learn Spanish, one word at a time.</p>
      {authError && <p style={{ color: 'red' }}>{authError}</p>}
      <button type="button" onClick={handleGoogleLogin} disabled={signingIn}>
        {signingIn ? 'Redirecting…' : 'Sign in with Google'}
      </button>
    </div>
  )
}
