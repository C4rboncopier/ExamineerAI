import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RoleDashboardRedirect } from './components/RoleDashboardRedirect';
import { Login } from './pages/Login';
import { AdminDashboard } from './pages/AdminDashboard';
import { ProfessorDashboard } from './pages/ProfessorDashboard';
import { StudentDashboard } from './pages/StudentDashboard';
import { SubjectsList } from './components/professor/SubjectsList';
import { CreateSubject } from './components/professor/CreateSubject';
import { QuestionBankSubjects } from './components/professor/QuestionBankSubjects';
import { QuestionBankList } from './components/professor/QuestionBankList';
import { CreateQuestion } from './components/professor/CreateQuestion';
import { GenerateExamPlaceholder } from './components/professor/GenerateExamPlaceholder';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<RoleDashboardRedirect />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
            <Route path="/admin" element={<AdminDashboard />} />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['professor']} />}>
            <Route path="/professor" element={<ProfessorDashboard />}>
              <Route index element={<Navigate to="subjects" replace />} />
              <Route path="subjects" element={<SubjectsList />} />
              <Route path="subjects/create" element={<CreateSubject />} />
              <Route path="subjects/:subjectId/edit" element={<CreateSubject />} />
              <Route path="question-bank" element={<QuestionBankSubjects />} />
              <Route path="question-bank/create" element={<CreateQuestion />} />
              <Route path="question-bank/:subjectId" element={<QuestionBankList />} />
              <Route path="question-bank/:subjectId/create" element={<CreateQuestion />} />
              <Route path="question-bank/:subjectId/:questionId/edit" element={<CreateQuestion />} />
              <Route path="generate-exam" element={<GenerateExamPlaceholder />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['student']} />}>
            <Route path="/student" element={<StudentDashboard />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
