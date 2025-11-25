// ═══════════════════════════════════════════════════════════════════════════
// WELCOME MODAL - First-time user instructions
// Shows once on first access, can be dismissed with "don't show again"
// ═══════════════════════════════════════════════════════════════════════════

function initWelcomeModal() {
  // Check if user has already seen the welcome modal
  const hasSeenWelcome = localStorage.getItem('hasSeenWelcome');
  const loggedUser = localStorage.getItem('loggedUser');
  
  // Only show for logged-in users who haven't seen it
  if (hasSeenWelcome || !loggedUser) {
    return;
  }
  
  // Create modal HTML
  const modalHTML = `
    <div id="welcome-modal" class="welcome-modal active">
      <div class="welcome-modal-overlay"></div>
      <div class="welcome-modal-content">
        <div class="welcome-header">
          <h2>BENVENUTO IN VILTRUM FITNESS!</h2>
          <button class="welcome-close" aria-label="Close">×</button>
        </div>
        
        <div class="welcome-body">
          <div class="welcome-section">
            <h3>🎯 COME FUNZIONA L'APP</h3>
            <ul>
              <li><strong>Allenamenti:</strong> Scegli il tuo workout dal dashboard e segui le istruzioni vocali</li>
              <li><strong>Timer:</strong> Il timer ti guiderà automaticamente attraverso ogni esercizio</li>
              <li><strong>Audio:</strong> Attiva l'audio per ricevere istruzioni vocali durante l'allenamento</li>
            </ul>
          </div>
          
          <div class="welcome-section warning">
            <h3>⚠️ IMPORTANTE</h3>
            <p>Stai per essere ricontattato dal team Viltrum per verificare i tuoi obiettivi e ottimizzare il tuo percorso di allenamento.</p>
          </div>
        </div>
        
        <div class="welcome-footer">
          <label class="dont-show-again">
            <input type="checkbox" id="dont-show-welcome">
            <span>Non mostrare più questo messaggio</span>
          </label>
          <button class="welcome-start-btn">INIZIA SUBITO!</button>
        </div>
      </div>
    </div>
  `;
  
  // Add modal to page
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  
  // Get modal elements
  const modal = document.getElementById('welcome-modal');
  const closeBtn = modal.querySelector('.welcome-close');
  const startBtn = modal.querySelector('.welcome-start-btn');
  const dontShowCheckbox = document.getElementById('dont-show-welcome');
  const overlay = modal.querySelector('.welcome-modal-overlay');
  
  // Close modal function
  function closeWelcomeModal() {
    modal.classList.remove('active');
    setTimeout(() => {
      modal.remove();
    }, 300);
    
    // Mark as seen if checkbox is checked
    if (dontShowCheckbox.checked) {
      localStorage.setItem('hasSeenWelcome', 'true');
    }
  }
  
  // Event listeners
  closeBtn.addEventListener('click', closeWelcomeModal);
  overlay.addEventListener('click', closeWelcomeModal);
  startBtn.addEventListener('click', () => {
    if (dontShowCheckbox.checked) {
      localStorage.setItem('hasSeenWelcome', 'true');
    }
    closeWelcomeModal();
  });
  
  // Escape key to close
  document.addEventListener('keydown', function escapeHandler(e) {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeWelcomeModal();
      document.removeEventListener('keydown', escapeHandler);
    }
  });
}

// Initialize on dashboard load
if (window.location.pathname.includes('dashboard.html')) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWelcomeModal);
  } else {
    initWelcomeModal();
  }
}