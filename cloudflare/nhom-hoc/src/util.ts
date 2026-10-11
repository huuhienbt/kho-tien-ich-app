export class HttpError extends Error {
  constructor(public status:number,message:string) {super(message);}
}
export const todayVietnam = (now=Date.now())=>new Date(now+7*3600000).toISOString().slice(0,10);
export const cleanText = (value:unknown,max=500)=>String(value||'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
export const validId = (value:unknown)=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value);
export async function boundedText(body:ReadableStream<Uint8Array>|null, max:number) {
  if(!body) return '';
  const reader=body.getReader(), parts:Uint8Array[]=[];let size=0;
  try {for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new HttpError(413,'Nội dung gửi lên quá lớn.');}parts.push(value);}}
  finally {reader.releaseLock();}
  const buffer=new Uint8Array(size);let offset=0;for(const part of parts){buffer.set(part,offset);offset+=part.length;}
  return new TextDecoder().decode(buffer);
}
