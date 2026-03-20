export type UserRole = 'admin' | 'professor' | 'student';

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  username: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Subject {
  id: string;
  professor_id: string;
  course_title: string;
  course_code: string;
  created_at: string;
  updated_at: string;
}

export interface CourseOutcome {
  id: string;
  subject_id: string;
  title: string;
  order_index: number;
  created_at: string;
}

export interface ModuleOutcome {
  id: string;
  course_outcome_id: string;
  description: string;
  order_index: number;
  created_at: string;
}

export interface Question {
  id: string;
  subject_id: string;
  course_outcome_id: string;
  module_outcome_id: string;
  question_text: string;
  choices: string[];
  correct_choice: number;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}
