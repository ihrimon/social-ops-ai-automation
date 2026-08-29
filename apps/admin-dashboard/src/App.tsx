import { Navigate, Route, Routes } from "react-router-dom";
import { getToken } from "./api/client";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Posts from "./pages/Posts";
import Conversations from "./pages/Conversations";
import ConversationDetail from "./pages/ConversationDetail";
import Knowledge from "./pages/Knowledge";
import Analytics from "./pages/Analytics";

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!getToken()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <Layout>
              <Routes>
                <Route path="/" element={<Navigate to="/posts" replace />} />
                <Route path="/posts" element={<Posts />} />
                <Route path="/conversations" element={<Conversations />} />
                <Route path="/conversations/:userId" element={<ConversationDetail />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/knowledge" element={<Knowledge />} />
              </Routes>
            </Layout>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
