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
import { ExamsList } from './components/professor/ExamsList';
import { CreateExam } from './components/professor/CreateExam';
import { ViewExam } from './components/professor/ViewExam';
import { ExamStudents } from './components/professor/ExamStudents';
import { TemplatesList } from './components/professor/TemplatesList';
import { CreateTemplate } from './components/professor/CreateTemplate';
import { ProfessorSettings } from './components/professor/ProfessorSettings';

import { ProfessorsList } from './components/admin/ProfessorsList';
import { AddProfessor } from './components/admin/AddProfessor';
import { EditProfessor } from './components/admin/EditProfessor';
import { StudentsList } from './components/admin/StudentsList';
import { AddStudent } from './components/admin/AddStudent';
import { EditStudent } from './components/admin/EditStudent';
import { Settings as AdminSettings } from './components/admin/Settings';

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
            <Route path="/admin" element={<AdminDashboard />}>
              <Route index element={<Navigate to="professors" replace />} />
              <Route path="professors" element={<ProfessorsList />} />
              <Route path="professors/addprofessor" element={<AddProfessor />} />
              <Route path="professors/editprofessor/:id" element={<EditProfessor />} />
              <Route path="students" element={<StudentsList />} />
              <Route path="students/addstudent" element={<AddStudent />} />
              <Route path="students/editstudent/:id" element={<EditStudent />} />
              <Route path="settings" element={<AdminSettings />} />
            </Route>
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
              <Route path="templates" element={<TemplatesList />} />
              <Route path="templates/create" element={<CreateTemplate />} />
              <Route path="templates/:templateId/edit" element={<CreateTemplate />} />
              <Route path="exams" element={<ExamsList />} />
              <Route path="exams/create" element={<CreateExam />} />
              <Route path="exams/:examId" element={<ViewExam />} />
              <Route path="exams/:examId/edit" element={<CreateExam />} />
              <Route path="exams/:examId/students" element={<ExamStudents />} />
              <Route path="settings" element={<ProfessorSettings />} />
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
