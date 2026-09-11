// Common words that do not carry much meaning for relevance matching

const STOPWORDS = new Set([
  "find",
  "the",
  "a",
  "an",
  "to",
  "for",
  "on",
  "in",
  "of"
]);

// Convert text into meaningful lowercase words
function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.replace(/[^\w]/g, ""))
    .filter(word => word.length > 0)
    .filter(word => !STOPWORDS.has(word));
}

// Calculate relevance of one element against the task
function calculateRelevance(element, task) {
  const taskKeywords = tokenize(task);

  if (taskKeywords.length === 0) {
    return {
      relevance_score: 0,
      relevant: false
    };
  }

  // Combine useful DOM information
  const elementText = [
    element.text,
    element.tag,
    element.type,
    element.role
  ]
    .filter(Boolean)
    .join(" ");

  const elementKeywords = tokenize(elementText);

  const overlapCount = taskKeywords.filter(keyword =>
    elementKeywords.includes(keyword)
  ).length;

  const score = overlapCount / taskKeywords.length;

  return {
    relevance_score: Math.min(score, 1),
    relevant: score > 0
  };
}

// Score all elements
function findRelevantElements(elements, task) {
  return elements.map(element => {
    const { relevance_score, relevant } =
      calculateRelevance(element, task);

    return {
      element,
      relevant,
      relevance_score
    };
  });
}

module.exports = {
  tokenize,
  calculateRelevance,
  findRelevantElements
};