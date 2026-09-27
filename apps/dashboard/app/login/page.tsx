import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Activity, Radio, ShieldCheck, Sparkles } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { auth } from "@/lib/server/auth";

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/");

  return (
    <main className="login-page">
      <section className="login-showcase">
        <div className="login-brand"><span><Activity size={22} /></span><b>رسانه</b></div>
        <div className="login-showcase-copy">
          <span className="login-kicker"><i />اتاق خبر همیشه بیدار</span>
          <h2>از سیگنال خبر<br />تا انتشار مطمئن.</h2>
          <p>یک مرکز فرمان برای پایش منابع، تصمیم تحریریه و انتشار هماهنگ در تمام کانال‌ها.</p>
        </div>
        <div className="login-signal-card">
          <div><Radio size={17} /><span>جریان زندهٔ منابع</span><b>۳۱</b></div>
          <div><Sparkles size={17} /><span>در صف تحریریه</span><b>۷</b></div>
          <div><ShieldCheck size={17} /><span>وضعیت انتشار</span><b>پایدار</b></div>
        </div>
      </section>
      <section className="login-form-side"><LoginForm /></section>
    </main>
  );
}
