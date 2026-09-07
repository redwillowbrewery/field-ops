import type { Metadata } from "next";
import { PublicPriceListPage } from "@/components/public-price-list-page";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata: Metadata = { title: "RedWillow | Your current beer & prices", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ format?: string }> }) {
  const { token } = await params; const { format } = await searchParams;
  return <PublicPriceListPage token={token} format={format} />;
}
