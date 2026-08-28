import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listConversations, type ConversationSummary } from "../api/client";

export default function Conversations() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listConversations().then((res) => {
      setConversations(res.conversations);
      setLoading(false);
    });
  }, []);

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <h2>Conversations</h2>
      {conversations.length === 0 && <p className="muted">No conversations yet.</p>}
      <table className="table">
        <thead>
          <tr>
            <th>User</th>
            <th>Last message</th>
            <th>Messages</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {conversations.map((conversation) => (
            <tr key={conversation.userId}>
              <td>
                <Link to={`/conversations/${encodeURIComponent(conversation.userId)}`}>
                  {conversation.userId}
                </Link>
              </td>
              <td className="truncate">
                {conversation.lastMessageRole}: {conversation.lastMessageText}
              </td>
              <td>{conversation.messageCount}</td>
              <td>{new Date(conversation.lastMessageAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
