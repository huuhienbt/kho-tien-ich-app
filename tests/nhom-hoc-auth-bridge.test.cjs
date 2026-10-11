'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./nhom-hoc-cycle.test.cjs');
test('admin proof has a signed expiry; auth does not open Drive; cutover blocks old sheet writes',()=>{
 const h=harness();
 h.ctx.resolvePrincipal=p=>p.adminToken==='valid'?{role:'admin',sub:'admin',exp:2000000000}:p.userToken?{role:'member',sub:'u1'}:null;
 h.ctx.nhBook_=()=>{throw new Error('Auth must not open spreadsheet');};
 const response=h.ctx.handleNhomHoc({action:'nh_auth',adminToken:'valid'});
 assert.equal(response.status,'success');assert.equal(response.data.exp,2000000000);assert.equal(response.data.role,'admin');
 assert.equal(h.ctx.handleNhomHoc({action:'nh_auth',userToken:'member'}).status,'error');
 assert.equal(h.ctx.handleNhomHoc({action:'nh_auth'}).status,'error');
 h.ctx.nhCloudflareActive_=()=>true;
 assert.equal(h.ctx.handleNhomHoc({action:'nh_attendance_save',adminToken:'valid'}).code,'NH_MIGRATED');
 assert.equal(h.ctx.handleNhomHoc({action:'nh_auth',adminToken:'valid'}).status,'success');
});
