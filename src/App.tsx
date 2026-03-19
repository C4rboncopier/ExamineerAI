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

import { CreateQuestion } from './components/professor/CreateQuestion';
import { ViewSubject } from './components/professor/ViewSubject';
import { ExamsList } from './components/professor/ExamsList';
import { CreateExam } from './components/professor/CreateExam';
import { ViewExam } from './components/professor/ViewExam';
import { TemplatesList } from './components/professor/TemplatesList';
import { CreateTemplate } from './components/professor/CreateTemplate';
import { ProfessorSettings } from './components/professor/ProfessorSettings';
import { Notifications } from './components/professor/Notifications';

import { ProfessorsList } from './components/admin/ProfessorsList';
import { AddProfessor } from './components/admin/AddProfessor';
import { EditProfessor } from './components/admin/EditProfessor';
import { StudentsList } from './components/admin/StudentsList';
import { AddStudent } from './components/admin/AddStudent';
import { EditStudent } from './components/admin/EditStudent';
import { Settings as AdminSettings } from './components/admin/Settings';
import { AdminExamsList } from './components/admin/AdminExamsList';
import { AdminSubjectsList } from './components/admin/AdminSubjectsList';

import { ExamsList as StudentExamsList } from './components/student/ExamsList';
import { ViewExam as StudentViewExam } from './components/student/ViewExam';
import { GradesList as StudentGradesList } from './components/student/GradesList';
import { Settings as StudentSettings } from './components/student/Settings';
import { Account } from './components/common/Account';

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
              <Route path="exams" element={<AdminExamsList />} />
              <Route path="subjects" element={<AdminSubjectsList />} />
              <Route path="settings" element={<AdminSettings />} />
              <Route path="account" element={<Account />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['professor']} />}>
            <Route path="/professor" element={<ProfessorDashboard />}>
              <Route index element={<Navigate to="exams" replace />} />
              <Route path="subjects" element={<SubjectsList />} />
              <Route path="subjects/create" element={<CreateSubject />} />
              <Route path="subjects/:subjectId/edit" element={<CreateSubject />} />
              <Route path="subjects/:subjectId" element={<Navigate to="overview" replace />} />
              <Route path="subjects/:subjectId/question-bank/create" element={<CreateQuestion />} />
              <Route path="subjects/:subjectId/question-bank/:questionId/edit" element={<CreateQuestion />} />
              <Route path="subjects/:subjectId/:tab" element={<ViewSubject />} />
              <Route path="templates" element={<TemplatesList />} />
              <Route path="templates/create" element={<CreateTemplate />} />
              <Route path="templates/:templateId/edit" element={<CreateTemplate />} />
              <Route path="exams" element={<ExamsList />} />
              <Route path="exams/create" element={<CreateExam />} />
              <Route path="exams/:examId" element={<Navigate to="overview" replace />} />
              <Route path="exams/:examId/:tab" element={<ViewExam />} />
              <Route path="exams/:examId/edit" element={<CreateExam />} />
              <Route path="settings" element={<ProfessorSettings />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="account" element={<Account />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRoles={['student']} />}>
            <Route path="/student" element={<StudentDashboard />}>
              <Route index element={<Navigate to="exams" replace />} />
              <Route path="exams" element={<StudentExamsList />} />
              <Route path="exams/:examId" element={<Navigate to="gradebook" replace />} />
              <Route path="exams/:examId/:tab" element={<StudentViewExam />} />
              <Route path="grades" element={<StudentGradesList />} />
              <Route path="settings" element={<StudentSettings />} />
              <Route path="account" element={<Account />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
