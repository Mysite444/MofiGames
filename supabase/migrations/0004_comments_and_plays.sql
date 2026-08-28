-- MofiGames — Phase 4: real comments (replacing the localStorage-only mock)
-- and a secure way to bump a game's play counter. Run in Supabase Dashboard
-- → SQL Editor, same as the other migrations. Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- comments — one row per comment or reply. `parent_id` null = top-level
-- comment; non-null = a reply to that comment. Replies are restricted to
-- one level deep (matching the UI, which never nests further) by the
-- trigger below rather than a declarative check, since Postgres CHECK
-- constraints can't query other rows.
--
-- `author_name` is a display-name snapshot taken at post time (not a live
-- join to profiles) — comments should legibly stay under the name someone
-- posted with, matching how basically every comment system behaves, and it
-- means readers don't need a join just to render a name.
-- ---------------------------------------------------------------------------
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  game_slug text not null,
  parent_id uuid references public.comments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  author_name text not null default 'Player',
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists comments_game_slug_created_at_idx
  on public.comments (game_slug, created_at desc);
create index if not exists comments_parent_id_idx on public.comments (parent_id);

create or replace function public.enforce_comment_reply_depth()
returns trigger
language plpgsql
as $$
declare
  parent_of_parent uuid;
begin
  if new.parent_id is not null then
    select parent_id into parent_of_parent from public.comments where id = new.parent_id;
    if not found then
      raise exception 'Parent comment does not exist';
    end if;
    if parent_of_parent is not null then
      raise exception 'Cannot reply to a reply — only one level of nesting is allowed';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists comments_enforce_reply_depth on public.comments;
create trigger comments_enforce_reply_depth
  before insert on public.comments
  for each row execute function public.enforce_comment_reply_depth();

alter table public.comments enable row level security;

drop policy if exists "Comments are publicly readable" on public.comments;
create policy "Comments are publicly readable"
  on public.comments for select
  using (true);

drop policy if exists "Users can post their own comments" on public.comments;
create policy "Users can post their own comments"
  on public.comments for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own comments" on public.comments;
create policy "Users can delete their own comments"
  on public.comments for delete
  using (auth.uid() = user_id);

-- No update policy on purpose — comments can be deleted and re-posted but
-- not silently edited, matching the original feature set.

-- ---------------------------------------------------------------------------
-- comment_likes — a join row's existence = "this user likes this comment".
-- Kept as its own table (rather than an array column on comments) because
-- RLS can only ever let someone write their own row: an array column would
-- require every liker to have update rights on someone else's comment row,
-- which is exactly the kind of access this app must not grant.
-- ---------------------------------------------------------------------------
create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists comment_likes_comment_id_idx on public.comment_likes (comment_id);

alter table public.comment_likes enable row level security;

drop policy if exists "Comment likes are publicly readable" on public.comment_likes;
create policy "Comment likes are publicly readable"
  on public.comment_likes for select
  using (true);

drop policy if exists "Users can like comments as themselves" on public.comment_likes;
create policy "Users can like comments as themselves"
  on public.comment_likes for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can unlike their own likes" on public.comment_likes;
create policy "Users can unlike their own likes"
  on public.comment_likes for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Play counter. `games.plays` only has an admin write policy (Phase 3) —
-- correctly so, since a blanket "authenticated users can update games"
-- policy would let any signed-in visitor edit titles/embed URLs/anything
-- else on any game. This narrow SECURITY DEFINER function is the one
-- deliberate exception: it can only ever add 1 to `plays` on a single,
-- already-published game, nothing else, for anyone (including anonymous
-- visitors — playing a game doesn't require an account).
-- ---------------------------------------------------------------------------
create or replace function public.increment_game_plays(game_slug text)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  new_plays integer;
begin
  update public.games
  set plays = plays + 1
  where slug = game_slug and is_published = true
  returning plays into new_plays;

  return new_plays;
end;
$$;

grant execute on function public.increment_game_plays(text) to anon, authenticated;
