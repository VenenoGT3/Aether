import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/lib/theme-provider";
import { NavBar } from "@/components/nav-bar";
import { MobileTabBar } from "@/components/mobile-tab-bar";
import { Toaster } from "sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0c" },
  ],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* MANDATORY: Declare support for both light and dark themes in HTML header */}
        <meta name="color-scheme" content="light dark" />
        
        {/* MANDATORY: Zero-FOUC inline script to execute before React hydration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const pinned = localStorage.getItem("aether-theme-pinned") === "true";
                  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
                  const isDark = pinned ? !systemDark : systemDark;
                  if (isDark) {
                    document.documentElement.classList.add('dark');
                    document.documentElement.style.colorScheme = 'dark';
                    document.querySelector('meta[name="color-scheme"]').setAttribute('content', 'dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                    document.documentElement.style.colorScheme = 'light';
                    document.querySelector('meta[name="color-scheme"]').setAttribute('content', 'light');
                  }
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
