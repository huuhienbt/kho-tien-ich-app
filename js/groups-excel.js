(function(root,factory){
  'use strict';
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.NHExcel=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase().replace(/\s+/g,' ').trim();
  function parse(bytes,options={}) {
    const zip=options.zip||globalThis.fflate,Parser=options.DOMParser||globalThis.DOMParser;
    if(!zip||!Parser)throw Error('Chưa tải được bộ đọc Excel. Tải lại trang rồi thử lại.');
    const input=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
    if(!input.byteLength||input.byteLength>5242880)throw Error('Chọn tệp .xlsx tối đa 5 MB.');
    let total=0,count=0,files;
    try {files=zip.unzipSync(input,{filter:file=>{
      if(++count>250||file.originalSize>2097152||(total+=file.originalSize)>12582912)throw Error('LIMIT');
      return /^(?:xl\/(?:workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/sheet\d+\.xml))$/.test(file.name);
    }});}catch{throw Error('Tệp Excel không hợp lệ hoặc vượt giới hạn đọc.');}
    function xml(path) {
      if(!files[path])throw Error('Thiếu cấu trúc Excel: '+path+'.');
      const text=zip.strFromU8(files[path]);
      if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('Tệp Excel chứa cấu trúc XML không được hỗ trợ.');
      const doc=new Parser().parseFromString(text,'application/xml');
      if(doc.getElementsByTagName('parsererror').length)throw Error('Không đọc được cấu trúc XML trong tệp Excel.');return doc;
    }
    const all=(node,name)=>Array.from(node.getElementsByTagNameNS('*',name));
    const shared=files['xl/sharedStrings.xml']?all(xml('xl/sharedStrings.xml'),'si').map(node=>all(node,'t').map(t=>t.textContent).join('')):[];
    const relations=new Map(all(xml('xl/_rels/workbook.xml.rels'),'Relationship').filter(r=>r.getAttribute('TargetMode')!=='External').map(r=>[r.getAttribute('Id'),r.getAttribute('Target')]));
    const sheets=all(xml('xl/workbook.xml'),'sheet');
    for(const sheet of sheets) {
      const id=sheet.getAttribute('r:id')||sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'),target=relations.get(id);
      if(!target)continue;
      const parts=[];for(const part of (target.startsWith('/')?target.slice(1):'xl/'+target).split('/')){if(part==='..')parts.pop();else if(part!=='.')parts.push(part);}
      const path=parts.join('/');if(!/^xl\/worksheets\/sheet\d+\.xml$/.test(path))continue;
      const rawRows=all(xml(path),'row');if(rawRows.length>2500)throw Error('Trang Excel có quá nhiều dòng. Chọn bảng điểm tối đa 500 học sinh.');
      let cellCount=0;
      const rows=rawRows.map(row=>{
        const cells={};for(const c of all(row,'c')) {
          if(++cellCount>60000)throw Error('Trang Excel có quá nhiều ô dữ liệu.');
          const ref=c.getAttribute('r')||'',column=ref.replace(/\d/g,''),type=c.getAttribute('t');
          if(!['A','B','J','K'].includes(column)&&Number(row.getAttribute('r'))>5)continue;
          const value=all(c,'v')[0]?.textContent??'',formula=all(c,'f').length>0;
          const text=type==='s'?shared[Number(value)]??'':type==='inlineStr'?all(c,'t').map(t=>t.textContent).join(''):value;
          cells[column]={value:text,formula,error:type==='e',type};
        }
        return {number:Number(row.getAttribute('r')),cells};
      });
      const header=rows.slice(0,15).find(r=>normalize(r.cells.B?.value).includes('ho va ten')&&normalize(r.cells.J?.value)==='tieng viet'&&normalize(r.cells.K?.value)==='toan');
      if(!header)continue;
      const title=rows.filter(r=>r.number<header.number).map(r=>Object.values(r.cells).map(c=>c.value).join(' ')).join(' '),plain=normalize(title),year=title.match(/(20\d{2})\s*[-–]\s*(20\d{2})/);
      const classText=plain.match(/lop\s*:\s*([a-z0-9]+)[.\/\s]+(\d+)/),words={mot:1,hai:2,ba:3,bon:4,nam:5,sau:6,bay:7,tam:8,chin:9,muoi:10};
      const sourceClass=classText?(words[classText[1]]||classText[1])+'/'+classText[2]:'';
      const assessment=/giua.*(?:hoc ki|hk)\s*(?:ii|2)\b/.test(plain)?'gk2':/giua.*(?:hoc ki|hk)\s*(?:i|1)\b/.test(plain)?'gk1':/cuoi.*(?:hoc ki|hk)\s*(?:ii|2)\b/.test(plain)?'ck2':/cuoi.*(?:hoc ki|hk)\s*(?:i|1)\b/.test(plain)?'ck1':'';
      const score=(cell,column,row)=>{
        if(!cell||cell.value===''){if(cell?.formula)throw Error('Cột '+column+', dòng '+row+' chưa có kết quả công thức. Tính và lưu lại tệp bằng Excel trước khi nhập.');return null;}
        if(cell.error||!/^\d+(?:[.,]\d+)?$/.test(cell.value.trim()))throw Error('Điểm không hợp lệ ở cột '+column+', dòng '+row+'.');
        const value=Number(cell.value.replace(',','.'));if(!Number.isFinite(value)||value<0||value>10)throw Error('Điểm ở cột '+column+', dòng '+row+' phải từ 0 đến 10.');return value;
      };
      const students=rows.filter(r=>r.number>header.number&&/^\d+$/.test(r.cells.A?.value||'')&&String(r.cells.B?.value||'').trim()).map(r=>({row:r.number,name:r.cells.B.value.normalize('NFC').trim().replace(/\s+/g,' '),vietnamese:score(r.cells.J,'J',r.number),math:score(r.cells.K,'K',r.number)}));
      if(!students.length||students.length>500)throw Error('Bảng điểm cần có từ 1 đến 500 học sinh.');
      return {sheet:sheet.getAttribute('name'),schoolYear:year?year[1]+'-'+year[2]:'',assessment,sourceClass,rows:students};
    }
    throw Error('Không tìm thấy bảng có tên học sinh ở cột B, Tiếng Việt ở J và Toán ở K.');
  }
  return {parse};
});
