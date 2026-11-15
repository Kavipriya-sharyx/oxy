import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { login as loginRequest } from "../api/auth.api";
import { useAuth } from "../hooks/useAuth";

const STEPS = [
  {
    lead: "Answer faster.",
    text: "The bot handles WhatsApp enquiries so your team can focus on customers.",
  },
  {
    lead: "Track every booking.",
    text: "See pending and confirmed bookings in one place.",
  },
  {
    lead: "Stay in control.",
    text: "Sales confirms each booking with the centre, and every price change needs two approvers.",
  },
];

export default function Login() {
  const navigate = useNavigate();
  const { isLoggedIn, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const mutation = useMutation({
    mutationFn: () => loginRequest(email.trim(), password),
    onSuccess: (token) => {
      login(token);
      navigate("/", { replace: true }); // the landing route picks the first allowed page
    },
  });

  if (isLoggedIn && !mutation.isSuccess) return <Navigate to="/" replace />;

  return (
    <div className="lg">
      <aside className="lg-brand">
        <div className="lg-mid">
          <div className="lg-eyebrow">BUILT FOR THE OXXY TEAM</div>
          <h1>Every enquiry. Every booking. One console.</h1>
          <ol className="lg-steps">
            {STEPS.map((s, i) => (
              <li key={s.lead}>
                <span className="lg-num" aria-hidden="true">
                  {i + 1}
                </span>
                <span>
                  <strong>{s.lead}</strong> {s.text}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="lg-copy">© 2026 Oxxy</div>
      </aside>

      <main className="lg-side">
        <div className="lg-banner">Every enquiry. Every booking. One console.</div>
        <form
          className="lg-card"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="lg-logo">
            <img
              className="logo"
              src="/oxxy-logo.png"
              alt="Oxxy - Sales and bot console"
              height={84}
              style={{ height: 84, width: "auto" }}
            />
            <span className="lg-tag">Sales and bot console</span>
          </div>
          <h2>Welcome back</h2>
          <p className="lg-sub">
            Sign in to the Oxxy console to manage customers, bookings and bot replies.
          </p>
          <div className="lg-field">
            <label htmlFor="em">Work email</label>
            <input
              id="em"
              className="lg-input"
              type="email"
              required
              placeholder="you@oxxy.com"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="lg-field">
            <label htmlFor="pw">Password</label>
            <div className="lg-pw">
              <input
                id="pw"
                className="lg-input"
                type={showPassword ? "text" : "password"}
                required
                placeholder="Enter your password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="lg-eye"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {showPassword ? (
                    <>
                      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C5 20 1 12 1 12a18.5 18.5 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </>
                  ) : (
                    <>
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  )}
                </svg>
              </button>
            </div>
          </div>
          <div className="lg-error" aria-live="polite">
            {mutation.isError ? <span role="alert">{mutation.error.message}</span> : null}
          </div>
          <button className="lg-btn" disabled={mutation.isPending}>
            {mutation.isPending && <span className="lg-spin" aria-hidden="true" />}
            {mutation.isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="lg-foot">© 2026 Oxxy · For the sales team and admins only</p>
      </main>
    </div>
  );
}
