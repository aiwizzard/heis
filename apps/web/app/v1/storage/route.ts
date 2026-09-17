import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { createAdminClient, requireUser } from "@/lib/supabase";
import { createDownloadUrl, deleteManagedAsset } from "@/lib/r2";
export async function GET(request: Request) {
  try {
    const {client,user}=await requireUser(request);
    const [uploads,media]=await Promise.all([client.from("upload_assets").select("id,object_key,size_bytes,created_at,delete_after").eq("user_id",user.id).not("object_key","like","%/reservation").order("created_at",{ascending:false}).limit(100),client.from("media_assets").select("id,object_key,size_bytes,created_at,delete_after").eq("user_id",user.id).not("object_key","like","%/reservation").order("created_at",{ascending:false}).limit(100)]);
    if(uploads.error) throw uploads.error; if(media.error) throw media.error;
    const files=await Promise.all([...(uploads.data??[]).map(f=>({...f,kind:"upload"})),...(media.data??[]).map(f=>({...f,kind:"media"}))].map(async file=>({...file,url:await createDownloadUrl(file.object_key)})));
    return NextResponse.json({files});
  }catch(error){return apiError(error);}
}
export async function DELETE(request: Request) {
  try {
    const {client,user}=await requireUser(request); const {id,kind}=await request.json();
    if(typeof id!=="string" || !["upload","media"].includes(kind)) return new Response("Invalid asset",{status:400});
    const table=kind==="upload"?"upload_assets":"media_assets";
    const asset=await client.from(table).select("object_key,created_at").eq("id",id).eq("user_id",user.id).single();
    if(asset.error || !asset.data) return new Response("Asset not found",{status:404});
    // Wait out the signed PUT URL so it cannot recreate an uncounted object after deletion.
    if(kind==="upload" && new Date(asset.data.created_at).getTime()>Date.now()-16*60*1000) return NextResponse.json({error:{message:"New uploads can be deleted after 16 minutes, once their upload link expires."}},{status:409});
    await deleteManagedAsset(asset.data.object_key);
    const removed=await createAdminClient().from(table).delete().eq("id",id).eq("user_id",user.id).eq("created_at",asset.data.created_at); if(removed.error) throw removed.error;
    return NextResponse.json({ok:true});
  }catch(error){return apiError(error);}
}
