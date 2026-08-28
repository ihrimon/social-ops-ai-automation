import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getConversation,
  pauseConversation,
  resumeConversation,
  type ConversationDetail as ConversationDetailData,
} from "../api/client";

export default function ConversationDetail() {
  const { userId = "" } = useParams();
  const [data, setData] = useState<ConversationDetailData | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const result = await getConversation(userId);
    setData(result);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function handlePause() {
    await pauseConversation(userId);
    await load();
  }

  async function handleResume() {
    await resumeConversation(userId);
    await load();
  }

  if (loading || !data) return <p>Loading...</p>;

  return (
    <div>
      <p>
        <Link to="/conversations">&larr; Back to conversations</Link>
      </p>
      <div className="card-header">
        <h2>{userId}</h2>
        {data.paused ? (
          <button onClick={handleResume}>Resume AI replies</button>
        ) : (
          <button onClick={handlePause}>Pause AI (hand off to human)</button>
        )}
      </div>
      {data.paused && (
        <p className="muted">
          AI replies paused{data.pausedUntil ? ` until ${new Date(data.pausedUntil).toLocaleString()}` : ""}.
        </p>
      )}
      <div className="thread">
        {data.messages.map((message, index) => (
          <div
            key={index}
            className={`bubble bubble-${message.role}${message.isHumanAdmin ? " bubble-admin" : ""}`}
          >
            <div className="bubble-meta">
              {message.isHumanAdmin ? "human admin" : message.role} ·{" "}
              {new Date(message.createdAt).toLocaleString()}
            </div>
            <div>{message.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
