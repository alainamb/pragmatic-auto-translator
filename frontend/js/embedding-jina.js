// =====================================
// JINA EMBEDDINGS - SIMPLIFIED DUAL ENVIRONMENT
// =====================================

import config from './config.js';
import { debugLog, createError, safeAsync, startTimer, cleanText } from './utils.js';
import LOCAL_API_CONFIG from './api-config.js';

// =====================================
// ENVIRONMENT & CONFIG
// =====================================

let apiConfig = null;
let configLoadAttempted = false;

/**
 * Detect current environment
 */
function detectEnvironment() {
  if (window.location.hostname.includes('github.io') || 
      window.location.hostname.includes('github.com')) {
    return 'github_pages';
  }
  return 'local_development';
}

/**
 * Try to load GitHub Actions config (only when needed, not during module load)
 */
async function tryLoadGitHubConfig() {
  if (configLoadAttempted) return apiConfig;
  
  configLoadAttempted = true;
  
  try {
    const module = await import('./api-config.js');
    apiConfig = module.API_CONFIG;
    debugLog('✅ Loaded API key from GitHub Actions', 'info');
    return apiConfig;
  } catch (error) {
    debugLog('ℹ️ No GitHub Actions config (normal for local development)', 'info');
    return null;
  }
}

// =====================================
// JINA API CONFIGURATION
// =====================================

const JINA_CONFIG = {
  EMBEDDING_URL: 'https://api.jina.ai/v1/embeddings',
  MODEL: 'jina-embeddings-v3',
  DIMENSIONS: 1024,
  API_KEY: null,  // Will be set via functions below
  MAX_INPUT_LENGTH: 8192,
  TIMEOUT: 30000,
  DEFAULT_OPTIONS: {
    normalized: true,
    embedding_type: 'float'
  }
};

// =====================================
// API KEY MANAGEMENT
// =====================================

/**
 * Set JINA API key manually
 */
export function setJinaApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('Invalid API key provided');
  }
  JINA_CONFIG.API_KEY = apiKey;
  debugLog('JINA API key set manually', 'info');
}

/**
 * Store API key in localStorage for local development
 */
export function storeApiKeyLocally(apiKey) {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem('jina_api_key', apiKey);
    setJinaApiKey(apiKey); // Also set in memory
    debugLog('API key stored in localStorage', 'info');
  } else {
    throw new Error('localStorage not available');
  }
}

/**
 * Get API key with smart environment detection
 */
/**
 * Get API key with smart environment detection
 */
async function getApiKey() {
  const environment = detectEnvironment();
  
  // 1. Check manually set key first (works in both environments)
  if (JINA_CONFIG.API_KEY) {
    return JINA_CONFIG.API_KEY;
  }
  
  // 2. For local development, try multiple sources
  if (environment === 'local_development') {
    // 2a. Check localStorage
    const storedKey = localStorage.getItem('jina_api_key');
    if (storedKey) {
      debugLog('Using API key from localStorage', 'info');
      return storedKey;
    }
    
    // 2b. Try loading from local api-config.js file
    try {
      if (LOCAL_API_CONFIG?.API_KEY) {
        debugLog('Using API key from api-config.js', 'info');
        return LOCAL_API_CONFIG.API_KEY;
      }
    } catch (error) {
      debugLog('Could not load api-config.js: ' + error.message, 'warn');
    }
  }
  
  // 3. For GitHub Pages (or as fallback), try GitHub Actions config
  const githubConfig = await tryLoadGitHubConfig();
  if (githubConfig?.JINA_API_KEY) {
    return githubConfig.JINA_API_KEY;
  }
  
  return null;
}

/**
 * Get API key status with environment info
 */
export async function getApiKeyStatus() {
  const environment = detectEnvironment();
  const key = await getApiKey();
  
  let source = 'none';
  
  if (key) {
    if (JINA_CONFIG.API_KEY && key === JINA_CONFIG.API_KEY) {
      source = 'manual';
    } else if (localStorage.getItem('jina_api_key') === key) {
      source = 'localStorage';
    } else {
      // Must be from GitHub Actions
      source = 'github_actions';
    }
  }
  
  return {
    hasKey: !!key,
    source: source,
    keyPreview: key ? `${key.substring(0, 10)}...` : null,
    environment: environment,
    isProduction: environment === 'github_pages'
  };
}

// =====================================
// API COMMUNICATION (rest of your functions stay the same)
// =====================================

const callJinaAPI = safeAsync(async (input, options = {}) => {
  const endTimer = startTimer('JINA API call');
  
  const apiKey = await getApiKey();
  if (!apiKey) {
    const status = await getApiKeyStatus();
    throw new Error(`JINA API key not available. Environment: ${status.environment}, Source: ${status.source}. Use setJinaApiKey() or storeApiKeyLocally().`);
  }
  
  const inputArray = Array.isArray(input) ? input : [input];
  
  inputArray.forEach((text, index) => {
    if (typeof text !== 'string') {
      throw new Error(`Input ${index} must be a string`);
    }
    if (text.length > JINA_CONFIG.MAX_INPUT_LENGTH) {
      debugLog(`Input ${index} truncated`, 'warn');
      inputArray[index] = text.substring(0, JINA_CONFIG.MAX_INPUT_LENGTH);
    }
  });
  
  const requestBody = {
    input: inputArray,
    model: JINA_CONFIG.MODEL,
    dimensions: JINA_CONFIG.DIMENSIONS,
    ...JINA_CONFIG.DEFAULT_OPTIONS,
    ...options
  };
  
  const response = await fetch(JINA_CONFIG.EMBEDDING_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(JINA_CONFIG.TIMEOUT)
  });
  
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`JINA API error ${response.status}: ${errorText}`);
  }
  
  const data = await response.json();
  
  if (!data.data || !Array.isArray(data.data)) {
    throw new Error('Invalid response structure from JINA API');
  }
  
  endTimer();
  debugLog(`JINA API call successful: ${data.data.length} embeddings returned`, 'info');
  return data;
}, 'JINA_API_ERROR');

export const createUserInputEmbedding = safeAsync(async (text) => {
  if (!text || typeof text !== 'string') {
    throw new Error('Input text is required and must be a string');
  }
  
  const cleanedText = cleanText(text);
  if (!cleanedText) {
    throw new Error('Input text is empty after cleaning');
  }
  
  const response = await callJinaAPI(cleanedText);
  const embeddingData = response.data[0];
  
  if (!embeddingData.embedding) {
    throw new Error('No embedding returned from JINA API');
  }
  
  const keyStatus = await getApiKeyStatus();
  
  return {
    originalText: text,
    preprocessedText: cleanedText,
    embedding: embeddingData.embedding,
    dimension: embeddingData.embedding.length,
    model: JINA_CONFIG.MODEL,
    apiType: 'jina',
    apiKeySource: keyStatus.source,
    environment: keyStatus.environment,
    usage: response.usage || null,
    timestamp: new Date().toISOString(),
    
    dimensionMismatch: {
      userEmbedding: embeddingData.embedding.length,
      corpusVectors: config.MODELS.EMBEDDING.dimension,
      note: embeddingData.embedding.length !== config.MODELS.EMBEDDING.dimension 
        ? 'Dimension mismatch - consider regenerating corpus'
        : 'Dimensions match'
    }
  };
}, 'EMBEDDING_CREATE_ERROR');

export const loadEmbeddingModel = safeAsync(async () => {
  const keyStatus = await getApiKeyStatus();
  if (!keyStatus.hasKey) {
    throw new Error(`JINA API key required. Environment: ${keyStatus.environment}`);
  }
  
  await callJinaAPI('test');
  debugLog(`✅ JINA model ready via ${keyStatus.source}`, 'info');
  return keyStatus;
}, 'MODEL_LOAD_ERROR');

export const isEmbeddingModelReady = safeAsync(async () => {
  const keyStatus = await getApiKeyStatus();
  if (!keyStatus.hasKey) return false;
  
  try {
    await callJinaAPI('test');
    return true;
  } catch (error) {
    return false;
  }
}, 'MODEL_CHECK_ERROR');

export const getEmbeddingModelStatus = safeAsync(async () => {
  const keyStatus = await getApiKeyStatus();
  
  const baseStatus = {
    modelName: JINA_CONFIG.MODEL,
    dimensions: JINA_CONFIG.DIMENSIONS,
    apiType: 'jina',
    endpointUrl: JINA_CONFIG.EMBEDDING_URL,
    ...keyStatus
  };
  
  if (!keyStatus.hasKey) {
    return {
      ...baseStatus,
      status: 'api_key_missing',
      ready: false,
      message: `JINA API key required for ${keyStatus.environment}`
    };
  }
  
  try {
    await callJinaAPI('test');
    return {
      ...baseStatus,
      status: 'ready',
      ready: true,
      testPassed: true
    };
  } catch (error) {
    return {
      ...baseStatus,
      status: 'error',
      ready: false,
      error: error.message
    };
  }
}, 'MODEL_STATUS_ERROR');

// Simple initialization
debugLog('JINA Embeddings loaded', 'info');
debugLog(`Environment: ${detectEnvironment()}`, 'info');