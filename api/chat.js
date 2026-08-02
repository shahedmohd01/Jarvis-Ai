// Vercel Serverless Function — Gemini API Proxy
// Reads GEMINI_API_KEY from Vercel environment variables (set in Vercel Dashboard)
// Streams the response from Google Gemini back to the browser

export const config = {
    runtime: 'edge', // Use Edge runtime for true streaming support
};

const DEFAULT_SYSTEM_INSTRUCTION = 
    "You are Jarvis AI, a helpful AI assistant powered by Google Gemini. " +
    "Be natural, concise, and conversational — like Gemini. " +
    "Do NOT introduce yourself or mention the date/time unless the user directly asks. " +
    "If asked your name or who made you, say you are Jarvis AI powered by Google Gemini. " +
    "Format responses clearly with markdown only when it genuinely helps readability.";

// Model fallback mapping (some model IDs are unstable or have low rate limits)
const MODEL_MAP = {
    'gemini-3.5-flash-lite': 'gemini-2.0-flash-lite',
    'gemini-2.5-flash-lite': 'gemini-2.0-flash-lite',
    'gemini-3.1-flash-lite': 'gemini-2.0-flash-lite',
    'gemini-3.5-flash': 'gemini-2.0-flash',
    'gemini-2.5-flash': 'gemini-2.0-flash',
    'gemini-3.5-pro': 'gemini-2.5-pro-preview-06-05',
    'gemini-2.5-pro': 'gemini-2.5-pro-preview-06-05',
};

// Retry fetch with exponential backoff (handles 429 rate limits)
async function fetchWithRetry(url, options, maxRetries = 3) {
    let lastError;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const res = await fetch(url, options);
        if (res.status === 429 && attempt < maxRetries - 1) {
            // Wait with exponential backoff: 1s, 2s, 4s
            await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
            continue;
        }
        return res;
    }
    throw lastError;
}

export default async function handler(req) {
    // CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            }
        });
    }

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured on server.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    let body;
    try {
        body = await req.json();
    } catch (e) {
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const {
        messages = [],
        model: rawModel = 'gemini-2.0-flash-lite',
        temperature = 0.7,
        system_instruction,
        client_time
    } = body;

    // Apply model mapping
    const model = MODEL_MAP[rawModel] || rawModel;

    // Build system instruction — natural and concise
    let sysText = system_instruction?.trim()
        ? `You are Jarvis AI, a helpful AI assistant powered by Google Gemini. Do NOT introduce yourself unless asked. If asked your name or who made you, say Jarvis AI powered by Google Gemini. ${system_instruction.trim()}`
        : DEFAULT_SYSTEM_INSTRUCTION;

    // Add date/time only as silent context — don't volunteer it
    if (client_time?.date && client_time?.time) {
        sysText += `\n\n[Context: Today is ${client_time.date}, local time is ${client_time.time}. Only mention this if the user specifically asks about the date or time.]`;
    }

    // Build Gemini contents array
    const contents = messages.map(m => {
        const parts = [];
        if (m.image?.data) {
            parts.push({ inlineData: { mimeType: m.image.mime_type, data: m.image.data } });
        }
        if (m.content) parts.push({ text: m.content });
        return { role: m.role === 'model' ? 'model' : 'user', parts };
    });

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

    try {
        const geminiRes = await fetchWithRetry(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents,
                systemInstruction: { parts: [{ text: sysText }] },
                generationConfig: { temperature }
            })
        });

        if (!geminiRes.ok) {
            const errText = await geminiRes.text();
            let errMsg = `Gemini API error (${geminiRes.status})`;
            try {
                const errJson = JSON.parse(errText);
                errMsg = errJson.error?.message || errMsg;
            } catch (_) {}
            
            if (geminiRes.status === 429) {
                errMsg = 'Rate limit reached. Please wait a moment and try again.';
            }
            
            return new Response(JSON.stringify({ error: errMsg }), {
                status: geminiRes.status,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
            });
        }

        // Stream the Gemini SSE response back to the client
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const encoder = new TextEncoder();

        (async () => {
            const reader = geminiRes.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop();

                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        const jsonStr = line.slice(6).trim();
                        if (!jsonStr || jsonStr === '[DONE]') continue;

                        try {
                            const parsed = JSON.parse(jsonStr);
                            const chunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                            if (chunk) {
                                await writer.write(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
                            }
                        } catch (_) {}
                    }
                }
                await writer.write(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
            } catch (e) {
                await writer.write(encoder.encode(`data: ${JSON.stringify({ error: e.message })}\n\n`));
            } finally {
                writer.close();
            }
        })();

        return new Response(readable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Access-Control-Allow-Origin': '*',
            }
        });

    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
    }
}
