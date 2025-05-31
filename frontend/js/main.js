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
  testEmbeddingModel,
  setCustomAPIUrl 
} from './embedding-custom.js';

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
 * Handle the complete translation process
 */
async function handleTranslation() {
    const sourceText = sourceTextArea?.value.trim();
    
    if (!sourceText) {
        showStatus('Please enter some text to translate', 'error');
        return;
    }
    
    try {
        // Step 1: Ensure custom API is ready (checks health)
        const isReady = await isEmbeddingModelReady();
        if (!isReady) {
            showStatus('Checking custom embedding API...', 'loading');
            await loadEmbeddingModel();
            showStatus('Custom embedding API ready', 'success');
        }
        
        // Step 2: Create embedding for user input
        showStatus('Creating embedding via custom API...', 'loading');
        const userEmbedding = await createUserInputEmbedding(sourceText);
        
        showStatus('Text converted to vector successfully', 'success');
        debugLog(`Created custom embedding for user text (${userEmbedding.dimension} dimensions)`, 'info');
        
        // Show debug info about the embedding if DEBUG is on
        if (config.DEV.DEBUG && translationOutput) {
            const apiStatus = await getEmbeddingModelStatus();
            translationOutput.innerHTML = `
                <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; font-family: monospace;">
                    <h4>Custom API Embedding Created Successfully:</h4>
                    <p><strong>Original text:</strong> "${userEmbedding.originalText}"</p>
                    <p><strong>Preprocessed:</strong> "${userEmbedding.preprocessedText}"</p>
                    <p><strong>Vector dimensions:</strong> ${userEmbedding.dimension}</p>
                    <p><strong>Model used:</strong> ${userEmbedding.model}</p>
                    <p><strong>API type:</strong> ${userEmbedding.apiType}</p>
                    <p><strong>First 5 vector values:</strong> [${userEmbedding.embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]</p>
                    <p><strong>API status:</strong> ${JSON.stringify(apiStatus, null, 2)}</p>
                    <p style="color: #28a745; margin-top: 10px;"><strong>✅ Ready for similarity search module!</strong></p>
                </div>
            `;
        }
        
    } catch (error) {
        console.error('Translation process failed:', error);
        
        // More specific error handling for custom API issues
        if (error.message.includes('Custom embedding server is starting up')) {
            showStatus('Server starting up - please try again in a moment', 'error');
        } else if (error.message.includes('not available or healthy')) {
            showStatus('Custom embedding server not available - check if server is running', 'error');
        } else {
            showStatus(`Translation failed: ${error.message}`, 'error');
        }
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
    console.log('Pragmatic Auto-Translator initializing with modular approach...');
    
    try {
        // Setup UI components
        setupLanguageToggle();
        setupTranslateButton();
        setupRatingSystem();
        
        // Load corpus data
        const corpusLoaded = await loadCorpusData();
        
        if (corpusLoaded) {
            console.log('Initialization complete - ready for translation features');
            
            // Optional: Preload embedding model in background (uncomment to enable)
            // This will slow initial load but make first translation faster
            /*
            setTimeout(async () => {
                try {
                    showStatus('Preloading translation model...', 'loading');
                    await loadEmbeddingModel();
                    showStatus('Translation model ready', 'success');
                } catch (error) {
                    debugLog('Failed to preload embedding model', 'warn');
                }
            }, 2000);
            */
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
        showStatus('Testing custom embedding API...', 'loading');
        const results = await testEmbeddingModel();
        showStatus('Custom embedding API test completed successfully', 'success');
        console.log('Custom embedding test results:', results);
        return results;
    } catch (error) {
        showStatus('Custom embedding API test failed', 'error');
        console.error('Custom embedding test error:', error);
    }
};

// Add function to update API URL for production deployment
window.setEmbeddingURL = function(url) {
    setCustomAPIUrl(url);
    showStatus(`Updated embedding API URL to: ${url}`, 'success');
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
        // Custom embedding functions
        embeddingStatus: getEmbeddingModelStatus,
        testEmbedding: window.testEmbedding,
        loadEmbeddingModel: loadEmbeddingModel,
        setEmbeddingURL: window.setEmbeddingURL
    };
    debugLog('Debug helpers attached to window.PragmaticTranslator', 'info');
}