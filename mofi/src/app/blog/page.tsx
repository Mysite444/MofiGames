import Link from "next/link";
import { Newspaper } from "lucide-react";
import { getPublishedPosts } from "@/lib/content-server";

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
              <Link
                key={post.id}
                href={`/blog/${post.slug}`}
                className="glass flex flex-col gap-3 rounded-2xl p-5 transition-colors hover:bg-white/[0.08] sm:flex-row sm:items-center"
              >
                {post.coverImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.coverImageUrl}
                    alt=""
                    className="h-40 w-full shrink-0 rounded-xl object-cover sm:h-24 sm:w-40"
                  />
                )}
                <div className="min-w-0 flex-1">
                  {post.tags.length > 0 && (
                    <div className="mb-1.5 flex flex-wrap gap-1.5">
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
                  <h2 className="font-display text-lg font-bold text-white">{post.title}</h2>
                  {post.excerpt && (
                    <p className="mt-1 line-clamp-2 text-sm text-text-muted">{post.excerpt}</p>
                  )}
                  <p className="mt-2 text-xs text-text-faint">
                    {post.authorName} ·{" "}
                    {new Date(post.publishedAt).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
