import Link from "next/link";
import { notFound } from "next/navigation";
import { BottomNav } from "@/components/bottom-nav";
import { createSupabaseServerClient } from "@/lib/supabase";
import { getAvailableSellarProducts,type SellarProduct } from "@/lib/sellar";
import { QuickPriceEmail } from "./quick-price-email";

type BroadFormat="cask"|"keg"|"can"|"other";
type PriceRow={product_id:string;product_name:string;product_variant_id:string;package_type:string;broad_format:string;list_price:number|null;customer_price:number|null};
type SellarMapping={external_id:string;product_variant_id:string};
type CanonicalVariant={id:string;product_id:string;product_name:string;package_type:string;broad_format:BroadFormat};
const SELLAR_URL="https://app.sellar.io/suppliers/redwillow/order?storefrontLink=Ds5MPMEKcZudPVZ";

export default async function QuickPriceEmailPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;const supabase=await createSupabaseServerClient();
 const {data:account}=await supabase.from("accounts").select("id,name,email,contacts(id,email,is_primary,active)").eq("id",id).single();if(!account)notFound();
 const contacts=[...(account.contacts||[])].filter(c=>c.active!==false&&c.email);const recipient=(contacts.find(c=>c.is_primary)?.email||contacts[0]?.email||account.email||"") as string;
 const {data,error}=await supabase.rpc("customer_effective_price_list",{p_account_id:id});if(error)throw error;let prices=(data||[]) as PriceRow[];
 const canonical:CanonicalVariant[]=prices.map(r=>({id:r.product_variant_id,product_id:r.product_id,product_name:r.product_name,package_type:r.package_type,broad_format:r.broad_format as BroadFormat}));const byId=new Map(canonical.map(v=>[v.id,v]));
 let sellar:SellarProduct[]=[];try{sellar=await getAvailableSellarProducts()}catch{}
 const sellarIds=[...new Set(sellar.map(p=>String(p.id)))];const map=new Map<string,string>();for(let i=0;i<sellarIds.length;i+=200){const batch=sellarIds.slice(i,i+200);const {data:m}=await supabase.from("product_variant_external_ids").select("external_id,product_variant_id").eq("system","sellar").in("external_id",batch);for(const row of (m||[]) as SellarMapping[])map.set(String(row.external_id),row.product_variant_id)}
 const available=new Map<string,SellarProduct>();for(const product of sellar){const exact=map.get(String(product.id));const variant=(exact?byId.get(exact):null)||findCanonicalVariant(product,canonical);if(variant&&!available.has(variant.id))available.set(variant.id,product)}
 prices=prices.filter(r=>available.has(r.product_variant_id)&&["cask","keg","can"].includes(r.broad_format));
 const rows=prices.map(r=>{const p=available.get(r.product_variant_id);return{format:r.broad_format as "cask"|"keg"|"can",name:r.product_name,description:String(p?.Parent?.description||"").replace(/\s+/g," ").trim(),price:Number(r.customer_price??r.list_price??0)}}).filter(r=>r.price>0).sort((a,b)=>a.format.localeCompare(b.format)||a.name.localeCompare(b.name));
 return <div className="min-h-screen bg-slate-50 pb-24 text-slate-950 md:pb-10"><BottomNav active="Accounts"/><main className="mx-auto max-w-4xl px-4 py-5 sm:px-6"><Link href={`/accounts/${id}`} className="text-sm font-medium text-slate-500">← {account.name}</Link><h1 className="mt-4 text-3xl font-semibold tracking-tight">Quick price email</h1><p className="mt-2 text-sm text-slate-500">A simple current availability list with this customer’s ViewPlan pricing.</p><div className="mt-6"><QuickPriceEmail accountId={id} accountName={account.name} recipient={recipient} rows={rows} sellarUrl={SELLAR_URL}/></div></main></div>;
}
function findCanonicalVariant(p:SellarProduct,variants:CanonicalVariant[]){const beers=sellarBeerCandidates(p);const fmt=broadSellarFormat(p);return variants.filter(v=>v.broad_format===fmt&&beers.some(beer=>beerMatch(beer,normBeer(v.product_name)))).sort((a,b)=>packageScore(p,b.package_type)-packageScore(p,a.package_type))[0]||null}
function packageScore(p:SellarProduct,candidate:string){const c=candidate.toLowerCase();let score=0;const container=String(p.containerType||"").toLowerCase();if(container.includes("ecask")&&c.includes("e-cask"))score+=10;if(container.includes("ekeg")&&c.includes("e-keg"))score+=10;if(container.includes("keykeg")&&c.includes("key keg"))score+=10;if(container.includes("flatbottompin")&&c.includes("flat bottom"))score+=10;if(container.includes("sankey")&&c.includes("keg"))score+=5;if(container==="can"&&c.includes("can"))score+=5;const vol=Number(p.volume);if(vol&&c.includes(String(vol)))score+=4;const pack=Number(p.packQuantity);if(pack>1&&c.includes(String(pack)))score+=2;return score}
function variantBaseName(v?:string){return String(v||"").split("•")[0].trim().replace(/\s+-\s+(?:\d+\s*[lL]|\d+x\s*\d+\s*ml).*$/i,"").trim()}
function sellarBeerCandidates(p:SellarProduct){const values=[p.Parent?.name,variantBaseName(p.name),p.name].filter(Boolean).map(v=>normBeer(String(v)));return [...new Set(values.filter(Boolean))]}
function broadSellarFormat(p:SellarProduct):BroadFormat{const c=String(p.containerType||"").toLowerCase();if(c==="can")return"can";if(c.includes("cask")||c.includes("pin")||c.includes("firkin"))return"cask";if(c.includes("keg")||c.includes("sankey"))return"keg";return"other"}
function normBeer(v:string){return v.toLowerCase().replace(/^f\d+\s*-\s*/i,"").replace(/\b\d+(?:\.\d+)?\s*%\s*(?:abv)?\b/g,"").replace(/\(\s*(?:gf|ve|vegan|gluten\s*free)\s*\)/g,"").replace(/\b20\d{2}\b/g,"").replace(/\b(?:\d+\s*x\s*\d+\s*ml|\d+\s*l(?:itre)?|e[- ]?cask|e[- ]?keg|firkin|pin|key\s*keg|sankey\s*keg|cans?)\b/g,"").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim()}
function beerMatch(a:string,b:string){if(!a||!b)return false;if(a===b)return true;if(a.length>4&&b.length>4&&(a.includes(b)||b.includes(a)))return true;return false}
