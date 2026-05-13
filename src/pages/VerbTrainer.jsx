import { useNavigate } from 'react-router-dom'
import { supabase } from '../utils/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import { VERB_TIERS } from '../utils/courseData'

export default function VerbTrainer() {
  const { user } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  function handleVerbTier(tier) {
    console.log('Selected tier:', tier)
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.logo}>espanyolo</h1>
        <div style={styles.headerRight}>
          <span style={styles.email}>{user?.email}</span>
          <button style={styles.signOutBtn} onClick={handleSignOut}>Sign out</button>
        </div>
      </header>

      <main style={styles.main}>
        <button style={styles.backBtn} onClick={() => navigate('/')}>← Back</button>

        <section>
          <h2 style={styles.sectionTitle}>Verb Trainer</h2>
          <p style={styles.sectionSubtitle}>Practise conjugations by frequency tier</p>
          <div style={styles.tierGrid}>
            {VERB_TIERS.map((tier) => (
              <button
                key={tier.id}
                style={styles.tierCard}
                onClick={() => handleVerbTier(tier)}
              >
                <span style={styles.tierTitle}>{tier.title}</span>
                <span style={styles.tierDesc}>{tier.description}</span>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#f8f8f6',
    fontFamily: 'system-ui, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1rem 2rem',
    borderBottom: '1px solid #e5e5e5',
    backgroundColor: '#fff',
  },
  logo: {
    margin: 0,
    fontSize: '1.4rem',
    fontWeight: 700,
    letterSpacing: '-0.5px',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  email: {
    fontSize: '0.85rem',
    color: '#666',
  },
  signOutBtn: {
    padding: '0.35rem 0.85rem',
    fontSize: '0.85rem',
    border: '1px solid #ccc',
    borderRadius: '6px',
    background: '#fff',
    cursor: 'pointer',
  },
  main: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '2rem 1.5rem',
  },
  backBtn: {
    marginBottom: '1.5rem',
    padding: '0.35rem 0',
    fontSize: '0.875rem',
    color: '#555',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  },
  sectionTitle: {
    margin: '0 0 0.25rem',
    fontSize: '1.25rem',
    fontWeight: 600,
  },
  sectionSubtitle: {
    margin: '0 0 1.25rem',
    fontSize: '0.9rem',
    color: '#666',
  },
  tierGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '0.75rem',
    maxWidth: '500px',
  },
  tierCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '0.4rem',
    padding: '1rem',
    background: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: '10px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  tierTitle: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#111',
    lineHeight: 1.3,
  },
  tierDesc: {
    fontSize: '0.8rem',
    color: '#666',
    lineHeight: 1.4,
  },
}
