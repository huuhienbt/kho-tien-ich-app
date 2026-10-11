export class HttpError extends Error {constructor(public status:number,message:string){super(message);}}
export async function boundedText(body:ReadableStream<Uint8Array>|null,max:number):Promise<string>{
  if(!body)return '';const reader=body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new HttpError(413,'Dữ liệu quá lớn.');}chunks.push(value);}}finally{reader.releaseLock();}
  const out=new Uint8Array(size);let offset=0;for(const c of chunks){out.set(c,offset);offset+=c.length;}return new TextDecoder().decode(out);
}
export async function hash(value:string):Promise<string>{return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),n=>n.toString(16).padStart(2,'0')).join('');}
export function text(value:unknown,max=45000):string{if(value==null)return '';if(typeof value!=='string'&&typeof value!=='number')throw new HttpError(400,'Nội dung không hợp lệ.');const s=String(value);if(s.length>max)throw new HttpError(400,'Nội dung vượt giới hạn lưu.');return s;}
export type Item=Record<string,string|number|boolean>;
export type Principal={role:'admin'|'member',sub:string,membership:'admin'|'regular'|'vip',exp:number};
export function json(value:unknown,status=200):Response{return Response.json(value,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
