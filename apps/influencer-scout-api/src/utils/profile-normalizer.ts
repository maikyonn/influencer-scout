/**
 * Utility functions to normalize BrightData profiles from different platforms
 * into a unified format
 */

import type {
  BrightDataInstagramProfile,
  BrightDataTikTokProfile,
  BrightDataTikTokTopVideo,
  BrightDataTikTokTopPost,
  BrightDataUnifiedProfile,
  BrightDataUnifiedPost,
} from '../types/brightdata.js';
import { createLogger } from './logger.js';

const logger = createLogger({ component: 'profile-normalizer' });

/**
 * Extract email address from text (biography)
 * Excludes @mentions and only captures legitimate email addresses
 */
function extractEmailAddress(text: string | null): string | null {
  if (!text) return null;
  
  // Email regex pattern that matches standard email formats
  // Matches: word characters, dots, hyphens, plus signs, followed by @, then domain
  // Excludes: @mentions (which don't have a domain part)
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  
  const matches = text.match(emailRegex);
  
  if (!matches || matches.length === 0) return null;
  
  // Filter out invalid emails and @mentions
  // Valid emails must have:
  // - At least one character before @
  // - A domain with at least one dot
  // - Not be just @username (no domain)
  const validEmails = matches.filter(email => {
    // Check that it's not just @username (mentions don't have domains)
    if (email.startsWith('@')) return false;
    
    // Check that it has a proper domain structure
    const parts = email.split('@');
    if (parts.length !== 2) return false;
    
    const [localPart, domain] = parts;
    
    // Local part must not be empty
    if (!localPart || localPart.length === 0) return false;
    
    // Domain must exist and have at least one dot (TLD)
    if (!domain || !domain.includes('.')) return false;
    
    // Domain must have a valid TLD (at least 2 characters)
    const domainParts = domain.split('.');
    const tld = domainParts[domainParts.length - 1];
    if (!tld || tld.length < 2) return false;
    
    // Additional validation: domain should not be just numbers
    if (/^\d+$/.test(domain.replace(/\./g, ''))) return false;
    
    return true;
  });
  
  // Return the first valid email found, or null if none found
  return validEmails.length > 0 ? (validEmails[0] || null) : null;
}

function coerceExternalUrl(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === 'string' && item.trim().length > 0);
    return typeof first === 'string' ? first.trim() : null;
  }

  return null;
}

/**
 * Normalize Instagram post to unified format
 */
function normalizeInstagramPost(post: any): BrightDataUnifiedPost {
  // Determine post type
  let postType = 'photo';
  let isReel = false;
  
  if (post.is_reel || post.type === 'reel') {
    postType = 'reel';
    isReel = true;
  } else if (post.is_video || post.type === 'video') {
    postType = 'video';
  } else if (post.is_carousel || post.type === 'carousel') {
    postType = 'carousel';
  }
  
  // Get content URL (prefer video_url for videos, otherwise display_url)
  const contentUrl = post.video_url || post.display_url || null;
  
  // Get caption
  const caption = post.caption?.text || post.caption || post.edge_media_to_caption?.edges?.[0]?.node?.text || null;
  
  // Get likes count
  const likes = post.likes?.count || post.edge_media_preview_like?.count || post.like_count || 0;
  
  // Get comments count
  const comments = post.comments?.count || post.edge_media_to_comment?.count || post.comment_count || 0;
  
  // Get shares count
  const shares = post.shares?.count || post.edge_media_to_parent_comment?.count || 0;
  
  // Get views count (for videos/reels)
  const views = post.video_view_count || post.view_count || undefined;
  
  // Get created timestamp
  // BrightData returns 'datetime' as ISO string, but may also return legacy fields
  const createdAt = post.datetime
    ? new Date(post.datetime).toISOString()
    : post.taken_at_timestamp
    ? new Date(post.taken_at_timestamp * 1000).toISOString()
    : post.taken_at
    ? new Date(post.taken_at).toISOString()
    : new Date().toISOString();
  
  // Extract hashtags from caption
  const hashtags = extractHashtags(caption);
  
  // Get post ID
  const postId = post.id || post.shortcode || post.pk || '';
  
  // Get post URL
  const postUrl = post.permalink || post.shortcode 
    ? `https://www.instagram.com/p/${post.shortcode}/`
    : post.url || '';
  
  return {
    post_id: postId,
    post_url: postUrl,
    post_type: postType,
    is_reel: isReel,
    caption: caption,
    likes: likes,
    comments: comments,
    shares: shares,
    views: views,
    created_at: createdAt,
    content_url: contentUrl,
    hashtags: hashtags,
    platform: 'instagram',
    
    // Instagram-specific fields
    is_video: post.is_video || postType === 'video' || postType === 'reel',
    is_carousel: post.is_carousel || postType === 'carousel',
    shortcode: post.shortcode,
    taken_at_timestamp: post.taken_at_timestamp,
    display_url: post.display_url,
    video_url: post.video_url,
  };
}

/**
 * Normalize TikTok posts by merging top_videos and top_posts_data
 */
function normalizeTikTokPosts(
  topVideos: BrightDataTikTokTopVideo[],
  topPostsData: BrightDataTikTokTopPost[]
): BrightDataUnifiedPost[] {
  // Create a map to merge video and post data
  const postMap = new Map<string, BrightDataUnifiedPost>();
  
  // Process top_videos
  for (const video of topVideos) {
    const postId = video.video_id;
    postMap.set(postId, {
      post_id: postId,
      post_url: video.video_url,
      post_type: 'video',
      caption: null, // Will be filled from top_posts_data if available
      likes: video.diggcount,
      comments: video.commentcount,
      shares: video.share_count,
      views: video.playcount,
      created_at: video.create_date,
      content_url: video.cover_image,
      hashtags: null, // Will be filled from top_posts_data if available
      platform: 'tiktok',
      
      // TikTok-specific fields
      video_id: video.video_id,
      digg_count: video.diggcount,
      favorites_count: video.favorites_count,
      playcount: video.playcount,
      share_count: video.share_count,
      commentcount: video.commentcount,
      cover_image: video.cover_image,
      create_date: video.create_date,
    });
  }
  
  // Merge top_posts_data into existing posts
  for (const postData of topPostsData) {
    const postId = postData.post_id;
    const existingPost = postMap.get(postId);
    
    if (existingPost) {
      // Merge post data into existing video entry
      existingPost.caption = postData.description;
      existingPost.hashtags = postData.hashtags;
      existingPost.likes = postData.likes; // Override with post data if different
      existingPost.created_at = postData.create_time; // Use post create_time if available
    } else {
      // Create new post entry if video data not found
      postMap.set(postId, {
        post_id: postId,
        post_url: postData.post_url,
        post_type: postData.post_type || 'video',
        caption: postData.description,
        likes: postData.likes,
        comments: 0, // Not available in top_posts_data
        created_at: postData.create_time,
        content_url: null, // Not available in top_posts_data
        hashtags: postData.hashtags,
        platform: 'tiktok',
      });
    }
  }
  
  // Convert map to array and sort by created_at (newest first)
  return Array.from(postMap.values()).sort((a, b) => {
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return dateB - dateA; // Descending order
  });
}

/**
 * Extract hashtags from text
 */
function extractHashtags(text: string | null): string[] | null {
  if (!text) return null;
  
  const hashtagRegex = /#[\w\u0590-\u05ff\u0600-\u06ff\u0700-\u074f\u0750-\u077f\u08a0-\u08ff\u0900-\u097f]+/g;
  const matches = text.match(hashtagRegex);
  
  if (!matches || matches.length === 0) return null;
  
  return matches.map(tag => tag.substring(1)); // Remove # symbol
}

/**
 * Aggregate hashtags from posts data
 */
function aggregateHashtagsFromPosts(posts: BrightDataUnifiedPost[] | undefined): string[] | null {
  if (!posts || posts.length === 0) return null;
  
  const hashtagSet = new Set<string>();
  
  for (const post of posts) {
    if (post.hashtags && Array.isArray(post.hashtags)) {
      for (const tag of post.hashtags) {
        if (tag && typeof tag === 'string' && tag.trim().length > 0) {
          hashtagSet.add(tag.trim().toLowerCase());
        }
      }
    }
    
    // Also extract hashtags from caption text
    if (post.caption) {
      const extractedHashtags = extractHashtags(post.caption);
      if (extractedHashtags) {
        for (const tag of extractedHashtags) {
          if (tag && tag.trim().length > 0) {
            hashtagSet.add(tag.trim().toLowerCase());
          }
        }
      }
    }
  }
  
  return hashtagSet.size > 0 ? Array.from(hashtagSet).sort() : null;
}

/**
 * Normalize Instagram profile to unified format
 */
export function normalizeInstagramProfile(
  profile: BrightDataInstagramProfile
): BrightDataUnifiedProfile {
  // Normalize posts if available
  const postsData = profile.posts && Array.isArray(profile.posts) && profile.posts.length > 0
    ? profile.posts.map(normalizeInstagramPost)
    : undefined;
  
  // Limit to top 8 posts (sorted by engagement or creation date)
  const limitedPostsData = postsData
    ? postsData
        .sort((a, b) => {
          // Sort by likes (descending), then by created_at (descending)
          const likesDiff = (b.likes || 0) - (a.likes || 0);
          if (likesDiff !== 0) return likesDiff;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        })
        .slice(0, 8)
    : undefined;
  
  const unified: BrightDataUnifiedProfile = {
    platform: 'instagram',
    
    // Identifiers
    account_id: profile.account,
    id: profile.id,
    profile_url: profile.profile_url || profile.url,
    url: profile.url || profile.profile_url,
    
    // Basic info
    display_name: profile.full_name || profile.profile_name || profile.account,
    biography: profile.biography ?? null,
    profile_image_url: profile.profile_image_link ?? null,
    
    // Stats
    followers: profile.followers,
    following: profile.following,
    posts_count: profile.posts_count,
    
    // Engagement
    avg_engagement_rate: profile.avg_engagement ?? null,
    
    // Links
    external_url: coerceExternalUrl(profile.external_url),
    
    // Email address (from profile or extracted from biography)
    email_address: profile.email_address || extractEmailAddress(profile.biography ?? null),
    
    // Hashtags aggregated from posts
    hashtags: aggregateHashtagsFromPosts(limitedPostsData),
  };
  
  // Only include posts_data if it's defined
  if (limitedPostsData !== undefined) {
    unified.posts_data = limitedPostsData;
  }
  
  return unified;
}

/**
 * Normalize TikTok profile to unified format
 */
export function normalizeTikTokProfile(
  profile: BrightDataTikTokProfile
): BrightDataUnifiedProfile {
  // Normalize posts by merging top_videos and top_posts_data
  const postsData = 
    (profile.top_videos && profile.top_videos.length > 0) ||
    (profile.top_posts_data && profile.top_posts_data.length > 0)
      ? normalizeTikTokPosts(
          profile.top_videos || [],
          profile.top_posts_data || []
        )
      : undefined;
  
  // Limit to top 8 posts (already sorted by creation date in normalizeTikTokPosts)
  const limitedPostsData = postsData ? postsData.slice(0, 8) : undefined;
  
  const unified: BrightDataUnifiedProfile = {
    platform: 'tiktok',
    
    // Identifiers
    account_id: profile.account_id,
    id: profile.id,
    profile_url: profile.url,
    url: profile.url,
    
    // Basic info
    display_name: profile.nickname || profile.account_id || 'Unknown',
    biography: profile.biography ?? null,
    profile_image_url: profile.profile_pic_url ?? null,
    
    // Stats
    followers: profile.followers,
    following: profile.following,
    posts_count: profile.videos_count,
    
    // Engagement
    avg_engagement_rate: Number.isFinite(profile.awg_engagement_rate) ? profile.awg_engagement_rate : null,
    
    // Links
    external_url: coerceExternalUrl(profile.bio_link),
    
    // Email address (extracted from biography)
    email_address: extractEmailAddress(profile.biography ?? null),
    
    // Hashtags aggregated from posts
    hashtags: aggregateHashtagsFromPosts(limitedPostsData),
  };
  
  // Only include posts_data if it's defined
  if (limitedPostsData !== undefined) {
    unified.posts_data = limitedPostsData;
  }
  
  return unified;
}

/**
 * Normalize a profile from either platform to unified format
 */
export function normalizeProfile(
  profile: BrightDataInstagramProfile | BrightDataTikTokProfile
): BrightDataUnifiedProfile {
  // Check if profile is already normalized (has 'platform' field and unified structure)
  // Note: We still normalize to ensure all fields are properly structured
  if ('platform' in profile && 'account_id' in profile && 'profile_url' in profile) {
    // Already in unified format - but verify it's complete
    const unifiedProfile = profile as unknown as BrightDataUnifiedProfile;
    // Ensure display_name is populated (use account_id as fallback if missing/empty)
    if (!unifiedProfile.display_name || !unifiedProfile.display_name.trim()) {
      unifiedProfile.display_name = unifiedProfile.account_id || 'Unknown';
    }
    // Return if all required fields are present
    if (unifiedProfile.platform && unifiedProfile.account_id) {
      return unifiedProfile;
    }
  }
  
  // Check if it's an Instagram profile (has 'account' field)
  if ('account' in profile && 'fbid' in profile) {
    return normalizeInstagramProfile(profile as BrightDataInstagramProfile);
  }
  
  // Otherwise it's a TikTok profile (has 'account_id' field)
  if ('account_id' in profile && 'nickname' in profile) {
    return normalizeTikTokProfile(profile as BrightDataTikTokProfile);
  }
  
  // Fallback: try to detect platform from URL or other fields
  const profileUrl = (profile as any).profile_url || (profile as any).url || '';
  if (profileUrl.includes('instagram.com')) {
    return normalizeInstagramProfile(profile as BrightDataInstagramProfile);
  } else if (profileUrl.includes('tiktok.com')) {
    return normalizeTikTokProfile(profile as BrightDataTikTokProfile);
  }
  
  // Last resort: assume TikTok if has account_id, otherwise Instagram
  if ('account_id' in profile) {
    return normalizeTikTokProfile(profile as BrightDataTikTokProfile);
  }
  
  return normalizeInstagramProfile(profile as BrightDataInstagramProfile);
}

/**
 * Normalize an array of profiles from either platform
 */
export function normalizeProfiles(
  profiles: (BrightDataInstagramProfile | BrightDataTikTokProfile)[]
): BrightDataUnifiedProfile[] {
  // Validate input is an array
  if (!Array.isArray(profiles)) {
    logger.error('normalize_profiles_non_array', { profiles_type: typeof profiles });
    throw new Error(`normalizeProfiles expects an array, got ${typeof profiles}`);
  }
  return profiles.map(normalizeProfile);
}
