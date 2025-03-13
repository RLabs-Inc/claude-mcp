import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { logger } from './logger';
import { config } from './config';

/**
 * Simple in-memory search index for documentation content
 * 
 * This provides basic search capabilities across documentation
 * In a production environment, this would be replaced with a proper
 * vector database or search engine like Elasticsearch
 */

interface IndexedDocument {
  id: string;
  framework: string;
  version: string;
  path: string; 
  title: string;
  content: string;
  keywords: string[];
}

interface SearchResult {
  id: string;
  framework: string;
  version: string;
  path: string;
  title: string;
  snippet: string;
  score: number;
}

class SearchIndex {
  private documents: IndexedDocument[] = [];
  private indexPath: string;
  private initialized = false;

  constructor() {
    this.indexPath = join(config.DOCS_STORAGE_PATH || './docs', 'search-index.json');
  }

  /**
   * Initialize the search index
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Load index from disk if it exists
      if (existsSync(this.indexPath)) {
        const indexData = await readFile(this.indexPath, 'utf-8');
        this.documents = JSON.parse(indexData);
        logger.info(`Loaded search index with ${this.documents.length} documents`);
      } else {
        logger.info('No existing search index found, creating a new one');
      }
      
      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize search index', { error: error.message });
      // Start with an empty index
      this.documents = [];
      this.initialized = true;
    }
  }

  /**
   * Add a document to the search index
   */
  async addDocument(document: Omit<IndexedDocument, 'id' | 'keywords'>): Promise<string> {
    await this.initialize();
    
    // Generate unique ID
    const id = `${document.framework}-${document.version}-${Date.now()}`;
    
    // Extract keywords (basic implementation)
    const keywords = this.extractKeywords(document.content);
    
    // Create the indexed document
    const indexedDoc: IndexedDocument = {
      ...document,
      id,
      keywords
    };
    
    // Add to index
    this.documents.push(indexedDoc);
    
    // Save index to disk
    try {
      await this.saveIndex();
      logger.debug('Search index updated', { docId: id });
    } catch (error) {
      logger.error('Failed to save search index', { error: error.message });
    }
    
    return id;
  }
  
  /**
   * Add multiple documents to the search index
   */
  async addDocuments(documents: Array<Omit<IndexedDocument, 'id' | 'keywords'>>): Promise<string[]> {
    const ids: string[] = [];
    
    for (const doc of documents) {
      const id = await this.addDocument(doc);
      ids.push(id);
    }
    
    return ids;
  }

  /**
   * Search the index for documents matching the query
   */
  async search(query: string, options: { 
    framework?: string;
    version?: string;
    limit?: number;
  } = {}): Promise<SearchResult[]> {
    await this.initialize();
    
    const { framework, version, limit = 10 } = options;
    const terms = query.toLowerCase().split(/\s+/).filter(term => term.length > 1);
    
    if (terms.length === 0) {
      return [];
    }
    
    // Score each document
    const results = this.documents
      // Apply filters if specified
      .filter(doc => {
        if (framework && doc.framework !== framework) return false;
        if (version && doc.version !== version) return false;
        return true;
      })
      // Calculate score for each document
      .map(doc => {
        let score = 0;
        
        // Check title matches (weighted heavily)
        const titleLower = doc.title.toLowerCase();
        for (const term of terms) {
          if (titleLower.includes(term)) {
            score += 5;
          }
        }
        
        // Check keyword matches
        for (const term of terms) {
          if (doc.keywords.includes(term)) {
            score += 3;
          }
        }
        
        // Check content matches
        const contentLower = doc.content.toLowerCase();
        for (const term of terms) {
          if (contentLower.includes(term)) {
            score += 1;
            
            // Bonus for multiple occurrences
            const occurrences = (contentLower.match(new RegExp(term, 'g')) || []).length;
            if (occurrences > 1) {
              score += Math.min(occurrences / 5, 1); // Cap bonus at 1 point
            }
          }
        }
        
        // Generate snippet
        let snippet = '';
        if (score > 0) {
          snippet = this.generateSnippet(doc.content, terms);
        }
        
        return {
          id: doc.id,
          framework: doc.framework,
          version: doc.version,
          path: doc.path,
          title: doc.title,
          snippet,
          score
        };
      })
      // Filter out docs with no matches
      .filter(result => result.score > 0)
      // Sort by score (descending)
      .sort((a, b) => b.score - a.score)
      // Apply limit
      .slice(0, limit);
      
    return results;
  }

  /**
   * Delete a document from the index
   */
  async deleteDocument(id: string): Promise<boolean> {
    await this.initialize();
    
    const initialLength = this.documents.length;
    this.documents = this.documents.filter(doc => doc.id !== id);
    
    const deleted = initialLength > this.documents.length;
    
    if (deleted) {
      await this.saveIndex();
      logger.debug('Document deleted from search index', { docId: id });
    }
    
    return deleted;
  }

  /**
   * Clear all documents for a specific framework + version
   */
  async clearFrameworkVersion(framework: string, version: string): Promise<number> {
    await this.initialize();
    
    const initialLength = this.documents.length;
    this.documents = this.documents.filter(
      doc => !(doc.framework === framework && doc.version === version)
    );
    
    const deletedCount = initialLength - this.documents.length;
    
    if (deletedCount > 0) {
      await this.saveIndex();
      logger.info(`Cleared ${deletedCount} documents from search index`, { framework, version });
    }
    
    return deletedCount;
  }

  /**
   * Save the index to disk
   */
  private async saveIndex(): Promise<void> {
    try {
      await writeFile(this.indexPath, JSON.stringify(this.documents, null, 2));
    } catch (error) {
      logger.error('Failed to save search index to disk', { error: error.message });
      throw error;
    }
  }

  /**
   * Extract keywords from document content
   * This is a very basic implementation that could be improved with NLP
   */
  private extractKeywords(content: string): string[] {
    // Remove common stop words
    const stopWords = new Set([
      'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with',
      'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'this', 'that', 'these', 'those', 'it', 'its', 'it\'s', 'of', 'from'
    ]);
    
    // Extract words, remove punctuation, convert to lowercase
    const words = content
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
    
    // Count word frequencies
    const wordCounts = new Map<string, number>();
    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
    
    // Sort by frequency and take top 50
    return Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([word]) => word);
  }

  /**
   * Generate a snippet of text containing the search terms
   */
  private generateSnippet(content: string, terms: string[]): string {
    // Find the first occurrence of any term
    let lowestIndex = content.length;
    let matchedTerm = '';
    
    for (const term of terms) {
      const index = content.toLowerCase().indexOf(term);
      if (index !== -1 && index < lowestIndex) {
        lowestIndex = index;
        matchedTerm = term;
      }
    }
    
    if (lowestIndex === content.length) {
      // No matches found, return start of content
      return content.slice(0, 150) + '...';
    }
    
    // Calculate snippet range (try to center on the match)
    const snippetLength = 200;
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
export const searchIndex = new SearchIndex();