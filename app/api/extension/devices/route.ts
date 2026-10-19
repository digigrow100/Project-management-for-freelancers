import {NextResponse} from "next/server";
import {requireProfile} from "@/lib/auth";
import {getSupabase} from "@/lib/supabaseClient";
export const dynamic="force-dynamic";
export async function GET(){
  try{
    const profile=await requireProfile();
    const {data,error}=await getSupabase().from("freelance_hq_employee_devices")
      .select("id,device_label,last_seen_at,token_expires_at,revoked_at")
      .eq("employee_id",profile.id).is("revoked_at",null).order("last_seen_at",{ascending:false});
    if(error)throw error;
    return NextResponse.json({devices:data??[]});
  }catch{return NextResponse.json({error:"Could not load your devices."},{status:400});}
}
export async function POST(request:Request){
  try{
    const profile=await requireProfile();
    const {id}=await request.json();
    if(typeof id!=="string"||!(/^[0-9a-f-]{36}$/i).test(id))return NextResponse.json({error:"Invalid device."},{status:400});
    const now=new Date().toISOString();
    const {data,error}=await getSupabase().from("freelance_hq_employee_devices")
      .update({revoked_at:now,last_status:"offline",updated_at:now})
      .eq("id",id).eq("employee_id",profile.id).is("revoked_at",null).select("id").maybeSingle();
    if(error)throw error;
    if(!data)return NextResponse.json({error:"Device not found."},{status:404});
    return NextResponse.json({ok:true});
  }catch{return NextResponse.json({error:"Could not disconnect this device."},{status:400});}
}
