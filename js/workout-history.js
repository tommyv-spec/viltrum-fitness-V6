// ═══════════════════════════════════════════════════════════════════════════
// VILTRUM FITNESS - WORKOUT HISTORY & FAVORITES
// Track workout completion, favorites, and personal records
// With cloud sync via Google Sheets
// ═══════════════════════════════════════════════════════════════════════════

// Import Google Script URL for cloud sync
import { GOOGLE_SCRIPT_URL } from './config.js';

// Storage keys
const STORAGE_KEYS = {
  HISTORY: 'viltrum_workout_history',
  FAVORITES: 'viltrum_favorites',
  WEIGHTS: 'viltrum_exercise_weights',
  FIRST_TIME: 'viltrum_first_time_user',
  WEIGHTS_SYNCED: 'viltrum_weights_last_sync'
};

// ═══════════════════════════════════════════════════════════════════════════
// CLOUD SYNC FOR WEIGHTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get current user email from localStorage
 * @returns {string|null} User email or null if not logged in
 */
function getCurrentUserEmail() {
  return localStorage.getItem('loggedUser');
}

/**
 * Sync weights to cloud (Google Sheets)
 * @param {Object} weights - Object with exercise names as keys and weights as values
 */
async function syncWeightsToCloud(weights) {
  const userEmail = getCurrentUserEmail();
  if (!userEmail) {
    console.log('⚠️ Not logged in, weights saved locally only');
    return false;
  }

  try {
    const weightsJson = JSON.stringify(weights);
    console.log('📤 Weights to sync:', Object.keys(weights).length, 'exercises');
    console.log('📤 JSON length:', weightsJson.length, 'chars');
    
    const url = new URL(GOOGLE_SCRIPT_URL);
    url.searchParams.append('action', 'saveWeights');
    url.searchParams.append('email', userEmail);
    url.searchParams.append('weights', weightsJson);

    const fullUrl = url.toString();
    console.log('📤 Full URL length:', fullUrl.length, 'chars');
    
    // Warn if URL is too long (GET limit is ~2000 chars)
    if (fullUrl.length > 2000) {
      console.warn('⚠️ URL may be too long for GET request');
    }
    
    const response = await fetch(fullUrl, { 
      method: 'GET',
      redirect: 'follow'
    });
    
    console.log('📥 Response status:', response.status, response.statusText);
    
    // Check if response is OK
    if (!response.ok) {
      console.warn('⚠️ Cloud sync HTTP error:', response.status);
      return false;
    }
    
    // Try to parse JSON response
    const text = await response.text();
    console.log('📥 Cloud response:', text.substring(0, 300));
    
    try {
      const result = JSON.parse(text);
      if (result.status === 'success') {
        console.log('✅ Weights synced to cloud');
        localStorage.setItem(STORAGE_KEYS.WEIGHTS_SYNCED, new Date().toISOString());
        return true;
      } else {
        console.warn('⚠️ Cloud sync failed:', result.message || 'Unknown error');
        return false;
      }
    } catch (parseError) {
      // If response isn't JSON, might still have worked (Google sometimes returns HTML on success)
      if (text.includes('success') || response.ok) {
        console.log('✅ Weights likely synced (non-JSON response)');
        localStorage.setItem(STORAGE_KEYS.WEIGHTS_SYNCED, new Date().toISOString());
        return true;
      }
      console.warn('⚠️ Could not parse response:', parseError);
      return false;
    }
  } catch (error) {
    console.error('❌ Failed to sync weights to cloud:', error);
    return false;
  }
}

/**
 * Load weights from cloud (Google Sheets)
 * @returns {Promise<Object|null>} Weights object or null if failed
 */
async function loadWeightsFromCloud() {
  const userEmail = getCurrentUserEmail();
  if (!userEmail) {
    console.log('⚠️ Not logged in, using local weights only');
    return null;
  }

  try {
    const url = new URL(GOOGLE_SCRIPT_URL);
    url.searchParams.append('action', 'getWeights');
    url.searchParams.append('email', userEmail);

    const response = await fetch(url.toString(), { method: 'GET' });
    const result = await response.json();

    if (result.status === 'success' && result.weights) {
      console.log('✅ Weights loaded from cloud');
      // Merge cloud weights with local (cloud takes priority)
      const localWeights = getExerciseWeightsLocal();
      const mergedWeights = { ...localWeights, ...result.weights };
      localStorage.setItem(STORAGE_KEYS.WEIGHTS, JSON.stringify(mergedWeights));
      return mergedWeights;
    } else {
      console.log('ℹ️ No cloud weights found or error:', result.message);
      return null;
    }
  } catch (error) {
    console.error('❌ Failed to load weights from cloud:', error);
    return null;
  }
}

/**
 * Initialize weights sync - call this on app startup
 * Loads from cloud if logged in, merges with local
 */
export async function initializeWeightsSync() {
  const userEmail = getCurrentUserEmail();
  if (!userEmail) {
    console.log('ℹ️ User not logged in, weights will be local only');
    return;
  }

  console.log('🔄 Initializing weights sync...');
  await loadWeightsFromCloud();
}

// ═══════════════════════════════════════════════════════════════════════════
// WORKOUT HISTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get workout history
 * @returns {Array} Array of workout history entries
 */
export function getWorkoutHistory() {
  try {
    const history = localStorage.getItem(STORAGE_KEYS.HISTORY);
    return history ? JSON.parse(history) : [];
  } catch (error) {
    console.error('Error loading workout history:', error);
    return [];
  }
}

/**
 * Add workout to history
 * @param {string} workoutName - Name of completed workout
 * @param {number} duration - Duration in seconds
 * @param {Object} exerciseWeights - Object with exercise names as keys and weights as values
 */
export function addWorkoutToHistory(workoutName, duration, exerciseWeights = {}) {
  try {
    const history = getWorkoutHistory();
    const entry = {
      id: Date.now(),
      workoutName,
      duration,
      completedAt: new Date().toISOString(),
      exerciseWeights
    };
    
    history.unshift(entry); // Add to beginning
    
    // Keep last 100 workouts
    if (history.length > 100) {
      history.splice(100);
    }
    
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
    
    // Update exercise weights (local + cloud)
    if (Object.keys(exerciseWeights).length > 0) {
      updateExerciseWeights(exerciseWeights);
    }
    
    return entry;
  } catch (error) {
    console.error('Error saving workout to history:', error);
    return null;
  }
}

/**
 * Get workout statistics
 * @returns {Object} Statistics about workouts
 */
export function getWorkoutStats() {
  const history = getWorkoutHistory();
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const thisWeek = new Date(today);
  thisWeek.setDate(thisWeek.getDate() - 7);
  
  const thisMonth = new Date(today);
  thisMonth.setMonth(thisMonth.getMonth() - 1);
  
  const stats = {
    total: history.length,
    today: 0,
    thisWeek: 0,
    thisMonth: 0,
    lastWorkout: history[0] || null,
    totalDuration: 0,
    favoriteWorkouts: {}
  };
  
  history.forEach(entry => {
    const date = new Date(entry.completedAt);
    date.setHours(0, 0, 0, 0);
    
    if (date.getTime() === today.getTime()) stats.today++;
    if (date >= thisWeek) stats.thisWeek++;
    if (date >= thisMonth) stats.thisMonth++;
    
    stats.totalDuration += entry.duration || 0;
    
    // Count workout frequency
    if (!stats.favoriteWorkouts[entry.workoutName]) {
      stats.favoriteWorkouts[entry.workoutName] = 0;
    }
    stats.favoriteWorkouts[entry.workoutName]++;
  });
  
  return stats;
}

/**
 * Clear workout history
 */
export function clearWorkoutHistory() {
  localStorage.removeItem(STORAGE_KEYS.HISTORY);
}

// ═══════════════════════════════════════════════════════════════════════════
// FAVORITES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get favorite workouts
 * @returns {Array} Array of favorite workout names
 */
export function getFavorites() {
  try {
    const favorites = localStorage.getItem(STORAGE_KEYS.FAVORITES);
    return favorites ? JSON.parse(favorites) : [];
  } catch (error) {
    console.error('Error loading favorites:', error);
    return [];
  }
}

/**
 * Check if workout is favorite
 * @param {string} workoutName - Name of workout
 * @returns {boolean} True if favorite
 */
export function isFavorite(workoutName) {
  const favorites = getFavorites();
  return favorites.includes(workoutName);
}

/**
 * Toggle favorite status
 * @param {string} workoutName - Name of workout
 * @returns {boolean} New favorite status
 */
export function toggleFavorite(workoutName) {
  try {
    const favorites = getFavorites();
    const index = favorites.indexOf(workoutName);
    
    if (index === -1) {
      // Add to favorites
      favorites.push(workoutName);
    } else {
      // Remove from favorites
      favorites.splice(index, 1);
    }
    
    localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(favorites));
    return index === -1; // Return true if added
  } catch (error) {
    console.error('Error toggling favorite:', error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXERCISE WEIGHTS (with cloud sync)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all exercise weights (local only, for internal use)
 * @returns {Object} Object with exercise names as keys and weights as values
 */
function getExerciseWeightsLocal() {
  try {
    const weights = localStorage.getItem(STORAGE_KEYS.WEIGHTS);
    return weights ? JSON.parse(weights) : {};
  } catch (error) {
    console.error('Error loading exercise weights:', error);
    return {};
  }
}

/**
 * Get all exercise weights
 * @returns {Object} Object with exercise names as keys and weights as values
 */
export function getExerciseWeights() {
  return getExerciseWeightsLocal();
}

/**
 * Get weight for specific exercise
 * @param {string} exerciseName - Name of exercise
 * @returns {string|null} Weight or null if not found
 */
export function getExerciseWeight(exerciseName) {
  const weights = getExerciseWeights();
  return weights[exerciseName] || null;
}

/**
 * Update exercise weights (local + cloud sync)
 * @param {Object} newWeights - Object with exercise names as keys and weights as values
 * @returns {Promise<boolean>} True if cloud sync succeeded
 */
export async function updateExerciseWeights(newWeights) {
  try {
    const weights = getExerciseWeights();
    Object.assign(weights, newWeights);
    localStorage.setItem(STORAGE_KEYS.WEIGHTS, JSON.stringify(weights));
    
    // Sync to cloud and return result
    return await syncWeightsToCloud(weights);
  } catch (error) {
    console.error('Error updating exercise weights:', error);
    return false;
  }
}

/**
 * Clear all exercise weights
 */
export function clearExerciseWeights() {
  localStorage.removeItem(STORAGE_KEYS.WEIGHTS);
}

// ═══════════════════════════════════════════════════════════════════════════
// FIRST TIME USER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if user is first time
 * @returns {boolean} True if first time
 */
export function isFirstTimeUser() {
  return !localStorage.getItem(STORAGE_KEYS.FIRST_TIME);
}

/**
 * Mark user as not first time
 */
export function markUserAsNotFirstTime() {
  localStorage.setItem(STORAGE_KEYS.FIRST_TIME, 'true');
}

/**
 * Reset first time status (for testing)
 */
export function resetFirstTimeStatus() {
  localStorage.removeItem(STORAGE_KEYS.FIRST_TIME);
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Share workout completion
 * @param {string} workoutName - Name of completed workout
 * @param {number} duration - Duration in seconds
 */
export function shareWorkoutCompletion(workoutName, duration) {
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  
  const text = `💪 Ho completato "${workoutName}" su Viltrum Fitness in ${timeStr}! #ViltrumFitness #Workout`;
  const url = window.location.origin;
  
  // Check if Web Share API is available (mobile)
  if (navigator.share) {
    navigator.share({
      title: 'Viltrum Fitness',
      text: text,
      url: url
    }).catch(() => {
      // Fallback to copy to clipboard
      copyToClipboard(text + '\n' + url);
    });
  } else {
    // Fallback to copy to clipboard
    copyToClipboard(text + '\n' + url);
  }
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 */
function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      alert('✅ Condivisione copiata negli appunti!');
    }).catch(() => {
      alert('❌ Impossibile copiare negli appunti');
    });
  } else {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      alert('✅ Condivisione copiata negli appunti!');
    } catch (err) {
      alert('❌ Impossibile copiare negli appunti');
    }
    document.body.removeChild(textarea);
  }
}
