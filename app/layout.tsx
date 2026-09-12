import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { LoadWrapper } from "@/components/LoadWrapper";
import Script from "next/script";
import PWAInstallButton from "@/components/PWAInstallButton";
import ChatWidget from "@/components/ChatWidget";
import AnnouncementBanner from "@/components/AnnouncementBanner";
import AnnouncementPopup from "@/components/AnnouncementPopup";
import ActivityPing from "@/components/ActivityPing";
import PushNotificationPrompt from "@/components/PushNotificationPrompt";
import AdminPushNotificationPrompt from "@/components/AdminPushNotificationPrompt";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Coupon Sur",
  manifest: "/manifest.json",
  description: "Nous sommes une équipe d’analystes sportifs spécialisés dans plusieurs championnats (Europe, Afrique, compétitions internationales)",
};

// viewportFit: "cover" lets the page draw under the iOS home-indicator
// area in standalone/PWA mode — needed for env(safe-area-inset-bottom) to
// resolve to anything other than 0 (used by BottomTabBar and the fixed
// widgets that sit above it, see lib/layoutConstants.ts).
//
// maximumScale/userScalable lock out pinch-zoom and double-tap-zoom —
// the thing that actually makes a redesigned-to-look-like-an-app site
// still *feel* like a browser tab (a native app never lets a gesture
// zoom the whole UI). iOS Safari has ignored this in an ordinary browser
// tab since iOS 10 for accessibility reasons, but it's still honored
// once the site is added to the home screen and running standalone —
// so in practice this is exactly "disable zoom in the PWA, leave normal
// browsing untouched" without needing to branch on display-mode at all.
// Android's WebView-based standalone mode honors it directly either way.
export const viewport: Viewport = {
  themeColor: "#0A0C0F",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const FB_PIXEL_ID = process.env.NEXT_PUBLIC_FB_PIXEL_ID;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* ── Facebook Pixel ── */}
        {FB_PIXEL_ID && (
          <Script id="fb-pixel" strategy="afterInteractive">
            {`
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${FB_PIXEL_ID}');
              fbq('track', 'PageView');
            `}
          </Script>
        )}
        {/* Noscript fallback */}
        {FB_PIXEL_ID && (
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              src={`https://www.facebook.com/tr?id=${FB_PIXEL_ID}&ev=PageView&noscript=1`}
              alt=""
            />
          </noscript>
        )}
      </head>
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <LoadWrapper>
            <PushNotificationPrompt />
            <AdminPushNotificationPrompt />
            <AnnouncementBanner />
            <AnnouncementPopup />
            <ActivityPing />
            {children}
            <PWAInstallButton />
            <ChatWidget />
          </LoadWrapper>
        </AuthProvider>
      </body>
    </html>
  );
}