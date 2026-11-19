'use strict';
const {ipcRenderer}=require('electron');

if(process.isMainFrame){
  const officialPlayer=()=>location.origin==='https://hongguoduanju.com'&&/^\/player\//.test(location.pathname);
  let wheelAt=0;
  let autoplayTimer;
  const stopAutoplay=()=>clearInterval(autoplayTimer);
  ipcRenderer.on('hongguo:pause',()=>{
    stopAutoplay();
    document.querySelectorAll('video').forEach(video=>video.pause());
  });
  ipcRenderer.on('hongguo:autoplay',()=>{
    if(!officialPlayer())return;
    stopAutoplay();
    const deadline=Date.now()+10000;
    let pending=false;
    autoplayTimer=setInterval(()=>{
      const video=document.querySelector('video');
      if(!officialPlayer()||Date.now()>=deadline||(video?.readyState>=2&&!video.paused)){stopAutoplay();return;}
      if(!pending&&(video?.currentSrc||video?.getAttribute('src')||video?.srcObject)){
        pending=true;
        video.play().catch(()=>{}).finally(()=>{pending=false;});
      }
    },250);
  });
  window.addEventListener('wheel',event=>{
    if(!event.isTrusted||!officialPlayer()||event.ctrlKey||Math.abs(event.deltaY)<14||Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
    const video=document.querySelector('video');
    if(!video)return;
    const rect=video.getBoundingClientRect();
    if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)return;
    const now=Date.now(),elapsed=now-wheelAt;
    wheelAt=now;
    if(elapsed>320)ipcRenderer.send('hongguo:wheel',Math.sign(event.deltaY));
  },{passive:true});
}
