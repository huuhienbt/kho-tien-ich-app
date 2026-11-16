'use strict';
const zip=require('../../js/vendor/fflate-0.8.2.min.js');
function workbook({missingCache=false,zero=false}={}) {
  const entries={'xl/workbook.xml':'<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="4.12" r:id="one"/></sheets></workbook>','xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="one" Target="worksheets/sheet1.xml"/></Relationships>','xl/worksheets/sheet1.xml':'<worksheet><sheetData><row r="2"><c r="A2" t="inlineStr"><is><t>LỚP: BỐN 12</t></is></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>GIỮA HỌC KÌ I NĂM HỌC 2026 - 2027</t></is></c></row><row r="4"><c r="B4" t="inlineStr"><is><t>HỌ VÀ TÊN HỌC SINH</t></is></c><c r="J4" t="inlineStr"><is><t>Tiếng Việt</t></is></c><c r="K4" t="inlineStr"><is><t>Toán</t></is></c></row><row r="6"><c r="A6"><v>1</v></c><c r="B6" t="inlineStr"><is><t>Đỗ &lt;B&gt; &amp; An</t></is></c><c r="J6"><f>ROUND((H6+I6)/2,0)</f>'+(missingCache?'':'<v>'+(zero?0:9)+'</v>')+'</c><c r="K6"><v>9.5</v></c></row></sheetData></worksheet>'};
  return zip.zipSync(Object.fromEntries(Object.entries(entries).map(([k,v])=>[k,zip.strToU8(v)])));
}
module.exports={workbook};
