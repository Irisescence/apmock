const QUESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["exam_title", "subject", "description", "questions"],
  properties: {
    exam_title: { type: "string" },
    subject: { type: "string" },
    description: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "question_number", "question_text", "question_images", "options", "explanation", "warnings"],
        properties: {
          type: { type: "string", enum: ["mcq"] },
          question_number: { type: "integer" },
          question_text: { type: "string" },
          question_images: { type: "array", items: { type: "string" } },
          options: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "text", "image_urls"],
              properties: {
                label: { type: "string" },
                text: { type: "string" },
                image_urls: { type: "array", items: { type: "string" } }
              }
            }
          },
          explanation: { type: "string" },
          warnings: { type: "array", items: { type: "string" } }
        }
      }
    }
  }
};

function getOutputText(data) {
  if (data.output_text) return data.output_text;
  const chunks = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) chunks.push(content.text);
      if (content.type === "text" && content.text) chunks.push(content.text);
    }
  }
  return chunks.join("\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not configured in Vercel Environment Variables." });
  }

  try {
    const { exam_doc } = req.body || {};
    if (!exam_doc || !Array.isArray(exam_doc.blocks)) {
      return res.status(400).json({ error: "Missing exam_doc.blocks" });
    }

    const compactDoc = {
      file_name: exam_doc.file_name,
      blocks: exam_doc.blocks.slice(0, 900),
      raw_text_preview: String(exam_doc.raw_text || "").slice(0, 12000)
    };

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        input: [
          {
            role: "system",
            content: [
              "You extract AP exam multiple-choice questions from DOCX-derived structured blocks.",
              "You must not solve questions.",
              "You must not infer, guess, or output correct answers.",
              "Only identify question text, question images, tables, options, option images, and explanations if explicitly present.",
              "Preserve table meaning as markdown-like structured text inside question_text or option text.",
              "Question stems may continue after an image or table and before the answer choices.",
              "Include all stem text before the first answer choice, even when it appears below an image/table.",
              "Do not stop question_text at an image, table, page break, or blank visual block.",
              "If answer choices are arranged as table rows with column headers, preserve the headers inside each option text.",
              "For table answer choices, format each option text as one line per column: Header 1: value\\nHeader 2: value.",
              "Do not flatten table answer choices into one unlabeled sentence.",
              "If Word numbering shows numId=1, treat those blocks as likely question starts. Other numbered blocks following a question are likely options.",
              "If content is incomplete, add warnings such as missing_question_text, missing_or_too_few_options, table_may_need_review, image_may_need_review.",
              "Return strict JSON only. Do not include correct_answer."
            ].join("\n")
          },
          {
            role: "user",
            content: JSON.stringify(compactDoc)
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "docx_question_extract",
            strict: true,
            schema: QUESTION_SCHEMA
          }
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || "OpenAI request failed" });
    }

    const outputText = getOutputText(data);
    if (!outputText) {
      return res.status(500).json({ error: "OpenAI returned no JSON text." });
    }

    const parsed = JSON.parse(outputText);
    return res.status(200).json(parsed);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Failed to parse DOCX." });
  }
}
