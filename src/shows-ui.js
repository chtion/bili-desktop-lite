'use strict';
let showItems=[],showsBusy=false,seasonInfo=null;
function showFilter(key, choices, value, label) {
  return `<div class="folder-tabs" aria-label="${label}">${choices.map(([id,text])=>`<button data-show-filter="${key}" data-filter-value="${id}" class="${String(value)===String(id)?'active':''}">${text}</button>`).join('')}</div>`;
}
function displayShows(items, discover) {
  return `<div class="show-grid">${items.map(s=>`<button class="show-card" data-season="${s.id}"><span class="show-cover">${s.cover?`<img src="${esc(image(s.cover))}" alt="" loading="lazy">`:icon('film')}${s.badge?`<em>${esc(s.badge)}</em>`:''}</span><strong>${esc(s.title)}</strong><small>${esc(s.update)}</small>${!discover||s.rating?`<span>${esc(s.progress||(!discover?'还没开始观看':''))}${s.rating?`${s.progress?' · ':''}${esc(s.rating)} 分`:''}</span>`:''}</button>`).join('')}</div>`;
}
async function loadAnime(append=false) {
  if(append&&showsBusy)return;
  const turn=generation;
  if(!append){
    showItems=[];
    const title=route.index?'番剧索引':'番剧探索';
    $('content').innerHTML=heading(title)+`<nav class="search-tabs" aria-label="番剧浏览方式"><button data-anime-mode="discover" aria-current="${route.index?'false':'page'}">探索</button><button data-anime-mode="index" aria-current="${route.index?'page':'false'}">索引</button></nav>`+
      `<div class="anime-filters">${showFilter('type',[[1,'番剧'],[4,'国创']],route.type||1,'分区')}${route.index?'':showFilter('finish',[[-1,'全部'],[1,'完结'],[0,'连载']],route.finish??-1,'状态')}${showFilter('order',[['hot','热门'],['new','最新'],['rating','高分']],route.order||'hot','排序')}</div>`+
      (route.index?'<div id="anime-index-filters" class="anime-index" aria-label="番剧索引筛选">正在加载索引条件…</div>':'')+`<div id="shows-area">${skeleton()}</div>`;
    if(route.index)loadIndexFilters(turn);
  } else $('anime-more').disabled=true;
  showsBusy=true;
  try {
    const page=append?route.page+1:1;
    const data=await window.bili.api('anime',{...route,page});
    if(turn!==generation)return;
    route.page=page;
    showItems=append?[...showItems,...data.items.filter(s=>!showItems.some(old=>old.id===s.id))]:data.items;
    $('shows-area').innerHTML=(showItems.length?displayShows(showItems,true):empty('没有找到对应番剧','试试其他筛选条件。','film'))+
      (data.more?'<div class="load-more"><button class="secondary-button" id="anime-more">加载更多</button></div>':'');
    return true;
  } catch(error) {
    if(turn!==generation)return;
    if(append){$('anime-more').disabled=false;toast(error.message);}
    else $('shows-area').innerHTML=empty('番剧暂时无法加载',error.message,'film')+'<div class="empty-action"><button class="primary-button" data-refresh>重试</button></div>';
    return false;
  } finally {if(turn===generation)showsBusy=false;}
}
async function loadIndexFilters(turn) {
  try {
    const result=await window.bili.api('anime-filters',{type:route.type||1});
    if(turn!==generation)return;
    const filters=route.filters||{};
    const fields=result.sections.map(section=>{
      const selected=String(filters[section.key]??'-1');
      return `<label><span>${esc(section.label)}</span><select data-index-filter="${esc(section.key)}">${section.options.map(option=>`<option value="${esc(option.value)}" ${option.value===selected?'selected':''}>${esc(option.label)}</option>`).join('')}</select></label>`;
    });
    $('anime-index-filters').innerHTML=fields.length?fields.join('')+'<button id="clear-anime-index" class="subtle-button">重置筛选</button>':'暂无可筛选条件。';
  } catch(error) {
    if(turn===generation)$('anime-index-filters').innerHTML=`<span>${esc(error.message)}</span><button class="subtle-button" data-refresh>重试加载索引</button>`;
  }
}
async function loadShows(append=false){
  const turn=generation;if(showsBusy&&append)return;showsBusy=true;
  if(!append){showItems=[];$('content').innerHTML=heading('我的追番','追番和追剧，与 B站账号同步')+`<div class="show-filters"><div class="people-tabs">${[[1,'追番'],[2,'追剧']].map(([v,t])=>`<button data-show-type="${v}" class="${(route.type||1)===v?'active':''}">${t}</button>`).join('')}</div><div class="folder-tabs">${[[0,'全部'],[1,'想看'],[2,'在看'],[3,'看过']].map(([v,t])=>`<button data-show-status="${v}" class="${(route.status||0)===v?'active':''}">${t}</button>`).join('')}</div></div><div id="shows-area">`+skeleton()+'</div>';}else if($('shows-more'))$('shows-more').disabled=true;
  try{const p=append?route.page+1:1,d=await window.bili.api('bangumi',{...route,page:p});if(turn!==generation)return;route.page=p;showItems=append?[...showItems,...d.items.filter(v=>!showItems.some(x=>x.id===v.id))]:d.items;
    $('shows-area').innerHTML=showItems.length?`<div class="show-grid">${showItems.map(s=>`<button class="show-card" data-season="${s.id}"><span class="show-cover">${s.cover?`<img src="${esc(image(s.cover))}" alt="" loading="lazy">`:icon('video')}${s.badge?`<em>${esc(s.badge)}</em>`:''}</span><strong>${esc(s.title)}</strong><small>${esc(s.update)}</small><span>${esc(s.progress||'还没开始观看')}${s.rating?' · '+esc(s.rating)+' 分':''}</span></button>`).join('')}</div>`+(d.more?'<div class="load-more"><button id="shows-more" class="secondary-button">加载更多</button></div>':''):empty('这里还没有追番记录','切换状态筛选，或到 B站添加想看的番剧。','video');return true;
  }catch(e){if(turn===generation){if(append){toast(e.message);$('shows-more').disabled=false;}else $('shows-area').innerHTML=empty('暂时无法获取追番',e.message,'video')+'<div class="empty-action"><button class="primary-button" data-refresh>重新加载</button>'+(!accountState?.loggedIn?'<button class="secondary-button" data-login>登录 B站</button>':'')+'</div>';}}finally{if(turn===generation)showsBusy=false;}
}
async function loadSeason(){
  const turn=generation;seasonInfo=null;personalHeader('番剧详情','选一集，接着看。');
  try{const s=await window.bili.api('season',{seasonId:route.seasonId});if(turn!==generation)return;seasonInfo=s;const eps=s.sections.flatMap(g=>g.items),next=eps.find(e=>e.episodeId===s.lastEpisode)||eps[0];
    $('personal-area').innerHTML=`<section class="season-hero">${s.cover?`<img class="season-cover" src="${esc(image(s.cover))}" alt="">`:''}<div><span class="video-category">${esc(s.styles)}</span><h2>${esc(s.title)}</h2><p>${esc(s.update)}${s.rating?' · '+esc(s.rating)+' 分':''}</p><p class="season-description">${esc(s.description)}</p><div class="season-buttons">${next?`<button class="primary-button" data-episode="${next.episodeId}">${icon('play')}${s.lastEpisode?'继续观看':'开始观看'}</button>`:''}<button class="secondary-button" id="season-follow">${s.followed?'已追番 · 取消':'+ 加入追番'}</button></div></div></section><div class="season-sections">${s.sections.map(g=>`<h3>${esc(g.title)} · ${g.items.length} 集</h3><div class="episode-grid">${g.items.map(e=>`<button data-episode="${e.episodeId}"><span>${esc(e.title)}</span>${e.badge?`<small>${esc(e.badge)}</small>`:''}</button>`).join('')}</div>`).join('')}</div>`;return true;
  }catch(e){if(turn===generation)$('personal-area').innerHTML=empty('番剧详情暂时无法加载',e.message,'video')+'<button class="primary-button" data-refresh>重试</button>';}
}
async function followSeason(){
  if(!seasonInfo)return;const s=seasonInfo,turn=generation;
  const submit=async()=>{const b=$('season-follow');b.disabled=true;try{await window.bili.api('show-follow',{seasonId:s.id,follow:!s.followed});if(turn===generation){s.followed=!s.followed;b.textContent=s.followed?'已追番 · 取消':'+ 加入追番';toast(s.followed?'已加入追番':'已取消追番');}$('action-dialog').close();}catch(e){toast(e.message);}finally{b.disabled=false;}};
  if(s.followed){actionDialog('取消追番？','<p>'+esc(s.title)+'</p>','确认取消');$('video-action-form').onsubmit=e=>{e.preventDefault();submit();};}else submit();
}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.episode)watch('',{episodeId:Number(b.dataset.episode)});else if(b.dataset.season)navigate('season',{seasonId:Number(b.dataset.season)});else if(b.dataset.showType)navigate('bangumi',{type:Number(b.dataset.showType),status:route.status||0});else if(b.hasAttribute('data-show-status'))navigate('bangumi',{type:route.type||1,status:Number(b.dataset.showStatus)});else if(b.id==='shows-more')loadShows(true);else if(b.id==='season-follow')followSeason();});
document.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(!button||route.name!=='anime')return;
  if(button?.id==='anime-more')loadAnime(true);
  if(button.dataset.animeMode) {
    const index=button.dataset.animeMode==='index';
    if(index!==!!route.index)navigate('anime',{type:route.type,order:route.order,index});
  }
  if(button.id==='clear-anime-index')navigate('anime',{type:route.type,order:route.order,index:true});
  if(button?.dataset.showFilter){
    const key=button.dataset.showFilter,value=button.dataset.filterValue;
    navigate('anime',{type:route.type,finish:route.finish,order:route.order,index:route.index,filters:key==='type'?undefined:route.filters,[key]:key==='order'?value:Number(value)});
  }
});
document.addEventListener('change',event=>{
  const key=event.target.dataset.indexFilter;
  if(route.name!=='anime'||!route.index||!key)return;
  const filters={...route.filters,[key]:event.target.value};
  if(filters[key]==='-1')delete filters[key];
  navigate('anime',{type:route.type,order:route.order,index:true,filters});
});
