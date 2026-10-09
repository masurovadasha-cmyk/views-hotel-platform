/** Bound upstream payload consumption before decoding or JSON parsing. */
export async function readBoundedJson(response:Response,maxBytes=131072):Promise<unknown>{
 const declared=response.headers.get("content-length");
 if(declared!==null){
  const size=Number(declared);
  if(!Number.isSafeInteger(size)||size<0||size>maxBytes)throw Error("CORE_RESPONSE_TOO_LARGE");
 }
 if(!response.body)throw Error("CORE_INVALID_RESPONSE");
 const reader=response.body.getReader();
 const parts:Uint8Array[]=[];let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   size+=value.byteLength;
   if(size>maxBytes)throw Error("CORE_RESPONSE_TOO_LARGE");
   parts.push(value);
  }
 }catch(error){await reader.cancel().catch(()=>{});throw error}
 finally{reader.releaseLock()}
 const all=new Uint8Array(size);let offset=0;
 for(const part of parts){all.set(part,offset);offset+=part.byteLength}
 try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(all)) as unknown}
 catch{throw Error("CORE_INVALID_RESPONSE")}
}
