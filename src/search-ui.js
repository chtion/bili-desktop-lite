'use strict';
const searchTabs=[['all','综合'],['video','视频'],['user','用户'],['anime','番剧']];
const searchOrders=[['totalrank','综合排序'],['click','最多播放'],['pubdate','最新发布']];
let searchRows=[],searchBusy=false;

function searchShell() {
  const active=route.searchType||'all';
  const tabs=searchTabs.map(([type,label])=>`<button data-search-tab="${type}" aria-current="${active===type?'page':'false'}">${label}</button>`).join('');
  const orders=searchOrders.map(([type,label])=>`<button data-search-order="${type}" aria-pressed="${route.order===type}">${label}</button>`).join('');
  $('content').innerHTML=heading(`“${route.keyword}”`)+`<nav class="search-tabs" aria-label="搜索结果类型">${tabs}</nav>`+
    `<div class="search-meta">${active==='video'?`<div class="search-sort" aria-label="视频排序">${orders}</div>`:''}<small id="search-count"></small></div><div id="search-result">${skeleton()}</div>`;
}

function searchUser(user) {
  const avatar=user.avatar?`<img src="${esc(image(user.avatar))}" alt="" loading="lazy">`:icon('user');
  return `<button class="search-person" data-user-space="${user.mid}"><span class="search-person-avatar">${avatar}</span><span class="search-person-copy"><strong>${esc(user.name)}</strong><small>${number(user.fans)} 粉丝 · ${number(user.videos)} 投稿</small>${user.sign?`<span>${esc(user.sign)}</span>`:''}</span>${icon('arrow')}</button>`;
}

function renderSearchRows(type,items) {
  if(type==='anime')return displayShows(items,true);
  if(type==='user')return `<div class="search-user-grid">${items.map(searchUser).join('')}</div>`;
  remember(items);
  return `<div class="video-grid">${items.map(card).join('')}</div>`;
}

async function loadSearch(append=false) {
  if(append&&searchBusy)return;
  const turn=generation,type=route.searchType||'all';
  const page=append?route.page+1:1;
  if(!append){searchRows=[];searchShell();}
  const next=$('search-more');
  if(next)next.disabled=true;
  searchBusy=true;
  try {
    const result=await window.bili.api('search',{keyword:route.keyword,searchType:type,order:route.order,page});
    if(turn!==generation)return false;
    route.page=page;
    let content='';
    if(type==='all') {
      for(const [key,label] of [['anime','番剧'],['user','用户'],['video','视频']]) {
        const matches=result.groups[key];
        if(matches.length)content+=`<section class="search-section"><div class="search-section-head"><h2>${label}</h2><button class="subtle-button" data-search-tab="${key}">查看更多${label}${icon('arrow')}</button></div>${renderSearchRows(key,matches)}</section>`;
      }
    } else {
      const key=type==='video'?'bvid':type==='user'?'mid':'id';
      const existing=new Set(searchRows.map(item=>item[key]));
      searchRows=append?[...searchRows,...result.items.filter(item=>!existing.has(item[key]))]:result.items;
      if(searchRows.length)content=renderSearchRows(type,searchRows);
      if(result.more&&searchRows.length)content+='<div class="load-more"><button id="search-more" class="secondary-button">加载更多</button></div>';
      $('search-count').textContent=result.total?`约 ${number(result.total)} 个结果`:'';
    }
    $('search-result').innerHTML=content||empty('没有找到相关结果','换个关键词，或试试其他分类。','search');
    updateSaved();
    return true;
  } catch(error) {
    if(turn!==generation)return false;
    if(append)toast(error.message);
    else $('search-result').innerHTML=empty('搜索暂时无法加载',error.message,'search')+'<div class="empty-action"><button class="primary-button" data-refresh>重试</button></div>';
    return false;
  } finally {
    if(turn===generation)searchBusy=false;
    if(next)next.disabled=false;
  }
}

document.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(!button||route.name!=='search')return;
  if(button.dataset.searchTab&&button.dataset.searchTab!==(route.searchType||'all'))
    navigate('search',{keyword:route.keyword,searchType:button.dataset.searchTab});
  else if(button.dataset.searchOrder&&button.dataset.searchOrder!==route.order)
    navigate('search',{keyword:route.keyword,searchType:'video',order:button.dataset.searchOrder});
  else if(button.id==='search-more')loadSearch(true);
});
