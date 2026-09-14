import type { Metadata } from "next";
import { JetBrains_Mono, Public_Sans, Saira_Condensed } from "next/font/google";
import Script from "next/script";
import { DeferredGTM } from "@/app/components/deferred-gtm/DeferredGTM";
import "@/app/globals.css";
import { ErrorBoundary } from "@/app/components/error-boundary";
import { FloatingMessengerButton } from "@/app/components/floating-messenger-button";
import { Footer } from "@/app/components/footer/Footer";
import { TranslationProvider } from "@/app/contexts/TranslationContext";
import { GOOGLE_ADS_ID, GTM_ID } from "@/app/lib/constants";
import { FALLBACK_FOOTER, FALLBACK_SEO, FALLBACK_SOCIAL_LINKS } from "@/app/lib/fallback";
import { getFooter, getSeoMetadata, getSocialLinks, getStrapiImageUrl } from "@/app/lib/strapi";
import type { Locale } from "@/app/types";

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "vietnamese"],
  weight: ["700"],
  display: "swap",
});

const sairaCondensed = Saira_Condensed({
  variable: "--font-saira-condensed",
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400"],
  display: "swap",
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const typedLocale = locale as Locale;
  const isVi = typedLocale === "vi";

  const seo = await getSeoMetadata(typedLocale);
  const lang = isVi ? "vi" : "en";

  const siteName = seo?.site_name || FALLBACK_SEO.site_name;
  const defaultTitle = seo?.default_title || FALLBACK_SEO.title[lang];
  const titleTemplate = seo?.title_template || FALLBACK_SEO.title_template;
  const description = seo?.description || FALLBACK_SEO.description[lang];
  const keywords = seo?.keywords
    ? seo.keywords.split(",").map((k) => k.trim())
    : FALLBACK_SEO.keywords[lang];
  const ogImageUrl = getStrapiImageUrl(seo?.og_image) || FALLBACK_SEO.og_image;
  const twitterImageUrl =
    getStrapiImageUrl(seo?.twitter_image) || FALLBACK_SEO.twitter_image;

  return {
    metadataBase: new URL(
      process.env.NEXT_PUBLIC_SITE_URL || "https://www.saint6.studio",
    ),
    manifest: "/site.webmanifest",
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      ],
      apple: [
        { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
      ],
    },
    title: {
      default: defaultTitle,
      template: titleTemplate,
    },
    description,
    keywords,
    authors: [{ name: siteName }],
    creator: siteName,
    openGraph: {
      type: "website",
      locale: isVi ? "vi_VN" : "en_US",
      url: `/${typedLocale}`,
      siteName,
      title: defaultTitle,
      description,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: siteName,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: defaultTitle,
      description,
      images: [twitterImageUrl],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
  };
}

export async function generateStaticParams() {
  return [{ locale: "en" }, { locale: "vi" }] as Array<{ locale: Locale }>;
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const typedLocale = locale as Locale;

  const isDev = process.env.NODE_ENV === "development";
  const [footerData, socialData] = await Promise.all([
    getFooter(typedLocale),
    getSocialLinks(typedLocale),
  ]);
  const useFallback = !footerData && !socialData && isDev;

  const socialLinks = socialData
    ? [
        socialData.facebook_url && { platform: "Facebook", url: socialData.facebook_url, label: socialData.facebook_label || "FACEBOOK" },
        socialData.instagram_url && { platform: "Instagram", url: socialData.instagram_url, label: socialData.instagram_label || "INSTAGRAM" },
        socialData.tiktok_url && { platform: "TikTok", url: socialData.tiktok_url, label: socialData.tiktok_label || "TIKTOK" },
      ].filter((link): link is { platform: string; url: string; label: string } => Boolean(link))
    : useFallback
      ? FALLBACK_SOCIAL_LINKS
      : undefined;

  const footer = footerData || (useFallback ? FALLBACK_FOOTER : null);

  return (
    <html lang={typedLocale}>
      <head>
        <Script
          id="_google-ads-tag"
          strategy="beforeInteractive"
          src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
        />
        <Script id="_google-ads-init" strategy="beforeInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GOOGLE_ADS_ID}');`}
        </Script>
        {/* Capture UTM params from URL into sessionStorage before React hydrates */}
        <Script src="/scripts/capture-utm.js" strategy="beforeInteractive" />
        <link rel="preconnect" href="https://strapi.saint6.studio" />
        <link rel="dns-prefetch" href="https://strapi.saint6.studio" />
        {process.env.NEXT_PUBLIC_CDN_URL && (
          <>
            <link rel="preconnect" href={process.env.NEXT_PUBLIC_CDN_URL} />
            <link rel="dns-prefetch" href={process.env.NEXT_PUBLIC_CDN_URL} />
          </>
        )}
      </head>
      <DeferredGTM gtmId={GTM_ID} />
      <body
        className={`${publicSans.variable} ${jetbrainsMono.variable} ${sairaCondensed.variable} antialiased`}
        suppressHydrationWarning
      >
        <ErrorBoundary>
          <TranslationProvider locale={typedLocale}>
            <main>{children}</main>
            <Footer
              contactLabel={footer?.contact_label || undefined}
              address={footer?.address || undefined}
              email={footer?.email || undefined}
              phone={footer?.phone || undefined}
              socialLinks={socialLinks && socialLinks.length > 0 ? socialLinks : undefined}
            />
            <FloatingMessengerButton />
          </TranslationProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
