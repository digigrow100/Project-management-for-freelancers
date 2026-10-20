import { timingSafeEqual } from "node:crypto";
import { NextRequest,NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabaseClient";
export const dynamic='force-dynamic';
export async function GET(request:NextRequest) {
 const secret=process.env.CRON_SECRET;
 if(!secret)return NextResponse.json({ok:false,error:'Hosting scheduler is not configured.'},{status:503});
 const received=Buffer.from(request.headers.get('authorization')??''),expected=Buffer.from('Bearer '+secret);
 if(received.length!==expected.length||!timingSafeEqual(received,expected))return NextResponse.json({ok:false,error:'Unauthorized'},{status:401});
 const result=await getSupabase().rpc('freelance_hq_hosting_run_renewals');
 if(result.error)return NextResponse.json({ok:false,error:'Hosting renewal generation failed.'},{status:500});
 return NextResponse.json({ok:true,created:result.data});
}
