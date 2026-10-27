import { MAX_OPERATOR_BYTES } from "./operatorSchema";
export async function readOperatorBody(request:Request){
 const reader=request.body?.getReader();if(!reader)throw new Error('body');
 const decoder=new TextDecoder('utf-8',{fatal:true});let raw='',size=0;
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>MAX_OPERATOR_BYTES)throw new Error('budget');raw+=decoder.decode(part.value,{stream:true});}return raw+decoder.decode();}
 finally{await reader.cancel();reader.releaseLock();}
}
