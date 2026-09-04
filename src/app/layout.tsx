import type { Metadata } from "next";
import "./globals.css";
import "./account-global.css";
import UnderAskUsageWidget from "@/components/UnderAskUsageWidget";

export const metadata: Metadata = {
  title: "UnderAsk — The search engine for deals",
  description: "Tell UnderAsk what kind of deal you want. It searches the web for undervalued listings."
};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}<UnderAskUsageWidget /></body></html>;
}
