# 移植自 graphrag_pipeline/extraction.py (独立副本, env dict 由 config 注入)。
# Stage 2: chunks -> LangExtract extraction (DeepSeek backend)
#
# Per docs/langextract_pipeline_spec-v1.0.md §2.2-2.3/§3:
#   - non-GPT model name -> explicit ModelConfig(provider="openai", base_url)
#   - DeepSeek rejects structured-output response_format -> use_schema_constraints=False
# Batch entry uses the Document iterator (spec v0 §1.2 type 3).
"""LangExtract entity/relation extraction over semantic chunks."""
from __future__ import annotations

import os
import pathlib

import langextract as lx
from langextract.factory import ModelConfig

PROMPT = (
    "Extract company entities, metric entities and the relations between them "
    "from financial text, in order of appearance. Use exact original text for "
    "every extraction; do not paraphrase. For each entity provide attributes "
    "entity_type (company/metric/period/percentage/currency_value) and "
    "normalized_name (lowercase snake_case). For each relation provide "
    "attributes head and tail that exactly match the normalized_name or name "
    "of entities extracted from the same text, plus predicate and, when "
    "present in the evidence, value, unit and period."
)

# few-shot example: every extraction_text MUST be a verbatim substring of
# example text (spec v0 §1.5 alignment validation).
EXAMPLES = [
    lx.data.ExampleData(
        text=(
            "Globex Corporation 2024 Annual Report. Annual revenue was 40.2 "
            "billion CNY in 2024, up 15.3% year over year."
        ),
        extractions=[
            lx.data.Extraction(
                extraction_class="entity",
                extraction_text="Globex Corporation",
                attributes={"entity_type": "company", "normalized_name": "globex_corporation"},
            ),
            lx.data.Extraction(
                extraction_class="entity",
                extraction_text="2024",
                attributes={"entity_type": "period", "normalized_name": "2024"},
            ),
            lx.data.Extraction(
                extraction_class="entity",
                extraction_text="Annual revenue",
                attributes={"entity_type": "metric", "normalized_name": "annual_revenue"},
            ),
            lx.data.Extraction(
                extraction_class="entity",
                extraction_text="15.3%",
                attributes={"entity_type": "percentage", "normalized_name": "15.3%"},
            ),
            lx.data.Extraction(
                extraction_class="relation",
                extraction_text="Annual revenue was 40.2 billion CNY in 2024",
                attributes={
                    "head": "Globex Corporation",
                    "predicate": "has_metric",
                    "tail": "Annual revenue",
                    "value": "40.2 billion CNY",
                    "period": "2024",
                },
            ),
            lx.data.Extraction(
                extraction_class="relation",
                extraction_text="up 15.3% year over year",
                attributes={
                    "head": "Annual revenue",
                    "predicate": "grew_by",
                    "tail": "15.3%",
                    "period": "2024",
                },
            ),
        ],
    )
]


def run_extraction(
    chunks: list[dict], env: dict[str, str], output_dir: pathlib.Path
) -> pathlib.Path:
  """Extract entities/relations from all chunks, persist one JSONL file."""
  documents = [
      lx.data.Document(
          text=c["text"],
          document_id=c["chunk_id"],
          additional_context=f"Document section: {c['section_title']}",
      )
      for c in chunks
  ]

  result = lx.extract(
      text_or_documents=documents,
      prompt_description=PROMPT,
      examples=EXAMPLES,
      temperature=0.0,
      use_schema_constraints=False,  # DeepSeek JSON-mode fallback (spec §3)
      config=ModelConfig(
          model_id=env["DEEPSEEK_MODEL"],
          provider="openai",
          provider_kwargs={
              "api_key": env["OPENAI_API_KEY"],
              "base_url": env["DEEPSEEK_BASE_URL"],
          },
      ),
  )
  os.environ.setdefault("OPENAI_API_KEY", env["OPENAI_API_KEY"])

  out_dir = output_dir
  out_dir.mkdir(parents=True, exist_ok=True)
  out_file = out_dir / "extraction_results.jsonl"
  lx.io.save_annotated_documents(result, output_name=out_file.name, output_dir=str(out_dir))
  return out_file
