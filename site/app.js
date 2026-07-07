"use strict";
(function(){
const $=s=>document.querySelector(s);
const errbox=$('#errbox');
function err(e){ if(errbox) errbox.textContent+=((e&&(e.message||e))+"\n"); }
window.addEventListener('error',ev=>err(ev.error||ev.message));

const R=window.__REGISTRY__, D=window.__LAYERDATA__, B=window.__BASEMAPS__;
const live=R.layers.filter(l=>l.status==='live');
const byId={}; R.layers.forEach(l=>byId[l.id]=l);
const themeById={}; R.themes.forEach(t=>themeById[t.id]=t);
const fmtInt=n=>Number(n||0).toLocaleString('en-US');
const MONTHS=["","January","February","March","April","May","June","July","August","September","October","November","December"];
const STATE_POSTAL={"Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA","Colorado":"CO","Connecticut":"CT","Delaware":"DE","District of Columbia":"DC","Florida":"FL","Georgia":"GA","Hawaii":"HI","Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS","Kentucky":"KY","Louisiana":"LA","Maine":"ME","Maryland":"MD","Massachusetts":"MA","Michigan":"MI","Minnesota":"MN","Mississippi":"MS","Missouri":"MO","Montana":"MT","Nebraska":"NE","Nevada":"NV","New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND","Ohio":"OH","Oklahoma":"OK","Oregon":"OR","Pennsylvania":"PA","Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD","Tennessee":"TN","Texas":"TX","Utah":"UT","Vermont":"VT","Virginia":"VA","Washington":"WA","West Virginia":"WV","Wisconsin":"WI","Wyoming":"WY"};
const STATE_NAME={}; Object.keys(STATE_POSTAL).forEach(n=>STATE_NAME[STATE_POSTAL[n]]=n);
const ISO_NUM={MX:"484",PH:"608",BR:"076",DE:"276",FR:"250",IT:"380",GB:"826",ES:"724",CA:"124",JP:"392",PL:"616",AR:"032",NL:"528",CO:"170",UA:"804",AU:"036",EG:"818",PE:"604",CL:"152",US:"840"};
const TINY_STATES=new Set(["RI","DE","DC","CT","NJ","MA","MD","NH","VT"]);

// visual voice per layer
const VIS={
 'memory-births':{cellCore:.40,starCore:.62,cA:.5},
 'power-datacenters':{r:2.35,core:.76,cA:.42},
 'power-fortune500':{core:.72},
 'motion-fulfillment':{core:.72,cA:.36},
 'loss-crashes':{r:1.45,core:.38,cA:.42},
 'omen-names':{r:2.0,core:.6}
};
const CONTOUR_T=[.10,.18,.30,.45,.62,.82];

// ---------- geometry ----------
const topo=window.topojson;
const geo={
 land:topo.feature(B.land,B.land.objects.land),
 countries:topo.feature(B.countries,B.countries.objects.countries).features,
 countryMesh:topo.mesh(B.countries,B.countries.objects.countries,(a,b)=>a!==b),
 states:topo.feature(B.states,B.states.objects.states).features,
 stateMesh:topo.mesh(B.states,B.states.objects.states,(a,b)=>a!==b),
 nation:topo.feature(B.nation,B.nation.objects.nation)
};

// ---------- state ----------
let scope='us';
let t=d3.zoomIdentity;
const alpha={},target={};
live.forEach(l=>{alpha[l.id]=1;target[l.id]=1;});
let dirty=true,terrainDirty=true,plateOpen=null,savedTargets=null;
let W=0,H=0,dpr=1;
const SC={};           // per-scope caches
const glowBMs={};      // lid -> {cv,ctx,t:{k,x,y}}
let qt=null,qtTimer=null,bakeTimer=null;
let hoverPt=null;

const cvs={base:$('#cvBase'),terr:$('#cvTerrain'),glow:$('#cvGlow'),lab:$('#cvLabel')};
const ctxs={};
const hitCv=document.createElement('canvas');
const hitCtx=hitCv.getContext('2d');

function sizeCanvases(){
 W=window.innerWidth;H=window.innerHeight;dpr=Math.min(window.devicePixelRatio||1,2);
 for(const k in cvs){const c=cvs[k];c.width=Math.round(W*dpr);c.height=Math.round(H*dpr);ctxs[k]=c.getContext('2d');}
}
function padLeft(){const r=$('#rail');const rb=r?r.getBoundingClientRect():{right:340};return Math.min(rb.right+22,W*0.42);}
function extent(){return [[padLeft(),108],[W-46,H-86]];}

function hexA(hex,a){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return `rgba(${r},${g},${b},${a})`;}
function mixWhite(hex,f){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return `rgb(${Math.round(r+(255-r)*f)},${Math.round(g+(255-g)*f)},${Math.round(b+(255-b)*f)})`;}

function makeSprite(hex,core){
 const S=64,c=document.createElement('canvas');c.width=S;c.height=S;const x=c.getContext('2d');
 const g=x.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2);
 g.addColorStop(0,hexA('#ffffff',0)); // placeholder replaced below
 const grad=x.createRadialGradient(S/2,S/2,0,S/2,S/2,S/2);
 grad.addColorStop(0,`rgba(255,255,255,${core})`);
 grad.addColorStop(.18,hexA(hex,core*.85));
 grad.addColorStop(.45,hexA(hex,core*.30));
 grad.addColorStop(1,hexA(hex,0));
 x.fillStyle=grad;x.fillRect(0,0,S,S);
 return c;
}
const SPR={};
function buildSprites(){
 SPR.memCell=makeSprite(byId['memory-births'].accent,VIS['memory-births'].cellCore);
 SPR.memStar=makeSprite(byId['memory-births'].accent,VIS['memory-births'].starCore);
 SPR.dc=makeSprite(byId['power-datacenters'].accent,VIS['power-datacenters'].core);
 SPR.f500=makeSprite(byId['power-fortune500'].accent,VIS['power-fortune500'].core);
 SPR.ful=makeSprite(byId['motion-fulfillment'].accent,VIS['motion-fulfillment'].core);
 SPR.crash=makeSprite(byId['loss-crashes'].accent,VIS['loss-crashes'].core);
 SPR.omenD=makeSprite(byId['omen-names'].accent,VIS['omen-names'].core);
 SPR.omenL=makeSprite(byId['omen-names'].accent2||'#f2ead8',VIS['omen-names'].core);
}

function projArrays(proj,lonA,latA){
 const n=lonA.length,xs=new Float32Array(n),ys=new Float32Array(n),keep=new Uint8Array(n);
 for(let i=0;i<n;i++){const p=proj([lonA[i],latA[i]]);if(p){xs[i]=p[0];ys[i]=p[1];keep[i]=1;}}
 return {xs,ys,keep,n};
}

function gaussBlur(src,GW,GH){
 const R2=6,sig=2.3,K=[];let ks=0;
 for(let i=-R2;i<=R2;i++){const v=Math.exp(-i*i/(2*sig*sig));K.push(v);ks+=v;}
 for(let i=0;i<K.length;i++)K[i]/=ks;
 const tmp=new Float32Array(src.length),out=new Float32Array(src.length);
 for(let y=0;y<GH;y++)for(let x=0;x<GW;x++){let s=0;for(let k=-R2;k<=R2;k++){const xx=Math.min(GW-1,Math.max(0,x+k));s+=src[y*GW+xx]*K[k+R2];}tmp[y*GW+x]=s;}
 for(let y=0;y<GH;y++)for(let x=0;x<GW;x++){let s=0;for(let k=-R2;k<=R2;k++){const yy=Math.min(GH-1,Math.max(0,y+k));s+=tmp[yy*GW+x]*K[k+R2];}out[y*GW+x]=s;}
 return out;
}

function buildScope(s){
 if(SC[s])return SC[s];
 const ext=extent();
 const proj=s==='us'
   ? d3.geoAlbersUsa().fitExtent(ext,geo.nation)
   : d3.geoEqualEarth().fitExtent([[ext[0][0],ext[0][1]+8],[ext[1][0],ext[1][1]-8]],{type:'Sphere'});
 const gp=d3.geoPath(proj);
 const C={proj,ext,gp,paths:{},layers:{},grids:{},contours:{},statePaths:{},stateCent:{},countryPaths:{},countryCent:{}};
 // base paths
 if(s==='world'){
  C.paths.sphere=new Path2D(gp({type:'Sphere'}));
  C.paths.grat=new Path2D(gp(d3.geoGraticule10()));
  C.paths.land=new Path2D(gp(geo.land));
  C.paths.borders=new Path2D(gp(geo.countryMesh));
  for(const iso in ISO_NUM){
   const f=geo.countries.find(f=>String(f.id)===ISO_NUM[iso]);
   if(f){C.countryPaths[iso]=new Path2D(gp(f));C.countryCent[iso]=gp.centroid(f);}
  }
 }else{
  C.paths.nation=new Path2D(gp(geo.nation));
  C.paths.stateMesh=new Path2D(gp(geo.stateMesh));
  geo.states.forEach(f=>{
   const po=STATE_POSTAL[f.properties.name];if(!po)return;
   const d=gp(f);if(!d)return;
   C.statePaths[po]=new Path2D(d);C.stateCent[po]=gp.centroid(f);
  });
 }
 // layer projections
 for(const l of live){
  if(!l.scopes.includes(s))continue;
  const d=D[l.id];if(!d)continue;
  if(d.kind==='memory'){
   C.layers[l.id]={cells:projArrays(proj,d.cells.lon,d.cells.lat),stars:projArrays(proj,d.stars.lon,d.stars.lat)};
  }else if(d.kind==='points'){
   C.layers[l.id]={pts:projArrays(proj,d.lon,d.lat)};
  }
 }
 // density grids + contours
 const exw=ext[1][0]-ext[0][0],exh=ext[1][1]-ext[0][1];
 const GW=340,GH=Math.max(80,Math.round(GW*exh/exw));
 C.GW=GW;C.GH=GH;
 for(const l of live){
  if(!l.scopes.includes(s)||!D[l.id])continue;
  if(!(l.weight>0))continue;
  const d=D[l.id],grid=new Float32Array(GW*GH);
  const put=(x,y,w)=>{
   const gx=Math.floor((x-ext[0][0])/exw*GW),gy=Math.floor((y-ext[0][1])/exh*GH);
   if(gx>=0&&gx<GW&&gy>=0&&gy<GH)grid[gy*GW+gx]+=w;
  };
  if(d.kind==='memory'){
   const P=C.layers[l.id].cells;
   for(let i=0;i<P.n;i++)if(P.keep[i])put(P.xs[i],P.ys[i],Math.log1p(d.cells.v[i]));
  }else{
   const P=C.layers[l.id].pts;
   const vv=d.v;
   for(let i=0;i<P.n;i++)if(P.keep[i])put(P.xs[i],P.ys[i],vv?Math.min(vv[i],4):1);
  }
  let g=gaussBlur(grid,GW,GH);
  const nz=[];for(let i=0;i<g.length;i++)if(g[i]>0)nz.push(g[i]);
  nz.sort((a,b)=>a-b);
  const p99=nz.length?nz[Math.min(nz.length-1,Math.floor(nz.length*.996))]:1;
  for(let i=0;i<g.length;i++)g[i]=Math.min(1,g[i]/p99);
  C.grids[l.id]=g;
  if(l.forms.contours){
   const cs=d3.contours().size([GW,GH]).thresholds(CONTOUR_T)(g);
   C.contours[l.id]=cs.map((c,ci)=>{
    const p=new Path2D();
    c.coordinates.forEach(poly=>poly.forEach(ring=>{
     ring.forEach((pt,j)=>{
      const x=ext[0][0]+pt[0]/GW*exw,y=ext[0][1]+pt[1]/GH*exh;
      j?p.lineTo(x,y):p.moveTo(x,y);
     });p.closePath();
    }));
    return {p,i:ci};
   });
  }
 }
 // shade canvas
 C.shadeCv=document.createElement('canvas');C.shadeCv.width=GW;C.shadeCv.height=GH;
 C.shadeCtx=C.shadeCv.getContext('2d');
 SC[s]=C;
 return C;
}

function scopeHas(lid){return byId[lid].scopes.includes(scope);}
function activeIds(){return live.filter(l=>scopeHas(l.id)&&target[l.id]>0).map(l=>l.id);}

// ---------- terrain ----------
function recomputeShade(){
 const C=SC[scope],GW=C.GW,GH=C.GH;
 const E=new Float32Array(GW*GH);let mx=0;
 for(const l of live){
  const g=C.grids[l.id];if(!g)continue;
  const a=alpha[l.id]*(l.weight||0);if(a<=0.01)continue;
  for(let i=0;i<E.length;i++)E[i]+=g[i]*a;
 }
 for(let i=0;i<E.length;i++)if(E[i]>mx)mx=E[i];
 if(mx>0)for(let i=0;i<E.length;i++)E[i]/=mx;
 const img=C.shadeCtx.createImageData(GW,GH);
 const data=img.data,Z=26,lx=-0.577,ly=-0.577,lz=0.577;
 for(let y=0;y<GH;y++)for(let x=0;x<GW;x++){
  const i=y*GW+x;
  const e=E[i];if(e<=0.004)continue;
  const x0=Math.max(0,x-1),x1=Math.min(GW-1,x+1),y0=Math.max(0,y-1),y1=Math.min(GH-1,y+1);
  let nx=-(E[y*GW+x1]-E[y*GW+x0])*Z*.5,ny=-(E[y1*GW+x]-E[y0*GW+x])*Z*.5,nz=1;
  const nl=Math.sqrt(nx*nx+ny*ny+nz*nz);nx/=nl;ny/=nl;nz/=nl;
  const ndl=nx*lx+ny*ly+nz*lz;
  const m=Math.pow(e,.6);
  // compose: mass tint + lit + shadow
  let r=110,g=140,b=190,a=m*.055;
  const lit=Math.max(0,(ndl-.42)*1.8)*m*.14;
  const sh=Math.max(0,(.42-ndl)*1.6)*m*.22;
  // over-composite lit (light blue-white)
  let na=a+lit*(1-a);
  if(na>0){r=(r*a*(1-lit)+208*lit)/na;g=(g*a*(1-lit)+224*lit)/na;b=(b*a*(1-lit)+252*lit)/na;a=na;}
  // over-composite shadow (black)
  na=a+sh*(1-a);
  if(na>0){r=r*a*(1-sh)/na;g=g*a*(1-sh)/na;b=b*a*(1-sh)/na;a=na;}
  const o=i*4;data[o]=r;data[o+1]=g;data[o+2]=b;data[o+3]=Math.min(255,a*255);
 }
 C.shadeCtx.putImageData(img,0,0);
 terrainDirty=false;
}

// ---------- draw ----------
function applyT(ctx){ctx.setTransform(dpr*t.k,0,0,dpr*t.k,dpr*t.x,dpr*t.y);}
function idT(ctx){ctx.setTransform(dpr,0,0,dpr,0,0);}

let hatchPat=null;
function hatch(ctx){
 if(hatchPat)return hatchPat;
 const c=document.createElement('canvas');c.width=8;c.height=8;const x=c.getContext('2d');
 x.strokeStyle='rgba(255,79,154,0.10)';x.lineWidth=1;
 x.beginPath();x.moveTo(-2,10);x.lineTo(10,-2);x.stroke();
 x.beginPath();x.moveTo(-2,4);x.lineTo(4,-2);x.stroke();
 hatchPat=ctx.createPattern(c,'repeat');return hatchPat;
}

function drawBase(){
 const ctx=ctxs.base,C=SC[scope];
 idT(ctx);ctx.clearRect(0,0,W,H);
 ctx.fillStyle='#070a10';ctx.fillRect(0,0,W,H);
 applyT(ctx);
 const lw=x=>x/t.k;
 if(scope==='world'){
  ctx.strokeStyle='rgba(64,86,120,.35)';ctx.lineWidth=lw(1);ctx.stroke(C.paths.sphere);
  ctx.strokeStyle='rgba(38,52,76,.28)';ctx.lineWidth=lw(.5);ctx.stroke(C.paths.grat);
  ctx.fillStyle='#0e131b';ctx.fill(C.paths.land);
  ctx.strokeStyle='rgba(80,98,126,.45)';ctx.lineWidth=lw(.6);ctx.stroke(C.paths.land);
  ctx.strokeStyle='rgba(52,66,92,.5)';ctx.lineWidth=lw(.45);ctx.stroke(C.paths.borders);
 }else{
  ctx.fillStyle='#0e131b';ctx.fill(C.paths.nation);
  ctx.strokeStyle='rgba(58,74,100,.55)';ctx.lineWidth=lw(.55);ctx.stroke(C.paths.stateMesh);
  ctx.strokeStyle='rgba(96,116,148,.6)';ctx.lineWidth=lw(1);ctx.stroke(C.paths.nation);
 }
 // desire tint
 const dl=byId['desire-searches'];
 const da=alpha['desire-searches']||0;
 if(da>0.02&&dl.scopes.includes(scope)){
  const dd=D['desire-searches'];
  if(scope==='us'){
   ctx.save();
   for(const st in dd.us){
    const p=C.statePaths[st];if(!p)continue;
    ctx.fillStyle=hexA(dl.accent,.075*da);ctx.fill(p);
   }
   for(const st of dd.dark){
    const p=C.statePaths[st];if(!p)continue;
    ctx.fillStyle=`rgba(3,5,9,${.52*da})`;ctx.fill(p);
    ctx.fillStyle=hatch(ctx);ctx.fill(p);
   }
   ctx.restore();
  }else{
   for(const iso in dd.world){
    const p=C.countryPaths[iso];if(!p)continue;
    ctx.fillStyle=hexA(dl.accent,.10*da);ctx.fill(p);
   }
  }
 }
}

function drawTerrain(){
 const ctx=ctxs.terr,C=SC[scope];
 if(terrainDirty)recomputeShade();
 idT(ctx);ctx.clearRect(0,0,W,H);
 applyT(ctx);
 const ext=C.ext,exw=ext[1][0]-ext[0][0],exh=ext[1][1]-ext[0][1];
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 ctx.globalAlpha=1;ctx.drawImage(C.shadeCv,ext[0][0],ext[0][1],exw,exh);
 for(const l of live){
  const cs=C.contours[l.id];if(!cs)continue;
  const a=alpha[l.id];if(a<=0.02)continue;
  const cA=(VIS[l.id]&&VIS[l.id].cA)||.4;
  ctx.strokeStyle=l.accent;
  for(const c of cs){
   ctx.globalAlpha=a*cA*(.3+.7*c.i/(CONTOUR_T.length-1));
   ctx.lineWidth=(0.5+c.i*0.09)/t.k;
   ctx.stroke(c.p);
  }
 }
 ctx.globalAlpha=1;
}

function drawPointsTo(ctx,lid){
 // draws layer's points in SCREEN space under current t (ctx pre-set to identity*dpr)
 const C=SC[scope],d=D[lid],L=C.layers[lid];if(!L)return;
 const k=t.k,kk=Math.pow(k,.42);
 const draw=(spr,x,y,r)=>{const sx=x*k+t.x,sy=y*k+t.y;if(sx<-60||sx>W+60||sy<-60||sy>H+60)return;const rr=r*kk;ctx.drawImage(spr,sx-rr,sy-rr,rr*2,rr*2);};
 if(d.kind==='memory'){
  const wf=scope==='world'?0.68:1;
  const P=L.cells,vv=d.cells.v;
  for(let i=0;i<P.n;i++){if(!P.keep[i])continue;const r=(1.1+Math.log1p(vv[i])*0.62)*wf;draw(SPR.memCell,P.xs[i],P.ys[i],Math.min(r,7.5*wf));}
  const S=L.stars,sv=d.stars.v;
  for(let i=0;i<S.n;i++){if(!S.keep[i])continue;draw(SPR.memStar,S.xs[i],S.ys[i],(1.2+sv[i]*.014)*wf);}
 }else{
  const P=L.pts;
  if(lid==='loss-crashes'){
   const vv=d.v;
   for(let i=0;i<P.n;i++){if(!P.keep[i])continue;draw(SPR.crash,P.xs[i],P.ys[i],Math.min(1.55+(vv[i]-1)*.8,4.2));}
  }else if(lid==='power-datacenters'){
   for(let i=0;i<P.n;i++){if(!P.keep[i])continue;draw(SPR.dc,P.xs[i],P.ys[i],2.0);}
  }else if(lid==='power-fortune500'){
   const vv=d.v;
   for(let i=0;i<P.n;i++){if(!P.keep[i])continue;draw(SPR.f500,P.xs[i],P.ys[i],1.7+Math.sqrt(Math.max(vv[i],0))/826*7);}
  }else if(lid==='motion-fulfillment'){
   const tt=d.t;
   for(let i=0;i<P.n;i++){if(!P.keep[i])continue;draw(SPR.ful,P.xs[i],P.ys[i],tt[i]===2?3.1:tt[i]===1?2.1:2.6);}
  }else if(lid==='omen-names'){
   const ss=d.s;
   for(let i=0;i<P.n;i++){if(!P.keep[i])continue;draw(ss[i]?SPR.omenL:SPR.omenD,P.xs[i],P.ys[i],2.0);}
  }
 }
}

function bakeGlow(){
 for(const lid of activeIds()){
  const l=byId[lid];if(!(l.forms.points))continue;
  let bm=glowBMs[lid];
  if(!bm){const cv=document.createElement('canvas');bm=glowBMs[lid]={cv,ctx:cv.getContext('2d')};}
  if(bm.cv.width!==Math.round(W*dpr)||bm.cv.height!==Math.round(H*dpr)){bm.cv.width=Math.round(W*dpr);bm.cv.height=Math.round(H*dpr);}
  const x=bm.ctx;
  x.setTransform(dpr,0,0,dpr,0,0);
  x.clearRect(0,0,W,H);
  x.globalCompositeOperation='lighter';
  drawPointsTo(x,lid);
  bm.t={k:t.k,x:t.x,y:t.y};
 }
 dirty=true;
}

function drawGlow(){
 const ctx=ctxs.glow;
 idT(ctx);ctx.clearRect(0,0,W,H);
 ctx.globalCompositeOperation='lighter';
 ctx.imageSmoothingEnabled=true;
 for(const l of live){
  const lid=l.id;if(!l.forms.points)continue;
  const a=alpha[lid];if(a<=0.01||!scopeHas(lid))continue;
  const bm=glowBMs[lid];if(!bm||!bm.t)continue;
  const s=t.k/bm.t.k,ox=t.x-s*bm.t.x,oy=t.y-s*bm.t.y;
  ctx.setTransform(dpr*s,0,0,dpr*s,dpr*ox,dpr*oy);
  ctx.globalAlpha=a;
  ctx.drawImage(bm.cv,0,0,W,H);
 }
 ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
}

// ---------- labels ----------
function haloText(ctx,str,x,y,font,fill,align){
 ctx.font=font;ctx.textAlign=align||'center';ctx.textBaseline='middle';
 ctx.lineWidth=3;ctx.strokeStyle='rgba(5,8,13,.85)';ctx.lineJoin='round';
 ctx.strokeText(str,x,y);ctx.fillStyle=fill;ctx.fillText(str,x,y);
}
function drawLabels(){
 const ctx=ctxs.lab,C=SC[scope];
 idT(ctx);ctx.clearRect(0,0,W,H);
 const occ=new Set();
 const free=(x,y,w)=>{
  for(let dx=-w;dx<=w;dx+=70){const key=Math.round((x+dx)/70)+','+Math.round(y/24);if(occ.has(key))return false;}
  return true;
 };
 const take=(x,y,w)=>{for(let dx=-w;dx<=w;dx+=70){occ.add(Math.round((x+dx)/70)+','+Math.round(y/24));}};
 const S=(x,y)=>[x*t.k+t.x,y*t.k+t.y];
 // desire terms
 const da=alpha['desire-searches']||0;
 if(da>0.4&&scopeHas('desire-searches')){
  const dd=D['desire-searches'],ac=byId['desire-searches'].accent;
  if(scope==='us'){
   for(const st in dd.us){
    if(TINY_STATES.has(st)&&t.k<2.1)continue;
    const c=C.stateCent[st];if(!c)continue;
    const [sx,sy]=S(c[0],c[1]);
    if(sx<padLeft()-30||sx>W||sy<90||sy>H-70)continue;
    let term=dd.us[st];if(term.length>22)term=term.slice(0,21)+'…';
    haloText(ctx,st,sx,sy-9,'500 7.5px "IBM Plex Mono"','rgba(138,148,166,'+(.85*da)+')');
    haloText(ctx,term.toLowerCase(),sx,sy+3,'500 10px "IBM Plex Mono"',hexA(ac,.95*da));
   }
  }else{
   for(const iso in dd.world){
    const c=C.countryCent[iso];if(!c)continue;
    const [sx,sy]=S(c[0],c[1]);
    if(sx<padLeft()-30||sx>W||sy<90||sy>H-70)continue;
    if(!free(sx,sy,70))continue;take(sx,sy,70);
    const e=dd.world[iso];
    haloText(ctx,e.country.toUpperCase(),sx,sy-9,'500 7px "IBM Plex Mono"','rgba(138,148,166,'+(.85*da)+')');
    haloText(ctx,String(e.label).toLowerCase(),sx,sy+3,'500 9.5px "IBM Plex Mono"',hexA(ac,.95*da));
   }
  }
 }
 // memory star names
 const ma=alpha['memory-births']||0;
 if(ma>0.5&&scopeHas('memory-births')&&t.k>=2.3){
  const L=C.layers['memory-births'].stars,d=D['memory-births'].stars;
  let shown=0;
  for(let i=0;i<L.n&&shown<26;i++){
   if(!L.keep[i])continue;
   const [sx,sy]=S(L.xs[i],L.ys[i]);
   if(sx<padLeft()||sx>W-20||sy<100||sy>H-80)continue;
   if(!free(sx,sy,70))continue;take(sx,sy,70);
   haloText(ctx,d.name[i],sx,sy-9,'italic 600 11px "Fraunces"','rgba(255,222,150,'+(.95*ma)+')');
   shown++;
  }
 }
 // f500 names
 const fa=alpha['power-fortune500']||0;
 if(fa>0.5&&scopeHas('power-fortune500')&&t.k>=3.4){
  const L=C.layers['power-fortune500']?C.layers['power-fortune500'].pts:null;
  if(L){const d=D['power-fortune500'];let shown=0;
   for(let i=0;i<L.n&&shown<16;i++){
    if(!L.keep[i])continue;
    const [sx,sy]=S(L.xs[i],L.ys[i]);
    if(sx<padLeft()||sx>W-20||sy<100||sy>H-80)continue;
    if(!free(sx,sy,60))continue;take(sx,sy,60);
    haloText(ctx,d.name[i],sx,sy+11,'500 9px "Space Grotesk"','rgba(197,182,252,'+(.9*fa)+')');
    shown++;
   }}
 }
 // omen names
 const oa=alpha['omen-names']||0;
 if(oa>0.5&&scopeHas('omen-names')&&t.k>=4.6){
  const L=C.layers['omen-names']?C.layers['omen-names'].pts:null;
  if(L){const d=D['omen-names'];let shown=0;
   for(let i=0;i<L.n&&shown<22;i++){
    if(!L.keep[i])continue;
    const [sx,sy]=S(L.xs[i],L.ys[i]);
    if(sx<padLeft()||sx>W-20||sy<100||sy>H-80)continue;
    if(!free(sx,sy,60))continue;take(sx,sy,60);
    haloText(ctx,d.name[i],sx,sy-8,'400 8.5px "IBM Plex Mono"',d.s[i]?'rgba(242,234,216,.9)':'rgba(255,120,100,.9)');
    shown++;
   }}
 }
 // hover ring
 if(hoverPt){
  const [sx,sy]=S(hoverPt.x,hoverPt.y);
  ctx.strokeStyle=hoverPt.color;ctx.lineWidth=1;ctx.globalAlpha=.9;
  ctx.beginPath();ctx.arc(sx,sy,7,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
 }
}

// ---------- tween/frame ----------
function tickTween(){
 let moving=false;
 for(const l of live){
  const id=l.id,tg=target[id],a=alpha[id];
  if(Math.abs(tg-a)>0.012){alpha[id]=a+(tg-a)*.16;moving=true;}
  else if(a!==tg){alpha[id]=tg;moving=true;}
 }
 return moving;
}
function frame(){
 requestAnimationFrame(frame);
 const tw=tickTween();
 if(tw)terrainDirty=true;
 if(!dirty&&!tw)return;
 drawBase();drawTerrain();drawGlow();drawLabels();
 dirty=false;
}

// ---------- quadtree/hover ----------
function rebuildQt(){
 const C=SC[scope],items=[];
 for(const lid of activeIds()){
  const l=byId[lid];if(!l.forms.points)continue;
  const L=C.layers[lid];if(!L)continue;
  if(D[lid].kind==='memory'){
   const P=L.cells;for(let i=0;i<P.n;i++)if(P.keep[i])items.push({x:P.xs[i],y:P.ys[i],lid,i,kind:'cell'});
   const St=L.stars;for(let i=0;i<St.n;i++)if(St.keep[i])items.push({x:St.xs[i],y:St.ys[i],lid,i,kind:'star'});
  }else{
   const P=L.pts;for(let i=0;i<P.n;i++)if(P.keep[i])items.push({x:P.xs[i],y:P.ys[i],lid,i,kind:'pt'});
  }
 }
 qt=d3.quadtree().x(d=>d.x).y(d=>d.y).addAll(items);
}
function scheduleQt(){clearTimeout(qtTimer);qtTimer=setTimeout(rebuildQt,260);}

const tip=$('#tooltip');
function tipHTML(f){
 const l=byId[f.lid],d=D[f.lid];
 let k=l.title.toUpperCase(),ti='',s='';
 if(f.kind==='star'){const st=d.stars;ti='★ '+st.name[f.i];s=(st.birth[f.i]?'b. '+st.birth[f.i]+' · ':'')+(st.dom[f.i]||'')+`<br>visibility ${st.v[f.i]} / 100`;}
 else if(f.kind==='cell'){const v=d.cells.v[f.i];ti=fmtInt(v)+' remembered birth'+(v>1?'s':'')+' near here';const lab=d.cells.lab[String(f.i)];if(lab)s='brightest: '+lab;}
 else if(f.lid==='loss-crashes'){const v=d.v[f.i];ti=v===1?'One person died here':v+' people died here';s=MONTHS[d.m[f.i]]+' 2023 · fatal crash';}
 else if(f.lid==='power-datacenters'){ti=d.name[f.i]||'Unnamed facility';s='data center';}
 else if(f.lid==='power-fortune500'){const v=d.v[f.i];ti='#'+d.rank[f.i]+' '+d.name[f.i];s=d.loc[f.i]+' · $'+(v>=1e6?(v/1e6).toFixed(2)+'T':v>=1000?(v/1000).toFixed(1)+'B':v+'M')+' revenue';}
 else if(f.lid==='motion-fulfillment'){ti=d.name[f.i]||'Amazon facility';s=(d.typeNames[d.t[f.i]]||'')+' · '+d.loc[f.i];}
 else if(f.lid==='omen-names'){ti=d.name[f.i];s=(d.s[f.i]?'light':'dark')+' name · '+d.cls[f.i]+', '+d.st[f.i];}
 return {k,ti,s,color:f.lid==='omen-names'&&d.s[f.i]?(byId[f.lid].accent2||'#f2ead8'):l.accent};
}
function regionTip(qx,qy){
 const da=alpha['desire-searches']||0;
 if(da<=0.3||!scopeHas('desire-searches'))return null;
 const C=SC[scope],dd=D['desire-searches'],l=byId['desire-searches'];
 idT(hitCtx);
 if(scope==='us'){
  for(const st in C.statePaths){
   if(hitCtx.isPointInPath(C.statePaths[st],qx*dpr,qy*dpr)){
    if(dd.us[st])return {k:'THE GEOGRAPHY OF DESIRE',ti:STATE_NAME[st]||st,s:'top relative search: <b>'+dd.us[st]+'</b>',color:l.accent};
    if(dd.dark.includes(st))return {k:'NO SIGNAL',ti:STATE_NAME[st]||st,s:'Pornhub blocks access here (age-verification law).<br>Desire unmeasured — dark territory.',color:'#5a6577'};
    return null;
   }
  }
 }else{
  for(const iso in C.countryPaths){
   if(hitCtx.isPointInPath(C.countryPaths[iso],qx*dpr,qy*dpr)){
    const e=dd.world[iso];
    return {k:'THE GEOGRAPHY OF DESIRE',ti:e.country,s:(e.kind==='top_category'?'top relative category: ':'signature search: ')+'<b>'+e.label+'</b>',color:l.accent};
   }
  }
 }
 return null;
}
let tipRAF=false;
function onMove(ev){
 const mx=ev.clientX,my=ev.clientY;
 if(tipRAF)return;tipRAF=true;
 requestAnimationFrame(()=>{
  tipRAF=false;
  const qx=(mx-t.x)/t.k,qy=(my-t.y)/t.k;
  // live coordinate readout
  const C=SC[scope];
  try{
   const g=C.proj.invert?C.proj.invert([qx,qy]):null;
   if(g&&isFinite(g[0])&&isFinite(g[1])&&Math.abs(g[1])<=90){
    $('#datum').textContent=Math.abs(g[1]).toFixed(3)+'°'+(g[1]>=0?'N':'S')+'  '+Math.abs(g[0]).toFixed(3)+'°'+(g[0]>=0?'E':'W');
   }
  }catch(e){}
  let f=qt?qt.find(qx,qy,14/Math.max(1,t.k)):null;
  let content=f?tipHTML(f):regionTip(qx,qy);
  if(f){hoverPt={x:f.x,y:f.y,color:content.color};dirty=true;}
  else if(hoverPt){hoverPt=null;dirty=true;}
  if(content){
   tip.style.display='block';
   tip.style.borderLeftColor=content.color;
   tip.innerHTML='<div class="tt-k" style="color:'+content.color+'">'+content.k+'</div><div class="tt-t">'+content.ti+'</div>'+(content.s?'<div class="tt-s">'+content.s+'</div>':'');
   const tw=tip.offsetWidth,th=tip.offsetHeight;
   tip.style.left=Math.min(mx+16,W-tw-14)+'px';
   tip.style.top=Math.min(my+16,H-th-14)+'px';
  }else tip.style.display='none';
 });
}

// ---------- UI ----------
function updateStatline(){
 const parts=activeIds().map(lid=>byId[lid].statline).filter(Boolean);
 $('#statline').textContent=parts.join('  ·  ');
}
function updateDatumDefault(){
 $('#datum').textContent=scope==='us'?'DATUM WGS84 → ALBERS EQUAL-AREA':'DATUM WGS84 → EQUAL EARTH';
}
function updateScalebar(){
 try{
  const C=SC[scope],cx=(C.ext[0][0]+C.ext[1][0])/2,cy=(C.ext[0][1]+C.ext[1][1])/2;
  const inv=p=>C.proj.invert((p));
  const a=inv([(cx-t.x)/t.k,(cy-t.y)/t.k]),b=inv([(cx+120-t.x)/t.k,(cy-t.y)/t.k]);
  if(!a||!b||!isFinite(a[0])||!isFinite(b[0]))throw 0;
  const km=d3.geoDistance(a,b)*6371;
  const nice=[5,10,20,50,100,200,500,1000,2000,5000].filter(n=>n<=km).pop()||5;
  $('#sbBar').style.width=(nice/km*120)+'px';
  $('#sbLabel').textContent=nice+' km';
  $('#scalebar').style.visibility='visible';
 }catch(e){$('#scalebar').style.visibility='hidden';}
}

function chipRefresh(){
 document.querySelectorAll('.chip[data-lid]').forEach(ch=>{
  const lid=ch.dataset.lid,l=byId[lid];
  ch.classList.toggle('on',target[lid]>0&&scopeHas(lid));
  ch.classList.toggle('offscope',l.status==='live'&&!scopeHas(lid));
 });
}
function toggleLayer(lid){
 if(byId[lid].status!=='live'||!scopeHas(lid))return;
 target[lid]=target[lid]>0?0:1;
 chipRefresh();updateStatline();scheduleQt();
 terrainDirty=true;dirty=true;
}
function buildRail(){
 const rail=$('#rail');rail.innerHTML='';
 let key=1;
 const railOrder=[];
 for(const th of R.themes){
  const lays=R.layers.filter(l=>l.theme===th.id);
  if(!lays.length)continue;
  const h=document.createElement('div');h.className='theme-h';
  h.innerHTML='<span class="tn">'+th.name.toUpperCase()+'</span><span class="tr">'+th.reading+'</span>';
  rail.appendChild(h);
  for(const l of lays){
   const ch=document.createElement('div');ch.className='chip'+(l.status!=='live'?' pending':'');
   ch.dataset.lid=l.id;
   const sub=l.status==='live'?(l.statline||l.unit):'source gated — slot reserved';
   ch.innerHTML='<span class="key">'+(l.status==='live'?key:'')+'</span>'+
    '<span class="dot" style="background:'+l.accent+';color:'+l.accent+'"></span>'+
    '<span class="cbody"><div class="ct">'+l.title+'</div><div class="cs">'+sub+'</div></span>'+
    (l.status==='live'?'<button class="read" data-read="'+l.id+'">READ</button>':'<span class="ptag">PENDING</span>');
   ch.addEventListener('click',ev=>{
    if(ev.target.closest('.read'))return;
    if(l.status!=='live'){openPlate(l.id);return;}
    toggleLayer(l.id);
   });
   rail.appendChild(ch);
   if(l.status==='live'){railOrder.push(l.id);key++;}
  }
 }
 const note=document.createElement('div');note.className='rail-note';
 note.textContent='Every layer is real, sourced, and dated. Toggle them; the terrain recomputes. The survey is built to grow.';
 rail.appendChild(note);
 rail.addEventListener('click',ev=>{
  const b=ev.target.closest('[data-read]');
  if(b)openPlate(b.dataset.read);
 });
 return railOrder;
}
let railOrder=[];

function openPlate(lid){
 const l=byId[lid],th=themeById[l.theme];
 const inner=$('#plateInner');
 const stats=(l.plateStats||[]).map(s=>'<div class="pl-stat"><div class="v">'+s.value+'</div><div class="l">'+s.label+'</div></div>').join('');
 const srcs=(l.sources||[]).map(s=>'<div>'+(s.url?'<a href="'+s.url+'" target="_blank" rel="noopener noreferrer">'+s.name+'</a>':s.name)+(s.note?' — '+s.note:'')+'</div>').join('');
 inner.innerHTML='<button class="pl-x" id="plateClose">✕ ESC</button>'+
  '<div class="pl-over" style="color:'+l.accent+'">'+th.name.toUpperCase()+' — '+th.reading.toUpperCase()+'</div>'+
  '<div class="pl-title">'+l.title+'</div>'+
  '<div class="pl-unit">'+(l.statline||l.unit)+(l.retrieved?' · surveyed '+String(l.retrieved).slice(0,10):'')+'</div>'+
  '<div class="pl-stats">'+stats+'</div>'+
  '<div class="pl-h" style="color:'+l.accent+'">WHAT</div><div class="pl-body">'+l.essay.what+'</div>'+
  '<div class="pl-h" style="color:'+l.accent+'">HOW</div><div class="pl-body">'+l.essay.how+'</div>'+
  '<div class="pl-h" style="color:'+l.accent+'">WHY</div><div class="pl-body">'+l.essay.why+'</div>'+
  (srcs?'<div class="pl-h" style="color:'+l.accent+'">SOURCES</div><div class="pl-src">'+srcs+'</div>':'')+
  (l.status==='live'?'<div class="pl-solo">SOLO VIEW — other layers dimmed · close to restore</div>':'<div class="pl-solo">'+(l.pendingNote||'')+'</div>');
 $('#plate').style.borderTopColor=l.accent;
 $('#plate').classList.add('open');
 $('#plateClose').addEventListener('click',closePlate);
 if(l.status==='live'){
  if(!scopeHas(lid)&&l.scopes.includes('us'))switchScope('us');
  if(!plateOpen)savedTargets={...target};
  for(const x of live)target[x.id]=(x.id===lid?1:0);
  chipRefresh();updateStatline();scheduleQt();terrainDirty=true;dirty=true;
 }
 plateOpen=lid;
}
function closePlate(){
 if(!plateOpen)return;
 $('#plate').classList.remove('open');
 if(savedTargets){for(const k in savedTargets)target[k]=savedTargets[k];savedTargets=null;}
 plateOpen=null;
 chipRefresh();updateStatline();scheduleQt();terrainDirty=true;dirty=true;
}

function buildHero(){
 const total=live.reduce((s,l)=>s+(l.count||0),0);
 $('#hero').innerHTML='<div class="hero-in">'+
  '<div class="hero-over">'+R.meta.sheet+' · SURVEYED '+R.meta.surveyed+'</div>'+
  '<h2 class="hero-title">THE <em>SOUL</em> SURVEY</h2>'+
  '<div class="hero-tag">'+R.meta.tagline.toUpperCase()+'</div>'+
  '<p class="hero-man">'+R.meta.manifesto+'</p>'+
  '<div class="hero-stats">'+live.length+' LAYERS LIVE · '+fmtInt(total)+' COORDINATES OF HUMAN ACTIVITY · ZERO RUNTIME NETWORK CALLS</div>'+
  '<button id="heroEnter">ENTER THE SURVEY</button>'+
  '<div class="hero-hint">hover anything · toggle layers with 1–'+railOrder.length+' · scroll to zoom · U / W to change sheets</div>'+
  '</div>';
 const go=()=>{$('#hero').classList.add('gone');};
 $('#heroEnter').addEventListener('click',go);
 $('#hero').addEventListener('wheel',go,{passive:true});
}
function buildAbout(){
 const rows=live.map(l=>{
  const s=(l.sources||[]).map(x=>x.url?'<a href="'+x.url+'" target="_blank" rel="noopener noreferrer">'+x.name+'</a>':x.name).join('; ');
  return '<div><b style="color:'+l.accent+'">'+l.title+'</b> — '+s+(l.retrieved?' · retrieved '+l.retrieved:'')+'</div>';
 }).join('');
 $('#aboutInner').innerHTML='<button class="pl-x" id="aboutClose">✕ ESC</button>'+
  '<div class="pl-over">'+R.meta.sheet+'</div>'+
  '<div class="ab-title">About the Survey</div>'+
  '<div class="ab-body">'+R.meta.manifesto+'</div>'+
  '<div class="ab-body">Each layer answers three questions — <i>what</i> the data is, <i>how</i> it was measured, and <i>why</i> it says something about us. Density becomes elevation: the hillshade and contour lines are computed from the active layers, so the topography you see is literally the shape of the data. Nothing here is invented; every point traces to a named source with a retrieval date, and one layer (mass layoffs) is deliberately shown as pending rather than faked.</div>'+
  '<div class="ab-h">METHOD</div>'+
  '<div class="ab-body" style="font-size:13px">Point layers render as additive light — where records overlap, the map burns brighter. Weighted density fields drive the shared relief. The page is fully self-contained: basemaps, data, and libraries are baked in at build time and it makes zero runtime network calls (fonts degrade gracefully). Built on a registry architecture: adding a future layer is one data file and one registry entry.</div>'+
  '<div class="ab-h">SOURCES & LICENSES</div><div class="ab-src">'+rows+
  '<div style="margin-top:10px">Basemaps: Natural Earth (public domain). Geocoding: GeoNames (CC-BY 4.0). Notable-people data: Laouenan et al. (CC-BY-SA 4.0). Map data © OpenStreetMap contributors (ODbL). FARS &amp; GNIS: U.S. public domain.</div></div>'+
  '<div class="ab-h">CONTROLS</div>'+
  '<div class="ab-kbd"><b>1–'+railOrder.length+'</b> toggle layers &nbsp; <b>U</b> United States &nbsp; <b>W</b> World &nbsp; <b>scroll</b> zoom &nbsp; <b>drag</b> pan &nbsp; <b>ESC</b> close</div>';
 $('#aboutClose').addEventListener('click',()=>$('#about').classList.remove('open'));
}

function switchScope(s){
 if(s===scope)return;
 scope=s;
 buildScope(s);
 t=d3.zoomIdentity;
 d3.select('#stage').call(zoomB.transform,d3.zoomIdentity);
 $('#scopeUS').classList.toggle('on',s==='us');
 $('#scopeWorld').classList.toggle('on',s==='world');
 chipRefresh();updateStatline();updateDatumDefault();
 bakeGlow();rebuildQt();updateScalebar();
 terrainDirty=true;dirty=true;
}

// ---------- zoom ----------
const zoomB=d3.zoom().scaleExtent([1,26]).on('zoom',ev=>{
 t=ev.transform;dirty=true;
 clearTimeout(bakeTimer);bakeTimer=setTimeout(()=>{bakeGlow();},140);
}).on('end',()=>{bakeGlow();updateScalebar();});

// ---------- init ----------
function init(){
 sizeCanvases();
 buildSprites();
 railOrder=buildRail();
 buildScope('us');
 buildHero();
 buildAbout();
 $('#mhSheet').textContent=R.meta.sheet+' · '+R.meta.surveyed;
 $('#mhTitle').innerHTML='THE <em>SOUL</em> SURVEY';
 $('#mhTagline').textContent=R.meta.tagline;
 $('#scopeUS').addEventListener('click',()=>switchScope('us'));
 $('#scopeWorld').addEventListener('click',()=>switchScope('world'));
 $('#aboutBtn').addEventListener('click',()=>$('#about').classList.add('open'));
 $('#about').addEventListener('click',ev=>{if(ev.target.id==='about')$('#about').classList.remove('open');});
 const stage=$('#stage');
 d3.select(stage).call(zoomB).on('dblclick.zoom',null);
 stage.addEventListener('pointermove',onMove);
 stage.addEventListener('pointerleave',()=>{tip.style.display='none';hoverPt=null;updateDatumDefault();dirty=true;});
 window.addEventListener('keydown',ev=>{
  if(ev.key==='Escape'){
   if($('#about').classList.contains('open'))$('#about').classList.remove('open');
   else if(plateOpen)closePlate();
   else $('#hero').classList.add('gone');
   return;
  }
  const n=parseInt(ev.key,10);
  if(n>=1&&n<=railOrder.length){toggleLayer(railOrder[n-1]);return;}
  if(ev.key==='u'||ev.key==='U')switchScope('us');
  if(ev.key==='w'||ev.key==='W')switchScope('world');
 });
 let rsT=null;
 window.addEventListener('resize',()=>{
  clearTimeout(rsT);
  rsT=setTimeout(()=>{
   sizeCanvases();
   for(const k in SC)delete SC[k];
   hatchPat=null;
   buildScope(scope);
   bakeGlow();rebuildQt();updateScalebar();
   terrainDirty=true;dirty=true;
  },220);
 });
 chipRefresh();updateStatline();updateDatumDefault();
 bakeGlow();rebuildQt();updateScalebar();
 if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{dirty=true;});
 frame();
}
try{init();}catch(e){err(e);}
})();
