import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase";
import { getStaffPriceListPath } from "@/lib/public-price-list";
import { PriceListShareControls } from "@/components/price-list-share-controls";
import { BottomNav } from "@/components/bottom-nav";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const db = await createSupabaseServerClient();
  const { data: account } = await db.from("accounts").select("id,name").eq("id", id).maybeSingle();
  if (!account) notFound();
  const path = await getStaffPriceListPath(db, id);
  return <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 pb-24"><Link href={`/accounts/${id}`} className="text-sm text-slate-500">← {account.name}</Link><h1 className="text-2xl font-semibold">Live price-list links</h1><PriceListShareControls accountId={id} initialPath={path} /><BottomNav active="Accounts" /></main>;
}
