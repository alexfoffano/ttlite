/* Triple Triad — mobile-dnd.js (v3.3)
 * Touch-first proxy drag that coexists with desktop HTML5 drag.
 * - Works with Pointer Events or touch events (fallback)
 * - Wires all cards in hands, but só inicia se .draggable === true
 * - Highlight só em células livres (usa state.board ou DOM fallback)
 * - playCard lookup dinâmico + fallback por evento "tt:playCard"
 */
(function(){
  const CONFIG = {
    cardSelector: '.hand.you .card, .hand.ai .card',
    boardCellSelector: '#board .cell',
    dragScale: 1.05,
    dimClass: 'drag-origin-dim'
  };

  const HAS_POINTER = !!window.PointerEvent;
  const isTouchLike = () => matchMedia('(hover: none)').matches || ('ontouchstart' in window);

  const getPlayCard = () => (typeof window.playCard === 'function') ? window.playCard : null;
  const $all = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function isCellFree(cell){
    if(!cell) return false;
    const idx = parseInt(cell.dataset.index, 10);
    const board = (window.state && Array.isArray(window.state.board)) ? window.state.board : null;
    if(Number.isInteger(idx) && board){
      return !board[idx];
    }
    // DOM fallback
    return !cell.querySelector('.card');
  }

  function canStartDrag(card){
    // Só começa se o jogo marcou como draggable (property ou atributo)
    return card && (card.draggable === true || card.getAttribute('draggable') === 'true');
  }

  let dragging = null; // {orig, proxy, overCell, prevDraggable, offsetX, offsetY, mode}

  function createProxyFrom(el){
    const r = el.getBoundingClientRect();
    const proxy = el.cloneNode(true);
    Object.assign(proxy.style, {
      position: 'fixed',
      left: r.left + 'px',
      top: r.top + 'px',
      width: r.width + 'px',
      height: r.height + 'px',
      pointerEvents: 'none',
      zIndex: 9999,
      transform: 'scale(1)',
      willChange: 'transform,left,top'
    });
    proxy.classList.add('tt-proxy');
    document.body.appendChild(proxy);
    return proxy;
  }

  function startDrag(card, clientX, clientY, mode){
    if(!canStartDrag(card)) return;
    // Avoid native gestures/scroll
    card.style.touchAction = 'none';

    const r = card.getBoundingClientRect();
    const proxy = createProxyFrom(card);
    const offsetX = clientX - r.left;
    const offsetY = clientY - r.top;
    proxy.style.transform = 'scale('+CONFIG.dragScale+')';

    const prevDraggable = card.draggable;
    card.draggable = false;
    card.classList.add(CONFIG.dimClass);

    dragging = { orig: card, proxy, overCell: null, prevDraggable, offsetX, offsetY, mode };
  }

  function moveDrag(clientX, clientY){
    if(!dragging) return;
    const { proxy, offsetX, offsetY } = dragging;
    proxy.style.left = (clientX - offsetX) + 'px';
    proxy.style.top  = (clientY - offsetY) + 'px';

    const over = document.elementFromPoint(clientX, clientY);
    const cell = (over && over.closest) ? over.closest(CONFIG.boardCellSelector) : null;
    const free = isCellFree(cell);
    highlightCell(free ? cell : null);
    dragging.overCell = free ? cell : null;
  }

  function endDrag(){
    if(!dragging) return;
    const { orig, proxy, overCell, prevDraggable } = dragging;

    orig.draggable = prevDraggable;
    orig.classList.remove(CONFIG.dimClass);

    clearHighlight();
    proxy.remove();

    if(overCell){
      const playCardFn = getPlayCard();
      const owner  = orig.dataset.owner  || 'you';
      const hindex = parseInt(orig.dataset.hindex, 10);
      const cindex = parseInt(overCell.dataset.index, 10);
      if(Number.isInteger(hindex) && Number.isInteger(cindex)){
        if(typeof playCardFn === 'function'){
          try { playCardFn(owner, hindex, cindex); } catch(err){ console.error(err); }
        } else {
          document.dispatchEvent(new CustomEvent('tt:playCard', { detail: { owner, hindex, cindex } }));
        }
      }
    }
    dragging = null;
  }

  // Pointer path
  function onPointerDown(e){
    // Só ativa em contexto touch-like para não conflitar com desktop
    if(e.pointerType !== 'touch' && !isTouchLike()) return;
    const el = e.currentTarget;
    startDrag(el, e.clientX, e.clientY, 'pointer');
    if(dragging){
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('pointerup', onPointerUp, { passive: true });
      window.addEventListener('pointercancel', onPointerUp, { passive: true });
      e.preventDefault?.();
    }
  }
  function onPointerMove(e){ moveDrag(e.clientX, e.clientY); }
  function onPointerUp(e){
    endDrag();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  }

  // Touch fallback (para navegadores sem Pointer Events ou com conflitos)
  function onTouchStart(e){
    const el = e.currentTarget;
    if(!isTouchLike()) return;
    if(!canStartDrag(el)) return;
    const t = e.changedTouches && e.changedTouches[0];
    if(!t) return;
    startDrag(el, t.clientX, t.clientY, 'touch');
    if(dragging){
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', onTouchEnd, { passive: true });
      window.addEventListener('touchcancel', onTouchEnd, { passive: true });
      e.preventDefault(); // impede scroll/zoom gestual
    }
  }
  function onTouchMove(e){
    if(!dragging) return;
    const t = e.changedTouches && e.changedTouches[0];
    if(!t) return;
    moveDrag(t.clientX, t.clientY);
    e.preventDefault();
  }
  function onTouchEnd(e){
    endDrag();
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('touchcancel', onTouchEnd);
  }

  function highlightCell(cell){
    if(highlightCell._last && highlightCell._last !== cell){
      highlightCell._last.style.removeProperty('outline');
      highlightCell._last.style.removeProperty('outline-offset');
    }
    if(cell){
      cell.style.outline = '2px dashed #8dd1ff';
      cell.style.outlineOffset = '-4px';
    }
    highlightCell._last = cell || null;
  }
  function clearHighlight(){
    if(highlightCell._last){
      highlightCell._last.style.removeProperty('outline');
      highlightCell._last.style.removeProperty('outline-offset');
      highlightCell._last = null;
    }
  }

  function wire(card){
    if(card.__ttTouchDnD) return;
    card.__ttTouchDnD = true;
    // Sempre preparar para toque
    card.style.touchAction = 'none';
    if(HAS_POINTER){
      card.addEventListener('pointerdown', onPointerDown, { passive: true });
    }
    // Touch fallback (e também em iOS para garantir)
    card.addEventListener('touchstart', onTouchStart, { passive: false });
  }

  function init(){
    $all(CONFIG.cardSelector).forEach(wire);
    const mo = new MutationObserver(muts=>{
      for(const m of muts){
        m.addedNodes.forEach(n=>{
          if(!(n instanceof HTMLElement)) return;
          if(n.matches && n.matches(CONFIG.cardSelector)) wire(n);
          n.querySelectorAll?.(CONFIG.cardSelector).forEach(wire);
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if(document.readyState!=='loading') init();
  else document.addEventListener('DOMContentLoaded', init, { once:true });
})();