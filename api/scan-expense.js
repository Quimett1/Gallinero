module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido.' }); return; }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { res.status(500).json({ error: 'Falta configurar GEMINI_API_KEY en el servidor.' }); return; }

  const { image, mimeType } = req.body || {};
  if (!image || !mimeType) { res.status(400).json({ error: 'Falta la imagen.' }); return; }

  const prompt = `Eres un asistente que lee tickets o facturas de compras para un gallinero doméstico.
Analiza la imagen del ticket y extrae estos datos:
- feed: sacos de pienso comprados (número entero, 0 si no aparece)
- bedding: sacas de biruta compradas (número entero, 0 si no aparece)
- straw: balas de paja compradas (número entero, 0 si no aparece)
- other: importe en euros de cualquier otro gasto del ticket no cubierto por lo anterior (número decimal, 0 si no aplica)
- concept: descripción breve del gasto (texto corto, ej. "Pienso y biruta Agroveterinaria")
- date: fecha del ticket en formato YYYY-MM-DD si es visible, si no una cadena vacía
Responde únicamente con el JSON, sin explicaciones.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: image } }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                feed: { type: 'NUMBER' },
                bedding: { type: 'NUMBER' },
                straw: { type: 'NUMBER' },
                other: { type: 'NUMBER' },
                concept: { type: 'STRING' },
                date: { type: 'STRING' }
              },
              required: ['feed', 'bedding', 'straw', 'other', 'concept', 'date']
            }
          }
        })
      }
    );
    const body = await response.json();
    if (!response.ok) { res.status(502).json({ error: body.error?.message || 'No se pudo leer el ticket.' }); return; }
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) { res.status(502).json({ error: 'La IA no devolvió ningún resultado.' }); return; }
    const parsed = JSON.parse(text);
    res.status(200).json(parsed);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Error al leer el ticket con IA.' });
  }
};
