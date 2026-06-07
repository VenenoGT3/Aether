import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/lib/theme-provider";
import { NavBar } from "@/components/nav-bar";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { GdprConsentBanner } from "@/components/gdpr-consent-banner";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: {
    default: "Aether - Frictionless Influencer Marketing Platform",
    template: "%s | Aether",
  },
  description: "The premium Apple-designed marketing ecosystem. Connect brands and creators, secure escrows with Stripe Connect, and automate campaign tracking in real time.",
  applicationName: "Aether",
  // Italian-first audience: declare it-IT as the primary locale with en-US alternate.
  alternates: {
    canonical: "/",
    languages: {
      "it-IT": "/",
      "en-US": "/",
    },
  },
  appleWebApp: {
    capable: true,
    title: "Aether",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: "Aether",
    locale: "it_IT",
    alternateLocale: ["en_US"],
    title: "Aether - Frictionless Influencer Marketing Platform",
    description: "The premium Apple-designed marketing ecosystem. Connect brands and creators, secure escrows with Stripe Connect, and automate campaign tracking in real time.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Aether - Premium Influencer Marketing Dashboard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Aether - Frictionless Influencer Marketing Platform",
    description: "The premium Apple-designed marketing ecosystem. Connect brands and creators, secure escrows with Stripe Connect, and automate campaign tracking in real time.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased dark`}
      style={{ colorScheme: "dark" }}
      suppressHydrationWarning
    >
      <head>
        {/* MANDATORY: Declare support for dark theme in HTML header */}
        <meta name="color-scheme" content="dark" />
        
        {/* MANDATORY: Zero-FOUC inline script to execute before React hydration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  document.documentElement.classList.add('dark');
                  document.documentElement.style.colorScheme = 'dark';
                  const meta = document.querySelector('meta[name="color-scheme"]');
                  if (meta) meta.setAttribute('content', 'dark');
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground transition-colors duration-200">
        <ThemeProvider>
          <NavBar />
          <main className="flex-1 flex flex-col pb-24 md:pb-0">{children}</main>
          <MobileTabBar />
          <GdprConsentBanner />
          <Toaster 
            position="bottom-right" 
            toastOptions={{
              style: {
                borderRadius: '16px',
                background: 'var(--card)',
                color: 'var(--foreground)',
                border: '1px solid var(--border)',
              }
            }} 
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
