# Mindbase

Ask your internal knowledge base and get concise answers with source citations. Mindbase ingests internal text, masks obvious personal data, chunks and indexes source material in Pinecone, filters retrieved chunks for relevance, and uses Groq for cited answers.

## Tech stack

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4
- Firebase Admin SDK + Firestore metadata storage
- Pinecone integrated embedding and vector search
- Groq chat completions for answer generation
- Local demo storage for development

## Setup

```bash
npm install
npm run dev
```

Configure these server-only values in `.env.local`:

```env
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET=
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120b
PINECONE_API_KEY=
PINECONE_INDEX=
BRAIN_INBOX_EMAIL=
```

Missing credentials produce actionable errors instead of silently switching providers. Local development storage writes to `.data/mindbase.json` and can still read the legacy `.data/kuzana.json` file if it exists.

## Mindbase Inbox and Gmail setup

Mindbase Inbox imports recent messages sent to `BRAIN_INBOX_EMAIL`. Create a dedicated address or alias, then download a Google Cloud OAuth client as `credentials.json` and place it at the project root. Both `credentials.json` and `token.json` are ignored by git.

Use **Sync Gmail** on the dashboard or Mindbase Inbox page, or call `curl -X POST http://localhost:3000/api/connectors/gmail/sync`. New messages remain in **Needs review** and are not searchable until a user clicks **Process**.

## Import meeting transcripts

Open **Meetings**, add the title, date, source, participants and pasted transcript, then click **Import meeting**. Meetings process immediately through the same masking, chunking and indexing pipeline as manual documents.

## Seed and demo

Click **Load demo document** on the dashboard, or run `curl -X POST http://localhost:3000/api/demo/seed`. The operation is idempotent for the `Mindbase Demo Guide` document.

One-minute recording flow:

1. Load the demo document from the dashboard.
2. Open **Ask Mindbase** and ask "What is required for Stage 1?"
3. Show the cited answer and open a source preview.
4. Ask "What does Mindbase need to deliver?"
5. Open **Library** to show status, access, and chunk count.

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

- Text and Markdown are prioritized; PDF extraction depends on the configured converter.
- Local persistence is development-only and unsuitable for serverless production.
- Access control is role simulation, not authentication.
- Regex masking cannot catch every sensitive value.
- Gmail sync uses Google's OAuth flow and project-local ignored credential files.
- Meeting ingestion accepts pasted transcripts, not video or audio.
- Inbox approval is intentionally basic.

## Future improvements

- Real Firebase Auth and proper role-based access control
- Better PDF, Google Docs, and WhatsApp parsing
- Stronger personal data detection
- Team feedback on answer quality
- Better document versioning
- Organization-level knowledge analytics
