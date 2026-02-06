/**
 * Type definitions for Weaviate BM25 search responses
 */

/**
 * Platform types supported by the influencer profiles
 */
export type Platform = 'tiktok' | 'instagram';

/**
 * Influencer profile data structure from Weaviate
 */
export interface InfluencerProfile {
  /** Unique identifier from LanceDB */
  lance_db_id: string;
  
  /** Social media platform */
  platform: Platform;
  
  /** Profile URL */
  profile_url: string;
  
  /** External URL (link in bio, etc.) */
  external_url: string;
  
  /** Username/handle */
  username: string;
  
  /** Display name */
  display_name: string;
  
  /** Biography/bio text */
  biography: string;
  
  /** Profile text (expanded profile information) */
  profile_text: string;
  
  /** Post text content */
  post_text: string;
  
  /** Hashtag text */
  hashtag_text: string;
  
  /** Number of followers */
  followers: number;
  
  /** Number of accounts following */
  following: number;
  
  /** Number of posts (stored as string) */
  posts_count: string;
}

/**
 * Search result metadata from Weaviate
 */
export interface SearchResultMetadata {
  /** Relevance score from BM25 search */
  score?: number;
  
  /** Distance metric (if applicable) */
  distance?: number;
}

/**
 * Individual search result item
 * data can be partial (minimal fields) or full profile data depending on query return fields
 */
export interface WeaviateSearchResult {
  /** Weaviate object UUID */
  id: string;
  
  /** Search metadata (score, distance) */
  score?: number;
  distance?: number;
  
  /** Influencer profile data (can be partial for optimized queries) */
  data: Partial<InfluencerProfile> & {
    /** Profile URL is always required */
    profile_url: string;
  };
}

/**
 * BM25 search response structure
 */
export interface WeaviateBm25SearchResponse {
  /** Search query that was executed */
  query: string;
  
  /** Collection name that was searched */
  collection: string;
  
  /** Maximum number of results requested */
  limit: number;
  
  /** Actual number of results returned */
  count: number;
  
  /** Array of search results */
  results: WeaviateSearchResult[];
  
  /** ISO timestamp of when the search was performed */
  timestamp: string;
}

/**
 * Hybrid search response structure
 */
export interface WeaviateHybridSearchResponse {
  /** Search query that was executed */
  query: string;
  
  /** Collection name that was searched */
  collection: string;
  
  /** Maximum number of results requested */
  limit: number;
  
  /** Alpha parameter (0 = pure BM25, 1 = pure vector, 0.5 = balanced) */
  alpha: number;
  
  /** Embedding model used */
  embedding_model: string;
  
  /** Embedding dimensions */
  embedding_dimensions: number;
  
  /** Actual number of results returned */
  count: number;
  
  /** Array of search results */
  results: WeaviateSearchResult[];
  
  /** ISO timestamp of when the search was performed */
  timestamp: string;
}

/**
 * Error response structure
 */
export interface WeaviateSearchErrorResponse {
  /** Error status */
  status: 'error';
  
  /** Error message */
  message: string;
  
  /** ISO timestamp of when the error occurred */
  timestamp: string;
}

