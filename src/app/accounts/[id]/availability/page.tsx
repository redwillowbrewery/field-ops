import Link from "next/link";
import {notFound} from "next/navigation";
import {BottomNav} from "@/components/bottom-nav";
import {createSupabaseServerClient} from "@/lib/supabase";
import {getAvailableSellarProducts,type SellarProduct} from "@/lib/sellar";

type Order={id:string;order_date:string};
type Line={order_id:string;product_name:string|null;package_type:string|null;net_after_discount:number|null;quantity:number|null};
type BroadFormat="cask"|"keg"|"can"|"other";
type CanonicalVariant={id:string;broad_format:BroadFormat;package_type:string;volume_litres:number|null;pack_quantity:number|null;source_updated_at:string|null;product:{id:string;name:string}|{id:string;name:string}[]|null};
type SellarMapping={external_id:string;product_variant_id:string};
type AccountPricing={discount:number|null;parent_pricing_account_id:string|null};
type EffectivePrice={list_price:number|string|null;customer_price:number|string|null;pricing_source:string|null;pricing_formula:string|null;effective_discount:number|string|null;price_list_code:string|null};

type ProductCard={product:SellarProduct;variant:CanonicalVariant|null;exactMapped:boolean;pricing:EffectivePrice|null};

export default async function AvailabilityPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{q?:string;format?:string}>}){
 const {id}=await params;
 const {q="",format="all"}=await searchParams;
 const supabase=await createSupabaseServerClient();

 const {data:account}=await supabase.from("accounts").select("id,name,town,postcode").eq("id",id).single();
 if(!account)notFound();

 const {data:orders,error:oErr}=await supabase.from("sales_orders").select("id,order_date").eq("account_id",id).order("order_date",{ascending:false});
 if(oErr)throw oErr;
 const orderRows=(orders||[]) as Order[];
 const orderDate=new Map(orderRows.map(o=>[o.id,o.order_date]));
 const lines:Line[]=[];
 for(let i=0;i<orderRows.length;i+=200){
  const ids=orderRows.slice(i,i+200).map(o=>o.id);
  if(!ids.length)continue;
  const {data,error}=await supabase.from("sales_order_lines").select("order_id,product_name,package_type,net_after_discount,quantity").in("order_id",ids);
  if(error)throw error;
  lines.push(...((data||[]) as Line[]));
 }

 const canonicalVariants:CanonicalVariant[]=[];
 for(let from=0;;from+=1000){
  const {data,error}=await supabase.from("product_variants").select("id,broad_format,package_type,volume_litres,pack_quantity,source_updated_at,product:products(id,name)").eq("allow_sale",true).range(from,from+999);
  if(error)throw error;
  const page=(data||[]) as unknown as CanonicalVariant[];
  canonicalVariants.push(...page);
  if(page.length<1000)break;
 }
 const variantById=new Map(canonicalVariants.map(v=>[v.id,v]));

 let products:SellarProduct[]=[];
 let sellarError:string|null=null;
 try{products=await getAvailableSellarProducts()}catch(e){sellarError=e instanceof Error?e.message:"Sellar unavailable"}

 const sellarVariantMap=new Map<string,string>();
 const sellarIds=[...new Set(products.map(p=>String(p.id)))];
 for(let i=0;i<sellarIds.length;i+=200){
  const batch=sellarIds.slice(i,i+200);
  if(!batch.length)continue;
  const {data,error}=await supabase.from("product_variant_external_ids").select("external_id,product_variant_id").eq("system","sellar").in("external_id",batch);
  if(error)throw error;
  for(const m of (data||[]) as SellarMapping[])sellarVariantMap.set(String(m.external_id),m.product_variant_id);
 }

 const {data:accountPricing,error:pricingErr}=await supabase.from("account_pricing").select("discount,parent_pricing_account_id").eq("account_id",id).maybeSingle();
 if(pricingErr)throw pricingErr;
 const pricingMeta=(accountPricing||null) as AccountPricing|null;

 const term=q.trim().toLowerCase();
 if(term)products=products.filter(p=>[p.name,p.Parent?.name,p.containerType].filter(Boolean).some(v=>String(v).toLowerCase().includes(term)));
 if(format!=="all")products=products.filter(p=>broadSellarFormat(p)===format);
 products.sort((a,b)=>displayBeerName(a).localeCompare(displayBeerName(b))||String(a.name||"").localeCompare(String(b.name||"")));

 const cards:ProductCard[]=[];
 for(const product of products){
  const mappedVariantId=sellarVariantMap.get(String(product.id));
  const variant=(mappedVariantId?variantById.get(mappedVariantId):null)||findCanonicalVariant(product,canonicalVariants);
  let pricing:EffectivePrice|null=null;
  if(variant){
   const {data,error}=await supabase.rpc("effective_customer_variant_price",{p_account_id:id,p_product_variant_id:variant.id});
   if(error)throw error;
   pricing=((data||[])[0]||null) as EffectivePrice|null;
  }
  cards.push({product,variant:variant||null,exactMapped:Boolean(mappedVariantId&&variant),pricing});
 }

 const lastSync=canonicalVariants.map(v=>v.source_updated_at).filter(Boolean).sort().at(-1)||null;
 const discount=pricingMeta?.discount==null?null:Number(pricingMeta.discount)*100;
 const headlinePriceList=cards.map(c=>c.pricing?.price_list_code).find(Boolean)||null;

 return <div className="min-h-screen bg-slate-50 pb-24 text-slate-950 md:pb-10">
  <BottomNav active="Accounts"/>
  <main className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
   <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div>
     <Link href={`/accounts/${id}`} className="text-sm font-medium text-slate-500">← {account.name}</Link>
     <h1 className="mt-3 text-3xl font-semibold tracking-tight">Current availability</h1>
     <p className="mt-2 text-sm text-slate-500">ViewPlan commercial catalogue · Sellar stock{lastSync?` · synced ${dateTime(lastSync)}`:""} · {[account.town,account.postcode].filter(Boolean).join(" · ")}</p>
    </div>
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
     <p className="font-semibold">{headlinePriceList||"Pricing not synced"}{pricingMeta?.parent_pricing_account_id?" · parent pricing available":""}</p>
     <p className="mt-1 text-slate-500">{discount==null?"Run customer pricing sync":`${fmtPct(discount)}% account discount`}</p>
    </div>
   </div>

   <div className="mt-5 flex flex-wrap gap-2">{["all","cask","keg","can"].map(f=><Link key={f} href={filterHref(id,q,f)} className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-inset ${format===f?"bg-slate-950 text-white ring-slate-950":"bg-white text-slate-700 ring-slate-200"}`}>{f==="all"?"All":f[0].toUpperCase()+f.slice(1)}</Link>)}</div>
   <form className="mt-3 flex gap-2"><input type="hidden" name="format" value={format}/><input name="q" defaultValue={q} placeholder="Search beer…" className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-slate-950"/><button className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">Search</button></form>

   {!pricingMeta?<div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">Customer-specific ViewPlan pricing has not been synced for this account</p><p className="mt-1">Run viewplan-customer-pricing-sync.ps1 on the BMS server.</p></div>:null}
   {sellarError?<div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">Live availability unavailable</p><p className="mt-1">{sellarError}. ViewPlan remains the product/pricing source of truth.</p></div>:null}

   <section className="mt-5 space-y-3">{cards.map(({product:p,variant,exactMapped,pricing})=>{
    const customerMatch=findLastPurchase(p,lines,orderDate);
    const list=pricing?.list_price==null?null:Number(pricing.list_price);
    const customer=pricing?.customer_price==null?null:Number(pricing.customer_price);
    const lastPaid=customerMatch&&Number(customerMatch.line.quantity)>0?Number(customerMatch.line.net_after_discount||0)/Number(customerMatch.line.quantity):null;
    const change=customer!=null&&lastPaid!=null?customer-lastPaid:null;
    const image=p.Parent?.imageUrl||p.Parent?.heroImageUrl||p.imageUrl||p.heroImageUrl;
    const canonicalProduct=variant?single(variant.product):null;
    const reason=pricingReason(pricing);
    return <article key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex gap-4">
     {image?<img src={image} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover"/>:null}
     <div className="min-w-0 flex-1">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-lg font-semibold">{displayBeerName(p)}</p><p className="mt-1 text-sm text-slate-500">{formatVariant(p)}{p.Parent?.abv!=null?` · ${p.Parent.abv}% ABV`:""}</p></div><div className="sm:text-right"><p className="text-lg font-semibold">{Number(p.availableStock??p.stock??0)} available</p><p className="text-xs text-slate-400">Sellar live stock</p></div></div>
      {p.Parent?.description?<p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">{p.Parent.description}</p>:null}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><Price label="ViewPlan list" value={list==null?"—":money(list)}/><Price label="Customer price" value={customer==null?"—":money(customer)}/><Price label="Last paid" value={lastPaid==null?"—":money(lastPaid)}/><Price label="Change vs last" value={change==null?"—":changeLabel(change,lastPaid!)}/></div>
      <p className="mt-2 text-xs text-slate-400">{reason}</p>
      {variant?<p className="mt-1 text-xs text-slate-400">{exactMapped?"Sellar ↔ ViewPlan exact map":"Fallback match"}: {canonicalProduct?.name||"Product"} · {variant.package_type}</p>:<p className="mt-2 text-xs text-slate-400">No current ViewPlan canonical variant matched for Sellar ID {p.id}.</p>}
     </div>
    </div></article>
   })}{!cards.length&&!sellarError?<div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No available products match this filter.</div>:null}</section>
  </main>
 </div>
}

function pricingReason(p:EffectivePrice|null){
 if(!p)return"No effective ViewPlan price resolved";
 const source=p.pricing_source||"price list";
 const formula=p.pricing_formula?` · ${p.pricing_formula}`:"";
 const discount=p.effective_discount==null?0:Number(p.effective_discount)*100;
 return `ViewPlan ${source}${formula}${discount?` · ${fmtPct(discount)}% line discount`:""}`;
}
function findCanonicalVariant(p:SellarProduct,variants:CanonicalVariant[]){const beers=sellarBeerCandidates(p);const fmt=broadSellarFormat(p);return variants.filter(v=>{const product=single(v.product);return product&&v.broad_format===fmt&&beers.some(beer=>beerMatch(beer,normBeer(product.name)))}).sort((a,b)=>packageScore(p,b.package_type)-packageScore(p,a.package_type))[0]||null}
function findLastPurchase(p:SellarProduct,lines:Line[],dates:Map<string,string>){const beers=sellarBeerCandidates(p);const fmt=broadSellarFormat(p);return lines.filter(l=>l.product_name&&beers.some(beer=>beerMatch(beer,normBeer(l.product_name||"")))&&broadViewPlanFormat(l.package_type||"")===fmt).map(line=>({line,date:dates.get(line.order_id)||""})).sort((a,b)=>b.date.localeCompare(a.date))[0]||null}
function single<T>(v:T|T[]|null|undefined){return Array.isArray(v)?v[0]||null:v||null}
function packageScore(p:SellarProduct,candidate:string){const c=candidate.toLowerCase();let score=0;const container=String(p.containerType||"").toLowerCase();if(container.includes("ecask")&&c.includes("e-cask"))score+=10;if(container.includes("ekeg")&&c.includes("e-keg"))score+=10;if(container.includes("keykeg")&&c.includes("key keg"))score+=10;if(container.includes("flatbottompin")&&c.includes("flat bottom"))score+=10;if(container.includes("sankey")&&c.includes("keg"))score+=5;if(container==="can"&&c.includes("can"))score+=5;const vol=Number(p.volume);if(vol&&c.includes(String(vol)))score+=4;const pack=Number(p.packQuantity);if(pack>1&&c.includes(String(pack)))score+=2;return score}
function displayBeerName(p:SellarProduct){return String(p.Parent?.name||variantBaseName(p.name)||p.name||"").trim()}
function variantBaseName(v?:string){return String(v||"").split("•")[0].trim().replace(/\s+-\s+(?:\d+\s*[lL]|\d+x\s*\d+\s*ml).*$/i,"").trim()}
function sellarBeerCandidates(p:SellarProduct){const values=[p.Parent?.name,variantBaseName(p.name),p.name].filter(Boolean).map(v=>normBeer(String(v)));return [...new Set(values.filter(Boolean))]}
function broadSellarFormat(p:SellarProduct):BroadFormat{const c=String(p.containerType||"").toLowerCase();if(c==="can")return"can";if(c.includes("cask")||c.includes("pin")||c.includes("firkin"))return"cask";if(c.includes("keg")||c.includes("sankey"))return"keg";return"other"}
function broadViewPlanFormat(v:string):BroadFormat{const c=v.toLowerCase();if(c.includes("can"))return"can";if(c.includes("cask")||c.includes("firkin")||c.includes("pin"))return"cask";if(c.includes("keg")||c.includes("litre steel")||c.includes("liter steel"))return"keg";return"other"}
function normBeer(v:string){return v.toLowerCase().replace(/^f\d+\s*-\s*/i,"").replace(/\b\d+(?:\.\d+)?\s*%\s*(?:abv)?\b/g,"").replace(/\(\s*(?:gf|ve|vegan|gluten\s*free)\s*\)/g,"").replace(/\b20\d{2}\b/g,"").replace(/\b(?:\d+\s*x\s*\d+\s*ml|\d+\s*l(?:itre)?|e[- ]?cask|e[- ]?keg|firkin|pin|key\s*keg|sankey\s*keg|cans?)\b/g,"").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim()}
function beerMatch(a:string,b:string){if(!a||!b)return false;if(a===b)return true;if(a.length>4&&b.length>4&&(a.includes(b)||b.includes(a)))return true;const aw=a.split(" "),bw=b.split(" ");const overlap=aw.filter(w=>w.length>2&&bw.includes(w));return overlap.length>=Math.min(2,Math.min(aw.length,bw.length))||aliases(a,b)}
function aliases(a:string,b:string){return(a.includes("weightless")&&b.includes("weightless"))||(a.includes("nz pils")&&b.includes("nz pils"))||(a.includes("less is more mosaic")&&b.includes("less is more mosaic"))}
function formatVariant(p:SellarProduct){const c=String(p.containerType||"");const vol=p.volume,pack=p.packQuantity;return[pack&&pack>1?`${pack} ×`:null,vol?`${vol}${c.toLowerCase()==="can"?"ml":"L"}`:null,c].filter(Boolean).join(" ")||p.name||"Product"}
function filterHref(id:string,q:string,format:string){const s=new URLSearchParams();if(q)s.set("q",q);s.set("format",format);return`/accounts/${id}/availability?${s.toString()}`}
function money(v:number){return new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP",minimumFractionDigits:2,maximumFractionDigits:2}).format(v)}
function fmtPct(v:number){return Number.isInteger(v)?String(v):v.toFixed(2).replace(/0+$/g,"").replace(/\.$/,"")}
function dateTime(v:string){return new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(v))}
function changeLabel(change:number,last:number){if(Math.abs(change)<0.005)return"Same price";const pct=last?Math.abs(change/last*100):0;return`${change>0?"+":"−"}${money(Math.abs(change))}${last?` (${pct.toFixed(1)}%)`:""}`}
function Price({label,value}:{label:string;value:string}){return <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 font-semibold">{value}</p></div>}
