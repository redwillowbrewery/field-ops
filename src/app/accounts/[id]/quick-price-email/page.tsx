import Link from "next/link";
import { notFound } from "next/navigation";
import { BottomNav } from "@/components/bottom-nav";
import { createSupabaseServerClient } from "@/lib/supabase";
import { getAvailableSellarProducts,type SellarProduct } from "@/lib/sellar";
import {packageAllowedForAccount,packageSalesLabel,type AccountContainerPreference,type CanonicalPackage} from "@/lib/package-eligibility";
import { QuickPriceEmail } from "./quick-price-email";

type SellarMapping={external_id:string;product_variant_id:string};
type CanonicalVariant={id:string;package_type:string;broad_format:string;product:{id:string;name:string}|{id:string;name:string}[]|null;package:CanonicalPackage|CanonicalPackage[]|null};
type EffectivePrice={list_price:number|string|null;customer_price:number|string|null};
const SELLAR_URL="https://app.sellar.io/suppliers/redwillow/order?storefrontLink=Ds5MPMEKcZudPVZ";

export default async function QuickPriceEmailPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;const supabase=await createSupabaseServerClient();
 const {data:account}=await supabase.from("accounts").select("id,name,email,container_preference,contacts(id,email,is_primary,active)").eq("id",id).single();if(!account)notFound();
 const contacts=[...(account.contacts||[])].filter(c=>c.active!==false&&c.email);const recipient=(contacts.find(c=>c.is_primary)?.email||contacts[0]?.email||account.email||"") as string;
 const preference=(account.container_preference||"any") as AccountContainerPreference;

 // Match Availability exactly: Sellar establishes live stock, exact mapping identifies the canonical variant,
 // canonical package rules decide eligibility, then ViewPlan resolves the effective customer price.
 let sellar:SellarProduct[]=[];try{sellar=await getAvailableSellarProducts()}catch{}
 const sellarIds=[...new Set(sellar.map(p=>String(p.id)))];
 const sellarVariantMap=new Map<string,string>();
 for(let i=0;i<sellarIds.length;i+=200){
  const batch=sellarIds.slice(i,i+200);if(!batch.length)continue;
  const {data:m,error:mErr}=await supabase.from("product_variant_external_ids").select("external_id,product_variant_id").eq("system","sellar").in("external_id",batch);if(mErr)throw mErr;
  for(const row of (m||[]) as SellarMapping[])sellarVariantMap.set(String(row.external_id),row.product_variant_id);
 }

 const mappedVariantIds=[...new Set([...sellarVariantMap.values()])];
 const variantById=new Map<string,CanonicalVariant>();
 for(let i=0;i<mappedVariantIds.length;i+=200){
  const ids=mappedVariantIds.slice(i,i+200);if(!ids.length)continue;
  const {data:variants,error:variantErr}=await supabase.from("product_variants").select("id,package_type,broad_format,product:products(id,name),package:packages(id,name,broad_format,package_system,lifecycle,procurement_mode)").eq("allow_sale",true).in("id",ids);
  if(variantErr)throw variantErr;
  for(const row of (variants||[]) as unknown as CanonicalVariant[])variantById.set(row.id,row);
 }

 const rows=[] as {format:"cask"|"keg"|"can";packageType:string;name:string;description:string;price:number}[];
 const seen=new Set<string>();
 for(const product of sellar){
  const variantId=sellarVariantMap.get(String(product.id));if(!variantId||seen.has(variantId))continue;
  const variant=variantById.get(variantId);if(!variant)continue;
  const pkg=single(variant.package);if(!packageAllowedForAccount(pkg,preference))continue;
  const format=(pkg?.broad_format||variant.broad_format) as "cask"|"keg"|"can";
  if(!["cask","keg","can"].includes(format))continue;
  const {data:priceData,error:priceErr}=await supabase.rpc("effective_customer_variant_price",{p_account_id:id,p_product_variant_id:variant.id});if(priceErr)throw priceErr;
  const pricing=((priceData||[])[0]||null) as EffectivePrice|null;
  const price=Number(pricing?.customer_price??pricing?.list_price??0);if(!(price>0))continue;
  const canonicalProduct=single(variant.product);
  rows.push({format,packageType:packageSalesLabel(pkg,variant.package_type),name:canonicalProduct?.name||String(product.Parent?.name||product.name||"Product"),description:String(product.Parent?.description||"").replace(/\s+/g," ").trim(),price});
  seen.add(variantId);
 }
 rows.sort((a,b)=>a.format.localeCompare(b.format)||a.name.localeCompare(b.name)||a.packageType.localeCompare(b.packageType));

 const preferenceLabel=preference==="one_way_only"?"One-way containers only":"Any packaging";
 return <div className="min-h-screen bg-slate-50 pb-24 text-slate-950 md:pb-10"><BottomNav active="Accounts"/><main className="mx-auto max-w-4xl px-4 py-5 sm:px-6"><Link href={`/accounts/${id}`} className="text-sm font-medium text-slate-500">← {account.name}</Link><div className="mt-4 flex flex-wrap items-center gap-2"><h1 className="text-3xl font-semibold tracking-tight">Quick price email</h1>{preference==="one_way_only"?<span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-600/20">ONE-WAY ONLY</span>:null}</div><p className="mt-2 text-sm text-slate-500">A simple current availability list with this customer’s ViewPlan pricing. {preferenceLabel}. <Link href={`/accounts/${id}/status`} className="font-semibold text-slate-700 hover:underline">Change preference</Link></p><div className="mt-6"><QuickPriceEmail accountId={id} accountName={account.name} recipient={recipient} rows={rows} sellarUrl={SELLAR_URL}/></div></main></div>;
}

function single<T>(v:T|T[]|null|undefined){return Array.isArray(v)?v[0]||null:v||null}
