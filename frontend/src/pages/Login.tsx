import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { login as loginRequest } from "../api/auth.api";
import { useAuth } from "../hooks/useAuth";

export default function Login() {
  const navigate = useNavigate();
  const { isLoggedIn, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const mutation = useMutation({
    mutationFn: () => loginRequest(email.trim(), password),
    onSuccess: (token) => {
      login(token);
      navigate("/", { replace: true }); // the landing route picks the first allowed page
    },
  });

  if (isLoggedIn && !mutation.isSuccess) return <Navigate to="/" replace />;

  return (
    <div className="login">
      <div className="l">
        <div className="brand" style={{ padding: 0 }}>
          <div className="mark">O</div>
          <div>
            <b>Oxxy</b>
            <span>Sales and bot console</span>
          </div>
        </div>
        <div>
          <h1>Sign in</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>
            For the Oxxy sales team and admins. Customer records, bookings and tasks stay in the
            Oxxy CRM.
          </p>
        </div>
        <form
          className="grid"
          style={{ gap: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="field">
            <label htmlFor="em">Work email</label>
            <input
              id="em"
              className="input"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="pw">Password</label>
            <input
              id="pw"
              className="input"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {mutation.isError && (
            <div className="small" role="alert" style={{ color: "var(--crit)", fontWeight: 600 }}>
              {mutation.error.message}
            </div>
          )}
          <button
            className="btn pri"
            style={{ justifyContent: "center", padding: 10 }}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
      <div className="r">
        <div className="eyebrow" style={{ color: "inherit", opacity: 0.8 }}>
          How Oxxy runs
        </div>
        <blockquote>Claude drafts. Code decides. A person confirms.</blockquote>
        <p>
          Every booking stays pending until the sales team confirms it with the centre in the CRM.
          Every price change needs two approvers.
        </p>
      </div>
    </div>
  );
}
