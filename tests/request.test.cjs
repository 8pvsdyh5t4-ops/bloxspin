const {test}=require('node:test'),assert=require('node:assert/strict');
const lib=require('../api/_lib');
const receipts=new Map();let blocked=false;
lib.verifyTelegram=()=>({id:17});lib.isOwner=()=>true;lib.readBody=async req=>req.body;lib.supabase=async()=>[{blocked}];
lib.rpc=async(name,p)=>{if(name==='begin_api_request'){const old=receipts.get(p.p_request);if(old){if(old.fingerprint!==p.p_fingerprint)throw Error('Request mismatch');return old}const value={state:'pending',fingerprint:p.p_fingerprint};receipts.set(p.p_request,value);return {state:'new'}}if(name==='finish_api_request'){const old=receipts.get(p.p_request);receipts.set(p.p_request,{...old,state:'done',response:p.p_response})}};
const {protectedHandler}=require('../api/_request');
const id='10000000-0000-4000-8000-000000000001';
const request=(extra={})=>({method:'POST',headers:{},body:{action:'spin',request_id:id,payload:{bet:100},...extra}});
async function invoke(handler,req){const res={setHeader(){},end(text){this.body=JSON.parse(text)}};await handler(req,res);return res}
test('replays identical requests without executing the reward twice',async()=>{let executions=0;const h=protectedHandler(async(req,res)=>lib.json(res,200,{ok:true,reward:++executions}));assert.equal((await invoke(h,request())).body.reward,1);assert.equal((await invoke(h,request())).body.reward,1);assert.equal(executions,1)});
test('rejects banned players even when a cached response exists',async()=>{blocked=true;const h=protectedHandler(()=>{throw Error('should not run')});assert.equal((await invoke(h,request())).statusCode,403);blocked=false});
test('concurrent duplicate remains pending and does not invoke handler',async()=>{let release;const latch=new Promise(resolve=>release=resolve);const h=protectedHandler(async(req,res)=>{await latch;lib.json(res,200,{ok:true})});const req=request({request_id:'10000000-0000-4000-8000-000000000002'});const first=invoke(h,req);await new Promise(resolve=>setImmediate(resolve));assert.equal((await invoke(h,req)).statusCode,409);release();assert.equal((await first).statusCode,200)});
test('invalid payload and request IDs never invoke handler',async()=>{const h=protectedHandler(()=>{throw Error('should not run')});assert.equal((await invoke(h,request({payload:[]}))).statusCode,400);assert.equal((await invoke(h,request({request_id:'bad'}))).statusCode,400)});
