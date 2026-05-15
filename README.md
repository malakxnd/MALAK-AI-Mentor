<div align="center">
<br/>
<img src="./assets/banner.svg" width="100%" alt="MALAK — animated cinematic banner" />
<br/>

### `M.A.L.A.K — Mentor for Adaptive Learning & Knowledge`
 
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://neon.tech)
[![Pinecone](https://img.shields.io/badge/Pinecone-Vector_Memory-00C17C?style=for-the-badge)](https://pinecone.io)
[![Groq](https://img.shields.io/badge/Groq-LLaMA_3.1-F55036?style=for-the-badge)](https://groq.com)
[![License](https://img.shields.io/badge/License-MIT-00f3ff?style=for-the-badge)](LICENSE)
 
</div>
<br/>

<br/>
 
It started in a terminal window.
No UI. No database. No memory system. Just an API call fired into the void and something actually talking back.
<div align="center">
  <br/>
  <img src="./assets/terminal.jpeg" width="100%" alt="MALAK — animated cinematic banner" />
  <br/>
</div>
<br/>

What you're looking at now is everything built after that moment: persistent vector memory, autonomous daily emails, session intelligence, a 3-tier memory classifier, and a full glassmorphism UI — all grown from one terminal reply.

---
 
<br/>
 
<img src="./assets/demo-landing1.png" width="100%" />
<img src="./assets/demo-landing2.png" width="100%" />
<img src="./assets/demo-chat.png" width="100%" /> 
</div>
<br/>
---

 
<br/>
## ◈ &nbsp; What MALAK Actually Does
 
Most AI chatbots forget you the moment you close the tab. **MALAK doesn't.**
 
MALAK is a full-stack AI mentorship platform built around one core idea: *your mentor should know you.* It remembers your goals across sessions, tracks your learning arc over weeks, and shows up in your inbox every morning with something personal — not a generic newsletter, but a message that references what *you specifically* worked on.
 
<br/>
```
  You, Day 1      →   "I want to learn machine learning"
  You, Day 8      →   "I'm stuck on backpropagation"
  You, Day 15     →   "Can we do computer vision next?"
 
  MALAK, 8:00 AM  →   knows all three. references all three.
                       gives you one concrete thing to do today.
```
 
<br/>
---
 
<br/>
## ◈ &nbsp; Architecture
 
```
malak-ai-mentor/
│
├── 📁 backend/
│   ├── server.js            ←  Express API · auth · chat · session routes
│   ├── db.js                ←  PostgreSQL pool · 4-min keep-alive · query helper
│   ├── daily_motivator.js   ←  Cron job · 8 AM Cairo time · 5-min timeout guard
│   └── setupDB.js           ←  One-time schema setup (safe to re-run)
│
├── 📁 utils/
│   ├── vector_memory.js     ←  Embed · classify · store · query · context builder
│   ├── extract_goal.js      ←  AI session analysis · title + goal extraction
│   └── email_sender.js      ←  Welcome email · Nodemailer · Gmail SMTP
│
├── 📁 public/
│   ├── index.html           ←  Landing page · aurora gradient · feature grid
│   ├── auth.html            ←  Sign in / Sign up · glassmorphism card
│   └── chat.html            ←  Full chat UI · sidebar · live Markdown rendering
│
├── 📁 assets/               ←  Banner, screenshots, demo media
├── .env.example             ←  Template — fill in your keys, never commit .env
├── .gitignore
└── package.json
```
 
<br/>
### Message Flow
 
Every message passes through this full pipeline before a single token is generated:
 
```
┌─────────────────────────────────────────────────┐
│                USER SENDS MESSAGE                │
└───────────────────────┬─────────────────────────┘
                        │
            ┌───────────▼────────────┐
            │    classifyMemory()    │
            │  learning / identity / │  ← runs on EVERY message
            │        casual          │    before anything else
            └───────────┬────────────┘
                        │
       ┌────────────────┼─────────────────┐
       ▼                ▼                 ▼
  Save to          Embed + store      If not casual:
  PostgreSQL       in Pinecone        query Pinecone
                   (async,            top-K memories
                   non-blocking)      score > 0.7
                                           │
                                           ▼
                                   Build enriched prompt
                                   [PAST CONTEXT] + message
                                           │
                                           ▼
                                 ┌──────────────────────┐
                                 │   Groq · LLaMA 3.1   │
                                 │   8B Instant          │
                                 │   SYSTEM_PROMPT       │
                                 └──────────┬───────────┘
                                            │
                  ┌─────────────────────────┼──────────────────────┐
                  ▼                         ▼                      ▼
            Save reply                Store reply            Background:
            PostgreSQL                Pinecone               extract_goal()
                                      (async)                update session
                                                             title + goal
```
 
<br/>
### Daily Email Pipeline — 8:00 AM Cairo Time
 
```
① Fetch last 7 sessions with goals  →  PostgreSQL
② Pull top learning memories        →  Pinecone  (mode: 'email', score > 0.7)
③ Feed everything to LLaMA 3.1      →  tight prompt, learning context only
④ Generate 4–5 sentence email       →  references range of topics, one action today
⑤ Send via Gmail SMTP               →  branded HTML template
⑥ 2s delay between users            →  next user → repeat
```
 
<br/>
---
 
<br/>
## ◈ &nbsp; Feature Deep-Dive
 
<br/>
### 🧠 &nbsp; Vector Memory — Pinecone + BGE Embeddings
 
Every message is **semantically embedded** into a 384-dimensional vector using BGE-Small-EN-v1.5 (runs locally via `fastembed` — zero API cost) and stored in Pinecone under a personal namespace per user.
 
Before embedding, every message is classified into one of three tiers:
 
| Type | Examples | Injected into chat? | Used in daily email? |
|------|----------|:-------------------:|:--------------------:|
| `learning` | goals, skills, struggles, breakthroughs | ✅ | ✅ |
| `identity` | job, location, student status | ✅ | ❌ |
| `casual` | jokes, greetings, small talk | ❌ | ❌ |
 
Memory retrieval uses **cosine similarity with a 0.7 threshold** — so MALAK never hallucinates relevance or dumps unrelated context into replies. The embedder instance auto-recycles every 30 minutes to prevent staleness during long server uptime.
 
<br/>
### ⚡ &nbsp; Groq-Powered Chat — LLaMA 3.1 8B Instant
 
Sub-second AI responses. The system prompt enforces **intent detection** before selecting a response format:
 
| User says... | MALAK does... |
|---|---|
| `"teach me X"` | Learning roadmap + curated resources + where to start |
| `"explain X"` | Conversational explanation with analogies — no resource list |
| `"let's go deeper on Y"` | Step-by-step teaching + comprehension check at the end |
| Intent unclear | Defaults to direct explanation, never a generic list |
 
No filler openers. No "Great question!" No roadmap when you asked for an explanation.
 
<br/>
### 📊 &nbsp; Session Intelligence — Background AI Analysis
 
After every conversation, a background job silently analyzes the full transcript and:
 
- Generates a **2–6 word topic title** — `"JWT Authentication"`, `"DBSCAN Clustering"`, `"Vector Memory System"`
- Writes a **1–2 sentence summary** of what was actually worked on
- Extracts the **main goal** for the next morning's email
Irrelevant sessions (jokes, casual chat, one-liner exchanges) are detected and skipped entirely.
 
<br/>
### 📧 &nbsp; Daily Motivation Engine
 
Every morning at 8 AM Cairo time, a cron job queries each user's recent sessions and Pinecone memories, feeds the context to LLaMA 3.1, and delivers a personalized email that references the *actual range* of topics worked on — not a copy-pasted motivational quote.
 
<br/>
### 🔐 &nbsp; Auth System
 
- JWT tokens with 7-day expiry — stateless, no session storage needed
- Passwords hashed with bcrypt (10 salt rounds)
- Welcome email fires automatically on registration
- 3-second per-user rate limit cooldown between messages
<br/>
---
 
<br/>
## ◈ &nbsp; Tech Stack
 
<br/>
| Layer | Technology | Why |
|-------|-----------|-----|
| Runtime | Node.js 18+ (ESM) | Native `import/export`, modern JS |
| API | Express.js | Fast, minimal, battle-tested |
| Database | PostgreSQL · Neon | Serverless, auto-scales, free tier |
| Vector DB | Pinecone | Sub-10ms semantic search |
| Embeddings | BGE-Small-EN-v1.5 (`fastembed`) | 384-dim, runs locally, zero API cost |
| LLM | LLaMA 3.1 8B · Groq | ~300 tokens/sec, effectively free |
| Auth | JWT + bcrypt | Stateless, secure, no session store |
| Email | Nodemailer + Gmail SMTP | Zero infrastructure needed |
| Scheduler | node-cron | Lightweight in-process cron |
| Frontend | Vanilla HTML / CSS / JS | Zero build step, instant deploy |
 
<br/>
---
 
<br/>
## ◈ &nbsp; Getting Started
 
<br/>
**Prerequisites:**
- Node.js 18+
- PostgreSQL — [Neon](https://neon.tech) recommended (free tier is enough)
- [Groq API key](https://console.groq.com) — free, no credit card required
- [Pinecone](https://pinecone.io) — create an index: **384 dimensions**, cosine metric
- Gmail + [App Password](https://myaccount.google.com/apppasswords) (not your regular Gmail password)
<br/>
