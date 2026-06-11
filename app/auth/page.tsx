"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

function getRedirectTarget() {
  const params = new URLSearchParams(window.location.search);
  const target = params.get("redirect") || params.get("next") || "/profile";

  if (!target.startsWith("/") || target.startsWith("//")) {
    return "/profile";
  }

  return target;
}

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleAuth() {
    setMessage("");
    setLoading(true);

    if (!email.trim() || !password.trim()) {
      setMessage("Email and password are required.");
      setLoading(false);
      return;
    }

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
        setMessage(error.message);
        setLoading(false);
        return;
      }

      if (data.user) {
        await supabase.from("profiles").insert({
          id: data.user.id,
          email: email.trim(),
          display_name: displayName.trim() || email.split("@")[0],
          credit_balance: 100,
          trust_score: 0,
        });
      }

      setMessage("Account created. You can now use the app.");
      setLoading(false);
      window.location.href = getRedirectTarget();
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    window.location.href = getRedirectTarget();
  }

  return (
    <main className="mx-auto max-w-md px-5 py-12">
      <p className="font-bold text-muted">OwnerCheck account</p>
      <h1 className="mt-2 text-4xl font-black">
        {mode === "login" ? "Log in" : "Create account"}
      </h1>

      <div className="card mt-8 space-y-5 p-6">
        {mode === "signup" && (
          <div>
            <label className="label">Display name</label>
            <input
              className="input mt-2"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Rıdvan"
            />
          </div>
        )}

        <div>
          <label className="label">Email</label>
          <input
            className="input mt-2"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className="label">Password</label>
          <input
            className="input mt-2"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 6 characters"
          />
        </div>

        <button
          type="button"
          className="btn btn-dark w-full"
          onClick={handleAuth}
          disabled={loading}
        >
          {loading
            ? "Please wait..."
            : mode === "login"
            ? "Log in"
            : "Create account"}
        </button>

        {message && <p className="text-sm font-bold text-muted">{message}</p>}

        <button
          type="button"
          className="text-sm font-bold underline"
          onClick={() => {
            setMessage("");
            setMode(mode === "login" ? "signup" : "login");
          }}
        >
          {mode === "login"
            ? "Need an account? Sign up"
            : "Already have an account? Log in"}
        </button>
      </div>
    </main>
  );
}
