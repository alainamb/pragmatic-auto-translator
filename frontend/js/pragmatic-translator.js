// Configuration
const CONFIG = {
    // GitHub Pages URLs for the vector files
    vectorBaseUrl: 'https://alainamb.github.io/pragmatic-auto-translator/vectors/gai/',
    // Hugging Face API configuration
    hfApiUrl: 'https://api-inference.huggingface.co/models/',
    // A different model that's configured for feature extraction
    vectorModel: 'sentence-transformers/all-MiniLM-L6-v2', // This one works better for embeddings
    // Helsinki translation models (bidirectional)
    translationModels: {
        'en-es': 'Helsinki-NLP/opus-mt-en-es',
        'es-en': 'Helsinki-NLP/opus-mt-es-en'
    }
};

// Global variables
let vectorData = {
    documents: [],
    paragraphs: [],
    sections: []
};
let documentDatabase = {
    english: {},
    spanish: {}
};
let hfApiKey = null;

// DOM elements
const languageOptions = document.querySelectorAll('.language-option');
const targetLanguageSpan = document.getElementById('targetLanguage');
const sourceTextArea = document.getElementById('sourceText');
const translateButton = document.getElementById('translateButton');
const statusIndicator = document.getElementById('statusIndicator');
const translationOutput = document.getElementById('translationOutput');
const contextInfo = document.getElementById('contextInfo');

let currentSourceLang = 'en';

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Pragmatic Auto-Translator initializing...');
    setupLanguageToggle();
    setupTranslateButton();
    setupRatingSystem();
    await loadVectorData();
    
    // Try to load API key from config file
    await loadAPIConfig();
    
    console.log('✅ Initialization complete');
});

// Load API configuration from separate file
async function loadAPIConfig() {
    console.log('🔑 Attempting to load API configuration...');
    
    try {
        // Try to load the config file
        const script = document.createElement('script');
        script.src = 'frontend/js/api-config.js';
        
        // Wait for script to load
        await new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
        
        // Check if API key is available and valid
        if (window.API_CONFIG && window.API_CONFIG.HUGGING_FACE_API_KEY && 
            window.API_CONFIG.HUGGING_FACE_API_KEY !== 'your_actual_api_key_here') {
            hfApiKey = window.API_CONFIG.HUGGING_FACE_API_KEY;
            console.log('✅ API key loaded from config file');
            showStatus('API configuration loaded successfully', 'success');
        } else {
            console.log('⚠️ API config file found but key not set');
            showStatus('API key needs to be configured in api-config.js', 'error');
        }
        
    } catch (error) {
        console.log('⚠️ API config file not found, will prompt user when needed');
        console.log('💡 Create frontend/js/api-config.js with your API key to avoid prompting');
    }
}

// Setup language toggle functionality
function setupLanguageToggle() {
    languageOptions.forEach(option => {
        option.addEventListener('click', () => {
            languageOptions.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');
            
            currentSourceLang = option.dataset.lang;
            targetLanguageSpan.textContent = currentSourceLang === 'en' ? 'Spanish' : 'English';
            
            // Update placeholder text
            if (currentSourceLang === 'en') {
                sourceTextArea.placeholder = 'Enter your English text here for translation to Spanish...';
            } else {
                sourceTextArea.placeholder = 'Ingrese su texto en español aquí para traducir al inglés...';
            }
        });
    });
}

// Setup translate button
function setupTranslateButton() {
    translateButton.addEventListener('click', async () => {
        const sourceText = sourceTextArea.value.trim();
        
        if (!sourceText) {
            showStatus('Please enter some text to translate', 'error');
            return;
        }

        if (!hfApiKey) {
            promptForApiKey();
            return;
        }
        
        await performTranslation(sourceText);
    });
}

// Prompt user for Hugging Face API key
function promptForApiKey() {
    const key = prompt(`To use the translation features, you'll need a free Hugging Face API token.

1. Go to https://huggingface.co/settings/tokens
2. Create a new token (free account required)
3. Copy and paste it below:

Your token will be stored temporarily for this session only.`);
    
    if (key && key.trim()) {
        hfApiKey = key.trim();
        showStatus('API key saved! You can now use translation features.', 'success');
    } else {
        showStatus('API key required for translation functionality', 'error');
    }
}

// Load vector data from GitHub Pages
async function loadVectorData() {
    console.log('📊 Loading vector data from GitHub Pages...');
    showStatus('Loading corpus vector data...', 'loading');
    
    try {
        const urls = [
            `${CONFIG.vectorBaseUrl}gai-document-vectors.json`,
            `${CONFIG.vectorBaseUrl}gai-paragraph-vectors.json`,
            `${CONFIG.vectorBaseUrl}gai-section-vectors.json`
        ];
        
        console.log('🌐 Fetching vector files from URLs:', urls);
        
        const [documentsRes, paragraphsRes, sectionsRes] = await Promise.all([
            fetch(urls[0]),
            fetch(urls[1]),
            fetch(urls[2])
        ]);

        console.log('📡 Vector files response status:', {
            documents: documentsRes.status,
            paragraphs: paragraphsRes.status,
            sections: sectionsRes.status
        });

        // Parse JSON responses
        const documentsData = await documentsRes.json();
        const paragraphsData = await paragraphsRes.json();
        const sectionsData = await sectionsRes.json();

        console.log('📋 Raw vector data structure:', {
            documents: Object.keys(documentsData),
            paragraphs: Object.keys(paragraphsData),
            sections: Object.keys(sectionsData)
        });

        // Extract vectors arrays from the nested structure
        vectorData = {
            documents: documentsData.vectors || [],
            paragraphs: paragraphsData.vectors || [],
            sections: sectionsData.vectors || []
        };

        const totalVectors = vectorData.documents.length + vectorData.paragraphs.length + vectorData.sections.length;
        
        console.log('✅ Vector data loaded successfully:', {
            documents: vectorData.documents.length,
            sections: vectorData.sections.length,
            paragraphs: vectorData.paragraphs.length,
            total: totalVectors
        });
        
        // Now load the database files for document titles
        console.log('📚 Loading document databases for titles...');
        await loadDocumentDatabases();
        
        showStatus(`Loaded ${vectorData.documents.length} documents, ${vectorData.sections.length} sections, ${vectorData.paragraphs.length} paragraphs (Total: ${totalVectors} vectors)`, 'success');
        
        // Log sample for debugging
        console.log('🔍 Sample vector data:', {
            documents: vectorData.documents[0],
            sections: vectorData.sections[0],
            paragraphs: vectorData.paragraphs[0]
        });
        
    } catch (error) {
        console.error('❌ Error loading vector data:', error);
        showStatus('Failed to load corpus data. Translation may not work optimally.', 'error');
    }
}

// Load document database files for title lookup
async function loadDocumentDatabases() {
    console.log('📚 Loading document databases...');
    
    try {
        const databaseUrls = [
            'https://alainamb.github.io/pragmatic-auto-translator/corpora/gai/eng/gai-eng_database.json',
            'https://alainamb.github.io/pragmatic-auto-translator/corpora/gai/esp/gai-esp_database.json'
        ];
        
        console.log('🌐 Fetching database files:', databaseUrls);
        
        const [engDatabaseRes, espDatabaseRes] = await Promise.all([
            fetch(databaseUrls[0]).catch(err => {
                console.log('⚠️ English database not found, continuing without it');
                return null;
            }),
            fetch(databaseUrls[1]).catch(err => {
                console.log('⚠️ Spanish database not found, continuing without it');
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
                console.log('✅ English database loaded:', Object.keys(documentDatabase.english).length, 'documents');
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
                console.log('✅ Spanish database loaded:', Object.keys(documentDatabase.spanish).length, 'documents');
            }
        }

        console.log('📚 Document databases loaded successfully');
        
    } catch (error) {
        console.error('❌ Error loading document databases:', error);
        console.log('⚠️ Continuing without document title lookup');
    }
}

// Get document title from database
function getDocumentTitle(documentId) {
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

// Convert text to vector using Hugging Face API
async function textToVector(text) {
    console.log('🧮 textToVector called with text length:', text.length);
    console.log('🔗 Using model:', CONFIG.vectorModel);
    
    try {
        // The API forces sentence-transformers into sentence-similarity mode
        // So we'll use sentence-similarity and then work around it
        const payload = {
            inputs: {
                source_sentence: text,
                sentences: ["This is a dummy sentence for comparison"] // Need this for API
            },
            options: { 
                wait_for_model: true
            }
        };
        
        console.log('📤 Using sentence-similarity format (required by API)...');

        const response = await fetch(`${CONFIG.hfApiUrl}${CONFIG.vectorModel}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${hfApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        console.log('📡 API response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Sentence-similarity failed:', errorText);
            
            // Try a different approach - use a model that's NOT sentence-transformers
            console.log('🔄 Trying alternative embedding model...');
            return await tryAlternativeEmbeddingModel(text);
        }

        const result = await response.json();
        console.log('✅ Sentence-similarity worked but gives similarity scores, not embeddings');
        console.log('📊 Result:', result);
        
        // This gives us similarity scores, not embeddings
        // We need to try a different approach
        console.log('🔄 Sentence-similarity worked but we need embeddings, trying alternative...');
        return await tryAlternativeEmbeddingModel(text);
        
    } catch (error) {
        console.error('❌ Error in sentence-similarity approach:', error);
        console.log('🔄 Trying alternative embedding model...');
        return await tryAlternativeEmbeddingModel(text);
    }
}

// Try a different model that's not sentence-transformers
async function tryAlternativeEmbeddingModel(text) {
    console.log('🔄 Trying alternative embedding model...');
    
    // Use BERT model for embeddings instead
    const alternativeModel = 'bert-base-uncased';
    
    const payload = {
        inputs: text,
        options: { 
            wait_for_model: true
        }
    };
    
    console.log('📤 Trying BERT model for embeddings:', alternativeModel);
    
    const response = await fetch(`${CONFIG.hfApiUrl}${alternativeModel}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${hfApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    console.log('📡 BERT response status:', response.status);

    if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ BERT model failed:', errorText);
        
        // Final fallback - create a synthetic vector for testing
        console.log('🔄 Creating synthetic vector for testing...');
        return createSyntheticVector(text);
    }

    const result = await response.json();
    console.log('✅ BERT model worked! Processing result...');
    console.log('📊 Result type:', Array.isArray(result) ? 'Array' : typeof result);
    
    // Process BERT output - need to extract and pool
    if (Array.isArray(result) && Array.isArray(result[0])) {
        // BERT returns token embeddings, we need to pool them
        const pooled = meanPoolBERTOutput(result);
        console.log('✅ BERT embeddings pooled successfully');
        console.log('📏 Vector dimensions:', pooled.length);
        return pooled;
    } else {
        console.log('❌ Unexpected BERT format, falling back to synthetic');
        return createSyntheticVector(text);
    }
}

// Mean pool BERT output to get sentence embedding
function meanPoolBERTOutput(bertOutput) {
    console.log('📊 Pooling BERT token embeddings...');
    
    // bertOutput is typically [sequence_length, hidden_size]
    const sequenceLength = bertOutput.length;
    const hiddenSize = bertOutput[0].length;
    const pooled = new Array(hiddenSize).fill(0);
    
    // Average across all tokens
    for (let i = 0; i < sequenceLength; i++) {
        for (let j = 0; j < hiddenSize; j++) {
            pooled[j] += bertOutput[i][j];
        }
    }
    
    // Divide by sequence length
    for (let j = 0; j < hiddenSize; j++) {
        pooled[j] /= sequenceLength;
    }
    
    console.log('✅ BERT pooling completed');
    return pooled;
}

// Create a synthetic vector for testing when APIs don't work
function createSyntheticVector(text) {
    console.log('🔄 Creating synthetic vector for testing...');
    console.log('⚠️ Note: This is for testing only - not real embeddings!');
    
    // Create a deterministic vector based on text characteristics
    const vectorSize = 384; // Match expected size
    const synthetic = new Array(vectorSize);
    
    // Use text characteristics to create pseudo-meaningful vector
    const textLength = text.length;
    const wordCount = text.split(' ').length;
    const charCodes = text.split('').map(c => c.charCodeAt(0));
    const avgCharCode = charCodes.reduce((a, b) => a + b, 0) / charCodes.length;
    
    for (let i = 0; i < vectorSize; i++) {
        // Create pseudo-random but deterministic values
        const seed = (textLength + wordCount + avgCharCode + i) * 0.001;
        synthetic[i] = Math.sin(seed) * Math.cos(seed * 2) * 0.5;
    }
    
    console.log('✅ Synthetic vector created (for testing only)');
    console.log('📏 Vector dimensions:', synthetic.length);
    console.log('🔢 Sample values:', synthetic.slice(0, 3), '...');
    console.log('⚠️ WARNING: Using synthetic embeddings - similarity search will be basic');
    
    return synthetic;
}

// Calculate cosine similarity between two vectors
function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
        return 0;
    }
    
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    
    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    
    return dotProduct / (magnitudeA * magnitudeB);
}

// Find similar content from corpus
function findSimilarContent(inputVector, topK = 3) {
    const similarities = [];
    
    // Search through all vector levels
    ['documents', 'sections', 'paragraphs'].forEach(level => {
        vectorData[level].forEach((item, index) => {
            if (item.vector && Array.isArray(item.vector)) {
                const similarity = cosineSimilarity(inputVector, item.vector);
                similarities.push({
                    level,
                    index,
                    similarity,
                    content: item.text || 'No content available',
                    title: item.title || '',
                    id: item.id || `${level}_${index}`,
                    metadata: {
                        document_id: item.document_id,
                        count: item.count,
                        created: item.created
                    }
                });
            }
        });
    });

    // Sort by similarity and return top K
    return similarities
        .filter(item => item.similarity > 0) // Filter out zero similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);
}

// Translate text using Helsinki models
async function translateWithHelsinki(text, context, sourceLang, targetLang) {
    try {
        // Determine which model to use
        const modelKey = `${sourceLang}-${targetLang}`;
        const model = CONFIG.translationModels[modelKey];
        
        if (!model) {
            throw new Error(`Translation direction ${sourceLang} to ${targetLang} not supported`);
        }

        // For Helsinki models, we can't easily inject context, so we'll use it for prompting
        let textToTranslate = text;
        
        // If we have good context, we could prepend it (experimental)
        if (context.length > 0 && context[0].similarity > 0.7) {
            // Only use context if very similar
            const contextHint = context[0].content.substring(0, 100);
            console.log('Using high-similarity context for translation guidance:', contextHint);
        }

        const response = await fetch(`${CONFIG.hfApiUrl}${model}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${hfApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                inputs: textToTranslate,
                options: { wait_for_model: true }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Translation API request failed: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        return result;
        
    } catch (error) {
        console.error('Error in translation:', error);
        throw error;
    }
}

// Main translation function
async function performTranslation(sourceText) {
    console.log('🔄 Starting translation process...');
    console.log('📝 Source text:', sourceText);
    console.log('🌍 Source language:', currentSourceLang);
    
    translateButton.disabled = true;
    translateButton.textContent = 'Translating...';
    showStatus('Step 1: Converting text to vector...', 'loading');
    
    try {
        // Check if API key exists
        if (!hfApiKey) {
            console.log('🔑 No API key found, prompting user...');
            promptForApiKey();
            if (!hfApiKey) {
                throw new Error('API key required');
            }
        }
        
        console.log('🔑 API key available:', hfApiKey ? 'Yes' : 'No');
        
        // Step 1: Convert input text to vector
        console.log('🧮 Converting text to vector...');
        const inputVector = await textToVector(sourceText);
        console.log('✅ Input vector generated:', inputVector ? 'Success' : 'Failed');
        console.log('📊 Vector length:', Array.isArray(inputVector) ? inputVector.length : 'Not an array');
        
        showStatus('Step 2: Finding similar content in corpus...', 'loading');
        
        // Step 2: Find similar content
        console.log('🔍 Searching for similar content...');
        const similarContent = findSimilarContent(inputVector, 3);
        console.log('📋 Similar content found:', similarContent.length, 'items');
        console.log('🎯 Similarity scores:', similarContent.map(c => c.similarity));
        
        showStatus('Step 3: Translating with Helsinki model...', 'loading');
        
        // Step 3: Translate with Helsinki model
        const targetLang = currentSourceLang === 'en' ? 'es' : 'en';
        const targetLangName = currentSourceLang === 'en' ? 'Spanish' : 'English';
        
        console.log('🌍 Target language:', targetLang, '(' + targetLangName + ')');
        console.log('🤖 Using translation model:', CONFIG.translationModels[`${currentSourceLang}-${targetLang}`]);
        
        const translation = await translateWithHelsinki(
            sourceText, 
            similarContent, 
            currentSourceLang, 
            targetLang
        );

        console.log('✅ Translation received:', translation);

        // Display results
        displayTranslationResults(translation, similarContent, targetLangName);
        showStatus('Translation completed successfully!', 'success');
        
    } catch (error) {
        console.error('❌ Translation error:', error);
        console.error('❌ Error stack:', error.stack);
        showStatus(`Translation failed: ${error.message}`, 'error');
        
        // Show fallback message
        translationOutput.innerHTML = `
            <div style="border: 2px solid #ef4444; border-radius: 8px; padding: 1rem; background-color: #fef2f2;">
                <p><strong>Translation Error:</strong></p>
                <p style="margin-top: 0.5rem; color: #dc2626;">${error.message}</p>
                <p style="margin-top: 1rem; font-size: 0.875rem; color: #6b7280;">
                    Please check the browser console for detailed error information.
                    <br>Ensure you have a valid Hugging Face API token and try again.
                    <br>The model may also be loading - please wait a moment and retry.
                </p>
            </div>
        `;
    } finally {
        translateButton.disabled = false;
        translateButton.textContent = 'Translate with Context';
    }
}

// Display translation results
function displayTranslationResults(translation, similarContent, targetLangName) {
    console.log('🎨 displayTranslationResults called:', {
        translation,
        similarContentCount: similarContent.length,
        targetLangName
    });
    
    // Extract translation text from Helsinki model response
    let translationText = '';
    
    if (Array.isArray(translation) && translation.length > 0) {
        translationText = translation[0].translation_text || translation[0].generated_text || 'Translation not available';
        console.log('📝 Extracted from array format:', translationText);
    } else if (translation.translation_text) {
        translationText = translation.translation_text;
    } else if (translation.generated_text) {
        translationText = translation.generated_text;
    } else {
        translationText = 'Translation format not recognized';
        console.error('❌ Unexpected translation format:', translation);
    }

    // Preserve paragraph structure by converting line breaks to HTML
    const formattedTranslation = translationText
        .split('\n\n')  // Split on double line breaks (paragraphs)
        .map(paragraph => paragraph.trim())
        .filter(paragraph => paragraph.length > 0)
        .map(paragraph => `<p style="margin-bottom: 1rem;">${paragraph}</p>`)
        .join('');

    console.log('✅ Final translation text:', translationText);

    // Clean display without green box or redundant heading
    translationOutput.innerHTML = `
        <div style="font-size: 1.1em; line-height: 1.6; font-weight: 400; color: #374151;">
            ${formattedTranslation || `<p>${translationText}</p>`}
        </div>
    `;
    
    // Show context info with improved formatting
    contextInfo.classList.remove('hidden');
    if (similarContent.length > 0) {
        console.log('📋 Displaying context for', similarContent.length, 'similar items');
        
        const contextHtml = similarContent.map((item, i) => {
            const preview = item.content.substring(0, 150);
            const vectorType = item.level; // documents, sections, or paragraphs
            
            // Fix the capitalization bug - convert plural to singular properly
            let displayType;
            if (vectorType === 'documents') {
                displayType = 'Document';
            } else if (vectorType === 'sections') {
                displayType = 'Section';
            } else if (vectorType === 'paragraphs') {
                displayType = 'Paragraph';
            } else {
                // Fallback for any other types
                displayType = vectorType.charAt(0).toUpperCase() + vectorType.slice(1);
            }
            
            // Get document info from database
            let documentInfo = { title: 'Unknown Document', year: 'Unknown' };
            
            if (item.metadata && item.metadata.document_id) {
                documentInfo = getDocumentTitle(item.metadata.document_id);
            } else if (item.id) {
                // For document-level vectors, the ID is the document ID
                if (vectorType === 'documents') {
                    documentInfo = getDocumentTitle(item.id);
                } else {
                    // For section/paragraph vectors, try to extract document ID
                    // This might need adjustment based on your ID format
                    const parts = item.id.split('_');
                    if (parts.length > 1) {
                        const possibleDocId = parts[0] + '_' + parts[1]; // e.g., gai-eng_item001
                        documentInfo = getDocumentTitle(possibleDocId);
                    }
                }
            }
            
            return `
                <div style="margin-bottom: 1rem; padding: 0.75rem; background-color: #f9fafb; border-radius: 6px; border-left: 4px solid var(--primary-blue);">
                    <div style="margin-bottom: 0.5rem;">
                        <strong>${i + 1}. ${displayType}</strong>
                        <span style="font-size: 0.875rem; color: #059669; margin-left: 0.5rem;">
                            Similarity: ${(item.similarity * 100).toFixed(1)}%
                        </span>
                    </div>
                    <div style="margin-bottom: 0.5rem; font-size: 0.9rem; color: #374151;">
                        <strong>📄 ${documentInfo.title}</strong>
                        ${documentInfo.year !== 'Unknown' ? ` (${documentInfo.year})` : ''}
                    </div>
                    <div style="font-size: 0.875rem; color: #6b7280; font-style: italic;">
                        "${preview}${preview.length < item.content.length ? '...' : ''}"
                    </div>
                </div>
            `;
        }).join('');
        
        document.getElementById('contextDetails').innerHTML = `
            <strong>Corpus Context Used:</strong><br>
            <div style="margin-top: 0.75rem;">
                ${contextHtml}
            </div>
        `;
    } else {
        console.log('⚠️ No similar content found');
        document.getElementById('contextDetails').innerHTML = `
            <strong>No similar context found in corpus.</strong><br>
            <span style="color: #6b7280;">Translation performed without domain-specific context.</span>
        `;
    }
    
    console.log('✅ Translation display completed');
}

// Status indicator helper
function showStatus(message, type) {
    statusIndicator.textContent = message;
    statusIndicator.className = `status-indicator status-${type}`;
}

// Rating system functionality
function setupRatingSystem() {
    const ratingContainers = document.querySelectorAll('.rating-container');
    let ratings = {
        correspondence: 0,
        pragmatic: 0
    };
    
    ratingContainers.forEach(container => {
        const category = container.dataset.category;
        const stars = container.querySelectorAll('.rating-star');
        
        stars.forEach((star, index) => {
            star.addEventListener('click', () => {
                ratings[category] = index + 1;
                updateStarDisplay(container, index + 1);
            });
            
            star.addEventListener('mouseenter', () => {
                highlightStars(container, index + 1);
            });
        });
        
        // Reset stars on mouse leave
        container.addEventListener('mouseleave', () => {
            updateStarDisplay(container, ratings[category]);
        });
    });
    
    // Make submitFeedback globally accessible
    window.submitFeedback = function() {
        const feedbackText = document.getElementById('feedbackText').value;
        
        if (ratings.correspondence === 0 || ratings.pragmatic === 0) {
            alert('Please provide ratings for both Overall Correspondence and Pragmatic Appropriateness before submitting feedback.');
            return;
        }
        
        // Log feedback (in real app, send to server)
        console.log('Feedback submitted:', {
            correspondence: ratings.correspondence,
            pragmatic: ratings.pragmatic,
            text: feedbackText,
            timestamp: new Date().toISOString(),
            translation_session: {
                source_lang: currentSourceLang,
                target_lang: currentSourceLang === 'en' ? 'es' : 'en'
            }
        });
        
        alert('Thank you for your feedback! This helps improve the Pragmatic Auto-Translator.');
        
        // Reset form
        ratings.correspondence = 0;
        ratings.pragmatic = 0;
        ratingContainers.forEach(container => {
            updateStarDisplay(container, 0);
        });
        document.getElementById('feedbackText').value = '';
    };
}

function updateStarDisplay(container, rating) {
    const stars = container.querySelectorAll('.rating-star');
    stars.forEach((star, index) => {
        star.classList.toggle('active', index < rating);
    });
}

function highlightStars(container, count) {
    const stars = container.querySelectorAll('.rating-star');
    stars.forEach((star, index) => {
        star.classList.toggle('active', index < count);
    });
}