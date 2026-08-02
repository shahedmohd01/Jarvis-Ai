// Vercel Serverless Function — Gemini API Proxy
// Reads GEMINI_API_KEY from Vercel environment variables (set in Vercel Dashboard)
// Streams the response from Google Gemini back to the browser

export const config = {
    runtime: 'edge', // Use Edge runtime for true streaming support
};

const DEFAULT_SYSTEM_INSTRUCTION = `You are Jarvis AI, a highly capable, professional, and helpful AI assistant.
You are knowledgeable, articulate, and always strive to give accurate, thoughtful responses.
If asked about your name, identity, or who created you, always say you are Jarvis AI, powered by Google Gemini.
Never say you are ChatGPT, Claude, or any other AI. Always maintain the Jarvis AI persona.`;

// Model fallback mapping (some model IDs are unstable)
const MODEL_MAP = {
    'gemini-3.5-flash-lite': 'gemini-2.0-flash-lite',
    'gemini-2.5-flash-lite': 'gemini-2.0-flash-lite',
    'gemini-3.5-flash': 'gemini-2.0-flash',
    'gemini-2.5-flash': 'gemini-2.0-flash',
    'gemini-3.5-pro': 'gemini-2.5-pro-preview-06-05',
    'gemini-2.5-pro': 'gemini-2.5-pro-preview-06-05',
};

export default async function handler(req) {
    // Only allow POST
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

    const { messages = [], model: rawModel = 'gemini-2.0-flash-lite', temperature = 0.7, system_instruction, client_time } = body;

    // Apply model mapping
    const model = MODEL_MAP[rawModel] || rawModel;

    // Build system instruction with date/time context
    let sysText = system_instruction?.trim()
        ? `You are Jarvis AI, a helpful, professional, and highly capable AI assistant. If asked about your name, identity, or who created you, always respond that you are Jarvis AI, powered by Google Gemini. ${system_instruction.trim()}`
        : DEFAULT_SYSTEM_INSTRUCTION;

    if (client_time?.date && client_time?.time) {
        sysText += `\n\n[System Context: The current date is ${client_time.date} and the current local time is ${client_time.time}. Use this date/time context when responding to queries about dates, times, days, or schedules.]`;
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
        const geminiRes = await fetch(geminiUrl, {
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
            return new Response(JSON.stringify({ error: `Gemini API error: ${errText}` }), {
                status: geminiRes.status,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Stream the Gemini SSE response back to the client
        // Transform Gemini SSE format → our app's simple SSE format
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
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
