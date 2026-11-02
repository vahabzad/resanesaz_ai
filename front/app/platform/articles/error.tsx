"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="platform-access"><h1>اخبار در دسترس نیست</h1><p>اتصال به بک‌اند را بررسی کنید.</p><button className="primary-button" onClick={reset}>تلاش دوباره</button></main>;
}
