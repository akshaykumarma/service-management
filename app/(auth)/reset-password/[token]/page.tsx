"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PasswordInput from "@/components/password-input";

export default function ResetPasswordPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: params.token, newPassword }),
      });
      if (res.ok) {
        router.push("/login");
        return;
      }
      setError("This reset link is invalid or has expired. Please request a new one.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>Choose a new password</h1>
      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="newPassword">New password</label>
          <PasswordInput
            id="newPassword"
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={setNewPassword}
          />
        </div>
        {error && (
          <p role="alert" aria-live="assertive">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting}>
          Reset password
        </button>
      </form>
    </main>
  );
}
