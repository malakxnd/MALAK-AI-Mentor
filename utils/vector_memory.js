import { EmbeddingModel, FlagEmbedding } from 'fastembed';
import dotenv from 'dotenv';
dotenv.config();

import Groq from 'groq-sdk';
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// for classifing memories for the daily_motivator to use only the usefull serious ones about learning
export async function classifyMemory(text) {
    try {
        const res = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant',
            messages: [
                {
                    role: 'system',
                    content: `
You are a memory classifier.

Classify the user message into exactly ONE category:

- learning → goals, studying, skills, career, struggles, self-improvement
- identity → personal facts (job, student status, location, background)
- casual → jokes, greetings, emotions, small talk

Return ONLY one word: learning | identity | casual
                    `.trim()
                },
                {
                    role: 'user',
                    content: text
                }
            ],
            temperature: 0
        });

        return res.choices[0].message.content.trim().toLowerCase();
    } catch (err) {
        console.warn('Classifier failed:', err.message);
        return 'casual'; // safe fallback
    }
}

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_HOST    = process.env.PINECONE_HOST;

// Recycle the embedder every 30 minutes to prevent it going stale during long uptime
let _embedder = null;
let _embedderCreatedAt = null;
const EMBEDDER_TTL = 30 * 60 * 1000; // 30 minutes
 
async function getEmbedder() {
    const now = Date.now();
    if (_embedder && _embedderCreatedAt && (now - _embedderCreatedAt) > EMBEDDER_TTL) {
        console.log('♻️ Recycling stale embedder');
        _embedder = null;
        _embedderCreatedAt = null;
    }
    if (!_embedder) {
        _embedder = await FlagEmbedding.init({
            model: EmbeddingModel.BGESmallENV15
        });
        _embedderCreatedAt = Date.now();
    }
    return _embedder;
}

async function pineconeRequest(path, method = 'GET', body = null) {
    if (!PINECONE_API_KEY || !PINECONE_HOST) return null;

    const res = await fetch(`${PINECONE_HOST}${path}`, {
        method,
        headers: {
            'Api-Key': PINECONE_API_KEY,
            'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Pinecone ${method} ${path} → ${res.status}: ${err}`);
    }
    return res.json();
}

// -- 1. GENERATE EMBEDDING --
export async function generateEmbedding(text) {
    try {
        const embedder = await getEmbedder();
        const result = await embedder.queryEmbed([text]); // just await it, no for await
        const vector = Array.from(result);

        if (!vector || vector.length !== 384) {
            console.warn("Invalid embedding size:", vector.length);
            return null;
        }
        return vector;
    } catch (err) {
        console.error('Embedding failed:', err.message);
        return null;
    }
}

// -- 2. STORE A MESSAGE --
export async function storeMemory({ userId, sessionId, messageId, text, sender, type }) {
    if (!PINECONE_API_KEY) return;
    try {
        const vector = await generateEmbedding(text);
        if (!vector || vector.length !== 384) {
            console.warn("Skipping Pinecone upsert due to bad vector");
            return;
        }

        await pineconeRequest('/vectors/upsert', 'POST', {
            vectors: [{
                id: `msg-${messageId}`,
                values: vector,
                metadata: {
                    userId:    String(userId),
                    sessionId: String(sessionId),
                    sender,
                    type,
                    text:      text.substring(0, 500),
                    timestamp: new Date().toISOString()
                }
            }],
            namespace: `user-${userId}`
        });

        console.log(`storeMemory() succeeded: msg-${messageId} [${sender}]`);
    } catch (err) {
        console.warn('storeMemory() failed (non-fatal):', err.message);
    }
}

// -- 3. QUERY RELEVANT PAST CONTEXT --
// Threshold lowered from 0.75 → 0.5 so more memories are retrieved
export async function queryMemory({ userId, currentMessage, topK = 8, mode = 'chat' }) {
    if (!PINECONE_API_KEY) return [];
    try {
        const vector = await generateEmbedding(currentMessage);
        if (!vector) return [];

        const result = await pineconeRequest('/query', 'POST', {
            vector,
            topK,
            includeMetadata: true,
            namespace: `user-${userId}`,
            filter: { userId: { $eq: String(userId) } }
        });

        const matches = (result?.matches || [])
            .filter(m => {
                if (m.score <= 0.7) return false;

                if (mode === 'email') {
                    return m.metadata.type === 'learning';
                }

                return (
                    m.metadata.type === 'learning' ||
                    m.metadata.type === 'identity'
                );
            })
            .map(m => ({
                text: m.metadata.text,
                sender: m.metadata.sender,
                timestamp: m.metadata.timestamp,
                type: m.metadata.type,
                score: m.score
            }));

        console.log(`queryMemory: ${matches.length} matches above 0.7 threshold`);
        return matches;
    } catch (err) {
        console.warn('queryMemory() failed (non-fatal):', err.message);
        return [];
    }
}

// -- 4. FORMAT CONTEXT BLOCK FOR AI PROMPT --
export function buildContextBlock(memories) {
    if (!memories?.length) return '';
    const lines = memories.map(m => {
        const who  = m.sender === 'User' ? 'User said' : 'MALAK replied';
        const when = new Date(m.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `• [${when}] ${who}: "${m.text}"`;
    });
    return `[RELEVANT PAST CONTEXT - only reference this if it is directly relevant to the current message]\n${lines.join('\n')}\n[END CONTEXT]`;
}

// -- 5. GET USER MEMORY SUMMARY (for daily emails) --
export async function getUserMemorySummary(userId, topK = 10) {
    if (!PINECONE_API_KEY) return [];
    try {
        return await queryMemory({
            userId,
            currentMessage: 'learning goals progress skills achievements challenges struggles',
            topK,
            mode: 'email'
        });
    } catch (err) {
        console.warn('getUserMemorySummary failed:', err.message);
        return [];
    }
}