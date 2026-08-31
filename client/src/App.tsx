import { Navigate, Route, Routes } from "react-router-dom";
import { useSession } from "./lib/useSession";
import { api } from "./lib/api";
import { Login } from "./pages/Login";
import { StudentDashboard } from "./pages/StudentDashboard";
import { AdminDashboard } from "./pages/AdminDashboard";
import { ThemeToggle } from "./components/ThemeToggle";

export default function App() {
  const { session, setSession, loading } = useSession();

  async function handleLogout() {
    await api.logout();
    setSession(null);
  }

  if (loading) {
    return <div className="dashboard-loading">Loading…</div>;
  }

  return (
    <>
      <ThemeToggle />
      <Routes>
        <Route
          path="/"
          element={
            session ? (
              <Navigate to={session.role === "admin" ? "/admin" : "/dashboard"} replace />
            ) : (
              <Login onLoggedIn={setSession} />
            )
          }
        />
        <Route
          path="/dashboard"
          element={
            session?.role === "student" ? (
              <StudentDashboard onLogout={handleLogout} />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/admin"
          element={
            session?.role === "admin" ? <AdminDashboard onLogout={handleLogout} /> : <Navigate to="/" replace />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
