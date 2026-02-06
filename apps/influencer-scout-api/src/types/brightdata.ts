/**
 * Type definitions for BrightData Instagram Profile API responses
 */

/**
 * BrightData Instagram Profile structure
 */
export interface BrightDataInstagramProfile {
  /** Instagram account username */
  account: string;
  
  /** Facebook ID */
  fbid: string;
  
  /** Instagram ID */
  id: string;
  
  /** Number of followers */
  followers: number;
  
  /** Number of posts */
  posts_count: number;
  
  /** Whether this is a business account */
  is_business_account: boolean;
  
  /** Whether this is a professional account */
  is_professional_account: boolean;
  
  /** Whether the account is verified */
  is_verified: boolean;
  
  /** Average engagement rate (can be null) */
  avg_engagement: number | null;
  
  /** External URL(s) from bio (BrightData can return a single string or an array) */
  external_url: string | string[] | null;
  
  /** Biography text */
  biography: string | null;
  
  /** Business category name */
  business_category_name: string | null;
  
  /** Category name */
  category_name: string | null;
  
  /** Hashtags from posts */
  post_hashtags: string[] | null;
  
  /** Number of accounts following */
  following: number;
  
  /** Posts data (can be null or array) */
  posts: any[] | null;
  
  /** Profile image URL */
  profile_image_link: string | null;
  
  /** Profile URL */
  profile_url: string;
  
  /** Profile name */
  profile_name: string;
  
  /** Number of highlights */
  highlights_count: number;
  
  /** Highlights data */
  highlights: any[] | null;
  
  /** Full name */
  full_name: string;
  
  /** Whether account is private */
  is_private: boolean;
  
  /** Hashtags from bio */
  bio_hashtags: string[] | null;
  
  /** Full URL */
  url: string;
  
  /** Whether account joined recently */
  is_joined_recently: boolean;
  
  /** Whether account has channel */
  has_channel: boolean;
  
  /** Partner ID */
  partner_id: string;
  
  /** Business address */
  business_address: string | null;
  
  /** Related accounts */
  related_accounts: any[];
  
  /** Email address */
  email_address: string | null;
}

/**
 * BrightData trigger request payload
 */
export interface BrightDataTriggerRequest {
  url: string;
}

/**
 * BrightData trigger response
 */
export interface BrightDataTriggerResponse {
  snapshot_id: string;
  status?: string;
  message?: string;
}

/**
 * BrightData progress response
 */
export interface BrightDataProgressResponse {
  snapshot_id?: string;
  dataset_id?: string;
  status: 'pending' | 'running' | 'ready' | 'completed' | 'failed'; // API returns "ready" when done
  progress?: number;
  total?: number;
  completed?: number;
  failed?: number;
  message?: string;
}

/**
 * BrightData TikTok Top Video structure
 */
export interface BrightDataTikTokTopVideo {
  commentcount: number;
  cover_image: string;
  create_date: string;
  diggcount: number;
  favorites_count: number;
  playcount: number;
  share_count: number;
  video_id: string;
  video_url: string;
}

/**
 * BrightData TikTok Top Post structure
 */
export interface BrightDataTikTokTopPost {
  create_time: string;
  description: string | null;
  hashtags: string[] | null;
  likes: number;
  post_id: string;
  post_type: string;
  post_url: string;
}

/**
 * BrightData TikTok Profile structure
 */
export interface BrightDataTikTokProfile {
  /** TikTok account ID */
  account_id: string;
  
  /** Display nickname */
  nickname: string;
  
  /** Biography text */
  biography: string | null;
  
  /** Average engagement rate */
  awg_engagement_rate: number;
  
  /** Comment engagement rate */
  comment_engagement_rate: number;
  
  /** Like engagement rate */
  like_engagement_rate: number;
  
  /** Bio link (BrightData can return a single string or an array) */
  bio_link: string | string[] | null;
  
  /** Predicted language */
  predicted_lang: string;
  
  /** Whether account is verified */
  is_verified: boolean;
  
  /** Number of followers */
  followers: number;
  
  /** Number of accounts following */
  following: number;
  
  /** Total likes */
  likes: number;
  
  /** Number of videos */
  videos_count: number;
  
  /** Account creation time */
  create_time: string;
  
  /** TikTok ID */
  id: string;
  
  /** Profile URL */
  url: string;
  
  /** Profile picture URL */
  profile_pic_url: string | null;
  
  /** Like count */
  like_count: number;
  
  /** Digg count */
  digg_count: number;
  
  /** Whether account is private */
  is_private: boolean;
  
  /** HD profile picture URL */
  profile_pic_url_hd: string | null;
  
  /** Security ID */
  secu_id: string | null;
  
  /** Short ID */
  short_id: string | null;
  
  /** FTC */
  ftc: any;
  
  /** Relation */
  relation: any;
  
  /** Open favorite */
  open_favorite: boolean;
  
  /** Comment setting */
  comment_setting: any;
  
  /** Duet setting */
  duet_setting: any;
  
  /** Stitch setting */
  stitch_setting: any;
  
  /** Is ad virtual */
  is_ad_virtual: boolean;
  
  /** Room ID */
  room_id: string | null;
  
  /** Is under age 18 */
  is_under_age_18: boolean | null;
  
  /** Top videos */
  top_videos: BrightDataTikTokTopVideo[];
  
  /** Signature */
  signature: string | null;
  
  /** Discovery input */
  discovery_input: Record<string, any>;
  
  /** Is commerce user */
  is_commerce_user: boolean;
  
  /** Top posts data */
  top_posts_data: BrightDataTikTokTopPost[];
}

/**
 * BrightData trigger request payload (supports both Instagram and TikTok)
 */
export interface BrightDataTriggerRequest {
  url: string;
  country?: string; // Required for TikTok, optional for Instagram
}

/**
 * Platform type for BrightData
 */
export type BrightDataPlatform = 'instagram' | 'tiktok';

/**
 * Unified Post Data - Compatible with both Instagram and TikTok posts
 * Merges post data from both platforms into a common structure
 */
export interface BrightDataUnifiedPost {
  /** Post/video ID (Instagram: id/shortcode, TikTok: video_id/post_id) */
  post_id: string;
  
  /** Post URL (Instagram: permalink, TikTok: video_url/post_url) */
  post_url: string;
  
  /** Post type (Instagram: "photo", "video", "reel", "carousel", TikTok: "video") */
  post_type: string;
  
  /** Whether this is a reel (Instagram only, TikTok videos are always videos) */
  is_reel?: boolean;
  
  /** Caption/description text */
  caption: string | null;
  
  /** Number of likes (Instagram: likes.count, TikTok: likes/diggcount) */
  likes: number;
  
  /** Number of comments */
  comments: number;
  
  /** Number of shares (Instagram: shares, TikTok: share_count) */
  shares?: number;
  
  /** Number of views/plays (Instagram: video_view_count, TikTok: playcount) */
  views?: number;
  
  /** Creation timestamp (ISO string) */
  created_at: string;
  
  /** Content URL (Instagram: display_url/video_url, TikTok: cover_image) */
  content_url: string | null;
  
  /** Hashtags array */
  hashtags: string[] | null;
  
  /** Platform identifier */
  platform: BrightDataPlatform;
  
  // === INSTAGRAM-SPECIFIC FIELDS ===
  /** Whether post is a video (Instagram only) */
  is_video?: boolean;
  
  /** Whether post is a carousel (Instagram only) */
  is_carousel?: boolean;
  
  /** Shortcode (Instagram only) */
  shortcode?: string;
  
  /** Taken at timestamp (Instagram only) */
  taken_at_timestamp?: number;
  
  /** Display URL (Instagram only, same as content_url) */
  display_url?: string | null;
  
  /** Video URL (Instagram only, for video posts) */
  video_url?: string | null;
  
  // === TIKTOK-SPECIFIC FIELDS ===
  /** Video ID (TikTok only, same as post_id) */
  video_id?: string;
  
  /** Digg count (TikTok only, same as likes) */
  digg_count?: number;
  
  /** Favorites count (TikTok only) */
  favorites_count?: number;
  
  /** Play count (TikTok only, same as views) */
  playcount?: number;
  
  /** Share count (TikTok only, same as shares) */
  share_count?: number;
  
  /** Comment count (TikTok only, same as comments) */
  commentcount?: number;
  
  /** Cover image URL (TikTok only, same as content_url) */
  cover_image?: string | null;
  
  /** Create date (TikTok only, same as created_at) */
  create_date?: string;
}

/**
 * Unified BrightData Profile - Compatible with both Instagram and TikTok
 * This type normalizes fields from both platforms into a common structure
 * Contains only essential common fields
 */
export interface BrightDataUnifiedProfile {
  /** Platform identifier */
  platform: BrightDataPlatform;

  // === IDENTIFIERS ===
  /** Account username/ID (Instagram: account, TikTok: account_id) */
  account_id: string;
  
  /** Platform-specific ID (Instagram: id, TikTok: id) */
  id: string;
  
  /** Profile URL (normalized from url/profile_url) */
  profile_url: string;
  
  /** Full URL (same as profile_url for consistency) */
  url: string;

  // === BASIC INFO ===
  /** Display name (Instagram: full_name/profile_name, TikTok: nickname) */
  display_name: string;
  
  /** Biography text */
  biography: string | null;
  
  /** Profile picture URL (Instagram: profile_image_link, TikTok: profile_pic_url) */
  profile_image_url: string | null;

  // === STATS ===
  /** Number of followers */
  followers: number;
  
  /** Number of accounts following */
  following: number;
  
  /** Number of posts/videos (Instagram: posts_count, TikTok: videos_count) */
  posts_count: number;

  // === ENGAGEMENT ===
  /** Average engagement rate (Instagram: avg_engagement, TikTok: awg_engagement_rate) */
  avg_engagement_rate: number | null;

  // === LINKS & EXTERNAL ===
  /** External/bio link (Instagram: external_url, TikTok: bio_link) */
  external_url: string | null;
  
  /** Email address extracted from biography (if available) */
  email_address: string | null;
  
  /** Aggregated hashtags from all post captions */
  hashtags: string[] | null;

  // === POSTS DATA ===
  /** Unified post data array (merged from Instagram posts and TikTok top_videos/top_posts_data) */
  posts_data?: BrightDataUnifiedPost[];
}

/**
 * Union type for BrightData profiles (original platform-specific types)
 */
export type BrightDataProfile = BrightDataInstagramProfile | BrightDataTikTokProfile;

/**
 * BrightData snapshot download response (supports both platforms)
 */
export interface BrightDataSnapshotResponse {
  snapshot_id: string;
  data: BrightDataProfile[];
  status: string;
  total_records?: number;
  platform?: BrightDataPlatform;
}

/**
 * BrightData cache document stored in Firestore
 * Used to cache raw profile data to avoid redundant API calls
 */
export interface BrightDataCacheDoc {
  /** Original profile URL (normalized) */
  profile_url: string;

  /** Platform identifier */
  platform: BrightDataPlatform;

  /** Raw profile data from BrightData API */
  raw_data: BrightDataInstagramProfile | BrightDataTikTokProfile;

  /** Timestamp when cached (Unix ms) */
  cached_at: number;

  /** Timestamp when cache expires (Unix ms) - cached_at + 14 days */
  expires_at: number;
}
