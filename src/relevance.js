const STOPWORDS = new Set([
  "find",
  "the",
  "a",
  "an",
  "to",
  "for",
  "on",
  "in",
  "of",
  "enter",
  "click",
  "select",
  "submit",
  "type",
  "choose",
  "tap",
  "here"
]);

const RELEVANCE_THRESHOLD = 0.3;

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.replace(/[^\w]/g, ""))
    .map(word => word.replace(/s$/, ""))
    .filter(word => word.length > 0)
    .filter(word => !STOPWORDS.has(word));
}

function calculateRelevance(element, task) {
  const taskKeywords = [...new Set(tokenize(task))];

  if (taskKeywords.length === 0) {
    return {
      relevance_score: 0,
      relevant: false
    };
  }

  // V1: use text + lightweight DOM semantics for task relevance
  const textKeywords = tokenize(element.text);
  const tagKeywords = tokenize(element.tag);
  const typeKeywords = tokenize(element.type);
  const roleKeywords = tokenize(element.role);
  let score = 0;

  for (const keyword of taskKeywords) {
    if (textKeywords.includes(keyword)) {
      score += 1;
      continue;
    }

    if (typeKeywords.includes(keyword)) {
      score += 0.6;
      continue;
    }

    if (roleKeywords.includes(keyword)) {
      score += 0.5;
      continue;
    }

    if (tagKeywords.includes(keyword)) {
      score += 0.3;
    }
  }

  let relevanceScore = score / taskKeywords.length;

  const confidence = Number(element.confidence);

  if (!Number.isNaN(confidence)) {
    relevanceScore *= confidence;
  }

  relevanceScore = Math.min(relevanceScore, 1);

  return {
    relevance_score: relevanceScore,
    relevant: relevanceScore > RELEVANCE_THRESHOLD
  };
}

module.exports = {
  tokenize,
  calculateRelevance,
  RELEVANCE_THRESHOLD
};