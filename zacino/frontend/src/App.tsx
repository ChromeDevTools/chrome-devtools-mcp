import { useEffect, useMemo, useState } from "react";
import { api, Job } from "./api";
import { clearToken, getToken, setToken } from "./auth";
import DashboardPage from "./pages/DashboardPage";
import AuthPage from "./pages/AuthPage";

export type AuthState = {
  token: string | null;
  error: string | null;
  loading: boolean;
};

function App() {
  const [authState, setAuthState] = useState<AuthState>({
    token: getToken(),
    error: null,
    loading: false
  });
  const [jobs, setJobs] = useState<Job[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const isAuthenticated = useMemo(() => Boolean(authState.token), [authState.token]);

  useEffect(() => {
    if (!isAuthenticated) {
      setJobs([]);
      return;
    }
    api
      .listJobs()
      .then(setJobs)
      .catch((error: Error) => setNotice(error.message));
  }, [isAuthenticated]);

  const handleAuth = async (mode: "login" | "register", email: string, password: string) => {
    setAuthState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response =
        mode === "login" ? await api.login(email, password) : await api.register(email, password);
      setToken(response.access_token);
      setAuthState({ token: response.access_token, error: null, loading: false });
      setNotice("Authenticated. Loading optimization jobs...");
    } catch (error) {
      setAuthState((prev) => ({
        ...prev,
        loading: false,
        error: (error as Error).message
      }));
    }
  };

  const handleLogout = () => {
    clearToken();
    setAuthState({ token: null, error: null, loading: false });
  };

  const handleCreateJob = async (name: string, description: string) => {
    try {
      const job = await api.createJob({ name, description });
      setJobs((prev) => [job, ...prev]);
      setNotice("Optimization job queued.");
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const handleUpdateJob = async (jobId: string, status: Job["status"], score: number) => {
    try {
      const job = await api.updateJob(jobId, { status, score });
      setJobs((prev) => prev.map((item) => (item.id === job.id ? job : item)));
      setNotice("Job status updated.");
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    try {
      await api.deleteJob(jobId);
      setJobs((prev) => prev.filter((item) => item.id !== jobId));
      setNotice("Job removed.");
    } catch (error) {
      setNotice((error as Error).message);
    }
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>zacino</h1>
        <p>Meta-level optimization control center for enterprise-grade execution.</p>
      </aside>
      <main className="content">
        {notice && <div className="notice card">{notice}</div>}
        {isAuthenticated ? (
          <DashboardPage
            jobs={jobs}
            onCreateJob={handleCreateJob}
            onUpdateJob={handleUpdateJob}
            onDeleteJob={handleDeleteJob}
            onLogout={handleLogout}
          />
        ) : (
          <AuthPage onAuth={handleAuth} loading={authState.loading} error={authState.error} />
        )}
      </main>
    </div>
  );
}

export default App;
