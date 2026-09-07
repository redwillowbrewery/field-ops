import type { Metadata } from "next";
import { PublicPriceListPage } from "@/components/public-price-list-page";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "RedWillow | Current beer & prices", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function Page({ searchParams }: { searchParams: Promise<{ format?: string }> }) {
  const { format } = await searchParams;
  return <PublicPriceListPage format={format} />;
}
