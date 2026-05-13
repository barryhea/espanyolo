import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import VerbTrainer from './pages/VerbTrainer'
import Quiz from './pages/Quiz'
import HiddenWords from './pages/HiddenWords'
import AuthCallback from './pages/AuthCallback'
import ProtectedRoute from './components/ProtectedRoute'

function Protected({ children }) {
  return <ProtectedRoute>{children}</ProtectedRoute>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/" element={<Protected><Home /></Protected>} />
        <Route path="/vocabulary" element={<Protected><Dashboard /></Protected>} />
        <Route path="/verbs" element={<Protected><VerbTrainer /></Protected>} />
        <Route path="/quiz/:themeId" element={<Protected><Quiz /></Protected>} />
        <Route path="/hidden" element={<Protected><HiddenWords /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
