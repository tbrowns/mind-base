export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { probeFirestore } = await import("@/lib/firebase");
  const { gmailConfigurationStatus } =
    await import("@/lib/server/google/gmail");

  const firestore = await probeFirestore();
  const groqConfigured = Boolean(process.env.GROQ_API_KEY);
  const gmailStatus = gmailConfigurationStatus();

  const connections = [
    {
      name: "Firestore",
      ok: firestore.connected ?? firestore.configured,
      detail: firestore.error ?? firestore.mode,
    },
    {
      name: "Groq AI",
      ok: groqConfigured,
      detail: groqConfigured
        ? "GROQ_API_KEY configured"
        : "GROQ_API_KEY missing",
    },
    {
      name: "Firebase Storage",
      ok: Boolean(process.env.FIREBASE_STORAGE_BUCKET),
      detail: process.env.FIREBASE_STORAGE_BUCKET
        ? "Bucket configured"
        : "Optional — not configured",
    },
    {
      name: "Gmail connector",
      ok: gmailStatus.configured,
      detail: gmailStatus.configured
        ? gmailStatus.authorized
          ? "credentials.json and token configured"
          : "credentials.json present; authorization needed on first sync"
        : `Missing: ${gmailStatus.missing.join(", ")}`,
    },
  ];

  console.log("\n[Mindbase] Connection status:");
  for (const { name, ok, detail } of connections) {
    const badge = ok ? "✓" : "✗";
    if (ok) {
      console.log(`  ${badge} ${name}: ${detail}`);
    } else {
      console.warn(`  ${badge} ${name}: ${detail}`);
    }
  }
  console.log("");
}
