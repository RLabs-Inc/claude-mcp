import { v4 as uuidv4 } from 'uuid';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pipeline } from '@xenova/transformers';
import * as hnswlib from 'hnswlib-node';
import { logger } from './logger';
import { config } from './config';

/**
 * Vector store for semantic search of documentation
 * 
 * Uses sentence transformers to embed text and HNSW for efficient similarity search
 */

// Document structure for indexed content
export interface IndexedDocument {
  id: string;
  framework: string;
  version: string;
  path: string;
  title: string;
  content: string;
  url?: string;
  embedding?: number[];
  createdAt: number;
}

// Search result structure
export interface SearchResult {
  id: string;
  framework: string;
  version: string;
  path: string;
  title: string;
  url?: string;
  snippet: string;
  score: number;
}

// Statistics for the vector store
export interface VectorStoreStats {
  totalDocuments: number;
  frameworks: string[];
  versions: Record<string, string[]>;
  lastUpdated: number;
}

/**
 * Vector store using HNSW for efficient similarity search
 */
export class VectorStore {
  // Index configuration
  private readonly dimensions = 384; // Default for all-MiniLM-L6
  private readonly maxElements = 100000;
  private readonly efConstruction = 200;
  private readonly M = 16;
  
  // Path configuration
  private readonly dataDir: string;
  private readonly indexPath: string;
  private readonly metadataPath: string;
  private readonly embeddingModelName = 'Xenova/all-MiniLM-L6-v2';
  
  // Internal state
  private documents: Map<string, IndexedDocument> = new Map();
  private vectorIndex: hnswlib.HierarchicalNSW | null = null;
  private embedder: any = null;
  private stats: VectorStoreStats = {
    totalDocuments: 0,
    frameworks: [],
    versions: {},
    lastUpdated: 0
  };
  private initialized = false;
  private initializing = false;
  private idToIndex: Map<string, number> = new Map();
  private indexToId: Map<number, string> = new Map();
  private currentIndex = 0;

  constructor() {
    this.dataDir = join(config.DOCS_STORAGE_PATH || './docs', 'vector-store');
    this.indexPath = join(this.dataDir, 'vector-index.bin');
    this.metadataPath = join(this.dataDir, 'metadata.json');
  }

  /**
   * Initialize the vector store and load data
   */
  async initialize(): Promise<void> {
    if (this.initialized || this.initializing) return;
    
    this.initializing = true;
    logger.info('Initializing vector store...');
    
    try {
      // Create data directory if it doesn't exist
      if (!existsSync(this.dataDir)) {
        await mkdir(this.dataDir, { recursive: true });
        logger.info(`Created vector store directory at ${this.dataDir}`);
      }
      
      // Initialize the embedder
      logger.info(`Loading embedding model ${this.embeddingModelName}...`);
      this.embedder = await pipeline('feature-extraction', this.embeddingModelName, {
        quantized: false
      });
      logger.info('Embedding model loaded successfully');
      
      // Create or load the vector index
      let needsRebuild = false;
      
      if (existsSync(this.indexPath)) {
        await this.loadIndex();
      } else {
        this.createNewIndex();
        needsRebuild = true;
      }
      
      // Load document metadata
      if (existsSync(this.metadataPath)) {
        await this.loadMetadata();
        
        // Check if we need to regenerate embeddings
        const currentCount = this.vectorIndex?.getCurrentCount() || 0;
        if (currentCount === 0 && this.documents.size > 0) {
          logger.warn(`Vector index is empty but ${this.documents.size} documents exist, regenerating embeddings`);
          needsRebuild = true;
        }
      }
      
      // If the vector index doesn't match the document count, rebuild it
      if (needsRebuild && this.documents.size > 0) {
        logger.info('Rebuilding vector index with existing documents...');
        await this.rebuildIndex();
      }
      
      this.initialized = true;
      this.initializing = false;
      logger.info(`Vector store initialized with ${this.documents.size} documents`);
    } catch (error) {
      this.initializing = false;
      logger.error('Failed to initialize vector store', { error: error.message });
      throw error;
    }
  }

  /**
   * Create a new vector index
   */
  private createNewIndex(): void {
    logger.info('Creating new vector index');
    this.vectorIndex = new hnswlib.HierarchicalNSW('cosine', this.dimensions);
    this.vectorIndex.initIndex(this.maxElements, this.M, this.efConstruction);
    this.idToIndex = new Map();
    this.indexToId = new Map();
    this.currentIndex = 0;
  }

  /**
   * Load the vector index from disk
   */
  private async loadIndex(): Promise<void> {
    try {
      logger.info(`Loading vector index from ${this.indexPath}`);
      this.vectorIndex = new hnswlib.HierarchicalNSW('cosine', this.dimensions);
      this.vectorIndex.readIndex(this.indexPath);
      
      // Get the current element count
      const currentCount = this.vectorIndex.getCurrentCount();
      logger.info(`Vector index loaded with ${currentCount} vectors`);
      
      // Load the ID to index mapping
      const mappingPath = join(this.dataDir, 'id-mapping.json');
      if (existsSync(mappingPath)) {
        const mappingData = JSON.parse(await readFile(mappingPath, 'utf-8'));
        
        // Convert mappings to Map objects with proper types
        this.idToIndex = new Map(Object.entries(mappingData.idToIndex || {}).map(
          ([id, index]) => [id, Number(index)]
        ));
        this.indexToId = new Map(Object.entries(mappingData.indexToId || {}).map(
          ([index, id]) => [Number(index), String(id)]
        ));
        this.currentIndex = mappingData.currentIndex || currentCount;
        
        logger.info(`ID mapping loaded with ${this.idToIndex.size} entries`);
      } else {
        // If no mapping file exists, create a new one
        logger.warn('No ID mapping found, creating empty mapping');
        this.idToIndex = new Map();
        this.indexToId = new Map();
        this.currentIndex = 0;
      }
    } catch (error) {
      logger.error('Failed to load vector index, creating a new one', { error: error.message });
      this.createNewIndex();
    }
  }

  /**
   * Load document metadata from disk
   */
  private async loadMetadata(): Promise<void> {
    try {
      logger.info(`Loading document metadata from ${this.metadataPath}`);
      const data = JSON.parse(await readFile(this.metadataPath, 'utf-8'));
      
      // Load documents
      this.documents = new Map();
      if (data.documents) {
        for (const doc of data.documents) {
          this.documents.set(doc.id, doc);
        }
      }
      
      // Load stats
      if (data.stats) {
        this.stats = data.stats;
      }
      
      logger.info(`Loaded metadata with ${this.documents.size} documents`);
      
      // Update stats if needed
      await this.updateStats();
    } catch (error) {
      logger.error('Failed to load metadata, starting with empty data', { error: error.message });
      this.documents = new Map();
      await this.updateStats();
    }
  }

  /**
   * Save the vector index and metadata to disk
   * @param saveEmbeddings Whether to save embeddings in metadata (helpful for debugging but increases file size)
   */
  private async save(saveEmbeddings: boolean = false): Promise<void> {
    try {
      // Ensure directory exists
      await mkdir(dirname(this.indexPath), { recursive: true });
      
      // Save the vector index
      if (this.vectorIndex) {
        this.vectorIndex.writeIndex(this.indexPath);
        logger.debug(`Vector index saved to ${this.indexPath}`);
      }
      
      // Save ID mapping
      const idMapping = {
        idToIndex: Object.fromEntries(this.idToIndex),
        indexToId: Object.fromEntries(this.indexToId),
        currentIndex: this.currentIndex
      };
      await writeFile(
        join(this.dataDir, 'id-mapping.json'),
        JSON.stringify(idMapping, null, 2)
      );
      
      // Save document metadata
      let documentsToSave;
      if (saveEmbeddings) {
        // Save with embeddings (larger file size but more complete)
        documentsToSave = Array.from(this.documents.values());
        logger.info('Saving metadata with embeddings included');
      } else {
        // Save without embeddings to save space (default behavior)
        documentsToSave = Array.from(this.documents.values()).map(doc => {
          const { embedding, ...rest } = doc;
          return rest;
        });
      }
      
      const metadataToSave = {
        documents: documentsToSave,
        stats: this.stats,
        // Add a marker to indicate if embeddings are included
        embeddings_included: saveEmbeddings
      };
      
      await writeFile(this.metadataPath, JSON.stringify(metadataToSave, null, 2));
      logger.debug(`Metadata saved to ${this.metadataPath}`);
    } catch (error) {
      logger.error('Failed to save vector store', { error: error.message });
      throw error;
    }
  }

  /**
   * Update the stats for the vector store
   */
  private async updateStats(): Promise<void> {
    const frameworks = new Set<string>();
    const versions: Record<string, Set<string>> = {};
    
    // Collect stats from documents
    for (const doc of this.documents.values()) {
      frameworks.add(doc.framework);
      
      if (!versions[doc.framework]) {
        versions[doc.framework] = new Set<string>();
      }
      
      versions[doc.framework].add(doc.version);
    }
    
    // Get actual count of vectors
    let vectorCount = 0;
    if (this.vectorIndex) {
      vectorCount = this.vectorIndex.getCurrentCount();
    }
    
    // Update stats
    this.stats = {
      totalDocuments: Math.max(this.documents.size, vectorCount),
      frameworks: Array.from(frameworks),
      versions: Object.fromEntries(
        Object.entries(versions).map(([framework, versionSet]) => [
          framework,
          Array.from(versionSet)
        ])
      ),
      lastUpdated: Date.now()
    };
    
    // Log warning if vector count doesn't match document count
    if (vectorCount > 0 && vectorCount !== this.documents.size) {
      logger.warn(`Vector count (${vectorCount}) doesn't match document count (${this.documents.size})`);
    }
  }

  /**
   * Get the embedding for a text string
   */
  private async getEmbedding(text: string): Promise<number[]> {
    if (!this.embedder) {
      throw new Error('Embedding model not initialized');
    }
    
    try {
      // Truncate text if it's too long (model has a token limit)
      const maxChars = 8000;
      const truncatedText = text.length > maxChars ? text.slice(0, maxChars) : text;
      
      // Get embedding
      const result = await this.embedder(truncatedText, {
        pooling: 'mean',
        normalize: true
      });
      
      return Array.from(result.data);
    } catch (error) {
      logger.error('Failed to get embedding', { error: error.message });
      throw error;
    }
  }

  /**
   * Add a document to the vector store
   */
  async addDocument(document: Omit<IndexedDocument, 'id' | 'embedding' | 'createdAt'>): Promise<string> {
    await this.initialize();
    
    try {
      // Generate a unique ID
      const id = uuidv4();
      
      // Get embedding for the document content
      const textToEmbed = `${document.title}\n\n${document.content}`;
      const embedding = await this.getEmbedding(textToEmbed);
      
      // Store the document
      const newDoc: IndexedDocument = {
        ...document,
        id,
        embedding,
        createdAt: Date.now()
      };
      
      this.documents.set(id, newDoc);
      
      // Add embedding to the vector index
      if (this.vectorIndex) {
        const index = this.currentIndex++;
        this.vectorIndex.addPoint(embedding, index);
        this.idToIndex.set(id, index);
        this.indexToId.set(index, id);
      }
      
      // Update stats and save
      await this.updateStats();
      await this.save();
      
      logger.debug(`Added document ${id} to vector store`);
      return id;
    } catch (error) {
      logger.error('Failed to add document to vector store', { error: error.message });
      throw error;
    }
  }

  /**
   * Add multiple documents to the vector store
   */
  async addDocuments(documents: Array<Omit<IndexedDocument, 'id' | 'embedding' | 'createdAt'>>): Promise<string[]> {
    await this.initialize();
    
    const ids: string[] = [];
    let batchSize = 0;
    
    try {
      for (const doc of documents) {
        const id = await this.addDocument(doc);
        ids.push(id);
        batchSize++;
        
        // Save in batches to avoid memory issues
        if (batchSize >= 10) {
          await this.save();
          batchSize = 0;
        }
      }
      
      // Final save if needed
      if (batchSize > 0) {
        await this.save();
      }
      
      return ids;
    } catch (error) {
      logger.error('Failed to add documents in batch', { error: error.message });
      throw error;
    }
  }

  /**
   * Search the vector store with hybrid (vector + keyword) search
   */
  async search(query: string, options: {
    framework?: string;
    version?: string;
    limit?: number;
    hybridAlpha?: number; // Controls balance between vector and keyword search (0-1)
  } = {}): Promise<SearchResult[]> {
    await this.initialize();
    
    const {
      framework,
      version,
      limit = 10,
      hybridAlpha = 0.5 // Default to 50% vector, 50% keyword
    } = options;
    
    try {
      // Get query embedding
      const queryEmbedding = await this.getEmbedding(query);
      
      // Vector search
      const vectorResults = await this.vectorSearch(queryEmbedding, { 
        framework, 
        version, 
        limit: limit * 2,
        query  // Pass original query for snippet generation
      });
      
      // Keyword search
      const keywordResults = this.keywordSearch(query, { framework, version, limit: limit * 2 });
      
      // Combine results with hybrid ranking
      const combinedResults = this.hybridRanking(vectorResults, keywordResults, hybridAlpha, limit);
      
      return combinedResults;
    } catch (error) {
      logger.error('Search failed', { error: error.message, query });
      throw error;
    }
  }

  /**
   * Perform vector similarity search
   */
  private async vectorSearch(queryEmbedding: number[], options: {
    framework?: string;
    version?: string;
    limit?: number;
    query?: string; // Optional query for snippet generation
  }): Promise<SearchResult[]> {
    const { framework, version, limit = 10, query } = options;
    
    if (!this.vectorIndex) {
      logger.warn('Vector search called but vector index is not initialized');
      return [];
    }
    
    const currentCount = this.vectorIndex.getCurrentCount();
    if (currentCount === 0) {
      logger.warn('Vector search called but vector index is empty');
      return [];
    }
    
    if (this.documents.size === 0) {
      logger.warn('Vector search called but documents map is empty');
      return [];
    }
    
    try {
      // Search with a larger k to allow for filtering
      const k = Math.min(limit * 4, currentCount);
      
      // Get nearest neighbors
      const result = this.vectorIndex.searchKnn(queryEmbedding, k);
      const { neighbors, distances } = result;
      
      // Convert to search results
      const results: SearchResult[] = [];
      const searchTerms = query ? query.toLowerCase().split(/\s+/).filter(t => t.length > 2) : [];
      
      for (let i = 0; i < neighbors.length; i++) {
        const index = neighbors[i];
        const distance = distances[i];
        const id = this.indexToId.get(index);
        
        if (!id) {
          logger.debug(`No document ID found for vector index ${index}`);
          continue;
        }
        
        const doc = this.documents.get(id);
        if (!doc) {
          logger.debug(`Document with ID ${id} not found in documents map`);
          continue;
        }
        
        // Apply filters
        if (framework && doc.framework !== framework) continue;
        if (version && doc.version !== version) continue;
        
        // Convert cosine distance to similarity score (1 - distance)
        const score = 1 - distance;
        
        results.push({
          id: doc.id,
          framework: doc.framework,
          version: doc.version,
          path: doc.path,
          title: doc.title,
          url: doc.url,
          snippet: this.generateSnippet(doc.content, searchTerms),
          score
        });
        
        // Stop once we have enough results after filtering
        if (results.length >= limit) break;
      }
      
      return results;
    } catch (error) {
      logger.error('Vector search failed', { error: error.message });
      return [];
    }
  }

  /**
   * Perform keyword-based search
   */
  private keywordSearch(query: string, options: {
    framework?: string;
    version?: string;
    limit?: number;
  }): SearchResult[] {
    const { framework, version, limit = 10 } = options;
    
    // Extract search terms
    const terms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2);
    
    if (terms.length === 0 || this.documents.size === 0) {
      return [];
    }
    
    // Score each document
    const results: SearchResult[] = [];
    
    for (const doc of this.documents.values()) {
      // Apply filters
      if (framework && doc.framework !== framework) continue;
      if (version && doc.version !== version) continue;
      
      let score = 0;
      
      // Check title matches (weighted heavily)
      const titleLower = doc.title.toLowerCase();
      for (const term of terms) {
        if (titleLower.includes(term)) {
          score += 0.6;
        }
      }
      
      // Check content matches
      const contentLower = doc.content.toLowerCase();
      for (const term of terms) {
        if (contentLower.includes(term)) {
          score += 0.2;
          
          // Bonus for multiple occurrences
          const occurrences = (contentLower.match(new RegExp(term, 'g')) || []).length;
          if (occurrences > 1) {
            score += Math.min(occurrences / 10, 0.2);
          }
        }
      }
      
      // Skip documents with no matches
      if (score <= 0) continue;
      
      // Add to results
      results.push({
        id: doc.id,
        framework: doc.framework,
        version: doc.version,
        path: doc.path,
        title: doc.title,
        url: doc.url,
        snippet: this.generateSnippet(doc.content, terms),
        score
      });
    }
    
    // Sort by score and limit
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Combine vector and keyword search results with hybrid ranking
   */
  private hybridRanking(
    vectorResults: SearchResult[],
    keywordResults: SearchResult[],
    alpha: number,
    limit: number
  ): SearchResult[] {
    // Create lookup maps for fast access
    const vectorScores = new Map<string, number>();
    const keywordScores = new Map<string, number>();
    const allDocIds = new Set<string>();
    
    // Normalize vector scores
    const maxVectorScore = Math.max(...vectorResults.map(r => r.score), 0.00001);
    for (const result of vectorResults) {
      vectorScores.set(result.id, result.score / maxVectorScore);
      allDocIds.add(result.id);
    }
    
    // Normalize keyword scores
    const maxKeywordScore = Math.max(...keywordResults.map(r => r.score), 0.00001);
    for (const result of keywordResults) {
      keywordScores.set(result.id, result.score / maxKeywordScore);
      allDocIds.add(result.id);
    }
    
    // Combine scores with hybrid ranking
    const hybridResults: SearchResult[] = [];
    
    for (const docId of allDocIds) {
      const vectorScore = vectorScores.get(docId) || 0;
      const keywordScore = keywordScores.get(docId) || 0;
      
      // Hybrid score formula
      const hybridScore = alpha * vectorScore + (1 - alpha) * keywordScore;
      
      // Find the original result object (prefer vector results for metadata)
      const originalResult = 
        vectorResults.find(r => r.id === docId) || 
        keywordResults.find(r => r.id === docId);
      
      if (originalResult) {
        hybridResults.push({
          ...originalResult,
          score: hybridScore
        });
      }
    }
    
    // Sort by hybrid score and apply limit
    return hybridResults
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Delete a document from the vector store
   */
  async deleteDocument(id: string): Promise<boolean> {
    await this.initialize();
    
    if (!this.documents.has(id)) {
      return false;
    }
    
    try {
      // Note: HNSW doesn't support true deletion, so we just mark for rebuild later
      this.documents.delete(id);
      this.idToIndex.delete(id);
      
      // Update stats and save
      await this.updateStats();
      await this.save();
      
      logger.debug(`Marked document ${id} for deletion from vector store`);
      return true;
    } catch (error) {
      logger.error('Failed to delete document', { id, error: error.message });
      throw error;
    }
  }

  /**
   * Clear all documents for a specific framework and version
   */
  async clearFrameworkVersion(framework: string, version: string): Promise<number> {
    await this.initialize();
    
    try {
      let deletedCount = 0;
      
      // Identify documents to delete
      const idsToDelete: string[] = [];
      
      for (const [id, doc] of this.documents.entries()) {
        if (doc.framework === framework && doc.version === version) {
          idsToDelete.push(id);
        }
      }
      
      // Delete each document
      for (const id of idsToDelete) {
        this.documents.delete(id);
        this.idToIndex.delete(id);
        deletedCount++;
      }
      
      // Update stats and save
      await this.updateStats();
      await this.save();
      
      logger.info(`Cleared ${deletedCount} documents for ${framework} ${version}`);
      return deletedCount;
    } catch (error) {
      logger.error('Failed to clear framework version', { framework, version, error: error.message });
      throw error;
    }
  }

  /**
   * Rebuild the vector index from scratch
   * This is useful after many deletions to reclaim space or when embeddings are missing
   */
  async rebuildIndex(): Promise<void> {
    await this.initialize();
    
    try {
      logger.info('Rebuilding vector index from scratch...');
      
      // Create a new index
      this.createNewIndex();
      
      let regeneratedCount = 0;
      
      // Re-add all documents
      for (const doc of this.documents.values()) {
        try {
          let embedding: number[] | undefined = doc.embedding;
          
          // If embedding is missing, generate it now
          if (!embedding) {
            if (!this.embedder) {
              throw new Error('Embedding model not initialized');
            }
            
            logger.debug(`Regenerating embedding for document ${doc.id} (${doc.title})`);
            const textToEmbed = `${doc.title}\n\n${doc.content}`;
            embedding = await this.getEmbedding(textToEmbed);
            
            // Store the embedding back into the document
            this.documents.set(doc.id, {
              ...doc,
              embedding
            });
            
            regeneratedCount++;
          }
          
          // Add to vector index
          const index = this.currentIndex++;
          this.vectorIndex!.addPoint(embedding, index);
          this.idToIndex.set(doc.id, index);
          this.indexToId.set(index, doc.id);
        } catch (docError) {
          logger.error(`Failed to process document ${doc.id} during rebuild`, { 
            error: docError.message,
            title: doc.title
          });
        }
      }
      
      // Save the rebuilt index
      await this.save();
      
      logger.info(`Vector index rebuilt with ${this.documents.size} documents (regenerated ${regeneratedCount} embeddings)`);
    } catch (error) {
      logger.error('Failed to rebuild vector index', { error: error.message });
      throw error;
    }
  }

  /**
   * Get statistics about the vector store
   */
  async getStats(): Promise<VectorStoreStats> {
    await this.initialize();
    
    // Ensure stats are up-to-date
    await this.updateStats();
    
    if (this.vectorIndex) {
      // Update total documents to reflect the actual count in the vector index
      const vectorCount = this.vectorIndex.getCurrentCount();
      logger.debug(`Vector index has ${vectorCount} vectors, documents map has ${this.documents.size} entries`);
      
      if (vectorCount > 0 && this.documents.size === 0) {
        logger.warn('Vector index has vectors but documents map is empty, stats may be incomplete');
      }
    }
    
    return this.stats;
  }
  
  /**
   * Check if the vector store is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Generate a snippet of text containing the search terms
   */
  private generateSnippet(content: string, terms: string[]): string {
    // Find the first occurrence of any term
    let lowestIndex = content.length;
    let matchedTerm = '';
    
    for (const term of terms) {
      const index = content.toLowerCase().indexOf(term.toLowerCase());
      if (index !== -1 && index < lowestIndex) {
        lowestIndex = index;
        matchedTerm = term;
      }
    }
    
    if (lowestIndex === content.length) {
      // No matches found, return start of content
      return content.slice(0, 200) + '...';
    }
    
    // Calculate snippet range (center on the match)
    const snippetLength = 300;
    const start = Math.max(0, lowestIndex - snippetLength / 2);
    const end = Math.min(content.length, start + snippetLength);
    
    // Extract snippet
    let snippet = content.slice(start, end);
    
    // Add ellipsis if truncated
    if (start > 0) {
      snippet = '...' + snippet;
    }
    if (end < content.length) {
      snippet = snippet + '...';
    }
    
    return snippet;
  }
}

// Export a singleton instance
export const vectorStore = new VectorStore();