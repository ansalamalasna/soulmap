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
 'wonder-ufos':{core:.46,cA:.32},
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
const CURATED=['memory-births','loss-crashes','power-datacenters','omen-names'];
live.forEach(l=>{const on=CURATED.indexOf(l.id)>=0?1:0;alpha[l.id]=on;target[l.id]=on;});
let dirty=true,terrainDirty=true,plateOpen=null,savedTargets=null;
let W=0,H=0,dpr=1;
const SC={};           // per-scope caches
const glowBMs={};      // lid -> {cv,ctx,t:{k,x,y}}
let qt=null,qtTimer=null,bakeTimer=null;
let hoverPt=null;
let zooming=false,zoomEndT=null,needBake=false,lastBakePump=0,bakeRR=0;
let era=-1,eraPlay=null,reading=null,readingSaved=null,orientTimers=[],hashHadState=false,hashTimer=null;
let refNames=true,refBounds=true;const refSyncs=[];
let lens={},pickMode=null;
function hasGlow(l){return !!(l.forms.points||l.forms.flows);}

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
  }else if(d.kind==='flows'){
   C.layers[l.id]={fa:projArrays(proj,d.arcs.alon,d.arcs.alat),fb:projArrays(proj,d.arcs.blon,d.arcs.blat)};
  }
 }
 // density grids + contours
 const exw=ext[1][0]-ext[0][0],exh=ext[1][1]-ext[0][1];
 const GW=520,GH=Math.max(110,Math.round(GW*exh/exw));
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
 // reference gazetteer (projected, priority-sorted)
 if(B.places){
  const rows=s==='us'?B.places.us:B.places.world;
  const rp=[];
  for(const r of rows){
   const pt=proj([r[3],r[2]]);
   if(!pt)continue;
   rp.push({x:pt[0],y:pt[1],la:r[2],lo:r[3],name:r[0],st:r[1],pop:r[4],cap:r[5],
            score:r[4]+(r[5]?(s==='us'?500000:800000):0)});
  }
  rp.sort((a,b)=>b.score-a.score);
  C.places=rp;
 }
 SC[s]=C;
 return C;
}
function ensureCountyMesh(C){
 if(C.countyMeshPath!==undefined||!B.counties)return;
 try{
  C.countyMeshPath=new Path2D(C.gp(topo.mesh(B.counties,B.counties.objects.counties,(a,b)=>a!==b)));
 }catch(e){C.countyMeshPath=null;}
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
 const bB=refBounds?Math.min(.5,t.k*.035):0; // boundary emphasis grows with zoom
 if(scope==='world'){
  ctx.strokeStyle='rgba(64,86,120,.35)';ctx.lineWidth=lw(1);ctx.stroke(C.paths.sphere);
  ctx.strokeStyle='rgba(38,52,76,.28)';ctx.lineWidth=lw(.5);ctx.stroke(C.paths.grat);
  ctx.fillStyle='#0e131b';ctx.fill(C.paths.land);
  ctx.strokeStyle='rgba(80,98,126,'+(.45+bB*.5)+')';ctx.lineWidth=lw(.6+bB);ctx.stroke(C.paths.land);
  ctx.strokeStyle='rgba(52,66,92,'+(.5+bB*.6)+')';ctx.lineWidth=lw(.45+bB);ctx.stroke(C.paths.borders);
 }else{
  ctx.fillStyle='#0e131b';ctx.fill(C.paths.nation);
  ctx.strokeStyle='rgba(58,74,100,'+(.55+bB*.55)+')';ctx.lineWidth=lw(.55+bB*1.2);ctx.stroke(C.paths.stateMesh);
  ctx.strokeStyle='rgba(96,116,148,'+(.6+bB*.4)+')';ctx.lineWidth=lw(1+bB);ctx.stroke(C.paths.nation);
  if(refBounds&&t.k>=4.5){
   ensureCountyMesh(C);
   if(C.countyMeshPath){ctx.strokeStyle='rgba(96,116,148,.20)';ctx.lineWidth=lw(.5);ctx.stroke(C.countyMeshPath);}
  }
 }
 // county tint layers (static base-space bitmaps, faded by layer alpha)
 if(scope==='us'){
  for(const lT of countyTintLayers()){
   const aT=alpha[lT.id]||0;
   if(aT<=0.02)continue;
   ensureCounties(C);
   const cvT=countyTintFor(C,lT.id);
   if(!cvT)continue;
   const cmT=compareMode;
   const clipT=cmT&&(lT.id===cmT.a||lT.id===cmT.b);
   if(clipT){
    ctx.save();idT(ctx);ctx.beginPath();
    if(lT.id===cmT.a)ctx.rect(0,0,cmT.x*W,H);else ctx.rect(cmT.x*W,0,W-cmT.x*W,H);
    ctx.clip();
   }
   applyT(ctx);
   ctx.globalAlpha=aT;
   ctx.drawImage(cvT,0,0,W,H);
   ctx.globalAlpha=1;
   if(clipT){ctx.restore();applyT(ctx);}
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
    ctx.fillStyle=hexA(dl.accent,.06*da);ctx.fill(p);
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
 if(!compareMode){ctx.globalAlpha=1;ctx.drawImage(C.shadeCv,ext[0][0],ext[0][1],exw,exh);}
 const cm2=compareMode;
 for(const l of live){
  const cs=layerContours(C,l.id);if(!cs)continue;
  const a=alpha[l.id];if(a<=0.02)continue;
  const cA=(VIS[l.id]&&VIS[l.id].cA)||.4;
  const clip=cm2&&(l.id===cm2.a||l.id===cm2.b);
  if(clip){
   ctx.save();idT(ctx);ctx.beginPath();
   if(l.id===cm2.a)ctx.rect(0,0,cm2.x*W,H);else ctx.rect(cm2.x*W,0,W-cm2.x*W,H);
   ctx.clip();applyT(ctx);
  }
  ctx.strokeStyle=l.accent;
  for(const c of cs){
   ctx.globalAlpha=a*cA*(.3+.7*c.i/(CONTOUR_T.length-1));
   ctx.lineWidth=(0.5+c.i*0.09)/t.k;
   ctx.stroke(c.p);
  }
  if(clip)ctx.restore();
 }
 ctx.globalAlpha=1;
}

function drawPointsTo(ctx,lid,step){
 // draws layer's points in SCREEN space under current t (ctx pre-set to identity*dpr)
 // step>1 = gesture-time decimation for very large layers (alpha-compensated)
 const C=SC[scope],d=D[lid],L=C.layers[lid];if(!L)return;
 const k=t.k,kk=Math.pow(k,.42);
 const draw=(spr,x,y,r)=>{const sx=x*k+t.x,sy=y*k+t.y;if(sx<-60||sx>W+60||sy<-60||sy>H+60)return;const rr=r*kk;ctx.drawImage(spr,sx-rr,sy-rr,rr*2,rr*2);};
 if(d.kind==='flows'){
  const A=L.fa,Bf=L.fb,hh=d.arcs.hh,am=d.arcmax||1;
  const st2=(step>1&&A.n>6000)?step:1;
  ctx.strokeStyle=byId[lid].accent;
  ctx.lineCap='round';
  for(let i=0;i<A.n;i+=st2){
   if(!A.keep[i]||!Bf.keep[i])continue;
   const ax=A.xs[i]*k+t.x,ay=A.ys[i]*k+t.y,bx=Bf.xs[i]*k+t.x,by=Bf.ys[i]*k+t.y;
   if((ax<-80&&bx<-80)||(ax>W+80&&bx>W+80)||(ay<-80&&by<-80)||(ay>H+80&&by>H+80))continue;
   const f=Math.min(1,hh[i]/am);
   ctx.globalAlpha=(0.07+0.45*Math.pow(f,0.7))*(st2>1?1.6:1);
   ctx.lineWidth=0.5+1.9*f;
   const mx=(ax+bx)/2,my=(ay+by)/2,ddx=bx-ax,ddy=by-ay;
   ctx.beginPath();ctx.moveTo(ax,ay);ctx.quadraticCurveTo(mx-ddy*0.16,my+ddx*0.16,bx,by);ctx.stroke();
  }
  ctx.globalAlpha=1;
  return;
 }
 if(d.kind==='memory'){
  const wf=scope==='world'?0.68:1;
  const st2=(step>1&&L.cells.n>30000)?step:1;
  ctx.globalAlpha=Math.min(1,(scope==='world'?0.82:1)*(st2>1?1.7:1));
  const P=L.cells,vv=d.cells.v,ee=d.cells.e;
  for(let i=0;i<P.n;i+=st2){
   if(!P.keep[i])continue;
   const val=era<0?vv[i]:(ee&&ee[i]?ee[i][era]:0);
   if(!val)continue;
   const r=(1.1+Math.log1p(val)*0.62)*wf;
   draw(SPR.memCell,P.xs[i],P.ys[i],Math.min(r,7.5*wf));
  }
  ctx.globalAlpha=scope==='world'?0.82:1;
  const S=L.stars,sv=d.stars.v,sb=d.stars.birth;
  for(let i=0;i<S.n;i++){
   if(!S.keep[i])continue;
   if(era>=0&&!inEra(sb[i]))continue;
   draw(SPR.memStar,S.xs[i],S.ys[i],(1.2+sv[i]*.014)*wf);
  }
  ctx.globalAlpha=1;
 }else{
  const P=L.pts;
  const LZ=lens[lid];
  const lzSkip=LZ?(ii)=>{const arr=d[LZ.field];return arr&&arr[ii]!==LZ.v;}:null;
  if(lid==='loss-crashes'){
   const vv=d.v;
   const st2=(step>1&&P.n>30000)?step:1;
   if(st2>1)ctx.globalAlpha=Math.min(1,1.7);
   for(let i=0;i<P.n;i+=st2){if(!P.keep[i])continue;if(lzSkip&&lzSkip(i))continue;draw(SPR.crash,P.xs[i],P.ys[i],Math.min(1.55+(vv[i]-1)*.8,4.2));}
   ctx.globalAlpha=1;
  }else if(lid==='power-datacenters'){
   for(let i=0;i<P.n;i++){if(!P.keep[i])continue;if(lzSkip&&lzSkip(i))continue;draw(SPR.dc,P.xs[i],P.ys[i],2.0);}
  }else if(lid==='power-fortune500'){
   const vv=d.v;
   for(let i=0;i<P.n;i++){if(!P.keep[i])continue;if(lzSkip&&lzSkip(i))continue;draw(SPR.f500,P.xs[i],P.ys[i],1.7+Math.sqrt(Math.max(vv[i],0))/826*7);}
  }else if(lid==='motion-fulfillment'){
   const tt=d.t;
   for(let i=0;i<P.n;i++){if(!P.keep[i])continue;if(lzSkip&&lzSkip(i))continue;draw(SPR.ful,P.xs[i],P.ys[i],tt[i]===2?3.1:tt[i]===1?2.1:2.6);}
  }else if(lid==='omen-names'){
   const ss=d.s;
   for(let i=0;i<P.n;i++){if(!P.keep[i])continue;if(lzSkip&&lzSkip(i))continue;draw(ss[i]?SPR.omenL:SPR.omenD,P.xs[i],P.ys[i],2.0);}
  }else if(lid==='wonder-ufos'){
   const vv=d.v,uw=scope==='world'?0.8:1;
   if(scope==='world')ctx.globalAlpha=0.75;
   for(let i=0;i<P.n;i++){if(!P.keep[i])continue;if(lzSkip&&lzSkip(i))continue;draw(SPR.ufo,P.xs[i],P.ys[i],(1.35+Math.log1p(vv?vv[i]:1)*.6)*uw);}
   ctx.globalAlpha=1;
  }else if(lid==='residue-superfund'){
   for(let i=0;i<P.n;i++){if(!P.keep[i])continue;if(lzSkip&&lzSkip(i))continue;draw(SPR.sf,P.xs[i],P.ys[i],2.0);}
  }
 }
}

function bufFor(lid){
 let bm=glowBMs[lid];
 if(!bm)bm=glowBMs[lid]={cvs:[document.createElement('canvas'),document.createElement('canvas')],cur:0,curT:null,prevT:null,prevIdx:1,fadeStart:0};
 const w=Math.round(W*dpr),h=Math.round(H*dpr);
 for(const cv of bm.cvs){if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h;}}
 return bm;
}
function bakeLayer(lid,full){
 const l=byId[lid];if(!l||!hasGlow(l))return;
 const bm=bufFor(lid);
 bm.cur^=1;
 const cv=bm.cvs[bm.cur],x=cv.getContext('2d');
 x.setTransform(dpr,0,0,dpr,0,0);
 x.clearRect(0,0,W,H);
 x.globalCompositeOperation='lighter';
 drawPointsTo(x,lid,full?1:2);
 bm.prevT=bm.curT;bm.prevIdx=bm.cur^1;
 bm.curT={k:t.k,x:t.x,y:t.y};
 bm.fadeStart=performance.now();
 dirty=true;
}
function bakeGlow(full){
 for(const lid of activeIds())bakeLayer(lid,full!==false);
}
function resetGlowFades(){
 for(const lid in glowBMs){glowBMs[lid].prevT=null;glowBMs[lid].curT=null;}
}

function drawGlow(){
 const ctx=ctxs.glow;
 idT(ctx);ctx.clearRect(0,0,W,H);
 ctx.globalCompositeOperation='lighter';
 ctx.imageSmoothingEnabled=true;
 const now=performance.now();
 const cm=compareMode;
 for(const l of live){
  const lid=l.id;if(!hasGlow(l))continue;
  const a=alpha[lid];if(a<=0.01||!scopeHas(lid))continue;
  const bm=glowBMs[lid];if(!bm||!bm.curT)continue;
  const clip=cm&&(lid===cm.a||lid===cm.b);
  if(clip){
   ctx.save();
   ctx.setTransform(dpr,0,0,dpr,0,0);
   ctx.beginPath();
   if(lid===cm.a)ctx.rect(0,0,cm.x*W,H);else ctx.rect(cm.x*W,0,W-cm.x*W,H);
   ctx.clip();
  }
  const drawBuf=(cv,bt,ga)=>{
   if(!bt||ga<=0.004)return;
   const s=t.k/bt.k,ox=t.x-s*bt.x,oy=t.y-s*bt.y;
   ctx.setTransform(dpr*s,0,0,dpr*s,dpr*ox,dpr*oy);
   ctx.globalAlpha=Math.min(1,ga);
   ctx.drawImage(cv,0,0,W,H);
  };
  const fade=Math.min(1,(now-bm.fadeStart)/220);
  if(fade<1&&bm.prevT){
   const th=fade*Math.PI/2;
   drawBuf(bm.cvs[bm.prevIdx],bm.prevT,a*Math.cos(th));
   drawBuf(bm.cvs[bm.cur],bm.curT,a*Math.sin(th));
  }else{
   drawBuf(bm.cvs[bm.cur],bm.curT,a);
  }
  if(clip)ctx.restore();
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
 const desireOn=(alpha['desire-searches']||0)>0.4&&scopeHas('desire-searches');
 // ---- reference: state names (survey-sheet print; desire-labeled states are exempt)
 if(refNames&&scope==='us'){
  const dd=desireOn?D['desire-searches']:null;
  for(const st in C.stateCent){
   if(dd&&dd.us[st])continue; // desire draws its own postal+term there
   const c=C.stateCent[st];
   const [sx,sy]=S(c[0],c[1]);
   if(sx<padLeft()-20||sx>W||sy<95||sy>H-75)continue;
   if(TINY_STATES.has(st)&&t.k<2.1)continue;
   if(t.k<2.2){
    haloText(ctx,st,sx,sy,'500 9.5px "IBM Plex Mono"','rgba(148,160,178,.48)');
   }else{
    const nm=(STATE_NAME[st]||st).toUpperCase();
    haloText(ctx,nm,sx,sy,'500 10.5px "IBM Plex Mono"','rgba(152,164,182,.5)');
   }
   take(sx,sy,60);
  }
 }
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
    take(sx,sy,70);
   }
  }else{
   for(const iso in dd.world){
    const c=C.countryCent[iso];if(!c)continue;
    const [sx,sy]=S(c[0],c[1]);
    if(sx<padLeft()-30||sx>W||sy<90||sy>H-70)continue;
    if(!free(sx,sy,70))continue;take(sx,sy,70);
    const e=dd.world[iso];
    haloText(ctx,e.country.toUpperCase(),sx,sy-9,'500 7px "IBM Plex Mono"','rgba(138,148,166,'+(.85*da)+')');
    haloText(ctx,String(e.label).replace(/\s*\(\+[\d.,]+%\)\s*$/,'').toLowerCase(),sx,sy+3,'500 9.5px "IBM Plex Mono"',hexA(ac,.95*da));
   }
  }
 }
 // ---- reference: cities (zoom-graded, population-priority)
 if(refNames&&C.places){
  const budget=t.k<1.6?14:t.k<2.5?42:t.k<4?120:t.k<6.5?320:t.k<10?800:C.places.length;
  let shown=0;
  for(let i=0;i<C.places.length&&shown<budget;i++){
   const pl=C.places[i];
   const [sx,sy]=S(pl.x,pl.y);
   if(sx<padLeft()-10||sx>W-14||sy<98||sy>H-78)continue;
   if(!free(sx,sy,55))continue;
   ctx.globalAlpha=.8;
   ctx.strokeStyle='rgba(196,206,222,.5)';ctx.lineWidth=1;
   ctx.beginPath();ctx.arc(sx,sy,pl.cap?3:2.2,0,7);ctx.stroke();
   if(pl.cap){ctx.fillStyle='rgba(196,206,222,.65)';ctx.beginPath();ctx.arc(sx,sy,1.1,0,7);ctx.fill();}
   ctx.globalAlpha=1;
   const big=pl.pop>1000000;
   haloText(ctx,pl.name,sx+7,sy,(big?'500 9.5px':'400 8.5px')+' "IBM Plex Mono"','rgba(184,194,210,'+(big?.68:.55)+')','left');
   take(sx,sy,55);shown++;
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
 const now=performance.now();
 if(needBake&&now-lastBakePump>90){
  lastBakePump=now;needBake=zooming;
  const ids=activeIds().filter(id=>hasGlow(byId[id]));
  if(ids.length){bakeRR=(bakeRR+1)%ids.length;bakeLayer(ids[bakeRR],!zooming);}
 }
 let fading=false;
 for(const lid in glowBMs){
  const bm=glowBMs[lid];
  if(bm.curT&&bm.prevT&&now-bm.fadeStart<230){fading=true;break;}
 }
 if(!dirty&&!tw&&!fading)return;
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
  }else if(L.pts){
   const P=L.pts,LZq=lens[lid],arrq=LZq?D[lid][LZq.field]:null;
   for(let i=0;i<P.n;i++){
    if(!P.keep[i])continue;
    if(arrq&&arrq[i]!==LZq.v)continue;
    items.push({x:P.xs[i],y:P.ys[i],lid,i,kind:'pt'});
   }
  }
 }
 qt=d3.quadtree().x(d=>d.x).y(d=>d.y).addAll(items);
}
function scheduleQt(){clearTimeout(qtTimer);qtTimer=setTimeout(rebuildQt,260);}

const tip=$('#tooltip');
function tipHTML(f){
 const l=byId[f.lid],d=D[f.lid];
 let k=l.title.toUpperCase(),ti='',s='';
 if(f.kind==='star'){
  const st=d.stars;ti='★ '+st.name[f.i];
  s=(st.birth[f.i]?'b. '+st.birth[f.i]:'')+(st.death&&st.death[f.i]?' – d. '+st.death[f.i]:'')+(st.dom[f.i]?' · '+st.dom[f.i]:'');
  if(st.desc&&st.desc[f.i])s+='<br>'+st.desc[f.i];
  s+=`<br>visibility ${st.v[f.i]} / 100`;
 }
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
 else if(f.lid==='wonder-ufos'){const v=d.v?d.v[f.i]:1;ti=v>1?fmtInt(v)+' sightings reported here':'A sighting reported here';const DECS=['1940s','1950s','1960s','1970s','1980s','1990s','2000s','2010s','2010s'];const dc2=d.dec?d.dec[f.i]:-1;s=(dc2>=0?'latest in the '+DECS[dc2]+' · ':'')+'NUFORC testimony';}
 else if(f.lid==='residue-superfund'){ti=d.name[f.i];s=['proposed for the NPL','on the National Priorities List','deleted from the NPL — cleaned enough to leave'][d.st2[f.i]]+' · '+d.state[f.i];}
 return {k,ti,s,color:f.lid==='omen-names'&&d.s[f.i]?(byId[f.lid].accent2||'#f2ead8'):l.accent};
}
function regionTip(qx,qy){
 const C0=SC[scope];
 if(scope==='us'&&C0.countyBoxes){
  const tls=countyTintLayers().filter(l=>(alpha[l.id]||0)>0.3).reverse();
  if(tls.length){
   idT(hitCtx);
   for(const b of C0.countyBoxes){
    if(qx<b.x0||qx>b.x1||qy<b.y0||qy>b.y1)continue;
    if(hitCtx.isPointInPath(b.p,qx*dpr,qy*dpr)){
     const lines=[];let color=null,anySupp=false;
     for(const lT of tls){
      const e=D[lT.id].counties[b.fips];
      if(e){lines.push('<b>'+e.label+'</b>');if(!color)color=lT.accent;}
      else if(lT.id==='despair-overdoses'||lT.id==='despair-suicide')anySupp=true;
     }
     if(!lines.length&&anySupp)return {k:'COUNTY',ti:b.name,s:'no reportable rate — suppressed or missing<br>(small counts protect privacy)',color:'#5a6577'};
     if(lines.length)return {k:'COUNTY — '+tls.map(l=>l.title.toUpperCase()).join(' × '),ti:b.name,s:lines.join('<br>'),color:color||'#c8d2e2'};
     break;
    }
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
    let txt=Math.abs(g[1]).toFixed(3)+'°'+(g[1]>=0?'N':'S')+'  '+Math.abs(g[0]).toFixed(3)+'°'+(g[0]>=0?'E':'W');
    if(scope==='us'){
     idT(hitCtx);
     for(const st in C.statePaths){
      if(hitCtx.isPointInPath(C.statePaths[st],qx*dpr,qy*dpr)){txt+=' · '+(STATE_NAME[st]||st).toUpperCase();break;}
     }
    }
    if(C.places&&C.places.length){
     let bi=-1,bd=1e9;
     for(let i=0;i<C.places.length;i++){
      const pl=C.places[i];
      if(Math.abs(pl.la-g[1])>2.5||Math.abs(pl.lo-g[0])>3)continue;
      const d=havKm(g[1],g[0],pl.la,pl.lo);
      if(d<bd){bd=d;bi=i;}
     }
     if(bi>=0&&bd<=220)txt+=' · near '+C.places[bi].name+(scope==='us'?', '+C.places[bi].st:' ('+C.places[bi].st+')');
    }
    $('#datum').textContent=txt;
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
  let s=byId[lid].statline;
  if(lens[lid])s=(s?s+' ':'')+'· lens: '+lens[lid].label;
  return s;
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
 const rh=document.createElement('div');rh.className='theme-h';
 rh.innerHTML='<span class="tn">REFERENCE</span><span class="tr">the sheet beneath the light</span>';
 rail.appendChild(rh);
 const mkRef=(label,get,flip)=>{
  const d=document.createElement('div');d.className='chip refchip';
  d.innerHTML='<span class="key"></span><span class="refbox"></span><span class="cbody"><div class="ct">'+label+'</div></span>';
  const sync=()=>{d.classList.toggle('on',get());d.querySelector('.refbox').textContent=get()?'▣':'▢';};
  d.addEventListener('click',()=>{flip();sync();dirty=true;});
  refSyncs.push(sync);sync();rail.appendChild(d);
 };
 mkRef('Place names & rings — G',()=>refNames,()=>refNames=!refNames);
 mkRef('Boundaries & counties',()=>refBounds,()=>refBounds=!refBounds);
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
  (l.protocol?'<div class="pl-banner">'+l.protocol+'</div>':'')+
  '<div class="pl-over" style="color:'+l.accent+'">'+th.name.toUpperCase()+' — '+th.reading.toUpperCase()+'</div>'+
  '<div class="pl-title">'+l.title+'</div>'+
  '<div class="pl-unit">'+(l.statline||l.unit)+(l.retrieved?' · surveyed '+String(l.retrieved).slice(0,10):'')+'</div>'+
  '<div class="pl-stats">'+stats+'</div>'+
  '<div class="pl-h" style="color:'+l.accent+'">WHAT</div><div class="pl-body">'+l.essay.what+'</div>'+
  '<div class="pl-h" style="color:'+l.accent+'">HOW</div><div class="pl-body">'+l.essay.how+'</div>'+
  '<div class="pl-h" style="color:'+l.accent+'">WHY</div><div class="pl-body">'+l.essay.why+'</div>'+
  (l.caveat?'<div class="pl-cav"><b>FIELD NOTE</b> — '+l.caveat+'</div>':'')+
  (srcs?'<div class="pl-h" style="color:'+l.accent+'">SOURCES</div><div class="pl-src">'+srcs+'</div>':'')+
  (l.status==='live'&&l.filters&&l.filters.length&&D[l.id]?'<div class="pl-h" style="color:'+l.accent+'">LENSES</div><div class="pl-lens">'+l.filters.map(fl=>'<div class="pl-lensrow"><span class="pl-lenslab">'+fl.label+'</span><button class="lz-chip'+(!lens[l.id]||lens[l.id].field!==fl.field?' on':'')+'" data-lid="'+l.id+'" data-clear="1">ALL</button>'+fl.values.map(v=>'<button class="lz-chip'+(lens[l.id]&&lens[l.id].field===fl.field&&lens[l.id].v===v[0]?' on':'')+'" data-lid="'+l.id+'" data-field="'+fl.field+'" data-v="'+v[0]+'" data-label="'+v[1]+'">'+v[1]+' <span>'+fmtInt(v[2])+'</span></button>').join('')+'</div>').join('')+'</div>':'')+
  (l.status==='live'&&D[l.id]?'<div class="pl-h" style="color:'+l.accent+'">DATA</div><div class="pl-src"><a href="https://github.com/ansalamalasna/soulmap/blob/main/data/staging/'+l.id+'.json" target="_blank" rel="noopener noreferrer">staging JSON</a> · <a href="https://github.com/ansalamalasna/soulmap/blob/main/data/staging/'+l.id+'.provenance.json" target="_blank" rel="noopener noreferrer">provenance</a> · <a href="https://github.com/ansalamalasna/soulmap/blob/main/registry/registry.json" target="_blank" rel="noopener noreferrer">registry entry</a></div>':'')+
  (l.status==='live'?'<div class="pl-solo">SOLO VIEW — other layers dimmed · close to restore</div>':'<div class="pl-solo">'+(l.pendingNote||'')+'</div>');
 $('#plate').style.borderTopColor=l.accent;
 $('#plate').classList.add('open');
 $('#plateClose').addEventListener('click',closePlate);
 inner.querySelectorAll('.lz-chip').forEach(b=>b.addEventListener('click',()=>{
  const bl=b.dataset.lid;
  if(b.dataset.clear)delete lens[bl];
  else lens[bl]={field:b.dataset.field,v:parseInt(b.dataset.v,10),label:b.dataset.label};
  bakeLayer(bl,true);scheduleQt();updateStatline();dirty=true;
  openPlate(bl);
 }));
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
  '<div class="hero-hint">hover anything · '+(railOrder.length>9?'1–9, 0':'1–'+railOrder.length)+' layers · R readings · F findings · G place names · E everything · C curated · ♪ audio · U / W sheets</div>'+
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
  '<div style="margin-top:10px">Basemaps: Natural Earth (public domain). Geocoding &amp; reference places: GeoNames (CC-BY 4.0). Notable-people data: Laouenan et al. (CC-BY-SA 4.0). Map data © OpenStreetMap contributors (ODbL). FARS &amp; GNIS: U.S. public domain.</div></div>'+
  '<div class="ab-h">METHODS</div>'+
  '<div class="ab-body" style="font-size:13px">Each layer is fetched by its own pipeline script into a staging file with a provenance sidecar (method, counts, caveats), then packed — coordinates quantized to ~110 m, giant datasets aggregated to cells — and baked into this single page. Terrain is computed here in your browser: density grids from the active layers, Gaussian-smoothed, contoured, and hillshaded; nothing is pre-rendered. Findings are computed at build time by pipeline/correlate.py (county joins, cell-grid log–log correlations), hand-reviewed, and shipped with their method notes; one deliberately spurious correlation is included as the control. Known limitations live on each plate as a FIELD NOTE. Full pipeline, data, and provenance: <a href="https://github.com/ansalamalasna/soulmap" target="_blank" rel="noopener noreferrer">github.com/ansalamalasna/soulmap</a>.</div>'+
  '<div class="ab-h">CITE THIS SURVEY</div>'+
  '<div class="ab-cite" id="abCiteText">The Soul Survey (v'+R.meta.version+', '+R.meta.surveyed.toLowerCase()+'). A topographic survey of the collective soul, conducted in objective data. https://ansalamalasna.github.io/soulmap/ — Layer vintages: FARS 2023 · CDC MIOV 2024 · Fortune 2025 · Pornhub Insights 2025 · NUFORC 1906–2014 · EPA NPL 2026-07 · USGS GNIS 2026-07 · Laouenan et al. 2022 (CC-BY-SA).</div>'+
  '<button class="ab-copy" id="abCopy">COPY CITATION</button>'+
  '<div class="ab-h">SURVEY LOG</div>'+
  '<table class="ab-log">'+live.map(l=>'<tr><td>'+l.title+'</td><td>'+(l.retrieved?String(l.retrieved).slice(0,10):'—')+'</td><td>'+(l.statline||l.unit)+'</td></tr>').join('')+
  '<tr><td>Releases</td><td colspan="2">v0.1 first light · v0.2 readings, eras, three layers · v0.3 findings, sound, curation · v0.3.1 reference &amp; zoom crossfade · v0.4 the Index, dossiers, trust kit · v'+R.meta.version+' the sorting, the ledger, lenses &amp; bios</td></tr></table>'+
  '<div class="ab-h">CONTROLS</div>'+
  '<div class="ab-kbd"><b>/</b> search the Index &nbsp; <b>1–'+railOrder.length+'</b> toggle layers &nbsp; <b>G</b> place names &nbsp; <b>R</b> readings &nbsp; <b>F</b> findings &nbsp; <b>E</b> everything &nbsp; <b>C</b> curated &nbsp; <b>U</b>/<b>W</b> sheets &nbsp; <b>scroll</b> zoom &nbsp; <b>ESC</b> close</div>';
 const cp=$('#abCopy');
 if(cp)cp.addEventListener('click',()=>{
  const txt=$('#abCiteText').textContent;
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).then(()=>toast('Citation copied.'),()=>toast('Select the citation text to copy it.'));
  else toast('Select the citation text to copy it.');
 });
 $('#aboutClose').addEventListener('click',()=>$('#about').classList.remove('open'));
}

function switchScope(s){
 if(s===scope)return;
 scope=s;
 buildScope(s);
 resetGlowFades();
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
}
function countyTintFor(C,lid){
 C.countyTints=C.countyTints||{};
 if(C.countyTints[lid]!==undefined)return C.countyTints[lid];
 const d=D[lid],l=byId[lid];
 if(!d||!C.countyBoxes){C.countyTints[lid]=null;return null;}
 const cv=document.createElement('canvas');cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
 const x=cv.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);
 if(d.kind==='flows'){
  const vmax=d.vmax||1;
  for(const b of C.countyBoxes){
   const e=d.counties[b.fips];if(!e)continue;
   const norm=Math.min(1,Math.abs(e.v)/vmax);
   x.fillStyle=hexA(e.v>=0?l.accent:(l.accent2||'#c98a7a'),0.04+norm*0.30);
   x.fill(b.p);
  }
 }else{
  const vmax=d.vmax||60;
  for(const b of C.countyBoxes){
   const e=d.counties[b.fips];if(!e)continue;
   const norm=Math.min(1,e.v/vmax);
   x.fillStyle=hexA(l.accent,0.04+norm*0.30);
   x.fill(b.p);
  }
 }
 C.countyTints[lid]=cv;
 return cv;
}
function countyTintLayers(){
 return live.filter(l=>l.forms.tint&&l.forms.regionKind==='county'&&scopeHas(l.id));
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
 d3.select('#stage').transition('fly').duration(REDUCED?0:(ms||2500)).ease(d3.easeCubicInOut)
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
  showCap(capBase('THE SOUL SURVEY','The terrain is us.','Toggle layers. Open a reading. Check the findings. Turn on the audio. Every point is real.')+
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
 reading=null;readingSaved=null;findingOpen=null;setCompare(null);
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
  openDossier(la,lo,'Your Position');
  toast('Position found — dossier drawn.');
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

// ---------- v3: findings + split compare ----------
let findingOpen=null,compareMode=null;
function setCompare(cm){
 compareMode=cm;
 const h=$('#splitHandle');
 if(cm){h.style.display='block';h.style.left=(cm.x*100)+'%';}
 else h.style.display='none';
 terrainDirty=true;dirty=true;
}
function buildFindingsMenu(){
 if(!R.findings)return;
 const m=$('#findingsMenu');m.innerHTML='';
 const d=document.createElement('div');d.className='fm-disc';d.textContent=R.findings.disclaimer;m.appendChild(d);
 R.findings.findings.forEach(f=>{
  const it=document.createElement('div');it.className='fm-card'+(f.spurious?' spur':'');
  it.innerHTML='<div class="fm-stat">'+f.stat+'</div><div class="fm-body"><div class="fm-t">'+f.title+(f.spurious?' <span class="fm-tag">SPURIOUS — ON PURPOSE</span>':'')+'</div><div class="fm-s">'+f.statLabel+'</div></div>';
  it.addEventListener('click',()=>applyFinding(f));
  m.appendChild(it);
 });
}
function findingCap(f){
 const ac=f.spurious?'#8a94a6':(byId[f.layers[0]]?byId[f.layers[0]].accent:'#e8b34b');
 return '<div class="cc-k" style="color:'+ac+'">FINDING'+(f.spurious?' — EPISTEMIC CONTROL':'')+'</div>'+
  '<div class="cc-t">'+f.title+'</div>'+
  '<div class="cc-stat" style="color:'+ac+'">'+f.stat+' <span>'+f.statLabel.toUpperCase()+'</span></div>'+
  '<div class="cc-x">'+f.body+'</div>'+
  '<div class="cc-meth">METHOD — '+f.method+'</div>'+
  '<div class="cc-meth" style="opacity:.7">'+R.findings.disclaimer+'</div>'+
  '<div class="cc-row"><span class="cc-step">FINDINGS · COMPUTED AT BUILD · pipeline/correlate.py</span><span class="cc-nav">'+
  (f.layers.length===2?'<button class="cc-btn" id="ccSplit">⇆ SPLIT</button>':'')+
  '<button class="cc-btn" id="ccEnd">✕ END</button></span></div>';
}
function applyFinding(f){
 clearOrient();
 if(plateOpen)closePlate();
 $('#findingsMenu').classList.remove('open');
 if(reading===null&&!findingOpen)readingSaved={scope:scope,targets:{...target},t:{k:t.k,x:t.x,y:t.y},era:era};
 reading=null;findingOpen=f.id;setCompare(null);
 if(f.scope!==scope)switchScope(f.scope);
 era=-1;
 for(const l of live)target[l.id]=(f.layers.indexOf(l.id)>=0?1:0);
 chipRefresh();updateStatline();eraRefresh();scheduleQt();terrainDirty=true;dirty=true;
 if(f.bbox)flyTo(f.bbox,2400);
 else d3.select('#stage').transition('fly').duration(1500).ease(d3.easeCubicInOut).call(zoomB.transform,d3.zoomIdentity);
 showCap(findingCap(f));
 const e=$('#ccEnd');if(e)e.addEventListener('click',endReading);
 const s=$('#ccSplit');if(s)s.addEventListener('click',()=>setCompare(compareMode?null:{a:f.layers[0],b:f.layers[1],x:0.52}));
}

// ---------- v3: audio ----------
let AU=null,audioOn=false,audioTimer=null,omenTimer=null;
const AUDIO_BASE={'memory-births':.17,'loss-crashes':.2,'power-datacenters':.09,'motion-fulfillment':.07,'power-fortune500':.05,'wonder-ufos':.05,'despair-overdoses':.08,'desire-searches':.06,'residue-superfund':.05,'omen-names':.6};
function mkNoise(ctx){
 const len=ctx.sampleRate*2,buf=ctx.createBuffer(1,len,ctx.sampleRate),d=buf.getChannelData(0);
 let last=0;
 for(let i=0;i<len;i++){const w=Math.random()*2-1;last=(last+0.03*w)/1.03;d[i]=last*3.2;}
 const src=ctx.createBufferSource();src.buffer=buf;src.loop=true;return src;
}
function buildAudio(){
 const Ctx=window.AudioContext||window.webkitAudioContext;
 if(!Ctx)throw new Error('no audio');
 const ctx=new Ctx();
 const comp=ctx.createDynamicsCompressor();comp.threshold.value=-26;comp.ratio.value=8;
 const master=ctx.createGain();master.gain.value=0;
 master.connect(comp);comp.connect(ctx.destination);
 const V={};
 const osc=(fr,ty)=>{const o=ctx.createOscillator();o.type=ty||'sine';o.frequency.value=fr;o.start();return o;};
 const lfoGain=(node,fr,depth,base)=>{const l=osc(fr);const lg=ctx.createGain();lg.gain.value=depth;l.connect(lg);lg.connect(node.gain);node.gain.value=base;};
 const voice=(build)=>{
  const g=ctx.createGain();g.gain.value=0;
  const pan=ctx.createStereoPanner?ctx.createStereoPanner():null;
  if(pan){g.connect(pan);pan.connect(master);}else g.connect(master);
  build(g);
  return {g,pan};
 };
 V['memory-births']=voice(g=>{const a=osc(146.83),b=osc(220);a.detune.value=-5;b.detune.value=6;const gg=ctx.createGain();a.connect(gg);b.connect(gg);gg.connect(g);lfoGain(gg,.07,.16,.5);});
 V['loss-crashes']=voice(g=>{const o=osc(55);const gg=ctx.createGain();o.connect(gg);gg.connect(g);lfoGain(gg,.85,.4,.5);});
 V['power-datacenters']=voice(g=>{const o=osc(98,'sawtooth');const f=ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=420;o.connect(f);f.connect(g);});
 V['motion-fulfillment']=voice(g=>{const n=mkNoise(ctx);const f=ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=820;f.Q.value=8;const gg=ctx.createGain();n.connect(f);f.connect(gg);gg.connect(g);lfoGain(gg,2.3,.45,.5);n.start();});
 V['power-fortune500']=voice(g=>{osc(293.66).connect(g);});
 V['wonder-ufos']=voice(g=>{const o=osc(1567);const gg=ctx.createGain();o.connect(gg);gg.connect(g);lfoGain(gg,5.1,.45,.5);setInterval(()=>{try{o.detune.linearRampToValueAtTime((Math.random()*2-1)*90,ctx.currentTime+1.4);}catch(e){}},1600);});
 V['despair-overdoses']=voice(g=>{const a=osc(233.08),b=osc(246.94);const gg=ctx.createGain();gg.gain.value=.5;a.connect(gg);b.connect(gg);gg.connect(g);});
 V['desire-searches']=voice(g=>{const n=mkNoise(ctx);const f=ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=520;f.Q.value=3.5;n.connect(f);f.connect(g);const l=osc(.06);const lg=ctx.createGain();lg.gain.value=320;l.connect(lg);lg.connect(f.frequency);n.start();});
 V['residue-superfund']=voice(g=>{const o=osc(311.13,'triangle');const f=ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=900;o.connect(f);f.connect(g);});
 V['omen-names']=voice(g=>{});
 return {ctx,master,V};
}
function viewportDensity(lid){
 const C=SC[scope];
 const g=layerGrid(C,lid);
 if(!g)return 0.45;
 const ext=C.ext;
 const x0=(padLeft()-t.x)/t.k,y0=(96-t.y)/t.k,x1=(W-44-t.x)/t.k,y1=(H-84-t.y)/t.k;
 const exw=ext[1][0]-ext[0][0],exh=ext[1][1]-ext[0][1];
 const gx0=Math.max(0,Math.floor((x0-ext[0][0])/exw*C.GW)),gx1=Math.min(C.GW-1,Math.ceil((x1-ext[0][0])/exw*C.GW));
 const gy0=Math.max(0,Math.floor((y0-ext[0][1])/exh*C.GH)),gy1=Math.min(C.GH-1,Math.ceil((y1-ext[0][1])/exh*C.GH));
 if(gx1<gx0||gy1<gy0)return 0;
 let s=0,n=0,cx=0;
 for(let y=gy0;y<=gy1;y+=2)for(let x=gx0;x<=gx1;x+=2){const v=g[y*C.GW+x];s+=v;n++;if(v>0)cx+=v*x;}
 const mean=n?s/n:0;
 const panx=s>0?((cx/s)-(gx0+gx1)/2)/Math.max(1,(gx1-gx0)/2):0;
 return {mean:Math.min(1,mean*2.2),pan:Math.max(-1,Math.min(1,panx))};
}
function updateAudio(){
 if(!AU||!audioOn)return;
 for(const l of live){
  const v=AU.V[l.id];if(!v)continue;
  const a=alpha[l.id]||0;
  let dens=0,pan=0;
  if(a>0.02&&scopeHas(l.id)){
   const r=viewportDensity(l.id);
   if(typeof r==='number')dens=r;else{dens=r.mean;pan=r.pan;}
  }
  const gt=Math.pow(dens,0.7)*a*(AUDIO_BASE[l.id]||.06);
  try{
   v.g.gain.setTargetAtTime(gt,AU.ctx.currentTime,.4);
   if(v.pan)v.pan.pan.setTargetAtTime(pan*.75,AU.ctx.currentTime,.6);
  }catch(e){}
 }
}
function omenPluck(){
 if(!AU||!audioOn)return;
 const a=alpha['omen-names']||0;
 if(a<=0.05||!scopeHas('omen-names'))return;
 const r=viewportDensity('omen-names');
 const dens=typeof r==='number'?r:r.mean;
 if(Math.random()>0.22+dens*0.6)return;
 const ctx=AU.ctx,v=AU.V['omen-names'];
 const freqs=[220,261.63,329.63,392,523.25];
 const o=ctx.createOscillator();o.type='triangle';
 o.frequency.value=freqs[Math.floor(Math.random()*freqs.length)];
 const g=ctx.createGain();
 g.gain.setValueAtTime(0.0001,ctx.currentTime);
 g.gain.exponentialRampToValueAtTime(.9,ctx.currentTime+.02);
 g.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+1.25);
 o.connect(g);g.connect(v.g);
 o.start();o.stop(ctx.currentTime+1.35);
}
function audioToggle(){
 if(!AU){
  try{AU=buildAudio();}catch(e){toast('Audio is unavailable in this browser or frame.');return;}
 }
 audioOn=!audioOn;
 $('#audioBtn').classList.toggle('on',audioOn);
 if(audioOn){
  try{AU.ctx.resume();}catch(e){}
  AU.master.gain.setTargetAtTime(.6,AU.ctx.currentTime,.5);
  if(!audioTimer)audioTimer=setInterval(updateAudio,300);
  if(!omenTimer)omenTimer=setInterval(omenPluck,620);
  updateAudio();
  toast('The survey is singing — pan the map, toggle layers, change eras.');
 }else{
  AU.master.gain.setTargetAtTime(0.0,AU.ctx.currentTime,.3);
  toast('Audio off.');
 }
}

// ---------- v4: THE INDEX ----------
const REDUCED=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let INDEX=null,idxResults=[],idxSel=0;
function buildIndex(){
 if(INDEX)return INDEX;
 const E=[];
 const push=(label,sub,o)=>{if(label)E.push(Object.assign({label:String(label),l:String(label).toLowerCase(),sub},o));};
 if(B.places){
  for(const r of B.places.us)push(r[0],r[1]+' · place',{type:'place',scope:'us',la:r[2],lo:r[3],pop:r[4]});
  for(const r of B.places.world)push(r[0],r[1]+' · place',{type:'place',scope:'world',la:r[2],lo:r[3],pop:r[4]});
 }
 const dm=D['memory-births'];
 if(dm)for(let i=0;i<dm.stars.name.length;i++)push(dm.stars.name[i],(dm.stars.birth[i]?'b. '+dm.stars.birth[i]+' · ':'')+(dm.stars.dom[i]||'memory'),{type:'star',lid:'memory-births',i,scope:'any',la:dm.stars.lat[i],lo:dm.stars.lon[i],pop:(dm.stars.v[i]||0)*20000});
 const sf=D['residue-superfund'];
 if(sf)for(let i=0;i<sf.name.length;i++)push(sf.name[i],'Superfund · '+sf.state[i],{type:'pt',lid:'residue-superfund',i,scope:'us',la:sf.lat[i],lo:sf.lon[i],pop:120000});
 const f5=D['power-fortune500'];
 if(f5)for(let i=0;i<f5.name.length;i++)push(f5.name[i],'#'+f5.rank[i]+' · '+f5.loc[i],{type:'pt',lid:'power-fortune500',i,scope:'us',la:f5.lat[i],lo:f5.lon[i],pop:(f5.v[i]||0)*3});
 const am=D['motion-fulfillment'];
 if(am)for(let i=0;i<am.name.length;i++)push(am.name[i],(am.typeNames[am.t[i]]||'')+' · '+am.loc[i],{type:'pt',lid:'motion-fulfillment',i,scope:'us',la:am.lat[i],lo:am.lon[i],pop:100000});
 const om=D['omen-names'];
 if(om)for(let i=0;i<om.name.length;i++)push(om.name[i],(om.s[i]?'light':'dark')+' omen · '+om.st[i],{type:'pt',lid:'omen-names',i,scope:'us',la:om.lat[i],lo:om.lon[i],pop:80000});
 for(const st in STATE_NAME)push(STATE_NAME[st],'state',{type:'state',st,scope:'us',pop:5000000});
 for(const l of live)push(l.title,'layer · '+themeById[l.theme].name,{type:'layer',lid:l.id,pop:3000000});
 R.readings.forEach((r,i)=>push(r.title,'reading',{type:'reading',ri:i,pop:3000000}));
 if(R.findings)R.findings.findings.forEach(f=>push(f.title,'finding · '+f.stat,{type:'finding',f,pop:3000000}));
 INDEX=E;
 return E;
}
function searchIndex(q){
 q=q.trim().toLowerCase();
 if(q.length<2)return [];
 const out=[];
 for(const e of buildIndex()){
  const ix=e.l.indexOf(q);
  if(ix<0)continue;
  let s=(ix===0?3:(e.l.charCodeAt(ix-1)===32?2:1))+Math.min(1.6,(e.pop||0)/6e6);
  out.push([s,e]);
 }
 out.sort((a,b)=>b[0]-a[0]);
 return out.slice(0,8).map(x=>x[1]);
}
function showTipAt(content,p){
 const sx=p[0]*t.k+t.x,sy=p[1]*t.k+t.y;
 tip.style.display='block';
 tip.style.borderLeftColor=content.color;
 tip.innerHTML='<div class="tt-k" style="color:'+content.color+'">'+content.k+'</div><div class="tt-t">'+content.ti+'</div>'+(content.s?'<div class="tt-s">'+content.s+'</div>':'');
 tip.style.left=Math.min(sx+16,W-300)+'px';
 tip.style.top=Math.min(sy+14,H-130)+'px';
}
function selectEntry(e){
 if(pickMode&&e.la!=null){
  const A=pickMode.A;
  pickMode=null;
  closeIndex();
  $('#idxHint').textContent='↑↓ select · ENTER go · ▤ field dossier on places · ESC close';
  renderDossierDiff(A,computeDossier(e.la,e.lo,e.label));
  return;
 }
 closeIndex();
 if(e.type==='layer'){openPlate(e.lid);return;}
 if(e.type==='reading'){startReading(e.ri);return;}
 if(e.type==='finding'){applyFinding(e.f);return;}
 let sc=e.scope;
 if(sc==='any')sc=buildScope('us').proj([e.lo,e.la])?'us':'world';
 if(sc==='us'&&e.type==='place'&&!buildScope('us').proj([e.lo,e.la]))sc='world';
 if(sc!==scope)switchScope(sc);
 if(e.lid&&!target[e.lid]&&scopeHas(e.lid)){
  target[e.lid]=1;
  chipRefresh();updateStatline();eraRefresh();scheduleQt();terrainDirty=true;bakeGlow(true);
 }
 let la=e.la,lo=e.lo;
 if(e.type==='state'){
  const c=SC[scope].stateCent[e.st];
  if(c&&SC[scope].proj.invert){const g=SC[scope].proj.invert(c);if(g){lo=g[0];la=g[1];}}
 }
 const dLo=e.type==='state'?3.4:0.55,dLa=e.type==='state'?2.4:0.38;
 flyTo([[lo-dLo,la-dLa],[lo+dLo,la+dLa]],2200,()=>{
  const C=SC[scope],p=C.proj([lo,la]);
  if(!p)return;
  if(e.type==='star'||e.type==='pt'){
   const f={lid:e.lid,i:e.i,kind:e.type==='star'?'star':'pt'};
   const content=tipHTML(f);
   hoverPt={x:p[0],y:p[1],color:content.color};dirty=true;
   showTipAt(content,p);
  }else{
   hoverPt={x:p[0],y:p[1],color:'#c8d2e2'};dirty=true;
   showTipAt({k:e.type==='state'?'REFERENCE — STATE':'REFERENCE',ti:e.label,s:e.sub,color:'#c8d2e2'},p);
  }
 });
}
function renderIdx(res){
 idxResults=res;idxSel=0;
 const box=$('#idxResults');
 box.innerHTML=res.length?'':'<div class="ix-empty">Type a town, a person, a company, a facility code, a buried site, an omen, a state, a layer, a reading, a finding. Everything named in the survey is indexed — 13,000 entries, all local.</div>';
 res.forEach((e,i)=>{
  const d=document.createElement('div');
  d.className='ix-row'+(i===idxSel?' sel':'');
  d.innerHTML='<span class="ix-l">'+e.label+'</span><span class="ix-s">'+e.sub+'</span>'+(e.type==='place'?'<button class="ix-dossier" title="Open field dossier" aria-label="Open field dossier">▤</button>':'');
  d.addEventListener('click',ev=>{
   if(ev.target.closest('.ix-dossier')){closeIndex();openDossier(e.la,e.lo,e.label);return;}
   selectEntry(e);
  });
  box.appendChild(d);
 });
}
function idxHighlight(){
 document.querySelectorAll('.ix-row').forEach((r,i)=>r.classList.toggle('sel',i===idxSel));
}
function openIndex(){
 buildIndex();
 $('#indexOverlay').classList.add('open');
 const inp=$('#idxInput');inp.value='';
 renderIdx([]);
 setTimeout(()=>inp.focus(),30);
}
function closeIndex(){
 $('#indexOverlay').classList.remove('open');
 if(pickMode){pickMode=null;$('#idxHint').textContent='↑↓ select · ENTER go · ▤ field dossier on places · ESC close';}
}

// ---------- v4: FIELD DOSSIER ----------
let rateRank=null;
function getRateRank(){
 if(rateRank)return rateRank;
 const dd=D['despair-overdoses'];
 rateRank={};
 if(dd){
  const arr=Object.entries(dd.counties).sort((a,b)=>b[1].v-a[1].v);
  arr.forEach(([fips],i)=>rateRank[fips]=i+1);
  rateRank.__n=arr.length;
 }
 return rateRank;
}
function doRow(lid,html){
 const l=byId[lid];
 return '<div class="do-row"><span class="dot" style="background:'+(l?l.accent:'#c8d2e2')+'"></span><span>'+html+'</span></div>';
}
function openDossier(la,lo,label){
 const usOk=!!buildScope('us').proj([lo,la]);
 if(usOk&&scope!=='us')switchScope('us');
 flyTo([[lo-1.2,la-0.85],[lo+1.2,la+0.85]],2200);
 renderDossier(computeDossier(la,lo,label));
}
function computeDossier(la,lo,label){
 const usOk=!!buildScope('us').proj([lo,la]);
 const secs=[];
 // THE GROUND
 let ground='';
 let stName='',countyName='',countyFips=null;
 if(usOk){
  const C=buildScope('us');
  const p=C.proj([lo,la]);
  idT(hitCtx);
  for(const st in C.statePaths){if(hitCtx.isPointInPath(C.statePaths[st],p[0]*dpr,p[1]*dpr)){stName=STATE_NAME[st]||st;
   const dd=D['desire-searches'];
   if(dd){
    if(dd.us[st])ground+=doRow('desire-searches','State’s signature search: <b>'+dd.us[st]+'</b>');
    else if(dd.dark.indexOf(st)>=0)ground+=doRow('desire-searches','Desire: <b>unmeasured</b> — access blocked here (dark state)');
   }
   break;}}
  ensureCounties(C);
  if(C.countyBoxes){
   for(const b of C.countyBoxes){
    if(p[0]<b.x0||p[0]>b.x1||p[1]<b.y0||p[1]>b.y1)continue;
    if(hitCtx.isPointInPath(b.p,p[0]*dpr,p[1]*dpr)){countyName=b.name;countyFips=b.fips;break;}
   }
  }
  if(countyFips){
   const dd=D['despair-overdoses'];
   const e=dd&&dd.counties[countyFips];
   const rr=getRateRank();
   if(e)ground=doRow('despair-overdoses','Overdose mortality: <b>'+e.v+' per 100k (2024)</b> — rank '+(rr[countyFips]||'—')+' of '+fmtInt(rr.__n||0)+' counties')+ground;
   else ground=doRow('despair-overdoses','Overdose mortality: <b>suppressed</b> (small counts protect privacy)')+ground;
  }
 }
 if(ground)secs.push(['THE GROUND',ground]);
 // THE LIGHT
 let light='';
 const dm=D['memory-births'];
 if(dm){
  const n=nearestOf(la,lo,dm.stars.lat,dm.stars.lon);
  if(n.i>=0)light+=doRow('memory-births','Most notable neighbor: <b>'+dm.stars.name[n.i]+'</b>'+(dm.stars.birth[n.i]?' (b. '+dm.stars.birth[n.i]+')':'')+' · '+Math.round(n.km)+' km');
  let births=0;
  for(let i=0;i<dm.cells.lat.length;i++){
   if(Math.abs(dm.cells.lat[i]-la)>0.7||Math.abs(dm.cells.lon[i]-lo)>0.9)continue;
   if(havKm(la,lo,dm.cells.lat[i],dm.cells.lon[i])<=50)births+=dm.cells.v[i];
  }
  light+=doRow('memory-births','Remembered births within 50 km: <b>'+fmtInt(births)+'</b>');
 }
 if(light)secs.push(['THE LIGHT',light]);
 // THE MACHINES
 let mach='';
 const dc=D['power-datacenters'];
 if(dc){const n=nearestOf(la,lo,dc.lat,dc.lon);if(n.i>=0)mach+=doRow('power-datacenters','Nearest data center: <b>'+(dc.name[n.i]||'unnamed facility')+'</b> · '+Math.round(n.km)+' km');}
 const f5=D['power-fortune500'];
 if(f5&&usOk){const n=nearestOf(la,lo,f5.lat,f5.lon);if(n.i>=0)mach+=doRow('power-fortune500','Nearest throne: <b>#'+f5.rank[n.i]+' '+f5.name[n.i]+'</b> · '+Math.round(n.km)+' km');}
 const am=D['motion-fulfillment'];
 if(am&&usOk){const n=nearestOf(la,lo,am.lat,am.lon);if(n.i>=0)mach+=doRow('motion-fulfillment','Nearest Amazon node: <b>'+am.name[n.i]+'</b> ('+(am.typeNames[am.t[n.i]]||'')+') · '+Math.round(n.km)+' km');}
 if(mach)secs.push(['THE MACHINES',mach]);
 // THE TOLL
 let toll='';
 const cr=D['loss-crashes'];
 if(cr&&usOk){
  let c=0,dth=0;
  for(let i=0;i<cr.lat.length;i++){
   if(Math.abs(cr.lat[i]-la)>0.45||Math.abs(cr.lon[i]-lo)>0.6)continue;
   if(havKm(la,lo,cr.lat[i],cr.lon[i])<=40){c++;dth+=cr.v[i];}
  }
  toll+=doRow('loss-crashes','Fatal crashes within 40 km (2023): <b>'+fmtInt(c)+'</b> · <b>'+fmtInt(dth)+' deaths</b>');
 }
 const sf=D['residue-superfund'];
 if(sf&&usOk){const n=nearestOf(la,lo,sf.lat,sf.lon);if(n.i>=0)toll+=doRow('residue-superfund','Nearest buried ground: <b>'+sf.name[n.i]+'</b> ('+['proposed','on the NPL','deleted'][sf.st2[n.i]]+') · '+Math.round(n.km)+' km');}
 const uf=D['wonder-ufos'];
 if(uf){
  let s=0;
  for(let i=0;i<uf.lat.length;i++){
   if(Math.abs(uf.lat[i]-la)>0.7||Math.abs(uf.lon[i]-lo)>0.9)continue;
   if(havKm(la,lo,uf.lat[i],uf.lon[i])<=50)s+=uf.v?uf.v[i]:1;
  }
  toll+=doRow('wonder-ufos','Sightings reported within 50 km: <b>'+fmtInt(s)+'</b> (1906–2014)');
 }
 if(toll)secs.push(['THE TOLL & THE SKY',toll]);
 // THE OMENS
 let omens='';
 const om=D['omen-names'];
 if(om&&usOk){
  let bd=1e9,bi=-1,ld=1e9,li=-1;
  for(let i=0;i<om.lat.length;i++){
   const d=havKm(la,lo,om.lat[i],om.lon[i]);
   if(om.s[i]===0){if(d<bd){bd=d;bi=i;}}else{if(d<ld){ld=d;li=i;}}
  }
  if(bi>=0)omens+=doRow('omen-names','Nearest dark name: <b>'+om.name[bi]+'</b> · '+Math.round(bd)+' km');
  if(li>=0)omens+=doRow('omen-names','Nearest light name: <b>'+om.name[li]+'</b> · '+Math.round(ld)+' km');
 }
 if(omens)secs.push(['THE OMENS',omens]);

 const title=label||'Your Position';
 const coords=Math.abs(la).toFixed(3)+'°'+(la>=0?'N':'S')+'  '+Math.abs(lo).toFixed(3)+'°'+(lo>=0?'E':'W')+(countyName?' · '+countyName+(stName?' — '+stName.toUpperCase():''):stName?' · '+stName.toUpperCase():'');
 return {title,coords,secs};
}
function renderDossier(d){
 window.__dossier=d;
 $('#dossierInner').innerHTML='<button class="pl-x" id="doClose">✕ ESC</button>'+
  '<div class="do-over">FIELD DOSSIER — '+R.meta.sheet+'</div>'+
  '<div class="do-title">'+d.title+'</div>'+
  '<div class="do-coords">'+d.coords+'</div>'+
  d.secs.map(s=>'<div class="do-h">'+s[0]+'</div>'+s[1]).join('')+
  '<div class="do-actions"><button class="cc-btn" id="doCompare">⇄ COMPARE</button><button class="cc-btn" id="doExport">⤓ EXPORT DOSSIER</button><button class="cc-btn" id="doClose2">CLOSE</button></div>';
 $('#dossier').classList.add('open');
 const close=()=>$('#dossier').classList.remove('open');
 $('#doClose').addEventListener('click',close);
 $('#doClose2').addEventListener('click',close);
 $('#doExport').addEventListener('click',exportDossier);
 $('#doCompare').addEventListener('click',()=>{
  pickMode={A:d};
  $('#dossier').classList.remove('open');
  openIndex();
  $('#idxHint').textContent='PICK THE SECOND PLACE — any town, star, or site with coordinates · ESC cancels';
 });
}
function renderDossierDiff(A,B){
 window.__dossier=null;
 const names=[];
 A.secs.concat(B.secs).forEach(s=>{if(names.indexOf(s[0])<0)names.push(s[0]);});
 const find=(d,n)=>{const s=d.secs.find(x=>x[0]===n);return s?s[1]:'<div class="do-row"><span class="dot" style="background:#5a6577"></span><span>— not surveyed here</span></div>';};
 $('#dossierInner').innerHTML='<button class="pl-x" id="doClose">✕ ESC</button>'+
  '<div class="do-over">FIELD DOSSIER — FACE TO FACE</div>'+
  '<div class="dd-grid"><div><div class="do-title" style="font-size:21px">'+A.title+'</div><div class="do-coords">'+A.coords+'</div></div>'+
  '<div><div class="do-title" style="font-size:21px">'+B.title+'</div><div class="do-coords">'+B.coords+'</div></div></div>'+
  names.map(n=>'<div class="do-h">'+n+'</div><div class="dd-grid"><div>'+find(A,n)+'</div><div>'+find(B,n)+'</div></div>').join('')+
  '<div class="do-actions"><button class="cc-btn" id="doClose2">CLOSE</button></div>';
 $('#dossier').classList.add('open');
 const close=()=>$('#dossier').classList.remove('open');
 $('#doClose').addEventListener('click',close);
 $('#doClose2').addEventListener('click',close);
}
function exportDossier(){
 const d=window.__dossier;if(!d)return;
 const Wd=1080,pad=70;
 const rows=[];
 d.secs.forEach(s=>{
  rows.push(['h',s[0]]);
  const tmp=document.createElement('div');tmp.innerHTML=s[1];
  tmp.querySelectorAll('.do-row').forEach(r=>{
   const dot=r.querySelector('.dot');
   rows.push(['r',r.textContent.trim(),dot?dot.style.background:'#c8d2e2']);
  });
 });
 const Hd=250+rows.reduce((a,r)=>a+(r[0]==='h'?58:34),0)+120;
 const off=document.createElement('canvas');off.width=Wd*2;off.height=Hd*2;
 const x=off.getContext('2d');x.scale(2,2);
 x.fillStyle='#070a10';x.fillRect(0,0,Wd,Hd);
 x.strokeStyle='rgba(170,188,214,.4)';x.strokeRect(16,16,Wd-32,Hd-32);
 x.textBaseline='top';x.textAlign='left';
 x.fillStyle='#8a94a6';x.font='500 11px "IBM Plex Mono"';x.fillText('FIELD DOSSIER — '+R.meta.sheet+' · SURVEYED '+R.meta.surveyed,pad,60);
 x.fillStyle='#e8e4d8';x.font='italic 700 40px "Fraunces"';x.fillText(d.title,pad-2,84);
 x.fillStyle='#8a94a6';x.font='400 11px "IBM Plex Mono"';x.fillText(d.coords,pad,140);
 let y=196;
 for(const r of rows){
  if(r[0]==='h'){
   x.strokeStyle='rgba(148,166,196,.16)';x.beginPath();x.moveTo(pad,y);x.lineTo(Wd-pad,y);x.stroke();
   x.fillStyle='#e8b34b';x.font='500 11px "IBM Plex Mono"';x.fillText(r[1],pad,y+16);y+=58;
  }else{
   x.fillStyle=r[2];x.beginPath();x.arc(pad+5,y+8,4,0,7);x.fill();
   x.fillStyle='#c9cfda';x.font='400 13px "IBM Plex Mono"';x.fillText(r[1],pad+22,y);y+=34;
  }
 }
 x.fillStyle='#5a6577';x.font='400 9px "IBM Plex Mono"';
 x.fillText('THE SOUL SURVEY · WHERE, NOT WHY · SOURCES: NHTSA FARS · CDC · EPA · USGS GNIS · NUFORC · OSM (ODbL) · GEONAMES (CC-BY) · LAOUENAN ET AL. (CC-BY-SA)',pad,Hd-70);
 off.toBlob(b=>{
  if(!b){toast('Export failed.');return;}
  const url=URL.createObjectURL(b);
  const inFrame=(function(){try{return window.self!==window.top;}catch(e){return true;}})();
  if(inFrame){const w=window.open(url,'_blank');toast(w?'Dossier rendered — save it from the new tab.':'Popup blocked — allow popups to export.');}
  else{const a=document.createElement('a');a.href=url;a.download='soul-survey-dossier.png';document.body.appendChild(a);a.click();a.remove();toast('Dossier exported.');}
  setTimeout(()=>URL.revokeObjectURL(url),90000);
 },'image/png');
}

// ---------- zoom ----------
const zoomB=d3.zoom().scaleExtent([1,26]).on('zoom',ev=>{
 t=ev.transform;dirty=true;needBake=true;zooming=true;
 clearTimeout(zoomEndT);
 zoomEndT=setTimeout(()=>{zooming=false;bakeGlow(true);},170);
}).on('end',()=>{updateScalebar();writeHash();});

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
 buildFindingsMenu();
 $('#mhSheet').textContent=R.meta.sheet+' · '+R.meta.surveyed;
 $('#mhTitle').innerHTML='THE <em>SOUL</em> SURVEY';
 $('#mhTagline').textContent=R.meta.tagline;
 $('#scopeUS').classList.toggle('on',scope==='us');
 $('#scopeWorld').classList.toggle('on',scope==='world');
 $('#scopeUS').addEventListener('click',()=>switchScope('us'));
 $('#scopeWorld').addEventListener('click',()=>switchScope('world'));
 $('#aboutBtn').addEventListener('click',()=>$('#about').classList.add('open'));
 $('#about').addEventListener('click',ev=>{if(ev.target.id==='about')$('#about').classList.remove('open');});
 $('#readingsBtn').addEventListener('click',ev=>{ev.stopPropagation();$('#findingsMenu').classList.remove('open');$('#readingsMenu').classList.toggle('open');});
 $('#findingsBtn').addEventListener('click',ev=>{ev.stopPropagation();$('#readingsMenu').classList.remove('open');$('#findingsMenu').classList.toggle('open');});
 document.addEventListener('click',ev=>{if(!ev.target.closest('.mh-menu-wrap')){$('#readingsMenu').classList.remove('open');$('#findingsMenu').classList.remove('open');}});
 $('#locateBtn').addEventListener('click',locateMe);
 $('#exportBtn').addEventListener('click',exportSheet);
 $('#audioBtn').addEventListener('click',audioToggle);
 $('#indexBtn').addEventListener('click',openIndex);
 $('#indexOverlay').addEventListener('click',ev=>{if(ev.target.id==='indexOverlay')closeIndex();});
 $('#dossier').addEventListener('click',ev=>{if(ev.target.id==='dossier')$('#dossier').classList.remove('open');});
 const idxInp=$('#idxInput');
 idxInp.addEventListener('input',()=>renderIdx(searchIndex(idxInp.value)));
 idxInp.addEventListener('keydown',ev=>{
  if(ev.key==='ArrowDown'){ev.preventDefault();if(idxResults.length){idxSel=(idxSel+1)%idxResults.length;idxHighlight();}}
  else if(ev.key==='ArrowUp'){ev.preventDefault();if(idxResults.length){idxSel=(idxSel-1+idxResults.length)%idxResults.length;idxHighlight();}}
  else if(ev.key==='Enter'){if(idxResults[idxSel])selectEntry(idxResults[idxSel]);}
  else if(ev.key==='Escape'){closeIndex();}
 });
 $('#railToggle').addEventListener('click',()=>$('#rail').classList.toggle('open'));
 const sh=$('#splitHandle');let shDrag=false;
 sh.addEventListener('pointerdown',ev=>{shDrag=true;try{sh.setPointerCapture(ev.pointerId);}catch(e){}});
 sh.addEventListener('pointermove',ev=>{if(!shDrag||!compareMode)return;compareMode.x=Math.max(.12,Math.min(.88,ev.clientX/W));sh.style.left=(compareMode.x*100)+'%';dirty=true;});
 window.addEventListener('pointerup',()=>{shDrag=false;});
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
   endReading();
  }
 });
 stage.addEventListener('pointerleave',()=>{tip.style.display='none';hoverPt=null;updateDatumDefault();dirty=true;});
 window.addEventListener('keydown',ev=>{
  if(ev.target&&(ev.target.tagName==='INPUT'||ev.target.tagName==='TEXTAREA')){
   if(ev.key==='Escape')closeIndex();
   return;
  }
  if(ev.key==='/'){ev.preventDefault();openIndex();return;}
  if(ev.key==='Escape'){
   if($('#indexOverlay').classList.contains('open'))closeIndex();
   else if($('#dossier').classList.contains('open'))$('#dossier').classList.remove('open');
   else if($('#about').classList.contains('open'))$('#about').classList.remove('open');
   else if(reading!==null||findingOpen)endReading();
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
  if(ev.key==='r'||ev.key==='R'){$('#findingsMenu').classList.remove('open');$('#readingsMenu').classList.toggle('open');}
  if(ev.key==='f'||ev.key==='F'){$('#readingsMenu').classList.remove('open');$('#findingsMenu').classList.toggle('open');}
  const setAll=v=>{for(const l of live)target[l.id]=v&&scopeHas(l.id)?1:0;chipRefresh();updateStatline();eraRefresh();scheduleQt();terrainDirty=true;dirty=true;writeHash();};
  if(ev.key==='e'||ev.key==='E')setAll(1);
  if(ev.key==='n'||ev.key==='N')setAll(0);
  if(ev.key==='g'||ev.key==='G'){refNames=!refNames;refSyncs.forEach(fn=>fn());dirty=true;}
  if(ev.key==='c'||ev.key==='C'){for(const l of live)target[l.id]=CURATED.indexOf(l.id)>=0&&scopeHas(l.id)?1:0;chipRefresh();updateStatline();eraRefresh();scheduleQt();terrainDirty=true;dirty=true;writeHash();}
 });
 if(hashHadState)$('#hero').classList.add('gone');
 let rsT=null;
 window.addEventListener('resize',()=>{
  clearTimeout(rsT);
  rsT=setTimeout(()=>{
   sizeCanvases();
   for(const k in SC)delete SC[k];
   for(const k in glowBMs)delete glowBMs[k];
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
