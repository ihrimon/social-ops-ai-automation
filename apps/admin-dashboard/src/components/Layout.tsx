import { NavLink, useNavigate } from "react-router-dom";
import { clearToken } from "../api/client";

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  function logout() {
    clearToken();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="brand">Social Ops Admin</span>
        <nav>
          <NavLink to="/posts" className={({ isActive }) => (isActive ? "active" : "")}>
            Posts
          </NavLink>
          <NavLink to="/conversations" className={({ isActive }) => (isActive ? "active" : "")}>
            Conversations
          </NavLink>
          <NavLink to="/analytics" className={({ isActive }) => (isActive ? "active" : "")}>
            Analytics
          </NavLink>
          <NavLink to="/knowledge" className={({ isActive }) => (isActive ? "active" : "")}>
            Knowledge Base
          </NavLink>
        </nav>
        <button className="link-button" onClick={logout}>
          Log out
        </button>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}
