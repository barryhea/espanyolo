import { useNavigate } from 'react-router-dom'
import NavBar from '../components/NavBar'

export default function Home() {
  const navigate = useNavigate()

  return (
    <div style={styles.page}>
      <NavBar />
      <main style={styles.main}>
        <h2 style={styles.heading}>What would you like to practise?</h2>
        <div style={styles.cardRow}>
          <button style={styles.card} onClick={() => navigate('/vocabulary')}>
            <span style={styles.cardTitle}>Vocabulary Trainer</span>
            <span style={styles.cardDesc}>Learn and practise Spanish vocabulary across 17 themes</span>
          </button>
          <button style={styles.card} onClick={() => navigate('/verbs')}>
            <span style={styles.cardTitle}>Verb Trainer</span>
            <span style={styles.cardDesc}>Practise Spanish verb conjugations by frequency tier</span>
          </button>
        </div>
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
  main: {
    maxWidth: '700px',
    margin: '0 auto',
    padding: '3rem 1.5rem',
  },
  heading: {
    margin: '0 0 2rem',
    fontSize: '1.5rem',
    fontWeight: 600,
  },
  cardRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '1rem',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '0.6rem',
    padding: '2rem 1.5rem',
    background: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: '12px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  cardTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#111',
  },
  cardDesc: {
    fontSize: '0.875rem',
    color: '#666',
    lineHeight: 1.5,
  },
}
