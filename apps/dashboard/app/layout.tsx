import "@fontsource-variable/vazirmatn";
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "اتاق فرمان رسانه",
  description: "داشبورد مدیریت هوشمند رسانه‌های چندکاناله",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}

