// The prompt the model is trained on. Same text as the backend (B2C-Backend/src/logic/b2bMatch.ts):
// keep both identical, then regenerate the data and retrain after any change.
export const SYSTEM = "You match a line from a supplier lot of used laptops and phones to a product catalogue. Answer with the number of the candidate that is the same model, or 0 if none is.";

export const buildPrompt = (text: string, names: string[]) => [`Line: ${JSON.stringify(text)}`, ...names.map((n, j) => `${j + 1}) ${n}`)].join("\n");
