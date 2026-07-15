import type { Metadata, Viewport } from "next";
import "./globals.css";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Menu e mini-siti multilingua per ristoranti, pronti da condividere con un QR stabile.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f4eee4" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
