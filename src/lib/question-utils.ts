import type { QuestionWithOutcomes } from './questions';

export interface QuestionData {
    id: string;
    question: string;
    choices: string[];
    correctChoice: number;
    subjectId: string;
    professorId: string;
    coId: string;
    moId: string;
    imageUrl?: string;
    coTitle?: string;
    moDescription?: string;
    moOrderIndex?: number;
}

export function mapToQuestionData(q: QuestionWithOutcomes): QuestionData {
    return {
        id: q.id,
        question: q.question_text,
        choices: q.choices,
        correctChoice: q.correct_choice,
        subjectId: q.subject_id,
        professorId: q.professor_id,
        coId: q.course_outcome_id,
        moId: q.module_outcome_id,
        imageUrl: q.image_url ?? undefined,
        coTitle: q.course_outcomes?.title,
        moDescription: q.module_outcomes?.description,
        moOrderIndex: q.module_outcomes?.order_index,
    };
}
