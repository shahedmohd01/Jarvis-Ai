// Vercel Serverless Function — Health Check
export const config = { runtime: 'edge' };

export default async function handler(req) {
    return new Response(JSON.stringify({ status: 'ok', message: 'Jarvis AI backend is online.' }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        }
    });
}
