import type { Metadata } from "next";
import type { Game, Category, SeoSettings } from "./types";
import type { PublicPage, PublicPost } from "./content-server";

// Advanced SEO Module — shared, environment-agnostic SEO logic used by
// every public page's generateMetadata() and by the sitemap/robots route
// handlers. Kept framework-light (plain functions returning plain
// objects/strings) so it's trivial to unit-test and impossible for pages
// to drift from each other on how a title/canonical/robots directive gets
// built.

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.mofigames.com").replace(
  /\/$/,
  ""
);

// ---------------------------------------------------------------------------
// Canonical URL construction — respects the site-wide domain (www vs
// non-www) and trailing-slash preference from Global SEO Settings, so a
// single admin setting controls every canonical/OG/sitemap URL at once
// instead of each page hardcoding its own.
// ---------------------------------------------------------------------------

export function absoluteUrl(path: string, settings: Pick<SeoSettings, "trailingSlash">): string {
  let p = path.startsWith("/") ? path : `/${path}`;
  if (p !== "/") {
    if (settings.trailingSlash === "add" && !p.endsWith("/")) p = `${p}/`;
    if (settings.trailingSlash === "remove" && p.endsWith("/")) p = p.slice(0, -1);
  }
  return `${SITE_URL}${p}`;
}

// ---------------------------------------------------------------------------
// Title template — supports the %title% / %category% / %site_name%
// variables from the spec's "Search Appearance" section.
// ---------------------------------------------------------------------------

export function applyTitleTemplate(
  template: string,
  vars: { title: string; category?: string; site_name: string }
): string {
  return template
    .replaceAll("%title%", vars.title)
    .replaceAll("%category%", vars.category ?? "")
    .replaceAll("%site_name%", vars.site_name)
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Robots meta directive — combines index/follow with the max-snippet /
// max-image-preview / max-video-preview / noarchive / nosnippet controls
// from the spec's "Robots Meta Settings" section into the shape Next's
// Metadata.robots expects.
// ---------------------------------------------------------------------------

export interface RobotsInput {
  index: boolean;
  follow: boolean;
  maxSnippet?: number;
  maxImagePreview?: "none" | "standard" | "large";
  maxVideoPreview?: number;
  noarchive?: boolean;
  nosnippet?: boolean;
}

export function buildRobotsMeta(input: RobotsInput): Metadata["robots"] {
  return {
    index: input.index,
    follow: input.follow,
    noarchive: input.noarchive || undefined,
    nosnippet: input.nosnippet || undefined,
    googleBot: {
      index: input.index,
      follow: input.follow,
      "max-snippet": input.maxSnippet ?? -1,
      "max-image-preview": input.maxImagePreview ?? "large",
      "max-video-preview": input.maxVideoPreview ?? -1,
    },
  };
}

// ---------------------------------------------------------------------------
// Game Page SEO — builds full Metadata for /game/[slug], falling back
// through: per-game override → auto-generated from game data → global
// default. Every field in the spec's "Game Page SEO" section is covered.
// ---------------------------------------------------------------------------

export function buildGameMetadata(game: Game, category: Category, settings: SeoSettings): Metadata {
  const autoTitle = `${game.title} — Play Free Online | ${settings.siteName}`;
  const title =
    game.metaTitle?.trim() ||
    applyTitleTemplate(settings.titleTemplate, {
      title: game.title,
      category: category.name,
      site_name: settings.siteName,
    }) ||
    autoTitle;

  const description =
    game.metaDescription?.trim() ||
    game.seoExcerpt?.trim() ||
    game.description?.trim() ||
    `Play ${game.title} free online, no download required — right in your browser on ${settings.siteName}.`;

  const canonical = game.seoCanonicalUrl?.trim() || absoluteUrl(`/${game.slug}`, settings);

  const ogImage = game.ogImageUrl || game.coverImageUrl || game.thumbnailUrl || settings.defaultOgImageUrl;
  const ogTitle = game.ogTitle?.trim() || title;
  const ogDescription = game.ogDescription?.trim() || description;

  const twitterTitle = game.twitterTitle?.trim() || ogTitle;
  const twitterDescription = game.twitterDescription?.trim() || ogDescription;
  const twitterImage = game.twitterImageUrl || ogImage;

  return {
    title,
    description,
    authors: (game.seoAuthor || settings.defaultAuthor) ? [{ name: game.seoAuthor || settings.defaultAuthor }] : undefined,
    keywords:
      game.seoFocusKeyword || (game.seoSecondaryKeywords && game.seoSecondaryKeywords.length > 0)
        ? [game.seoFocusKeyword, ...(game.seoSecondaryKeywords ?? [])].filter(
            (k): k is string => Boolean(k)
          )
        : undefined,
    alternates: { canonical },
    robots: buildRobotsMeta({
      index: game.seoIndex ?? true,
      follow: game.seoFollow ?? true,
      maxSnippet: game.seoMaxSnippet,
      maxImagePreview: game.seoMaxImagePreview,
      maxVideoPreview: game.seoMaxVideoPreview,
      noarchive: game.seoNoarchive,
      nosnippet: game.seoNosnippet,
    }),
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      url: canonical,
      type: "website",
      images: ogImage
        ? [{ url: ogImage, alt: game.ogImageAlt || game.title }]
        : undefined,
    },
    twitter: {
      card: game.twitterCard || "summary_large_image",
      title: twitterTitle,
      description: twitterDescription,
      images: twitterImage ? [twitterImage] : undefined,
      site: settings.twitterSite || undefined,
      creator: settings.twitterCreator || undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Category SEO — /category/[slug].
// ---------------------------------------------------------------------------

export function buildCategoryMetadata(category: Category, settings: SeoSettings): Metadata {
  const autoTitle = `${category.name} Games — Play Free Online | ${settings.siteName}`;
  const title =
    category.seoTitle?.trim() ||
    applyTitleTemplate(settings.titleTemplate, {
      title: `${category.name} Games`,
      category: category.name,
      site_name: settings.siteName,
    }) ||
    autoTitle;

  const description =
    category.seoDescription?.trim() ||
    category.description?.trim() ||
    `Play the best free ${category.name} games online on ${settings.siteName}. No download required.`;

  const canonical = category.seoCanonicalUrl?.trim() || absoluteUrl(`/${category.slug}`, settings);
  const ogImage = category.ogImageUrl || settings.defaultOgImageUrl;

  return {
    title,
    description,
    keywords: category.seoFocusKeyword ? [category.seoFocusKeyword] : undefined,
    alternates: { canonical },
    robots: buildRobotsMeta({
      index: category.seoIndex ?? true,
      follow: true,
    }),
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
      images: ogImage ? [{ url: ogImage, alt: category.name }] : undefined,
    },
    twitter: {
      card: settings.twitterCardType,
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
      site: settings.twitterSite || undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Static Page SEO — /about, /contact, custom pages, etc.
// ---------------------------------------------------------------------------

export function buildPageMetadata(page: PublicPage, settings: SeoSettings): Metadata {
  const title =
    page.seoTitle?.trim() ||
    applyTitleTemplate(settings.titleTemplate, { title: page.title, site_name: settings.siteName });
  const description = page.metaDescription?.trim() || settings.defaultMetaDescription;
  const canonical = page.seoCanonicalUrl?.trim() || absoluteUrl(`/${page.slug}`, settings);

  return {
    title,
    description,
    alternates: { canonical },
    robots: buildRobotsMeta({ index: page.seoIndex ?? true, follow: true }),
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
      images: page.ogImageUrl ? [{ url: page.ogImageUrl }] : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// Blog SEO — /blog/[slug].
// ---------------------------------------------------------------------------

export function buildPostMetadata(post: PublicPost, settings: SeoSettings): Metadata {
  const title =
    post.seoTitle?.trim() ||
    applyTitleTemplate(settings.titleTemplate, { title: post.title, site_name: settings.siteName });
  const description = post.seoDescription?.trim() || post.excerpt?.trim() || settings.defaultMetaDescription;
  const canonical = post.seoCanonicalUrl?.trim() || absoluteUrl(`/blog/${post.slug}`, settings);
  const ogImage = post.ogImageUrl || post.coverImageUrl || settings.defaultOgImageUrl;

  return {
    title,
    description,
    authors: [{ name: post.authorName }],
    keywords:
      post.seoFocusKeyword || (post.seoSecondaryKeywords && post.seoSecondaryKeywords.length > 0)
        ? [post.seoFocusKeyword, ...(post.seoSecondaryKeywords ?? [])].filter((k): k is string => Boolean(k))
        : undefined,
    alternates: { canonical },
    robots: buildRobotsMeta({ index: post.seoIndex ?? true, follow: true }),
    openGraph: {
      title: post.ogTitle?.trim() || title,
      description: post.ogDescription?.trim() || description,
      url: canonical,
      type: "article",
      publishedTime: post.publishedAt,
      authors: [post.authorName],
      images: ogImage ? [{ url: ogImage, alt: post.ogImageAlt || post.title }] : undefined,
    },
    twitter: {
      card: post.twitterCard || "summary_large_image",
      title: post.ogTitle?.trim() || title,
      description: post.ogDescription?.trim() || description,
      images: ogImage ? [ogImage] : undefined,
      site: settings.twitterSite || undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// JSON-LD structured data generators (Structured Data Manager). Each
// returns a plain object ready to JSON.stringify into a
// <script type="application/ld+json"> tag via <JsonLd /> — see
// src/components/JsonLd.tsx.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonLdObject = Record<string, any>;

export function organizationSchema(settings: SeoSettings): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: settings.orgName || settings.siteName,
    url: SITE_URL,
    logo: settings.orgLogoUrl || undefined,
    sameAs: settings.orgSameAs?.length ? settings.orgSameAs : undefined,
  };
}

export function websiteSchema(settings: SeoSettings): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: settings.siteName,
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export function breadcrumbSchema(items: BreadcrumbItem[], settings: SeoSettings): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path, settings),
    })),
  };
}

/** VideoGame schema — https://schema.org/VideoGame. Covers the required
 * "VideoGame Schema" from the spec. */
export function videoGameSchema(game: Game, category: Category, settings: SeoSettings): JsonLdObject {
  const image = game.ogImageUrl || game.coverImageUrl || game.thumbnailUrl;
  return {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: game.title,
    description: game.metaDescription?.trim() || game.description || undefined,
    url: absoluteUrl(`/${game.slug}`, settings),
    image: image || undefined,
    genre: category.name,
    playMode: game.multiplayer ? "MultiPlayer" : "SinglePlayer",
    applicationCategory: "Game",
    operatingSystem: "Web browser",
    author: game.developer ? { "@type": "Organization", name: game.developer } : undefined,
    publisher: game.publisher ? { "@type": "Organization", name: game.publisher } : undefined,
    datePublished: game.releaseDate || undefined,
    dateModified: game.updatedAt || undefined,
    aggregateRating:
      game.ratingCount && game.ratingCount > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: game.rating,
            ratingCount: game.ratingCount,
            bestRating: 5,
            worstRating: 1,
          }
        : undefined,
  };
}

/** SoftwareApplication schema — https://schema.org/SoftwareApplication.
 * Google surfaces install/rating rich results from this even for
 * browser-only apps, so it's kept alongside VideoGame rather than instead
 * of it (both are valid on the same page; each targets slightly different
 * rich-result surfaces). */
export function softwareApplicationSchema(game: Game, settings: SeoSettings): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: game.title,
    url: absoluteUrl(`/${game.slug}`, settings),
    applicationCategory: "Game",
    operatingSystem: "Web",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    aggregateRating:
      game.ratingCount && game.ratingCount > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: game.rating,
            ratingCount: game.ratingCount,
            bestRating: 5,
            worstRating: 1,
          }
        : undefined,
  };
}

export function collectionPageSchema(category: Category, gameCount: number, settings: SeoSettings): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${category.name} Games`,
    description: category.seoDescription || category.description || undefined,
    url: absoluteUrl(`/${category.slug}`, settings),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: gameCount,
    },
  };
}

export function articleSchema(post: PublicPost, settings: SeoSettings): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.seoDescription || post.excerpt || undefined,
    image: post.ogImageUrl || post.coverImageUrl || undefined,
    author: { "@type": "Person", name: post.authorName },
    publisher: { "@type": "Organization", name: settings.orgName || settings.siteName, logo: settings.orgLogoUrl || undefined },
    datePublished: post.publishedAt,
    mainEntityOfPage: absoluteUrl(`/blog/${post.slug}`, settings),
  };
}
