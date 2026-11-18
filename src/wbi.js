'use strict';
const {createHash}=require('node:crypto');
const order=[46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
function sign(params,keys,now=Math.floor(Date.now()/1000)) {
  if(keys.length<64)throw new Error('推荐服务暂时无法验证，请稍后刷新。');
  const key=order.map(i=>keys[i]).join('').slice(0,32), values={...params,wts:now};
  const query=Object.keys(values).sort().map(k=>`${encodeURIComponent(k)}=${encodeURIComponent(String(values[k]).replace(/[!'()*]/g,''))}`).join('&');
  return query+'&w_rid='+createHash('md5').update(query+key).digest('hex');
}
function createWbi(api){
  let cached=null;
  return async (endpoint,params)=>{
    if(!cached || Date.now()-cached.time>1800000){
      const nav=await api('/x/web-interface/nav',true);
      const keys=[nav.wbi_img?.img_url,nav.wbi_img?.sub_url].map(u=>String(u||'').split('/').pop().split('.')[0]).join('');
      cached={keys,time:Date.now()};
    }
    try{return await api(endpoint+'?'+sign(params,cached.keys));}catch(e){cached=null;throw e;}
  };
}
module.exports={sign,createWbi};
