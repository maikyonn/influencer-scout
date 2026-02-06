/**
 * LLM-based profile fit analysis utility
 * Analyzes influencer profiles for fit with business requirements using OpenAI
 */

import OpenAI from 'openai';
import type { BrightDataUnifiedProfile } from '../types/brightdata.js';
import { isFixtureMode } from './test-mode.js';
import { createLogger } from './logger.js';

const logger = createLogger({ component: 'llm-analysis' });

/**
 * Get LLM API key from environment variables.
 * We support OpenAI directly, or DeepInfra via its OpenAI-compatible endpoint.
 */
function getLLMApiKey(): string {
  const apiKey = (process.env.OPENAI_API_KEY || process.env.DEEPINFRA_API_KEY || '').trim();
  if (!apiKey) throw new Error('Missing LLM API key. Set OPENAI_API_KEY or DEEPINFRA_API_KEY.');
  return apiKey;
}

function getLLMBaseURL(): string | undefined {
  const explicit = (process.env.OPENAI_BASE_URL || process.env.LLM_BASE_URL || '').trim();
  if (explicit) return explicit;
  if (!process.env.OPENAI_API_KEY && process.env.DEEPINFRA_API_KEY) return 'https://api.deepinfra.com/v1/openai';
  return undefined;
}

/**
 * Get model name.
 */
function getOpenAIModel(): string {
  const configured = (process.env.LLM_MODEL || process.env.OPENAI_MODEL || '').trim();
  if (configured) return configured;
  const baseURL = getLLMBaseURL() || '';
  if (baseURL.includes('deepinfra.com')) return 'meta-llama/Meta-Llama-3.1-8B-Instruct';
  return 'gpt-5-nano';
}

/**
 * Get max concurrent LLM profile analyses (configurable via env var)
 */
function getMaxConcurrentLLMAnalyses(): number {
  const maxConcurrent = Number(process.env.MAX_CONCURRENT_LLM_REQUESTS || process.env.MAX_CONCURRENT_LLM_ANALYSES || '50');
  return Math.max(1, maxConcurrent); // Ensure at least 1
}

let cachedClient: OpenAI | null = null;

/**
 * Get OpenAI client instance (singleton)
 */
function getOpenAIClient(): OpenAI {
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: getLLMApiKey(), baseURL: getLLMBaseURL() });
  }
  return cachedClient;
}

/**
 * Format date as relative time (e.g., "30 days ago", "2 weeks ago")
 */
function formatPostDate(dateString: string | null | undefined): string {
  if (!dateString) return 'Date unknown';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Date unknown';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);
    
    // Format as relative time
    if (diffSeconds < 60) {
      return diffSeconds <= 1 ? 'just now' : `${diffSeconds} seconds ago`;
    } else if (diffMinutes < 60) {
      return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
    } else if (diffHours < 24) {
      return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
    } else if (diffDays < 7) {
      return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
    } else if (diffWeeks < 4) {
      return diffWeeks === 1 ? '1 week ago' : `${diffWeeks} weeks ago`;
    } else if (diffMonths < 12) {
      return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`;
    } else {
      return diffYears === 1 ? '1 year ago' : `${diffYears} years ago`;
    }
  } catch (error) {
    return 'Date unknown';
  }
}

/**
 * Format profile for LLM analysis
 * Matches the exact format specified by the user
 */
export function formatProfileForLLM(profile: BrightDataUnifiedProfile): string {
  const posts = profile.posts_data?.slice(0, 8) || [];
  const postsText = posts.map((post) => {
    const caption = post.caption || '';
    const mediaType = post.post_type || 'unknown';
    const mediaUrl = post.content_url || 'N/A';
    const isVideo = mediaType === 'video' || mediaType === 'reel' || post.is_video;
    const postDate = formatPostDate(post.created_at);
    
    // Format: caption content_type: Type image/video: URL Date: [formatted date]
    return `${caption} content_type: ${mediaType} ${isVideo ? 'video' : 'image'}: ${mediaUrl} Date: ${postDate}`;
  }).join('\n\n');

  return `Name: ${profile.display_name || 'N/A'}

URL: ${profile.profile_url}

Followers: ${profile.followers || 0}

Category:

Verified: ${profile.platform === 'instagram' ? 'Instagram' : 'TikTok'}

Bio: ${profile.biography || 'N/A'}

Recent posts (caption and media):

${postsText || 'No posts available'}`;
}

/**
 * Build fit analysis prompt
 * @param strictLocationMatching - When true, uses much stricter location scoring that heavily penalizes unknown locations
 */
export function buildFitAnalysisPrompt(profileText: string, businessDescription: string, strictLocationMatching: boolean = false): string {
  // Build location scoring section based on strict mode
  const locationScoringSection = strictLocationMatching
    ? `1. LOCATION MATCHING (MOST IMPORTANT - WEIGHT: 70% of score) - STRICT MODE ENABLED:
   ⚠️ STRICT LOCATION MATCHING IS ENABLED - Location requirements are NON-NEGOTIABLE.
   - Determine the influencer's ACTUAL location from their bio, posts, captions, hashtags, and profile information.
   - Look for: city names, neighborhoods, regions, landmarks, local references, location tags, "Based in", "📍", area codes, or local businesses mentioned.
   - Compare this information against the "Influencer Location" requirement in the business description.
   - STRICT Scoring for LOCATION (out of 7 points):
     * If the influencer is BASED IN or PRIMARILY OPERATES IN the EXACT required location/city: 7 points.
     * If the influencer is in a NEARBY/ADJACENT area (same metro region, within ~50 miles): 4 points.
     * If the location is NOT SPECIFIED or cannot be determined: 1 point (HEAVILY PENALIZED - unknown location is almost as bad as wrong location).
     * If the influencer is based in a COMPLETELY DIFFERENT area/city/country: 0 points.
   - In STRICT MODE: An influencer with unknown location should score NO HIGHER than 4 total.
   - In STRICT MODE: An influencer in the wrong location should score NO HIGHER than 3 total.
   - Location is the ABSOLUTE DETERMINING FACTOR in strict mode.`
    : `1. LOCATION MATCHING (MOST IMPORTANT - WEIGHT: 60% of score):
   - Determine the influencer's ACTUAL location from their bio, posts, captions, hashtags, and profile information.
   - Look for: city names, neighborhoods, regions, landmarks, local references, location tags, "Based in", "📍", area codes, or local businesses mentioned.
   - Compare this information against the "Influencer Location" requirement in the business description.
   - Scoring for LOCATION (out of 6 points):
     * If the influencer is BASED IN or PRIMARILY OPERATES IN the required location/area: 6 points.
     * If the location is NOT SPECIFIED or cannot be determined: 3 points.
     * If the influencer is based in a COMPLETELY DIFFERENT area: 0 points (no location points).
   - Location is the single most important factor in the entire score.`;

  const scoringSummarySection = strictLocationMatching
    ? `SCORING SUMMARY (STRICT LOCATION MODE):
- Score 9-10: Excellent fit - EXACT location match AND content/type aligns perfectly
- Score 7-8: Good fit - Location matches (exact or nearby metro), content/type mostly aligns
- Score 5-6: Moderate fit - Location matches exactly but content/type is off
- Score 3-4: Poor fit - Location is nearby but not exact, OR location unknown with perfect content match
- Score 1-2: Very poor fit - Location unknown or wrong, regardless of content quality`
    : `SCORING SUMMARY:
- Score 9-10: Excellent fit - Location matches AND content/type aligns perfectly
- Score 7-8: Good fit - Location matches, content/type mostly aligns
- Score 5-6: Moderate fit - Location matches but content/type is off, OR content matches but location is not specified/cannot be determined
- Score 3-4: Poor fit - Location mismatch/uncertain AND content/type mismatch
- Score 1-2: Very poor fit - Multiple critical mismatches, or a business profile with penalties`;

  const strictModeHeader = strictLocationMatching
    ? `\n⚠️ STRICT LOCATION MATCHING MODE ENABLED ⚠️
The business has requested STRICT location matching. Location verification is NON-NEGOTIABLE.
Influencers with unverifiable locations must be scored LOW regardless of content quality.\n`
    : '';

  return `═══════════════════════════════════════════════════════════════
CAMPAIGN DETAILS (What the business is looking for):
═══════════════════════════════════════════════════════════════
${strictModeHeader}
${businessDescription}

═══════════════════════════════════════════════════════════════
BUSINESS REQUIREMENTS (What the business is looking for):
═══════════════════════════════════════════════════════════════

IMPORTANT: The information above describes what the BUSINESS is looking for, NOT the influencer's actual profile.

Key Requirements to Evaluate:
1. INFLUENCER LOCATION (HIGHEST PRIORITY): The business requires influencers who are BASED IN or ACTIVELY OPERATE IN the specified location area. This is a CRITICAL requirement.
   - Look for: "Influencer Location", "Looking for [location]", or location mentions in the business description
   - The influencer MUST be based in or primarily operate in this location to be a good fit
   - Location matching is the SINGLE MOST IMPORTANT factor in scoring

2. TYPE OF INFLUENCER: The business is seeking specific types of influencers (e.g., "Foodies", "Lifestyle", "Fitness", etc.)
   - Compare the influencer's actual content focus against these requirements

3. PLATFORM: The business wants influencers on specific platforms (Instagram, TikTok, or both)

4. FOLLOWER RANGE: The business has specific follower count requirements

5. BUSINESS CONTEXT: Consider the business name, website, location, and description when evaluating fit

═══════════════════════════════════════════════════════════════
INFLUENCER PROFILE TO EVALUATE:
═══════════════════════════════════════════════════════════════

${profileText}

═══════════════════════════════════════════════════════════════
EVALUATION INSTRUCTIONS:
═══════════════════════════════════════════════════════════════

First, provide a 2-sentence summary about who this influencer is and what content they specialize in. Be specific and descriptive based on their bio, posts, and profile information.

Then, evaluate this influencer's fit for the business requirements. Be critical, direct, and concise.

CRITICAL SCORING GUIDELINES - LOCATION IS THE TOP PRIORITY:

${locationScoringSection}

2. CONTENT TYPE MATCHING, INDIVIDUALITY, AND BUSINESS PENALTY (WEIGHT: ${strictLocationMatching ? '15%' : '20%'} of score):
   - Evaluate if the influencer is an INDIVIDUAL content creator, not a business, shop, agency, or brand account. Only individuals making original content should count as a true influencer.
   - Compare the influencer's primary content themes and style with the "Type of Influencer" requirements listed by the business.
   - Review bio, post captions, hashtags, and overall content themes.
   - Strong match to required type and is clearly an individual creator: 2 points.
   - Partial match (some content overlap or uncertain individual status): 1 point.
   - Mismatch (content does not match requirements): 0 points.
   - If the profile appears to be a business, shop, agency, or brand (not an individual): Subtract 2 points from the total score (apply this penalty after adding the other components).

3. BUSINESS-TO-INFLUENCER FIT, INCLUDING AUDIENCE AND BRAND ALIGNMENT (WEIGHT: ${strictLocationMatching ? '15%' : '20%'} of score):
   - Assess the match between the influencer and the key business requirements OUTSIDE of strict location or content type.
   - This includes the following aspect:
     * OVERALL BUSINESS FIT & RELEVANCE: How well do the influencer's style, values, content, and audience align with the business and campaign goals? Give up to ${strictLocationMatching ? '1 point' : '2 points'}.


${scoringSummarySection}

RATIONALE GUIDELINES:
- Provide exactly 1 sentence of reasoning for each of the following: (1) Location matching, (2) Content type/individuality, and (3) Overall business fit & relevance.
- Each sentence should be concise and specific to that criterion, clearly stating the merit or issue for that point.
- Do not combine these into a single sentence; the rationale should be exactly 3 sentences, one for each scoring criterion.
- If points were subtracted because the profile appears to be a business, clearly state this in the content type/individuality sentence.
- Even if location cannot be determined or is unknown, still provide a sentence about location.${strictLocationMatching ? '\n- In STRICT MODE: If location cannot be verified, explicitly state this is a major penalty.' : ''}
- Be objective and to the point.

Return ONLY a strict JSON object with the following schema, no extra text:

{"score": <integer 1-10>, "rationale": <string>, "summary": <2-sentence string describing who the influencer is and what content they specialize in>}`;
}

/**
 * Analyze single profile for fit with business requirements
 * @param strictLocationMatching - When true, uses stricter location scoring
 */
export async function analyzeProfileFit(
  profile: BrightDataUnifiedProfile,
  businessDescription: string,
  strictLocationMatching: boolean = false
): Promise<{ fit_score: number; fit_rationale: string; fit_summary: string }> {
  // Check if influencer has posted within the last 60 days
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const posts = profile.posts_data || [];
  const hasRecentPost = posts.some(post => {
    if (!post.created_at) return false;
    try {
      const postDate = new Date(post.created_at);
      return !isNaN(postDate.getTime()) && postDate >= sixtyDaysAgo;
    } catch {
      return false;
    }
  });

  if (!hasRecentPost) {
    return {
      fit_score: 0,
      fit_rationale: 'Influencer is inactive - no posts within the last 60 days.',
      fit_summary: 'Inactive account with no recent content. Last activity was over 60 days ago.',
    };
  }

  const profileText = formatProfileForLLM(profile);
  const prompt = buildFitAnalysisPrompt(profileText, businessDescription, strictLocationMatching);
  const model = getOpenAIModel();
  const client = getOpenAIClient();

  try {
    // Use Chat Completions for maximum provider compatibility (DeepInfra supports this).
    // We instruct the model to output STRICT JSON only.
    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    });

    const content = completion.choices?.[0]?.message?.content || '';
    if (!content) throw new Error('No text content in LLM response');

    // Parse JSON from content
    const parsed = JSON.parse(content);
    
    // Validate and normalize score (convert 1-10 to 0-100 scale)
    let score = parseInt(parsed.score, 10);
    if (isNaN(score) || score < 1) score = 1;
    if (score > 10) score = 10;
    
    // Convert to 0-100 scale
    const fitScore = Math.round((score / 10) * 100);

    return {
      fit_score: fitScore,
      fit_rationale: parsed.rationale || 'No rationale provided',
      fit_summary: parsed.summary || 'No summary provided',
    };
  } catch (error) {
    logger.error('llm_profile_analysis_failed', { account_id: profile.account_id, error });
    // Return default values on error
    return {
      fit_score: 0,
      fit_rationale: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      fit_summary: `Unable to analyze: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Analyze multiple profiles concurrently with concurrency control
 * @param strictLocationMatching - When true, uses stricter location scoring
 */
export async function analyzeProfileFitBatch(
  profiles: BrightDataUnifiedProfile[],
  businessDescription: string,
  maxConcurrent: number = 20,
  strictLocationMatching: boolean = false
): Promise<Array<{ fit_score: number; fit_rationale: string; fit_summary: string }>> {
  if (isFixtureMode()) {
    return profiles.map((profile, index) => {
      const baseScore = index < 10 ? 100 - index : 70 - (index % 20);
      const fitScore = Math.max(10, baseScore);
      return {
        fit_score: fitScore,
        fit_rationale: `Fixture analysis for ${profile.display_name || profile.account_id || 'creator'}.`,
        fit_summary: `Fixture summary for ${profile.display_name || profile.account_id || 'creator'}. ` +
          'Content focuses on lifestyle and creator themes.',
      };
    });
  }

  const concurrentLimit = maxConcurrent || getMaxConcurrentLLMAnalyses();
  const results: Array<{ fit_score: number; fit_rationale: string; fit_summary: string }> = [];

  // Process profiles in batches with concurrency control
  for (let i = 0; i < profiles.length; i += concurrentLimit) {
    const batch = profiles.slice(i, i + concurrentLimit);

    const batchResults = await Promise.allSettled(
      batch.map(async (profile) => {
        // Retry logic (max 2 retries)
        let lastError: Error | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            return await analyzeProfileFit(profile, businessDescription, strictLocationMatching);
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt < 2) {
              // Wait before retry (exponential backoff)
              await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            }
          }
        }
        // If all retries failed, return default values
        return {
          fit_score: 0,
          fit_rationale: `Analysis failed after retries: ${lastError?.message || 'Unknown error'}`,
          fit_summary: `Unable to analyze: ${lastError?.message || 'Unknown error'}`,
        };
      })
    );

    // Collect results (maintain order)
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        // Failed profile analysis (logged only in error cases)
        results.push({
          fit_score: 0,
          fit_rationale: `Analysis failed: ${result.reason}`,
          fit_summary: `Unable to analyze: ${result.reason}`,
        });
      }
    }

    // Small delay between batches to avoid rate limiting
    if (i + concurrentLimit < profiles.length) {
      await new Promise(resolve => setTimeout(resolve, 50)); // 50ms delay
    }
  }

  return results;
}
