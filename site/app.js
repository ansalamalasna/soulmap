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
 'omen-names':{r:2.0,core:.6},
 'wonder-ufos':{core:.5,cA:.34},
 'residue-superfund':{core:.66}
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
let era=-1,eraPlay=null,reading=null,readingSaved=null,orientTimers=[],hashHadState=false,hashTimer=null;

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
 if(byId['wonder-ufos'])SPR.ufo=makeSprite(byId['wonder-ufos'].accent,VIS['wonder-ufos'].core);
 if(byId['residue-superfund'])SPR.sf=makeSprite(byId['residue-superfund'].accent,VIS['residue-superfund'].core);
}
function inEra(b){
 if(b==null||isNaN(b))return false;
 if(era===0)return b<=500;
 if(era===1)return b>=501&&b<=1500;
 if(era===2)return b>=1501&&b<=1800;
 if(era===3)return b>=1801&&b<=1900;
 if(era===4)return b>=1901;
 return true;
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
  const g=layerGrid(C,l.id);if(!g)continue;
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
 // despair county tint (static base-space bitmap, faded by layer alpha)
 const ova=alpha['despair-overdoses']||0;
 if(ova>0.02&&scope==='us'&&D['despair-overdoses']){
  ensureCounties(C);
  if(C.countyTintCv){
   applyT(ctx);
   ctx.globalAlpha=ova;
   ctx.drawImage(C.countyTintCv,0,0,W,H);
   ctx.globalAlpha=1;
  }
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
  const cs=layerContours(C,l.id);if(!cs)continue;
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
  if(scope==='world')ctx.globalAlpha=0.82;
  const P=L.cells,vv=d.cells.v,ee=d.cells.e;
  for(let i=0;i<P.n;i++){
   if(!P.keep[i])continue;
   const val=era<0?vv[i]:(ee&&ee[i]?ee[i][era]:0);
   if(!val)continue;
   const r=(1.1+Math.log1p(val)*0.62)*wf;
   draw(SPR.memCell,P.xs[i],P.ys[i],Math.min(r,7.5*wf));
  }
  const S=L.stars,sv=d.stars.v,sb=d.stars.birth;
  for(let i=0;i<S.n;i++){
   if(!S.keep[i])continue;
   if(era>=0&&!inEra(sb[i]))continue;
   draw(SPR.memStar,S.xs[i],S.ys[i],(1.2+sv[i]*.014)*wf);
  }
  ctx.globalAlpha=1;
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
  }else if(lid==='wonder-ufos'){
   const vv=d.v;
   for(let i=0;i<P.n;i++){if(!P.keep[i])continue;draw(SPR.ufo,P.xs[i],P.ys[i],1.35+Math.log1p(vv?vv[i]:1)*.6);}
  }else if(lid==='residue-superfund'){
   for(let i=0;i<P.n;i++){if(!P.keep[i])continue;draw(SPR.sf,P.xs[i],P.ys[i],2.2);}
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
   if(era>=0&&!inEra(d.birth[i]))continue;
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
   const dd=D[lid],ee=dd.cells.e;
   const P=L.cells;
   for(let i=0;i<P.n;i++){
    if(!P.keep[i])continue;
    const val=era<0?dd.cells.v[i]:(ee&&ee[i]?ee[i][era]:0);
    if(!val)continue;
    items.push({x:P.xs[i],y:P.ys[i],lid,i,kind:'cell'});
   }
   const St=L.stars,sb=dd.stars.birth;
   for(let i=0;i<St.n;i++){
    if(!St.keep[i])continue;
    if(era>=0&&!inEra(sb[i]))continue;
    items.push({x:St.xs[i],y:St.ys[i],lid,i,kind:'star'});
   }
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
 else if(f.kind==='cell'){
  const ee=d.cells.e;
  const v=era<0?d.cells.v[f.i]:(ee&&ee[f.i]?ee[f.i][era]:0);
  ti=fmtInt(v)+' remembered birth'+(v>1?'s':'')+' near here';
  if(era>=0&&d.eras)ti+=' ('+d.eras.labels[era]+')';
  const lab=d.cells.lab[String(f.i)];if(lab)s='brightest: '+lab;
 }
 else if(f.lid==='loss-crashes'){const v=d.v[f.i];ti=v===1?'One person died here':v+' people died here';s=MONTHS[d.m[f.i]]+' 2023 · fatal crash';}
 else if(f.lid==='power-datacenters'){ti=d.name[f.i]||'Unnamed facility';s='data center';}
 else if(f.lid==='power-fortune500'){const v=d.v[f.i];ti='#'+d.rank[f.i]+' '+d.name[f.i];s=d.loc[f.i]+' · $'+(v>=1e6?(v/1e6).toFixed(2)+'T':v>=1000?(v/1000).toFixed(1)+'B':v+'M')+' revenue';}
 else if(f.lid==='motion-fulfillment'){ti=d.name[f.i]||'Amazon facility';s=(d.typeNames[d.t[f.i]]||'')+' · '+d.loc[f.i];}
 else if(f.lid==='omen-names'){ti=d.name[f.i];s=(d.s[f.i]?'light':'dark')+' name · '+d.cls[f.i]+', '+d.st[f.i];}
 else if(f.lid==='wonder-ufos'){const v=d.v?d.v[f.i]:1;ti=v>1?fmtInt(v)+' sightings reported here':'A sighting reported here';s=(d.yr&&d.yr[f.i]?'most recent '+d.yr[f.i]+' · ':'')+'NUFORC testimony';}
 else if(f.lid==='residue-superfund'){ti=d.name[f.i];s=['proposed for the NPL','on the National Priorities List','deleted from the NPL — cleaned enough to leave'][d.st2[f.i]]+' · '+d.state[f.i];}
 return {k,ti,s,color:f.lid==='omen-names'&&d.s[f.i]?(byId[f.lid].accent2||'#f2ead8'):l.accent};
}
function regionTip(qx,qy){
 const C0=SC[scope];
 const ova=alpha['despair-overdoses']||0;
 if(ova>0.3&&scope==='us'&&C0.countyBoxes){
  idT(hitCtx);
  const dd0=D['despair-overdoses'].counties,l0=byId['despair-overdoses'];
  for(const b of C0.countyBoxes){
   if(qx<b.x0||qx>b.x1||qy<b.y0||qy>b.y1)continue;
   if(hitCtx.isPointInPath(b.p,qx*dpr,qy*dpr)){
    const e=dd0[b.fips];
    if(e)return {k:'THE QUIET EPIDEMIC',ti:b.name,s:'<b>'+e.label+'</b>',color:l0.accent};
    return {k:'THE QUIET EPIDEMIC',ti:b.name,s:'no reportable rate — suppressed or missing<br>(small counts protect privacy)',color:'#5a6577'};
   }
  }
 }
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
 const parts=activeIds().map(lid=>{
  if(lid==='memory-births'&&era>=0&&D[lid].eras)return fmtInt(D[lid].eras.totals[era])+' births, '+D[lid].eras.labels[era];
  return byId[lid].statline;
 }).filter(Boolean);
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
 if(typeof eraRefresh==='function')eraRefresh();
 if(typeof writeHash==='function')writeHash();
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
  (l.caveat?'<div class="pl-cav"><b>FIELD NOTE</b> — '+l.caveat+'</div>':'')+
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
  '<div class="hero-hint">hover anything · toggle layers with '+(railOrder.length>9?'1–9 and 0':'1–'+railOrder.length)+' · R for readings · scroll to zoom · U / W to change sheets</div>'+
  '</div>';
 const go=()=>{
  if($('#hero').classList.contains('gone'))return;
  $('#hero').classList.add('gone');
  maybeOrientation();
 };
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
 if(typeof eraRefresh==='function')eraRefresh();
 if(typeof writeHash==='function')writeHash();
 terrainDirty=true;dirty=true;
}

// ---------- v2: era-aware grids ----------
function memGrid(C,er){
 C.eraGrids=C.eraGrids||{};
 if(C.eraGrids[er])return C.eraGrids[er];
 const d=D['memory-births'],L=C.layers['memory-births'];
 const out={grid:null,contours:null};
 if(!d||!L||!d.cells.e){C.eraGrids[er]=out;return out;}
 const ext=C.ext,exw=ext[1][0]-ext[0][0],exh=ext[1][1]-ext[0][1],GW=C.GW,GH=C.GH;
 const grid=new Float32Array(GW*GH),P=L.cells,ee=d.cells.e;
 for(let i=0;i<P.n;i++){
  if(!P.keep[i]||!ee[i])continue;
  const v=ee[i][er];if(!v)continue;
  const gx=Math.floor((P.xs[i]-ext[0][0])/exw*GW),gy=Math.floor((P.ys[i]-ext[0][1])/exh*GH);
  if(gx>=0&&gx<GW&&gy>=0&&gy<GH)grid[gy*GW+gx]+=Math.log1p(v);
 }
 let g=gaussBlur(grid,GW,GH);
 const nz=[];for(let i=0;i<g.length;i++)if(g[i]>0)nz.push(g[i]);
 nz.sort((a,b)=>a-b);
 const p99=nz.length?nz[Math.min(nz.length-1,Math.floor(nz.length*.996))]:1;
 for(let i=0;i<g.length;i++)g[i]=Math.min(1,g[i]/p99);
 out.grid=g;
 const cs=d3.contours().size([GW,GH]).thresholds(CONTOUR_T)(g);
 out.contours=cs.map((c,ci)=>{
  const p=new Path2D();
  c.coordinates.forEach(poly=>poly.forEach(ring=>{
   ring.forEach((pt,j)=>{
    const x=ext[0][0]+pt[0]/GW*exw,y=ext[0][1]+pt[1]/GH*exh;
    j?p.lineTo(x,y):p.moveTo(x,y);
   });p.closePath();
  }));
  return {p,i:ci};
 });
 C.eraGrids[er]=out;
 return out;
}
function layerGrid(C,lid){
 if(lid==='memory-births'&&era>=0){const m=memGrid(C,era);return m.grid;}
 return C.grids[lid];
}
function layerContours(C,lid){
 if(lid==='memory-births'&&era>=0){const m=memGrid(C,era);return m.contours;}
 return C.contours[lid];
}

// ---------- v2: counties ----------
function ensureCounties(C){
 if(C.countyBoxes||scope!=='us'||!B.counties)return;
 if(!geo.counties)geo.counties=topo.feature(B.counties,B.counties.objects.counties).features;
 const dd=D['despair-overdoses'];
 C.countyBoxes=[];
 for(const f of geo.counties){
  const fips=String(f.id).padStart(5,'0');
  const ds=C.gp(f);if(!ds)continue;
  const p=new Path2D(ds);
  const bb=C.gp.bounds(f);
  C.countyBoxes.push({fips,p,name:f.properties.name,x0:bb[0][0],y0:bb[0][1],x1:bb[1][0],y1:bb[1][1]});
 }
 if(dd&&dd.counties){
  const cv=document.createElement('canvas');cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
  const x=cv.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);
  const ac=byId['despair-overdoses'].accent,vmax=dd.vmax||60;
  for(const b of C.countyBoxes){
   const e=dd.counties[b.fips];if(!e)continue;
   const norm=Math.min(1,e.v/vmax);
   x.fillStyle=hexA(ac,0.05+norm*0.42);
   x.fill(b.p);
  }
  C.countyTintCv=cv;
 }
}

// ---------- v2: toast ----------
let toastT=null;
function toast(msg,ms){
 const el=$('#toast');el.textContent=msg;el.classList.add('show');
 clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove('show'),ms||3400);
}

// ---------- v2: era scrubber ----------
function buildEraBar(){
 const d=D['memory-births'];
 if(!d||!d.eras)return;
 const bar=$('#eraBar');bar.innerHTML='';
 const mk=(label,e)=>{
  const b=document.createElement('button');b.textContent=label;b.dataset.era=e;
  b.addEventListener('click',()=>setEra(parseInt(b.dataset.era,10)));
  bar.appendChild(b);return b;
 };
 mk('ALL TIME',-1);
 d.eras.labels.forEach((lb,i)=>mk(lb,i));
 const play=document.createElement('button');play.className='play';play.textContent='▶';
 play.addEventListener('click',()=>{
  if(eraPlay){clearInterval(eraPlay);eraPlay=null;play.textContent='▶';return;}
  play.textContent='■';let e=era<0?-1:era;
  eraPlay=setInterval(()=>{
   e++;
   if(e>4){setEra(-1);clearInterval(eraPlay);eraPlay=null;play.textContent='▶';return;}
   setEra(e);
  },2100);
 });
 bar.appendChild(play);
 eraRefresh();
}
function eraRefresh(){
 const d=D['memory-births'];
 const show=d&&d.eras&&activeIds().indexOf('memory-births')>=0;
 $('#eraBar').classList.toggle('show',!!show);
 document.querySelectorAll('#eraBar button[data-era]').forEach(b=>{
  b.classList.toggle('on',parseInt(b.dataset.era,10)===era);
 });
}
function setEra(e){
 if(e===era)return;
 era=e;
 eraRefresh();
 bakeGlow();scheduleQt();updateStatline();writeHash();
 terrainDirty=true;dirty=true;
}

// ---------- v2: camera flights ----------
function flyTo(bbox,ms,done){
 const C=SC[scope];
 const pts=[[bbox[0][0],bbox[0][1]],[bbox[1][0],bbox[1][1]],[bbox[0][0],bbox[1][1]],[bbox[1][0],bbox[0][1]]];
 let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9,ok=false;
 for(const g of pts){
  const p=C.proj(g);if(!p)continue;ok=true;
  x0=Math.min(x0,p[0]);y0=Math.min(y0,p[1]);x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1]);
 }
 if(!ok){done&&done();return;}
 const ext=C.ext,aw=ext[1][0]-ext[0][0],ah=ext[1][1]-ext[0][1];
 const k=Math.max(1,Math.min(26,0.85*Math.min(aw/Math.max(x1-x0,1),ah/Math.max(y1-y0,1))));
 const cx=(x0+x1)/2,cy=(y0+y1)/2,ecx=(ext[0][0]+ext[1][0])/2,ecy=(ext[0][1]+ext[1][1])/2;
 const target=d3.zoomIdentity.translate(ecx-k*cx,ecy-k*cy).scale(k);
 d3.select('#stage').transition('fly').duration(ms||2500).ease(d3.easeCubicInOut)
  .call(zoomB.transform,target).on('end interrupt',()=>{done&&done();});
}

// ---------- v2: readings ----------
function capBase(kicker,title,body,accent){
 return '<div class="cc-k" style="color:'+(accent||'#e8b34b')+'">'+kicker+'</div>'+
  '<div class="cc-t">'+title+'</div>'+(body?'<div class="cc-x">'+body+'</div>':'');
}
function showCap(html){const c=$('#capCard');c.innerHTML=html;c.classList.add('open');}
function hideCap(){$('#capCard').classList.remove('open');}
function wireCapNav(){
 const p=$('#ccPrev'),n=$('#ccNext'),e=$('#ccEnd');
 if(p)p.addEventListener('click',()=>stepReading(-1));
 if(n)n.addEventListener('click',()=>stepReading(1));
 if(e)e.addEventListener('click',endReading);
}
function capForReading(r,idx){
 const ac=(r.layers&&r.layers.length&&byId[r.layers[0]])?byId[r.layers[0]].accent:'#e8b34b';
 return capBase(r.kicker,r.title,r.text,ac)+
  '<div class="cc-row"><span class="cc-step">READING '+(idx+1)+' OF '+R.readings.length+'</span>'+
  '<span class="cc-nav"><button class="cc-btn" id="ccPrev">◀ PREV</button><button class="cc-btn" id="ccNext">NEXT ▶</button><button class="cc-btn" id="ccEnd">✕ END</button></span></div>';
}
function clearOrient(){orientTimers.forEach(clearTimeout);orientTimers=[];}
function startReading(i){
 const r=R.readings[i];if(!r)return;
 clearOrient();
 if(plateOpen)closePlate();
 $('#readingsMenu').classList.remove('open');
 if(reading===null)readingSaved={scope:scope,targets:{...target},t:{k:t.k,x:t.x,y:t.y},era:era};
 reading=i;
 if(r.special==='orientation'){runOrientation();return;}
 if(r.scope!==scope)switchScope(r.scope);
 if(era!==-1){era=-1;}
 for(const l of live)target[l.id]=(r.layers.indexOf(l.id)>=0?1:0);
 chipRefresh();updateStatline();eraRefresh();scheduleQt();
 terrainDirty=true;dirty=true;
 flyTo(r.bbox,2600);
 showCap(capForReading(r,i));
 wireCapNav();
}
function stepReading(dir){
 if(reading===null)return;
 let j=(reading+dir+R.readings.length)%R.readings.length;
 startReading(j);
}
function runOrientation(){
 if(scope!=='us')switchScope('us');
 for(const l of live)target[l.id]=0;
 era=-1;
 chipRefresh();updateStatline();eraRefresh();scheduleQt();terrainDirty=true;dirty=true;
 d3.select('#stage').transition('fly').duration(900).call(zoomB.transform,d3.zoomIdentity);
 const skipRow='<div class="cc-row"><span class="cc-step">ORIENTATION</span><span class="cc-nav"><button class="cc-btn" id="ccEnd">SKIP ▸</button></span></div>';
 showCap(capBase('HOW TO READ THIS MAP','Orientation',R.readings[0].text)+skipRow);
 wireCapNav();
 railOrder.forEach((lid,ix)=>{
  orientTimers.push(setTimeout(()=>{
   target[lid]=1;
   chipRefresh();updateStatline();scheduleQt();terrainDirty=true;dirty=true;
   const l=byId[lid],th=themeById[l.theme];
   showCap(capBase(th.name.toUpperCase()+' — '+th.reading.toUpperCase(),l.title,l.statline||l.unit,l.accent)+skipRow);
   wireCapNav();
  },1300+ix*1800));
 });
 orientTimers.push(setTimeout(()=>{
  showCap(capBase('THE SOUL SURVEY','The terrain is us.','Toggle layers. Hover anything. Open a reading. Every point is real.')+
   '<div class="cc-row"><span class="cc-step"></span><span class="cc-nav"><button class="cc-btn" id="ccEnd">EXPLORE ▸</button></span></div>');
  wireCapNav();
  orientTimers.push(setTimeout(endReading,4200));
 },1300+railOrder.length*1800+600));
}
function endReading(){
 clearOrient();
 if(eraPlay){clearInterval(eraPlay);eraPlay=null;}
 if(readingSaved){
  if(readingSaved.scope!==scope)switchScope(readingSaved.scope);
  for(const k in readingSaved.targets)target[k]=readingSaved.targets[k];
  era=readingSaved.era;
  const s=readingSaved.t;
  d3.select('#stage').transition('fly').duration(1500).ease(d3.easeCubicInOut)
   .call(zoomB.transform,d3.zoomIdentity.translate(s.x,s.y).scale(s.k));
 }
 reading=null;readingSaved=null;
 hideCap();
 chipRefresh();updateStatline();eraRefresh();scheduleQt();
 terrainDirty=true;dirty=true;writeHash();
}
function maybeOrientation(){
 if(hashHadState)return;
 startReading(0);
}
function buildReadingsMenu(){
 const m=$('#readingsMenu');m.innerHTML='';
 R.readings.forEach((r,i)=>{
  const it=document.createElement('div');it.className='rm-item';
  it.innerHTML='<div class="rk">'+r.kicker+'</div><div class="rt">'+r.title+'</div>';
  it.addEventListener('click',()=>startReading(i));
  m.appendChild(it);
 });
}

// ---------- v2: locate ----------
function havKm(la1,lo1,la2,lo2){
 const R6=6371,dLa=(la2-la1)*Math.PI/180,dLo=(lo2-lo1)*Math.PI/180;
 const a=Math.sin(dLa/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)**2;
 return R6*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function nearestOf(la,lo,lats,lons){
 let bi=-1,bd=1e9;
 for(let i=0;i<lats.length;i++){
  const d=havKm(la,lo,lats[i],lons[i]);
  if(d<bd){bd=d;bi=i;}
 }
 return {i:bi,km:bd};
}
function locateMe(){
 if(!navigator.geolocation){toast('Geolocation is unavailable in this frame — open the shared link in its own tab.');return;}
 toast('Surveying your position…',8000);
 navigator.geolocation.getCurrentPosition(pos=>{
  const la=pos.coords.latitude,lo=pos.coords.longitude;
  const usProj=buildScope('us').proj([lo,la]);
  if(usProj){if(scope!=='us')switchScope('us');}
  else{buildScope('world');if(scope!=='world')switchScope('world');}
  flyTo([[lo-1.5,la-1.05],[lo+1.5,la+1.05]],2600);
  const lines=[];
  const add=(lid,text)=>{const l=byId[lid];lines.push('<span class="dot" style="background:'+l.accent+'"></span>'+text);};
  const dm=D['memory-births'];
  if(dm){const n=nearestOf(la,lo,dm.stars.lat,dm.stars.lon);if(n.i>=0)add('memory-births','Most notable neighbor: <b>'+dm.stars.name[n.i]+'</b>'+(dm.stars.birth[n.i]?' (b. '+dm.stars.birth[n.i]+')':'')+' · '+Math.round(n.km)+' km');}
  const do2=D['omen-names'];
  if(do2){const n=nearestOf(la,lo,do2.lat,do2.lon);if(n.i>=0)add('omen-names','Nearest omen: <b>'+do2.name[n.i]+'</b> ('+(do2.s[n.i]?'light':'dark')+') · '+Math.round(n.km)+' km');}
  const dc=D['power-datacenters'];
  if(dc){const n=nearestOf(la,lo,dc.lat,dc.lon);if(n.i>=0)add('power-datacenters','Nearest data center: <b>'+(dc.name[n.i]||'unnamed facility')+'</b> · '+Math.round(n.km)+' km');}
  const df=D['motion-fulfillment'];
  if(df){const n=nearestOf(la,lo,df.lat,df.lon);if(n.i>=0)add('motion-fulfillment','Nearest Amazon node: <b>'+df.name[n.i]+'</b> · '+Math.round(n.km)+' km');}
  const ds=D['residue-superfund'];
  if(ds){const n=nearestOf(la,lo,ds.lat,ds.lon);if(n.i>=0)add('residue-superfund','Nearest buried residue: <b>'+ds.name[n.i]+'</b> · '+Math.round(n.km)+' km');}
  const dcr=D['loss-crashes'];
  if(dcr){
   let c=0,dth=0;
   for(let i=0;i<dcr.lat.length;i++){
    if(Math.abs(dcr.lat[i]-la)>0.45||Math.abs(dcr.lon[i]-lo)>0.6)continue;
    if(havKm(la,lo,dcr.lat[i],dcr.lon[i])<=40){c++;dth+=dcr.v[i];}
   }
   add('loss-crashes','Within 40 km in 2023: <b>'+fmtInt(c)+' fatal crashes · '+fmtInt(dth)+' deaths</b>');
  }
  const du=D['wonder-ufos'];
  if(du){const n=nearestOf(la,lo,du.lat,du.lon);if(n.i>=0)add('wonder-ufos','Nearest sighting: <b>'+(du.v&&du.v[n.i]>1?fmtInt(du.v[n.i])+' reports':'1 report')+'</b> · '+Math.round(n.km)+' km');}
  showCap(capBase('FIELD REPORT — '+la.toFixed(3)+'°, '+lo.toFixed(3)+'°','Your Local Reading','')+
   '<div class="cc-loc">'+lines.join('<br>')+'</div>'+
   '<div class="cc-row"><span class="cc-step">THE SURVEY, SURVEYED AROUND YOU</span><span class="cc-nav"><button class="cc-btn" id="ccEnd">✕ CLOSE</button></span></div>');
  const e=$('#ccEnd');if(e)e.addEventListener('click',hideCap);
  toast('Position found.');
 },err=>{
  toast('Location unavailable — permission denied or blocked in this frame. Try the shared link in its own tab.');
 },{timeout:12000,maximumAge:600000});
}

// ---------- v2: export sheet ----------
function exportSheet(){
 hoverPt=null;
 drawBase();drawTerrain();drawGlow();drawLabels();
 const off=document.createElement('canvas');off.width=Math.round(W*dpr);off.height=Math.round(H*dpr);
 const x=off.getContext('2d');
 x.fillStyle='#070a10';x.fillRect(0,0,off.width,off.height);
 x.drawImage(cvs.base,0,0);x.drawImage(cvs.terr,0,0);x.drawImage(cvs.glow,0,0);x.drawImage(cvs.lab,0,0);
 x.setTransform(dpr,0,0,dpr,0,0);
 x.strokeStyle='rgba(170,188,214,.4)';x.lineWidth=1;x.strokeRect(14,14,W-28,H-28);
 x.textAlign='left';x.textBaseline='top';
 x.fillStyle='#8a94a6';x.font='500 10px "IBM Plex Mono"';
 x.fillText(R.meta.sheet+' · SURVEYED '+R.meta.surveyed,34,30);
 x.fillStyle='#e8e4d8';x.font='900 30px "Fraunces"';x.fillText('THE SOUL SURVEY',32,44);
 x.fillStyle='#8a94a6';x.font='400 9.5px "IBM Plex Mono"';x.fillText(R.meta.tagline.toUpperCase(),34,82);
 x.textBaseline='middle';
 let ly=H-44;
 const ids=activeIds();
 for(let i=ids.length-1;i>=0;i--){
  const l=byId[ids[i]];
  x.fillStyle=l.accent;x.beginPath();x.arc(38,ly,3.5,0,7);x.fill();
  x.fillStyle='#c9cfda';x.font='500 9.5px "IBM Plex Mono"';
  x.fillText(l.title.toUpperCase()+'  —  '+(l.statline||l.unit),50,ly);
  ly-=17;
 }
 const dnow=new Date();
 x.textAlign='right';
 x.fillStyle='#8a94a6';x.font='400 9px "IBM Plex Mono"';
 x.fillText('SHEET RENDERED '+dnow.toISOString().slice(0,10)+' · '+(scope==='us'?'ALBERS EQUAL-AREA':'EQUAL EARTH')+' · SOULMAP',W-34,H-56);
 x.fillStyle='#5a6577';x.font='400 8px "IBM Plex Mono"';
 x.fillText('© OPENSTREETMAP CONTRIBUTORS · GEONAMES CC-BY · LAOUENAN ET AL. CC-BY-SA · NHTSA FARS · USGS GNIS · EPA · CDC · NUFORC',W-34,H-40);
 off.toBlob(b=>{
  if(!b){toast('Export failed — canvas too large?');return;}
  const url=URL.createObjectURL(b);
  const inFrame=(function(){try{return window.self!==window.top;}catch(e){return true;}})();
  if(inFrame){
   const w=window.open(url,'_blank');
   toast(w?'Sheet rendered — save the image from the new tab.':'Popup blocked — allow popups to export the sheet.');
  }else{
   const a=document.createElement('a');a.href=url;a.download='soul-survey-'+scope+'-'+dnow.toISOString().slice(0,10)+'.png';
   document.body.appendChild(a);a.click();a.remove();
   toast('Sheet exported.');
  }
  setTimeout(()=>URL.revokeObjectURL(url),90000);
 },'image/png');
}

// ---------- v2: permalinks ----------
function writeHash(){
 clearTimeout(hashTimer);
 hashTimer=setTimeout(()=>{
  try{
   const l=railOrder.map(id=>target[id]>0?1:0).join('');
   history.replaceState(null,'','#s='+scope+'&l='+l+'&e='+era+'&k='+t.k.toFixed(3)+'&x='+t.x.toFixed(1)+'&y='+t.y.toFixed(1));
  }catch(e){}
 },300);
}
let pendingHashT=null;
function parseHash(){
 try{
  const h=location.hash.replace(/^#/,'');
  if(!h)return false;
  const q={};h.split('&').forEach(kv=>{const p=kv.split('=');q[p[0]]=decodeURIComponent(p[1]||'');});
  if(!q.s||(q.s!=='us'&&q.s!=='world'))return false;
  scope=q.s;
  if(q.e!==undefined){const e=parseInt(q.e,10);if(e>=-1&&e<=4)era=e;}
  if(q.k){
   const k=parseFloat(q.k),xx=parseFloat(q.x),yy=parseFloat(q.y);
   if(isFinite(k)&&isFinite(xx)&&isFinite(yy))pendingHashT=d3.zoomIdentity.translate(xx,yy).scale(Math.max(1,Math.min(26,k)));
  }
  return {bits:q.l||''};
 }catch(e){return false;}
}

// ---------- zoom ----------
const zoomB=d3.zoom().scaleExtent([1,26]).on('zoom',ev=>{
 t=ev.transform;dirty=true;
 clearTimeout(bakeTimer);bakeTimer=setTimeout(()=>{bakeGlow();},140);
}).on('end',()=>{bakeGlow();updateScalebar();writeHash();});

// ---------- init ----------
function init(){
 sizeCanvases();
 buildSprites();
 railOrder=buildRail();
 const hp=parseHash();
 if(hp){hashHadState=true;}
 buildScope(scope);
 buildHero();
 buildAbout();
 buildEraBar();
 buildReadingsMenu();
 $('#mhSheet').textContent=R.meta.sheet+' · '+R.meta.surveyed;
 $('#mhTitle').innerHTML='THE <em>SOUL</em> SURVEY';
 $('#mhTagline').textContent=R.meta.tagline;
 $('#scopeUS').classList.toggle('on',scope==='us');
 $('#scopeWorld').classList.toggle('on',scope==='world');
 $('#scopeUS').addEventListener('click',()=>switchScope('us'));
 $('#scopeWorld').addEventListener('click',()=>switchScope('world'));
 $('#aboutBtn').addEventListener('click',()=>$('#about').classList.add('open'));
 $('#about').addEventListener('click',ev=>{if(ev.target.id==='about')$('#about').classList.remove('open');});
 $('#readingsBtn').addEventListener('click',ev=>{ev.stopPropagation();$('#readingsMenu').classList.toggle('open');});
 document.addEventListener('click',ev=>{if(!ev.target.closest('.mh-menu-wrap'))$('#readingsMenu').classList.remove('open');});
 $('#locateBtn').addEventListener('click',locateMe);
 $('#exportBtn').addEventListener('click',exportSheet);
 $('#railToggle').addEventListener('click',()=>$('#rail').classList.toggle('open'));
 if(hp&&hp.bits){
  for(let i=0;i<railOrder.length&&i<hp.bits.length;i++)target[railOrder[i]]=hp.bits[i]==='1'?1:0;
  for(const l of live){alpha[l.id]=target[l.id];}
 }
 const stage=$('#stage');
 d3.select(stage).call(zoomB).on('dblclick.zoom',null);
 if(pendingHashT)d3.select(stage).call(zoomB.transform,pendingHashT);
 stage.addEventListener('pointermove',onMove);
 stage.addEventListener('pointerdown',()=>{
  if(reading!==null&&R.readings[reading]&&R.readings[reading].special){
   clearOrient();
   for(const l of live)target[l.id]=1;
   endReading();
  }
 });
 stage.addEventListener('pointerleave',()=>{tip.style.display='none';hoverPt=null;updateDatumDefault();dirty=true;});
 window.addEventListener('keydown',ev=>{
  if(ev.key==='Escape'){
   if($('#about').classList.contains('open'))$('#about').classList.remove('open');
   else if(reading!==null)endReading();
   else if($('#capCard').classList.contains('open'))hideCap();
   else if(plateOpen)closePlate();
   else{$('#hero').classList.add('gone');}
   return;
  }
  let n=parseInt(ev.key,10);
  if(ev.key==='0')n=10;
  if(n>=1&&n<=railOrder.length){toggleLayer(railOrder[n-1]);return;}
  if(ev.key==='u'||ev.key==='U')switchScope('us');
  if(ev.key==='w'||ev.key==='W')switchScope('world');
  if(ev.key==='r'||ev.key==='R')$('#readingsMenu').classList.toggle('open');
 });
 if(hashHadState)$('#hero').classList.add('gone');
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
 chipRefresh();updateStatline();updateDatumDefault();eraRefresh();
 bakeGlow();rebuildQt();updateScalebar();
 $('#stage').classList.add('ready');
 if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{dirty=true;bakeGlow();});
 frame();
}
try{init();}catch(e){err(e);}
})();
