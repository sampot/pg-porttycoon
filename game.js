const copy = value => JSON.parse(JSON.stringify(value));
const clamp = (n,min,max) => Math.max(min,Math.min(max,n));
export const CONFIG = {"title":"藍港大亨","genre":"航運經營","visual":"tycoon","accent":"#48cae4","actions":{"route":"開闢航線","warehouse":"擴建倉庫","contract":"承接合約","market":"調整報價","next":"結算季度"},"help":"配置航線、倉儲與合約，在十二季內讓公司估值超越 AI 對手。圖表會記錄雙方走勢。","test":["route","warehouse","contract","next","route","contract","next","market","next"],"id":"pg-porttycoon"};
export function createGame({seed=1}={}) {
 const id=CONFIG.id, f={};
 if(id==="pg-casefile") Object.assign(f,{room:0,rooms:["檔案室","暗房","站長室"],clues:[],inventory:[],combined:false});
 if(id==="pg-township") Object.assign(f,{day:1,affection:{mira:0,ren:0,yu:0},memories:0,ending:null});
 if(id==="pg-campusbond") Object.assign(f,{day:1,stats:{study:20,bond:10,energy:70,money:10},schedule:[],ending:null});
 if(id==="pg-ghostmark") Object.assign(f,{mission:1,distance:0,alert:0,cameras:true,target:false});
 if(id==="pg-blackward") Object.assign(f,{distance:0,battery:70,noise:0,keys:0,threat:15});
 if(id==="pg-backdoor") Object.assign(f,{skills:{sneak:0,talk:0,fight:0,hack:0},path:null});
 if(id==="pg-blockcity") Object.assign(f,{grid:Array(25).fill("empty"),cursor:0,pop:0,happy:50,pollution:0});
 if(id==="pg-porttycoon") Object.assign(f,{quarter:1,cargo:0,capacity:5,value:12,rival:18,history:[[12,18]]});
 if(id==="pg-empirekitchen") Object.assign(f,{recipes:1,staff:1,shops:1,orders:3,kitchen:1});
 if(id==="pg-seacast") Object.assign(f,{phase:"ready",tension:0,spot:0,weather:["晴","雨","風"][seed%3],rod:1,dex:[]});
 if(id==="pg-templeidle") Object.assign(f,{incense:5,generators:0,multiplier:1,prestige:0,lastSeen:Date.now(),offline:0});
 return {seed,turn:0,score:0,resources:10,outcome:"playing",msg:CONFIG.help,flags:f};
}
export function getLegalActions(s){return s.outcome==="playing"?Object.keys(CONFIG.actions):[]}
function seeded(s,n=1){return ((s.seed*9301+s.turn*49297+n*233)%233280)/233280}
export function applyAction(state,action){
 const s=copy(state),f=s.flags; if(s.outcome!=="playing"||!CONFIG.actions[action]) return s; s.turn++;
 switch(CONFIG.id){
 case "pg-casefile":{
  const clue=["燒焦班表","半張底片","備用鑰匙"][f.room]; if(action==="move"){f.room=(f.room+1)%3;s.msg="進入"+f.rooms[f.room]}
  else if(action==="search"){if(!f.clues.includes(clue))f.clues.push(clue);s.msg="熱點中發現："+clue}
  else if(action==="take"){const c=f.clues.at(-1);if(c&&!f.inventory.includes(c))f.inventory.push(c);s.msg=c?"證物封存："+c:"沒有可收存的物件"}
  else if(action==="combine"){f.combined=f.inventory.includes("燒焦班表")&&f.inventory.includes("半張底片");s.msg=f.combined?"底片時間戳證明班表遭竄改":"這些證物還拼不起來"}
  else {if(f.combined&&f.clues.length===3){s.outcome="won";s.msg="你指認站長，舊案正式重啟。"}else{s.msg="檢察官退回指控：證據鏈不完整。"}}
  s.score=f.clues.length*20+f.inventory.length*10+(f.combined?30:0); break;}
 case "pg-township":{
  if(["mira","ren","yu"].includes(action)){f.affection[action]+=2;f.memories++;s.msg={mira:"美菈帶你看退潮後的舊碼頭。",ren:"阿任談起父親留下的貨車。",yu:"小雨從剪報裡找到失蹤祭典。"}[action]}
  else if(action==="work"){s.resources+=3;s.msg="你替漁船卸貨，也聽見新的流言。"} else s.msg="你在日記裡整理今天的矛盾。";
  f.day++; if(f.day>7){const [who,val]=Object.entries(f.affection).sort((a,b)=>b[1]-a[1])[0];f.ending=val>=8?who: f.memories>=4?"town":"leave";s.outcome="won";s.msg={mira:"結局〈潮汐同行〉：你與美菈接下地方報。",ren:"結局〈公路以南〉：你和阿任駕車採集口述史。",yu:"結局〈未完檔案〉：你與小雨重開鎮史館。",town:"結局〈眾人的鎮誌〉：你留下共同編纂。",leave:"結局〈末班車〉：你帶著未完稿離鎮。"}[f.ending]}
  s.score=f.memories*15;break;}
 case "pg-campusbond":{
  const x=f.stats;if(action==="study"){x.study+=12;x.energy-=12}else if(action==="club"){x.bond+=10;x.energy-=10}else if(action==="bond"){x.bond+=x.bond>=25?16:5;x.energy-=8}else if(action==="work"){x.money+=8;x.energy-=10}else{x.energy+=25}
  f.schedule.push(action);f.day++;x.energy=clamp(x.energy,0,100);s.msg="第 "+(f.day-1)+" 天："+CONFIG.actions[action];
  if(x.energy===0){s.outcome="lost";s.msg="你過勞休學。"}else if(f.day>10){f.ending=x.bond>=70?"together":x.study>=70?"honors":"balanced";s.outcome="won";s.msg={together:"結局：社辦屋頂的告白",honors:"結局：首席畢業與遠方來信",balanced:"結局：平凡卻閃亮的青春"}[f.ending]}s.score=x.study+x.bond+x.money;break;}
 case "pg-ghostmark":{
  if(action==="shadow"){f.alert=Math.max(0,f.alert-18);s.msg="巡邏燈從你肩旁掃過。"}else if(action==="disable"){f.cameras=false;f.alert+=6;s.msg="監視器畫面凍結。"}else if(action==="sneak"){f.distance+=28;f.alert+=f.cameras?18:8;s.msg="沿貨櫃陰影前進。"}else if(action==="objective"){if(f.distance>=55){f.target=true;s.msg="情報匣已取得。"}else s.msg="目標仍在封鎖區深處。"}else if(f.target&&f.distance>=55&&f.alert<80){f.mission++;if(f.mission>3){s.outcome="won";s.msg="三項任務完成，幽靈無痕撤離。"}else{Object.assign(f,{distance:0,alert:12,cameras:true,target:false});s.msg="撤離成功。下一任務開始。"}}else{s.msg="撤離點拒絕開門：目標或隱匿條件未達。"}
  f.alert=clamp(f.alert,0,100);if(f.alert>=100){s.outcome="lost";s.msg="警報鎖死整個區域。"}s.score=(f.mission-1)*100+f.distance-f.alert;break;}
 case "pg-blackward":{
  if(action==="flash"){f.battery-=12;f.noise+=3;s.msg="光束照出牆上新的抓痕。"}else if(action==="listen"){f.threat=Math.max(0,f.threat-8);f.noise=Math.max(0,f.noise-5);s.msg=f.threat>40?"腳步就在門外。":"遠處只有滴水聲。"}else if(action==="hide"){f.noise=0;f.threat=Math.max(5,f.threat-18);s.msg="你在鐵櫃裡屏住呼吸。"}else if(action==="advance"){f.distance+=14;f.noise+=12;f.threat+=10;if(f.distance>=22*(f.keys+1)&&f.keys<3){f.keys++;s.msg="講桌抽屜裡有一把刻號鑰匙。"}else s.msg="你穿過一段沒有窗的走廊。"}else if(f.keys===3&&f.distance>=65){s.outcome="won";s.msg="三道鎖彈開，黎明灌進校門。"}else s.msg="鎖孔不符。";
  f.battery=clamp(f.battery,0,100);f.threat+=Math.floor(f.noise/8);if(f.threat>=100){s.outcome="lost";s.msg="巡夜者在黑暗裡抓住你。"}s.score=f.keys*30+f.distance;break;}
 case "pg-backdoor":{
  if(action==="commit"){const best=Object.entries(f.skills).sort((a,b)=>b[1]-a[1])[0];if(best[1]>=4){f.path=best[0];s.outcome="won";s.msg={sneak:"你從冷卻管潛出，沒有攝影機拍到臉。",talk:"董事親自替你打開保險庫。",fight:"最後一道防爆門倒在你身後。",hack:"門禁把你識別為已退休的創辦人。"}[f.path]}else s.msg="至少把一條方案準備到 4 級。"}else{f.skills[action]++;s.msg=CONFIG.actions[action]+"，準備度 "+f.skills[action]+"/4"}s.score=Math.max(...Object.values(f.skills))*25;break;}
 case "pg-blockcity":{
  const cost={residential:2,commercial:2,industry:1,park:3,transit:4}[action];if(s.resources<cost){s.msg="預算不足。";break}const old=f.grid[f.cursor];if(old==="empty"){f.grid[f.cursor]=action;f.cursor=(f.cursor+1)%25;s.resources-=cost;if(action==="residential")f.pop+=25;if(action==="commercial"){s.resources+=5;f.happy+=3}if(action==="industry"){s.resources+=7;f.pollution+=12;f.happy-=5}if(action==="park"){f.happy+=12;f.pollution-=5}if(action==="transit"){f.happy+=6;f.pollution-=8}s.msg="第 "+f.cursor+" 街廓完成："+CONFIG.actions[action]}f.happy=clamp(f.happy-Math.floor(f.pollution/15),0,100);f.pollution=clamp(f.pollution,0,100);if(f.pop>=100&&f.happy>=55&&f.pollution<45){s.outcome="won";s.msg="市民公投通過：積木城正式升格。"}s.score=f.pop+f.happy-f.pollution;break;}
 case "pg-porttycoon":{
  if(action==="route"){s.resources-=3;f.cargo+=4;f.value+=3;s.msg="新航線帶回四櫃貨物。"}else if(action==="warehouse"){s.resources-=4;f.capacity+=5;f.value+=2;s.msg="自動倉儲上線。"}else if(action==="contract"){if(f.cargo>=3){f.cargo-=3;s.resources+=8;f.value+=5;s.msg="準時交付冷鏈合約。"}else s.msg="庫存不足三櫃。"}else if(action==="market"){s.resources-=2;f.rival-=3;f.value+=2;s.msg="短期報價搶走市場。"}else{f.quarter++;f.rival+=2+Math.floor(seeded(s)*3);f.value+=Math.floor(s.resources/8);s.resources+=2;f.history.push([f.value,f.rival]);s.msg="第 "+f.quarter+" 季財報公布。"}if(f.quarter>8){s.outcome=f.value>f.rival?"won":"lost";s.msg=s.outcome==="won"?"你的市值超越海岳航運。":"AI 對手取得港務特許權。"}s.score=f.value;break;}
 case "pg-empirekitchen":{
  if(action==="serve"){if(f.orders>0){const gain=f.recipes+f.staff+f.kitchen;s.resources+=gain;f.orders--;s.msg="完美出餐，收入 +"+gain}else s.msg="暫時沒有新單。";f.orders+=seeded(s)>0.35?1:0}else if(action==="recipe"){if(s.resources>=4){s.resources-=4;f.recipes++;s.msg="解鎖第 "+f.recipes+" 道招牌菜。"}}else if(action==="hire"){if(s.resources>=6){s.resources-=6;f.staff++;s.msg="新廚助今天報到。"}}else if(action==="upgrade"){if(s.resources>=7){s.resources-=7;f.kitchen++;s.msg="爐台升級，出餐更快。"}}else if(s.resources>=18&&f.recipes>=2){s.resources-=18;f.shops=2;s.outcome="won";s.msg="第二間店點亮招牌，灶腳帝國開張。"}else s.msg="需要 18 資金與至少兩份食譜。";s.score=f.shops*100+f.recipes*15+f.staff*10;break;}
 case "pg-seacast":{
  if(action==="spot"){f.spot=(f.spot+1)%3;f.phase="ready";s.msg="移往"+["防波堤","紅樹林","外海礁"][f.spot]+"。"}else if(action==="upgrade"){if(s.resources>=6){s.resources-=6;f.rod++;s.msg="釣竿升到 "+f.rod+" 級。"}}else if(action==="cast"){f.phase="hooked";f.tension=35+Math.floor(seeded(s)*30);s.msg="浮標下沉！保持張力。"}else if(action==="wait"&&f.phase==="hooked"){f.tension-=18;s.msg="放線，魚勢稍緩。"}else if(action==="reel"&&f.phase==="hooked"){f.tension+=22-f.rod*3;if(f.tension>=35&&f.tension<=75){const pool=[["鯖魚","竹筴魚"],["彈塗魚","烏魚"],["石斑","旗魚"]][f.spot],fish=pool[(s.turn+f.rod)%2];if(!f.dex.includes(fish))f.dex.push(fish);s.resources+=3;f.phase="ready";s.msg="釣上「"+fish+"」！"}else if(f.tension>90){f.phase="ready";s.msg="線斷了！"}}else s.msg="先拋竿等待咬鉤。";f.tension=clamp(f.tension,0,100);if(f.dex.length>=6){s.outcome="won";s.msg="六種魚完成圖鑑，海洋館邀你策展。"}s.score=f.dex.length*20+f.rod*5;break;}
 case "pg-templeidle":{
  if(action==="tap"){f.incense+=1+f.prestige;s.msg="香煙裊裊 +"+(1+f.prestige)}else if(action==="generator"){const cost=5*(f.generators+1);if(f.incense>=cost){f.incense-=cost;f.generators++;s.msg="新香爐開始自動聚香。"}else s.msg="需要 "+cost+" 香火。"}else if(action==="upgrade"){const cost=12*f.multiplier;if(f.incense>=cost){f.incense-=cost;f.multiplier++;s.msg="法會倍率提升。"}else s.msg="需要 "+cost+" 香火。"}else if(f.incense>=50){f.incense=0;f.generators=0;f.multiplier=1;f.prestige++;s.msg="金身重修，永久加成 +1。"}else s.msg="累積 50 香火才能重修。";f.incense+=f.generators*f.multiplier*(1+f.prestige);f.lastSeen=Date.now();s.score=Math.floor(f.incense)+f.prestige*100;if(f.prestige>=2)s.outcome="won";break;}
 } return s;
}
export function applyOffline(state,now=Date.now()){const s=copy(state);if(CONFIG.id!=="pg-templeidle")return s;const sec=clamp(Math.floor((now-s.flags.lastSeen)/1000),0,14400),gain=sec*s.flags.generators*s.flags.multiplier*(1+s.flags.prestige);s.flags.offline=gain;s.flags.incense+=gain;s.flags.lastSeen=now;s.msg=gain?"離線期間累積 "+gain+" 香火。":s.msg;return s}
export function summarize(s){return {turn:s.turn,score:s.score,resources:s.resources,outcome:s.outcome,msg:s.msg,flags:s.flags}}
export function getOutcome(s){return s.outcome}
