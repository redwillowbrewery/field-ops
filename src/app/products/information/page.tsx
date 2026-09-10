import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {effectiveProductInformation,type InformationFields} from "@/lib/product-information";
import {ProductInformationDetails} from "@/components/product-information-details";
import {saveInformation} from "./actions";
import {Submit} from "@/app/take-off/submit";
export const dynamic="force-dynamic";
const field="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2";
export default async function Page({searchParams}:{searchParams:Promise<{product?:string;package?:string;saved?:string;error?:string}>}){
 const q=await searchParams;const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login");
 const [catalogue,packages,role]=await Promise.all([
  db.from("products").select("id,name").eq("active",true).eq("business_exchange",false).order("name"),
  db.from("packages").select("id,name").eq("active",true).order("name"),db.rpc("has_capability",{p_capability:"product_edit"})
 ]);
 if(catalogue.error||packages.error||role.error)throw new Error("Product information is unavailable");
 const product=catalogue.data.find(p=>p.id===q.product)||catalogue.data[0];
 if(product){const {data:workspace,error:workspaceError}=await db.from("product_workspaces").select("product_id").eq("product_id",product.id).maybeSingle();if(workspaceError)throw new Error("Product workspace unavailable");if(workspace)redirect("/products?product="+encodeURIComponent(product.id));}
 const pkg=packages.data.find(p=>p.id===q.package);
 const [base,override]=product?await Promise.all([
  db.from("product_information").select("product_id,details,revision,updated_at").eq("product_id",product.id).maybeSingle(),
  pkg?db.from("product_package_information").select("product_id,package_id,details,revision,updated_at").eq("product_id",product.id).eq("package_id",pkg.id).maybeSingle():Promise.resolve({data:null,error:null})
 ]):[{data:null,error:null},{data:null,error:null}];
 if(base.error||override.error)throw new Error("Product information is unavailable");
 const record=pkg?override.data:base.data;const details:InformationFields=record?.details||{};
 const effective=effectiveProductInformation({products:base.data?[base.data]:[],packages:override.data?[override.data]:[]},product?.id||"",pkg?.id);
 const value=(key:keyof InformationFields)=>!(key in details)?(pkg?"inherit":"unknown"):details[key]===null?"unknown":details[key]===true?"yes":details[key]===false?"no":String(details[key]);
 return <main className="mx-auto max-w-4xl p-4 pb-12 sm:p-8">
  <Link href="/sales" className="text-sm underline">← Sales workspace</Link><h1 className="mt-4 text-3xl font-semibold">Product information</h1>
  <p className="mt-2 text-sm text-slate-600">Confirmed allergens, dietary suitability and fining details for customer price lists. Beer defaults apply unless a packaging format overrides them. Unknown is never treated as allergen-free, vegan or unfined.</p>
  {q.error&&<p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-red-900">{q.error}</p>}
  {q.saved&&<p role="status" className="mt-4 text-green-800">Product information saved.</p>}
  <form className="my-6 grid gap-3 sm:grid-cols-2"><label>Beer<select name="product" className={field} defaultValue={product?.id}>{catalogue.data.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Applies to<select name="package" className={field} defaultValue={pkg?.id||""}><option value="">Beer defaults</option>{packages.data.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button className="rounded-lg border px-4 py-2 sm:col-span-2">Open information</button></form>
  {product&&<section className="rounded-xl border bg-white p-5"><h2 className="text-xl font-semibold">{product.name} · {pkg?.name||"Beer defaults"}</h2>
   <div className="my-4 rounded-xl bg-slate-50 p-3"><h3 className="text-sm font-semibold">Effective information</h3><ProductInformationDetails information={effective}/></div>
   {role.data===true?<form key={product.id+(pkg?.id||"")+record?.revision} action={saveInformation} className="grid gap-4 sm:grid-cols-2">
    <input type="hidden" name="product" value={product.id}/><input type="hidden" name="package" value={pkg?.id||""}/><input type="hidden" name="revision" value={record?.revision||0}/>
    <label>Allergen information<select name="allergen_mode" defaultValue={!("allergens" in details)&&pkg?"inherit":details.allergens?"statement":"unknown"} className={field}>{pkg&&<option value="inherit">Use beer default</option>}<option value="unknown">Not confirmed</option><option value="statement">Confirmed statement below</option></select></label>
    <label>Confirmed allergen statement<textarea name="allergens" maxLength={1000} defaultValue={details.allergens||""} className={field} placeholder="Enter the confirmed declaration, including any may-contain advice."/></label>
    {(["vegan","gluten_free","lactose_free","fining_status"] as const).map(key=><label key={key}>{({vegan:"Vegan",gluten_free:"Gluten-free",lactose_free:"Lactose-free",fining_status:"Fining"})[key]}<select name={key} defaultValue={value(key)} className={field}>{pkg&&<option value="inherit">Use beer default</option>}<option value="unknown">Not confirmed</option>{key==="fining_status"?<><option value="fined">Fined</option><option value="unfined">Unfined</option></>:<><option value="yes">Yes</option><option value="no">No</option></>}</select></label>)}
    <p className="text-xs text-slate-600 sm:col-span-2">These are separate facts: gluten-free does not establish an allergen declaration, lactose-free does not mean milk-allergen-free, and vegan does not establish whether a beer is fined. Only publish confirmed information.</p>
    <Submit>Confirm and save information</Submit>
   </form>:<p className="text-sm text-slate-600">The Head Brewer can confirm or change this information.</p>}
   {record?.updated_at&&<p className="mt-4 text-xs text-slate-500">Last confirmed {new Date(record.updated_at).toLocaleString("en-GB",{timeZone:"Europe/London"})} (UK time).</p>}
  </section>}
 </main>;
}
