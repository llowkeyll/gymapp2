import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Lazy-initialized Gemini client to prevent crash if key is momentarily missing is startup.
let aiClient: GoogleGenAI | null = null;
function getAIClient() {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is missing on server. Configure it under Settings > Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set generous body limits for mobile pictures
  app.use(express.json({ limit: "15mb" }));

  // API endpoint for analyzing calorie photos
  app.post("/api/analyze-food", async (req, res) => {
    try {
      const { image, mimeType } = req.body;
      if (!image) {
        return res.status(400).json({ error: "No image found in request" });
      }

      const ai = getAIClient();

      const imagePart = {
        inlineData: {
          mimeType: mimeType || "image/jpeg",
          data: image,
        },
      };

      // Construct a tight, credit-efficient prompt optimized for gemini-3.5-flash
      const promptText = `Identify this food. Estimate portion weight in grams and total nutrition values. Be realistic. If multiple food items are visible, compute total sum values. Return exact response in strict JSON format matching the schema.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [imagePart, promptText],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              foodName: {
                type: Type.STRING,
                description: "Name of the main identified dish."
              },
              calories: {
                type: Type.INTEGER,
                description: "Estimated nutrition calories (kcal) total."
              },
              proteinGrams: {
                type: Type.NUMBER,
                description: "Protein in grams."
              },
              carbGrams: {
                type: Type.NUMBER,
                description: "Carbohydrates in grams."
              },
              fatGrams: {
                type: Type.NUMBER,
                description: "Fat in grams."
              },
              servingSize: {
                type: Type.STRING,
                description: "Serving description, like '1 slice (120g)' or 'bowl of approx 300g'"
              },
              confidence: {
                type: Type.INTEGER,
                description: "Confidence rating 1-100% based on recognition resolution"
              },
              explanation: {
                type: Type.STRING,
                description: "Short, bulleted, single sentence breakdown of seen items"
              }
            },
            required: ["foodName", "calories", "proteinGrams", "carbGrams", "fatGrams", "servingSize", "confidence", "explanation"]
          }
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error("No text parsed from Gemini response.");
      }

      const parsedData = JSON.parse(text.trim());
      res.json(parsedData);
    } catch (err: any) {
      console.error("Calorie analyzer backend error:", err);
      res.status(500).json({ error: err.message || "Unable to parse image details" });
    }
  });

  // Serve static files and manage route fallbacks
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server launched on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Critical server startup crash:", err);
});
