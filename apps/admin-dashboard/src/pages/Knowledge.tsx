import { useEffect, useState } from "react";
import { ApiError, getKnowledgeBase, updateKnowledgeBase } from "../api/client";

export default function Knowledge() {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getKnowledgeBase().then((res) => {
      setContent(res.content);
      setLoading(false);
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      JSON.parse(content); // catch typos before hitting the server
      await updateKnowledgeBase(content);
      setMessage("Saved — the knowledge base has been re-synced.");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Save failed."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <h2>Knowledge base</h2>
      <p className="muted">
        Edits here are validated as JSON, written to <code>knowledge-base.json</code>, and
        immediately re-embedded into the RAG store.
      </p>
      <textarea
        className="json-editor"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        spellCheck={false}
      />
      {error && <p className="error-text">{error}</p>}
      {message && <p className="success-text">{message}</p>}
      <button onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save & re-sync"}
      </button>
    </div>
  );
}
