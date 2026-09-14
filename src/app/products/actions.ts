"use server";
import {productLabelCandidate} from "@/lib/product-label-candidates.mjs";
import {createClient} from "@/lib/supabase/server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
const value=(f:FormData,k:string)=>String(f.get(k)||"").trim();
const flag=(f:FormData,k:string)=>value(f,k)==="yes"?true:value(f,k)==="no"?false:null;
async function session(){const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)redirect("/login");return db;}
function done(product:string,error?:string):never{revalidatePath("/products");revalidatePath("/price-list","layout");redirect("/products?product="+encodeURIComponent(product)+(error?"&error="+encodeURIComponent(error):"&saved=1"));}
export async function startProduct(f:FormData){
 const db=await session();const {data,error}=await db.rpc("start_product_workspace",{p_product:value(f,"product")||null,p_name:value(f,"name")||null});
 if(error)done(value(f,"product"),error.message);
 const product=String(data);
 const [workspace,source]=await Promise.all([db.from("product_workspaces").select("draft,revision,legacy_information").eq("product_id",product).single(),db.from("product_source_observations").select("*").eq("product_id",product).eq("present_in_latest",true).maybeSingle()]);
 if(workspace.error||source.error)done(product,"Draft created; source suggestions unavailable. Reload to review.");
 const w=workspace.data,r=source.data;
 if(w?.revision===1&&r){
  const c=productLabelCandidate({brew_type_id:r.external_id,brew_product_name:r.source_name,label_text:r.label_text,is_vegan:r.source_vegan});
  const legacy=w.legacy_information?.beer||{};const draft={...w.draft,cask:{...w.draft.cask}};
  if(!("allergens" in legacy))draft.allergens=c.proposed_allergens;
  if(!("gluten_free" in legacy))draft.gluten_free=c.proposed_gluten_free;
  if(!("fining_status" in legacy))draft.cask.fining=c.review_flags.includes("vegan_flag_without_label_claim")?null:c.proposed_cask_fining;
  if(!("vegan" in legacy))draft.cask.vegan=c.proposed_cask_vegan;
  const {error:seedError}=await db.rpc("save_product_draft",{p_product:product,p_revision:1,p_draft:draft,p_legacy_reviewed:false});
  if(seedError)done(product,"Draft created; another edit prevented source seeding. Reload before continuing.");
 }
 done(product);
}
export async function saveProduct(f:FormData){
 const db=await session();const product=value(f,"product");
 const family=(name:string)=>({fining:name==="keg_can"?"unfined":value(f,name+"_fining")||null,vegan:flag(f,name+"_vegan"),allergens_override:f.get(name+"_override")==="on",allergens:value(f,name+"_allergens")||null});
 const draft={name:value(f,"name"),type:"beer",description:value(f,"description"),abv:value(f,"abv")?Number(value(f,"abv")):null,
  artwork_path:value(f,"artwork_path")||null,allergens:value(f,"allergens")||null,gluten_free:flag(f,"gluten_free"),lactose_free:flag(f,"lactose_free"),cask:family("cask"),keg_can:family("keg_can")};
 const {error}=await db.rpc("save_product_draft",{p_product:product,p_revision:Number(value(f,"revision")),p_draft:draft,p_legacy_reviewed:f.get("reviewed")==="on"});
 done(product,error?.message);
}
export async function publishProduct(f:FormData){
 const db=await session();const product=value(f,"product");const {error}=await db.rpc("publish_product_draft",{p_product:product,p_revision:Number(value(f,"revision"))});done(product,error?.message);
}
export async function saveFormulation(f:FormData){
 const db=await session();const product=value(f,"product");let attachment=value(f,"attachment")||null;
 const file=f.get("formulation_file");
 if(file instanceof File&&file.size){
  if(file.size>800000)done(product,"Choose a formulation PDF under 800 KB");
  const bytes=new Uint8Array(await file.arrayBuffer());if(String.fromCharCode(...bytes.slice(0,5))!=="%PDF-")done(product,"Choose a PDF formulation document");
  attachment=product+"/"+crypto.randomUUID()+".pdf";const {error:uploadError}=await db.storage.from("product-formulations").upload(attachment,bytes,{contentType:"application/pdf",upsert:false});
  if(uploadError)done(product,"Formulation attachment upload failed");
 }
 const {error}=await db.rpc("save_product_formulation",{p_product:product,p_expected:Number(value(f,"revision")),p_title:value(f,"title"),p_content:value(f,"content"),p_attachment:attachment});done(product,error?.message);
}
export async function approveFormulation(f:FormData){
 const db=await session();const product=value(f,"product");const {error}=await db.rpc("approve_product_formulation",{p_product:product,p_revision:Number(value(f,"revision"))});done(product,error?.message);
}
export async function saveLaunchTask(f:FormData){
 const db=await session();const product=value(f,"product");const {error}=await db.rpc("save_product_launch_task",{p_product:product,p_id:value(f,"id")||null,p_revision:Number(value(f,"revision")),p_title:value(f,"title"),p_required:f.get("required")==="on",p_complete:f.get("complete")==="on",p_owner:value(f,"owner"),p_evidence:value(f,"evidence")});done(product,error?.message);
}

export async function uploadArtwork(f:FormData){
 const db=await session();const product=value(f,"product");const revision=Number(value(f,"revision"));
 const {data:role,error:roleError}=await db.rpc("has_capability",{p_capability:"product_edit"});
 if(roleError||role!==true)done(product,"Head Brewer approval required");
 const file=f.get("artwork");
 if(!(file instanceof File)||file.size===0||file.size>800000)done(product,"Choose a PNG, JPEG or WebP image under 800 KB");
 const bytes=new Uint8Array(await (file as File).arrayBuffer());
 const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
 const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const webp=String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP";
 if(!png&&!jpg&&!webp)done(product,"Choose a PNG, JPEG or WebP image");
 const {data:w,error}=await db.from("product_workspaces").select("draft,revision,legacy_reviewed").eq("product_id",product).single();
 if(error||!w||w.revision!==revision)done(product,"Product changed; reload before uploading");
 const asset=product+"/"+crypto.randomUUID()+"."+(png?"png":jpg?"jpg":"webp");
 const {error:uploadError}=await db.storage.from("product-artwork").upload(asset,bytes,{contentType:png?"image/png":jpg?"image/jpeg":"image/webp",upsert:false});
 if(uploadError)done(product,"Artwork upload failed");
 const {error:saveError}=await db.rpc("save_product_draft",{p_product:product,p_revision:revision,p_draft:{...w.draft,artwork_path:asset},p_legacy_reviewed:w.legacy_reviewed});
 done(product,saveError?.message);
}

export async function linkViewPlan(f:FormData){
 const db=await session();const product=value(f,"product");
 const {error}=await db.rpc("link_product_viewplan",{p_product:product,p_external:value(f,"external"),p_revision:Number(value(f,"revision"))});done(product,error?.message);
}
export async function adoptArtwork(f:FormData){
 const db=await session();const product=value(f,"product");const revision=Number(value(f,"revision"));
 const {data:role,error:roleError}=await db.rpc("has_capability",{p_capability:"product_edit"});
 if(roleError||role!==true)done(product,"Head Brewer approval required");
 const {data:w,error}=await db.from("product_workspaces").select("draft,revision,legacy_reviewed,legacy_information").eq("product_id",product).single();
 if(error||!w||w.revision!==revision)done(product,"Product changed; reload before adopting artwork");
 let remote:URL;try{remote=new URL(w.legacy_information?.presentation?.image_url||"");}catch{done(product,"No existing artwork to adopt");}
 if(remote.protocol!=="https:"||remote.hostname!=="sellar.imgix.net"||remote.port||remote.username||remote.password)done(product,"This artwork source needs manual upload");
 remote.searchParams.set("w","1200");remote.searchParams.set("fit","max");remote.searchParams.set("fm","jpg");remote.searchParams.set("q","85");
 let bytes:Uint8Array;
 try{
  const response=await fetch(remote,{redirect:"error",signal:AbortSignal.timeout(15000),cache:"no-store"});
  if(!response.ok||!response.body)throw new Error("Unavailable");
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>800000){await reader.cancel();throw new Error("Image too large");}chunks.push(value);}
  bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  if(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw new Error("Invalid image");
 }catch{done(product,"Could not copy existing artwork. Upload a PNG, JPEG or WebP under 800 KB instead.");}
 const asset=product+"/"+crypto.randomUUID()+".jpg";
 const hash=Buffer.from(await crypto.subtle.digest("SHA-256",new Uint8Array(bytes))).toString("hex");
 const {error:uploadError}=await db.storage.from("product-artwork").upload(asset,bytes,{contentType:"image/jpeg",upsert:false,metadata:{source_url:w.legacy_information.presentation.image_url,sha256:hash}});
 if(uploadError)done(product,"Artwork adoption failed");
 const {error:saveError}=await db.rpc("save_product_draft",{p_product:product,p_revision:revision,p_draft:{...w.draft,artwork_path:asset},p_legacy_reviewed:w.legacy_reviewed});done(product,saveError?.message);
}

export async function duplicateProduct(f:FormData){
 const db=await session();const {data,error}=await db.rpc("duplicate_product_workspace",{p_source:value(f,"product"),p_name:value(f,"name")});
 if(error)done(value(f,"product"),error.message);done(String(data));
}
export async function restorePublication(f:FormData){
 const db=await session();const product=value(f,"product");const {error}=await db.rpc("restore_product_publication_draft",{p_product:product,p_publication:Number(value(f,"publication")),p_expected:Number(value(f,"revision"))});done(product,error?.message);
}
