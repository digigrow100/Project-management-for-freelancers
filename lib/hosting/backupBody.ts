// Separate budget: recovery batches are larger than individual operator commands.
export async function readBackupBody(request:Request):Promise<string>{
 const reader=request.body?.getReader();if(!reader)throw new Error("body");
 const decoder=new TextDecoder("utf-8",{fatal:true});let raw="",size=0;
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>32768)throw new Error("budget");raw+=decoder.decode(part.value,{stream:true});}return raw+decoder.decode();}
 finally{await reader.cancel();reader.releaseLock();}
}
