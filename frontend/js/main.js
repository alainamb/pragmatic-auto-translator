// =====================================
// PRAGMATIC AUTO-TRANSLATOR MAIN
// =====================================

import config from './config.js';
import { debugLog } from './utils.js';
import { initializeCorpusLegacyFormat, getDocumentTitle } from './corpora-retrieval.js';
import { 
  loadEmbeddingModel, 
  createUserInputEmbedding, 
  isEmbeddingModelReady,
  getEmbeddingModelStatus,
  setJinaApiKey,
  storeApiKeyLocally, 
  getApiKeyStatus
} from './embedding-jina.js';
import { findSimilarContext } from './similarity.js';

// =====================================
// GLOBAL VARIABLES (matching your existing structure)
// =====================================

let vectorData = {
    documents: [],
    paragraphs: [],
    sections: []
};

let documentDatabase = {
    english: {},
    spanish: {}
};

let currentSourceLang = 'en';

// =====================================
// DOM ELEMENTS (matching your existing structure)
// =====================================

const languageOptions = document.querySelectorAll('.language-option');
const targetLanguageSpan = document.getElementById('targetLanguage');
const sourceTextArea = document.getElementById('sourceText');
const translateButton = document.getElementById('translateButton');
const statusIndicator = document.getElementById('statusIndicator');
const translationOutput = document.getElementById('translationOutput');
const contextInfo = document.getElementById('contextInfo');

// =====================================
// STATUS INDICATOR SYSTEM (preserving your existing pattern)
// =====================================

/**
 * Show status message to user (matches your existing showStatus function)
 * @param {string} message - Status message
 * @param {string} type - Status type ('loading', 'success', 'error')
 */
function showStatus(message, type = 'info') {
    if (!statusIndicator) return;
    
    statusIndicator.textContent = message;
    // Use your existing CSS class structure
    statusIndicator.className = `status-indicator status-${type}`;
    statusIndicator.classList.remove('hidden');
    
    // Auto-hide success messages after 3 seconds
    if (type === 'success') {
        setTimeout(() => {
            statusIndicator.classList.add('hidden');
        }, 3000);
    }
    
    debugLog(`Status: ${message} (${type})`, type === 'error' ? 'error' : 'info');
}

// =====================================
// LANGUAGE TOGGLE (preserving your existing functionality)
// =====================================

/**
 * Setup language toggle functionality (matches your existing pattern)
 */
function setupLanguageToggle() {
    if (!languageOptions.length) {
        debugLog('Language toggle elements not found', 'warn');
        return;
    }
    
    languageOptions.forEach(option => {
        option.addEventListener('click', () => {
            // Remove active class from all options
            languageOptions.forEach(opt => opt.classList.remove('active'));
            
            // Add active class to clicked option
            option.classList.add('active');
            
            // Update current source language
            currentSourceLang = option.dataset.lang;
            
            // Update target language display
            if (targetLanguageSpan) {
                targetLanguageSpan.textContent = currentSourceLang === 'en' ? 'Spanish' : 'English';
            }
            
            // Update placeholder text
            if (sourceTextArea) {
                if (currentSourceLang === 'en') {
                    sourceTextArea.placeholder = 'Enter your English text here for translation to Spanish...';
                } else {
                    sourceTextArea.placeholder = 'Ingrese su texto en español aquí para traducir al inglés...';
                }
            }
            
            debugLog(`Language direction changed: ${currentSourceLang} → ${currentSourceLang === 'en' ? 'es' : 'en'}`, 'info');
        });
    });
    
    debugLog('Language toggle setup complete', 'info');
}

// =====================================
// CORPUS LOADING (using our modular approach)
// =====================================

/**
 * Load vector data and document databases (modular version of your existing function)
 */
async function loadCorpusData() {
    console.log('Loading corpus data using modular approach...');
    showStatus('Loading corpus vector data...', 'loading');
    
    try {
        // Use our modular loading function
        const corpusData = await initializeCorpusLegacyFormat();
        
        // Assign to global variables (matching your existing structure)
        vectorData = corpusData.vectorData;
        documentDatabase = corpusData.documentDatabase;
        
        const totalVectors = vectorData.documents.length + vectorData.paragraphs.length + vectorData.sections.length;
        
        // Success message (matching your existing pattern)
        const message = `Loaded ${vectorData.documents.length} documents, ${vectorData.sections.length} sections, ${vectorData.paragraphs.length} paragraphs (Total: ${totalVectors} vectors)`;
        console.log(message);
        showStatus(message, 'success');
        
        // Log sample for debugging (matching your existing pattern)
        console.log('Sample vector data:', {
            documents: vectorData.documents[0],
            sections: vectorData.sections[0],
            paragraphs: vectorData.paragraphs[0]
        });
        
        return true;
        
    } catch (error) {
        console.error('Error loading corpus data:', error);
        showStatus('Failed to load corpus data. Translation may not work optimally.', 'error');
        return false;
    }
}

// =====================================
// TRANSLATION SETUP (placeholder for now)
// =====================================

/**
 * Setup translate button (now with embedding functionality)
 */
function setupTranslateButton() {
    if (!translateButton) {
        debugLog('Translate button not found', 'warn');
        return;
    }
    
    translateButton.addEventListener('click', async () => {
        await handleTranslation();
    });
    
    debugLog('Translate button setup complete', 'info');
}

/**
 * Handle the complete translation process - UPDATED with similarity search
 */
async function handleTranslation() {
    const sourceText = sourceTextArea?.value.trim();
    
    if (!sourceText) {
        showStatus('Please enter some text to translate', 'error');
        return;
    }
    
    try {
        // Step 1: Ensure embedding API is ready
        const isReady = await isEmbeddingModelReady();
        if (!isReady) {
            showStatus('Checking embedding API...', 'loading');
            await loadEmbeddingModel();
            showStatus('Embedding API ready', 'success');
        }
        
        // Step 2: Create embedding for user input
        showStatus('Creating text embedding...', 'loading');
        const userEmbedding = await createUserInputEmbedding(sourceText);
        
        showStatus('Text vectorized successfully', 'success');
        debugLog(`Created embedding for user text (${userEmbedding.dimension} dimensions)`, 'info');
        
        // Step 3: Get UI options for similarity search
        const useAdvanced = document.getElementById('advancedScoring')?.checked !== false;
        const priorityStrategy = document.getElementById('priorityStrategy')?.value || 'balanced';
        
        // Step 4: Search for similar context
        showStatus('Searching corpus for relevant context...', 'loading');
        const contextResults = await findSimilarContext(userEmbedding.embedding, vectorData, {
            useAdvancedScoring: useAdvanced,
            priorityStrategy: priorityStrategy,
            maxContextLength: 8000  // Adjust based on your translation API limits
        });
        
        // Step 5: Show similarity search results
        const resultCount = contextResults.metadata.totalResults;
        const contextLength = contextResults.metadata.contextLength;
        
        if (resultCount > 0) {
            showStatus(`Found ${resultCount} relevant passages (${contextLength} chars)`, 'success');
        } else {
            showStatus('No relevant context found - translating without corpus assistance', 'error');
        }
        
        // Step 6: Display detailed results in translation area (for debugging)
        if (config.DEV.DEBUG && translationOutput) {
            const apiStatus = await getEmbeddingModelStatus();
            
            translationOutput.innerHTML = `
                <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; font-family: monospace;">
                    <h4>✅ Embedding & Similarity Search Complete:</h4>
                    
                    <div style="margin: 10px 0;">
                        <h5>🔤 Text Processing:</h5>
                        <p><strong>Original text:</strong> "${userEmbedding.originalText}"</p>
                        <p><strong>Preprocessed:</strong> "${userEmbedding.preprocessedText}"</p>
                        <p><strong>Vector dimensions:</strong> ${userEmbedding.dimension}</p>
                        <p><strong>Model:</strong> ${userEmbedding.model}</p>
                    </div>
                    
                    <div style="margin: 10px 0;">
                        <h5>🔍 Similarity Search:</h5>
                        <p><strong>Advanced scoring:</strong> ${useAdvanced ? 'Enabled' : 'Disabled'}</p>
                        <p><strong>Priority strategy:</strong> ${priorityStrategy}</p>
                        <p><strong>Total results:</strong> ${resultCount}</p>
                        <p><strong>Context length:</strong> ${contextLength} characters</p>
                        <p><strong>Results breakdown:</strong> 
                           ${contextResults.metadata.resultCounts.documents} docs, 
                           ${contextResults.metadata.resultCounts.sections} sections, 
                           ${contextResults.metadata.resultCounts.paragraphs} paragraphs</p>
                        ${resultCount > 0 ? `
                        <p><strong>Top scores:</strong>
                           Doc: ${(contextResults.metadata.topScores.document * 100).toFixed(1)}%, 
                           Sec: ${(contextResults.metadata.topScores.section * 100).toFixed(1)}%, 
                           Par: ${(contextResults.metadata.topScores.paragraph * 100).toFixed(1)}%</p>
                        ` : ''}
                    </div>
                    
                    ${resultCount > 0 ? `
                    <div style="margin: 10px 0;">
                        <h5>📝 Context Preview:</h5>
                        <div style="max-height: 200px; overflow-y: auto; background: white; padding: 10px; border: 1px solid #ddd;">
                            ${contextResults.combinedContext.substring(0, 500)}${contextResults.combinedContext.length > 500 ? '...' : ''}
                        </div>
                    </div>
                    ` : ''}
                    
                    <p style="color: #28a745; margin-top: 15px;">
                        <strong>🚀 Ready for translation module!</strong>
                    </p>
                </div>
            `;
        } else if (translationOutput) {
            // Non-debug view - simpler display
            translationOutput.innerHTML = `
                <div style="background: #e8f5e8; padding: 15px; border-radius: 5px;">
                    <h4>✅ Text Analysis Complete</h4>
                    <p><strong>Text processed:</strong> "${sourceText.substring(0, 100)}${sourceText.length > 100 ? '...' : ''}"</p>
                    <p><strong>Context found:</strong> ${resultCount} relevant passages</p>
                    <p><strong>Strategy:</strong> ${priorityStrategy} similarity search</p>
                    <p style="color: #28a745;"><strong>Ready for translation!</strong></p>
                </div>
            `;
        }
        
        // TODO: Step 7 will be calling translation.js with the context
        // const translationResult = await translateWithContext(sourceText, contextResults, getCurrentLanguageDirection());
        
    } catch (error) {
        console.error('Translation process failed:', error);
        
        // More specific error handling
        if (error.message.includes('embedding server')) {
            showStatus('Embedding server issue - check if server is running', 'error');
        } else if (error.message.includes('No relevant context')) {
            showStatus('No relevant context found in corpus', 'error');
        } else {
            showStatus(`Process failed: ${error.message}`, 'error');
        }
    }
}

/**
 * Setup info tooltips for similarity options
 */
function setupSimilarityInfoTooltips() {
    const scoringInfo = document.getElementById('scoringInfo');
    const strategyInfo = document.getElementById('strategyInfo');
    
    if (scoringInfo) {
        scoringInfo.addEventListener('click', (e) => {
            e.preventDefault();
            alert(`Advanced Similarity Scoring:

When enabled, the system uses different strategies for each level:
• Documents: Focuses on discourse and functional similarity
• Sections: Balances topical and stylistic similarity  
• Paragraphs: Emphasizes conceptual and terminological similarity

When disabled, uses basic cosine similarity for all levels.`);
        });
    }
    
    if (strategyInfo) {
        strategyInfo.addEventListener('click', (e) => {
            e.preventDefault();
            alert(`Context Strategy Options:

• Balanced: Mixes different types of context for well-rounded translation
• Documents First: Prioritizes document-level context for better discourse understanding
• Paragraphs First: Prioritizes paragraph-level context for better terminology

Recommendation: Use "Balanced" for most translations.`);
        });
    }
}

// =====================================
// RATING SYSTEM SETUP (placeholder for now)
// =====================================

/**
 * Setup rating system (placeholder for future implementation)
 */
function setupRatingSystem() {
    debugLog('Rating system setup - placeholder for future implementation', 'info');
    // Will implement when we add translation functionality
}

/**
 * Submit feedback (placeholder function for the feedback form)
 */
function submitFeedback() {
    showStatus('Feedback system coming soon...', 'success');
    debugLog('Feedback submitted (placeholder)', 'info');
}

// =====================================
// INITIALIZATION (preserving your existing pattern)
// =====================================

/**
 * Initialize the application (matches your existing DOMContentLoaded pattern)
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Pragmatic Auto-Translator initializing...');
    
    try {
        // Setup UI components
        setupLanguageToggle();
        setupTranslateButton();
        setupRatingSystem();
        setupSimilarityInfoTooltips(); // NEW
        
        // Load corpus data
        const corpusLoaded = await loadCorpusData();
        
        if (corpusLoaded) {
            console.log('Initialization complete - ready for similarity search and translation');
        } else {
            console.log('Initialization complete with warnings - some features may not work');
        }
        
    } catch (error) {
        console.error('Initialization failed:', error);
        showStatus('Application initialization failed', 'error');
    }
});

// =====================================
// UTILITY FUNCTIONS (for future modules to use)
// =====================================

/**
 * Get current translation direction
 * @returns {Object} Source and target language codes
 */
export function getCurrentLanguageDirection() {
    return {
        source: currentSourceLang,
        target: currentSourceLang === 'en' ? 'es' : 'en'
    };
}

/**
 * Get loaded vector data (for other modules to access)
 * @returns {Object} Current vectorData
 */
export function getVectorData() {
    return vectorData;
}

/**
 * Get document database (for other modules to access)
 * @returns {Object} Current documentDatabase
 */
export function getDocumentDatabase() {
    return documentDatabase;
}

/**
 * Update translation output (for translation module to use)
 * @param {string} translatedText - Translated text to display
 * @param {Array} contextUsed - Context passages used (optional)
 */
export function updateTranslationOutput(translatedText, contextUsed = []) {
    if (translationOutput) {
        translationOutput.innerHTML = `<p>${translatedText}</p>`;
    }
    
    if (contextUsed.length > 0 && contextInfo) {
        contextInfo.classList.remove('hidden');
        const contextDetails = document.getElementById('contextDetails');
        if (contextDetails) {
            contextDetails.innerHTML = contextUsed.map(context => 
                `<div class="context-item">
                    <strong>${getDocumentTitle(context.document_id, documentDatabase).title}</strong>
                    <p>${context.text.substring(0, 150)}...</p>
                </div>`
            ).join('');
        }
    }
    
    debugLog(`✅ Translation output updated`, 'info');
}

// =====================================
// DEVELOPMENT HELPERS
// =====================================

// Make functions available globally for HTML onclick events
window.submitFeedback = submitFeedback;

// Add embedding test function for debugging
window.testEmbedding = async function() {
    try {
        showStatus('Testing JINA API...', 'loading');
        const status = await getEmbeddingModelStatus();
        showStatus('JINA API test completed', 'success');
        console.log('JINA API status:', status);
        return status;
    } catch (error) {
        showStatus('JINA API test failed', 'error');
        console.error('JINA API test error:', error);
    }
};

// Add function to update API URL for production deployment
window.setJinaApiKey = function(apiKey) {
    setJinaApiKey(apiKey);
    showStatus(`JINA API key set successfully`, 'success');
};

window.storeJinaKey = function(apiKey) {
    storeApiKeyLocally(apiKey);
    showStatus(`JINA API key stored locally`, 'success');
};

// Make key functions available globally for debugging
if (config.DEV.DEBUG) {
    window.PragmaticTranslator = {
        vectorData: () => vectorData,
        documentDatabase: () => documentDatabase,
        currentLanguage: () => currentSourceLang,
        showStatus,
        loadCorpusData,
        submitFeedback,
        // JINA embedding functions (UPDATED)
        embeddingStatus: getEmbeddingModelStatus,
        testEmbedding: window.testEmbedding,
        loadEmbeddingModel: loadEmbeddingModel,
        setJinaApiKey: window.setJinaApiKey,
        storeJinaKey: window.storeJinaKey
    };
    debugLog('Debug helpers attached to window.PragmaticTranslator', 'info');
}