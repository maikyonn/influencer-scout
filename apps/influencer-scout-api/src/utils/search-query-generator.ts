import OpenAI from 'openai';
import { isFixtureMode } from './test-mode.js';
import { createLogger } from './logger.js';

let cachedClient: OpenAI | null = null;
const logger = createLogger({ component: 'query-generation' });

function getOpenAIApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }
  const trimmedKey = apiKey.trim();
  logger.debug('openai_api_key_loaded', { key_length: trimmedKey.length });
  if (!trimmedKey.startsWith('sk-')) {
    throw new Error('Invalid OpenAI API key format. API keys should start with "sk-"');
  }
  return trimmedKey;
}

function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL || 'gpt-4o-mini';
}

function getOpenAIClient(): OpenAI {
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: getOpenAIApiKey() });
  }
  return cachedClient;
}

function buildPrompt(description: string): string {
  return `Based on this influencer description, generate EXACTLY 12 simple, keyword-based search queries for an INFLUENCER SEARCH ENGINE.

Description: ${description}

CRITICAL Requirements:
- These queries will search influencer BIOS and POSTS
- ONLY use words that would actually appear in an influencer's bio or content
- Use terms influencers use to describe THEMSELVES (not how others describe them)
- Keep queries SHORT (2-4 words max)
- Use simple keywords only
- Don't use full sentences or third-person descriptions
- Format: one query per line
- Generate EXACTLY 12 queries total

QUERY BREAKDOWN (MUST FOLLOW):
- 4 BROAD queries (individual concepts, single words or simple 2-word terms)
- 2 SPECIFIC queries (location + niche combinations)
- 6 ADJACENT queries (related influencer types with valuable audiences)

⚠️ NEVER USE BUSINESS/ENTITY TYPES:
- ❌ DON'T: "coffee shop", "restaurant", "gym", "studio", "store", "cafe", "venue"
- ✅ DO: "coffee lover", "foodie", "fitness coach", "photographer", "content creator"
- Remember: Influencers are PEOPLE, not businesses
- Use words that describe what they DO or are interested in, not places/businesses

Wrong vs Right Examples:
❌ "san francisco coffee shop" → ✅ "sf coffee lover" or "sf barista"
❌ "la restaurant" → ✅ "la foodie" or "la food blogger"
❌ "nyc gym" → ✅ "nyc fitness" or "nyc personal trainer"
❌ "miami beach club" → ✅ "miami nightlife" or "miami lifestyle"

STRUCTURE - Generate queries in this order:

PART 1 - BROAD QUERIES (4 total):
- Extract main concepts separately (location, niche, related terms)
- Single words or simple 2-word terms
- Cast the widest net

PART 2 - SPECIFIC QUERIES (2 total):
- Combine location + niche
- Use location abbreviations when relevant

PART 3 - ADJACENT QUERIES (6 total):
- SINGLE WORDS/TERMS - Mix of adjacent locations AND related influencer types
- Include ADJACENT LOCATIONS (2-3 queries): nearby areas, regions, or related cities
  * San Francisco → "bay area", "oakland", "berkeley"
  * Los Angeles → "socal", "orange county", "hollywood"
  * New York → "nyc", "brooklyn", "manhattan"
  * Miami → "south florida", "fort lauderdale", "brickell"
- Include ADJACENT INFLUENCER TYPES (3-4 queries): related categories with valuable audiences
  * For food/restaurant → "lifestyle", "blogger", "creator", "local", "guide"
  * For fitness/gym → "wellness", "lifestyle", "motivational", "coach", "athlete"
  * For fashion/clothing → "lifestyle", "style", "beauty", "blogger", "creator"
  * For travel/hotel → "adventure", "lifestyle", "explorer", "creator", "vlogger"
- These should be SIMPLE single-word terms or 2-word location names

Example for "San Francisco coffee shop" (12 queries):
BROAD (4):
san francisco          ← location
coffee                 ← niche
foodie                 ← related niche
food                   ← related term

SPECIFIC (2):
sf coffee              ← location + niche
bay area coffee        ← location variation + niche

ADJACENT (6):
bay area               ← adjacent location
oakland                ← adjacent city
berkeley               ← adjacent city
lifestyle              ← adjacent influencer type
blogger                ← adjacent influencer type
creator                ← adjacent influencer type

Example for "LA gym" (12 queries):
BROAD (4):
los angeles            ← location
fitness                ← niche
health                 ← related term
workout                ← activity term

SPECIFIC (2):
la fitness             ← location + niche
la workout             ← location + activity

ADJACENT (6):
socal                  ← adjacent location/region
orange county          ← adjacent area
hollywood              ← adjacent city/area
wellness               ← adjacent influencer type
lifestyle              ← adjacent influencer type
coach                  ← adjacent influencer type

Now generate EXACTLY 12 queries following the structure above (4 broad + 2 specific + 6 adjacent):`;
}

export interface QueryGenerationResult {
  description: string;
  queries: string[];
  rawResponse: string;
  prompt: string; // The full prompt sent to the LLM
}

function parseQueriesFromResponse(rawResponse: string): string[] {
  const rawLines = rawResponse.trim().split('\n');
  const queries: string[] = [];

  for (const line of rawLines) {
    let cleanedLine = line;
    if (line.includes('←')) {
      const parts = line.split('←');
      cleanedLine = (parts[0] || line).trim();
    }
    cleanedLine = cleanedLine.trim();

    if (
      cleanedLine &&
      cleanedLine.length < 50 &&
      !cleanedLine.startsWith('#') &&
      !cleanedLine.toLowerCase().startsWith('broad') &&
      !cleanedLine.toLowerCase().startsWith('specific') &&
      !cleanedLine.toLowerCase().startsWith('adjacent') &&
      !cleanedLine.match(/^PART \d+/i) &&
      !cleanedLine.match(/^\d+\./)
    ) {
      queries.push(cleanedLine);
    }
  }

  return queries.slice(0, 12);
}

export async function generateSearchQueriesFromDescription(description: string): Promise<QueryGenerationResult> {
  const trimmedDescription = description?.trim();
  if (!trimmedDescription) {
    throw new Error('Description is required for query generation');
  }

  if (isFixtureMode()) {
    const queries = [
      'creator',
      'lifestyle',
      'foodie',
      'beauty',
      'fitness',
      'coffee',
      'nyc',
      'brooklyn',
      'austin',
      'travel',
      'tiktok',
      'instagram',
    ];

    return {
      description: trimmedDescription,
      queries,
      rawResponse: queries.join('\n'),
      prompt: 'fixture-mode',
    };
  }

  const client = getOpenAIClient();
  const model = getOpenAIModel();
  logger.info('query_generation_start', { model });

  const prompt = buildPrompt(trimmedDescription);
  const completion = await client.chat.completions.create({
    model,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const firstChoice = completion.choices?.[0];
  if (!firstChoice) {
    throw new Error('No choices returned from OpenAI');
  }

  const generatedText = firstChoice.message?.content || '';
  if (!generatedText) {
    throw new Error('No text generated from OpenAI');
  }

  const queries = parseQueriesFromResponse(generatedText);
  if (!queries.length) {
    throw new Error('No valid queries generated from OpenAI response');
  }

  logger.info('query_generation_complete', { query_count: queries.length });

  return {
    description: trimmedDescription,
    queries,
    rawResponse: generatedText,
    prompt, // Include the prompt that was sent to the LLM
  };
}
