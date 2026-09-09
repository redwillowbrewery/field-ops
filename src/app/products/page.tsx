/* eslint-disable @next/next/no-img-element -- Private signed preview assets bypass the shared image optimiser. */
import {ProductDraftGuard} from "./draft-guard";
import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {Submit} from "@/app/take-off/submit";
import {startProduct,saveProduct,publishProduct,saveFormulation,approveFormulation,saveLaunchTask,uploadArtwork,linkViewPlan,adoptArtwork,duplicateProduct,restorePublication} from "./actions";
export const dynamic="force-dynamic";
type Family={fining:"fined"|"unfined"|null;vegan:boolean|null;allergens_override:boolean;allergens:string|null};
type Draft={name:string;type:string;description:string;abv:number|null;artwork_path:string|null;allergens:string|null;gluten_free:boolean|null;lactose_free:boolean|null;cask:Family;keg_can:Family};
const input="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-950";
function Choice({name,label,value}:{name:string;label:string;value:boolean|null}){return <label>{label}<select className={input} name={name} defaultValue={value===true?"yes":value===false?"no":""}><option value="">Not confirmed</option><option value="yes">Yes</option><option value="no">No</option></select></label>}
function Hidden({product,revision}:{product:string;revision:number}){return <><input type="hidden" name="product" value={product}/><input type="hidden" name="revision" value={revision}/></>}
export default async function Products({searchParams}:{searchParams:Promise<{product?:string;error?:string;saved?:string;q?:string}>}){
 const q=await searchParams;const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login");
 const [catalogue,role]=await Promise.all([db.from("products").select("id,name,active").eq("business_exchange",false).order("name").limit(1000),db.rpc("take_off_is_approver")]);
 if(catalogue.error||role.error)throw new Error("Product workspace unavailable");
 const editor=role.data===true;
 const [unmapped,packageNames]=await Promise.all([db.from("product_source_observations").select("external_id,source_name").is("product_id",null).eq("present_in_latest",true).eq("source_is_system",false).eq("source_business_exchange",false).order("source_name").limit(1000),db.from("packages").select("id,name").order("name")]);
 if(unmapped.error||packageNames.error)throw new Error("Product reference data unavailable");
 const selected=q.product?catalogue.data.find(p=>p.id===q.product):null;
 const [workspace,sources,recipes,tasks,publications]=selected?await Promise.all([
 db.from("product_workspaces").select("*").eq("product_id",selected.id).maybeSingle(),
 db.from("product_source_observations").select("external_id,source_name,label_text,source_vegan,observed_at,present_in_latest").eq("product_id",selected.id),
 db.from("product_formulations").select("*").eq("product_id",selected.id).order("revision",{ascending:false}),
 db.from("product_launch_tasks").select("*").eq("product_id",selected.id).order("title"),
 db.from("product_publications").select("revision,published_at,specification").eq("product_id",selected.id).order("revision",{ascending:false})
 ]):[null,null,null,null,null];
 if([workspace,sources,recipes,tasks,publications].some(r=>r?.error))throw new Error("Product details unavailable");
 const w=workspace?.data;const d=w?.draft as Draft|undefined;const latest=recipes?.data?.[0];
 const visible=catalogue.data.filter(p=>!q.q||p.name.toLowerCase().includes(q.q.toLowerCase()));
 const preview=d?.artwork_path?await db.storage.from("product-artwork").createSignedUrl(d.artwork_path,300):null;
 const recipeFiles=new Map(await Promise.all((recipes?.data||[]).filter(r=>r.attachment_path).map(async r=>{const {data}=await db.storage.from("product-formulations").createSignedUrl(r.attachment_path,300);return [r.revision,data?.signedUrl] as const;})));
 const pending=tasks?.data?.filter(t=>t.required&&!t.complete).length||0;
 return <main className="mx-auto max-w-5xl space-y-6 p-4 pb-16 sm:p-8">
 <Link href="/sales" className="underline">← Sales workspace</Link>
 <header><h1 className="text-3xl font-semibold">Products</h1><p className="mt-2 text-slate-600">Prepare a beer, review its information and track what remains for launch. Saved drafts are separate from published information.</p></header>
 {q.error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-red-900">{q.error}</p>}
 {q.saved&&<p role="status" className="text-green-800">Saved.</p>}
 <div className="grid gap-5 sm:grid-cols-2">
 <form className="rounded-xl border p-4"><h2 className="font-semibold">Open a beer</h2><label>Beer<select name="product" className={input} defaultValue={selected?.id||""}><option value="">Choose a beer</option>{visible.map(p=><option value={p.id} key={p.id}>{p.name}{p.active?"":" · inactive / draft"}</option>)}</select></label><button className="mt-3 rounded-lg border px-4 py-2">Open</button></form>
 {editor&&<form action={startProduct} className="rounded-xl border p-4"><h2 className="font-semibold">Create a beer</h2><label>Working name<input name="name" required maxLength={200} className={input}/></label><p className="my-2 text-sm text-slate-600">Start with a name. Add artwork, formulation and launch information when ready.</p><Submit>Create draft beer</Submit></form>}
 </div>
 {selected&&!w&&<section className="rounded-xl border p-5"><h2 className="text-xl font-semibold">{selected.name}</h2><p className="my-3">Bring existing information into a draft for review. Current customer information stays unchanged.</p>{editor&&<form action={startProduct}><input type="hidden" name="product" value={selected.id}/><Submit>Prepare Product draft</Submit></form>}</section>}
 {selected&&w&&d&&<>
 <section className="rounded-xl border p-5"><h2 className="text-2xl font-semibold">{d.name}</h2><p className="mt-2 text-sm">Draft revision {w.revision} · {w.published_revision?"Published revision "+w.published_revision:"Not yet published"} · {pending?pending+" required launch tasks outstanding":"All required launch tasks complete"}</p>
 {preview?.data?.signedUrl&&<figure className="mt-4"><img src={preview.data.signedUrl} alt={d.name+" draft artwork"} className="max-h-64 max-w-full rounded-lg object-contain"/><figcaption className="text-xs text-slate-600">Saved draft artwork</figcaption></figure>}
 <details className="my-4 rounded-lg bg-slate-50 p-3"><summary className="cursor-pointer font-semibold">Source and existing information to review</summary>
 <p className="my-2 text-sm">Keep ingredient allergens separate from cask-specific wording. A gluten-free claim is not a complete allergen declaration. Conflicting values require review.</p>
 {sources?.data?.map(s=><div key={s.external_id} className="my-3 border-t pt-2"><p>{s.source_name} · ViewPlan {s.external_id}{s.present_in_latest?"":" · missing from latest refresh"}</p><p className="whitespace-pre-wrap">{s.label_text||"No label text"}</p><p className="text-xs">Source vegan flag: {s.source_vegan===null?"unknown":s.source_vegan?"yes":"no"} · observed {s.observed_at}</p></div>)}
 {!sources?.data?.length&&<p>No staged ViewPlan label observation.</p>}
 {w.legacy_information?.beer&&<div className="mt-3"><h3 className="font-semibold">Existing beer declarations</h3><dl className="text-sm">{Object.entries(w.legacy_information.beer).map(([key,v])=><div key={key}><dt className="inline font-medium">{key.replaceAll("_"," ")}: </dt><dd className="inline">{v===null?"Not confirmed":String(v)}</dd></div>)}</dl></div>}
 {w.legacy_information?.packages?.map((r:{package_id:string;details:Record<string,unknown>})=><div className="mt-3" key={r.package_id}><h3 className="font-semibold">{packageNames.data?.find(p=>p.id===r.package_id)?.name||"Existing package declaration"}</h3><dl className="text-sm">{Object.entries(r.details).map(([key,v])=><div key={key}><dt className="inline font-medium">{key.replaceAll("_"," ")}: </dt><dd className="inline">{v===null?"Not confirmed":String(v)}</dd></div>)}</dl></div>)}
 </details>
 {editor?<form data-product-draft key={w.revision} action={saveProduct} className="grid gap-4 sm:grid-cols-2">
 <ProductDraftGuard key={w.revision}/>
 <Hidden product={selected.id} revision={w.revision}/>
 <label>Beer name<input name="name" defaultValue={d.name} maxLength={200} required className={input}/></label>
 <label>ABV (%)<input type="number" step="0.01" min="0" max="30" name="abv" defaultValue={d.abv??""} className={input}/></label>
 <label className="sm:col-span-2">Description<textarea name="description" defaultValue={d.description||""} maxLength={10000} rows={4} className={input}/></label>
 <input type="hidden" name="artwork_path" value={d.artwork_path||""}/>
 <label className="sm:col-span-2">Beer allergen statement<textarea name="allergens" defaultValue={d.allergens||""} maxLength={10000} rows={3} className={input}/><span className="text-xs">Leave blank if not confirmed. Retain all relevant ingredients and may-contain advice.</span></label>
 <Choice name="gluten_free" label="Gluten-free · all formats" value={d.gluten_free}/><Choice name="lactose_free" label="Lactose-free" value={d.lactose_free}/>
 {(["cask","keg_can"] as const).map(f=><fieldset key={f} className="space-y-3 rounded-xl border p-4"><legend className="px-2 font-semibold">{f==="cask"?"Cask":"Keg & Can"}</legend>
 <p className="text-xs text-slate-600">{f==="cask"?"E-Cask, Firkin, Pin and Flat Bottom Pin":"All keg and can formats"}</p>
 {f==="cask"?<label>Fining<select name="cask_fining" defaultValue={d.cask.fining||""} className={input}><option value="">Choose explicitly before publishing</option><option value="fined">Fined</option><option value="unfined">Unfined</option></select></label>:<p>Unfined · brewery policy</p>}
 <Choice name={f+"_vegan"} label="Vegan" value={d[f].vegan}/>
 <label className="block"><input type="checkbox" name={f+"_override"} defaultChecked={d[f].allergens_override}/> Use a separate allergen declaration for this family</label>
 <label>Family declaration<textarea name={f+"_allergens"} defaultValue={d[f].allergens||""} maxLength={10000} className={input}/></label>
 </fieldset>)}
 <label className="sm:col-span-2"><input name="reviewed" type="checkbox" defaultChecked={w.legacy_reviewed}/> I have reviewed the imported evidence and existing package declarations, resolving differences in this draft.</label>
 <Submit>Save draft</Submit>
 </form>:<p>Only the Head Brewer can change or publish product information.</p>}
 {editor&&w.legacy_information?.presentation?.image_url&&<form action={adoptArtwork} className="mt-4 rounded-lg bg-slate-50 p-3"><Hidden product={selected.id} revision={w.revision}/><p className="mb-2 text-sm">Bring the existing Sellar artwork into Brewery Ops as a new draft asset. Confirm it is the correct company-owned artwork before publishing.</p><Submit>Copy existing artwork into draft</Submit></form>}
 {editor&&!sources?.data?.length&&<form action={linkViewPlan} className="mt-5 rounded-lg border p-3"><Hidden product={selected.id} revision={w.revision}/><label>Link an existing ViewPlan product<select name="external" required className={input}><option value="">Choose an exact source record</option>{unmapped.data?.map(s=><option key={s.external_id} value={s.external_id}>{s.source_name} · {s.external_id}</option>)}</select></label><p className="my-2 text-sm">Choose the corresponding product created in ViewPlan. Existing links cannot be replaced or merged here.</p><Submit>Confirm exact source link</Submit></form>}
 {editor&&<form action={uploadArtwork} className="mt-5 space-y-3 border-t pt-4"><Hidden product={selected.id} revision={w.revision}/><label>Artwork<input type="file" name="artwork" accept="image/png,image/jpeg,image/webp" required className={input}/></label><p className="text-sm">Upload company-owned artwork under 800 KB. Each upload creates a new asset; the current publication stays unchanged.</p><Submit>Upload artwork to draft</Submit></form>}
 {editor&&<form action={publishProduct} className="mt-5 border-t pt-4"><Hidden product={selected.id} revision={w.revision}/><p className="mb-2 text-sm">Publish the saved draft. Unsaved changes above are not included.</p><Submit>Publish saved revision</Submit></form>}
 {publications?.data?.length? <details className="mt-4"><summary className="font-semibold">Publication history</summary>{publications.data.map(p=><div key={p.revision} className="mt-3 rounded-lg border p-3"><h3>Revision {p.revision} · {new Date(p.published_at).toLocaleDateString("en-GB")}</h3><p>{p.specification.name} · {p.specification.abv??"Unknown"}% ABV</p><p className="whitespace-pre-wrap">{p.specification.description}</p><p>Allergens: {p.specification.allergens||"Not confirmed"}</p>{editor&&<form action={restorePublication} className="mt-2"><Hidden product={selected.id} revision={w.revision}/><input type="hidden" name="publication" value={p.revision}/><Submit>Use this revision as a draft</Submit></form>}</div>)}</details>:null}
 {editor&&<details className="mt-4"><summary className="font-semibold">Use this beer as a starting point</summary><form action={duplicateProduct} className="mt-3 space-y-3"><input type="hidden" name="product" value={selected.id}/><label>New beer name<input name="name" required maxLength={200} className={input}/></label><p className="text-sm">Create a new draft using this beer’s description and declarations. Review Cask fining and artwork for the new beer before publishing.</p><Submit>Create a new beer from this draft</Submit></form></details>}
 </section>
 <section className="rounded-xl border p-5"><h2 className="text-xl font-semibold">Formulation versions</h2><p className="my-2 text-sm text-slate-600">Record ingredients, quantities, target volume and process. This record does not change ViewPlan production or perform brewing calculations.</p>
 {recipes?.data?.map(r=><details className="my-3 rounded-lg bg-slate-50 p-3" key={r.revision}><summary>v{r.revision} · {r.title} · {r.approved?"Approved":"Draft"}</summary><pre className="my-2 whitespace-pre-wrap font-sans text-sm">{r.content}</pre>{recipeFiles.get(r.revision)&&<a href={recipeFiles.get(r.revision)} target="_blank" rel="noreferrer" className="underline">Open formulation PDF</a>}{editor&&!r.approved&&r.revision===latest?.revision&&<form action={approveFormulation}><Hidden product={selected.id} revision={r.revision}/><Submit>Approve this formulation</Submit></form>}</details>)}
 {editor&&<form action={saveFormulation} className="space-y-3"><Hidden product={selected.id} revision={latest?.revision||0}/><label>Revision title<input name="title" maxLength={200} required className={input}/></label><label>Formulation and process<textarea name="content" rows={7} required maxLength={50000} className={input} defaultValue={latest?.content||""}/></label><input type="hidden" name="attachment" value={latest?.attachment_path||""}/><label>Supporting PDF (optional, under 800 KB)<input type="file" name="formulation_file" accept="application/pdf" className={input}/></label><Submit>Save new formulation revision</Submit></form>}
 </section>
 <section className="rounded-xl border p-5"><h2 className="text-xl font-semibold">Launch readiness</h2><p className="my-2 text-sm text-slate-600">External listings and orders are completed separately. These tasks record progress; publication and available stock are separate.</p>
 {tasks?.data?.map(t=><details key={t.id+":"+t.revision} className="my-3 rounded-lg border p-3"><summary className="cursor-pointer font-medium">{t.complete?"✓ ":""}{t.title}{t.required?" · required":""}{t.owner_name?" · "+t.owner_name:""}</summary><form action={saveLaunchTask} className="my-3 grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
 <Hidden product={selected.id} revision={t.revision}/><input type="hidden" name="id" value={t.id}/>
 <label>Task<input name="title" defaultValue={t.title} required maxLength={200} className={input} readOnly={!editor}/></label>
 <label>Owner<input name="owner" defaultValue={t.owner_name} maxLength={200} className={input} readOnly={!editor}/></label>
 <label className="sm:col-span-2">Evidence / notes<textarea name="evidence" defaultValue={t.evidence} maxLength={4000} className={input} readOnly={!editor}/></label>
 <label><input type="checkbox" name="required" defaultChecked={t.required} disabled={!editor}/> Required for launch</label><label><input type="checkbox" name="complete" defaultChecked={t.complete} disabled={!editor}/> Complete</label>
 {editor&&<Submit>Save task</Submit>}</form></details>)}
 {editor&&<form action={saveLaunchTask} className="mt-4 space-y-3"><Hidden product={selected.id} revision={0}/><input type="hidden" name="owner" value=""/><input type="hidden" name="evidence" value=""/><label>Additional task<input name="title" required maxLength={200} className={input}/></label><label><input type="checkbox" name="required" defaultChecked/> Required for launch</label><Submit>Add task</Submit></form>}
 </section>
 </>}
 </main>;
}
