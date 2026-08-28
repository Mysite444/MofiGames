import { notFound } from "next/navigation";
import { getPostBySlug } from "@/lib/content-server";
import { getSeoSettings } from "@/lib/seo-settings";
import { buildPostMetadata, articleSchema, breadcrumbSchema } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { RichContent } from "@/components/RichContent";

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
  const breadcrumbItems = [
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog" },
    { name: post.title, path: `/blog/${post.slug}` },
  ];

  return (
    <div className="flex flex-col gap-6 px-4 md:px-6">
      <JsonLd data={[articleSchema(post, settings), breadcrumbSchema(breadcrumbItems, settings)]} />
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Blog", href: "/blog" }, { name: post.title }]} />

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
                <span
                  key={tag.id}
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black"
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.name}
                </span>
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
      </div>
    </div>
  );
}
