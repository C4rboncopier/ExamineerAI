import { supabase } from './supabase';

export interface TopicAnalysis {
    coTitle: string;
    insight: string;
    studyTips: string[];
}

export interface SubjectAnalysis {
    courseCode: string;
    courseTitle: string;
    overallComment: string;
    weakTopics: TopicAnalysis[];
}

export interface AnalysisFeedback {
    summary: string;
    subjectAnalyses: SubjectAnalysis[];
}

export interface GeneratedQuestion {
    question_text: string;
    choices: string[];
    correct_choice: number; // 0-indexed
}

const GEMINI_MODEL_LITE = 'gemini-2.5-flash-lite';
const GEMINI_MODEL_ADVANCED = 'gemini-2.5-flash';
const GEMINI_BASE_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

function getEndpoint(useAdvancedModel: boolean) {
    const model = useAdvancedModel ? GEMINI_MODEL_ADVANCED : GEMINI_MODEL_LITE;
    return `${GEMINI_BASE_ENDPOINT}/${model}:generateContent`;
}

async function callGemini(endpoint: string, payload: object): Promise<{ json: unknown; error: string | null }> {
    const { data, error } = await supabase.functions.invoke('gemini-proxy', {
        body: { endpoint, payload },
    });
    if (error) return { json: null, error: error.message };
    if (data?.error) return { json: null, error: data.error };
    return { json: data, error: null };
}

export async function generateQuestionVariations(
    originalQuestion: string,
    originalChoices: string[],
    originalCorrectChoice: number,
    count: number,
    useAdvancedModel = false
): Promise<{ data: GeneratedQuestion[]; error: string | null }> {
    const correctAnswer = originalChoices[originalCorrectChoice] ?? '';
    const prompt = `You are an exam question writer. Generate exactly ${count} multiple-choice question variation(s) based on the following original question.

Original question: "${originalQuestion}"
Choices: ${originalChoices.map((c, i) => `${String.fromCharCode(65 + i)}. ${c}`).join(', ')}
Correct answer: ${String.fromCharCode(65 + originalCorrectChoice)}. ${correctAnswer}

Rules:
- Each variation must test the same concept and have the same difficulty level.
- Change the numerical values, wording, or structure — do NOT reuse the original question verbatim.
- Each variation must have exactly 4 choices.
- Exactly one choice must be correct.
- Return correct_choice as a 0-based index (0 = A, 1 = B, 2 = C, 3 = D).
- Do not include explanations or extra text — only the JSON array.`;

    const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        question_text: { type: 'string' },
                        choices: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
                        correct_choice: { type: 'integer' },
                    },
                    required: ['question_text', 'choices', 'correct_choice'],
                },
            },
        },
    };

    const { json, error } = await callGemini(getEndpoint(useAdvancedModel), body);
    if (error) return { data: [], error };

    const candidate = (json as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
        ?.candidates?.[0];
    const rawText = candidate?.content?.parts?.[0]?.text;
    if (!rawText) {
        return { data: [], error: 'Gemini returned an empty response.' };
    }

    let parsed: GeneratedQuestion[];
    try {
        parsed = JSON.parse(rawText) as GeneratedQuestion[];
    } catch {
        return { data: [], error: 'Gemini returned malformed JSON.' };
    }

    if (!Array.isArray(parsed)) {
        return { data: [], error: 'Gemini returned unexpected data format.' };
    }

    return { data: parsed, error: null };
}

export async function generateStudentAnalysis(
    examTitle: string,
    subjects: {
        courseCode: string;
        courseTitle: string;
        topics: {
            coTitle: string;
            incorrectCount: number;
            totalCount: number;
            pctCorrect: number;
            moduleOutcomes: { moDescription: string; incorrectCount: number; totalCount: number }[];
        }[];
    }[],
    attemptSummary: { score: number; total: number; attemptNumber: number },
    passingRate: number
): Promise<{ data: AnalysisFeedback | null; error: string | null }> {
    const { score, total, attemptNumber } = attemptSummary;
    const pct = total > 0 ? ((score / total) * 100).toFixed(0) : '0';
    const passed = total > 0 && (score / total) * 100 >= passingRate;

    const subjectsText = subjects.map(subj => {
        const topicsText = subj.topics.map(t => {
            const moLines = t.moduleOutcomes.map(mo =>
                `        • ${mo.moDescription}: ${mo.incorrectCount}/${mo.totalCount} wrong`
            ).join('\n');
            return `    - ${t.coTitle}: ${t.incorrectCount}/${t.totalCount} wrong (${(100 - t.pctCorrect).toFixed(0)}% error rate)\n${moLines}`;
        }).join('\n');
        return `[${subj.courseCode} — ${subj.courseTitle}]\n${topicsText}`;
    }).join('\n\n');

    const prompt = `You are a personal academic coach giving direct, personalized feedback to a student about their own exam performance. Always address the student as "you" — never refer to them in the third person (never say "the student").

Exam: "${examTitle}" (multiple choice)
Passing rate: ${passingRate}%
Attempt ${attemptNumber}: ${score}/${total} (${pct}%) — ${passed ? 'Pass' : 'Fail'}

The following subjects had weak course outcomes. Each CO shows the wrong answer count and a breakdown by module outcome (MO) for deeper context:

${subjectsText}

Provide a thorough, detailed analysis structured as follows:

1. summary: A 2-3 sentence overview directly addressing the student (e.g. "You scored...", "You passed/failed..."), highlighting the main areas of struggle.

2. For EACH subject listed above, provide:
   - courseCode: the subject code exactly as listed
   - courseTitle: the subject title exactly as listed
   - overallComment: 1-2 sentences directly addressing the student about their performance in this subject (e.g. "Your performance in...", "You struggled with...")
   - weakTopics: for EACH weak CO listed under this subject:
     - coTitle: the CO title exactly as listed
     - insight: 2-3 sentences explaining what this CO covers and directly addressing what gaps the MO-level breakdown reveals about the student's understanding (use "you/your")
     - studyTips: exactly 1-2 specific, actionable study suggestions addressed directly to the student (e.g. "Try practicing...", "Review your...")

Be specific, substantive, and constructive. Avoid generic advice. Use an encouraging, second-person tone throughout.`;

    const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: 'object',
                properties: {
                    summary: { type: 'string' },
                    subjectAnalyses: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                courseCode: { type: 'string' },
                                courseTitle: { type: 'string' },
                                overallComment: { type: 'string' },
                                weakTopics: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            coTitle: { type: 'string' },
                                            insight: { type: 'string' },
                                            studyTips: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 3 },
                                        },
                                        required: ['coTitle', 'insight', 'studyTips'],
                                    },
                                },
                            },
                            required: ['courseCode', 'courseTitle', 'overallComment', 'weakTopics'],
                        },
                    },
                },
                required: ['summary', 'subjectAnalyses'],
            },
        },
    };

    const { json, error } = await callGemini(`${GEMINI_BASE_ENDPOINT}/${GEMINI_MODEL_LITE}:generateContent`, body);
    if (error) return { data: null, error };

    const candidate = (json as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
        ?.candidates?.[0];
    const rawText = candidate?.content?.parts?.[0]?.text;
    if (!rawText) {
        return { data: null, error: 'Gemini returned an empty response.' };
    }

    let parsed: AnalysisFeedback;
    try {
        parsed = JSON.parse(rawText) as AnalysisFeedback;
    } catch {
        return { data: null, error: 'Gemini returned malformed JSON.' };
    }

    return { data: parsed, error: null };
}
