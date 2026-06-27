# Kuzana Brain Lite

Ask Kuzana’s internal knowledge and get concise answers with source citations. This MVP ingests internal text, masks obvious personal data, creates semantic chunks, applies simulated access levels, and retrieves grounded context for Gemini.

## Tech stack

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4
- Firebase Admin SDK + Firestore (server only)
- Gemini embeddings and Gemini 2.5 Flash generation
- Explicit local demo storage for development only

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Configure these server-only values in `.env.local`:

```env
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET=
GEMINI_API_KEY=
BRAIN_INBOX_EMAIL=
```

Firestore and Gemini use server-only credentials. Missing credentials now produce an actionable error instead of silently switching datasets. To intentionally use `.data/kuzana.json` during local development, set `LOCAL_DEMO_STORAGE=true`; Gemini remains required for ingestion and search.

## Brain Inbox and Gmail setup

Brain Inbox imports recent messages sent to `BRAIN_INBOX_EMAIL`. Create a dedicated address or alias, then download a Google Cloud OAuth client as `credentials.json` and place it at the project root. The first Gmail sync uses Google's local-auth quickstart flow in the browser and saves `token.json` locally for future syncs. Both files are ignored by git.

Use **Sync Gmail Inbox** on the dashboard or Brain Inbox page, or call `curl -X POST http://localhost:3000/api/connectors/gmail/sync`. New messages remain in **Needs review** and are not searchable until a user clicks **Process**. Duplicate Gmail message IDs are ignored.

## Import meeting transcripts

Open **Meetings**, add the title, date, source, participants and pasted transcript, then click **Import meeting**. Meetings process immediately through the same masking, chunking and embedding pipeline as manual documents.

## Seed and demo

Click **Load Demo Kuzana Document** on the dashboard, or run `curl -X POST http://localhost:3000/api/demo/seed`. The operation is idempotent.

One-minute recording flow:

1. Load the demo document from the dashboard.
2. Open **Ask Brain** and ask “What is required for Stage 1?”
3. Show the cited answer and open a source preview.
4. Ask “What does Kuzana Brain need to deliver?”
5. Open **Documents** to show status, access, and chunk count.

## API routes

- `POST /api/documents/ingest`
- `GET /api/documents`
- `GET, DELETE /api/documents/[id]`
- `POST /api/chat`
- `POST /api/demo/seed`
- `GET /api/health`
- `POST /api/connectors/gmail/sync`
- `POST /api/connectors/meetings/import`
- `GET /api/inbox`
- `POST /api/inbox/process`
- `POST /api/inbox/skip`

## MVP limitations

- Text and Markdown are prioritized; PDF extraction is not included.
- Local persistence is development-only and unsuitable for serverless production.
- Access control is role simulation, not authentication.
- Regex masking cannot catch every sensitive value.
- Cosine retrieval loads eligible chunks inside the route handler.
- Gmail sync uses Google's local OAuth flow and project-local ignored credential files.
- Meeting ingestion accepts pasted transcripts, not video or audio.
- Attachment parsing is not advanced.
- Inbox approval is intentionally basic.

## Future improvements

- Real Firebase Auth and proper role-based access control
- Better PDF, Google Docs, and WhatsApp parsing
- Firestore production vector index
- Admin approval workflow
- Stronger personal data detection
- Team feedback on answer quality
- Better document versioning
- Organization-level knowledge analytics
