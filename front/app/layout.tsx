import "@fontsource-variable/vazirmatn";
import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "اتاق فرمان رسانه",
  description: "داشبورد مدیریت هوشمند رسانه‌های چندکاناله",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f4f5f7",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
