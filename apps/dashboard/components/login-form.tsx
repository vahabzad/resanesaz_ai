"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("sara@didban.local");
  const [password, setPassword] = useState("MediaDemo-2026!");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const result = await authClient.signIn.email({ email, password });
    if (result.error) {
      setError("ایمیل یا رمز عبور درست نیست.");
      setPending(false);
      return;
    }

    const organizations = await authClient.organization.list();
    const firstMedia = organizations.data?.[0];
    if (firstMedia) await authClient.organization.setActive({ organizationId: firstMedia.id });

    router.replace("/");
    router.refresh();
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <div className="login-heading">
        <span>ورود امن</span>
        <h1>به اتاق فرمان برگردید</h1>
        <p>اخبار، تحریریه و شبکه انتشار رسانه در یک فضای واحد.</p>
      </div>

      <label className="login-field">
        <span>ایمیل کاری</span>
        <div><Mail size={17} /><input dir="ltr" type="email" autoComplete="email" value={""} placeholder={"example@example.com"} onChange={(event) => setEmail(event.target.value)} required /></div>
      </label>

      <label className="login-field">
        <span>رمز عبور</span>
        <div>
          <LockKeyhole size={17} />
          <input dir="ltr" type={showPassword ? "text" : "password"} autoComplete="current-password" value={""} placeholder={"*********"} onChange={(event) => setPassword(event.target.value)} required minLength={12} />
          <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "پنهان‌کردن رمز" : "نمایش رمز"}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
        </div>
      </label>

      {error ? <p className="login-error" role="alert">{error}</p> : null}

      <button className="login-submit" type="submit" disabled={pending}>
        {pending ? <LoaderCircle className="spin" size={18} /> : <ArrowLeft size={18} />}
        {pending ? "در حال بررسی…" : "ورود به داشبورد"}
      </button>

      <p className="login-hint">حساب نمونهٔ محلی برای بررسی این vertical slice از قبل وارد شده است.</p>
    </form>
  );
}
