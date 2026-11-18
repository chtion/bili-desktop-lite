'use strict';
const {normalizeVideo,plainText}=require('./navigation');
const {positive}=require('./shows');
function collectionFromView(view){
  const s=view.ugc_season;if(!s)return null;
  return {id:positive(s.id),mid:positive(s.mid||view.owner?.mid),kind:'video',title:plainText(s.title),count:Number(s.ep_count)||0,sections:(s.sections||[]).map(g=>({title:plainText(g.title),items:(g.episodes||[]).map(e=>({...normalizeVideo({...e.arc,...e,bvid:e.bvid||e.arc?.bvid,pic:e.arc?.pic||e.cover}),title:plainText(e.title||e.arc?.title)})).filter(v=>v.bvid)}))};
}
module.exports={collectionFromView};
