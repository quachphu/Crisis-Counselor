# Frontend Setup (Next.js + Tailwind + Firebase)

## 1) Install and run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## 2) Environment variables

Create a local env file from the template:

```bash
cp .env.example .env.local
```

Required variables:

- `NEXT_PUBLIC_API_BASE_URL` (ex: `http://localhost:1000`)
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

## 3) Firebase project setup (Auth + Firestore)

1. Go to Firebase Console and create/select a project.
2. Add a **Web App** and copy the config values into `.env.local`.
3. In **Authentication** → **Sign-in method**, enable **Email/Password** and **Google**.
4. In **Authentication** → **Settings** → **Authorized domains**, ensure your frontend host is listed (for local dev, include `localhost`).
5. In **Firestore Database**, create database in production or test mode.
6. Create these collections:
	- `chat_messages`
	- `chat_sessions`
	- `call_transcripts`
	- `case_cards`
	- `users`
7. Create a composite Firestore index for client chat history queries:
	- Collection: `chat_messages`
	- Fields: `clientUid` (Ascending), `createdAt` (Ascending)
	- This is used by the primary realtime query on the client page.
	- The app includes a compatibility fallback if this index is missing, but indexed mode is preferred for stable ordering and performance.
8. `chat_sessions/{clientUid}` takeover control document:
	- Fields: `clientUid`, `handlerMode` (`"ai"` or `"counselor"`), `changedBy`, `changedAt`
	- If document is missing, client defaults to counselor/manual mode.
	- AI replies run only when counselor explicitly switches mode to `"ai"`.
	- If counselor switches to counselor mode while AI is streaming, the in-flight AI stream is aborted.

Firebase client initialization lives in `src/lib/firebase.ts`.

## 4) Local integration notes

- Frontend is configured to call FastAPI directly from browser.
- Backend should allow CORS for `http://localhost:3000`.
- If you change `.env.local`, restart the dev server.
- Firestore rules should allow client read access to their own `chat_sessions/{clientUid}` and counselor/admin write access to `handlerMode`.
