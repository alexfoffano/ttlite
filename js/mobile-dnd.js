/* Triple Triad — mobile-dnd.js (Versão Otimizada v2)
 * Correção: Remove o "flicker" do efeito hover ao mover o mouse.
 */

document.addEventListener('DOMContentLoaded', () => {
    const getHandCards = () => document.querySelectorAll('.hand.you .card:not(.disabled)');
    
    let activeCard = null;
    let clone = null;
    let initialRect = null;
    let touchOffsetX = 0;
    let touchOffsetY = 0;
    
    // Variável para lembrar qual célula está iluminada e evitar piscar
    let currentHovered = null;

    // --- LÓGICA DO JOGO ---
    function triggerGameMove(card, cell) {
        let cellIndex = parseInt(cell.dataset.index, 10);
        if (isNaN(cellIndex)) {
            cellIndex = Array.from(cell.parentNode.children).indexOf(cell);
        }

        let cardIndex = parseInt(card.dataset.hindex, 10);
        if (isNaN(cardIndex)) {
            cardIndex = Array.from(card.parentNode.children).indexOf(card);
        }

        const owner = 'you';

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
        if (!card || card.classList.contains('disabled')) return;
        if (!card.closest('.hand.you')) return;

        e.preventDefault();
        
        activeCard = card;
        initialRect = card.getBoundingClientRect();
        touchOffsetX = e.clientX - initialRect.left;
        touchOffsetY = e.clientY - initialRect.top;

        // Clone Visual
        clone = card.cloneNode(true);
        Object.assign(clone.style, {
            position: 'fixed',
            left: `${initialRect.left}px`,
            top: `${initialRect.top}px`,
            width: `${initialRect.width}px`,
            height: `${initialRect.height}px`,
            zIndex: '9999',
            pointerEvents: 'none', // Essencial para ver o elemento embaixo
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

        // Chama a função corrigida de highlight
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

    // CORREÇÃO AQUI: Lógica inteligente para evitar o "pisca-pisca"
    function highlightDropZone(x, y) {
        const target = getDropTarget(x, y);
        
        // Se o alvo for o mesmo que já está iluminado, NÃO FAZ NADA (economiza processamento e evita flicker)
        if (target === currentHovered) {
            return;
        }

        // Se tínhamos um alvo anterior, removemos o brilho dele
        if (currentHovered) {
            currentHovered.classList.remove('drag-hover');
            currentHovered = null;
        }

        // Se temos um novo alvo válido e vazio, aplicamos o brilho
        if (target && target.classList.contains('empty')) {
            target.classList.add('drag-hover');
            currentHovered = target; // Atualiza a referência
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
        
        // Limpa qualquer highlight restante
        if (currentHovered) {
            currentHovered.classList.remove('drag-hover');
            currentHovered = null;
        }
        
        activeCard = null;
        clone = null;
    }

    function initCards() {
        getHandCards().forEach(card => {
            card.removeEventListener('pointerdown', onPointerDown);
            card.addEventListener('pointerdown', onPointerDown);
            card.style.touchAction = 'none';
        });
    }

    initCards();

    const observer = new MutationObserver((mutations) => {
        let shouldReinit = false;
        mutations.forEach(m => {
            if (m.target.classList.contains('hand') || m.target.classList.contains('you')) {
                shouldReinit = true;
            }
        });
        if (shouldReinit) initCards();
    });

    const handContainer = document.querySelector('.hand.you');
    if (handContainer) {
        observer.observe(handContainer, { childList: true, subtree: true });
    }
});