/* Triple Triad — mobile-dnd.js (Versão Final v3)
 * Correções:
 * 1. Permite arrastar cartas do Jogador 2 (IA desligada/Local Multiplayer).
 * 2. Visual do clone sempre mostra a frente da carta (remove 'flipped').
 * 3. Otimização de Highlight sem flicker.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Seleciona todas as cartas que não estão desabilitadas
    const getPlayableCards = () => document.querySelectorAll('.hand .card:not(.disabled)');
    
    let activeCard = null;
    let clone = null;
    let initialRect = null;
    let touchOffsetX = 0;
    let touchOffsetY = 0;
    let currentHovered = null;

    // --- LÓGICA DO JOGO ---
    function triggerGameMove(card, cell) {
        let cellIndex = parseInt(cell.dataset.index, 10);
        if (isNaN(cellIndex)) cellIndex = Array.from(cell.parentNode.children).indexOf(cell);

        let cardIndex = parseInt(card.dataset.hindex, 10);
        if (isNaN(cardIndex)) cardIndex = Array.from(card.parentNode.children).indexOf(card);

        // Detecta dono dinamicamente (para suportar Jogador 2)
        const owner = card.closest('.hand').classList.contains('ai') ? 'ai' : 'you';

        if (typeof window.playCard === 'function') {
            window.playCard(owner, cardIndex, cellIndex);
        } else {
            document.dispatchEvent(new CustomEvent('tt:playCard', { 
                detail: { owner, hindex: cardIndex, cindex: cellIndex } 
            }));
        }
    }

    // --- EVENTOS ---
    function onPointerDown(e) {
        const card = e.target.closest('.card');
        
        // Verifica se é uma carta válida e se não está desabilitada
        if (!card || card.classList.contains('disabled')) return;
        
        e.preventDefault();
        
        activeCard = card;
        initialRect = card.getBoundingClientRect();
        touchOffsetX = e.clientX - initialRect.left;
        touchOffsetY = e.clientY - initialRect.top;

        // Clone Visual
        clone = card.cloneNode(true);
        
        // Garante que o clone mostre a face da carta
        clone.classList.remove('flipped'); 
        
        Object.assign(clone.style, {
            position: 'fixed',
            left: `${initialRect.left}px`,
            top: `${initialRect.top}px`,
            width: `${initialRect.width}px`,
            height: `${initialRect.height}px`,
            zIndex: '9999',
            pointerEvents: 'none',
            opacity: '0.9',
            transform: 'scale(1.1)', 
            transition: 'none'
        });
        
        clone.classList.remove('selected');
        document.body.appendChild(clone);
        
        activeCard.classList.add('drag-origin-dim');
        activeCard.style.opacity = '0.4';

        card.setPointerCapture(e.pointerId);
        card.addEventListener('pointermove', onPointerMove);
        card.addEventListener('pointerup', onPointerUp);
        card.addEventListener('pointercancel', onPointerUp);
    }

    function onPointerMove(e) {
        if (!activeCard || !clone) return;
        
        const x = e.clientX - touchOffsetX;
        const y = e.clientY - touchOffsetY;
        clone.style.left = `${x}px`;
        clone.style.top = `${y}px`;

        highlightDropZone(e.clientX, e.clientY);
    }

    function onPointerUp(e) {
        if (!activeCard) return;

        activeCard.releasePointerCapture(e.pointerId);
        const targetCell = getDropTarget(e.clientX, e.clientY);

        if (targetCell && targetCell.classList.contains('empty')) {
            triggerGameMove(activeCard, targetCell);
        } 

        cleanup();
    }

    // --- AUXILIARES ---
    function getDropTarget(x, y) {
        const el = document.elementFromPoint(x, y);
        return el ? el.closest('.cell') : null;
    }

    function highlightDropZone(x, y) {
        const target = getDropTarget(x, y);
        if (target === currentHovered) return;

        if (currentHovered) {
            currentHovered.classList.remove('drag-hover');
            currentHovered = null;
        }

        if (target && target.classList.contains('empty')) {
            target.classList.add('drag-hover');
            currentHovered = target;
        }
    }

    function cleanup() {
        if (activeCard) {
            activeCard.removeEventListener('pointermove', onPointerMove);
            activeCard.removeEventListener('pointerup', onPointerUp);
            activeCard.removeEventListener('pointercancel', onPointerUp);
            activeCard.classList.remove('drag-origin-dim');
            activeCard.style.opacity = '';
        }
        
        if (clone) clone.remove();
        
        if (currentHovered) {
            currentHovered.classList.remove('drag-hover');
            currentHovered = null;
        }
        
        activeCard = null;
        clone = null;
    }

    // Inicialização segura
    function initCards() {
        document.querySelectorAll('.card').forEach(c => {
            c.removeEventListener('pointerdown', onPointerDown);
        });

        getPlayableCards().forEach(card => {
            card.addEventListener('pointerdown', onPointerDown);
            card.style.touchAction = 'none';
        });
    }

    initCards();

    // Observa mudanças nas mãos
    const observer = new MutationObserver((mutations) => {
        initCards();
    });

    const layout = document.querySelector('.layout');
    if (layout) {
        observer.observe(layout, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }
});