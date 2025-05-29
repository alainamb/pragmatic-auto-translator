# config.py
# Configuration file for the Auto-Translator Vectorization System
# This file contains all the settings and paths used by create_vectors.py

# ==============================================================================
# DOMAIN AND LANGUAGE SETTINGS
# ==============================================================================

# Domain to process (change this to work with different subject areas)
# Options: 'gai', 'climate', 'immigration', etc.
DOMAIN = 'gai'

# Languages to process in this domain
# The script will look for folders with these names under your domain
LANGUAGES = ['eng', 'esp']

# ==============================================================================
# FILE PATHS AND FOLDER STRUCTURE
# ==============================================================================

# Base directory structure (relative to where you run the script)
BASE_DIR = '..'  # Go up one level from scripts/ folder
CORPORA_DIR = f'{BASE_DIR}/corpora/{DOMAIN}'    # Where your JSON files are stored
VECTORS_DIR = f'{BASE_DIR}/vectors/{DOMAIN}'    # Where to save generated vectors

# ==============================================================================
# VECTORIZATION MODEL SETTINGS
# ==============================================================================

# Cross-lingual model for creating embeddings
# This model can handle both English and Spanish text in the same vector space
MODEL_NAME = 'paraphrase-multilingual-MiniLM-L12-v2'

# Maximum text length for processing (in characters)
# Longer texts will be truncated to prevent memory issues
MAX_TEXT_LENGTH = 8000

# ==============================================================================
# VECTOR GRANULARITY SETTINGS
# ==============================================================================

# Which types of vectors to create (set to False to skip)
CREATE_DOCUMENT_VECTORS = True    # Whole document vectors
CREATE_SECTION_VECTORS = True     # Section-level vectors  
CREATE_PARAGRAPH_VECTORS = True   # Paragraph-level vectors

# ==============================================================================
# OUTPUT FILE SETTINGS
# ==============================================================================

# Names for the generated vector files
DOCUMENT_VECTORS_FILE = 'document_vectors.json'
SECTION_VECTORS_FILE = 'section_vectors.json'
PARAGRAPH_VECTORS_FILE = 'paragraph_vectors.json'

# Combined JavaScript file for web visualization
VECTOR_DATA_JS_FILE = 'vector_data.js'

# ==============================================================================
# PROCESSING SETTINGS
# ==============================================================================

# Show progress bars during processing
SHOW_PROGRESS = True

# Print detailed information during processing
VERBOSE = True

# Maximum number of documents to process (useful for testing)
# Set to None to process all documents
MAX_DOCUMENTS = None  # Change to 3 for testing with just 3 documents

# ==============================================================================
# STUDENT CUSTOMIZATION SECTION
# ==============================================================================

# Instructions:
# 1. Change DOMAIN to match your chosen subject area
# 2. Update LANGUAGES if you're working with different language pairs
# 3. Adjust MAX_DOCUMENTS to a small number (like 3) when testing
# 4. Set any of the CREATE_*_VECTORS to False if you want to skip that level