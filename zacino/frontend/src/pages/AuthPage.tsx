import { useState } from "react";

type AuthPageProps = {
  onAuth: (mode: "login" | "register", email: string, password: string) => void;
  loading: boolean;
  error: string | null;
};

const initialForm = { email: "", password: "" };

function AuthPage({ onAuth, loading, error }: AuthPageProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState(initialForm);

  const canSubmit = form.email.length > 3 && form.password.length >= 8;

  return (
    <section className="card">
      <h2>{mode === "login" ? "Sign in" : "Create enterprise account"}</h2>
      <p>Secure access with JWT-based identity controls.</p>
      {error && <p className="notice">{error}</p>}
      <div className="form-grid">
        <label>
          Email
          <input
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            placeholder="team@enterprise.io"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            placeholder="At least 8 characters"
          />
        </label>
        <button
          onClick={() => onAuth(mode, form.email, form.password)}
          disabled={!canSubmit || loading}
        >
          {loading ? "Processing..." : mode === "login" ? "Sign in" : "Register"}
        </button>
        <button
          className="secondary"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          Switch to {mode === "login" ? "register" : "login"}
        </button>
      </div>
    </section>
  );
}

export default AuthPage;
