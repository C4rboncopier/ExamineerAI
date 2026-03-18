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

export async function generateQuestionVariations(
    originalQuestion: string,
    originalChoices: string[],
    originalCorrectChoice: number,
    count: number,
    useAdvancedModel = false
): Promise<{ data: GeneratedQuestion[]; error: string | null }> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
    if (!apiKey) {
        return { data: [], error: 'Gemini API key not configured. Add VITE_GEMINI_API_KEY to your .env.local file.' };
    }

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

    let response: Response;
    try {
        response = await fetch(`${getEndpoint(useAdvancedModel)}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    } catch (err) {
        return { data: [], error: 'Network error: could not reach Gemini API.' };
    }

    if (!response.ok) {
        const text = await response.text().catch(() => response.statusText);
        return { data: [], error: `Gemini API error (${response.status}): ${text}` };
    }

    let json: unknown;
    try {
        json = await response.json();
    } catch {
        return { data: [], error: 'Failed to parse Gemini API response.' };
    }

    // Extract the text content from the Gemini response envelope
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
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
    if (!apiKey) {
        return { data: null, error: 'Gemini API key not configured.' };
    }

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

    const prompt = `You are an educational assistant providing detailed, personalized feedback on a student's exam performance.

Exam: "${examTitle}" (multiple choice)
Passing rate: ${passingRate}%
Attempt ${attemptNumber}: ${score}/${total} (${pct}%) — ${passed ? 'Pass' : 'Fail'}

The following subjects had weak course outcomes. Each CO shows the wrong answer count and a breakdown by module outcome (MO) for deeper context:

${subjectsText}

Provide a thorough, detailed analysis structured as follows:

1. summary: A 2-3 sentence overview of the student's overall performance, highlighting the main areas of struggle.

2. For EACH subject listed above, provide:
   - courseCode: the subject code exactly as listed
   - courseTitle: the subject title exactly as listed
   - overallComment: 1-2 sentences summarizing the student's performance in this subject and what it suggests about their understanding
   - weakTopics: for EACH weak CO listed under this subject:
     - coTitle: the CO title exactly as listed
     - insight: 2-3 sentences explaining what concept this CO covers, why it is important, and what specific gaps the MO-level breakdown reveals
     - studyTips: exactly 1-2 specific, actionable study suggestions tailored to this particular CO (e.g., practice exercises, key concepts to review, common mistakes to avoid)

Be specific, substantive, and constructive. Avoid generic advice. Use an encouraging tone.`;

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

    let response: Response;
    try {
        response = await fetch(`${GEMINI_BASE_ENDPOINT}/${GEMINI_MODEL_LITE}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    } catch {
        return { data: null, error: 'Network error: could not reach Gemini API.' };
    }

    if (!response.ok) {
        const text = await response.text().catch(() => response.statusText);
        return { data: null, error: `Gemini API error (${response.status}): ${text}` };
    }

    let json: unknown;
    try {
        json = await response.json();
    } catch {
        return { data: null, error: 'Failed to parse Gemini API response.' };
    }

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
