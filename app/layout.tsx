import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "汛巡智眼｜洪涝灾害无人机巡检救援",
  description: "面向洪涝灾害的无人机巡检救援辅助决策平台。",
  openGraph: {
    title: "汛巡智眼｜洪涝灾害无人机巡检救援",
    description: "让无人机灾情感知转化为可追溯、可复核的救援行动建议。",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
