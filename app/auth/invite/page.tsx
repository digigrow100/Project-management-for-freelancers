import { redirect } from "next/navigation";
import InviteBridge from "./InviteBridge";
export default async function InvitePage({searchParams: queryParams}:{searchParams:Promise<{code?:string;token_hash?:string;type?:string}>}){
  const searchParams = await queryParams;
 if(searchParams.code||searchParams.token_hash){const q=new URLSearchParams({next:'/login/reset-password'});if(searchParams.code)q.set('code',searchParams.code);if(searchParams.token_hash){q.set('token_hash',searchParams.token_hash);q.set('type','invite');}redirect('/auth/confirm?'+q.toString());}
 return <InviteBridge/>;
}
