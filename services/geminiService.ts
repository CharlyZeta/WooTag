
import { GoogleGenAI } from "@google/genai";

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key not found in environment variables");
  }
  return new GoogleGenAI({ apiKey });
};

export const optimizeDescription = async (productName: string, currentDescription: string): Promise<string> => {
  try {
    const ai = getClient();
    const prompt = `
      Actúa como un experto en marketing de retail. 
      Tengo un producto llamado "${productName}".
      Descripción original: "${currentDescription}".
      
      Tarea: Genera una descripción MUY BREVE y persuasiva para una etiqueta de precio física pequeña.
      Restricciones:
      1. Máximo 15 palabras.
      2. Usa español neutro.
      3. Enfócate en el beneficio principal o característica clave.
      4. No uses emojis.
      5. Solo devuelve el texto, sin comillas ni explicaciones.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash', // Bug 2 fix: use stable model name
      contents: prompt,
    });

    return response.text.trim();
  } catch (error) {
    console.error("Error optimizing description:", error);
    return currentDescription; // Fallback to original
  }
};
