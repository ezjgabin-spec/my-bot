import type { Metadata } from "next";
import { AppShell, WorkspaceProvider } from "@/components/workspace";
import "./globals.css";
export const metadata: Metadata = {
  title: "StudyPredict AI — Your personal study space",
  description:
    "Practice with your study materials, understand your progress, and calibrate school grade predictions using your own results.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <WorkspaceProvider>
          <AppShell>{children}</AppShell>
        </WorkspaceProvider>
      </body>
    </html>
  );
}
