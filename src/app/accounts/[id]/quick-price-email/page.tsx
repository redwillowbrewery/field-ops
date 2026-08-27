import Link from "next/link";
import { notFound } from "next/navigation";
import { BottomNav } from "@/components/bottom-nav";
import { createSupabaseServerClient } from "@/lib/supabase";
import { getAvailableSellarProducts,type SellarProduct } from "@/lib/sellar";
import {packageAllowedForAccount,packageSalesLabel,type AccountContainerPreference,type CanonicalPackage} from "@/lib/package-eligibility";
import { QuickPriceEmail } from "./quick-price-email";

type PriceRow={product_id:string;product_name:string;product_variant_id:string;package_type:string;broad_format:string;list_price:number|null;customer_price:number|null};
type SellarMapping={external_id:string;product_variant_id:string};
type VariantPackageRow={id:string;package:CanonicalPackage|CanonicalPackage[]|null};
const SELLAR_URL="https://app.sellar.io/suppliers/redwillow/order?storefrontLink=Ds5MPMEKcZudPVZ";

export default async function QuickPriceEmailPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;const supabase=await createSupabaseServerClient();
 const {data:account}=await supabase.from("accounts").select("id,name,email,container_preference,contacts(id,email,is_primary,active)").eq("id",id).single();if(!account)notFound();
 const contacts=[...(account.contacts||[])].filter(c=>c.active!==false&&c.email);const recipient=(contacts.find(c=>c.is_primary)?.email||contacts[0]?.email||account.email||"") as string;
 const preference=(account.container_preference||"any") as AccountContainerPreference;
 const {data,error}=await supabase.rpc("customer_effective_price_list",{p_account_id:id});if(error)throw error;let prices=(data||[]) as PriceRow[];
 const pricedVariantIds=[...new Set(prices.map(r=>r.product_variant_id))];
 const packageByVariant=new Map<string,CanonicalPackage>();
 for(let i=0;i<pricedVariantIds.length;i+=200){
  const ids=pricedVariantIds.slice(i,i+200);if(!ids.length)continue;
  const {data:variants,error:variantErr}=await supabase.from("product_variants").select("id,package:packages(id,name,broad_format,package_system,lifecycle,procurement_mode)").in("id",ids);
  if(variantErr)throw variantErr;
  for(const row of (variants||[]) as unknown as VariantPackageRow[]){const pkg=single(row.package);if(pkg)packageByVariant.set(row.id,pkg)}
 }
 let sellar:SellarProduct[]=[];try{sellar=await getAvailableSellarProducts()}catch{}
 const sellarIds=[...new Set(sellar.map(p=>String(p.id)))];const map=new Map<string,string>();for(let i=0;i<sellarIds.length;i+=200){const batch=sellarIds.slice(i,i+200);if(!batch.length)continue;const {data:m,error:mErr}=await supabase.from("product_variant_external_ids").select("external_id,product_variant_id").eq("system","sellar").in("external_id",batch);if(mErr)throw mErr;for(const row of (m||[]) as SellarMapping[])map.set(String(row.external_id),row.product_variant_id)}
 const available=new Map<string,SellarProduct>();for(const product of sellar){const mappedVariantId=map.get(String(product.id));if(!mappedVariantId||!packageByVariant.has(mappedVariantId))continue;if(!available.has(mappedVariantId))available.set(mappedVariantId,product)}
 prices=prices.filter(r=>available.has(r.product_variant_id)&&packageAllowedForAccount(packageByVariant.get(r.product_variant_id),preference));
 const rows=prices.map(r=>{const p=available.get(r.product_variant_id);const pkg=packageByVariant.get(r.product_variant_id);const format=(pkg?.broad_format||r.broad_format) as "cask"|"keg"|"can";return{format,packageType:packageSalesLabel(pkg,r.package_type),name:r.product_name,description:String(p?.Parent?.description||"").replace(/\s+/g," ").trim(),price:Number(r.customer_price??r.list_price??0)}}).filter(r=>["cask","keg","can"].includes(r.format)&&r.price>0).sort((a,b)=>a.format.localeCompare(b.format)||a.name.localeCompare(b.name)||a.packageType.localeCompare(b.packageType));
 const preferenceLabel=preference==="one_way_only"?"One-way containers only":"Any packaging";
 return <div className="min-h-screen bg-slate-50 pb-24 text-slate-950 md:pb-10"><BottomNav active="Accounts"/><main className="mx-auto max-w-4xl px-4 py-5 sm:px-6"><Link href={`/accounts/${id}`} className="text-sm font-medium text-slate-500">← {account.name}</Link><div className="mt-4 flex flex-wrap items-center gap-2"><h1 className="text-3xl font-semibold tracking-tight">Quick price email</h1>{preference==="one_way_only"?<span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-600/20">ONE-WAY ONLY</span>:null}</div><p className="mt-2 text-sm text-slate-500">A simple current availability list with this customer’s ViewPlan pricing. {preferenceLabel}. <Link href={`/accounts/${id}/status`} className="font-semibold text-slate-700 hover:underline">Change preference</Link></p><div className="mt-6"><QuickPriceEmail accountId={id} accountName={account.name} recipient={recipient} rows={rows} sellarUrl={SELLAR_URL}/></div></main></div>;
}

function single<T>(v:T|T[]|null|undefined){return Array.isArray(v)?v[0]||null:v||null}
