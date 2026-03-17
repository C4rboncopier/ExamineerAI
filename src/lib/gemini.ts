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
