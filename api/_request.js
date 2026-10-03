const crypto=require('crypto');
const {json,readBody,verifyTelegram,rpc,isOwner}=require('./_lib');
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
// Persistent per-player serialization works across Vercel instances. Pending
// requests are never automatically replayed after a crash with unknown outcome.
// DB retires abandoned leases after two minutes, beyond the 60s function cap.
function protectedHandler(handler,{admin=false}={}){
  return async(req,res)=>{
    let actor,request,started=false;
    try{
      if(req.method!=='POST'&&!(admin&&req.method==='GET'))return json(res,405,{ok:false,error:'Method not allowed'});
      const user=verifyTelegram(req.headers['x-telegram-init-data']);
      if(admin&&!isOwner(user))return json(res,403,{ok:false,error:'Owner access required'});
      const body=req.method==='GET'?{}:await readBody(req);req.body=body;
      const action=String(body.action||(admin?'overview':'bootstrap'));
      if(body.payload!==undefined&&(!body.payload||Array.isArray(body.payload)||typeof body.payload!=='object'))return json(res,400,{ok:false,error:'Invalid payload'});
      // Bootstrap is independently upserted by the DB and must remain available
      // so players can inspect their state after an interrupted mutation.
      const readOnly=admin?action==='overview':['bootstrap','pvp_targets'].includes(action);
      // Every endpoint checks bans, including read-only endpoints.
      const {supabase}=require('./_lib');
      const players=await supabase('players',{query:`?telegram_id=eq.${Number(user.id)}&select=blocked`});
      if(players?.[0]?.blocked)return json(res,403,{ok:false,error:'Account is blocked'});
      if(readOnly)return handler(req,res);
      actor=Number(user.id);request=body.request_id||crypto.randomUUID();
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request))return json(res,400,{ok:false,error:'Invalid request ID'});
      const fingerprint=crypto.createHash('sha256').update(JSON.stringify(stable({admin,action,payload:body.payload||{},start_param:body.start_param||''}))).digest('hex');
      const gate=await rpc('begin_api_request',{p_actor:actor,p_request:request,p_fingerprint:fingerprint});
      if(gate.state==='done')return json(res,gate.response.status,gate.response.body);
      if(gate.state!=='new')return json(res,gate.state==='rate_limited'?429:409,{ok:false,error:gate.state==='rate_limited'?'Слишком много действий. Подожди несколько секунд.':'Предыдущее действие ещё обрабатывается. Обнови профиль перед повтором.',code:gate.state});
      started=true;
      const buffered={statusCode:200,setHeader(){},end(value){this.text=value}};
      await handler(req,buffered);
      const response={status:buffered.statusCode,body:JSON.parse(buffered.text)};
      await rpc('finish_api_request',{p_actor:actor,p_request:request,p_response:response});
      return json(res,response.status,response.body);
    }catch(error){
      // Do not unlock/retry an uncertain mutation when the process or DB fails.
      const auth=/signature|session|authorization|Telegram user|initData/i.test(error.message);
      if(!auth)console.error('BloxSpin request failed',{request,started,message:error.message});
      return json(res,auth?401:503,{ok:false,error:auth?error.message:started?'Не удалось подтвердить результат. Обнови профиль. Повторное начисление заблокировано.':'Сервер временно недоступен',request_id:request});
    }
  };
}
module.exports={protectedHandler,stable};
