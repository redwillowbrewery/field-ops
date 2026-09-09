import {createClient} from "@supabase/supabase-js";
export async function GET(_request:Request,{params}:{params:Promise<{product:string;asset:string}>}){
 const {product,asset}=await params;
 if(!/^[a-f0-9-]{36}$/.test(product)||! /^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(asset))return new Response("Not found",{status:404});
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const path=product+"/"+asset;
 // Historical publications retain their approved artwork; unpublished assets never pass this check.
 const {data,error}=await db.from("product_publications").select("revision").eq("product_id",product).contains("specification",{artwork_path:path}).limit(1);
 if(error)return new Response("Unavailable",{status:503});
 if(!data?.length)return new Response("Not found",{status:404});
 const {data:blob,error:readError}=await db.storage.from("product-artwork").download(path);
 if(readError||!blob)return new Response("Unavailable",{status:503});
 return new Response(blob,{headers:{"Content-Type":blob.type,"Cache-Control":"public, max-age=86400, immutable","X-Content-Type-Options":"nosniff"}});
}
