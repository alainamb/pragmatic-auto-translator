// Configuration
const CONFIG = {
    // GitHub Pages URLs for your vector files
    vectorBaseUrl: 'https://alainamb.github.io/pragmatic-auto-translator/vectors/gai/',
    // Hugging Face API configuration
    hfApiUrl: 'https://api-inference.huggingface.co/models/',
    vectorModel: 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2',
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
    setupLanguageToggle();
    setupTranslateButton();
    setupRatingSystem();
    await loadVectorData();
    promptForApiKey();
});

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
    showStatus('Loading corpus vector data...', 'loading');
    
    try {
        const [documentsRes, paragraphsRes, sectionsRes] = await Promise.all([
            fetch(`${CONFIG.vectorBaseUrl}gai-document-vectors.json`),
            fetch(`${CONFIG.vectorBaseUrl}gai-paragraph-vectors.json`),
            fetch(`${CONFIG.vectorBaseUrl}gai-section-vectors.json`)
        ]);

        // Parse JSON responses
        const documentsData = await documentsRes.json();
        const paragraphsData = await paragraphsRes.json();
        const sectionsData = await sectionsRes.json();

        // Extract vectors arrays from the nested structure
        vectorData = {
            documents: documentsData.vectors || [],
            paragraphs: paragraphsData.vectors || [],
            sections: sectionsData.vectors || []
        };

        const totalVectors = vectorData.documents.length + vectorData.paragraphs.length + vectorData.sections.length;
        showStatus(`Loaded ${vectorData.documents.length} documents, ${vectorData.sections.length} sections, ${vectorData.paragraphs.length} paragraphs (Total: ${totalVectors} vectors)`, 'success');
        
        // Log sample for debugging
        console.log('Sample vector data:', {
            documents: vectorData.documents[0],
            sections: vectorData.sections[0],
            paragraphs: vectorData.paragraphs[0]
        });
        
    } catch (error) {
        console.error('Error loading vector data:', error);
        showStatus('Failed to load corpus data. Translation may not work optimally.', 'error');
    }
}

// Convert text to vector using Hugging Face API
async function textToVector(text) {
    try {
        const response = await fetch(`${CONFIG.hfApiUrl}${CONFIG.vectorModel}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${hfApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                inputs: text,
                options: { wait_for_model: true }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API request failed: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        
        // Handle different response formats
        if (Array.isArray(result) && result.length > 0) {
            return result[0]; // First result is usually the vector
        } else if (result.embeddings) {
            return result.embeddings[0];
        } else {
            return result;
        }
        
    } catch (error) {
        console.error('Error generating vector:', error);
        throw error;
    }
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
    translateButton.disabled = true;
    translateButton.textContent = 'Translating...';
    showStatus('Step 1: Converting text to vector...', 'loading');
    
    try {
        // Step 1: Convert input text to vector
        const inputVector = await textToVector(sourceText);
        showStatus('Step 2: Finding similar content in corpus...', 'loading');
        
        // Step 2: Find similar content
        const similarContent = findSimilarContent(inputVector, 3);
        
        console.log('Found similar content:', similarContent);
        
        showStatus('Step 3: Translating with Helsinki model...', 'loading');
        
        // Step 3: Translate with Helsinki model
        const targetLang = currentSourceLang === 'en' ? 'es' : 'en';
        const targetLangName = currentSourceLang === 'en' ? 'Spanish' : 'English';
        
        const translation = await translateWithHelsinki(
            sourceText, 
            similarContent, 
            currentSourceLang, 
            targetLang
        );

        // Display results
        displayTranslationResults(translation, similarContent, targetLangName);
        showStatus('Translation completed successfully!', 'success');
        
    } catch (error) {
        console.error('Translation error:', error);
        showStatus(`Translation failed: ${error.message}`, 'error');
        
        // Show fallback message
        translationOutput.innerHTML = `
            <div style="border: 2px solid #ef4444; border-radius: 8px; padding: 1rem; background-color: #fef2f2;">
                <p><strong>Translation Error:</strong></p>
                <p style="margin-top: 0.5rem; color: #dc2626;">${error.message}</p>
                <p style="margin-top: 1rem; font-size: 0.875rem; color: #6b7280;">
                    Please ensure you have a valid Hugging Face API token and try again.
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
    // Extract translation text from Helsinki model response
    let translationText = '';
    
    if (Array.isArray(translation) && translation.length > 0) {
        translationText = translation[0].translation_text || translation[0].generated_text || 'Translation not available';
    } else if (translation.translation_text) {
        translationText = translation.translation_text;
    } else if (translation.generated_text) {
        translationText = translation.generated_text;
    } else {
        translationText = 'Translation format not recognized';
        console.log('Unexpected translation format:', translation);
    }

    translationOutput.innerHTML = `
        <div style="border: 2px solid var(--primary-green); border-radius: 8px; padding: 1rem; background-color: #f0fdf4;">
            <p><strong>Translation to ${targetLangName}:</strong></p>
            <p style="font-size: 1.1em; line-height: 1.6; margin-top: 1rem; font-weight: 500;">
                ${translationText}
            </p>
        </div>
    `;
    
    // Show context info
    contextInfo.classList.remove('hidden');
    if (similarContent.length > 0) {
        const contextHtml = similarContent.map((item, i) => {
            const preview = item.content.substring(0, 150);
            const titleInfo = item.title ? ` - "${item.title}"` : '';
            return `
                <div style="margin-bottom: 0.75rem; padding: 0.5rem; background-color: #f9fafb; border-radius: 4px;">
                    <strong>${i + 1}. ${item.level}${titleInfo}</strong><br>
                    <span style="font-size: 0.875rem; color: #059669;">Similarity: ${(item.similarity * 100).toFixed(1)}%</span><br>
                    <span style="font-size: 0.875rem; color: #6b7280;">"${preview}${preview.length < item.content.length ? '...' : ''}"</span>
                </div>
            `;
        }).join('');
        
        document.getElementById('contextDetails').innerHTML = `
            <strong>Corpus Context Used:</strong><br>
            <div style="margin-top: 0.5rem;">
                ${contextHtml}
            </div>
        `;
    } else {
        document.getElementById('contextDetails').innerHTML = `
            <strong>No similar context found in corpus.</strong><br>
            <span style="color: #6b7280;">Translation performed without domain-specific context.</span>
        `;
    }
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