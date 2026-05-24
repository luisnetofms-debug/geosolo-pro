import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini API client on the server side
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
} else {
  console.warn("Aviso: GEMINI_API_KEY não encontrada nas variáveis de ambiente.");
}

// REST API for Soil fertility recommendations using Gemini
app.post("/api/recommend", async (req, res) => {
  try {
    const { client, farm, plot, cropType, area, points } = req.body;

    if (!ai) {
      return res.status(500).json({
        error: "Serviço de Inteligência Artificial indisponível pois a API Key não está configurada.",
      });
    }

    if (!points || !points.length) {
      return res.status(400).json({ error: "Nenhum ponto de amostragem foi enviado para análise." });
    }

    // Prepare a summary of the soil tests
    let totalPoints = points.length;
    let validCount = 0;
    let sumPH = 0, sumMO = 0, sumP = 0, sumK = 0, sumCa = 0, sumMg = 0, sumAl = 0;

    points.forEach((p: any) => {
      if (p.results) {
        validCount++;
        sumPH += Number(p.results.pH || 0);
        sumMO += Number(p.results.MO || 0);
        sumP += Number(p.results.P || 0);
        sumK += Number(p.results.K || 0);
        sumCa += Number(p.results.Ca || 0);
        sumMg += Number(p.results.Mg || 0);
        sumAl += Number(p.results.Al || 0);
      }
    });

    if (validCount === 0) {
      return res.status(400).json({ error: "Nenhum ponto possui resultados de laboratório preenchidos." });
    }

    const avgPH = (sumPH / validCount).toFixed(2);
    const avgMO = (sumMO / validCount).toFixed(2);
    const avgP = (sumP / validCount).toFixed(2);
    const avgK = (sumK / validCount).toFixed(2);
    const avgCa = (sumCa / validCount).toFixed(2);
    const avgMg = (sumMg / validCount).toFixed(2);
    const avgAl = (sumAl / validCount).toFixed(2);

    const prompt = `Analise os teores médios das amostras de solo abaixo para a fazenda "${farm}" (Talhão "${plot}", Área: ${area} hectares, Cultura Alvo: "${cropType}").
Gere um laudo agronômico profissional, voltado para engenheiros agrônomos e produtores agrícolas.

Teores Médios Coletados (${validCount} pontos analisados de ${totalPoints} pontos totais na grade):
- pH em CaCl2/H2O: ${avgPH}
- Matéria Orgânica (MO): ${avgMO}%
- Fósforo (P): ${avgP} mg/dm³
- Potássio (K): ${avgK} mmolc/dm³
- Cálcio (Ca): ${avgCa} mmolc/dm³
- Magnésio (Mg): ${avgMg} mmolc/dm³
- Alumínio (Al): ${avgAl} mmolc/dm³

Com base nesses resultados médios de fertilidade, forneça as seguintes seções estruturadas em formato MARKDOWN (em português):

1. **Diagnóstico do Solo**: Analise as condições químicas críticas desse talhão. Avalie a acidez (pH), a toxidade por Alumínio, e se os teores de P, K, Ca e Mg estão baixos, médios ou altos.
2. **Recomendação de Calagem e Gessagem**: Caso necessário devido à acidez elevada ou saturação por alumínio, estime a necessidade de Calcário (focando em PRNT 100% e elevação da saturação por bases V% para a cultura recomendada) e de Gesso Agrícola.
3. **Sugestão de Adubação NPK**: Apresente recomendações de formulações comerciais de adubos N-P-K (como 04-14-08, 05-20-20, etc.) em kg/hectare ou toneladas para a cultura do(a) "${cropType}".
4. **Indicações para Zonas de Manejo**: Recomende brevemente como o produtor pode utilizar a variabilidade geoestatística (os mapas de interpolação por krigagem) para aplicar fertilizantes em taxa variável, priorizando as áreas críticas identificadas no mapa.

Seja extremamente objetivo, técnico e preciso para auxiliar na tomada de decisão agrícola útil.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "Você é um renomado Consultor Agronômico Sênior, PhD em Nutrição de Plantas e Geoestatística de Solos com larga experiência em agricultura de precisão.",
      }
    });

    res.json({
      recommendation: response.text,
      averages: {
        pH: avgPH,
        MO: avgMO,
        P: avgP,
        K: avgK,
        Ca: avgCa,
        Mg: avgMg,
        Al: avgAl,
        analyzedPointsCount: validCount,
        totalPointsCount: totalPoints
      }
    });

  } catch (error: any) {
    console.error("Erro ao gerar recomendação da IA:", error);
    res.status(500).json({ error: error?.message || "Ocorreu um erro interno no servidor ao processar a requisição." });
  }
});

// Configure Vite middleware and asset serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite dev middleware incorporado com sucesso.");
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[GeoSolo Servidor] Rodando no endereço http://0.0.0.0:${PORT}`);
  });
}

startServer();
