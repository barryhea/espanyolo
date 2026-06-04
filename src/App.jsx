import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import VerbTrainer from './pages/VerbTrainer'
import VerbQuiz from './pages/VerbQuiz'
import VerbCustomQuizSelect from './pages/VerbCustomQuizSelect'
import VerbCustomQuiz from './pages/VerbCustomQuiz'
import VerbArTenseQuiz from './pages/VerbArTenseQuiz'
import VerbDictionary from './pages/VerbDictionary'
import VerbDetail from './pages/VerbDetail'
import Quiz from './pages/Quiz'
import HiddenWords from './pages/HiddenWords'
import Polish from './pages/Polish'
import CustomQuiz from './pages/CustomQuiz'
import Dictionary from './pages/Dictionary'
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
        <Route path="/verb-quiz/:categoryId" element={<Protected><VerbQuiz /></Protected>} />
        <Route path="/verb-custom-quiz-select" element={<Protected><VerbCustomQuizSelect /></Protected>} />
        <Route path="/verb-custom-quiz" element={<Protected><VerbCustomQuiz /></Protected>} />
        <Route path="/verb-ar-tense-quiz" element={<Protected><VerbArTenseQuiz /></Protected>} />
        <Route path="/verb-dictionary" element={<Protected><VerbDictionary /></Protected>} />
        <Route path="/verb-dictionary/:verbId" element={<Protected><VerbDetail /></Protected>} />
        <Route path="/quiz/:themeId" element={<Protected><Quiz /></Protected>} />
        <Route path="/hidden" element={<Protected><HiddenWords /></Protected>} />
        <Route path="/polish" element={<Protected><Polish /></Protected>} />
        <Route path="/custom-quiz" element={<Protected><CustomQuiz /></Protected>} />
        <Route path="/dictionary" element={<Protected><Dictionary /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
