// =====================================
// CORPUS SIMILARITY SEARCH MODULE
// =====================================

import config from './config.js';
import { 
  debugLog, 
  createError, 
  safeAsync, 
  startTimer,
  cosineSimilarity,
  filterByThreshold,
  getTopK,
  sortBySimilarity,
  combineTextWithinLimit,
  truncateText,
  logSimilarityResults
} from './utils.js';
import { getTextForVectors } from './corpora-retrieval.js';

// =====================================
// CORE SIMILARITY SEARCH FUNCTIONS
// =====================================

/**
 * Calculate level-specific similarity score with different strategies
 * @param {number[]} userEmbedding - User input embedding (1024D)
 * @param {number[]} vectorEmbedding - Vector embedding (1024D) 
 * @param {string} level - Level type ('document', 'section', 'paragraph')
 * @param {Object} vectorItem - The vector item for additional context
 * @returns {number} Adjusted similarity score (0-1)
 */
function calculateLevelSpecificSimilarity(userEmbedding, vectorEmbedding, level, vectorItem) {
  // Base cosine similarity
  const baseSimilarity = cosineSimilarity(userEmbedding, vectorEmbedding);
  
  // Apply level-specific strategies
  switch (level) {
    case 'document':
      // Document-level: Emphasize functional and discourse similarity
      // Strategy: Boost scores for documents with similar structural patterns
      return calculateDocumentLevelSimilarity(baseSimilarity, vectorItem);
      
    case 'section': 
      // Section-level: Balance topical and stylistic similarity
      // Strategy: Moderate adjustment, balance conceptual and structural cues
      return calculateSectionLevelSimilarity(baseSimilarity, vectorItem);
      
    case 'paragraph':
      // Paragraph-level: Focus on conceptual and terminological similarity
      // Strategy: Prefer direct conceptual matches, less structural bias
      return calculateParagraphLevelSimilarity(baseSimilarity, vectorItem);
      
    default:
      return baseSimilarity;
  }
}

/**
 * Document-level similarity: Emphasize functional and discourse patterns
 */
function calculateDocumentLevelSimilarity(baseSimilarity, vectorItem) {
  let adjustedScore = baseSimilarity;
  
  // Boost for longer documents (more discourse structure)
  if (vectorItem.text && vectorItem.text.length > 5000) {
    adjustedScore *= 1.1; // 10% boost for substantial documents
  }
  
  // Boost for documents with clear structural markers
  if (vectorItem.title && (
    vectorItem.title.toLowerCase().includes('introduction') ||
    vectorItem.title.toLowerCase().includes('conclusion') ||
    vectorItem.title.toLowerCase().includes('methodology') ||
    vectorItem.title.toLowerCase().includes('abstract')
  )) {
    adjustedScore *= 1.05; // 5% boost for structural documents
  }
  
  // Cap at 1.0
  return Math.min(adjustedScore, 1.0);
}

/**
 * Section-level similarity: Balance topical and stylistic elements
 */
function calculateSectionLevelSimilarity(baseSimilarity, vectorItem) {
  let adjustedScore = baseSimilarity;
  
  // Moderate preference for mid-length sections (good topical coverage)
  if (vectorItem.text && vectorItem.text.length > 1000 && vectorItem.text.length < 3000) {
    adjustedScore *= 1.05; // 5% boost for well-sized sections
  }
  
  // Slight boost for sections with clear headings
  if (vectorItem.title && vectorItem.title.length > 5) {
    adjustedScore *= 1.02; // 2% boost for titled sections
  }
  
  return Math.min(adjustedScore, 1.0);
}

/**
 * Paragraph-level similarity: Focus on conceptual and terminological similarity
 */
function calculateParagraphLevelSimilarity(baseSimilarity, vectorItem) {
  let adjustedScore = baseSimilarity;
  
  // Prefer focused paragraphs (good conceptual density)
  if (vectorItem.text && vectorItem.text.length > 200 && vectorItem.text.length < 1000) {
    adjustedScore *= 1.03; // 3% boost for focused paragraphs
  }
  
  // Small penalty for very short paragraphs (likely less conceptual content)
  if (vectorItem.text && vectorItem.text.length < 100) {
    adjustedScore *= 0.95; // 5% penalty for very short paragraphs
  }
  
  return Math.min(adjustedScore, 1.0);
}

/**
 * Search for similar vectors at a specific level (document/section/paragraph)
 * @param {number[]} userEmbedding - User input embedding (1024D)
 * @param {Array} vectorArray - Array of vector objects from vectorData
 * @param {string} level - Level type ('document', 'section', 'paragraph')
 * @param {Object} options - Search options (topK, threshold)
 * @returns {Array} Array of {item, score} objects sorted by similarity
 */
export function searchSimilarVectorsAtLevel(userEmbedding, vectorArray, level, options = {}) {
  if (!userEmbedding || !Array.isArray(vectorArray) || vectorArray.length === 0) {
    debugLog(`No vectors available for ${level} search`, 'warn');
    return [];
  }

  const startTime = performance.now();
  const results = [];

  // Get config values with option overrides
  const topK = options.topK || config.SIMILARITY.TOP_K[level];
  const threshold = options.threshold || config.SIMILARITY.MIN_THRESHOLD[level];
  const useAdvancedScoring = options.useAdvancedScoring !== false; // Default to true

  debugLog(`Searching ${vectorArray.length} ${level} vectors (topK: ${topK}, threshold: ${threshold}, advanced: ${useAdvancedScoring})`, 'info');

  // Calculate similarity for each vector
  for (const vectorItem of vectorArray) {
    if (!vectorItem.vector || !Array.isArray(vectorItem.vector)) {
      debugLog(`Skipping ${level} item ${vectorItem.id} - missing vector data`, 'warn');
      continue;
    }

    // Validate vector dimension
    if (vectorItem.vector.length !== config.MODELS.EMBEDDING.dimension) {
      debugLog(`Skipping ${level} item ${vectorItem.id} - dimension mismatch (${vectorItem.vector.length} vs ${config.MODELS.EMBEDDING.dimension})`, 'warn');
      continue;
    }

    // Calculate similarity using level-specific strategies
    const similarity = useAdvancedScoring 
      ? calculateLevelSpecificSimilarity(userEmbedding, vectorItem.vector, level, vectorItem)
      : cosineSimilarity(userEmbedding, vectorItem.vector);
    
    if (similarity >= threshold) {
      results.push({
        item: vectorItem,
        score: similarity,
        level: level,
        scoringMethod: useAdvancedScoring ? 'advanced' : 'basic'
      });
    }
  }

  // Sort and get top K
  const topResults = getTopK(results, topK);
  
  const searchTime = performance.now() - startTime;
  debugLog(`${level} search completed: ${results.length} above threshold, top ${topResults.length} selected (${searchTime.toFixed(2)}ms)`, 'info');

  // Log similarity scores if debugging enabled
  if (config.DEV.SHOW_SIMILARITY_SCORES && topResults.length > 0) {
    logSimilarityResults(topResults, level);
  }

  return topResults;
}

/**
 * Search for similar context across all vector levels
 * @param {number[]} userEmbedding - User input embedding (1024D)
 * @param {Object} vectorData - Complete vector data {documents, sections, paragraphs}
 * @param {Object} options - Search options
 * @returns {Object} Comprehensive similarity search results
 */
export const findSimilarContext = safeAsync(async (userEmbedding, vectorData, options = {}) => {
  const endTimer = startTimer('Complete similarity search');
  
  // Validate inputs
  if (!userEmbedding || !Array.isArray(userEmbedding)) {
    throw new Error('Invalid user embedding - must be array');
  }

  if (userEmbedding.length !== config.MODELS.EMBEDDING.dimension) {
    throw new Error(`User embedding dimension mismatch: expected ${config.MODELS.EMBEDDING.dimension}, got ${userEmbedding.length}`);
  }

  if (!vectorData || !vectorData.documents || !vectorData.sections || !vectorData.paragraphs) {
    throw new Error('Invalid vector data structure - missing documents, sections, or paragraphs');
  }

  // Search at all three levels
  const similarityResults = {
    documents: searchSimilarVectorsAtLevel(userEmbedding, vectorData.documents, 'document', options),
    sections: searchSimilarVectorsAtLevel(userEmbedding, vectorData.sections, 'section', options),
    paragraphs: searchSimilarVectorsAtLevel(userEmbedding, vectorData.paragraphs, 'paragraph', options)
  };

  // Prepare context text from all results
  const contextData = await prepareContextFromResults(similarityResults, options);

  endTimer();

  const totalResults = similarityResults.documents.length + similarityResults.sections.length + similarityResults.paragraphs.length;
  
  debugLog(`✅ Similarity search complete: ${totalResults} total results, ${contextData.contextLength} characters of context`, 'info');

  return {
    contextPassages: contextData.passages,
    combinedContext: contextData.combinedText,
    similarityResults: similarityResults,
    metadata: {
      totalResults: totalResults,
      contextLength: contextData.contextLength,
      resultCounts: {
        documents: similarityResults.documents.length,
        sections: similarityResults.sections.length,
        paragraphs: similarityResults.paragraphs.length
      },
      topScores: {
        document: similarityResults.documents[0]?.score || 0,
        section: similarityResults.sections[0]?.score || 0,
        paragraph: similarityResults.paragraphs[0]?.score || 0
      }
    }
  };
}, 'SIMILARITY_SEARCH');

// =====================================
// CONTEXT PREPARATION FUNCTIONS  
// =====================================

/**
 * Prepare context text with level-aware prioritization
 * @param {Object} similarityResults - Results from findSimilarContext
 * @param {Object} options - Options including maxContextLength
 * @returns {Object} Prepared context data with strategic ordering
 */
export const prepareContextFromResults = safeAsync(async (similarityResults, options = {}) => {
  const maxLength = options.maxContextLength || config.SIMILARITY.MAX_CONTEXT_LENGTH;
  const priorityStrategy = options.priorityStrategy || 'balanced'; // 'balanced', 'documents-first', 'paragraphs-first'
  
  // Collect results by level
  const documentResults = similarityResults.documents || [];
  const sectionResults = similarityResults.sections || [];
  const paragraphResults = similarityResults.paragraphs || [];
  
  if (documentResults.length + sectionResults.length + paragraphResults.length === 0) {
    debugLog('No similarity results to prepare context from', 'warn');
    return {
      passages: [],
      combinedText: '',
      contextLength: 0
    };
  }

  // Apply different context preparation strategies
  let orderedResults = [];
  
  switch (priorityStrategy) {
    case 'documents-first':
      // Prioritize document-level context for discourse understanding
      orderedResults = [
        ...sortBySimilarity(documentResults),
        ...sortBySimilarity(sectionResults), 
        ...sortBySimilarity(paragraphResults)
      ];
      break;
      
    case 'paragraphs-first':
      // Prioritize paragraph-level context for terminology
      orderedResults = [
        ...sortBySimilarity(paragraphResults),
        ...sortBySimilarity(sectionResults),
        ...sortBySimilarity(documentResults)
      ];
      break;
      
    case 'balanced':
    default:
      // Interleave results to balance different types of context
      orderedResults = interleaveResultsByLevel(documentResults, sectionResults, paragraphResults);
      break;
  }
  
  debugLog(`Preparing context using '${priorityStrategy}' strategy from ${orderedResults.length} results (max ${maxLength} chars)`, 'info');

  // Extract text passages with level-aware formatting
  const passages = [];
  const textMap = new Map(); // To avoid duplicates

  for (const result of orderedResults) {
    const item = result.item;
    
    // Get text content
    let text = item.text;
    
    if (!text) {
      debugLog(`No text found for ${item.id}, skipping context inclusion`, 'warn');
      continue;
    }

    // Create a unique key to avoid duplicate passages
    const textKey = text.substring(0, 100); // Use first 100 chars as key
    
    if (!textMap.has(textKey)) {
      textMap.set(textKey, true);
      
      // Create level-specific context prefix
      const contextPrefix = createLevelAwareContextPrefix(item, result.score, result.level);
      const fullPassage = `${contextPrefix}\n${text}`;
      
      passages.push(fullPassage);
    }
  }

  // Combine passages within length limit
  const combinedText = combineTextWithinLimit(passages, maxLength, '\n\n---\n\n');
  
  debugLog(`Context prepared: ${passages.length} passages, ${combinedText.length} characters (strategy: ${priorityStrategy})`, 'info');

  return {
    passages: passages,
    combinedText: combinedText,
    contextLength: combinedText.length,
    strategy: priorityStrategy
  };
}, 'CONTEXT_PREPARATION');

/**
 * Interleave results from different levels to create balanced context
 * @param {Array} documents - Document results
 * @param {Array} sections - Section results  
 * @param {Array} paragraphs - Paragraph results
 * @returns {Array} Interleaved results
 */
function interleaveResultsByLevel(documents, sections, paragraphs) {
  const sortedDocs = sortBySimilarity(documents);
  const sortedSections = sortBySimilarity(sections);
  const sortedParagraphs = sortBySimilarity(paragraphs);
  
  const interleaved = [];
  const maxLength = Math.max(sortedDocs.length, sortedSections.length, sortedParagraphs.length);
  
  for (let i = 0; i < maxLength; i++) {
    // Add highest scoring document if available
    if (i < sortedDocs.length) {
      interleaved.push(sortedDocs[i]);
    }
    
    // Add highest scoring paragraph if available  
    if (i < sortedParagraphs.length) {
      interleaved.push(sortedParagraphs[i]);
    }
    
    // Add highest scoring section if available
    if (i < sortedSections.length) {
      interleaved.push(sortedSections[i]);
    }
  }
  
  return interleaved;
}

/**
 * Create level-aware context prefix that reflects the similarity strategy
 * @param {Object} item - Vector item
 * @param {number} score - Similarity score
 * @param {string} level - Level type
 * @returns {string} Formatted context prefix
 */
function createLevelAwareContextPrefix(item, score, level) {
  const scorePercent = Math.round(score * 100);
  
  let prefix = '';
  
  switch (level) {
    case 'document':
      prefix = `[DOCUMENT CONTEXT - ${scorePercent}% discourse similarity]`;
      break;
    case 'section': 
      prefix = `[SECTION CONTEXT - ${scorePercent}% topical similarity]`;
      break;
    case 'paragraph':
      prefix = `[PARAGRAPH CONTEXT - ${scorePercent}% conceptual similarity]`;
      break;
    default:
      prefix = `[${level.toUpperCase()} - ${scorePercent}% similar]`;
  }
  
  // Add title if available
  if (item.title) {
    prefix += ` ${item.title}`;
  }
  
  // Add document reference for sections/paragraphs
  if (level !== 'document' && item.document_id) {
    prefix += ` (from ${item.document_id})`;
  }
  
  return prefix;
}

// =====================================
// TARGETED SEARCH FUNCTIONS
// =====================================

/**
 * Search for similar documents only (for high-level context)
 * @param {number[]} userEmbedding - User input embedding
 * @param {Object} vectorData - Vector data
 * @param {Object} options - Search options
 * @returns {Array} Document similarity results
 */
export const findSimilarDocuments = safeAsync(async (userEmbedding, vectorData, options = {}) => {
  const results = searchSimilarVectorsAtLevel(userEmbedding, vectorData.documents, 'document', options);
  
  debugLog(`Document search complete: ${results.length} similar documents found`, 'info');
  return results;
}, 'DOCUMENT_SEARCH');

/**
 * Search for similar paragraphs only (for detailed context)
 * @param {number[]} userEmbedding - User input embedding
 * @param {Object} vectorData - Vector data
 * @param {Object} options - Search options
 * @returns {Array} Paragraph similarity results
 */
export const findSimilarParagraphs = safeAsync(async (userEmbedding, vectorData, options = {}) => {
  const results = searchSimilarVectorsAtLevel(userEmbedding, vectorData.paragraphs, 'paragraph', options);
  
  debugLog(`Paragraph search complete: ${results.length} similar paragraphs found`, 'info');
  return results;
}, 'PARAGRAPH_SEARCH');

// =====================================
// UTILITY FUNCTIONS
// =====================================

/**
 * Get similarity statistics from search results
 * @param {Object} similarityResults - Results from findSimilarContext
 * @returns {Object} Statistical summary
 */
export function getSimilarityStats(similarityResults) {
  const allResults = [
    ...similarityResults.documents,
    ...similarityResults.sections,
    ...similarityResults.paragraphs
  ];

  if (allResults.length === 0) {
    return {
      totalResults: 0,
      averageScore: 0,
      maxScore: 0,
      minScore: 0
    };
  }

  const scores = allResults.map(r => r.score);
  const totalScore = scores.reduce((sum, score) => sum + score, 0);

  return {
    totalResults: allResults.length,
    averageScore: totalScore / allResults.length,
    maxScore: Math.max(...scores),
    minScore: Math.min(...scores),
    scoreDistribution: {
      high: scores.filter(s => s >= 0.7).length,
      medium: scores.filter(s => s >= 0.3 && s < 0.7).length,
      low: scores.filter(s => s < 0.3).length
    }
  };
}

/**
 * Filter results by document language (if document IDs contain language codes)
 * @param {Array} results - Similarity results
 * @param {string} language - Language code (eng, esp)
 * @returns {Array} Filtered results
 */
export function filterResultsByLanguage(results, language) {
  return results.filter(result => {
    const item = result.item;
    const docId = item.document_id || item.id;
    return docId && docId.includes(`-${language}_`);
  });
}

/**
 * Combine context from multiple searches (for advanced use cases)
 * @param {Array} searchResults - Array of similarity result objects
 * @param {Object} options - Combination options
 * @returns {Object} Combined context data
 */
export const combineMultipleSearches = safeAsync(async (searchResults, options = {}) => {
  const maxLength = options.maxContextLength || config.SIMILARITY.MAX_CONTEXT_LENGTH;
  
  // Flatten all results and remove duplicates by ID
  const allResults = [];
  const seenIds = new Set();
  
  for (const searchResult of searchResults) {
    const results = [
      ...searchResult.documents || [],
      ...searchResult.sections || [],
      ...searchResult.paragraphs || []
    ];
    
    for (const result of results) {
      const id = result.item.id;
      if (!seenIds.has(id)) {
        seenIds.add(id);
        allResults.push(result);
      }
    }
  }
  
  // Use the standard context preparation
  const contextData = await prepareContextFromResults({
    documents: allResults.filter(r => r.level === 'document'),
    sections: allResults.filter(r => r.level === 'section'),
    paragraphs: allResults.filter(r => r.level === 'paragraph')
  }, options);
  
  debugLog(`Combined ${searchResults.length} searches into ${allResults.length} unique results`, 'info');
  
  return contextData;
}, 'COMBINE_SEARCHES');

// =====================================
// EXPORTS
// =====================================

export default {
  // Main search functions
  findSimilarContext,
  searchSimilarVectorsAtLevel,
  
  // Targeted searches
  findSimilarDocuments,
  findSimilarParagraphs,
  
  // Context preparation
  prepareContextFromResults,
  
  // Utilities
  getSimilarityStats,
  filterResultsByLanguage,
  combineMultipleSearches
};