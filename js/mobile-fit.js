/* Triple Triad — mobile-fit.js
 * Scales .layout to fit the viewport on phones/tablets.
 */
(function(){
  const isMobile = () => matchMedia('(max-width: 1024px)').matches || matchMedia('(hover: none)').matches;
  const $ = (s,r=document)=>r.querySelector(s);
  const VV = window.visualViewport;

  function vw(){ return VV ? VV.width : innerWidth; }
  function vh(){ return VV ? VV.height: innerHeight; }

  function fit(){
    const L = $('.layout'); if(!L) return;
    if(!isMobile()){ L.style.transform=''; L.style.transformOrigin=''; document.documentElement.style.overflow=''; return; }
    const H = $('.topbar'); const head = H ? H.getBoundingClientRect().height : 0;
    const availH = Math.max(220, vh() - head - 8);
    const prev = L.style.transform; L.style.transform = 'none';
    const r = L.getBoundingClientRect();
    const needW = r.width + 12, needH = r.height + 12;
    const sW = vw()/needW, sH = availH/needH;
    const s = Math.min(1, sW, sH);
    L.style.transformOrigin = 'top center';
    L.style.transform = 'scale('+s+')';
    document.documentElement.style.overflow = (s < 1 ? 'hidden' : '');
  }

  function rafFit(){ cancelAnimationFrame(rafFit._id||0); rafFit._id=requestAnimationFrame(fit); }

  if(document.readyState!=='loading') fit(); else document.addEventListener('DOMContentLoaded', fit, {once:true});
  addEventListener('resize', rafFit);
  addEventListener('orientationchange', rafFit);
  if(VV){ VV.addEventListener('resize', rafFit); VV.addEventListener('scroll', rafFit); }
})();