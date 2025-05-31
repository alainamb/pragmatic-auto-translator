// =====================================
// CUSTOM FASTAPI EMBEDDING GENERATION
// =====================================

import config from './config.js';
import { 
  debugLog, 
  createError, 
  safeAsync, 
  startTimer, 
  validateVectorDimension,
  cleanText,
  isValidInput 
} from './utils.js';

// =====================================
// API HEALTH CHECK
// =====================================

/**
 * Check if custom embedding API is available
 * @returns {Promise<boolean>} True if API is healthy
 */
export const checkEmbeddingAPIHealth = safeAsync(async () => {
  debugLog('Checking custom embedding API health...', 'info');
  
  try {
    const response = await fetch(config.EMBEDDING_APIS.CUSTOM.healthUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      debugLog(`Health check failed: ${response.status}`, 'warn');
      return false;
    }
    
    const health = await response.json();
    debugLog(`API health: ${health.status}, model loaded: ${health.model_loaded}`, 'info');
    
    return health.status === 'healthy' && health.model_loaded;
    
  } catch (error) {
    debugLog(`Health check error: ${error.message}`, 'warn');
    return false;
  }
}, 'MODEL_LOAD');

// =====================================
// CUSTOM API CALLS
// =====================================

/**
 * Call custom FastAPI embedding endpoint
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} Embedding vector
 */
const callCustomEmbeddingAPI = safeAsync(async (text) => {
  debugLog(`Calling custom API for text: "${text.substring(0, 50)}..."`, 'info');
  
  const response = await fetch(config.EMBEDDING_APIS.CUSTOM.url, {
    method: 'POST',
    headers: config.EMBEDDING_APIS.CUSTOM.headers,
    body: JSON.stringify({
      text: text,
      max_length: 512
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    debugLog(`Custom API error: ${response.status} - ${errorText}`, 'error');
    
    if (response.status === 503) {
      throw new Error('Custom embedding server is starting up. Please try again in a moment.');
    } else if (response.status === 400) {
      throw new Error('Invalid text input for embedding.');
    } else if (response.status === 500) {
      throw new Error('Custom embedding server error. Check server logs.');
    } else {
      throw new Error(`Custom API error ${response.status}: ${errorText}`);
    }
  }
  
  const result = await response.json();
  debugLog(`Custom API response received - ${result.dimension} dimensions`, 'info');
  
  // Validate response format
  if (!result.embedding || !Array.isArray(result.embedding)) {
    throw new Error('Invalid response format from custom API');
  }
  
  if (result.dimension !== config.MODELS.EMBEDDING.dimension) {
    debugLog(`Warning: API returned ${result.dimension} dimensions, expected ${config.MODELS.EMBEDDING.dimension}`, 'warn');
  }
  
  return result.embedding;
  
}, 'MODEL_LOAD');

// =====================================
// PUBLIC EMBEDDING FUNCTIONS
// =====================================

/**
 * Create embedding for text using custom FastAPI server
 * @param {string} text - Input text to embed
 * @param {Object} options - Options for embedding
 * @returns {Promise<number[]>} Embedding vector
 */
export const createEmbedding = safeAsync(async (text, options = {}) => {
  // Validate input
  if (!isValidInput(text)) {
    throw createError('INVALID_INPUT', 'Text must be a non-empty string');
  }
  
  const endTimer = startTimer(`Creating custom API embedding for text (${text.length} chars)`);
  
  try {
    // Clean the input text
    const cleanedText = cleanText(text);
    debugLog(`Creating custom embedding for: "${cleanedText.substring(0, 100)}${cleanedText.length > 100 ? '...' : ''}"`, 'info');
    
    // Call custom API
    const embedding = await callCustomEmbeddingAPI(cleanedText);
    
    // Validate the embedding dimensions
    if (!validateVectorDimension(embedding)) {
      debugLog(`Warning: Embedding dimension ${embedding.length} doesn't match expected ${config.MODELS.EMBEDDING.dimension}`, 'warn');
    }
    
    endTimer();
    debugLog(`Custom embedding created successfully (${embedding.length} dimensions)`, 'info');
    
    return embedding;
    
  } catch (error) {
    endTimer();
    debugLog(`Failed to create custom embedding: ${error.message}`, 'error');
    throw createError('MODEL_LOAD', `Custom embedding generation failed: ${error.message}`, error);
  }
}, 'MODEL_LOAD');

/**
 * Create embedding for user input with preprocessing and validation
 * @param {string} userInput - Raw user input text
 * @returns {Promise<Object>} Object with embedding and metadata
 */
export const createUserInputEmbedding = safeAsync(async (userInput) => {
  debugLog('Processing user input for custom embedding...', 'info');
  
  // Validate input
  if (!isValidInput(userInput)) {
    throw createError('INVALID_INPUT', 'Please enter valid text to translate');
  }
  
  // Preprocess text
  const preprocessedText = preprocessTextForEmbedding(userInput, {
    maxLength: 512,
    removeLineBreaks: false
  });
  
  // Create embedding using custom API
  const embedding = await createEmbedding(preprocessedText);
  
  return {
    originalText: userInput,
    preprocessedText: preprocessedText,
    embedding: embedding,
    dimension: embedding.length,
    model: config.MODELS.EMBEDDING.name,
    apiType: 'custom',
    timestamp: new Date().toISOString()
  };
}, 'MODEL_LOAD');

/**
 * Test embedding API with sample text
 * @returns {Promise<Object>} Test results
 */
export const testEmbeddingModel = safeAsync(async () => {
  debugLog('Testing custom embedding API...', 'info');
  
  // First check API health
  const isHealthy = await checkEmbeddingAPIHealth();
  if (!isHealthy) {
    throw new Error('Custom embedding API is not healthy');
  }
  
  const testText = "This is a test sentence for the embedding model.";
  const startTime = performance.now();
  
  const result = await createUserInputEmbedding(testText);
  
  const duration = performance.now() - startTime;
  
  const testResults = {
    success: true,
    testText: testText,
    embeddingDimension: result.dimension,
    processingTime: `${duration.toFixed(2)}ms`,
    model: result.model,
    apiType: result.apiType,
    apiHealthy: isHealthy
  };
  
  debugLog(`Custom embedding API test completed in ${duration.toFixed(2)}ms`, 'info');
  
  return testResults;
}, 'MODEL_LOAD');

// =====================================
// MODEL STATUS & UTILITIES
// =====================================

/**
 * Check if embedding API is ready
 * @returns {Promise<boolean>} True if API is ready
 */
export async function isEmbeddingModelReady() {
  return await checkEmbeddingAPIHealth();
}

/**
 * Get embedding API status
 * @returns {Promise<Object>} Status information
 */
export async function getEmbeddingModelStatus() {
  const isHealthy = await checkEmbeddingAPIHealth();
  
  return {
    type: 'Custom FastAPI',
    healthy: isHealthy,
    apiUrl: config.EMBEDDING_APIS.CUSTOM.url,
    modelName: config.MODELS.EMBEDDING.name,
    expectedDimension: config.MODELS.EMBEDDING.dimension
  };
}

/**
 * Load embedding model (for custom API, this checks health)
 * @returns {Promise<boolean>} Success status
 */
export const loadEmbeddingModel = safeAsync(async () => {
  debugLog('Initializing custom embedding API...', 'info');
  
  const isHealthy = await checkEmbeddingAPIHealth();
  
  if (isHealthy) {
    debugLog('Custom embedding API is ready', 'info');
    return true;
  } else {
    throw createError('MODEL_LOAD', 'Custom embedding API is not available or healthy');
  }
}, 'MODEL_LOAD');

// =====================================
// TEXT PREPROCESSING (same as HF version)
// =====================================

/**
 * Prepare text for embedding (additional preprocessing)
 * @param {string} text - Input text
 * @param {Object} options - Preprocessing options
 * @returns {string} Preprocessed text
 */
export function preprocessTextForEmbedding(text, options = {}) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  const {
    maxLength = 512, // Max tokens for the model
    removeExtraWhitespace = true,
    removeLineBreaks = false
  } = options;
  
  let processed = text;
  
  // Basic cleaning
  processed = cleanText(processed);
  
  // Remove line breaks if requested
  if (removeLineBreaks) {
    processed = processed.replace(/[\r\n]+/g, ' ');
  }
  
  // Truncate if too long (rough token estimation: 1 token ≈ 4 chars)
  if (processed.length > maxLength * 4) {
    processed = processed.substring(0, maxLength * 4);
    debugLog(`Text truncated to ${processed.length} characters`, 'info');
  }
  
  return processed;
}

// =====================================
// API CONFIGURATION HELPERS
// =====================================

/**
 * Update custom API URL (for when you deploy to production)
 * @param {string} newUrl - New API base URL
 */
export function setCustomAPIUrl(newUrl) {
  config.EMBEDDING_APIS.CUSTOM.url = `${newUrl}/embed`;
  config.EMBEDDING_APIS.CUSTOM.healthUrl = `${newUrl}/health`;
  debugLog(`Updated custom API URL to: ${newUrl}`, 'info');
}