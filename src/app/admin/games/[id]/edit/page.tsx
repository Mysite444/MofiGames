import { notFound } from "next/navigation";
import {
  fetchGameAdminById,
  fetchAllCategoriesAdmin,
  fetchAllTagsAdmin,
} from "@/lib/supabase/admin-content";
import { GameEditorClient } from "@/components/admin/GameEditorClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = await fetchGameAdminById(id).catch(() => null);
  return {
    title: game ? `Edit: ${game.title} — MofiGames Admin` : "Game Editor — MofiGames Admin",
  };
}

export default async function AdminGameEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Parallel-fetch all the data the editor needs up front.
  const [game, categories, tags] = await Promise.all([
    fetchGameAdminById(id),
    fetchAllCategoriesAdmin(),
    fetchAllTagsAdmin(),
  ]);

  if (!game) notFound();

  return <GameEditorClient initialGame={game} categories={categories} tags={tags} />;
}
