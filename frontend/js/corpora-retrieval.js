// =====================================
// CORPUS RETRIEVAL & VECTOR LOADING
// =====================================

import config from './config.js';
import { 
  debugLog, 
  createError, 
  safeAsync, 
  startTimer, 
  isValidVectorData,
  fromApiLanguageCode 
} from './utils.js';

// =====================================
// CACHE MANAGEMENT
// =====================================

/**
 * Generate cache key for vector data
 * @param {string} vectorType - Type of vectors ('document', 'section', 'paragraph')
 * @param {string} language - Language code
 * @returns {string} Cache key
 */
function getCacheKey(vectorType, language = 'all') {
  return `pragmatic_vectors_${vectorType}_${language}_${config.MODELS.EMBEDDING.name}`;
}

/**
 * Check if cached data is still valid
 * @param {number} timestamp - Cache timestamp
 * @returns {boolean} True if cache is still valid
 */
function isCacheValid(timestamp) {
  const now = Date.now();
  const age = now - timestamp;
  return age < config.DEV.CACHE_MAX_AGE;
}

/**
 * Get vectors from browser cache (vectors only, not full text)
 * @param {string} vectorType - Type of vectors to retrieve
 * @param {string} language - Language filter (optional)
 * @returns {Object|null} Cached vector data or null if not found/expired
 */
function getCachedVectors(vectorType, language = 'all') {
  if (!config.DEV.CACHE_VECTORS_ONLY) {
    return null;
  }

  try {
    const cacheKey = getCacheKey(vectorType, language);
    const cached = localStorage.getItem(cacheKey);
    
    if (!cached) {
      debugLog(`No cache found for ${vectorType} vectors`, 'info');
      return null;
    }

    const parsedCache = JSON.parse(cached);
    
    if (!isCacheValid(parsedCache.timestamp)) {
      debugLog(`Cache expired for ${vectorType} vectors`, 'info');
      localStorage.removeItem(cacheKey);
      return null;
    }

    debugLog(`Cache hit for ${vectorType} vectors`, 'info');
    return parsedCache.data;
    
  } catch (error) {
    debugLog(`Cache read error for ${vectorType}: ${error.message}`, 'warn');
    return null;
  }
}

/**
 * Store vectors in browser cache (vectors only)
 * @param {string} vectorType - Type of vectors
 * @param {Object} vectorData - Vector data to cache
 * @param {string} language - Language filter
 */
function setCachedVectors(vectorType, vectorData, language = 'all') {
  if (!config.DEV.CACHE_VECTORS_ONLY) {
    return;
  }

  try {
    const cacheKey = getCacheKey(vectorType, language);
    
    // Create lightweight cache data (vectors + minimal metadata, no full text)
    const cacheData = {
      metadata: vectorData.metadata,
      vectors: vectorData.vectors.map(item => ({
        id: item.id,
        document_id: item.document_id,
        title: item.title,
        level: item.level,
        count: item.count,
        created: item.created,
        vector: item.vector,
        // Exclude 'text' field to save cache space
        textLength: item.text ? item.text.length : 0 // Store length for reference
      }))
    };

    const cacheItem = {
      data: cacheData,
      timestamp: Date.now()
    };

    // Check estimated size before storing
    const estimatedSize = JSON.stringify(cacheItem).length;
    const sizeInMB = (estimatedSize / (1024 * 1024)).toFixed(2);
    
    // Skip caching for very large datasets (over 5MB)
    if (estimatedSize > 5 * 1024 * 1024) {
      debugLog(`Skipping cache for ${vectorType} - too large (${sizeInMB}MB)`, 'info');
      return;
    }

    localStorage.setItem(cacheKey, JSON.stringify(cacheItem));
    debugLog(`Cached ${vectorType} vectors (${cacheData.vectors.length} items, ${sizeInMB}MB)`, 'info');
    
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      debugLog(`Cache quota exceeded for ${vectorType} - clearing old cache and skipping`, 'warn');
      // Try to clear old cache entries to free up space
      clearOldCacheEntries();
    } else {
      debugLog(`Cache write error for ${vectorType}: ${error.message}`, 'warn');
    }
  }
}

/**
 * Clear old cache entries to free up space
 */
function clearOldCacheEntries() {
  try {
    const keys = Object.keys(localStorage).filter(key => 
      key.startsWith('pragmatic_vectors_')
    );
    
    // Remove oldest entries first
    const entries = keys.map(key => {
      try {
        const item = JSON.parse(localStorage.getItem(key));
        return { key, timestamp: item.timestamp || 0 };
      } catch {
        return { key, timestamp: 0 };
      }
    }).sort((a, b) => a.timestamp - b.timestamp);
    
    // Remove oldest half of entries
    const toRemove = entries.slice(0, Math.floor(entries.length / 2));
    toRemove.forEach(entry => localStorage.removeItem(entry.key));
    
    debugLog(`Cleared ${toRemove.length} old cache entries`, 'info');
    
  } catch (error) {
    debugLog(`Error clearing old cache: ${error.message}`, 'warn');
  }
}

// =====================================
// VECTOR FILE LOADING
// =====================================

/**
 * Load a single vector file from the server
 * @param {string} filePath - Path to vector file
 * @returns {Promise<Object>} Vector data object
 */
const loadVectorFile = safeAsync(async (filePath) => {
  const endTimer = startTimer(`Loading vector file: ${filePath}`);
  
  const response = await fetch(filePath);
  
  if (!response.ok) {
    throw new Error(`Failed to load ${filePath}: ${response.status} ${response.statusText}`);
  }

  const vectorData = await response.json();
  
  // Validate the loaded data structure
  if (!isValidVectorData(vectorData)) {
    throw new Error(`Invalid vector data structure in ${filePath}`);
  }

  endTimer();
  debugLog(`Loaded ${vectorData.vectors.length} vectors from ${filePath}`, 'info');
  
  return vectorData;
  
}, 'VECTOR_LOAD');

/**
 * Load all vector types for the current corpus domain
 * @param {boolean} useCache - Whether to use cached data if available
 * @returns {Promise<Object>} Object containing all vector types
 */
export const loadAllVectors = safeAsync(async (useCache = true) => {
  const endTimer = startTimer('Loading all corpus vectors');
  
  const vectorTypes = ['document', 'section', 'paragraph'];
  const vectors = {};

  for (const type of vectorTypes) {
    // Try cache first if enabled
    if (useCache) {
      const cached = getCachedVectors(type);
      if (cached) {
        vectors[type] = cached;
        continue;
      }
    }

    // Load from server if not cached
    const filePath = config.CORPUS.VECTOR_PATHS[type];
    const vectorData = await loadVectorFile(filePath);
    
    // Cache for future use
    setCachedVectors(type, vectorData);
    
    vectors[type] = vectorData;
  }

  endTimer();
  
  // Log summary
  const totalVectors = Object.values(vectors).reduce(
    (sum, data) => sum + data.vectors.length, 0
  );
  debugLog(`Loaded ${totalVectors} total vectors across all types`, 'info');
  
  return vectors;
  
}, 'VECTOR_LOAD');

/**
 * Load vectors for a specific type only
 * @param {string} vectorType - Type of vectors ('document', 'section', 'paragraph')
 * @param {boolean} useCache - Whether to use cached data
 * @returns {Promise<Object>} Vector data for the specified type
 */
export const loadVectorsByType = safeAsync(async (vectorType, useCache = true) => {
  if (!['document', 'section', 'paragraph'].includes(vectorType)) {
    throw new Error(`Invalid vector type: ${vectorType}`);
  }

  // Try cache first
  if (useCache) {
    const cached = getCachedVectors(vectorType);
    if (cached) {
      return cached;
    }
  }

  // Load from server
  const filePath = config.CORPUS.VECTOR_PATHS[vectorType];
  const vectorData = await loadVectorFile(filePath);
  
  // Cache for future use
  setCachedVectors(vectorType, vectorData);
  
  return vectorData;
  
}, 'VECTOR_LOAD');

// =====================================
// VECTOR FILTERING & RETRIEVAL
// =====================================

/**
 * Filter vectors by language (based on document_id pattern)
 * @param {Object} vectorData - Vector data object
 * @param {string} language - Language code (3-letter ISO)
 * @returns {Object} Filtered vector data
 */
export function filterVectorsByLanguage(vectorData, language) {
  if (!vectorData || !vectorData.vectors) {
    return vectorData;
  }

  const filteredVectors = vectorData.vectors.filter(item => {
    // Check if document_id or id contains language code
    const id = item.document_id || item.id;
    return id && id.includes(`-${language}_`);
  });

  return {
    ...vectorData,
    vectors: filteredVectors
  };
}

/**
 * Get vectors for a specific language across all types
 * @param {string} language - Language code (2 or 3 letter)
 * @param {boolean} useCache - Whether to use cached data
 * @returns {Promise<Object>} Object containing filtered vectors by type
 */
export const getVectorsByLanguage = safeAsync(async (language, useCache = true) => {
  // Convert to 3-letter code if needed
  const langCode = language.length === 2 ? fromApiLanguageCode(language) : language;
  
  debugLog(`Loading vectors for language: ${langCode}`, 'info');
  
  const allVectors = await loadAllVectors(useCache);
  const filteredVectors = {};

  for (const [type, vectorData] of Object.entries(allVectors)) {
    filteredVectors[type] = filterVectorsByLanguage(vectorData, langCode);
  }

  // Log filtering results
  Object.entries(filteredVectors).forEach(([type, data]) => {
    debugLog(`${type}: ${data.vectors.length} vectors for ${langCode}`, 'info');
  });

  return filteredVectors;
  
}, 'VECTOR_LOAD');

// =====================================
// TEXT RETRIEVAL (ON-DEMAND)
// =====================================

/**
 * Get full text for specific vector items (when not cached)
 * @param {Array} vectorIds - Array of vector IDs to get text for
 * @param {string} vectorType - Type of vectors
 * @returns {Promise<Object>} Map of vector ID to text content
 */
export const getTextForVectors = safeAsync(async (vectorIds, vectorType) => {
  debugLog(`Fetching text for ${vectorIds.length} ${vectorType} vectors`, 'info');
  
  // Load fresh data from server (not cache) to get full text
  const filePath = config.CORPUS.VECTOR_PATHS[vectorType];
  const fullVectorData = await loadVectorFile(filePath);
  
  const textMap = {};
  
  fullVectorData.vectors.forEach(item => {
    if (vectorIds.includes(item.id)) {
      textMap[item.id] = item.text;
    }
  });

  debugLog(`Retrieved text for ${Object.keys(textMap).length} vectors`, 'info');
  return textMap;
  
}, 'VECTOR_LOAD');

// =====================================
// CACHE MANAGEMENT UTILITIES
// =====================================

/**
 * Clear all cached vector data
 */
export function clearVectorCache() {
  const keys = Object.keys(localStorage).filter(key => 
    key.startsWith('pragmatic_vectors_')
  );
  
  keys.forEach(key => localStorage.removeItem(key));
  debugLog(`Cleared ${keys.length} vector cache entries`, 'info');
}

/**
 * Get cache status information
 * @returns {Object} Cache status details
 */
export function getCacheStatus() {
  const vectorTypes = ['document', 'section', 'paragraph'];
  const status = {};

  vectorTypes.forEach(type => {
    const cacheKey = getCacheKey(type);
    const cached = localStorage.getItem(cacheKey);
    
    if (cached) {
      try {
        const parsedCache = JSON.parse(cached);
        status[type] = {
          cached: true,
          timestamp: parsedCache.timestamp,
          valid: isCacheValid(parsedCache.timestamp),
          vectorCount: parsedCache.data.vectors.length
        };
      } catch (error) {
        status[type] = { cached: false, error: 'Parse error' };
      }
    } else {
      status[type] = { cached: false };
    }
  });

  return status;
}

// =====================================
// DOCUMENT DATABASE LOADING
// =====================================

/**
 * Load document databases for title lookup (matches your existing pattern)
 * @returns {Promise<Object>} Document database with english/spanish structure
 */
export const loadDocumentDatabases = safeAsync(async () => {
  debugLog('Loading document databases...', 'info');
  
  const documentDatabase = {
    english: {},
    spanish: {}
  };
  
  try {
    const databaseUrls = [
      config.CORPUS.DATABASE_PATHS.en,
      config.CORPUS.DATABASE_PATHS.es
    ];
    
    debugLog('Fetching database files:', databaseUrls);
    
    const [engDatabaseRes, espDatabaseRes] = await Promise.all([
      fetch(databaseUrls[0]).catch(err => {
        debugLog('English database not found, continuing without it', 'warn');
        return null;
      }),
      fetch(databaseUrls[1]).catch(err => {
        debugLog('Spanish database not found, continuing without it', 'warn');
        return null;
      })
    ]);

    // Load English database
    if (engDatabaseRes && engDatabaseRes.ok) {
      const engData = await engDatabaseRes.json();
      if (engData.documents) {
        for (const [docId, docData] of Object.entries(engData.documents)) {
          documentDatabase.english[docId] = {
            title: docData.document_metadata?.title || 'Unknown Title',
            authors: docData.document_metadata?.authors || [],
            year: docData.document_metadata?.publication_year || 'Unknown Year'
          };
        }
        debugLog(`English database loaded: ${Object.keys(documentDatabase.english).length} documents`, 'info');
      }
    }

    // Load Spanish database
    if (espDatabaseRes && espDatabaseRes.ok) {
      const espData = await espDatabaseRes.json();
      if (espData.documents) {
        for (const [docId, docData] of Object.entries(espData.documents)) {
          documentDatabase.spanish[docId] = {
            title: docData.document_metadata?.title || 'Título Desconocido',
            authors: docData.document_metadata?.authors || [],
            year: docData.document_metadata?.publication_year || 'Año Desconocido'
          };
        }
        debugLog(`Spanish database loaded: ${Object.keys(documentDatabase.spanish).length} documents`, 'info');
      }
    }

    debugLog('Document databases loaded successfully', 'info');
    return documentDatabase;
    
  } catch (error) {
    debugLog(`Error loading document databases: ${error.message}`, 'error');
    debugLog('Continuing without document title lookup', 'warn');
    return documentDatabase; // Return empty structure
  }
}, 'VECTOR_LOAD');

/**
 * Get document title from database (matches your existing function)
 * @param {string} documentId - Document ID to look up
 * @param {Object} documentDatabase - Database loaded from loadDocumentDatabases()
 * @returns {Object} Document info with title, authors, year
 */
export function getDocumentTitle(documentId, documentDatabase) {
  // Try English database first
  if (documentDatabase.english[documentId]) {
    return documentDatabase.english[documentId];
  }
  
  // Then try Spanish database
  if (documentDatabase.spanish[documentId]) {
    return documentDatabase.spanish[documentId];
  }
  
  // Fallback to document ID
  return {
    title: documentId,
    authors: [],
    year: 'Unknown'
  };
}

// =====================================
// LEGACY STRUCTURE COMPATIBILITY
// =====================================

/**
 * Load vectors in your existing format (matches old vectorData structure)
 * @param {boolean} useCache - Whether to use cached data
 * @returns {Promise<Object>} vectorData with .documents, .paragraphs, .sections arrays
 */
export const loadVectorDataLegacyFormat = safeAsync(async (useCache = true) => {
  debugLog('Loading vector data in legacy format...', 'info');
  
  const allVectors = await loadAllVectors(useCache);
  
  // Convert to your existing structure
  const vectorData = {
    documents: allVectors.document?.vectors || [],
    paragraphs: allVectors.paragraph?.vectors || [],
    sections: allVectors.section?.vectors || []
  };
  
  const totalVectors = vectorData.documents.length + vectorData.paragraphs.length + vectorData.sections.length;
  
  debugLog(`Vector data loaded successfully: ${vectorData.documents.length} documents, ${vectorData.sections.length} sections, ${vectorData.paragraphs.length} paragraphs (Total: ${totalVectors} vectors)`, 'info');
  
  return vectorData;
}, 'VECTOR_LOAD');

// =====================================
// INITIALIZATION
// =====================================

/**
 * Initialize corpus system with legacy format (matches your existing pattern)
 * @returns {Promise<Object>} Object with vectorData and documentDatabase
 */
export const initializeCorpusLegacyFormat = safeAsync(async () => {
  debugLog('Initializing corpus system...', 'info');
  
  try {
    // Load vectors in your expected format
    const vectorData = await loadVectorDataLegacyFormat();
    
    // Load document databases for title lookup
    const documentDatabase = await loadDocumentDatabases();
    
    debugLog('Corpus system initialized successfully', 'info');
    
    return {
      vectorData,
      documentDatabase
    };
    
  } catch (error) {
    debugLog(`Corpus initialization failed: ${error.message}`, 'error');
    throw error;
  }
}, 'VECTOR_LOAD');