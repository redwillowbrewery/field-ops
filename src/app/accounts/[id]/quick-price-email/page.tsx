import Link from "next/link";
import { notFound } from "next/navigation";
import { BottomNav } from "@/components/bottom-nav";
import { createSupabaseServerClient } from "@/lib/supabase";
import { getAvailableSellarProducts,type SellarProduct } from "@/lib/sellar";
import { QuickPriceEmail } from "./quick-price-email";

type PriceRow={product_id:string;product_name:string;product_variant_id:string;package_type:string;broad_format:string;list_price:number|null;customer_price:number|null};
type SellarMapping={external_id:string;product_variant_id:string};
const SELLAR_URL="https://app.sellar.io/suppliers/redwillow/order?storefrontLink=Ds5MPMEKcZudPVZ";

export default async function QuickPriceEmailPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;const supabase=await createSupabaseServerClient();
 const {data:account}=await supabase.from("accounts").select("id,name,email,container_preference,contacts(id,email,is_primary,active)").eq("id",id).single();if(!account)notFound();
 const contacts=[...(account.contacts||[])].filter(c=>c.active!==false&&c.email);const recipient=(contacts.find(c=>c.is_primary)?.email||contacts[0]?.email||account.email||"") as string;
 const preference=(account.container_preference||"any") as "any"|"one_way_only";
 const {data,error}=await supabase.rpc("customer_effective_price_list",{p_account_id:id});if(error)throw error;let prices=(data||[]) as PriceRow[];
 const pricedVariantIds=new Set(prices.map(r=>r.product_variant_id));
 let sellar:SellarProduct[]=[];try{sellar=await getAvailableSellarProducts()}catch{}
 const sellarIds=[...new Set(sellar.map(p=>String(p.id)))];const map=new Map<string,string>();for(let i=0;i<sellarIds.length;i+=200){const batch=sellarIds.slice(i,i+200);if(!batch.length)continue;const {data:m,error:mErr}=await supabase.from("product_variant_external_ids").select("external_id,product_variant_id").eq("system","sellar").in("external_id",batch);if(mErr)throw mErr;for(const row of (m||[]) as SellarMapping[])map.set(String(row.external_id),row.product_variant_id)}
 const available=new Map<string,SellarProduct>();for(const product of sellar){const mappedVariantId=map.get(String(product.id));if(!mappedVariantId||!pricedVariantIds.has(mappedVariantId))continue;if(!available.has(mappedVariantId))available.set(mappedVariantId,product)}
 prices=prices.filter(r=>available.has(r.product_variant_id)&&["cask","keg","can"].includes(r.broad_format));
 if(preference==="one_way_only")prices=prices.filter(r=>r.broad_format==="can"||isOneWayPackage(r.package_type));
 const rows=prices.map(r=>{const p=available.get(r.product_variant_id);return{format:r.broad_format as "cask"|"keg"|"can",packageType:salesPackageLabel(r.package_type),name:r.product_name,description:String(p?.Parent?.description||"").replace(/\s+/g," ").trim(),price:Number(r.customer_price??r.list_price??0)}}).filter(r=>r.price>0).sort((a,b)=>a.format.localeCompare(b.format)||a.name.localeCompare(b.name)||a.packageType.localeCompare(b.packageType));
 const preferenceLabel=preference==="one_way_only"?"One-way containers only":"Any packaging";
 return <div className="min-h-screen bg-slate-50 pb-24 text-slate-950 md:pb-10"><BottomNav active="Accounts"/><main className="mx-auto max-w-4xl px-4 py-5 sm:px-6"><Link href={`/accounts/${id}`} className="text-sm font-medium text-slate-500">← {account.name}</Link><div className="mt-4 flex flex-wrap items-center gap-2"><h1 className="text-3xl font-semibold tracking-tight">Quick price email</h1>{preference==="one_way_only"?<span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-600/20">ONE-WAY ONLY</span>:null}</div><p className="mt-2 text-sm text-slate-500">A simple current availability list with this customer’s ViewPlan pricing. {preferenceLabel}. <Link href={`/accounts/${id}/status`} className="font-semibold text-slate-700 hover:underline">Change preference</Link></p><div className="mt-6"><QuickPriceEmail accountId={id} accountName={account.name} recipient={recipient} rows={rows} sellarUrl={SELLAR_URL}/></div></main></div>;
}

function isOneWayPackage(packageType:string){const p=packageType.toLowerCase().replace(/\s+/g," ").trim();return p.includes("e-cask")||p.includes("e-keg")||p.includes("e-key")||p.includes("key keg")||p.includes("keykeg");}
function salesPackageLabel(packageType:string){const p=packageType.trim();if(/e-cask/i.test(p))return"E-Cask";if(/e-keg/i.test(p))return"E-Keg";if(/e-key/i.test(p))return"E-Key";if(/key\s*keg/i.test(p))return"Key Keg";if(/firkin/i.test(p))return"Cask";if(/pin/i.test(p))return"Pin";if(/30\s*litre\s*steel/i.test(p))return"30L Keg";if(/50\s*litre\s*keg/i.test(p))return"50L Keg";return p;}
