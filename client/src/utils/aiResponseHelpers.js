/**
 * Safely extracts text content from AI response objects or strings
 * Prevents React error #31 by ensuring only strings are returned
 * 
 * @param {string|object|null} response - AI response (can be string, object, or null)
 * @returns {string} - Safe string value for rendering in JSX
 */
export const safeAIText = (response) => {
  if (!response) return 'No answer available';
  
  if (typeof response === 'string') {
    return response;
  }
  
  if (typeof response === 'object' && response !== null) {
    // Try common text fields in order of preference
    if (typeof response.text === 'string') return response.text;
    if (typeof response.answer === 'string') return response.answer;
    if (typeof response.response === 'string') return response.response;
    if (typeof response.prediction === 'string') return response.prediction;
    
    // If sent_from_csv is a string, it's the question, not the answer
    // So we don't use it here for answer display
    
    // Fallback: stringify the object (useful for debugging)
    return JSON.stringify(response, null, 2);
  }
  
  // Last resort: convert to string
  return String(response);
};

/**
 * Extracts the question from AI response if it has sent_from_csv
 * 
 * @param {string|object|null} response - AI response
 * @returns {string|null} - Question string or null
 */
export const extractAIQuestion = (response) => {
  if (!response) return null;
  
  if (typeof response === 'object' && response !== null && response.sent_from_csv) {
    const question = response.sent_from_csv;
    if (typeof question === 'string') return question;
    if (typeof question === 'object' && question !== null) {
      // If sent_from_csv is an object, try to extract text
      if (typeof question.text === 'string') return question.text;
      return JSON.stringify(question, null, 2);
    }
    return String(question);
  }
  
  return null;
};

/**
 * Extracts both question and answer from AI response
 * 
 * @param {string|object|null} response - AI response
 * @returns {{question: string|null, answer: string}} - Object with question and answer
 */
export const extractAIQuestionAndAnswer = (response) => {
  return {
    question: extractAIQuestion(response),
    answer: safeAIText(response)
  };
};

