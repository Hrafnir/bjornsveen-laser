// Small ZIP container for native XS projects. Stored entries are portable across browsers;
// reads also support Studio's deflated archives through the standard streaming API.
const enc=new TextEncoder(),dec=new TextDecoder();
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
export function crc32(bytes){let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return(crc^0xffffffff)>>>0}
function header(size,values){const a=new Uint8Array(size),v=new DataView(a.buffer);for(const [off,value,bits=16]of values)bits===32?v.setUint32(off,value,true):v.setUint16(off,value,true);return a}
function concat(parts){const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let i=0;for(const p of parts){out.set(p,i);i+=p.length}return out}
export function writeZip(entries){
 const local=[],central=[];let offset=0;
 if(entries.length>65535)throw Error('For mange filer i prosjektet.');
 for(const [name,value]of entries){const path=enc.encode(name),data=typeof value==='string'?enc.encode(value):value,crc=crc32(data);
  if(data.length+offset>0xffffffff)throw Error('Prosjektet er for stort for ZIP-formatet.');
  const h=header(30,[[0,0x04034b50,32],[4,20],[6,0x800],[14,crc,32],[18,data.length,32],[22,data.length,32],[26,path.length]]);
  local.push(h,path,data);central.push(header(46,[[0,0x02014b50,32],[4,20],[6,20],[8,0x800],[16,crc,32],[20,data.length,32],[24,data.length,32],[28,path.length],[42,offset,32]]),path);offset+=h.length+path.length+data.length;
 }
 const c=concat(central);return concat([...local,c,header(22,[[0,0x06054b50,32],[8,entries.length],[10,entries.length],[12,c.length,32],[16,offset,32]])]);
}
export async function readZip(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),files=new Map();
 const fail=()=>{throw Error('Ugyldig eller skadet XS-prosjektfil.')};
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break}if(end<0)fail();
 const count=v.getUint16(end+10,true);let pos=v.getUint32(end+16,true),total=0;
 if(count>10000)fail();
 for(let i=0;i<count;i++){
  if(pos+46>bytes.length||v.getUint32(pos,true)!==0x02014b50)fail();
  const flags=v.getUint16(pos+8,true),method=v.getUint16(pos+10,true),crc=v.getUint32(pos+16,true),size=v.getUint32(pos+20,true),plain=v.getUint32(pos+24,true),nl=v.getUint16(pos+28,true),extra=v.getUint16(pos+30,true),comment=v.getUint16(pos+32,true),off=v.getUint32(pos+42,true);total+=plain;
  if(flags&1||total>512*1024*1024||off+30>bytes.length||pos+46+nl+extra+comment>bytes.length||v.getUint32(off,true)!==0x04034b50)fail();
  const name=dec.decode(bytes.subarray(pos+46,pos+46+nl));if(name.startsWith('/')||name.split('/').includes('..')||files.has(name))fail();
  const start=off+30+v.getUint16(off+26,true)+v.getUint16(off+28,true);if(start+size>bytes.length)fail();let data=bytes.slice(start,start+size);
  if(method===8){const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),parts=[];let length=0;for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>plain){await reader.cancel();fail()}parts.push(value)}data=concat(parts)}else if(method!==0)fail();
  if(data.length!==plain||crc32(data)!==crc)fail();files.set(name,data);pos+=46+nl+extra+comment;
 }
 return files;
}
export const zipText=(files,name)=>files.has(name)?dec.decode(files.get(name)):null;
