const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {verifyTelegram,isOwner,readBody}=require('../api/_lib');
process.env.TELEGRAM_BOT_TOKEN='test-token';
function signed(values={}){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:123,first_name:'Test'}),...values});const text=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');const key=crypto.createHmac('sha256','WebAppData').update(process.env.TELEGRAM_BOT_TOKEN).digest();p.set('hash',crypto.createHmac('sha256',key).update(text).digest('hex'));return p.toString()}
test('accepts signed Telegram data',()=>assert.equal(verifyTelegram(signed()).id,123));
test('rejects tampering, duplicate keys, expired and future dates',()=>{assert.throws(()=>verifyTelegram(signed()+'&auth_date=1'));assert.throws(()=>verifyTelegram(signed().replace('Test','Hacker')));for(const seconds of [-90000,3600])assert.throws(()=>verifyTelegram(signed({auth_date:String(Math.floor(Date.now()/1000)+seconds)})));assert.throws(()=>verifyTelegram(signed({user:'{"id":-1}'})))});
test('owner IDs override changeable usernames',()=>{process.env.OWNER_TELEGRAM_IDS='123';process.env.OWNER_TELEGRAM_USERNAMES='owner';assert.equal(isOwner({id:456,username:'owner'}),false);assert.equal(isOwner({id:123}),true)});
test('rejects malformed and oversized request bodies',async()=>{await assert.rejects(readBody({body:'null'}));await assert.rejects(readBody({body:[]}));await assert.rejects(readBody({body:{data:'x'.repeat(65537)}}))});
