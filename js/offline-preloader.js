/**
 * Viltrum Fitness - Comprehensive Offline Preloader
 * Loads and caches ALL resources at login for complete offline functionality
 * - Workout data
 * - Images (exercise demonstrations)
 * - Audio files (TTS + Beppe recordings)
 * - Nutrition PDFs
 * - Only updates when data changes
 */

const OfflinePreloader = {
  DB_NAME: 'ViltrumOfflineDB',
  DB_VERSION: 1,
  db: null,
  isPreloading: false, // Flag to prevent duplicate preloads

  // Store names
  STORES: {
    METADATA: 'metadata',
    WORKOUT_DATA: 'workoutData',
    IMAGES: 'images',
    AUDIO: 'audio',
    NUTRITION: 'nutrition'
  },

  /**
   * Initialize IndexedDB for persistent offline storage
   */
  async initDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object stores if they don't exist
        if (!db.objectStoreNames.contains(this.STORES.METADATA)) {
          db.createObjectStore(this.STORES.METADATA, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(this.STORES.WORKOUT_DATA)) {
          db.createObjectStore(this.STORES.WORKOUT_DATA, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(this.STORES.IMAGES)) {
          db.createObjectStore(this.STORES.IMAGES, { keyPath: 'url' });
        }
        if (!db.objectStoreNames.contains(this.STORES.AUDIO)) {
          db.createObjectStore(this.STORES.AUDIO, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(this.STORES.NUTRITION)) {
          db.createObjectStore(this.STORES.NUTRITION, { keyPath: 'email' });
        }

        console.log('📦 IndexedDB initialized for offline storage');
      };
    });
  },

  /**
   * Get data from IndexedDB
   */
  async getFromDB(storeName, key) {
    if (!this.db) await this.initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Put data in IndexedDB
   */
  async putInDB(storeName, data) {
    if (!this.db) await this.initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Get all data from a store
   */
  async getAllFromDB(storeName) {
    if (!this.db) await this.initDB();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  /**
   * Check if we need to update cached data
   */
  async needsUpdate(email) {
    const metadata = await this.getFromDB(this.STORES.METADATA, 'lastUpdate');
    const cachedUser = await this.getFromDB(this.STORES.METADATA, 'cachedUser');
    const preloadComplete = await this.getFromDB(this.STORES.METADATA, 'preloadComplete');
    
    // Always update if user changed
    if (!cachedUser || cachedUser.value !== email) {
      console.log('🔄 Different user, full reload needed');
      // Clear completion flag for new user
      await this.putInDB(this.STORES.METADATA, { key: 'preloadComplete', value: false });
      return { needsUpdate: true, reason: 'user_changed' };
    }
    
    // If preload wasn't completed, resume it
    if (!preloadComplete || preloadComplete.value !== true) {
      console.log('🔄 Preload was interrupted, resuming...');
      return { needsUpdate: true, reason: 'incomplete_preload' };
    }

    // Check if data is older than 24 hours
    if (metadata && metadata.value) {
      const hoursSinceUpdate = (Date.now() - metadata.value) / (1000 * 60 * 60);
      if (hoursSinceUpdate < 24) {
        console.log(`✅ Cache is fresh (${hoursSinceUpdate.toFixed(1)} hours old)`);
        return { needsUpdate: false };
      }
      console.log('⏰ Cache older than 24 hours, checking for updates...');
    }

    return { needsUpdate: true, reason: 'stale_cache' };
  },

  /**
   * Preload all workout images
   */
  async preloadImages(imageUrls, onProgress) {
    console.log(`🖼️ Preloading ${imageUrls.length} images...`);
    let loaded = 0;

    for (const url of imageUrls) {
      try {
        // Check if already cached
        const cached = await this.getFromDB(this.STORES.IMAGES, url);
        if (cached && cached.blob) {
          loaded++;
          if (onProgress) onProgress({ type: 'image', loaded, total: imageUrls.length });
          continue;
        }

        // Fetch and cache image
        const response = await fetch(url);
        const blob = await response.blob();
        
        await this.putInDB(this.STORES.IMAGES, {
          url: url,
          blob: blob,
          timestamp: Date.now()
        });

        loaded++;
        if (onProgress) onProgress({ type: 'image', loaded, total: imageUrls.length });
        console.log(`✅ Image ${loaded}/${imageUrls.length}: ${url.substring(0, 50)}...`);

      } catch (error) {
        console.warn(`⚠️ Failed to cache image: ${url}`, error);
        loaded++;
        if (onProgress) onProgress({ type: 'image', loaded, total: imageUrls.length });
      }
    }

    console.log(`✅ All ${loaded} images preloaded`);
  },

  /**
   * Preload TTS audio for all workout instructions
   */
  async preloadTTSAudio(workoutData, onProgress) {
    const GOOGLE_TTS_URL = "https://google-tts-server.onrender.com/speak";
    const audioTexts = new Map(); // Use Map to deduplicate and normalize
    
    // Helper to normalize text for deduplication
    const normalize = (text) => {
      return text
        .trim() // Remove leading/trailing whitespace
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .replace(/[^\S ]/g, '') // Remove non-space whitespace (tabs, newlines, etc.)
    };

    // Collect all unique text that needs TTS
    let duplicatesSkipped = 0;
    Object.values(workoutData).forEach(workout => {
      if (!workout.exercises) return;
      
      workout.exercises.forEach(exercise => {
        // Exercise name
        if (exercise.name) {
          const normalized = normalize(exercise.name);
          if (normalized) {
            if (audioTexts.has(normalized)) {
              duplicatesSkipped++;
            } else {
              audioTexts.set(normalized, normalized);
            }
          }
        }
        
        // Instructions (Istruzioni)
        if (exercise.istruzioni) {
          const normalized = normalize(exercise.istruzioni);
          if (normalized) {
            if (audioTexts.has(normalized)) {
              duplicatesSkipped++;
            } else {
              audioTexts.set(normalized, normalized);
            }
          }
        }

        // Common workout cues
        const duration = exercise.duration || exercise.durata || 0;
        if (duration >= 60) audioTexts.set("Mancano 60 secondi", "Mancano 60 secondi");
        if (duration >= 30) audioTexts.set("Mancano 30 secondi", "Mancano 30 secondi");
        if (duration >= 10) audioTexts.set("Mancano 10 secondi", "Mancano 10 secondi");
        if (duration >= 5) {
          audioTexts.set("5", "5");
          audioTexts.set("4", "4");
          audioTexts.set("3", "3");
          audioTexts.set("2", "2");
          audioTexts.set("1", "1");
        }
      });
    });

    const textsArray = Array.from(audioTexts.values());
    if (duplicatesSkipped > 0) {
      console.log(`⏭️ Skipped ${duplicatesSkipped} duplicate audio texts`);
    }
    console.log(`🔊 Preloading ${textsArray.length} unique TTS audio files...`);
    
    let loaded = 0;
    const batchSize = 10; // Increased from 5 for faster loading

    for (let i = 0; i < textsArray.length; i += batchSize) {
      const batch = textsArray.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (text) => {
        try {
          const lang = this.detectLang(text);
          const cacheKey = `tts_${lang}_${text}`;
          
          // Check if already cached
          const cached = await this.getFromDB(this.STORES.AUDIO, cacheKey);
          if (cached && cached.blob) {
            loaded++;
            if (onProgress) onProgress({ type: 'audio', loaded, total: textsArray.length });
            return;
          }

          // Fetch TTS audio
          const response = await fetch(GOOGLE_TTS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, lang })
          });

          if (!response.ok) throw new Error(`TTS failed: ${response.status}`);

          const blob = await response.blob();
          
          await this.putInDB(this.STORES.AUDIO, {
            key: cacheKey,
            text: text,
            lang: lang,
            blob: blob,
            timestamp: Date.now()
          });

          loaded++;
          if (onProgress) onProgress({ type: 'audio', loaded, total: textsArray.length });
          console.log(`✅ Audio ${loaded}/${textsArray.length}: "${text.substring(0, 30)}..."`);

        } catch (error) {
          console.warn(`⚠️ Failed to cache TTS for "${text}":`, error);
          loaded++;
          if (onProgress) onProgress({ type: 'audio', loaded, total: textsArray.length });
        }
      }));

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < textsArray.length) {
        await new Promise(resolve => setTimeout(resolve, 200)); // Reduced from 500ms
      }
    }

    console.log(`✅ All ${loaded} TTS audio files preloaded`);
  },

  /**
   * Detect language from text (same logic as workout.js)
   */
  detectLang(text) {
    const italianIndicators = /[àèéìòù]|mancano|secondi|esercizio|istruz|riposo|pausa/i;
    return italianIndicators.test(text) ? "it-IT" : "en-US";
  },

  /**
   * Preload Beppe's pre-recorded audio files
   */
  async preloadBeppeAudio(onProgress) {
    const beppeUrls = {
      "Pronti": "https://github.com/tommyv-spec/workout-audio/raw/refs/heads/main/docs/Pronti.MP3",
      "Start": "https://github.com/tommyv-spec/workout-audio/raw/refs/heads/main/docs/Start.MP3",
      "Stop": "https://github.com/tommyv-spec/workout-audio/raw/refs/heads/main/docs/Stop.MP3",
      "60sec": "https://github.com/tommyv-spec/workout-audio/raw/refs/heads/main/docs/Mancano%2060%20secondi.MP3",
      "30sec": "https://github.com/tommyv-spec/workout-audio/raw/refs/heads/main/docs/Mancano%2030%20secondi.MP3",
      "10sec": "https://github.com/tommyv-spec/workout-audio/raw/refs/heads/main/docs/Mancano%2010%20secondi.MP3",
      "5-4-3-2-1": "https://github.com/tommyv-spec/workout-audio/raw/refs/heads/main/docs/5-4-3-2-1.MP3",
      "Pausa": "https://github.com/tommyv-spec/workout-audio/raw/refs/heads/main/docs/Pausa.MP3",
      "Riposo": "https://github.com/tommyv-spec/workout-audio/raw/refs/heads/main/docs/Riposo.MP3",
      "Cambio": "https://github.com/tommyv-spec/workout-audio/raw/refs/heads/main/docs/Cambio.MP3",
      "Prossimo": "https://github.com/tommyv-spec/workout-audio/raw/refs/heads/main/docs/Prossimo%20esercizio.MP3"
    };

    const urls = Object.entries(beppeUrls);
    console.log(`🎤 Preloading ${urls.length} Beppe audio files...`);
    
    let loaded = 0;

    for (const [name, url] of urls) {
      try {
        const cacheKey = `beppe_${name}`;
        
        // Check if already cached
        const cached = await this.getFromDB(this.STORES.AUDIO, cacheKey);
        if (cached && cached.blob) {
          loaded++;
          if (onProgress) onProgress({ type: 'beppe', loaded, total: urls.length });
          continue;
        }

        // Fetch and cache audio
        const response = await fetch(url);
        const blob = await response.blob();
        
        await this.putInDB(this.STORES.AUDIO, {
          key: cacheKey,
          name: name,
          url: url,
          blob: blob,
          timestamp: Date.now()
        });

        loaded++;
        if (onProgress) onProgress({ type: 'beppe', loaded, total: urls.length });
        console.log(`✅ Beppe audio ${loaded}/${urls.length}: ${name}`);

      } catch (error) {
        console.warn(`⚠️ Failed to cache Beppe audio "${name}":`, error);
        loaded++;
        if (onProgress) onProgress({ type: 'beppe', loaded, total: urls.length });
      }
    }

    console.log(`✅ All ${loaded} Beppe audio files preloaded`);
  },

  /**
   * Preload nutrition PDF
   */
  async preloadNutrition(nutritionPdfUrl, email, onProgress) {
    if (!nutritionPdfUrl) {
      console.log('ℹ️ No nutrition plan to preload');
      return;
    }

    try {
      console.log('🥗 Preloading nutrition PDF...');
      
      const response = await fetch(nutritionPdfUrl);
      const blob = await response.blob();
      
      await this.putInDB(this.STORES.NUTRITION, {
        email: email,
        url: nutritionPdfUrl,
        blob: blob,
        timestamp: Date.now()
      });

      if (onProgress) onProgress({ type: 'nutrition', loaded: 1, total: 1 });
      console.log('✅ Nutrition PDF preloaded');

    } catch (error) {
      console.warn('⚠️ Failed to cache nutrition PDF:', error);
      if (onProgress) onProgress({ type: 'nutrition', loaded: 1, total: 1 });
    }
  },

  /**
   * Main preload function - loads everything at login
   */
  async preloadAll(userInfo, options = {}) {
    // Prevent duplicate preloads
    if (this.isPreloading) {
      console.log('⏭️ Preload already in progress, skipping...');
      return { success: true, cached: true, skipped: true };
    }

    const {
      onProgress = null,
      skipImages = false,
      skipAudio = false,
      skipBeppeAudio = false,
      skipNutrition = false
    } = options;

    try {
      this.isPreloading = true;
      console.log('🚀 Starting comprehensive offline preload...');
      
      // Initialize database
      await this.initDB();

      // Check if update is needed
      const updateCheck = await this.needsUpdate(userInfo.email);
      if (!updateCheck.needsUpdate && !options.forceUpdate) {
        console.log('✅ All data already cached and up to date');
        return { success: true, cached: true };
      }

      const startTime = Date.now();
      
      // Mark preload as in-progress (will be set to true when complete)
      await this.putInDB(this.STORES.METADATA, {
        key: 'preloadComplete',
        value: false
      });

      // 1. Cache workout data
      console.log('📊 Caching workout data...');
      await this.putInDB(this.STORES.WORKOUT_DATA, {
        id: 'current_user',
        email: userInfo.email,
        data: userInfo,
        timestamp: Date.now()
      });

      // 2. Collect all image URLs
      const imageUrls = new Set();
      
      // Add common app images (logo - using lh3.googleusercontent.com format to avoid CORS)
      // Convert drive.google.com/thumbnail?id=XXX to lh3.googleusercontent.com/d/XXX
      imageUrls.add('https://lh3.googleusercontent.com/d/1va6OkGp9yAHDJBfeDM3npwqlJJoLUh5C'); // Logo
      
      // Add special workout screen images (warmup, rest, completion)
      imageUrls.add('https://lh3.googleusercontent.com/d/1Ee4DY-EGnTI9YPrIB0wj6v8pX7KW8Hpt'); // Riscaldamento (Warmup)
      imageUrls.add('https://lh3.googleusercontent.com/d/1FS2HKfaJ6MIfpyzJirU6dWQ7K-5kbC9j'); // Are you ready?
      imageUrls.add('https://lh3.googleusercontent.com/d/1bibXbdrcXdh3vgNHp2Teby3ClS3VqZmb'); // REST
      imageUrls.add('https://lh3.googleusercontent.com/d/1Vs1-VgiJi8rTbssSj-2ThcyDraRoTE2g'); // Good Job
      
      // Add exercise images from workouts
      userInfo.workouts.forEach(workoutName => {
        const workout = userInfo.allWorkoutsData[workoutName];
        if (workout && workout.exercises) {
          workout.exercises.forEach(exercise => {
            if (exercise.imageUrl) imageUrls.add(exercise.imageUrl);
          });
        }
      });

      // 3. Preload images
      if (!skipImages && imageUrls.size > 0) {
        await this.preloadImages(Array.from(imageUrls), onProgress);
      }

      // 4. Preload TTS audio
      if (!skipAudio) {
        await this.preloadTTSAudio(userInfo.allWorkoutsData, onProgress);
        
        // 5. Preload Beppe audio (only if not skipped)
        if (!skipBeppeAudio) {
          await this.preloadBeppeAudio(onProgress);
        } else {
          console.log('⏭️ Skipping Beppe audio (not in use)');
        }
      }

      // 6. Preload nutrition PDF
      if (!skipNutrition && userInfo.nutritionPdfUrl) {
        await this.preloadNutrition(userInfo.nutritionPdfUrl, userInfo.email, onProgress);
      }

      // 7. Update metadata
      await this.putInDB(this.STORES.METADATA, {
        key: 'lastUpdate',
        value: Date.now()
      });
      await this.putInDB(this.STORES.METADATA, {
        key: 'cachedUser',
        value: userInfo.email
      });
      // Mark preload as complete
      await this.putInDB(this.STORES.METADATA, {
        key: 'preloadComplete',
        value: true
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✅ Offline preload complete in ${duration}s`);
      console.log(`📦 Cached: ${imageUrls.size} images, workout data, audio files, nutrition`);

      return { 
        success: true, 
        cached: false,
        stats: {
          images: imageUrls.size,
          duration: duration
        }
      };

    } catch (error) {
      console.error('❌ Offline preload failed:', error);
      return { success: false, error: error.message };
    } finally {
      this.isPreloading = false; // Reset flag when done
    }
  },

  /**
   * Get cached image blob URL
   */
  async getCachedImage(url) {
    try {
      const cached = await this.getFromDB(this.STORES.IMAGES, url);
      if (cached && cached.blob) {
        return URL.createObjectURL(cached.blob);
      }
    } catch (error) {
      console.warn('Failed to get cached image:', error);
    }
    return null;
  },

  /**
   * Get cached audio blob URL
   */
  async getCachedAudio(key) {
    try {
      const cached = await this.getFromDB(this.STORES.AUDIO, key);
      if (cached && cached.blob) {
        return URL.createObjectURL(cached.blob);
      }
    } catch (error) {
      console.warn('Failed to get cached audio:', error);
    }
    return null;
  },

  /**
   * Get cached nutrition PDF blob URL
   */
  async getCachedNutrition(email) {
    try {
      const cached = await this.getFromDB(this.STORES.NUTRITION, email);
      if (cached && cached.blob) {
        return URL.createObjectURL(cached.blob);
      }
    } catch (error) {
      console.warn('Failed to get cached nutrition:', error);
    }
    return null;
  },

  /**
   * Clear all cached data (useful for logout or troubleshooting)
   */
  async clearCache() {
    try {
      if (!this.db) await this.initDB();
      
      const stores = Object.values(this.STORES);
      for (const storeName of stores) {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        await store.clear();
      }
      
      console.log('🗑️ All offline cache cleared');
      return { success: true };
    } catch (error) {
      console.error('Failed to clear cache:', error);
      return { success: false, error: error.message };
    }
  }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OfflinePreloader;
}
