import {NH_SCHEMA, primaryKeys, READ_ACTIONS} from './engine.js';
import {HttpError} from './util.js';
export type Row = Record<string, string | number>;
export type Tables = Record<string, Row[]>;
const schema = NH_SCHEMA as Record<string,string[]>;
export async function loadSnapshot(db: D1Database, action: string, groupId?: string) {
  const names = Object.keys(schema);
  const statements = [db.prepare('SELECT revision FROM nh_meta WHERE id=1')];
  for (const name of names) {
    if (action === 'nh_boot' && ['DiemDanh','ThuHocPhi','HocPhiKy'].includes(name)) { statements.push(db.prepare('SELECT 1 WHERE 0')); continue; }
    let predicate = '', params: string[] = [];
    // Overview and room rent need both groups. Attendance and tuition stay scoped.
    if (groupId && ['BuoiHoc','ThuHocPhi','HocPhiKy'].includes(name) && !(name==='BuoiHoc'&&action==='nh_view') && !action.startsWith('nh_room_rent_')) {predicate=' WHERE ma_nhom=?';params=[groupId];}
    if (groupId && name==='DiemDanh') {predicate=' WHERE ma_buoi IN (SELECT ma_buoi FROM BuoiHoc WHERE ma_nhom=?)';params=[groupId];}
    statements.push(db.prepare(`SELECT ${schema[name].join(',')} FROM ${name}${predicate} ORDER BY rowid LIMIT 10001`).bind(...params));
  }
  statements.push(db.prepare('SELECT id,name,email,status FROM nh_teachers ORDER BY rowid'));
  const results = await db.batch<Row>(statements);
  const tables: Tables = {};
  names.forEach((name,i) => {
    const rows = results[i+1].results;
    if (rows.length>10000) throw new HttpError(413,'Nhóm có quá nhiều dữ liệu. Cần chia dữ liệu theo năm học trước khi tiếp tục.');
    tables[name]=rows.map((row,index)=>({_row:index+2,...row}));
  });
  return {tables, teachers:results.at(-1)!.results, revision:Number(results[0].results[0]?.revision ?? -1)};
}
// One JSON parameter per table keeps batch attendance below D1's query and variable limits.
export function upsertSQL(name: string, gated=true) {
  if (!schema[name]) throw new Error('Unknown ledger table');
  const columns=schema[name], keys=primaryKeys(name);
  const assignments=columns.filter(c=>!keys.includes(c)).map(c=>`${c}=excluded.${c}`).join(',');
  const where = gated ? ' WHERE (SELECT write_token FROM nh_meta WHERE id=1)=?' : ' WHERE 1';
  return `INSERT INTO ${name} (${columns.join(',')}) SELECT ${columns.map(c=>`json_extract(value,'$.${c}')`).join(',')} FROM json_each(?)${where} ON CONFLICT(${keys.join(',')}) DO UPDATE SET ${assignments}`;
}
export async function commitChanges(db:D1Database, revision:number, dirty:Tables, action:string, userId:string, now:string) {
  if (READ_ACTIONS.includes(action) || !Object.values(dirty).some(rows=>rows.length)) return;
  const token=crypto.randomUUID(), statements=[db.prepare('UPDATE nh_meta SET revision=revision+1,write_token=? WHERE id=1 AND revision=?').bind(token,revision)];
  let count=0;
  for(const name of Object.keys(schema)) {
    if(!dirty[name]?.length) continue;
    count+=dirty[name].length;
    statements.push(db.prepare(upsertSQL(name)).bind(JSON.stringify(dirty[name]),token));
  }
  statements.push(db.prepare('INSERT INTO nh_audit(id,action,user_id,created_at,changed_rows) SELECT ?,?,?,?,? WHERE (SELECT write_token FROM nh_meta WHERE id=1)=?').bind(crypto.randomUUID(),action,userId,now,count,token));
  statements.push(db.prepare('SELECT write_token FROM nh_meta WHERE id=1'));
  const result=await db.batch<{write_token:string}>(statements);
  if(result.at(-1)?.results[0]?.write_token!==token) throw new HttpError(409,'Dữ liệu vừa được cập nhật ở phiên khác. Tải lại trước khi lưu.');
}
