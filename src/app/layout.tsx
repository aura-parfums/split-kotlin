import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Split Kotlin Studio",
  description: "A focused Kotlin and Jetpack Compose development workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
