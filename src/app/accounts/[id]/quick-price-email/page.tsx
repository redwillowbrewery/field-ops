import Link from "next/link";
import {notFound} from "next/navigation";
import {BottomNav} from "@/components/bottom-nav";
import {SmartBackLink} from "@/components/smart-back-link";
import {getAccountSellingData} from "@/lib/account-selling";
import type {AccountContainerPreference} from "@/lib/package-eligibility";
import {createSupabaseServerClient} from "@/lib/supabase";
import {QuickPriceEmail} from "./quick-price-email";

const SELLAR_URL="https://app.sellar.io/suppliers/redwillow/order?storefrontLink=Ds5MPMEKcZudPVZ";
export default async function QuickPriceEmailPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{variants?:string|string[]}>}){
 const {id}=await params;const {variants}=await searchParams;const db=await createSupabaseServerClient();
 const {data:account}=await db.from("accounts").select("id,name,email,container_preference,contacts(id,email,is_primary,active)").eq("id",id).single();if(!account)notFound();
 const contacts=[...(account.contacts||[])].filter(c=>c.active!==false&&c.email);const recipient=(contacts.find(c=>c.is_primary)?.email||contacts[0]?.email||account.email||"") as string;
 const preference=(account.container_preference||"any") as AccountContainerPreference;const selling=await getAccountSellingData(db,id,preference);
 const rows=selling.rows.flatMap(row=>{const price=row.customerPrice??row.listPrice;if(!["cask","keg","can"].includes(row.broadFormat)||price==null||price<=0)return[];return[{variantId:row.variantId,format:row.broadFormat as "cask"|"keg"|"can",packageType:row.packageLabel,name:row.productName,description:row.description,price}]});
 const requested=(Array.isArray(variants)?variants.join(","):variants||"").split(",").filter(Boolean);const eligibleIds=new Set(rows.map(row=>row.variantId));const initialVariantIds=requested.filter(id=>eligibleIds.has(id));
 const preferenceLabel=preference==="one_way_only"?"One-way containers only":"Any packaging";
 return <div className="min-h-screen bg-slate-50 pb-24 text-slate-950 md:pb-10"><BottomNav active="Accounts"/><main className="mx-auto max-w-4xl px-4 py-5 sm:px-6"><SmartBackLink href={`/accounts/${id}/availability`} className="text-sm font-medium text-slate-500">← Current availability</SmartBackLink><div className="mt-4 flex flex-wrap items-center gap-2"><h1 className="text-3xl font-semibold tracking-tight">Send availability</h1>{preference==="one_way_only"?<span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-600/20">ONE-WAY ONLY</span>:null}</div><p className="mt-2 text-sm text-slate-500">Current Brewery Ops availability with {account.name}’s effective pricing. {preferenceLabel}. {selling.observedAt?`Checked ${relativeTime(selling.observedAt)}.`:"Availability has not been loaded yet."} <Link href={`/accounts/${id}/status`} className="font-semibold text-slate-700 hover:underline">Change preference</Link></p>{requested.length&&!initialVariantIds.length?<p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">The selected products are no longer eligible or available. Choose from the current list below.</p>:null}{selling.lastRefreshError&&selling.rows.length?<p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Showing the last known availability; the latest refresh failed.</p>:null}<div className="mt-6"><QuickPriceEmail accountId={id} accountName={account.name} recipient={recipient} rows={rows} initialVariantIds={initialVariantIds} explicitSelection={requested.length>0} sellarUrl={SELLAR_URL}/></div></main></div>;
}
function relativeTime(value:string){const minutes=Math.max(0,Math.round((Date.now()-new Date(value).getTime())/60000));if(minutes<1)return"just now";if(minutes<60)return`${minutes} minute${minutes===1?"":"s"} ago`;const hours=Math.round(minutes/60);return`${hours} hour${hours===1?"":"s"} ago`}
