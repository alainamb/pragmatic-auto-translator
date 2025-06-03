// =====================================
// PRAGMATIC AUTO-TRANSLATOR CONFIG
// =====================================

// Model Configuration
export const MODELS = {
  // Embedding model (matches your vector generation)
  EMBEDDING: {
    name: 'distiluse-base-multilingual-cased-v2',
    dimension: 512,
    transformersId: 'sentence-transformers/distiluse-base-multilingual-cased-v2'
  },
  
  // Translation models
  TRANSLATION: {
    // Helsinki models via different APIs
    EN_TO_ES: 'Helsinki-NLP/opus-mt-en-es',
    ES_TO_EN: 'Helsinki-NLP/opus-mt-es-en'
  }
};

// API Endpoints for Translation
export const TRANSLATION_APIS = {
  // Primary: LibreTranslate (free, reliable)
  LIBRETRANSLATE: {
    url: 'https://libretranslate.de/translate',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    // Language codes for LibreTranslate
    languages: {
      en: 'en',
      es: 'es'
    }
  },
  
  // Backup: MyMemory (free tier)
  MYMEMORY: {
    url: 'https://api.mymemory.translated.net/get',
    method: 'GET',
    // Language codes for MyMemory  
    languages: {
      en: 'en',
      es: 'es'
    }
  },
};

// Corpus Configuration
export const CORPUS = {
  // Domain currently implemented
  DOMAIN: 'gai', // Generative AI
  
  // Vector file paths (relative to project root)
  VECTOR_PATHS: {
    document: './vectors/gai/gai-document-vectors.json',
    section: './vectors/gai/gai-section-vectors.json', 
    paragraph: './vectors/gai/gai-paragraph-vectors.json'
  },
  
  // Database paths (for context info)
  DATABASE_PATHS: {
    en: './corpora/gai/eng/gai-eng_database.json',
    es: './corpora/gai/esp/gai-esp_database.json'
  }
};

// Similarity Search Configuration
export const SIMILARITY = {
  // How many similar items to retrieve at each level
  TOP_K: {
    document: 3,    // Top 3 most similar documents
    section: 5,     // Top 5 most similar sections  
    paragraph: 8    // Top 8 most similar paragraphs
  },
  
  // Minimum similarity thresholds (0-1 scale) - starting low for small corpus
  MIN_THRESHOLD: {
    document: 0.1,  // Lower threshold for document-level with only 6 docs
    section: 0.15,
    paragraph: 0.2
  },
  
  // Maximum total context length to send to translation API
  MAX_CONTEXT_LENGTH: 10000 // characters (context passages, not full docs)
};

// UI Configuration
export const UI = {
  // Supported language directions
  LANGUAGES: {
    en: { name: 'English' },
    es: { name: 'Spanish' }
  },
  
  // Default translation direction
  DEFAULT_DIRECTION: {
    source: 'en',
    target: 'es'
  },
  
  // Status messages
  STATUS: {
    LOADING_VECTORS: 'Loading corpus vectors...',
    LOADING_MODEL: 'Loading embedding model...',
    CREATING_EMBEDDINGS: 'Creating embeddings...',
    SEARCHING_CORPUS: 'Searching corpus for context...',
    TRANSLATING: 'Translating with context...',
    COMPLETE: 'Translation complete',
    ERROR: 'Translation error occurred'
  }
};

// Language Code Mapping
export const LANGUAGE_MAPPING = {
  // Your 3-letter ISO codes → API 2-letter codes
  TO_API_CODES: {
    eng: 'en',
    esp: 'es'
  },
  
  // API 2-letter codes → Your 3-letter ISO codes  
  FROM_API_CODES: {
    en: 'eng',
    es: 'esp'
  }
};

// Development Configuration
export const DEV = {
  // Enable console logging for debugging
  DEBUG: true,
  
  // Show detailed similarity scores in UI
  SHOW_SIMILARITY_SCORES: true,
  
  // Cache strategy: vectors only (not full text) for faster similarity search
  CACHE_VECTORS_ONLY: true,
  
  // Maximum cache age in milliseconds (24 hours)
  CACHE_MAX_AGE: 24 * 60 * 60 * 1000
};

// Error Configuration
export const ERRORS = {
  NETWORK: 'Network error - please check your connection',
  MODEL_LOAD: 'Could not load embedding model',
  VECTOR_LOAD: 'Could not load corpus vectors',
  TRANSLATION_API: 'Translation service unavailable',
  NO_CONTEXT: 'No relevant context found in corpus',
  INVALID_INPUT: 'Please enter text to translate'
};

// Export default configuration object
export default {
  MODELS,
  TRANSLATION_APIS,
  CORPUS,
  SIMILARITY,
  UI,
  LANGUAGE_MAPPING,
  DEV,
  ERRORS
};