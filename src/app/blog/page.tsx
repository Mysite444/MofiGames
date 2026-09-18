import Link from "next/link";
import { Newspaper } from "lucide-react";
import { getPublishedPosts } from "@/lib/content-server";

export const revalidate = 300;

export const metadata = {
  title: "Blog & News — MofiGames",
  description: "Updates, new game announcements, and news from MofiGames.",
};

export default async function BlogIndexPage() {
  const posts = await getPublishedPosts();

  return (
    <div className="flex flex-col gap-6 px-4 md:px-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="flex items-center gap-3">
          <span className="glass-strong flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white">
            <Newspaper size={20} />
          </span>
          <div>
            <h1 className="font-display text-2xl font-bold text-white">Blog & News</h1>
            <p className="text-sm text-text-faint">Updates and announcements from MofiGames</p>
          </div>
        </div>

        {posts.length === 0 ? (
          <p className="glass rounded-2xl p-6 text-sm text-text-faint">
            No posts yet — check back soon.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {posts.map((post) => (
              // Card is now a <div> instead of a full <Link> wrapper so that
              // tag badges can be their own <Link> elements without creating
              // invalid nested-anchor HTML.  The title and image remain the
              // primary clickable target for the post.
              <div
                key={post.id}
                className="glass flex flex-col gap-3 rounded-2xl p-5 sm:flex-row sm:items-center"
              >
                {post.coverImageUrl && (
                  <Link href={`/blog/${post.slug}`} className="shrink-0" tabIndex={-1} aria-hidden>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={post.coverImageUrl}
                      alt=""
                      className="h-40 w-full rounded-xl object-cover sm:h-24 sm:w-40"
                    />
                  </Link>
                )}
                <div className="min-w-0 flex-1">
                  {post.tags.length > 0 && (
                    <div className="mb-1.5 flex flex-wrap gap-1.5">
                      {post.tags.map((tag) => (
                        // Tag links navigate to the tag archive at /{tag.slug}
                        // so crawlers can traverse the full tag graph from
                        // the blog list page as well as from individual posts.
                        <Link
                          key={tag.id}
                          href={`/${tag.slug}`}
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black transition-opacity hover:opacity-75"
                          style={{ backgroundColor: tag.color }}
                        >
                          {tag.name}
                        </Link>
                      ))}
                    </div>
                  )}
                  <Link
                    href={`/blog/${post.slug}`}
                    className="group block transition-opacity hover:opacity-80"
                  >
                    <h2 className="font-display text-lg font-bold text-white group-hover:underline">
                      {post.title}
                    </h2>
                    {post.excerpt && (
                      <p className="mt-1 line-clamp-2 text-sm text-text-muted">{post.excerpt}</p>
                    )}
                  </Link>
                  <p className="mt-2 text-xs text-text-faint">
                    {post.authorName} ·{" "}
                    {new Date(post.publishedAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
