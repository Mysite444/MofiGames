import Link from "next/link";
import { notFound } from "next/navigation";
import { getPostBySlug, getPublishedPosts, getRelatedPosts } from "@/lib/content-server";
import { getSeoSettings } from "@/lib/seo-settings";
import { buildPostMetadata, articleSchema, breadcrumbSchema, absoluteUrl } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { RichContent } from "@/components/RichContent";

// ISR: post content is public and cookie-free. 300s matches the [slug] and
// /categories pattern. Admin publish/edit/unpublish calls
// revalidatePath("/blog/[slug]") for immediate cache invalidation.
export const revalidate = 300;

export async function generateStaticParams() {
  try {
    const posts = await getPublishedPosts();
    return posts.map((p) => ({ slug: p.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return {};
  const settings = await getSeoSettings();
  return buildPostMetadata(post, settings);
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  const settings = await getSeoSettings();

  // Fetch related posts in parallel with settings (already resolved above,
  // but getRelatedPosts is a separate network call so kick it off early).
  const related = await getRelatedPosts(
    post.id,
    post.tags.map((t) => t.id),
    3
  );

  const breadcrumbItems = [
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog" },
    { name: post.title, path: `/blog/${post.slug}` },
  ];

  // Build articleSchema with relatedLink so Google/Bing can walk the
  // internal link graph between posts. Each related post slug resolves
  // to an absolute URL so crawlers don't need the base URL in context.
  const articleJsonLd = {
    ...articleSchema(post, settings),
    ...(related.length > 0 && {
      relatedLink: related.map((r) => absoluteUrl(`/blog/${r.slug}`, settings)),
    }),
  };

  return (
    <div className="flex flex-col gap-6 px-4 md:px-6">
      <JsonLd data={[articleJsonLd, breadcrumbSchema(breadcrumbItems, settings)]} />
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <Breadcrumbs
          items={[{ name: "Home", href: "/" }, { name: "Blog", href: "/blog" }, { name: post.title }]}
        />

        {post.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.coverImageUrl}
            alt=""
            className="max-h-80 w-full rounded-2xl object-cover"
          />
        )}

        <div>
          {post.tags.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {post.tags.map((tag) => (
                // FIX: tags are now <Link> not <span> — clicking navigates to
                // the tag archive at /{tag.slug}, creating actual internal
                // links that both users and crawlers can follow.
                <Link
                  key={tag.id}
                  href={`/${tag.slug}`}
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black transition-opacity hover:opacity-80"
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.name}
                </Link>
              ))}
            </div>
          )}
          <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">
            {post.seoH1Title?.trim() || post.title}
          </h1>
          <p className="mt-1.5 text-sm text-text-faint">
            {post.authorName} ·{" "}
            {new Date(post.publishedAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>

        <div className="glass rounded-2xl p-6 sm:p-8">
          <RichContent html={post.content} />
        </div>

        {/* ── Related Posts ──────────────────────────────────────────────────
            Shown whenever at least one published post shares a tag with this
            one. Each card is a full <a> link so every post becomes a node
            in the site's internal link graph — crawlers find new posts
            through existing ones without relying solely on the sitemap.     */}
        {related.length > 0 && (
          <section aria-label="Related posts">
            <h2 className="mb-3 font-display text-lg font-bold text-white">Related posts</h2>
            <div className="flex flex-col gap-3">
              {related.map((rp) => (
                <Link
                  key={rp.id}
                  href={`/blog/${rp.slug}`}
                  className="glass flex gap-4 rounded-2xl p-4 transition-colors hover:bg-white/[0.08] sm:items-center"
                >
                  {rp.coverImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={rp.coverImageUrl}
                      alt=""
                      className="h-16 w-24 shrink-0 rounded-xl object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    {rp.tags.length > 0 && (
                      <div className="mb-1 flex flex-wrap gap-1">
                        {rp.tags.slice(0, 2).map((t) => (
                          <span
                            key={t.id}
                            className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-black"
                            style={{ backgroundColor: t.color }}
                          >
                            {t.name}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="line-clamp-2 text-sm font-semibold text-white">{rp.title}</p>
                    {rp.excerpt && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-text-faint">{rp.excerpt}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
