import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";

// Try models in priority order — flash is fastest, flash-8b is free-tier-friendly
const MODEL_PRIORITY = ["gemini-1.5-flash", "gemini-1.5-flash-8b", "gemini-pro"];

let _model: GenerativeModel | null = null;
let _modelName = MODEL_PRIORITY[0];

export function getModel(): GenerativeModel {
  if (!_model) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY environment variable is not set");
    const genAI = new GoogleGenerativeAI(key);
    _model = genAI.getGenerativeModel({
      model: _modelName,
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "application/json",
      },
    });
  }
  return _model;
}

/** Call after a 429 to try the next model in the fallback list */
export function rotateFallbackModel(): boolean {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return false;
  const idx = MODEL_PRIORITY.indexOf(_modelName);
  if (idx >= MODEL_PRIORITY.length - 1) return false; // no more fallbacks
  _modelName = MODEL_PRIORITY[idx + 1];
  _model = null; // force re-init with new model
  return true;
}
